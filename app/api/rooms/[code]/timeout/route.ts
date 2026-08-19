import { NextResponse } from "next/server";
import { timeoutAction } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: { code: string } }
) {
  const body = (await req.json().catch(() => ({}))) as { playerId: string };
  const res = timeoutAction(params.code, body.playerId);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ result: res.result });
}
