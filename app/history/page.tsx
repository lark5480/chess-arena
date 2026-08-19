"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { resultText } from "@/lib/utils";
import type { GameResult } from "@/types";

interface HistoryEntry {
  id: string;
  code: string;
  gameNo: number;
  white?: string;
  black?: string;
  result: GameResult;
  endedAt: number;
  pgn: string;
}

export default function HistoryPage() {
  const [list, setList] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("chess-arena-history");
      setList(raw ? JSON.parse(raw) : []);
    } catch {
      setList([]);
    }
  }, []);

  const download = (e: HistoryEntry) => {
    const blob = new Blob([e.pgn], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chess-arena-${e.code}-${e.gameNo}.pgn`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <header className="mb-6 flex items-center gap-3">
        <Link href="/" className="text-muted hover:text-gray-200">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold text-gray-100">对局历史</h1>
      </header>

      {list.length === 0 ? (
        <p className="text-muted">暂无对局记录。完成一局后会自动保存到本机浏览器。</p>
      ) : (
        <ul className="space-y-3">
          {list.map((e) => (
            <li
              key={e.id}
              className="flex items-center justify-between rounded-xl border border-border bg-surface p-4"
            >
              <div>
                <div className="font-medium text-gray-100">
                  {e.white} <span className="text-muted">vs</span> {e.black}
                </div>
                <div className="text-sm text-muted">
                  房间 {e.code} · 第 {e.gameNo} 局 ·{" "}
                  {new Date(e.endedAt).toLocaleString("zh-CN")}
                </div>
                <div className="mt-1 text-sm text-accent-soft">{resultText(e.result)}</div>
              </div>
              <div className="flex gap-2">
                <Link
                  href={`/room/${e.code}/spectate`}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm text-gray-200 hover:border-accent"
                >
                  观战回放
                </Link>
                <button
                  onClick={() => download(e)}
                  className="inline-flex items-center gap-1 rounded-lg bg-surface-2 px-3 py-1.5 text-sm text-gray-200 hover:border-accent"
                >
                  <Download size={14} /> PGN
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
