import { getSnapshot, setConnected } from "@/lib/store";
import { addSubscriber, removeSubscriber } from "@/lib/realtime";
import { eventToSse, SSE_HEADERS } from "@/lib/events";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: { code: string } }
) {
  const code = params.code.toUpperCase();
  const room = getSnapshot(code);
  if (!room) return new Response("房间不存在", { status: 404 });

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
