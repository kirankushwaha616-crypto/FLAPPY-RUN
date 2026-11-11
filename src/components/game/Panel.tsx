import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CoinDot, GameButton, Pill } from "./GameButton";

export function ScreenHeader({ title, coins, onBack }: { title: string; coins: number; onBack(): void }) {
  return (
    <div className="flex items-center justify-between gap-3 p-4">
      <div className="flex items-center gap-3">
        <GameButton variant="cream" size="icon" aria-label="Back" onClick={onBack}>
          <ArrowLeft className="size-6" strokeWidth={3} />
        </GameButton>
        <h2 className="font-display text-5xl text-primary text-stroke">{title}</h2>
      </div>
      <Pill>
        <CoinDot />
        {coins}
      </Pill>
    </div>
  );
}

export function Modal({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-[var(--scrim)]">
      <div className={cn("game-panel animate-pop-in p-6", className)}>{children}</div>
    </div>
  );
}
