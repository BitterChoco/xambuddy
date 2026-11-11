export type BundledImage =
  | number
  | {
      uri: string;
      width?: number;
      height?: number;
    };

type AssetContext = {
  keys: () => string[];
  (key: string): BundledImage;
};

export type ProfilePictureRecord = {
  id: string;
  name: string;
  image: string;
};

export type ProfileBorderRecord = {
  id: string;
  name: string;
  image?: string | null;
  color?: string;
  width?: number;
  source?: BundledImage;
};

export type ItemRarity =
  | "common"
  | "uncommon"
  | "rare"
  | "epic"
  | "legendary"
  | "mythic";

export type SkinRecord = {
  id: string;
  name: string;
  color: string;
  rarity?: ItemRarity;
};

export type HeroRecord = {
  id: string;
  name: string;
  type: string;
  rarity?: ItemRarity;
  accent: string;
  ability: string;
  stats: { power: number; speed: number; defense: number };
  image: string;
  source?: BundledImage;
  skins: SkinRecord[];
};

export const ITEM_RARITIES: ItemRarity[] = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
  "mythic",
];

const rarityCardImages: Record<ItemRarity, BundledImage> = {
  common: require("@/assets/game/functions/card/hero_card_common.png"),
  uncommon: require("@/assets/game/functions/card/hero_card_uncommon.png"),
  rare: require("@/assets/game/functions/card/hero_card_rare.png"),
  epic: require("@/assets/game/functions/card/hero_card_epic.png"),
  legendary: require("@/assets/game/functions/card/hero_card_legendary.png"),
  mythic: require("@/assets/game/functions/card/hero_card_mythic.png"),
};

export function getRarityCardImage(rarity?: ItemRarity) {
  return rarityCardImages[rarity ?? "common"];
}

function createAssetMap(context: AssetContext) {
  return new Map(
    context.keys().map((key) => [key.slice(2).toLowerCase(), context(key)]),
  );
}

const profilePictureCatalog =
  require("@/assets/game/profile/picture/profile-pictures.json") as {
    defaultId: string;
    items: ProfilePictureRecord[];
  };
const profilePictureAssets = createAssetMap(
  require.context(
    "../../assets/game/profile/picture",
    false,
    /\.(png|jpe?g|webp)$/i,
  ) as AssetContext,
);

export const PROFILE_PICTURE_CHOICES = profilePictureCatalog.items
  .map((picture) => ({
    ...picture,
    source: profilePictureAssets.get(picture.image.toLowerCase()),
  }))
  .filter(
    (picture): picture is ProfilePictureRecord & { source: BundledImage } =>
      picture.source !== undefined,
  );

export type ProfilePictureId = (typeof PROFILE_PICTURE_CHOICES)[number]["id"];

export const PROFILE_PICTURES: Record<string, BundledImage> =
  Object.fromEntries(
    PROFILE_PICTURE_CHOICES.map((picture) => [picture.id, picture.source]),
  );

export const DEFAULT_PROFILE_PICTURE = PROFILE_PICTURES[
  profilePictureCatalog.defaultId
]
  ? profilePictureCatalog.defaultId
  : (PROFILE_PICTURE_CHOICES[0]?.id ?? "");

const profileBorderCatalog =
  require("@/assets/game/profile/border/profile-borders.json") as {
    defaultId: string;
    items: ProfileBorderRecord[];
  };
const profileBorderAssets = createAssetMap(
  require.context(
    "../../assets/game/profile/border",
    false,
    /\.(png|jpe?g|webp)$/i,
  ) as AssetContext,
);

export const PROFILE_BORDERS: ProfileBorderRecord[] = profileBorderCatalog.items
  .map((border) => ({
    ...border,
    source: border.image
      ? profileBorderAssets.get(border.image.toLowerCase())
      : undefined,
  }))
  .filter((border) => !border.image || border.source !== undefined);

export const DEFAULT_PROFILE_BORDER = PROFILE_BORDERS.some(
  (border) => border.id === profileBorderCatalog.defaultId,
)
  ? profileBorderCatalog.defaultId
  : (PROFILE_BORDERS[0]?.id ?? "");

const heroCatalog = require("@/assets/game/heroes/type/heroes.json") as {
  defaultId: string;
  items: HeroRecord[];
};
const heroAssets = createAssetMap(
  require.context(
    "../../assets/game/heroes/type",
    false,
    /\.(png|jpe?g|webp)$/i,
  ) as AssetContext,
);
const skinAssets = createAssetMap(
  require.context(
    "../../assets/game/heroes/skin",
    false,
    /\.(png|jpe?g|webp)$/i,
  ) as AssetContext,
);

export const HEROES: HeroRecord[] = heroCatalog.items
  .map((hero) => ({
    ...hero,
    source: heroAssets.get(hero.image.toLowerCase()),
  }))
  .filter((hero): hero is HeroRecord & { source: BundledImage } =>
    Boolean(hero.source),
  );

export const DEFAULT_HERO_ID = HEROES.some(
  (hero) => hero.id === heroCatalog.defaultId,
)
  ? heroCatalog.defaultId
  : (HEROES.find((hero) => hero.id === "dog")?.id ?? HEROES[0]?.id ?? "dog");

export function isProfilePictureId(value: unknown): value is ProfilePictureId {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(PROFILE_PICTURES, value)
  );
}

export function getProfileBorder(id?: string | null): ProfileBorderRecord {
  return (
    PROFILE_BORDERS.find((border) => border.id === id) ??
    PROFILE_BORDERS.find((border) => border.id === DEFAULT_PROFILE_BORDER) ??
    PROFILE_BORDERS[0] ?? { id: DEFAULT_PROFILE_BORDER, name: "Default" }
  );
}

export function getProfileBorderStyle(id?: string | null) {
  const border = getProfileBorder(id);
  return border.source
    ? { borderWidth: 0 }
    : {
        borderColor: border.color ?? "rgba(255,255,255,0.28)",
        borderWidth: border.width ?? 1,
      };
}

export function getHeroImage(id?: string | null): BundledImage | undefined {
  return (
    HEROES.find((hero) => hero.id === id)?.source ??
    HEROES.find((hero) => hero.id === DEFAULT_HERO_ID)?.source
  );
}

export function getSkinImage(
  heroId?: string | null,
  skinId?: string | null,
): BundledImage | undefined {
  if (!heroId || !skinId) {
    return getHeroImage(heroId);
  }

  return (
    skinAssets.get(`${heroId}_${skinId}.png`.toLowerCase()) ??
    getHeroImage(heroId)
  );
}
