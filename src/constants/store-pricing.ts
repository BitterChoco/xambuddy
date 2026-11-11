type PriceRule = {
  price: number;
  discountPercent: number;
};

const pricing = require("./store-pricing.json") as {
  defaults: { hero: PriceRule; skin: PriceRule };
  heroes: Record<string, PriceRule>;
  skins: Record<string, Record<string, PriceRule>>;
};

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
