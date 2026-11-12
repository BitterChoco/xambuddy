import type { BundledImage } from "@/constants/game-catalog";
import { getRemoteAssetSource } from "@/services/remote-assets";

export type OrbSkin = {
  id: string;
  name: string;
  rarity: "common" | "rare" | "epic" | "legendary" | "mythic";
  orbImage: BundledImage;
  laserImage: BundledImage;
};

export const DEFAULT_ORB_SKIN_ID = "orb_1";

export const ORB_SKINS: OrbSkin[] = [
  {
    id: "orb_1",
    name: "Starter Orb",
    rarity: "common",
    orbImage: getRemoteAssetSource("game/orbs/orb_1-1.png"),
    laserImage: getRemoteAssetSource("game/orbs/orb_1-2.png"),
  },
  {
    id: "orb_2",
    name: "Copper Eye",
    rarity: "rare",
    orbImage: getRemoteAssetSource("game/orbs/orb_2-1.png"),
    laserImage: getRemoteAssetSource("game/orbs/orb_2-2.png"),
  },
  {
    id: "orb_3",
    name: "Prism Core",
    rarity: "epic",
    orbImage: getRemoteAssetSource("game/orbs/orb_3-1.png"),
    laserImage: getRemoteAssetSource("game/orbs/orb_3-2.png"),
  },
  {
    id: "orb_4",
    name: "Verdant Sentinel",
    rarity: "epic",
    orbImage: getRemoteAssetSource("game/orbs/orb_4-1.png"),
    laserImage: getRemoteAssetSource("game/orbs/orb_4-2.png"),
  },
  {
    id: "orb_5",
    name: "Aether Engine",
    rarity: "legendary",
    orbImage: getRemoteAssetSource("game/orbs/orb_5-1.png"),
    laserImage: getRemoteAssetSource("game/orbs/orb_5-2.png"),
  },
  {
    id: "orb_6",
    name: "Nova Reactor",
    rarity: "mythic",
    orbImage: getRemoteAssetSource("game/orbs/orb_6-1.png"),
    laserImage: getRemoteAssetSource("game/orbs/orb_6-2.png"),
  },
];

const orbSkinsById = new Map(ORB_SKINS.map((skin) => [skin.id, skin]));

export function getOrbSkin(id?: string | null) {
  return orbSkinsById.get(id ?? "") ?? orbSkinsById.get(DEFAULT_ORB_SKIN_ID)!;
}

export function getOrbRarityColor(rarity: OrbSkin["rarity"]) {
  switch (rarity) {
    case "common":
      return "#cbd5e1";
    case "rare":
      return "#60a5fa";
    case "epic":
      return "#c084fc";
    case "legendary":
      return "#fbbf24";
    case "mythic":
      return "#fb7185";
  }
}
