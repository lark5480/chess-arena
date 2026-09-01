import { getSnapshot, setConnected } from "@/lib/store";
import {
  addSubscriber,
  removeSubscriber,
  subscriberCount,
  totalSubscriberCount,
} from "@/lib/realtime";
import { eventToSse, SSE_HEADERS } from "@/lib/events";
import { rateLimitGuard } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** SSE 连接上限：防连接洪泛耗尽内存与句柄 */
const MAX_SUBSCRIBERS_PER_ROOM = 12;
const MAX_TOTAL_SUBSCRIBERS = 300;

export async function GET(req: Request, { params }: { params: { code: string } }) {
  const code = params.code.toUpperCase();
  const room = getSnapshot(code);
  if (!room) return new Response("房间不存在", { status: 404 });

  const limited = rateLimitGuard(req, "stream", 30);
  if (limited) return limited;
  if (subscriberCount(code) >= MAX_SUBSCRIBERS_PER_ROOM)
    return new Response("该房间连接数已达上限", { status: 429 });
  if (totalSubscriberCount() >= MAX_TOTAL_SUBSCRIBERS)
    return new Response("服务器连接数已达上限", { status: 503 });

  // 玩家连接携带 playerId 用于在线状态；观战不携带
  const playerId = new URL(req.url).searchParams.get("playerId") ?? undefined;

  const encoder = new TextEncoder();
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
  const pingRef: { id: ReturnType<typeof setInterval> | null } = { id: null };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
      // 连接即推送当前全量快照，保证重连/观战即时同步
      controller.enqueue(encoder.encode(eventToSse({ type: "state", room })));
      addSubscriber(code, controller);
      if (playerId) setConnected(code, playerId, true);
      pingRef.id = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          /* 已断开 */
        }
      }, 25_000);
    },
    cancel() {
      if (pingRef.id) clearInterval(pingRef.id);
      if (controllerRef) removeSubscriber(code, controllerRef);
      if (playerId) setConnected(code, playerId, false);
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
