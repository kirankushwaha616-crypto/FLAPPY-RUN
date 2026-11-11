import { Maximize, Minimize, Mountain, Settings, Smile, Trophy } from "lucide-react";
import { getFace, getScenery } from "@/game/catalog";
import type { Profile } from "@/game/store";
import { CoinDot, GameButton, Pill } from "./GameButton";

interface Props {
  profile: Profile;
  isFullscreen: boolean;
  onPlay(): void;
  onFaces(): void;
  onScenery(): void;
  onSettings(): void;
  onFullscreen(): void;
}

export function Lobby({ profile, isFullscreen, onPlay, onFaces, onScenery, onSettings, onFullscreen }: Props) {
  const face = getFace(profile.face);
  const scenery = getScenery(profile.scenery);

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="pointer-events-none absolute inset-0 bg-[image:var(--gradient-scrim)] opacity-60" />

      {/* Top bar */}
      <div className="relative flex items-center justify-between p-4">
        <Pill className="text-base">
          <span className="grid size-7 place-items-center rounded-full bg-accent text-accent-foreground text-sm">
            G
          </span>
          {profile.guestId}
        </Pill>

        <div className="flex items-center gap-2">
          <Pill>
            <CoinDot />
            {profile.coins}
          </Pill>
          <Pill>
            <Trophy className="size-5 text-primary-deep" strokeWidth={3} />
            {profile.best}
          </Pill>
          <GameButton variant="cream" size="icon" aria-label="Settings" onClick={onSettings}>
            <Settings className="size-5" strokeWidth={3} />
          </GameButton>
          <GameButton
            variant="cream"
            size="icon"
            aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            onClick={onFullscreen}
          >
            {isFullscreen ? <Minimize className="size-5" strokeWidth={3} /> : <Maximize className="size-5" strokeWidth={3} />}
          </GameButton>
        </div>
      </div>

      {/* Main */}
      <div className="relative flex flex-1 items-center justify-between px-12 pb-16">
        <div className="flex flex-col items-start gap-6">
          <div className="flex items-center gap-4 animate-pop-in">
            <img
              src="/assets/flappy-face-logo.png"
              alt="FlappyFace"
              className="size-24 object-contain drop-shadow-xl"
            />
            <h1 className="font-display leading-[0.9] text-[96px] text-stroke">
              <span className="block text-primary">Flappy</span>
              <span className="block pl-10 text-secondary">Face</span>
            </h1>
          </div>

          <GameButton variant="play" size="xl" onClick={onPlay} className="animate-pop-in">
            Play
          </GameButton>

          <div className="flex gap-3">
            <GameButton variant="green" size="lg" onClick={onFaces}>
              <Smile className="size-6" strokeWidth={3} /> Faces
            </GameButton>
            <GameButton variant="sky" size="lg" onClick={onScenery}>
              <Mountain className="size-6" strokeWidth={3} /> Scenery
            </GameButton>
          </div>
        </div>

        <button
          type="button"
          onClick={onFaces}
          className="flex flex-col items-center gap-3 pr-8"
          aria-label={`Selected face: ${face.name}. Change face`}
        >
          <img
            src={face.image}
            alt={face.name}
            draggable={false}
            className="size-60 object-contain animate-face-bob"
          />
          <Pill className="text-lg">{face.name}</Pill>
          <span className="font-display text-base text-foreground text-stroke-thin">World · {scenery.name}</span>
        </button>
      </div>
    </div>
  );
}
