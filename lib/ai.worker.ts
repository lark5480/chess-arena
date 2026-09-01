/// <reference lib="webworker" />
import { chooseAIMove } from "./ai-engine";

self.onmessage = (e: MessageEvent<{ fen: string; depth: number; id: number }>) => {
  const { fen, depth, id } = e.data;
  try {
    const move = chooseAIMove(fen, depth);
    (self as unknown as Worker).postMessage({ id, move });
  } catch {
    // 异常 FEN 等场景：回传 null，客户端主线程兜底
    (self as unknown as Worker).postMessage({ id, move: null });
  }
};
