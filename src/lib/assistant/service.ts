import { randomUUID } from "node:crypto";
import {
  Prisma,
  type PrismaClient,
  type ChatConversation,
  type ChatMessage,
} from "@/generated/prisma/client";
import {
  BusinessError,
  getOwnedBusiness,
  lockOwnedBusiness,
} from "@/lib/business/service";
import { dateOnly, parseDate } from "@/lib/records/dates";
import { resolvePeriod } from "@/lib/dashboard/period";
import { recordIdSchema } from "@/lib/validation/records";
import { ProviderError } from "@/lib/ai/nvidia";
import {
  boundedHistory,
  buildAssistantContext,
  type AssistantContext,
} from "./context";
import {
  CHAT_COOLDOWN_MS,
  CHAT_LEASE_MS,
  MAX_MESSAGES,
  chatPageSchema,
  createConversationSchema,
  deleteConversationSchema,
  messageSchema,
  normalizeReply,
  retryMessageSchema,
  type AssistantReply,
  type ConversationDetail,
  type ConversationView,
  type MessageView,
} from "./contracts";
import type { BusinessAssistant } from "./provider";

type Database = PrismaClient | Prisma.TransactionClient;
const PAGE_SIZE = 20;
function conversationView(row: ChatConversation): ConversationView {
  return {
    id: row.id,
    title: row.title,
    periodFrom: dateOnly(row.periodFrom),
    periodTo: dateOnly(row.periodTo),
    version: row.version,
    messageCount: row.messageCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
function messageView(
  row: ChatMessage,
  lastSequence: number,
  now: Date,
): MessageView {
  return {
    id: row.id,
    sequence: row.sequence,
    role: row.role,
    content: row.content,
    status: row.status,
    inScope: row.inScope,
    referencedMetrics: (row.referencedMetrics ??
      []) as AssistantReply["referencedMetrics"],
    warnings: (row.warnings ?? []) as string[],
    errorCode: row.errorCode,
    createdAt: row.createdAt.toISOString(),
    model: row.model,
    retryable:
      row.role === "ASSISTANT" &&
      row.sequence === lastSequence &&
      (row.status === "FAILED" ||
        (row.status === "PENDING" &&
          (!row.leaseUntil || row.leaseUntil <= now))),
    context: row.context as AssistantContext | null,
  };
}
async function ownedConversation(
  db: Database,
  actorId: string,
  businessId: string,
  id: string,
) {
  await getOwnedBusiness(db, actorId, businessId);
  const row = await db.chatConversation.findFirst({
    where: { id: recordIdSchema.parse(id), businessId, userId: actorId },
  });
  if (!row) throw new BusinessError(404, "Conversation not found.");
  return row;
}
export async function createConversation(
  db: PrismaClient,
  actorId: string,
  businessId: string,
  input: unknown,
  now = new Date(),
) {
  const query = createConversationSchema.parse(input);
  return db.$transaction(async (tx) => {
    const business = await lockOwnedBusiness(tx, actorId, businessId);
    const { current } = resolvePeriod(query, business.timezone, now);
    return conversationView(
      await tx.chatConversation.create({
        data: {
          businessId,
          userId: actorId,
          periodFrom: parseDate(current.from),
          periodTo: parseDate(current.to),
        },
      }),
    );
  });
}
export async function listConversations(
  db: PrismaClient,
  actorId: string,
  businessId: string,
  input: unknown = 1,
) {
  const page = chatPageSchema.parse(input);
  return db.$transaction(
    async (tx) => {
      await getOwnedBusiness(tx, actorId, businessId);
      const where = { businessId, userId: actorId };
      const [rows, total] = await Promise.all([
        tx.chatConversation.findMany({
          where,
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
        }),
        tx.chatConversation.count({ where }),
      ]);
      return {
        items: rows.map(conversationView),
        total,
        page,
        pageSize: PAGE_SIZE,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function getConversation(
  db: PrismaClient,
  actorId: string,
  businessId: string,
  id: string,
  input: unknown = 1,
  now = new Date(),
): Promise<ConversationDetail> {
  const page = chatPageSchema.parse(input);
  return db.$transaction(
    async (tx) => {
      const conversation = await ownedConversation(tx, actorId, businessId, id);
      const [rows, business, active] = await Promise.all([
        tx.chatMessage.findMany({
          where: { conversationId: conversation.id },
          orderBy: { sequence: "desc" },
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
        }),
        tx.business.findUniqueOrThrow({
          where: { id: businessId },
          select: { assistantNextAt: true },
        }),
        tx.chatMessage.count({
          where: {
            conversation: { businessId, userId: actorId },
            leaseUntil: { gt: now },
          },
        }),
      ]);
      return {
        conversation: conversationView(conversation),
        messages: rows
          .reverse()
          .map((row) => messageView(row, conversation.messageCount, now)),
        page,
        pageSize: PAGE_SIZE,
        nextAllowedAt: business.assistantNextAt?.toISOString() ?? null,
        hasActiveRequest: active > 0,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function deleteConversation(
  db: PrismaClient,
  actorId: string,
  businessId: string,
  id: string,
  input: unknown,
) {
  const request = deleteConversationSchema.parse(input);
  await db.$transaction(async (tx) => {
    await lockOwnedBusiness(tx, actorId, businessId);
    const row = await ownedConversation(tx, actorId, businessId, id);
    if (row.version !== request.version)
      throw new BusinessError(
        409,
        "This conversation changed. Reload before deleting it.",
      );
    await tx.chatConversation.delete({ where: { id: row.id } });
  });
}

export async function sendMessage(
  db: PrismaClient,
  actorId: string,
  businessId: string,
  id: string,
  input: unknown,
  createAssistant: () => BusinessAssistant,
  clock: () => Date = () => new Date(),
) {
  return runTurn(
    db,
    actorId,
    businessId,
    id,
    { kind: "send", ...messageSchema.parse(input) },
    createAssistant,
    clock,
  );
}
export async function retryMessage(
  db: PrismaClient,
  actorId: string,
  businessId: string,
  id: string,
  input: unknown,
  createAssistant: () => BusinessAssistant,
  clock: () => Date = () => new Date(),
) {
  return runTurn(
    db,
    actorId,
    businessId,
    id,
    { kind: "retry", ...retryMessageSchema.parse(input) },
    createAssistant,
    clock,
  );
}
type TurnRequest =
  | ({ kind: "send" } & ReturnType<typeof messageSchema.parse>)
  | ({ kind: "retry" } & ReturnType<typeof retryMessageSchema.parse>);

async function runTurn(
  db: PrismaClient,
  actorId: string,
  businessId: string,
  id: string,
  request: TurnRequest,
  createAssistant: () => BusinessAssistant,
  clock: () => Date,
) {
  const claim = await db
    .$transaction(
      async (tx) => {
        const business = await lockOwnedBusiness(tx, actorId, businessId);
        const conversation = await ownedConversation(
          tx,
          actorId,
          businessId,
          id,
        );
        const now = clock();
        if (request.kind === "send") {
          const duplicate = await tx.chatMessage.findUnique({
            where: {
              conversationId_turnId_role: {
                conversationId: id,
                turnId: request.requestId,
                role: "USER",
              },
            },
          });
          if (duplicate) {
            if (duplicate.content !== request.message)
              throw new BusinessError(
                409,
                "This request ID already belongs to a different question.",
              );
            return null;
          }
        }
        if (conversation.version !== request.version)
          throw new BusinessError(
            409,
            "This conversation changed. Reload before sending or retrying.",
          );
        if (business.assistantNextAt && business.assistantNextAt > now)
          throw new BusinessError(
            409,
            "Wait one minute between assistant requests, then try again.",
          );
        if (
          await tx.chatMessage.count({
            where: {
              conversation: { businessId, userId: actorId },
              leaseUntil: { gt: now },
            },
          })
        )
          throw new BusinessError(
            409,
            "An answer is already being prepared for this business. Refresh shortly; interrupted requests unlock after 150 seconds.",
          );
        let retry: ChatMessage | null = null;
        let question: string;
        if (request.kind === "retry") {
          retry = await tx.chatMessage.findFirst({
            where: {
              id: request.messageId,
              conversationId: id,
              role: "ASSISTANT",
            },
          });
          if (!retry) throw new BusinessError(404, "Message not found.");
          if (
            retry.sequence !== conversation.messageCount ||
            retry.status === "COMPLETED"
          )
            throw new BusinessError(
              409,
              "Only the latest failed or interrupted answer can be retried.",
            );
          const original = await tx.chatMessage.findUniqueOrThrow({
            where: {
              conversationId_turnId_role: {
                conversationId: id,
                turnId: retry.turnId,
                role: "USER",
              },
            },
          });
          question = original.content;
        } else {
          if (conversation.messageCount >= MAX_MESSAGES)
            throw new BusinessError(
              422,
              "This conversation has reached 50 questions. Start a new conversation.",
            );
          question = request.message;
        }
        const assistant = createAssistant();
        const context = await buildAssistantContext(
          tx,
          actorId,
          businessId,
          {
            from: dateOnly(conversation.periodFrom),
            to: dateOnly(conversation.periodTo),
          },
          now,
        );
        if (Buffer.byteLength(JSON.stringify(context)) > 24_000)
          throw new BusinessError(
            422,
            "The business summary is too large. Choose a shorter period.",
          );
        const recent = await tx.chatMessage.findMany({
          where: {
            conversationId: id,
            sequence: {
              lt: retry ? retry.sequence - 1 : conversation.messageCount + 1,
            },
          },
          orderBy: { sequence: "desc" },
          take: 20,
        });
        const history = boundedHistory(recent.reverse());
        const token = randomUUID();
        const data = {
          content: "",
          status: "PENDING" as const,
          inScope: null,
          errorCode: null,
          referencedMetrics: Prisma.DbNull,
          warnings: Prisma.DbNull,
          context: context as unknown as Prisma.InputJsonValue,
          provider: assistant.provider,
          model: assistant.model,
          promptVersion: assistant.promptVersion,
          leaseToken: token,
          leaseUntil: new Date(now.getTime() + CHAT_LEASE_MS),
          attempts: { increment: 1 },
        };
        let answer: ChatMessage;
        if (retry)
          answer = await tx.chatMessage.update({
            where: { id: retry.id },
            data,
          });
        else {
          // Older interrupted turns can no longer be retried once the user moves on.
          await tx.chatMessage.updateMany({
            where: { conversationId: id, status: "PENDING" },
            data: {
              status: "FAILED",
              errorCode: "TIMEOUT",
              leaseToken: null,
              leaseUntil: null,
            },
          });
          const turnId =
            request.kind === "send" ? request.requestId : randomUUID();
          await tx.chatMessage.create({
            data: {
              conversationId: id,
              turnId,
              sequence: conversation.messageCount + 1,
              role: "USER",
              content: question,
              status: "COMPLETED",
            },
          });
          answer = await tx.chatMessage.create({
            data: {
              ...data,
              attempts: 1,
              conversationId: id,
              turnId,
              sequence: conversation.messageCount + 2,
              role: "ASSISTANT",
            },
          });
        }
        await tx.chatConversation.update({
          where: { id },
          data: {
            version: { increment: 1 },
            ...(retry ? {} : { messageCount: { increment: 2 } }),
            ...(conversation.messageCount === 0
              ? { title: question.replace(/\s+/g, " ").slice(0, 120) }
              : {}),
          },
        });
        await tx.business.update({
          where: { id: businessId },
          data: { assistantNextAt: new Date(now.getTime() + CHAT_COOLDOWN_MS) },
        });
        return {
          assistant,
          question,
          context,
          history,
          token,
          answerId: answer.id,
        };
      },
      { isolationLevel: "RepeatableRead", maxWait: 10000, timeout: 20000 },
    )
    .catch((error: unknown) => {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034"
      )
        throw new BusinessError(
          409,
          "Business data changed while preparing the answer. Reload and try again.",
        );
      throw error;
    });
  if (!claim) return getConversation(db, actorId, businessId, id, 1, clock());
  let reply: AssistantReply | undefined;
  let failure: ProviderError | undefined;
  try {
    const raw = await claim.assistant.answer({
      question: claim.question,
      businessContext: claim.context,
      history: claim.history,
    });
    try {
      reply = normalizeReply(raw);
    } catch {
      throw new ProviderError("INVALID_RESPONSE");
    }
  } catch (error) {
    failure =
      error instanceof ProviderError ? error : new ProviderError("UNAVAILABLE");
  }
  await db.$transaction(async (tx) => {
    await lockOwnedBusiness(tx, actorId, businessId);
    await ownedConversation(tx, actorId, businessId, id);
    const changed = await tx.chatMessage.updateMany({
      where: {
        id: claim.answerId,
        conversationId: id,
        status: "PENDING",
        leaseToken: claim.token,
        leaseUntil: { gt: clock() },
      },
      data: {
        leaseToken: null,
        leaseUntil: null,
        ...(reply
          ? {
              content: reply.answer,
              status: "COMPLETED",
              inScope: reply.inScope,
              referencedMetrics: reply.referencedMetrics,
              warnings: reply.inScope
                ? [...new Set([...reply.warnings, ...claim.context.warnings])]
                : [],
              errorCode: null,
            }
          : { status: "FAILED", errorCode: failure!.code }),
      },
    });
    if (changed.count)
      await tx.chatConversation.update({
        where: { id },
        data: { version: { increment: 1 } },
      });
  });
  return getConversation(db, actorId, businessId, id, 1, clock());
}
