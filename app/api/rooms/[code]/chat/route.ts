import { NextResponse } from "next/server";
import { sendChatAction } from "@/lib/store";
import type { ChatRequest } from "@/types";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: { code: string } }
) {
  const body = (await req.json().catch(() => ({}))) as ChatRequest;
  const res = sendChatAction(params.code, body);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ message: res.message });
}
