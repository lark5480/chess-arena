"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Chessboard } from "react-chessboard";
import { useGameStore } from "@/stores/game-store";
import { isPromotionMove, legalTargetSquares, createGame } from "@/lib/chess-engine";
import { useSound } from "@/hooks/useSound";
import { PromotionDialog } from "./PromotionDialog";

export function ChessBoard() {
  const fen = useGameStore((s) => s.fen);
  const turn = useGameStore((s) => s.turn);
  const myColor = useGameStore((s) => s.myColor);
  const gameOver = useGameStore((s) => s.gameOver);
  const moves = useGameStore((s) => s.moves);
  const selectedSquare = useGameStore((s) => s.selectedSquare);
  const legalTargets = useGameStore((s) => s.legalTargets);
  const pendingPromotion = useGameStore((s) => s.pendingPromotion);
  const selectSquare = useGameStore((s) => s.selectSquare);
  const setLegalTargets = useGameStore((s) => s.setLegalTargets);
  const setPendingPromotion = useGameStore((s) => s.setPendingPromotion);
  const clearSelection = useGameStore((s) => s.clearSelection);
  const move = useGameStore((s) => s.move);
  const theme = useGameStore((s) => s.theme);
  const viewIndex = useGameStore((s) => s.viewIndex);

  const { play } = useSound();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(560);
  const [flipped, setFlipped] = useState(false);

  const isReviewing = viewIndex !== null && viewIndex < moves.length;
  const displayFen = isReviewing && viewIndex !== null ? moves[viewIndex].fen : fen;
  const interactive = !!myColor && !gameOver && turn === myColor && !isReviewing;
  const effectiveFen = isReviewing ? displayFen : fen;

  const kingInCheckSquare = useMemo(() => {
    const chess = createGame(effectiveFen);
    if (!chess.inCheck()) return null;
    const kingColor = chess.turn();
    const board = chess.board();
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const piece = board[rank][file];
        if (piece && piece.type === "k" && piece.color === kingColor) {
          return piece.square;
        }
      }
    }
    return null;
  }, [effectiveFen]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWidth(Math.max(280, Math.min(el.clientWidth, 640)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 走子音效
  const prevLen = useRef(0);
  useEffect(() => {
    if (moves.length > prevLen.current) {
      const chess = createGame(fen);
      if (gameOver) play("end");
      else if (chess.isCheck()) play("check");
      else {
        const last = moves[moves.length - 1];
        const before = createGame(moves.length > 1 ? moves[moves.length - 2].fen : "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
        const after = createGame(fen);
        const captured = pieceCount(before) > pieceCount(after);
        play(captured ? "capture" : "move");
      }
    }
    prevLen.current = moves.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moves.length]);

  function pieceCount(chess: ReturnType<typeof createGame>) {
    return chess.board().flat().filter(Boolean).length;
  }

  function tryMove(from: string, to: string) {
    if (isPromotionMove(fen, from, to)) {
      setPendingPromotion({ from, to });
      clearSelection();
      return;
    }
    move(from, to);
    clearSelection();
  }

  function onPieceDrop(from: string, to: string) {
    if (!interactive || from === to) return false;
    tryMove(from, to);
    return false; // 由受控 position(fen) 驱动棋盘渲染
  }

  function onSquareClick(square: string) {
    if (!interactive) return;
    if (!selectedSquare) {
      const piece = createGame(fen).get(square as any);
      if (piece && piece.color === (myColor === "white" ? "w" : "b")) {
        selectSquare(square);
        setLegalTargets(legalTargetSquares(fen, square));
      }
      return;
    }
    if (square === selectedSquare) {
      clearSelection();
      return;
    }
    if (legalTargets.includes(square)) {
      tryMove(selectedSquare, square);
      return;
    }
    const piece = createGame(fen).get(square as any);
    if (piece && piece.color === (myColor === "white" ? "w" : "b")) {
      selectSquare(square);
      setLegalTargets(legalTargetSquares(fen, square));
      return;
    }
    clearSelection();
  }

  const customSquareStyles: Record<string, React.CSSProperties> = {};
  const last = moves[moves.length - 1];
  if (last) {
    customSquareStyles[last.from] = { backgroundColor: "rgba(255, 214, 102, 0.35)" };
    customSquareStyles[last.to] = { backgroundColor: "rgba(255, 214, 102, 0.35)" };
  }
  if (selectedSquare) {
    customSquareStyles[selectedSquare] = { backgroundColor: "rgba(255, 92, 26, 0.55)" };
  }
  for (const sq of legalTargets) {
    customSquareStyles[sq] = {
      background:
        "radial-gradient(circle, rgba(255,92,26,0.45) 22%, transparent 24%)",
      borderRadius: "50%",
    };
  }
  if (kingInCheckSquare) {
    customSquareStyles[kingInCheckSquare] = {
      backgroundColor: "rgba(255, 26, 26, 0.55)",
      boxShadow: "inset 0 0 0 3px rgba(255, 45, 45, 0.85)",
      animation: "checkPulse 1.1s ease-in-out infinite",
    };
  }

  return (
    <div ref={wrapRef} className="chess-board-root w-full">
      <button
        onClick={() => setFlipped((f) => !f)}
        className="absolute right-2 top-2 z-10 rounded-md border border-border bg-surface/80 px-2 py-1 text-xs text-muted hover:text-gray-200 hover:border-accent transition-colors"
        title="翻转棋盘"
      >
        ⇅
      </button>
      <Chessboard
        position={effectiveFen}
        boardWidth={width}
        boardOrientation={flipped ? (myColor === "black" ? "white" : "black") : (myColor === "black" ? "black" : "white")}
        onPieceDrop={onPieceDrop}
        onSquareClick={onSquareClick}
        arePiecesDraggable={interactive}
        animationDuration={200}
        showBoardNotation={true}
        customSquareStyles={customSquareStyles}
        customDarkSquareStyle={{ backgroundColor: theme.dark }}
        customLightSquareStyle={{ backgroundColor: theme.light }}
        customBoardStyle={{ borderRadius: "8px" }}
      />
      {pendingPromotion && (
        <PromotionDialog
          color={myColor as "white" | "black"}
          onPick={(piece) => {
            move(pendingPromotion.from, pendingPromotion.to, piece);
            setPendingPromotion(null);
          }}
          onCancel={() => setPendingPromotion(null)}
        />
      )}
    </div>
  );
}
