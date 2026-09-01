import { NextResponse } from "next/server";
import { resignAction } from "@/lib/store";
import { rateLimitGuard } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { code: string } }) {
  const limited = rateLimitGuard(req, "resign", 20);
  if (limited) return limited;
  const body = (await req.json().catch(() => ({}))) as { playerId: string };
  const res = resignAction(params.code, body.playerId);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ result: res.result });
}
