export type FaceId = string;
export type SceneryId = "nature" | "himalaya" | "jungle";

export interface FaceItem {
  id: FaceId;
  name: string;
  group: "cartoon" | "celebrity";
  image: string;
  /** Coin price. 0 = free. Prices are set by the game owner only. */
  price: number;
}

export interface SceneryItem {
  id: SceneryId;
  name: string;
  tagline: string;
  /** Original background script, served unchanged from /public/game. */
  script: string;
  price: number;
}

// All prices are 0 until the owner approves real prices.
export const FACES: FaceItem[] = [
  { id: "face-classic", name: "Classic", group: "cartoon", image: "/assets/faces/face-classic.png", price: 0 },
  { id: "face-golden-legend", name: "Golden Legend", group: "cartoon", image: "/assets/faces/face-golden-legend.png", price: 0 },
  { id: "face-alen", name: "Alen", group: "cartoon", image: "/assets/faces/face-alen.png", price: 0 },
  { id: "face-ninja", name: "Ninja", group: "cartoon", image: "/assets/faces/face-ninja.png", price: 0 },
  { id: "face-mini-monster", name: "Mini Monster", group: "cartoon", image: "/assets/faces/face-mini-monster.png", price: 0 },
  { id: "face-ice-spirit", name: "Ice Spirit", group: "cartoon", image: "/assets/faces/face-ice-spirit.png", price: 0 },
  { id: "face-sleepy", name: "Sleepy", group: "cartoon", image: "/assets/faces/face-sleepy.png", price: 0 },
  { id: "face-angry", name: "Angry", group: "cartoon", image: "/assets/faces/face-angry.png", price: 0 },
  { id: "rahul-gandhi", name: "Pappu", group: "celebrity", image: "/assets/faces/rahul-gandhi.png", price: 0 },
  { id: "putin", name: "Pramod", group: "celebrity", image: "/assets/faces/putin.png", price: 0 },
  { id: "narendra-modi", name: "Chai Wala", group: "celebrity", image: "/assets/faces/narendra-modi.png", price: 0 },
  { id: "elon-musk", name: "Musk Melon", group: "celebrity", image: "/assets/faces/elon-musk.png", price: 0 },
  { id: "mukesh-ambani", name: "Mota Bhai", group: "celebrity", image: "/assets/faces/mukesh-ambani.png", price: 0 },
  { id: "mahatma-gandhi", name: "God Father", group: "celebrity", image: "/assets/faces/mahatma-gandhi.png", price: 0 },
];

export const SCENERIES: SceneryItem[] = [
  {
    id: "nature",
    name: "Nature",
    tagline: "Rolling hills, mountains & clouds",
    script: "/game/parallax-nature-background.js",
    price: 0,
  },
  {
    id: "himalaya",
    name: "Himalaya",
    tagline: "Snow peaks & alpine forests",
    script: "/game/himalaya.js",
    price: 0,
  },
  {
    id: "jungle",
    name: "Dense Jungle",
    tagline: "Giant trees & hanging vines",
    script: "/game/dense-jungle.js",
    price: 0,
  },
];

export const DEFAULT_FACE: FaceId = "face-classic";
export const DEFAULT_SCENERY: SceneryId = "nature";

export const getFace = (id: FaceId) => FACES.find((f) => f.id === id) ?? FACES[0]!;
export const getScenery = (id: SceneryId) => SCENERIES.find((s) => s.id === id) ?? SCENERIES[0]!;
