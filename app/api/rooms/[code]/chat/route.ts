import { NextResponse } from "next/server";
import { sendChatAction } from "@/lib/store";
import { rateLimitGuard } from "@/lib/rate-limit";
import type { ChatRequest } from "@/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { code: string } }) {
  const limited = rateLimitGuard(req, "chat", 30);
  if (limited) return limited;
  const body = (await req.json().catch(() => ({}))) as ChatRequest;
  if (!body.playerId) return NextResponse.json({ error: "参数缺失" }, { status: 400 });
  try {
    const res = sendChatAction(params.code, body);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ message: res.message });
  } catch {
    return NextResponse.json({ error: "发送失败" }, { status: 500 });
  }
}
