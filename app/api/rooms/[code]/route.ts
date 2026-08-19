import { NextResponse } from "next/server";
import { getRoom } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { code: string } }
) {
  const room = getRoom(params.code);
  if (!room) return NextResponse.json({ error: "房间不存在" }, { status: 404 });
  return NextResponse.json(room);
}
