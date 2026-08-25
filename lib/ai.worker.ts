/// <reference lib="webworker" />
import { chooseAIMove } from "./ai-engine";

self.onmessage = (e: MessageEvent<{ fen: string; depth: number; id: number }>) => {
  const { fen, depth, id } = e.data;
  const move = chooseAIMove(fen, depth);
  (self as unknown as Worker).postMessage({ id, move });
};
