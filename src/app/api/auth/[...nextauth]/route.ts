import NextAuth from "next-auth";
import type { NextRequest } from "next/server";
import { getAuthOptions } from "@/lib/auth/server";
import { privateJson, readLimitedText, RequestError } from "@/lib/http/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ nextauth: string[] }> };

export async function GET(
  request: NextRequest,
  context: Context,
): Promise<Response> {
  return NextAuth(getAuthOptions())(request, context);
}

export async function POST(
  request: NextRequest,
  context: Context,
): Promise<Response> {
  try {
    await readLimitedText(request.clone(), 16384);
  } catch (error) {
    if (error instanceof RequestError)
      return privateJson({ message: error.message }, error.status);
    return privateJson({ message: "Request could not be accepted." }, 400);
  }
  return NextAuth(getAuthOptions())(request, context);
}
