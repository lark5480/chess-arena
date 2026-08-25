import { NextResponse } from "next/server";
import { createRoom } from "@/lib/store";
import { allowRequest } from "@/lib/rate-limit";
import type { CreateRoomRequest, TimeLimit } from "@/types";

export const dynamic = "force-dynamic";

function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!allowRequest(`create:${ip}`, 10, 60_000)) {
    return NextResponse.json({ error: "创建过于频繁，请稍后再试" }, { status: 429 });
  }
  const body = (await req.json().catch(() => ({}))) as CreateRoomRequest;
  const timeLimit = ((body.timeLimit ?? 600) as TimeLimit) || 600;
  const res = createRoom({ name: body.name, timeLimit, avatar: body.avatar });
  return NextResponse.json(res);
}
