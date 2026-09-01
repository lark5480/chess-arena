import { NextResponse } from "next/server";
import { rematchAction } from "@/lib/store";
import { rateLimitGuard } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { code: string } }) {
  const limited = rateLimitGuard(req, "rematch", 20);
  if (limited) return limited;
  const body = (await req.json().catch(() => ({}))) as { playerId: string };
  const res = rematchAction(params.code, body.playerId);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
