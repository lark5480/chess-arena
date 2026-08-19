"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useGameStore } from "@/stores/game-store";
import { useRoomGame } from "@/hooks/useRoomGame";
import { WaitingRoom } from "@/components/room/WaitingRoom";
import { GameView } from "@/components/room/GameView";
import { GameResultModal } from "@/components/room/GameResultModal";
import { JoinRoom } from "@/components/room/JoinRoom";
import { ThemePicker } from "@/components/room/ThemePicker";
import { ArrowLeft, Eye } from "lucide-react";

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const code = String(params.code).toUpperCase();
  useRoomGame();

  const storeCode = useGameStore((s) => s.code);
  const playerId = useGameStore((s) => s.playerId);
  const status = useGameStore((s) => s.status);

  const [roomExists, setRoomExists] = useState<boolean | null>(null);
  const [fetchedStatus, setFetchedStatus] = useState<string>("");

  const isPlayer = !!playerId && storeCode === code;

  useEffect(() => {
    if (isPlayer) return;
    let alive = true;
    fetch(`/api/rooms/${code}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((room) => {
        if (!alive) return;
        setRoomExists(true);
        setFetchedStatus(room.status);
      })
      .catch(() => alive && setRoomExists(false));
    return () => {
      alive = false;
    };
  }, [code, isPlayer]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-4">
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-muted hover:text-gray-200">
            <ArrowLeft size={20} />
          </Link>
          <span className="font-mono text-lg tracking-widest text-accent">{code}</span>
        </div>
        <ThemePicker />
      </header>

      {isPlayer ? (
        status === "waiting" ? (
          <WaitingRoom />
        ) : (
          <>
            <GameView />
            <GameResultModal />
          </>
        )
      ) : (
        <div className="mx-auto max-w-md py-12">
          {roomExists === null && <p className="text-center text-muted">加载中…</p>}
          {roomExists === false && (
            <div className="rounded-xl border border-border bg-surface p-6 text-center">
              <p className="mb-4 text-gray-200">房间不存在或已失效</p>
              <Link href="/" className="text-accent underline">
                返回首页
              </Link>
            </div>
          )}
          {roomExists === true && fetchedStatus === "waiting" && (
            <div className="rounded-xl border border-border bg-surface p-6">
              <h2 className="mb-4 text-center text-lg font-bold text-gray-100">加入对局</h2>
              <JoinRoom presetCode={code} />
            </div>
          )}
          {roomExists === true && fetchedStatus !== "waiting" && (
            <div className="rounded-xl border border-border bg-surface p-6 text-center">
              <p className="mb-2 text-gray-200">该对局已开始或已结束</p>
              <p className="mb-4 text-sm text-muted">你可以以观战者身份围观</p>
              <Link
                href={`/room/${code}/spectate`}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-soft"
              >
                <Eye size={16} /> 进入观战
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
