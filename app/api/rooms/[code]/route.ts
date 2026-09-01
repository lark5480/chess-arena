import { NextResponse } from "next/server";
import { getRoom } from "@/lib/store";
import { rateLimitGuard } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { code: string } }) {
  // 限流防批量枚举房间码围观/探测
  const limited = rateLimitGuard(req, "room-get", 120);
  if (limited) return limited;
  const room = getRoom(params.code);
  if (!room) return NextResponse.json({ error: "房间不存在" }, { status: 404 });
  return NextResponse.json(room);
}
