import { useSyncExternalStore } from "react";
import { DEFAULT_FACE, DEFAULT_SCENERY, FACES, SCENERIES, type FaceId, type SceneryId } from "./catalog";
import { purchase, type PurchaseResult } from "./rules";

export interface Transaction {
  at: number;
  kind: "reward" | "purchase";
  label: string;
  amount: number;
}

export interface Profile {
  guestId: string;
  coins: number;
  best: number;
  gamesPlayed: number;
  ownedFaces: FaceId[];
  ownedScenery: SceneryId[];
  face: FaceId;
  scenery: SceneryId;
  sound: boolean;
  rotatePortrait: boolean;
  history: Transaction[];
}

const KEY = "flappy-face-profile-v1";

function makeGuestId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  const rnd = new Uint32Array(6);
  crypto.getRandomValues(rnd);
  for (let i = 0; i < 6; i++) id += chars[rnd[i]! % chars.length];
  return `GUEST-${id}`;
}

function freeIds<T extends { id: string; price: number }>(list: T[]) {
  return list.filter((i) => i.price === 0).map((i) => i.id);
}

function fresh(): Profile {
  return {
    guestId: "GUEST-······",
    coins: 0,
    best: 0,
    gamesPlayed: 0,
    ownedFaces: freeIds(FACES),
    ownedScenery: freeIds(SCENERIES) as SceneryId[],
    face: DEFAULT_FACE,
    scenery: DEFAULT_SCENERY,
    sound: true,
    rotatePortrait: true,
    history: [],
  };
}

let state: Profile = fresh();
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    const saved = raw ? (JSON.parse(raw) as Partial<Profile>) : {};
    const base = fresh();
    state = { ...base, ...saved };
    if (!saved.guestId) state.guestId = makeGuestId();
    // Free items are always owned, even ones added after the save was made.
    state.ownedFaces = Array.from(new Set([...base.ownedFaces, ...(saved.ownedFaces ?? [])]));
    state.ownedScenery = Array.from(new Set([...base.ownedScenery, ...(saved.ownedScenery ?? [])])) as SceneryId[];
    if (!FACES.some((f) => f.id === state.face)) state.face = DEFAULT_FACE;
    if (!SCENERIES.some((s) => s.id === state.scenery)) state.scenery = DEFAULT_SCENERY;
    persist();
  } catch {
    state = { ...fresh(), guestId: makeGuestId() };
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage full / private mode */
  }
}

function set(next: Profile) {
  state = next;
  persist();
  listeners.forEach((l) => l());
}

function addTx(p: Profile, tx: Omit<Transaction, "at">): Transaction[] {
  return [{ ...tx, at: Date.now() }, ...p.history].slice(0, 50);
}

export const profileStore = {
  get: () => {
    load();
    return state;
  },
  subscribe(cb: () => void) {
    load();
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  update(patch: Partial<Profile>) {
    set({ ...profileStore.get(), ...patch });
  },
  finishRun(score: number, coinsEarned: number) {
    const p = profileStore.get();
    set({
      ...p,
      coins: p.coins + coinsEarned,
      best: Math.max(p.best, score),
      gamesPlayed: p.gamesPlayed + 1,
      history: coinsEarned > 0 ? addTx(p, { kind: "reward", label: `Run · score ${score}`, amount: coinsEarned }) : p.history,
    });
  },
  buyFace(id: FaceId): PurchaseResult {
    const p = profileStore.get();
    const item = FACES.find((f) => f.id === id);
    if (!item) return { ok: false, reason: "invalid-price" };
    const r = purchase({ coins: p.coins, owned: p.ownedFaces }, id, item.price);
    if (r.ok)
      set({
        ...p,
        coins: r.wallet.coins,
        ownedFaces: r.wallet.owned,
        face: id,
        history: addTx(p, { kind: "purchase", label: `Face · ${item.name}`, amount: -item.price }),
      });
    return r;
  },
  buyScenery(id: SceneryId): PurchaseResult {
    const p = profileStore.get();
    const item = SCENERIES.find((s) => s.id === id);
    if (!item) return { ok: false, reason: "invalid-price" };
    const r = purchase({ coins: p.coins, owned: p.ownedScenery }, id, item.price);
    if (r.ok)
      set({
        ...p,
        coins: r.wallet.coins,
        ownedScenery: r.wallet.owned as SceneryId[],
        scenery: id,
        history: addTx(p, { kind: "purchase", label: `Scenery · ${item.name}`, amount: -item.price }),
      });
    return r;
  },
};

const serverSnapshot = fresh();

export function useProfile(): Profile {
  return useSyncExternalStore(profileStore.subscribe, profileStore.get, () => serverSnapshot);
}
