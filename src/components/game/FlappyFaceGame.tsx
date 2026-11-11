import { useCallback, useEffect, useRef, useState } from "react";
import { getFace, getScenery, type SceneryId } from "@/game/catalog";
import { GameEngine, type Phase } from "@/game/engine";
import { sounds } from "@/game/sound";
import { profileStore, useProfile } from "@/game/store";
import { FaceShop } from "./FaceShop";
import { GameOver, Hud, PauseMenu } from "./Hud";
import { Lobby } from "./Lobby";
import { SceneryShop } from "./SceneryShop";
import { SettingsScreen } from "./SettingsScreen";
import { Stage, useStageFit } from "./Stage";

type Screen = "lobby" | "faces" | "scenery" | "settings" | "game";

export function FlappyFaceGame() {
  const profile = useProfile();
  const fit = useStageFit(profile.rotatePortrait);

  const bgRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<HTMLCanvasElement>(null);
  const groundRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);

  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState<Screen>("lobby");
  const [phase, setPhase] = useState<Phase>("lobby");
  const [score, setScore] = useState(0);
  const [coins, setCoins] = useState(0);
  const [result, setResult] = useState<{ score: number; coins: number; newBest: boolean } | null>(null);
  const [preview, setPreview] = useState<SceneryId | null>(null);
  const [bgLoading, setBgLoading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Create the single game loop once.
  useEffect(() => {
    if (!bgRef.current || !gameRef.current || !groundRef.current) return;
    const engine = new GameEngine({
      bgContainer: bgRef.current,
      gameCanvas: gameRef.current,
      groundCanvas: groundRef.current,
      callbacks: {
        onPhase: setPhase,
        onScore: setScore,
        onCoins: setCoins,
        onGameOver: (s, c) => {
          const prevBest = profileStore.get().best;
          profileStore.finishRun(s, c);
          setResult({ score: s, coins: c, newBest: s > prevBest && s > 0 });
        },
      },
    });
    engineRef.current = engine;
    let cancelled = false;
    const p = profileStore.get();
    engine.setFace(getFace(p.face).image);
    Promise.all([engine.bg.show(getScenery(p.scenery).script), engine.init()])
      .then(() => !cancelled && setReady(true))
      .catch((e) => console.error(e));
    return () => {
      cancelled = true;
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (fit.ready) engineRef.current?.setDisplaySize(fit.dispW, fit.dispH);
  }, [fit, ready]);

  useEffect(() => {
    engineRef.current?.setFace(getFace(profile.face).image);
  }, [profile.face]);

  useEffect(() => {
    sounds.setMuted(!profile.sound);
  }, [profile.sound]);

  // Background: live preview while in the scenery screen, otherwise the selected one.
  const activeScenery = screen === "scenery" && preview ? preview : profile.scenery;
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const script = getScenery(activeScenery).script;
    if (engine.bg.currentScript === script) return;
    setBgLoading(true);
    engine.bg
      .show(script)
      .catch((e) => console.error(e))
      .finally(() => setBgLoading(false));
  }, [activeScenery]);

  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else {
        await document.documentElement.requestFullscreen({ navigationUI: "hide" });
        const o = window.screen as unknown as { orientation?: { lock?: (o: string) => Promise<void> } };
        await o.orientation?.lock?.("landscape").catch(() => {});
      }
    } catch {
      /* not allowed (e.g. iOS Safari) */
    }
  }, []);

  const startRun = useCallback(() => {
    setResult(null);
    setScreen("game");
    engineRef.current?.newRun();
  }, []);

  const goLobby = useCallback(() => {
    setResult(null);
    setScreen("lobby");
    engineRef.current?.toLobby();
  }, []);

  const flap = useCallback(() => engineRef.current?.flap(), []);

  // Keyboard controls
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const eng = engineRef.current;
      if (!eng || screen !== "game") return;
      if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
        e.preventDefault();
        if (e.repeat) return;
        if (eng.phase === "paused") eng.resume();
        else if (eng.phase === "over") startRun();
        else eng.flap();
      } else if (e.code === "Escape" || e.code === "KeyP") {
        if (eng.phase === "paused") eng.resume();
        else eng.pause();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, startRun]);

  return (
    <Stage fit={fit}>
      {/* Layer 1: original background script canvas */}
      <div ref={bgRef} className="absolute inset-0" />
      {/* Layer 2: pipes, coins and the face */}
      <canvas ref={gameRef} className="pointer-events-none absolute inset-0 size-full" />
      {/* Layer 3: original Ground.js */}
      <canvas ref={groundRef} className="pointer-events-none absolute inset-0 size-full" />

      {/* Tap area for flapping */}
      {screen === "game" && (phase === "ready" || phase === "playing") && (
        <div
          className="absolute inset-0"
          onPointerDown={(e) => {
            e.preventDefault();
            flap();
          }}
        />
      )}

      {!ready && (
        <div className="absolute inset-0 grid place-items-center bg-letterbox">
          <span className="font-display text-5xl text-primary text-stroke animate-hint-pulse">Loading…</span>
        </div>
      )}

      {ready && screen === "lobby" && (
        <Lobby
          profile={profile}
          isFullscreen={isFullscreen}
          onPlay={startRun}
          onFaces={() => setScreen("faces")}
          onScenery={() => {
            setPreview(profile.scenery);
            setScreen("scenery");
          }}
          onSettings={() => setScreen("settings")}
          onFullscreen={toggleFullscreen}
        />
      )}
      {ready && screen === "faces" && <FaceShop profile={profile} onBack={() => setScreen(result ? "game" : "lobby")} />}
      {ready && screen === "scenery" && (
        <SceneryShop
          profile={profile}
          preview={preview ?? profile.scenery}
          loading={bgLoading}
          onPreview={setPreview}
          onBack={() => {
            setPreview(null);
            setScreen("lobby");
          }}
        />
      )}
      {ready && screen === "settings" && (
        <SettingsScreen
          profile={profile}
          isFullscreen={isFullscreen}
          onFullscreen={toggleFullscreen}
          onBack={() => setScreen("lobby")}
        />
      )}

      {ready && screen === "game" && (
        <>
          <Hud score={score} coins={coins} phase={phase} onPause={() => engineRef.current?.pause()} />
          {phase === "paused" && <PauseMenu onResume={() => engineRef.current?.resume()} onHome={goLobby} />}
          {phase === "over" && result && (
            <GameOver
              score={result.score}
              coins={result.coins}
              best={profile.best}
              newBest={result.newBest}
              onRetry={startRun}
              onHome={goLobby}
              onFaces={() => setScreen("faces")}
            />
          )}
        </>
      )}
    </Stage>
  );
}
