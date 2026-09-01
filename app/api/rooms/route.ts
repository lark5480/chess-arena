import { NextResponse } from "next/server";
import { createRoom } from "@/lib/store";
import { allowRequest, clientIp } from "@/lib/rate-limit";
import type { CreateRoomRequest } from "@/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!allowRequest(`create:${ip}`, 10, 60_000)) {
    return NextResponse.json({ error: "创建过于频繁，请稍后再试" }, { status: 429 });
  }
  const body = (await req.json().catch(() => ({}))) as CreateRoomRequest;
  // timeLimit 的白名单校验在 createRoom 内完成（0=无限制会被此处 ?? 保留）
  const res = createRoom({ name: body.name, timeLimit: body.timeLimit, avatar: body.avatar });
  return NextResponse.json(res);
}
