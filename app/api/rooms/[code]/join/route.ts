import { NextResponse } from "next/server";
import { joinRoom, RoomError } from "@/lib/store";
import { rateLimitGuard } from "@/lib/rate-limit";
import type { JoinRoomRequest } from "@/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { code: string } }) {
  // 限流防房间码枚举抢座（房间码仅 6 位 32 字符集）
  const limited = rateLimitGuard(req, "join", 10);
  if (limited) return limited;
  const body = (await req.json().catch(() => ({}))) as JoinRoomRequest;
  try {
    const res = joinRoom(params.code, { name: body.name, avatar: body.avatar });
    return NextResponse.json(res);
  } catch (e) {
    if (e instanceof RoomError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "加入失败" }, { status: 500 });
  }
}
