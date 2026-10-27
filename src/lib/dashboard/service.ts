import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { getOwnedBusiness } from "@/lib/business/service";
import { Decimal } from "@/lib/records/money";
import { resolvePeriod } from "./period";
import {
  calculateMetrics,
  dailySeries,
  dataInRange,
  growth,
  type SaleDay,
  type ExpenseDay,
  type CustomerDay,
} from "./calculations";

export type ProductSummary = {
  id: string | null;
  name: string;
  revenue: string;
  quantity: string;
  transactions: number;
};
export type ExpenseSummary = {
  name: string;
  classification: string;
  amount: string;
};
export type SentimentSummary = {
  positive: number;
  neutral: number;
  negative: number;
  unknown: number;
  pending: number;
  failed: number;
  total: number;
};
export type DashboardData = Awaited<ReturnType<typeof getDashboard>>;

export async function getDashboard(
  db: PrismaClient,
  actorId: string,
  businessId: string,
  input: unknown,
  now = new Date(),
) {
  return db.$transaction(
    (tx) => readDashboardSnapshot(tx, actorId, businessId, input, now),
    { isolationLevel: "RepeatableRead", timeout: 15000 },
  );
}

// Reuse the same calculations inside an authorized caller's snapshot transaction.
export async function readDashboardSnapshot(
  tx: Prisma.TransactionClient,
  actorId: string,
  businessId: string,
  input: unknown,
  now = new Date(),
) {
  const business = await getOwnedBusiness(tx, actorId, businessId);
  const period = resolvePeriod(input, business.timezone, now);
  const start = period.previous.from;
  const currentStart = period.current.from;
  const end = period.current.to;
  // All interpolations are bound parameters. Aggregation stays in PostgreSQL;
  // raw rows, feedback text, and unrelated business data never reach the client.
  const sales = await tx.$queryRaw<SaleDay[]>`
      SELECT to_char("saleDate", 'YYYY-MM-DD') AS date,
        SUM("totalAmount")::text AS revenue,
        COALESCE(SUM(quantity * "unitCost"), 0)::text AS cogs,
        COUNT(*)::int AS transactions, COUNT("unitCost")::int AS "costKnown"
      FROM "SalesRecord" WHERE "businessId" = ${business.id}
        AND "saleDate" BETWEEN ${start}::date AND ${end}::date
      GROUP BY "saleDate" ORDER BY "saleDate"`;
  const expenses = await tx.$queryRaw<ExpenseDay[]>`
      SELECT to_char("expenseDate", 'YYYY-MM-DD') AS date,
        COALESCE(SUM(amount) FILTER (WHERE classification = 'OPERATING'), 0)::text AS operating,
        COALESCE(SUM(amount) FILTER (WHERE classification = 'INVENTORY_PURCHASE'), 0)::text AS inventory,
        COALESCE(SUM(amount) FILTER (WHERE classification = 'OTHER'), 0)::text AS other
      FROM "ExpenseRecord" WHERE "businessId" = ${business.id}
        AND "expenseDate" BETWEEN ${start}::date AND ${end}::date
      GROUP BY "expenseDate" ORDER BY "expenseDate"`;
  const customers = await tx.$queryRaw<CustomerDay[]>`
      SELECT to_char("metricDate", 'YYYY-MM-DD') AS date, "customerCount" AS visits
      FROM "CustomerMetric" WHERE "businessId" = ${business.id}
        AND "metricDate" BETWEEN ${start}::date AND ${end}::date ORDER BY "metricDate"`;
  const [sentiment] = await tx.$queryRaw<SentimentSummary[]>`
      SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE "analysisStatus" = 'ANALYZED' AND sentiment = 'POSITIVE')::int AS positive,
        COUNT(*) FILTER (WHERE "analysisStatus" = 'ANALYZED' AND sentiment = 'NEUTRAL')::int AS neutral,
        COUNT(*) FILTER (WHERE "analysisStatus" = 'ANALYZED' AND sentiment = 'NEGATIVE')::int AS negative,
        COUNT(*) FILTER (WHERE "analysisStatus" <> 'ANALYZED' OR sentiment = 'UNKNOWN')::int AS unknown,
        COUNT(*) FILTER (WHERE "analysisStatus" = 'PENDING')::int AS pending,
        COUNT(*) FILTER (WHERE "analysisStatus" = 'FAILED')::int AS failed
      FROM "CustomerFeedback" WHERE "businessId" = ${business.id}
        AND "feedbackDate" BETWEEN ${currentStart}::date AND ${end}::date`;
  const topRevenue = await tx.$queryRaw<ProductSummary[]>`
      SELECT "productServiceId" AS id, COALESCE("itemName", 'Unlinked sales') AS name, SUM("totalAmount")::text AS revenue,
        SUM(quantity)::text AS quantity, COUNT(*)::int AS transactions
      FROM "SalesRecord" WHERE "businessId" = ${business.id}
        AND "saleDate" BETWEEN ${currentStart}::date AND ${end}::date
      GROUP BY "productServiceId", "itemName"
      ORDER BY SUM("totalAmount") DESC, "itemName", "productServiceId" NULLS LAST LIMIT 5`;
  const bestSelling = await tx.$queryRaw<ProductSummary[]>`
      SELECT "productServiceId" AS id, COALESCE("itemName", 'Unlinked sales') AS name, SUM("totalAmount")::text AS revenue,
        SUM(quantity)::text AS quantity, COUNT(*)::int AS transactions
      FROM "SalesRecord" WHERE "businessId" = ${business.id}
        AND "saleDate" BETWEEN ${currentStart}::date AND ${end}::date
      GROUP BY "productServiceId", "itemName"
      ORDER BY SUM(quantity) DESC, "itemName", "productServiceId" NULLS LAST LIMIT 5`;
  const categories = await tx.$queryRaw<ExpenseSummary[]>`
      SELECT c.name, e.classification::text, SUM(e.amount)::text AS amount
      FROM "ExpenseRecord" e JOIN "ExpenseCategory" c
        ON c.id = e."categoryId" AND c."businessId" = e."businessId"
      WHERE e."businessId" = ${business.id} AND e."expenseDate" BETWEEN ${currentStart}::date AND ${end}::date
      GROUP BY c.id, c.name, e.classification ORDER BY SUM(e.amount) DESC, c.name, e.classification, c.id LIMIT 8`;
  const daily = { sales, expenses, customers };
  const currentData = dataInRange(daily, period.current);
  const current = calculateMetrics(currentData);
  const previous = calculateMetrics(dataInRange(daily, period.previous));
  const remaining = new Decimal(current.totalExpenses).minus(
    categories.reduce((sum, row) => sum.plus(row.amount), new Decimal(0)),
  );
  if (remaining.gt(0))
    categories.push({
      name: "Additional categories",
      classification: "MIXED",
      amount: remaining.toFixed(),
    });
  return {
    business: {
      id: business.id,
      name: business.name,
      currency: business.currency,
      timezone: business.timezone,
    },
    period,
    current,
    previous,
    comparison: {
      revenueGrowth: growth(current.revenue, previous.revenue),
      visitGrowth:
        current.customerDays && previous.customerDays
          ? growth(current.visits, previous.visits)
          : null,
    },
    series: dailySeries(currentData, period.current),
    topRevenue,
    bestSelling,
    categories,
    sentiment: sentiment!,
    hasFinancialRecords:
      currentData.sales.length > 0 || currentData.expenses.length > 0,
    generatedAt: now.toISOString(),
  };
}
