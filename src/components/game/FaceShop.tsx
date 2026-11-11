import { Check, Lock } from "lucide-react";
import { useState } from "react";
import { FACES, type FaceItem } from "@/game/catalog";
import { profileStore, type Profile } from "@/game/store";
import { cn } from "@/lib/utils";
import { CoinDot, GameButton } from "./GameButton";
import { Modal, ScreenHeader } from "./Panel";

export function FaceShop({ profile, onBack }: { profile: Profile; onBack(): void }) {
  const [confirm, setConfirm] = useState<FaceItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const choose = (f: FaceItem) => {
    if (profile.ownedFaces.includes(f.id)) profileStore.update({ face: f.id });
    else setConfirm(f);
  };

  const groups: { label: string; items: FaceItem[] }[] = [
    { label: "Celebrities", items: FACES.filter((f) => f.group === "celebrity") },
    { label: "Cartoon", items: FACES.filter((f) => f.group === "cartoon") },
  ];

  return (
    <div className="absolute inset-0 flex flex-col bg-[var(--scrim)]">
      <ScreenHeader title="Faces" coins={profile.coins} onBack={onBack} />
      <div className="game-scroll flex-1 overflow-y-auto px-6 pb-6">
        {groups.map((g) => (
          <section key={g.label} className="mb-4">
            <h3 className="mb-2 font-display text-2xl text-foreground text-stroke-thin">{g.label}</h3>
            <div className="grid grid-cols-7 gap-3">
              {g.items.map((f) => {
                const owned = profile.ownedFaces.includes(f.id);
                const selected = profile.face === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => choose(f)}
                    className={cn(
                      "game-panel flex flex-col items-center gap-1 p-2 transition-transform hover:-translate-y-1",
                      selected && "bg-primary",
                    )}
                  >
                    <div className="relative grid size-24 place-items-center rounded-xl bg-panel-inset">
                      <img src={f.image} alt={f.name} draggable={false} className="size-[88px] object-contain" />
                      {selected && (
                        <span className="absolute -top-2 -right-2 grid size-7 place-items-center rounded-full border-[3px] border-outline bg-secondary text-secondary-foreground">
                          <Check className="size-4" strokeWidth={4} />
                        </span>
                      )}
                      {!owned && (
                        <span className="absolute -top-2 -right-2 grid size-7 place-items-center rounded-full border-[3px] border-outline bg-panel">
                          <Lock className="size-3.5" strokeWidth={3} />
                        </span>
                      )}
                    </div>
                    <span className="w-full truncate text-center font-display text-sm leading-tight">{f.name}</span>
                    <span className="text-xs font-bold text-muted-foreground">
                      {selected ? "Selected" : owned ? (f.price === 0 ? "Free" : "Owned") : (
                        <span className="inline-flex items-center gap-1 text-outline">
                          <CoinDot className="size-3 border-2" /> {f.price}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {confirm && (
        <Modal className="w-[380px] text-center">
          <img src={confirm.image} alt={confirm.name} className="mx-auto size-28 object-contain" />
          <h3 className="mt-2 font-display text-3xl">Unlock {confirm.name}?</h3>
          <p className="mt-1 flex items-center justify-center gap-2 text-lg font-bold">
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
                const r = profileStore.buyFace(confirm.id);
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
