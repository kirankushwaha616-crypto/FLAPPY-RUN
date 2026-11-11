import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { sounds } from "@/game/sound";

const gameButton = cva("btn-game select-none", {
  variants: {
    variant: {
      play: "bg-primary text-primary-foreground [--btn-lip:var(--color-primary-deep)]",
      green: "bg-secondary text-secondary-foreground [--btn-lip:var(--color-secondary-deep)]",
      sky: "bg-accent text-accent-foreground [--btn-lip:var(--color-accent-deep)]",
      red: "bg-destructive text-destructive-foreground [--btn-lip:var(--color-destructive-deep)]",
      cream: "bg-panel text-outline [--btn-lip:var(--color-outline)]",
    },
    size: {
      xl: "h-20 px-12 text-5xl rounded-2xl",
      lg: "h-14 px-7 text-2xl",
      md: "h-11 px-5 text-lg",
      icon: "size-11 text-lg",
      sm: "h-9 px-4 text-base",
    },
  },
  defaultVariants: { variant: "play", size: "md" },
});

type Props = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof gameButton>;

export function GameButton({ className, variant, size, onClick, ...props }: Props) {
  return (
    <button
      type="button"
      className={cn(gameButton({ variant, size }), className)}
      onClick={(e) => {
        sounds.playClick();
        onClick?.(e);
      }}
      {...props}
    />
  );
}

export function CoinDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-5 shrink-0 rounded-full border-[3px] border-coin-deep bg-coin", className)}
    />
  );
}

export function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex h-11 items-center gap-2 rounded-full border-[3px] border-outline bg-panel px-4 font-display text-xl text-outline",
        className,
      )}
    >
      {children}
    </div>
  );
}
