import { NextResponse } from "next/server";
import { joinRoom, RoomError } from "@/lib/store";
import type { JoinRoomRequest } from "@/types";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: { code: string } }
) {
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
