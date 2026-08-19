"use client";

import { useGameStore, BOARD_THEMES } from "@/stores/game-store";
import { Volume2, VolumeX, Palette } from "lucide-react";

export function ThemePicker() {
  const theme = useGameStore((s) => s.theme);
  const setTheme = useGameStore((s) => s.setTheme);
  const soundEnabled = useGameStore((s) => s.soundEnabled);
  const setSoundEnabled = useGameStore((s) => s.setSoundEnabled);

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1">
        <Palette size={16} className="text-muted" />
        {BOARD_THEMES.map((t) => (
          <button
            key={t.id}
            title={t.name}
            onClick={() => setTheme(t)}
            className={`h-6 w-6 rounded border-2 ${
              theme.id === t.id ? "border-accent" : "border-transparent"
            }`}
            style={{
              background: `linear-gradient(135deg, ${t.light} 50%, ${t.dark} 50%)`,
            }}
          />
        ))}
      </div>
      <button
        onClick={() => setSoundEnabled(!soundEnabled)}
        title={soundEnabled ? "关闭音效" : "开启音效"}
        className="text-muted hover:text-gray-200"
      >
        {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
      </button>
    </div>
  );
}
