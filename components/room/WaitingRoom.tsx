"use client";

import { useGameStore } from "@/stores/game-store";
import { Button } from "@/components/ui/Button";
import { Copy, Check } from "lucide-react";
import { useState } from "react";

export function WaitingRoom() {
  const code = useGameStore((s) => s.code);
  const [copied, setCopied] = useState(false);

  const link =
    typeof window !== "undefined" ? `${window.location.origin}/room/${code}` : `/room/${code}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-6 py-16 text-center">
      <div className="text-6xl">♟️</div>
      <h2 className="text-xl font-bold text-gray-100">等待对手加入…</h2>
      <p className="text-sm text-muted">把房间号或链接发给好友即可开始对局</p>

      <div className="w-full rounded-xl border border-border bg-surface p-4">
        <div className="mb-1 text-xs text-muted">房间号</div>
        <div className="font-mono text-3xl tracking-[0.3em] text-accent">{code}</div>
      </div>

      <div className="flex w-full gap-2">
        <input
          readOnly
          value={link}
          className="flex-1 truncate rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-gray-300"
        />
        <Button onClick={copy}>
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? "已复制" : "复制"}
        </Button>
      </div>
    </div>
  );
}
