import { readRemoteAssetJson } from "@/services/remote-assets";

type PriceRule = {
  price: number;
  discountPercent: number;
};

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
};

let pricing: StorePricing;

export async function initializeRemoteStorePricing() {
  pricing = await readRemoteAssetJson<StorePricing>(
    "game/constants/store-pricing.json",
  );
}

function sanitizeRule(rule: PriceRule | undefined, fallback: PriceRule) {
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
