import { readRemoteAssetJson } from "@/services/remote-assets";

type PriceRule = {
  price: number;
  discountPercent: number;
  currency?: string;
};

export type StoreCurrency = "coin" | "diamond";

type StorePricing = {
  defaults: {
    hero: PriceRule;
    skin: PriceRule;
    orb?: PriceRule;
    buddy?: PriceRule;
  };
  heroes: Record<string, PriceRule>;
  skins: Record<string, Record<string, PriceRule>>;
  orbs?: Record<string, PriceRule>;
  buddies?: Record<string, PriceRule>;
  buddyItems?: Record<string, PriceRule>;
  profileBorders?: Record<string, PriceRule>;
  profilePictures?: Record<string, PriceRule>;
};

let pricing: StorePricing;

export async function initializeRemoteStorePricing() {
  pricing = await readRemoteAssetJson<StorePricing>(
    "game/constants/store-pricing.json",
  );
}

function normalizeCurrency(value: unknown): StoreCurrency | undefined {
  if (typeof value !== "string") return undefined;
  const currency = value.trim().toLowerCase();
  if (currency === "diamond" || currency === "diamonds") return "diamond";
  if (currency === "coin" || currency === "coins") return "coin";
  return undefined;
}

function sanitizeRule(rule: PriceRule | undefined, fallback: PriceRule) {
  // A rule without a currency inherits the fallback's, then defaults to coins.
  const currency: StoreCurrency =
    normalizeCurrency(rule?.currency) ??
    normalizeCurrency(fallback.currency) ??
    "coin";
  const price = Number.isFinite(rule?.price)
    ? Math.max(0, Math.floor(rule?.price ?? fallback.price))
    : fallback.price;
  const discountPercent = Number.isFinite(rule?.discountPercent)
    ? Math.min(
        100,
        Math.max(
          0,
          Math.floor(rule?.discountPercent ?? fallback.discountPercent),
        ),
      )
    : fallback.discountPercent;

  return {
    price,
    discountPercent,
    currency,
    finalPrice: Math.floor((price * (100 - discountPercent)) / 100),
  };
}

export function getHeroPricing(heroId: string) {
  return sanitizeRule(pricing.heroes[heroId], pricing.defaults.hero);
}

export function getSkinPricing(heroId: string, skinId: string) {
  return sanitizeRule(pricing.skins[heroId]?.[skinId], pricing.defaults.skin);
}

export function getOrbPricing(orbId: string) {
  return sanitizeRule(
    pricing.orbs?.[orbId],
    pricing.defaults.orb ?? { price: 400, discountPercent: 0 },
  );
}

export function getBuddyPricing(buddyId: string, rarity: string) {
  return sanitizeRule(
    pricing.buddyItems?.[buddyId] ?? pricing.buddies?.[rarity],
    pricing.defaults.buddy ?? { price: 250, discountPercent: 0 },
  );
}

export function getProfileBorderPricing(borderId: string) {
  return sanitizeRule(pricing.profileBorders?.[borderId], {
    price: 300,
    discountPercent: 0,
  });
}

export function getProfilePicturePricing(profilePictureId: string) {
  return sanitizeRule(pricing.profilePictures?.[profilePictureId], {
    price: 10_000,
    discountPercent: 0,
    currency: "coin",
  });
}
