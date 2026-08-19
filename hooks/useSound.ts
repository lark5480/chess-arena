"use client";

import { useCallback, useRef } from "react";
import { useGameStore } from "@/stores/game-store";

type Tone = "move" | "check" | "end" | "capture";

function playTone(kind: Tone) {
  if (typeof window === "undefined") return;
  const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AC) return;
  const ctx: AudioContext = new AC();
  const now = ctx.currentTime;

  const presets: Record<Tone, { freq: number; dur: number; type: OscillatorType; gain: number }> = {
    move: { freq: 320, dur: 0.08, type: "sine", gain: 0.18 },
    capture: { freq: 200, dur: 0.12, type: "square", gain: 0.16 },
    check: { freq: 660, dur: 0.18, type: "triangle", gain: 0.2 },
    end: { freq: 440, dur: 0.4, type: "sawtooth", gain: 0.18 },
  };
  const p = presets[kind];
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = p.type;
  osc.frequency.value = p.freq;
  gain.gain.setValueAtTime(p.gain, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + p.dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + p.dur);
  setTimeout(() => ctx.close().catch(() => {}), p.dur * 1000 + 100);
}

export function useSound() {
  const enabled = useGameStore((s) => s.soundEnabled);
  const ref = useRef(enabled);
  ref.current = enabled;

  const play = useCallback((kind: Tone) => {
    if (!ref.current) return;
    try {
      playTone(kind);
    } catch {
      /* ignore */
    }
  }, []);

  return { play };
}
