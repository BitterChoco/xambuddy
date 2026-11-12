import {
  ITEM_RARITIES,
  type BundledImage,
  type ItemRarity,
} from "@/constants/game-catalog";
import {
  getRemoteAssetSource,
  readRemoteAssetJson,
} from "@/services/remote-assets";

type BuddyBonuses = {
  moveSpeed?: number;
  defense?: number;
  maxHealth?: number;
  attack?: number;
  xpGain?: number;
  criticalChance?: number;
  attackSpeed?: number;
  coinGain?: number;
  healingReceived?: number;
  dashCooldownReduction?: number;
  dodgeChance?: number;
};

export type BuddyRecord = {
  id: string;
  name: string;
  rarity: ItemRarity;
  image: string;
  bonuses: BuddyBonuses;
  source: BundledImage;
};

export const BUDDIES: BuddyRecord[] = [];

export async function initializeRemoteBuddyCatalog() {
  const buddyCatalog = await readRemoteAssetJson<{
    items: Omit<BuddyRecord, "source">[];
  }>("game/constants/buddies.json");
  BUDDIES.splice(
    0,
    BUDDIES.length,
    ...buddyCatalog.items.map((buddy) => ({
      ...buddy,
      rarity: ITEM_RARITIES.includes(buddy.rarity) ? buddy.rarity : "common",
      source: getRemoteAssetSource(`game/buddy/${buddy.image}`),
    })),
  );
}

export const getBuddy = (id?: string | null) =>
  BUDDIES.find((buddy) => buddy.id === id);

export const getBuddyBonus = (
  buddyId: string | null | undefined,
  bonus: keyof BuddyBonuses,
) => getBuddy(buddyId)?.bonuses[bonus] ?? 0;

export function getBuddyRarityColor(rarity: ItemRarity) {
  switch (rarity) {
    case "common":
      return "#cbd5e1";
    case "uncommon":
      return "#86efac";
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

export function getBuddyBonusSummary(buddy: BuddyRecord) {
  const labels: Record<keyof BuddyBonuses, string> = {
    moveSpeed: "Move Speed",
    defense: "Defense",
    maxHealth: "Max HP",
    attack: "Attack",
    xpGain: "XP Gain",
    criticalChance: "Critical Chance",
    attackSpeed: "Attack Speed",
    coinGain: "Coin Gain",
    healingReceived: "Healing Received",
    dashCooldownReduction: "Dash Cooldown Reduction",
    dodgeChance: "Dodge Chance",
  };

  return Object.entries(buddy.bonuses)
    .filter(
      (entry): entry is [keyof BuddyBonuses, number] =>
        typeof entry[1] === "number" && entry[1] > 0,
    )
    .map(([key, value]) => `+${value}% ${labels[key]}`)
    .join(" · ");
}
