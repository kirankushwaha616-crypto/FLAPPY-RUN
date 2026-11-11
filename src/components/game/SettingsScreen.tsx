import { Maximize, RotateCw, Volume2, VolumeX } from "lucide-react";
import { profileStore, type Profile } from "@/game/store";
import { GameButton } from "./GameButton";
import { ScreenHeader } from "./Panel";

function Row({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b-2 border-dashed border-muted py-3 last:border-0">
      <span className="flex items-center gap-2 font-display text-xl">{label}</span>
      {children}
    </div>
  );
}

export function SettingsScreen({
  profile,
  onBack,
  onFullscreen,
  isFullscreen,
}: {
  profile: Profile;
  onBack(): void;
  onFullscreen(): void;
  isFullscreen: boolean;
}) {
  return (
    <div className="absolute inset-0 flex flex-col bg-[var(--scrim)]">
      <ScreenHeader title="Settings" coins={profile.coins} onBack={onBack} />
      <div className="flex flex-1 gap-4 px-6 pb-6">
        <div className="game-panel flex-1 px-5 py-2">
          <Row label={<>{profile.sound ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />} Sound</>}>
            <GameButton
              variant={profile.sound ? "green" : "cream"}
              size="sm"
              onClick={() => profileStore.update({ sound: !profile.sound })}
            >
              {profile.sound ? "On" : "Off"}
            </GameButton>
          </Row>
          <Row label={<><Maximize className="size-5" /> Fullscreen</>}>
            <GameButton variant="sky" size="sm" onClick={onFullscreen}>
              {isFullscreen ? "Exit" : "Enter"}
            </GameButton>
          </Row>
          <Row label={<><RotateCw className="size-5" /> Turn sideways on tall phones</>}>
            <GameButton
              variant={profile.rotatePortrait ? "green" : "cream"}
              size="sm"
              onClick={() => profileStore.update({ rotatePortrait: !profile.rotatePortrait })}
            >
              {profile.rotatePortrait ? "On" : "Off"}
            </GameButton>
          </Row>
          <Row label="Player ID">
            <span className="font-display text-lg">{profile.guestId}</span>
          </Row>
          <Row label="Games played">
            <span className="font-display text-lg">{profile.gamesPlayed}</span>
          </Row>
        </div>
        <div className="game-panel flex w-[340px] flex-col px-5 py-3">
          <h3 className="font-display text-2xl">Coin history</h3>
          <div className="game-scroll mt-2 flex-1 overflow-y-auto">
            {profile.history.length === 0 ? (
              <p className="text-sm font-semibold text-muted-foreground">Play a run to earn your first coins.</p>
            ) : (
              profile.history.map((t) => (
                <div key={t.at + t.label} className="flex justify-between py-1 text-sm font-bold">
                  <span className="truncate">{t.label}</span>
                  <span className={t.amount >= 0 ? "text-secondary-deep" : "text-destructive"}>
                    {t.amount >= 0 ? `+${t.amount}` : t.amount}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
