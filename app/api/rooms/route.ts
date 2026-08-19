import { NextResponse } from "next/server";
import { createRoom } from "@/lib/store";
import type { CreateRoomRequest, TimeLimit } from "@/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as CreateRoomRequest;
  const timeLimit = ((body.timeLimit ?? 600) as TimeLimit) || 600;
  const res = createRoom({ name: body.name, timeLimit, avatar: body.avatar });
  return NextResponse.json(res);
}
