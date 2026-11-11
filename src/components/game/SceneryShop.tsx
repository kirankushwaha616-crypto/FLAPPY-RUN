import { Check, Lock } from "lucide-react";
import { useState } from "react";
import { SCENERIES, type SceneryId, type SceneryItem } from "@/game/catalog";
import { profileStore, type Profile } from "@/game/store";
import { cn } from "@/lib/utils";
import { CoinDot, GameButton } from "./GameButton";
import { Modal, ScreenHeader } from "./Panel";

interface Props {
  profile: Profile;
  preview: SceneryId;
  loading: boolean;
  onPreview(id: SceneryId): void;
  onBack(): void;
}

export function SceneryShop({ profile, preview, loading, onPreview, onBack }: Props) {
  const [confirm, setConfirm] = useState<SceneryItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="absolute inset-0 flex flex-col">
      <ScreenHeader title="Scenery" coins={profile.coins} onBack={onBack} />
      <div className="flex-1" />
      <p className="px-6 pb-2 font-display text-lg text-foreground text-stroke-thin">
        {loading ? "Loading world…" : "Tap a world to preview it live"}
      </p>
      <div className="grid grid-cols-3 gap-4 px-6 pb-16">
        {SCENERIES.map((s) => {
          const owned = profile.ownedScenery.includes(s.id);
          const selected = profile.scenery === s.id;
          const previewing = preview === s.id;
          return (
            <div
              key={s.id}
              onClick={() => onPreview(s.id)}
              className={cn(
                "game-panel flex cursor-pointer flex-col gap-2 p-4 transition-transform hover:-translate-y-1",
                previewing && "ring-4 ring-primary ring-offset-2 ring-offset-outline",
              )}
            >
              <button type="button" className="flex flex-col gap-2 text-left" aria-label={`Preview ${s.name}`}>
                <span className="flex w-full items-center justify-between">
                  <span className="font-display text-2xl">{s.name}</span>
                  {!owned && <Lock className="size-5" strokeWidth={3} />}
                </span>
                <span className="text-sm font-semibold text-muted-foreground">{s.tagline}</span>
              </button>
              {selected ? (
                <GameButton variant="green" size="sm" disabled className="w-full">
                  <Check className="size-4" strokeWidth={4} /> In use
                </GameButton>
              ) : owned ? (
                <GameButton
                  variant="play"
                  size="sm"
                  className="w-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    profileStore.update({ scenery: s.id });
                    onPreview(s.id);
                  }}
                >
                  Use this world
                </GameButton>
              ) : (
                <GameButton
                  variant="sky"
                  size="sm"
                  className="w-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirm(s);
                  }}
                >
                  <CoinDot className="size-4 border-2" /> {s.price}
                </GameButton>
              )}
            </div>
          );
        })}
      </div>

      {confirm && (
        <Modal className="w-[380px] text-center">
          <h3 className="font-display text-3xl">Unlock {confirm.name}?</h3>
          <p className="mt-2 flex items-center justify-center gap-2 text-lg font-bold">
            <CoinDot /> {confirm.price} coins · you have {profile.coins}
          </p>
          {error && <p className="mt-2 font-bold text-destructive">{error}</p>}
          <div className="mt-5 flex justify-center gap-3">
            <GameButton variant="cream" onClick={() => (setConfirm(null), setError(null))}>
              Cancel
            </GameButton>
            <GameButton
              variant="green"
              onClick={() => {
                const r = profileStore.buyScenery(confirm.id);
                if (r.ok) {
                  setConfirm(null);
                  setError(null);
                } else setError(r.reason === "not-enough-coins" ? "Not enough coins yet" : "Already unlocked");
              }}
            >
              Unlock
            </GameButton>
          </div>
        </Modal>
      )}
    </div>
  );
}
