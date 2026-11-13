import {
  getRemoteAssetSource,
  hasRemoteAsset,
  readRemoteAssetJson,
} from "@/services/remote-assets";

export type BundledImage =
  | number
  | {
      uri: string;
      width?: number;
      height?: number;
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
  common: getRemoteAssetSource("game/functions/card/hero_card_common.png"),
  uncommon: getRemoteAssetSource("game/functions/card/hero_card_uncommon.png"),
  rare: getRemoteAssetSource("game/functions/card/hero_card_rare.png"),
  epic: getRemoteAssetSource("game/functions/card/hero_card_epic.png"),
  legendary: getRemoteAssetSource(
    "game/functions/card/hero_card_legendary.png",
  ),
  mythic: getRemoteAssetSource("game/functions/card/hero_card_mythic.png"),
};

export function getRarityCardImage(rarity?: ItemRarity) {
  return rarityCardImages[rarity ?? "common"];
}

export type ProfilePictureId = string;

export const PROFILE_PICTURE_CHOICES: (ProfilePictureRecord & {
  source: BundledImage;
})[] = [];
export const PROFILE_PICTURES: Record<string, BundledImage> = {};
export let DEFAULT_PROFILE_PICTURE = "";
export const PROFILE_BORDERS: ProfileBorderRecord[] = [];
export let DEFAULT_PROFILE_BORDER = "none";
export const HEROES: HeroRecord[] = [];
export let DEFAULT_HERO_ID = "dog";

type Catalog<T> = {
  defaultId: string;
  items: T[];
};

export async function initializeRemoteGameCatalogs() {
  const [pictures, borders, heroes] = await Promise.all([
    readRemoteAssetJson<Catalog<ProfilePictureRecord>>(
      "game/constants/profile-pictures.json",
    ),
    readRemoteAssetJson<Catalog<ProfileBorderRecord>>(
      "game/constants/profile-borders.json",
    ),
    readRemoteAssetJson<Catalog<HeroRecord>>("game/constants/heroes.json"),
  ]);

  PROFILE_PICTURE_CHOICES.splice(
    0,
    PROFILE_PICTURE_CHOICES.length,
    ...pictures.items.map((picture) => ({
      ...picture,
      source: getRemoteAssetSource(`game/profile/picture/${picture.image}`),
    })),
  );
  for (const id of Object.keys(PROFILE_PICTURES)) delete PROFILE_PICTURES[id];
  Object.assign(
    PROFILE_PICTURES,
    Object.fromEntries(
      PROFILE_PICTURE_CHOICES.map((picture) => [picture.id, picture.source]),
    ),
  );
  DEFAULT_PROFILE_PICTURE = PROFILE_PICTURES[pictures.defaultId]
    ? pictures.defaultId
    : (PROFILE_PICTURE_CHOICES[0]?.id ?? "");

  PROFILE_BORDERS.splice(
    0,
    PROFILE_BORDERS.length,
    ...borders.items.map((border) => ({
      ...border,
      source: border.image
        ? getRemoteAssetSource(`game/profile/border/${border.image}`)
        : undefined,
    })),
  );
  DEFAULT_PROFILE_BORDER = "none";

  HEROES.splice(
    0,
    HEROES.length,
    ...heroes.items.map((hero) => ({
      ...hero,
      source: getRemoteAssetSource(`game/heroes/type/${hero.image}`),
    })),
  );
  DEFAULT_HERO_ID = HEROES.some((hero) => hero.id === heroes.defaultId)
    ? heroes.defaultId
    : (HEROES.find((hero) => hero.id === "dog")?.id ?? HEROES[0]?.id ?? "dog");
}

export function isProfilePictureId(value: unknown): value is ProfilePictureId {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(PROFILE_PICTURES, value)
  );
}

export function getProfileBorder(id?: string | null): ProfileBorderRecord {
  return (
    PROFILE_BORDERS.find((border) => border.id === id) ??
    PROFILE_BORDERS.find((border) => border.id === "none") ?? {
      id: "none",
      name: "No Border",
      color: "transparent",
      width: 0,
    }
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

  const skinPath = `game/heroes/skin/${heroId}_${skinId}.png`;
  return hasRemoteAsset(skinPath)
    ? getRemoteAssetSource(skinPath)
    : getHeroImage(heroId);
}
