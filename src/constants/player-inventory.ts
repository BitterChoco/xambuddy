import AsyncStorage from "@react-native-async-storage/async-storage";

import { BUDDIES } from "@/constants/buddy-catalog";
import { DEFAULT_HERO_ID, HEROES } from "@/constants/game-catalog";
import { DEFAULT_ORB_SKIN_ID, ORB_SKINS } from "@/constants/orb-catalog";

const INVENTORY_STORAGE_KEY = "wild-paw.player-inventory";

export type PlayerInventory = {
  heroes: string[];
  skins: string[];
  equippedOrb: boolean;
  orbSkins: string[];
  equippedOrbSkin: string;
  buddies: string[];
  equippedBuddy: string;
};

export const DEFAULT_PLAYER_INVENTORY: PlayerInventory = {
  heroes: [],
  skins: [],
  equippedOrb: false,
  orbSkins: [DEFAULT_ORB_SKIN_ID],
  equippedOrbSkin: DEFAULT_ORB_SKIN_ID,
  buddies: [],
  equippedBuddy: "",
};

export function initializeDefaultPlayerInventory() {
  DEFAULT_PLAYER_INVENTORY.heroes.splice(
    0,
    DEFAULT_PLAYER_INVENTORY.heroes.length,
    DEFAULT_HERO_ID,
  );
}

const validOrbSkinIds = new Set(ORB_SKINS.map((skin) => skin.id));

function normalizeInventory(value: unknown): PlayerInventory {
  if (!value || typeof value !== "object") {
    return DEFAULT_PLAYER_INVENTORY;
  }

  const stored = value as {
    heroes?: unknown;
    skins?: unknown;
    equippedOrb?: unknown;
    orbSkins?: unknown;
    equippedOrbSkin?: unknown;
    buddies?: unknown;
    equippedBuddy?: unknown;
  };
  const validHeroIds = new Set(HEROES.map((hero) => hero.id));
  const validSkinIds = new Set(
    HEROES.flatMap((hero) => hero.skins.map((skin) => `${hero.id}:${skin.id}`)),
  );
  const validBuddyIds = new Set(BUDDIES.map((buddy) => buddy.id));
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
  const orbSkins = Array.isArray(stored.orbSkins)
    ? stored.orbSkins.filter(
        (id): id is string => typeof id === "string" && validOrbSkinIds.has(id),
      )
    : [];
  const ownedOrbSkins = Array.from(new Set([DEFAULT_ORB_SKIN_ID, ...orbSkins]));
  const equippedOrbSkin =
    typeof stored.equippedOrbSkin === "string" &&
    ownedOrbSkins.includes(stored.equippedOrbSkin)
      ? stored.equippedOrbSkin
      : DEFAULT_ORB_SKIN_ID;
  const buddies = Array.isArray(stored.buddies)
    ? stored.buddies.filter(
        (id): id is string => typeof id === "string" && validBuddyIds.has(id),
      )
    : [];
  const ownedBuddies = Array.from(new Set(buddies));
  const equippedBuddy =
    typeof stored.equippedBuddy === "string" &&
    ownedBuddies.includes(stored.equippedBuddy)
      ? stored.equippedBuddy
      : "";

  return {
    heroes: Array.from(new Set([DEFAULT_HERO_ID, ...heroes])),
    skins: Array.from(new Set(skins)),
    equippedOrb: stored.equippedOrb === true,
    orbSkins: ownedOrbSkins,
    equippedOrbSkin,
    buddies: ownedBuddies,
    equippedBuddy,
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
