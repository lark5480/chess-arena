import { NextResponse } from "next/server";
import { takebackRequestAction, takebackRespondAction } from "@/lib/store";
import { rateLimitGuard } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { code: string } }) {
  const limited = rateLimitGuard(req, "takeback", 30);
  if (limited) return limited;
  const body = (await req.json().catch(() => ({}))) as {
    playerId: string;
    action?: "accept" | "decline";
  };
  try {
    const res =
      body.action === "accept" || body.action === "decline"
        ? takebackRespondAction(params.code, body.playerId, body.action)
        : takebackRequestAction(params.code, body.playerId);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json({ error: "操作失败" }, { status: 500 });
  }
}
