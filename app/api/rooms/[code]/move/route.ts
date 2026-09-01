import { NextResponse } from "next/server";
import { applyMoveAction } from "@/lib/store";
import { rateLimitGuard } from "@/lib/rate-limit";
import type { MoveRequest } from "@/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { code: string } }) {
  const limited = rateLimitGuard(req, "move", 60);
  if (limited) return limited;
  const body = (await req.json().catch(() => ({}))) as MoveRequest;
  if (!body.playerId || !body.from || !body.to)
    return NextResponse.json({ error: "参数缺失" }, { status: 400 });
  const res = applyMoveAction(params.code, body);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json(res);
}
