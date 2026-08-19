"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useSpectate } from "@/hooks/useRoomGame";
import { GameView } from "@/components/room/GameView";
import { ArrowLeft, Eye } from "lucide-react";

export default function SpectatePage() {
  const params = useParams<{ code: string }>();
  const code = String(params.code).toUpperCase();
  useSpectate(code);

  return (
    <div className="mx-auto max-w-6xl px-4 py-4">
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-muted hover:text-gray-200">
            <ArrowLeft size={20} />
          </Link>
          <span className="font-mono text-lg tracking-widest text-accent">{code}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">
            <Eye size={12} /> 观战
          </span>
        </div>
      </header>
      <GameView spectator />
    </div>
  );
}
