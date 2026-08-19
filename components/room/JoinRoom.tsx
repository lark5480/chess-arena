"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useGameStore } from "@/stores/game-store";
import { writeLobby } from "@/hooks/useRoomGame";
import type { LobbyInfo } from "@/types";

export function JoinRoom({ presetCode }: { presetCode?: string }) {
  const router = useRouter();
  const setLobby = useGameStore((s) => s.setLobby);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const clean = (presetCode ?? code).trim().toUpperCase();
    if (!clean) {
      setError("请输入房间号");
      setBusy(false);
      return;
    }
    try {
      const res = await fetch(`/api/rooms/${clean}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name || "玩家2" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "加入失败");
      const lobby: LobbyInfo = {
        code: data.code,
        playerId: data.playerId,
        myColor: data.color,
        myName: name || "玩家2",
        mode: "friend",
      };
      writeLobby(lobby);
      setLobby(lobby);
      router.push(`/room/${data.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加入失败");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div>
        <label className="mb-1 block text-xs text-muted">你的昵称</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="玩家2"
          className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-gray-100 outline-none focus:border-accent"
        />
      </div>
      {!presetCode && (
        <div>
          <label className="mb-1 block text-xs text-muted">房间号</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="如 A3F9K2"
            maxLength={6}
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-lg tracking-widest text-gray-100 outline-none focus:border-accent"
          />
        </div>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
      <Button type="submit" disabled={busy} variant="secondary" className="w-full">
        {busy ? "加入中…" : "🔗 加入对局"}
      </Button>
    </form>
  );
}
