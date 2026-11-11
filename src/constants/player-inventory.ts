import AsyncStorage from "@react-native-async-storage/async-storage";

import { DEFAULT_HERO_ID, HEROES } from "@/constants/game-catalog";

const INVENTORY_STORAGE_KEY = "wild-paw.player-inventory";

export type PlayerInventory = {
  heroes: string[];
  skins: string[];
};

export const DEFAULT_PLAYER_INVENTORY: PlayerInventory = {
  heroes: [DEFAULT_HERO_ID],
  skins: [],
};

const validHeroIds = new Set(HEROES.map((hero) => hero.id));
const validSkinIds = new Set(
  HEROES.flatMap((hero) => hero.skins.map((skin) => `${hero.id}:${skin.id}`)),
);

function normalizeInventory(value: unknown): PlayerInventory {
  if (!value || typeof value !== "object") {
    return DEFAULT_PLAYER_INVENTORY;
  }

  const stored = value as { heroes?: unknown; skins?: unknown };
  const heroes = Array.isArray(stored.heroes)
    ? stored.heroes.filter(
        (id): id is string => typeof id === "string" && validHeroIds.has(id),
      )
    : [];
  const skins = Array.isArray(stored.skins)
    ? stored.skins.filter(
        (id): id is string => typeof id === "string" && validSkinIds.has(id),
      )
    : [];

  return {
    heroes: Array.from(new Set([DEFAULT_HERO_ID, ...heroes])),
    skins: Array.from(new Set(skins)),
  };
}

export async function loadPlayerInventory() {
  const storedInventory = await AsyncStorage.getItem(INVENTORY_STORAGE_KEY);
  if (!storedInventory) {
    return DEFAULT_PLAYER_INVENTORY;
  }

  try {
    return normalizeInventory(JSON.parse(storedInventory) as unknown);
  } catch {
    return DEFAULT_PLAYER_INVENTORY;
  }
}

export async function savePlayerInventory(inventory: PlayerInventory) {
  await AsyncStorage.setItem(
    INVENTORY_STORAGE_KEY,
    JSON.stringify(normalizeInventory(inventory)),
  );
}
