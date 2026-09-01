import { NextResponse } from "next/server";
import { timeoutAction } from "@/lib/store";
import { rateLimitGuard } from "@/lib/rate-limit";
import type { Color } from "@/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { code: string } }) {
  const limited = rateLimitGuard(req, "timeout", 30);
  if (limited) return limited;
  const body = (await req.json().catch(() => ({}))) as {
    playerId: string;
    color?: Color;
  };
  const res = timeoutAction(params.code, body.playerId, body.color);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ result: res.result });
}
