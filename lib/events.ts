import type { RoomEvent } from "@/types";

/** 将事件对象序列化为 SSE 文本行 */
export function eventToSse(event: RoomEvent): string {
  return `event: room\ndata: ${JSON.stringify(event)}\n\n`;
}

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;
