import { NextResponse } from "next/server";
import { joinAIRoom, RoomError } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: { code: string } }
) {
  const body = (await req.json().catch(() => ({}))) as { name?: string };
  try {
    const res = joinAIRoom(params.code, { name: body.name });
    return NextResponse.json(res);
  } catch (e) {
    if (e instanceof RoomError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "加入电脑失败" }, { status: 500 });
  }
}
