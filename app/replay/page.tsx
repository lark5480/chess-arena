"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Chessboard } from "react-chessboard";
import { START_FEN } from "@/lib/chess-engine";
import { buildReplay, pgnFromMoves } from "@/lib/pgn";

const AUTO_PLAY_MS = 800;

/**
 * 对局回放页。
 *
 * 走法序列编码在 URL hash 中（`#g=e2e4,e7e5,...`），因此不需要服务端保存任何数据——
 * 这与项目"零依赖、无数据库"的定位一致。hash 不会随请求发送到服务器，
 * 分享的对局也不会进入服务端日志。
 */
export default function ReplayPage() {
  const [encoded, setEncoded] = useState("");
  const [names, setNames] = useState({ white: "White", black: "Black" });
  const [index, setIndex] = useState(0); // 0 = 起始局面，i = 第 i 手走完之后
  const [playing, setPlaying] = useState(false);
  const [copied, setCopied] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(560);

  // 读 hash；同时监听 hashchange，便于同一页面内切换对局
  useEffect(() => {
    const read = () => {
      const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      setEncoded(params.get("g") ?? "");
      setNames({
        white: params.get("w") || "White",
        black: params.get("b") || "Black",
      });
      setIndex(0);
      setPlaying(false);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  const moves = useMemo(() => (encoded ? buildReplay(encoded) : []), [encoded]);
  const total = moves.length;

  useEffect(() => {
    if (!playing) return;
    if (index >= total) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setIndex((i) => i + 1), AUTO_PLAY_MS);
    return () => clearTimeout(t);
  }, [playing, index, total]);

  useEffect(() => {
    if (total === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      else if (e.key === "ArrowRight") setIndex((i) => Math.min(total, i + 1));
      else if (e.key === "Home") setIndex(0);
      else if (e.key === "End") setIndex(total);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [total]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWidth(Math.max(280, Math.min(el.clientWidth, 640)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [total]);

  const fen = index === 0 ? START_FEN : moves[index - 1].fen;
  const last = index > 0 ? moves[index - 1] : null;

  const pgn = useMemo(
    () => pgnFromMoves(moves, { white: names.white, black: names.black, result: "*" }),
    [moves, names]
  );

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  function downloadPgn() {
    const blob = new Blob([pgn], { type: "application/x-chess-pgn;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "chess-arena.pgn";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (total === 0) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-bold text-gray-100">没有可回放的对局</h1>
        <p className="text-sm leading-relaxed text-muted">
          回放链接需要在对局中通过「分享回放」生成。走法序列直接编码在链接里，
          因此服务端不需要保存任何数据。
        </p>
        <Link href="/" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
          返回首页
        </Link>
      </main>
    );
  }

  const rows: { no: number; w: number; b?: number }[] = [];
  for (let i = 0; i < total; i += 2) {
    rows.push({ no: i / 2 + 1, w: i, b: i + 1 < total ? i + 1 : undefined });
  }

  const squareStyles: Record<string, React.CSSProperties> = {};
  if (last) {
    squareStyles[last.from] = { backgroundColor: "rgba(255, 214, 102, 0.35)" };
    squareStyles[last.to] = { backgroundColor: "rgba(255, 214, 102, 0.35)" };
  }

  const btn =
    "rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-gray-200 transition-colors hover:border-accent hover:text-white disabled:opacity-40 disabled:hover:border-border";

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-100">对局回放</h1>
          <p className="mt-1 text-xs text-muted">
            {names.white} vs {names.black} · 共 {total} 手
          </p>
        </div>
        <Link
          href="/"
          className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:border-accent hover:text-white"
        >
          返回首页
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-[minmax(0,640px)_1fr]">
        <div ref={wrapRef} className="w-full">
          <Chessboard
            position={fen}
            boardWidth={width}
            arePiecesDraggable={false}
            showBoardNotation
            animationDuration={200}
            customSquareStyles={squareStyles}
            customBoardStyle={{ borderRadius: "8px" }}
          />

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button className={btn} onClick={() => setIndex(0)} disabled={index === 0}>
              ⏮
            </button>
            <button
              className={btn}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={index === 0}
            >
              ◀ 上一手
            </button>
            <button className={btn} onClick={() => setPlaying((p) => !p)}>
              {playing ? "⏸ 暂停" : "▶ 自动播放"}
            </button>
            <button
              className={btn}
              onClick={() => setIndex((i) => Math.min(total, i + 1))}
              disabled={index === total}
            >
              下一手 ▶
            </button>
            <button className={btn} onClick={() => setIndex(total)} disabled={index === total}>
              ⏭
            </button>
          </div>

          <p className="mt-3 text-center text-xs text-muted">
            第 {index} / {total} 手 · 支持 ←→ / Home / End 键盘导航
          </p>

          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button className={btn} onClick={copyLink}>
              {copied ? "✓ 已复制" : "复制回放链接"}
            </button>
            <button className={btn} onClick={downloadPgn}>
              下载 PGN
            </button>
          </div>
        </div>

        <div className="flex h-full flex-col">
          <h3 className="mb-2 text-sm font-semibold text-gray-200">走棋记录</h3>
          <div className="max-h-[520px] flex-1 overflow-y-auto rounded-lg bg-surface-2 p-2 text-sm">
            <table className="w-full">
              <tbody>
                {rows.map((r) => (
                  <tr key={r.no} className="border-b border-border/50">
                    <td className="w-8 py-1 text-muted">{r.no}.</td>
                    <td className="py-1 font-mono text-gray-100">
                      <button
                        onClick={() => setIndex(r.w + 1)}
                        className={`w-full rounded px-1 text-left ${
                          index === r.w + 1 ? "bg-accent/20 font-bold" : "hover:bg-surface"
                        }`}
                      >
                        {moves[r.w]?.san ?? ""}
                      </button>
                    </td>
                    <td className="py-1 pl-3 font-mono text-gray-100">
                      {r.b !== undefined && (
                        <button
                          onClick={() => setIndex(r.b! + 1)}
                          className={`w-full rounded px-1 text-left ${
                            index === r.b! + 1 ? "bg-accent/20 font-bold" : "hover:bg-surface"
                          }`}
                        >
                          {moves[r.b]?.san ?? ""}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
