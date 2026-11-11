import { useEffect, useState, type ReactNode } from "react";

export const STAGE_W = 960;
export const STAGE_H = 540;

export interface StageFit {
  scale: number;
  rotated: boolean;
  /** Real on-screen size of the 16:9 stage in CSS px. */
  dispW: number;
  dispH: number;
  ready: boolean;
}

function measure(rotatePortrait: boolean): StageFit {
  const vw = window.visualViewport?.width ?? window.innerWidth;
  const vh = window.visualViewport?.height ?? window.innerHeight;
  const rotated = rotatePortrait && vh > vw * 1.1;
  const aw = rotated ? vh : vw;
  const ah = rotated ? vw : vh;
  const scale = Math.min(aw / STAGE_W, ah / STAGE_H);
  return { scale, rotated, dispW: STAGE_W * scale, dispH: STAGE_H * scale, ready: true };
}

export function useStageFit(rotatePortrait: boolean) {
  const [fit, setFit] = useState<StageFit>({ scale: 1, rotated: false, dispW: STAGE_W, dispH: STAGE_H, ready: false });
  useEffect(() => {
    const update = () => setFit(measure(rotatePortrait));
    update();
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    document.addEventListener("fullscreenchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      document.removeEventListener("fullscreenchange", update);
    };
  }, [rotatePortrait]);
  return fit;
}

/** Fixed 16:9 stage (960×540 design units) scaled to fit; rotated on tall phone screens. */
export function Stage({ fit, children }: { fit: StageFit; children: ReactNode }) {
  return (
    <div className="fixed inset-0 overflow-hidden bg-letterbox">
      <div
        className="absolute top-1/2 left-1/2 overflow-hidden bg-letterbox"
        style={{
          width: STAGE_W,
          height: STAGE_H,
          transform: `translate(-50%, -50%) ${fit.rotated ? "rotate(90deg)" : ""} scale(${fit.scale})`,
          opacity: fit.ready ? 1 : 0,
          touchAction: "none",
        }}
      >
        {children}
      </div>
    </div>
  );
}
