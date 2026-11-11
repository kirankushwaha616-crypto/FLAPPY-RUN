import { Home, Pause, Play, RotateCcw, Smile } from "lucide-react";
import type { Phase } from "@/game/engine";
import { CoinDot, GameButton, Pill } from "./GameButton";
import { Modal } from "./Panel";

export function Hud({ score, coins, phase, onPause }: { score: number; coins: number; phase: Phase; onPause(): void }) {
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
        <span key={score} className="font-display text-[84px] leading-none text-foreground text-stroke animate-score-pop">
          {score}
        </span>
      </div>
      <div className="absolute top-4 left-4">
        <Pill>
          <CoinDot />+{coins}
        </Pill>
      </div>
      {(phase === "playing" || phase === "ready") && (
        <div className="absolute top-4 right-4">
          <GameButton
            variant="cream"
            size="icon"
            aria-label="Pause"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onPause}
          >
            <Pause className="size-5" strokeWidth={3} />
          </GameButton>
        </div>
      )}
      {phase === "ready" && (
        <div className="pointer-events-none absolute inset-x-0 top-[62%] flex flex-col items-center gap-1">
          <span className="font-display text-4xl text-foreground text-stroke animate-hint-pulse">Tap to fly</span>
          <span className="font-display text-lg text-primary text-stroke-thin">Click · Tap · Space</span>
        </div>
      )}
    </>
  );
}

export function PauseMenu({ onResume, onHome }: { onResume(): void; onHome(): void }) {
  return (
    <Modal className="w-[360px] text-center">
      <h2 className="font-display text-5xl">Paused</h2>
      <div className="mt-6 flex flex-col gap-3">
        <GameButton variant="play" size="lg" onClick={onResume}>
          <Play className="size-6" strokeWidth={3} /> Resume
        </GameButton>
        <GameButton variant="cream" size="md" onClick={onHome}>
          <Home className="size-5" strokeWidth={3} /> Menu
        </GameButton>
      </div>
    </Modal>
  );
}

export function GameOver({
  score,
  coins,
  best,
  newBest,
  onRetry,
  onHome,
  onFaces,
}: {
  score: number;
  coins: number;
  best: number;
  newBest: boolean;
  onRetry(): void;
  onHome(): void;
  onFaces(): void;
}) {
  return (
    <Modal className="w-[440px] text-center">
      <h2 className="font-display text-6xl text-destructive text-stroke-thin">Game Over</h2>
      {newBest && (
        <span className="mt-2 inline-block rounded-full border-[3px] border-outline bg-primary px-4 py-0.5 font-display text-lg">
          New best!
        </span>
      )}
      <div className="mt-4 grid grid-cols-3 gap-3">
        {[
          ["Score", score],
          ["Best", best],
          ["Coins", `+${coins}`],
        ].map(([l, v]) => (
          <div key={l} className="rounded-2xl border-[3px] border-outline bg-panel-inset py-2">
            <div className="text-sm font-bold text-muted-foreground">{l}</div>
            <div className="font-display text-4xl">{v}</div>
          </div>
        ))}
      </div>
      <div className="mt-6 flex justify-center gap-3">
        <GameButton variant="cream" size="icon" aria-label="Menu" onClick={onHome}>
          <Home className="size-5" strokeWidth={3} />
        </GameButton>
        <GameButton variant="play" size="lg" onClick={onRetry}>
          <RotateCcw className="size-6" strokeWidth={3} /> Play again
        </GameButton>
        <GameButton variant="green" size="icon" aria-label="Faces" onClick={onFaces}>
          <Smile className="size-5" strokeWidth={3} />
        </GameButton>
      </div>
    </Modal>
  );
}
