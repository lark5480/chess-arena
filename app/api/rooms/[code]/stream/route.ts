import { getSnapshot, setConnected } from "@/lib/store";
import { acquireSubscriberSlot, addSubscriber, removeSubscriber } from "@/lib/realtime";
import { eventToSse, SSE_HEADERS } from "@/lib/events";

export const dynamic = "force-dynamic";

/** SSE 连接上限：防连接洪泛耗尽内存与句柄 */
const MAX_SUBSCRIBERS_PER_ROOM = 12;
const MAX_TOTAL_SUBSCRIBERS = 300;

/**
 * 超过此时长的订阅必为平台掐断后残留下来的僵尸。
 * 取"函数最大执行时长 + 余量"：EdgeOne Node Functions 上限 120s（edgeone.json 配置），
 * 正常连接会在 STREAM_MAX_AGE_MS 时被服务端主动关闭，不存在活到 130s 的真实连接。
 */
const STALE_SUBSCRIBER_MS = 130_000;

/**
 * 单条 SSE 连接的服务端存活上限（主动轮换）。
 * 平台（EdgeOne/Vercel）对函数有最大执行时长，到点会强制掐断连接，
 * 而此时流的 cancel() 回调不保证触发，会留下僵尸订阅堵死房间连接配额（表现为 429 卡死）。
 * 因此在平台超时前主动优雅关闭：先发 rotate 事件提示客户端静默重连，再清理并关闭。
 * 与 edgeone.json 的 nodeFunctionsConfig.maxDuration = 120s 配套。
 */
const STREAM_MAX_AGE_MS = 100_000;

/** 心跳间隔：保活中间代理，同时在写失败时兜底清理（cancel 未触发的场景） */
const PING_INTERVAL_MS = 25_000;

export async function GET(req: Request, { params }: { params: { code: string } }) {
  const code = params.code.toUpperCase();
  const room = getSnapshot(code);
  if (!room) return new Response("房间不存在", { status: 404 });

  // 玩家连接携带 playerId 用于在线状态；观战不携带
  const playerId = new URL(req.url).searchParams.get("playerId") ?? undefined;

  // 注意：SSE 是长连接 + 客户端自动重连，按"请求频次"限流会误伤（边缘平台上若取不到真实 IP，
  // 所有玩家还会共用一个桶）。连接安全交给下面的并发上限兜底，这里不做频次限流。
  // 达到上限时先回收僵尸/同玩家旧连接，仍满才拒绝——否则平台掐断残留会让重连永远 429。
  const slot = acquireSubscriberSlot(code, playerId, {
    maxPerRoom: MAX_SUBSCRIBERS_PER_ROOM,
    maxTotal: MAX_TOTAL_SUBSCRIBERS,
    staleMs: STALE_SUBSCRIBER_MS,
  });
  if (slot === "room-full")
    return new Response("该房间连接数已达上限", { status: 429, headers: { "Retry-After": "10" } });
  if (slot === "global-full") return new Response("服务器连接数已达上限", { status: 503 });

  const encoder = new TextEncoder();
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
  const timers: {
    ping: ReturnType<typeof setInterval> | null;
    rotate: ReturnType<typeof setTimeout> | null;
  } = { ping: null, rotate: null };
  let cleaned = false;

  /**
   * 幂等清理：由 cancel / 主动轮换 / 心跳写失败三条路径共用。
   * 平台强制掐断时 cancel() 可能不触发，后两条路径保证订阅最终一定被回收。
   */
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    if (timers.ping) clearInterval(timers.ping);
    if (timers.rotate) clearTimeout(timers.rotate);
    if (controllerRef) removeSubscriber(code, controllerRef);
    if (playerId) setConnected(code, playerId, false);
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
      // 浏览器 EventSource 的原生重连间隔保底（正常由客户端接管为指数退避）
      controller.enqueue(encoder.encode("retry: 5000\n\n"));
      // 连接即推送当前全量快照，保证重连/观战即时同步
      controller.enqueue(encoder.encode(eventToSse({ type: "state", room })));
      addSubscriber(code, controller, playerId);
      if (playerId) setConnected(code, playerId, true);
      timers.ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          // 下游已断但 cancel 未触发：兜底清理，避免僵尸订阅占住配额
          cleanup();
        }
      }, PING_INTERVAL_MS);
      // 主动轮换：平台超时掐断前优雅关闭，客户端收到 rotate 后立即静默重连
      timers.rotate = setTimeout(() => {
        try {
          controller.enqueue(encoder.encode("event: rotate\ndata: {}\n\n"));
        } catch {
          /* 已断开 */
        }
        cleanup();
        try {
          controller.close();
        } catch {
          /* 已关闭 */
        }
      }, STREAM_MAX_AGE_MS);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
