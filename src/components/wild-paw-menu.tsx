import { ProfileBorderOverlay } from "@/components/ui/profile-border-overlay";
import {
    BUDDIES,
    getBuddy,
    getBuddyBonusSummary,
    getBuddyRarityColor,
} from "@/constants/buddy-catalog";
import {
    awardCoins,
    getCoinBalance,
    spendCoins,
    subscribeToCoinBalance,
} from "@/constants/coin-wallet";
import {
    DEFAULT_HERO_ID,
    DEFAULT_PROFILE_BORDER,
    DEFAULT_PROFILE_PICTURE,
    getHeroImage,
    getProfileBorderStyle,
    getRarityCardImage,
    getSkinImage,
    HEROES,
    isProfilePictureId,
    ITEM_RARITIES,
    PROFILE_BORDERS,
    PROFILE_PICTURE_CHOICES,
    PROFILE_PICTURES,
    type HeroRecord,
    type ItemRarity,
    type ProfilePictureId,
} from "@/constants/game-catalog";
import {
    DEFAULT_ORB_SKIN_ID,
    getOrbRarityColor,
    getOrbSkin,
    ORB_SKINS,
} from "@/constants/orb-catalog";
import {
    getPlayerLevelProgress,
    getPlayerXp,
    subscribeToPlayerXp,
} from "@/constants/player-experience";
import {
    DEFAULT_PLAYER_INVENTORY,
    loadPlayerInventory,
    savePlayerInventory,
    type PlayerInventory,
} from "@/constants/player-inventory";
import {
    getMusicVolume,
    getSoundEffectsVolume,
    getVibrationEnabled,
    saveMusicVolume,
    saveSoundEffectsVolume,
    saveVibrationEnabled,
    updateMusicVolume,
    updateSoundEffectsVolume,
} from "@/constants/player-settings";
import {
    getBuddyPricing,
    getHeroPricing,
    getOrbPricing,
    getSkinPricing,
} from "@/constants/store-pricing";
import { getLocalHostAddresses } from "@/services/local-host-address";
import {
    probeLocalServer,
    startLocalHostServer,
} from "@/services/local-multiplayer-network";
import { getRemoteAssetSource } from "@/services/remote-assets";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Slider from "@react-native-community/slider";
import { Image, type ImageSource } from "expo-image";
import * as Network from "expo-network";
import { router, type Href } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
    Animated,
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    useWindowDimensions,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const heroes = HEROES;
type HeroId = string;
type MenuScreen =
  | "main"
  | "hero"
  | "play"
  | "multiplayer"
  | "profile"
  | "store"
  | "settings";
type SelectionTab = "hero" | "skin" | "orb" | "buddy";
type StoreTab = "hero" | "skin" | "orb" | "buddy";
type StorePriceSort = "featured" | "low-to-high" | "high-to-low";
type ProfileTab = "picture" | "border";
type MultiplayerView = "choice" | "host" | "join";
type LocalHost = {
  id: string;
  name: string;
  address: string;
  status: "online" | "offline";
};

const buttonImage = getRemoteAssetSource("game/functions/button_1.png");
const menuBackground = getRemoteAssetSource("images/background_1.png");
const titleImage = getRemoteAssetSource("game/functions/title_1.png");
const storeHeroTabImage = getRemoteAssetSource("game/functions/hero_1.png");
const storeSkinTabImage = getRemoteAssetSource("game/functions/skin_1.png");
const storeOrbTabImage = getRemoteAssetSource("game/orbs/orb_2-1.png");
const storeBuddyTabImage = getRemoteAssetSource("game/buddy/buddy_default.png");
const previewMinimizeImage = getRemoteAssetSource(
  "game/functions/minimize_1.png",
);
const previewExpandImage = getRemoteAssetSource("game/functions/expand_1.png");
const coinImage = getRemoteAssetSource("game/icons/coin_1.png");
const orbImage = getRemoteAssetSource("game/orbs/orb_1-1.png");
const PROFILE_STORAGE_KEY = "wild-paw.player-profile";
const shopImage = getRemoteAssetSource("game/icons/shop_1.png");
const calendarImage = getRemoteAssetSource("game/icons/calendar_1.png");
const taskImage = getRemoteAssetSource("game/icons/task_1.png");
const homeImage = getRemoteAssetSource("game/icons/home_1.png");
const settingsImage = getRemoteAssetSource("game/icons/settings_1.png");

function CoinBalanceBadge({ balance }: { balance: number }) {
  return (
    <View style={styles.coinBalanceBadge}>
      <Image
        source={coinImage}
        style={styles.coinBalanceIcon}
        contentFit="contain"
        accessibilityLabel="Coins"
      />
      <Text style={styles.coinBalanceText}>{balance}</Text>
    </View>
  );
}

function ProfilePicture({
  name,
  picture,
  border,
  level,
  onPress,
  onStorePress,
  onSettingsPress,
}: {
  name: string;
  picture: ProfilePictureId;
  border: string;
  level: number;
  onPress: () => void;
  onStorePress: () => void;
  onSettingsPress: () => void;
}) {
  return (
    <View style={styles.profileRail}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${name}'s profile`}
        onPress={onPress}
        style={styles.profileBadge}
      >
        <View
          style={[styles.profilePictureFrame, getProfileBorderStyle(border)]}
        >
          <Image
            source={PROFILE_PICTURES[picture]}
            style={styles.profilePicture}
            contentFit="cover"
            accessibilityLabel={`${picture} profile portrait`}
          />
          <ProfileBorderOverlay borderId={border} />
        </View>
        <Text numberOfLines={1} style={styles.profileUserName}>
          {name || "Player 1"}
        </Text>
        <Text style={styles.profileLevelBadge}>LEVEL {level}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open store"
        onPress={onStorePress}
        style={styles.profileMenuIconTile}
      >
        <Image
          source={shopImage}
          style={styles.profileMenuIcon}
          contentFit="contain"
          accessibilityLabel="Shop"
        />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open events and rewards"
        onPress={() => router.push("/event" as Href)}
        style={styles.profileMenuIconTile}
      >
        <Image
          source={calendarImage}
          style={styles.profileMenuIcon}
          contentFit="contain"
          accessibilityLabel="Events"
        />
      </Pressable>
      <View style={styles.profileMenuIconTile}>
        <Image
          source={taskImage}
          style={styles.profileMenuIcon}
          contentFit="contain"
          accessibilityLabel="Tasks"
        />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open settings"
        onPress={onSettingsPress}
        style={styles.profileMenuIconTile}
      >
        <Image
          source={settingsImage}
          style={styles.profileMenuIcon}
          contentFit="contain"
          accessibilityLabel="Settings"
        />
      </Pressable>
    </View>
  );
}

function BackIconButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back to menu"
      onPress={onPress}
      style={styles.profileMenuIconTile}
    >
      <Image
        source={homeImage}
        style={styles.profileMenuIcon}
        contentFit="contain"
      />
    </Pressable>
  );
}

function SpriteButton({
  title,
  subtitle,
  onPress,
  disabled = false,
  selected = false,
  compact = false,
  small = false,
  locked = false,
  emphasized = false,
}: {
  title: string;
  subtitle?: string;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
  compact?: boolean;
  small?: boolean;
  locked?: boolean;
  emphasized?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={locked ? `${title}, locked` : title}
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        compact && styles.primaryButtonCompact,
        small && styles.primaryButtonSmall,
        disabled && styles.primaryButtonDisabled,
        (pressed || selected) && !disabled && styles.primaryButtonPressed,
      ]}
    >
      {({ pressed }) => (
        <>
          <Image
            source={buttonImage}
            contentFit="contain"
            style={styles.primaryButtonImage}
            pointerEvents="none"
          />
          {(pressed || selected) && !disabled && (
            <View
              pointerEvents="none"
              style={styles.primaryButtonPressedOverlay}
            />
          )}
          {locked && (
            <View pointerEvents="none" style={styles.lockBadge}>
              <Text style={styles.lockBadgeIcon}>🔒</Text>
            </View>
          )}
          <View pointerEvents="none" style={styles.primaryButtonLabels}>
            <Text
              style={[
                styles.primaryButtonText,
                compact && styles.primaryButtonCompactText,
                small && styles.primaryButtonSmallText,
                emphasized && styles.primaryButtonEmphasizedText,
                subtitle &&
                  (small
                    ? styles.primaryButtonSmallWithSubtitleText
                    : styles.primaryButtonWithSubtitleText),
              ]}
            >
              {title}
            </Text>
            {subtitle && (
              <Text
                style={[
                  styles.primaryButtonSubtitle,
                  small && styles.primaryButtonSmallSubtitle,
                ]}
              >
                {subtitle}
              </Text>
            )}
          </View>
        </>
      )}
    </Pressable>
  );
}

export function WildPawMenu() {
  const { width: viewportWidth } = useWindowDimensions();
  const storeCardWidthStyle = styles.storeItemCardFourCol;
  const [screen, setScreen] = useState<MenuScreen>("main");
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [soundEffectsVolume, setSoundEffectsVolume] = useState(0.75);
  const [selectedHero, setSelectedHero] = useState<HeroId>(DEFAULT_HERO_ID);
  const [selectedSkins, setSelectedSkins] = useState<Record<HeroId, string>>(
    {},
  );
  const [inventory, setInventory] = useState<PlayerInventory>(
    DEFAULT_PLAYER_INVENTORY,
  );
  const [inventoryLoaded, setInventoryLoaded] = useState(false);
  const [selectionTab, setSelectionTab] = useState<SelectionTab>("hero");
  const [storeTab, setStoreTab] = useState<StoreTab>("hero");
  const [storeSelectedItemId, setStoreSelectedItemId] = useState("");
  const [storePreviewDetailsVisible, setStorePreviewDetailsVisible] =
    useState(true);
  const [storeHeroFilter, setStoreHeroFilter] = useState("all");
  const [storeRarityFilter, setStoreRarityFilter] = useState<
    ItemRarity | "all"
  >("all");
  const [storeFiltersOpen, setStoreFiltersOpen] = useState(false);
  const [storeSortOpen, setStoreSortOpen] = useState(false);
  const [storeOwnedOnly, setStoreOwnedOnly] = useState(false);
  const [storePriceSort, setStorePriceSort] =
    useState<StorePriceSort>("featured");
  const [storeMessage, setStoreMessage] = useState("");
  const [purchasingItem, setPurchasingItem] = useState<string | null>(null);
  const [coinBalance, setCoinBalance] = useState(0);
  const [musicVolume, setMusicVolume] = useState(0.5);
  const [playerXp, setPlayerXp] = useState(0);
  const [profileName, setProfileName] = useState("Player 1");
  const [profilePicture, setProfilePicture] = useState<ProfilePictureId>(
    DEFAULT_PROFILE_PICTURE,
  );
  const [profileBorder, setProfileBorder] = useState(DEFAULT_PROFILE_BORDER);
  const [profileTab, setProfileTab] = useState<ProfileTab>("picture");
  const [orbMessage, setOrbMessage] = useState("");
  const [buddyMessage, setBuddyMessage] = useState("");
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [multiplayerView, setMultiplayerView] =
    useState<MultiplayerView>("choice");
  const [multiplayerName, setMultiplayerName] = useState("Player 1");
  const [manualHostAddress, setManualHostAddress] = useState("");
  const [isStartingHost, setIsStartingHost] = useState(false);
  const [isScanningHosts, setIsScanningHosts] = useState(false);
  const [localHosts, setLocalHosts] = useState<LocalHost[]>([]);
  const [hostScanMessage, setHostScanMessage] = useState(
    "Start hosting on this phone to see its address for other players.",
  );
  const titleWiggle = useMemo(() => new Animated.Value(0), []);
  const playerLevel = getPlayerLevelProgress(playerXp);

  useEffect(() => {
    let isMounted = true;
    void getVibrationEnabled().then((enabled) => {
      if (isMounted) setVibrationEnabled(enabled);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    void Promise.all([getMusicVolume(), getSoundEffectsVolume()]).then(
      ([volume, soundEffectsVolume]) => {
        if (!isMounted) return;
        setMusicVolume(volume);
        setSoundEffectsVolume(soundEffectsVolume);
      },
    );
    return () => {
      isMounted = false;
    };
  }, []);

  const toggleVibration = (enabled: boolean) => {
    setVibrationEnabled(enabled);
    void saveVibrationEnabled(enabled).catch(() => {
      setVibrationEnabled(!enabled);
    });
  };

  const changeMusicVolume = (volume: number) => {
    setMusicVolume(volume);
    updateMusicVolume(volume);
  };

  const changeSoundEffectsVolume = (volume: number) => {
    setSoundEffectsVolume(volume);
    updateSoundEffectsVolume(volume);
  };

  useEffect(() => {
    let isMounted = true;
    const unsubscribe = subscribeToCoinBalance(setCoinBalance);
    void getCoinBalance()
      .then((balance) => {
        if (isMounted) {
          setCoinBalance(balance);
        }
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const unsubscribe = subscribeToPlayerXp(setPlayerXp);
    void getPlayerXp()
      .then((totalXp) => {
        if (isMounted) {
          setPlayerXp(totalXp);
        }
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    void loadPlayerInventory()
      .then((loadedInventory) => {
        if (isMounted) {
          setInventory(loadedInventory);
          setSelectedHero((currentHero) =>
            loadedInventory.heroes.includes(currentHero)
              ? currentHero
              : DEFAULT_HERO_ID,
          );
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (isMounted) {
          setInventoryLoaded(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    void AsyncStorage.getItem(PROFILE_STORAGE_KEY)
      .then((storedProfile) => {
        if (!isMounted || !storedProfile) {
          return;
        }

        const parsed = JSON.parse(storedProfile) as {
          name?: unknown;
          avatar?: unknown;
          picture?: unknown;
          border?: unknown;
        };
        if (typeof parsed.name === "string" && parsed.name.trim()) {
          const savedName = parsed.name.trim().slice(0, 20);
          setProfileName(savedName);
          setMultiplayerName(savedName);
        }
        const savedPicture = parsed.picture ?? parsed.avatar;
        if (isProfilePictureId(savedPicture)) {
          setProfilePicture(savedPicture);
        }
        if (
          typeof parsed.border === "string" &&
          PROFILE_BORDERS.some((border) => border.id === parsed.border)
        ) {
          setProfileBorder(parsed.border);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (isMounted) {
          setProfileLoaded(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!profileLoaded) {
      return;
    }

    void AsyncStorage.setItem(
      PROFILE_STORAGE_KEY,
      JSON.stringify({
        name: profileName,
        picture: profilePicture,
        border: profileBorder,
      }),
    ).catch(() => undefined);
  }, [profileBorder, profileLoaded, profileName, profilePicture]);

  const hero = useMemo(
    () =>
      heroes.find((entry) => entry.id === selectedHero) ??
      heroes.find((entry) => entry.id === DEFAULT_HERO_ID) ??
      (heroes[0] as HeroRecord),
    [selectedHero],
  );

  const ownedHeroes = heroes.filter((entry) =>
    inventory.heroes.includes(entry.id),
  );
  const ownedSkins = hero.skins.filter((skin) =>
    inventory.skins.includes(`${hero.id}:${skin.id}`),
  );
  const selectedSkin = ownedSkins.find(
    (skin) => skin.id === selectedSkins[hero.id],
  ) ?? {
    id: "",
    name: "No skin equipped",
    color: hero.accent,
  };

  const updateProfileName = (name: string) => {
    setProfileName(name);
    setMultiplayerName(name);
  };

  const commitProfileName = () => {
    const savedName = profileName.trim() || "Player 1";
    updateProfileName(savedName);
  };

  const toggleOrbEquipment = async () => {
    if (playerLevel.level < 5 || !inventoryLoaded) {
      return;
    }

    const nextInventory = {
      ...inventory,
      equippedOrb: !inventory.equippedOrb,
    };
    try {
      await savePlayerInventory(nextInventory);
      setInventory(nextInventory);
      setOrbMessage(
        nextInventory.equippedOrb
          ? "Orb equipped. It will protect you in your next game."
          : "Orb unequipped.",
      );
    } catch {
      setOrbMessage("Could not save your orb equipment. Please try again.");
    }
  };

  const equipOrbSkin = async (orbSkinId: string) => {
    if (
      playerLevel.level < 5 ||
      !inventoryLoaded ||
      !inventory.orbSkins.includes(orbSkinId)
    ) {
      return;
    }

    const nextInventory = { ...inventory, equippedOrbSkin: orbSkinId };
    try {
      await savePlayerInventory(nextInventory);
      setInventory(nextInventory);
      setOrbMessage(`${getOrbSkin(orbSkinId).name} equipped.`);
    } catch {
      setOrbMessage("Could not save your orb skin. Please try again.");
    }
  };

  const equipBuddy = async (buddyId: string) => {
    if (
      playerLevel.level < 10 ||
      !inventoryLoaded ||
      (buddyId !== "" && !inventory.buddies.includes(buddyId))
    ) {
      return;
    }
    const nextInventory = {
      ...inventory,
      equippedBuddy: inventory.equippedBuddy === buddyId ? "" : buddyId,
    };
    try {
      await savePlayerInventory(nextInventory);
      setInventory(nextInventory);
      setBuddyMessage(
        nextInventory.equippedBuddy
          ? `${getBuddy(nextInventory.equippedBuddy)?.name ?? "Buddy"} equipped.`
          : "Buddy unequipped.",
      );
    } catch {
      setBuddyMessage("Could not save your buddy equipment. Please try again.");
    }
  };

  const selectSkin = (skinId: string) => {
    if (!inventory.skins.includes(`${hero.id}:${skinId}`)) {
      return;
    }
    setSelectedSkins((previous) => {
      const next = { ...previous };
      if (next[hero.id] === skinId) {
        delete next[hero.id];
      } else {
        next[hero.id] = skinId;
      }
      return next;
    });
  };

  const purchaseItem = async (
    kind: StoreTab,
    heroId: string,
    itemId: string,
    price: number,
  ) => {
    if (kind === "buddy" && playerLevel.level < 10) {
      setStoreMessage("The buddy system unlocks at player level 10.");
      return;
    }
    if (kind === "skin" && !inventory.heroes.includes(heroId)) {
      const requiredHero = heroes.find((entry) => entry.id === heroId);
      setStoreMessage(
        `${requiredHero?.name ?? "This hero"} is not owned yet. Buy the hero first to unlock its skins.`,
      );
      return;
    }

    const inventoryId =
      kind === "hero" || kind === "buddy"
        ? heroId
        : kind === "orb"
          ? itemId
          : `${heroId}:${itemId}`;
    const owned =
      kind === "hero"
        ? inventory.heroes.includes(inventoryId)
        : kind === "orb"
          ? inventory.orbSkins.includes(inventoryId)
          : kind === "buddy"
            ? inventory.buddies.includes(inventoryId)
            : inventory.skins.includes(inventoryId);
    if (owned || purchasingItem) {
      return;
    }
    if (coinBalance < price) {
      setStoreMessage("Not enough coins yet. Play a match to earn more!");
      return;
    }

    setPurchasingItem(inventoryId);
    setStoreMessage("");
    let coinsSpent = false;
    try {
      if (!(await spendCoins(price))) {
        setStoreMessage("Not enough coins yet. Play a match to earn more!");
        return;
      }
      coinsSpent = price > 0;

      const nextInventory: PlayerInventory = {
        heroes:
          kind === "hero" ? [...inventory.heroes, heroId] : inventory.heroes,
        skins:
          kind === "skin" ? [...inventory.skins, inventoryId] : inventory.skins,
        equippedOrb: inventory.equippedOrb,
        orbSkins:
          kind === "orb"
            ? [...inventory.orbSkins, inventoryId]
            : inventory.orbSkins,
        equippedOrbSkin: inventory.equippedOrbSkin,
        buddies:
          kind === "buddy"
            ? [...inventory.buddies, inventoryId]
            : inventory.buddies,
        equippedBuddy: inventory.equippedBuddy,
      };
      await savePlayerInventory(nextInventory);
      setInventory(nextInventory);
      setStoreMessage("Purchase complete! Added to your collection.");
    } catch {
      if (coinsSpent) {
        await awardCoins(price).catch(() => undefined);
      }
      setStoreMessage("Purchase could not be saved. Please try again.");
    } finally {
      setPurchasingItem(null);
    }
  };

  const storeSkins = heroes
    .filter(
      (entry) => storeHeroFilter === "all" || entry.id === storeHeroFilter,
    )
    .flatMap((entry) =>
      entry.skins.map((skin) => ({
        hero: entry,
        skin,
        inventoryId: `${entry.id}:${skin.id}`,
        price: getSkinPricing(entry.id, skin.id),
      })),
    )
    .filter(
      (item) =>
        (storeRarityFilter === "all" ||
          (item.skin.rarity ?? "common") === storeRarityFilter) &&
        (!storeOwnedOnly || inventory.skins.includes(item.inventoryId)),
    )
    .sort((first, second) => {
      if (storePriceSort === "low-to-high") {
        return first.price.finalPrice - second.price.finalPrice;
      }
      if (storePriceSort === "high-to-low") {
        return second.price.finalPrice - first.price.finalPrice;
      }
      return 0;
    });
  const storeOrbs = ORB_SKINS.filter(
    (orb) =>
      orb.id !== DEFAULT_ORB_SKIN_ID &&
      (storeRarityFilter === "all" || orb.rarity === storeRarityFilter) &&
      (!storeOwnedOnly || inventory.orbSkins.includes(orb.id)),
  )
    .map((orb) => ({
      ...orb,
      price: getOrbPricing(orb.id),
    }))
    .sort((first, second) => {
      if (storePriceSort === "low-to-high") {
        return first.price.finalPrice - second.price.finalPrice;
      }
      if (storePriceSort === "high-to-low") {
        return second.price.finalPrice - first.price.finalPrice;
      }
      return 0;
    });
  const storeBuddies = BUDDIES.filter(
    (buddy) =>
      (storeRarityFilter === "all" || buddy.rarity === storeRarityFilter) &&
      (!storeOwnedOnly || inventory.buddies.includes(buddy.id)),
  )
    .map((buddy) => ({
      ...buddy,
      price: getBuddyPricing(buddy.id, buddy.rarity),
    }))
    .sort((first, second) => {
      if (storePriceSort === "low-to-high") {
        return first.price.finalPrice - second.price.finalPrice;
      }
      if (storePriceSort === "high-to-low") {
        return second.price.finalPrice - first.price.finalPrice;
      }
      return 0;
    });
  const storeHeroes = heroes
    .filter(
      (entry) =>
        entry.id !== DEFAULT_HERO_ID &&
        (storeRarityFilter === "all" ||
          (entry.rarity ?? "common") === storeRarityFilter),
    )
    .sort((first, second) => {
      if (storePriceSort === "low-to-high") {
        return (
          getHeroPricing(first.id).finalPrice -
          getHeroPricing(second.id).finalPrice
        );
      }
      if (storePriceSort === "high-to-low") {
        return (
          getHeroPricing(second.id).finalPrice -
          getHeroPricing(first.id).finalPrice
        );
      }
      return 0;
    });
  const selectedStoreHero =
    storeTab === "hero"
      ? (storeHeroes.find(
          (entry) => `hero:${entry.id}` === storeSelectedItemId,
        ) ?? storeHeroes[0])
      : undefined;
  const selectedStoreSkin =
    storeTab === "skin"
      ? (storeSkins.find(
          (item) => `skin:${item.inventoryId}` === storeSelectedItemId,
        ) ?? storeSkins[0])
      : undefined;
  const selectedStoreOrb =
    storeTab === "orb"
      ? (storeOrbs.find((orb) => `orb:${orb.id}` === storeSelectedItemId) ??
        storeOrbs[0])
      : undefined;
  const selectedStoreBuddy =
    storeTab === "buddy"
      ? (storeBuddies.find(
          (buddy) => `buddy:${buddy.id}` === storeSelectedItemId,
        ) ?? storeBuddies[0])
      : undefined;
  const resolvedStoreSelectedItemId = selectedStoreHero
    ? `hero:${selectedStoreHero.id}`
    : selectedStoreSkin
      ? `skin:${selectedStoreSkin.inventoryId}`
      : selectedStoreOrb
        ? `orb:${selectedStoreOrb.id}`
        : selectedStoreBuddy
          ? `buddy:${selectedStoreBuddy.id}`
          : "";

  const startBattle = () => {
    router.push({
      pathname: "/game",
      params: {
        hero: hero.id,
        skinId: selectedSkin.id,
        skinColor: selectedSkin.color,
        mode: "solo",
        playerName: profileName.trim() || "Player 1",
        profilePicture,
        profileBorder,
        orbEquipped: String(inventory.equippedOrb && playerLevel.level >= 5),
        orbSkinId: inventory.equippedOrbSkin,
        buddyId:
          playerLevel.level >= 10 &&
          inventory.buddies.includes(inventory.equippedBuddy)
            ? inventory.equippedBuddy
            : "",
      },
    });
  };

  const refreshLocalHosts = async () => {
    if (isScanningHosts) {
      return;
    }

    setIsScanningHosts(true);
    setLocalHosts([]);
    setHostScanMessage(
      "Checking common hotspot addresses and scanning the local network...",
    );

    try {
      const ipAddress = await Network.getIpAddressAsync();
      const octets = ipAddress.split(".").map(Number);
      const isLanIpv4 =
        octets.length === 4 &&
        octets.every(
          (octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255,
        ) &&
        octets[0] !== 0 &&
        octets[0] !== 127 &&
        !(octets[0] === 169 && octets[1] === 254) &&
        octets[0] < 224;
      const networkPrefix = isLanIpv4 ? octets.slice(0, 3).join(".") : null;
      const manualAddress = manualHostAddress
        .trim()
        .replace(/^https?:\/\//i, "")
        .replace(/\/+$/, "");
      const candidateAddresses = new Set<string>();

      if (manualAddress) {
        candidateAddresses.add(manualAddress);
      }

      // Some phones report their cellular interface while hosting a hotspot.
      // Check common hotspot gateways before scanning the detected subnet.
      for (const address of [
        "192.168.43.1",
        "192.168.1.1",
        "192.168.0.1",
        "10.0.0.1",
        "172.20.10.1",
      ]) {
        if (address !== ipAddress) {
          candidateAddresses.add(address);
        }
      }

      if (networkPrefix) {
        for (let hostOctet = 1; hostOctet <= 254; hostOctet += 1) {
          const address = `${networkPrefix}.${hostOctet}`;
          if (address !== ipAddress) {
            candidateAddresses.add(address);
          }
        }
        setHostScanMessage(
          `Checking hotspot addresses and scanning ${networkPrefix}.x...`,
        );
      } else if (manualAddress) {
        setHostScanMessage(
          "Could not detect this device's Wi-Fi address; checking the entered address.",
        );
      } else {
        setHostScanMessage(
          "Could not detect this device's Wi-Fi address. Enter a host IP and refresh.",
        );
      }

      const addresses = Array.from(candidateAddresses);
      const discovered: LocalHost[] = [];
      let nextAddressIndex = 0;
      const workerCount = Math.min(32, addresses.length);
      await Promise.all(
        Array.from({ length: workerCount }, async () => {
          while (nextAddressIndex < addresses.length) {
            const address = addresses[nextAddressIndex];
            nextAddressIndex += 1;
            try {
              if (await probeLocalServer(address, 1000)) {
                discovered.push({
                  id: `host-${address}`,
                  name: `Local host ${address}`,
                  address,
                  status: "online",
                });
              }
            } catch {
              // Ignore unreachable addresses during the LAN scan.
            }
          }
        }),
      );

      discovered.sort((first, second) => {
        const firstLastOctet = Number(first.address.split(".").at(-1));
        const secondLastOctet = Number(second.address.split(".").at(-1));
        return firstLastOctet - secondLastOctet;
      });
      setLocalHosts(discovered);
      setHostScanMessage(
        discovered.length > 0
          ? `Found ${discovered.length} available host${discovered.length === 1 ? "" : "s"} on this Wi-Fi network.`
          : "No hosts found. Make sure a phone is hosting on the same Wi-Fi or hotspot, then refresh.",
      );
    } catch {
      setLocalHosts([]);
      setHostScanMessage(
        "Could not scan this Wi-Fi network. Enter the host IP manually or check the network connection.",
      );
    } finally {
      setIsScanningHosts(false);
    }
  };

  const connectToLocalLobby = async (
    address: string,
    role: "host" | "join",
  ) => {
    if (role === "host") {
      setIsStartingHost(true);
      try {
        await startLocalHostServer();
        const hostIpAddresses = await getLocalHostAddresses();
        const hostIpAddress = hostIpAddresses[0]?.address ?? "";

        setHostScanMessage(
          hostIpAddress
            ? `Hosted on this phone at ${hostIpAddress}:8765.`
            : "Hosting is running, but no local IPv4 address was found. Check the phone's Wi-Fi or hotspot settings.",
        );
        router.push({
          pathname: "/game",
          params: {
            hero: hero.id,
            skinId: selectedSkin.id,
            skinColor: selectedSkin.color,
            mode: "local-host",
            multiplayerRole: "host",
            hostAddress: "127.0.0.1",
            hostIpAddress,
            hostIpAddresses: JSON.stringify(hostIpAddresses),
            playerName: multiplayerName.trim() || "Host",
            profilePicture,
            profileBorder,
            orbEquipped: String(
              inventory.equippedOrb && playerLevel.level >= 5,
            ),
            orbSkinId: inventory.equippedOrbSkin,
            buddyId:
              playerLevel.level >= 10 &&
              inventory.buddies.includes(inventory.equippedBuddy)
                ? inventory.equippedBuddy
                : "",
          },
        });
      } catch {
        setHostScanMessage(
          "Could not start hosting. Close any other local match and try again.",
        );
      } finally {
        setIsStartingHost(false);
      }
      return;
    }

    const normalized = address
      .trim()
      .replace(/^https?:\/\//i, "")
      .replace(/\/+$/, "");
    if (!normalized) {
      setHostScanMessage(
        "Enter the LAN IP shown on the host phone's lobby screen.",
      );
      return;
    }

    try {
      if (!(await probeLocalServer(normalized))) {
        throw new Error("No local host responded");
      }

      router.push({
        pathname: "/game",
        params: {
          hero: hero.id,
          skinId: selectedSkin.id,
          skinColor: selectedSkin.color,
          mode: "local-join",
          multiplayerRole: role,
          hostAddress: normalized,
          hostIpAddress: "",
          playerName: multiplayerName.trim() || "Player",
          profilePicture,
          profileBorder,
          orbEquipped: String(inventory.equippedOrb && playerLevel.level >= 5),
          orbSkinId: inventory.equippedOrbSkin,
          buddyId:
            playerLevel.level >= 10 &&
            inventory.buddies.includes(inventory.equippedBuddy)
              ? inventory.equippedBuddy
              : "",
        },
      });
    } catch {
      setHostScanMessage(
        `Can't reach ${normalized}:8765. Make sure the host app is open on the same Wi-Fi network.`,
      );
    }
  };

  const hostLocalMatch = () => {
    connectToLocalLobby(manualHostAddress, "host");
  };

  const joinLocalMatch = (address: string) => {
    connectToLocalLobby(address, "join");
  };

  const renderHeroArtwork = (
    source: ImageSource | number,
    size: number,
    borderRadius?: number,
  ) => (
    <Image
      source={source}
      style={{
        width: size,
        height: size,
        borderRadius: borderRadius ?? 20,
        zIndex: 1,
      }}
      contentFit="contain"
      loading="eager"
    />
  );

  const previewScale = useMemo(() => new Animated.Value(0.96), []);

  useEffect(() => {
    Animated.sequence([
      Animated.timing(previewScale, {
        toValue: 1.04,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(previewScale, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();
  }, [previewScale, selectedHero]);

  useEffect(() => {
    const wiggle = Animated.loop(
      Animated.sequence([
        Animated.delay(2200),
        Animated.timing(titleWiggle, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(titleWiggle, {
          toValue: -1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(titleWiggle, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
      ]),
    );

    wiggle.start();
    return () => wiggle.stop();
  }, [titleWiggle]);

  const renderMainMenu = () => (
    <View style={styles.menuPage}>
      <View style={styles.mainMenuShell}>
        <View style={styles.mainMenuCard}>
          <Animated.View
            style={[
              styles.titleImageWrap,
              {
                transform: [
                  {
                    rotate: titleWiggle.interpolate({
                      inputRange: [-1, 0, 1],
                      outputRange: ["-2deg", "0deg", "2deg"],
                    }),
                  },
                  {
                    translateY: titleWiggle.interpolate({
                      inputRange: [-1, 0, 1],
                      outputRange: [2, 0, -2],
                    }),
                  },
                ],
              },
            ]}
          >
            <Image
              source={titleImage}
              accessibilityLabel="Wild Paw Bloom Wars"
              contentFit="contain"
              style={styles.titleImage}
            />
          </Animated.View>

          <View style={styles.mainMenuStack}>
            <SpriteButton title="Hero" onPress={() => setScreen("hero")} />
            <SpriteButton title="Play" onPress={() => setScreen("play")} />
          </View>
        </View>
      </View>
    </View>
  );

  const renderPlaySelector = () => (
    <View style={styles.menuPage}>
      <View style={styles.subScreenShell}>
        <View style={styles.playSelectionCard}>
          <View style={styles.playSelectionHeader}>
            <View style={styles.playHeaderSpacer} />
            <Text style={[styles.sectionTitle, styles.playSelectionTitle]}>
              Select Mode
            </Text>
            <View style={styles.playHeaderSpacer} />
          </View>

          <View style={styles.modeList}>
            {[
              {
                id: "solo",
                label: "Solo",
                isAvailable: true,
              },
              {
                id: "local",
                label: "Local Multiplayer",
                meta: "Wi‑Fi / hotspot",
                isAvailable: true,
              },
              {
                id: "online",
                label: "Online Multiplayer",
                meta: "Coming soon",
                isAvailable: false,
              },
            ].map((mode) => {
              const available = mode.isAvailable;
              return (
                <SpriteButton
                  key={mode.id}
                  title={mode.label}
                  subtitle={!available ? mode.meta : undefined}
                  small
                  emphasized={mode.id === "solo"}
                  disabled={!available}
                  locked={!available}
                  onPress={() => {
                    if (mode.id === "solo") {
                      startBattle();
                    } else if (mode.id === "local") {
                      setScreen("multiplayer");
                    }
                  }}
                />
              );
            })}
          </View>
        </View>
      </View>
    </View>
  );

  const renderMultiplayerMenu = () => (
    <View style={styles.menuPage}>
      <View style={styles.subScreenShell}>
        <View style={styles.playSelectionCard}>
          <View style={styles.playSelectionHeader}>
            <View style={styles.playHeaderSpacer} />
            <Text style={[styles.sectionTitle, styles.playSelectionTitle]}>
              Local Match
            </Text>
            <View style={styles.playHeaderSpacer} />
          </View>

          {multiplayerView === "choice" && (
            <View style={styles.modeList}>
              <SpriteButton
                title="Host Match"
                subtitle="Open a lobby"
                small
                onPress={() => setMultiplayerView("host")}
              />
              <SpriteButton
                title="Join Match"
                subtitle="Pick a nearby host"
                small
                onPress={() => {
                  void refreshLocalHosts();
                  setMultiplayerView("join");
                }}
              />
            </View>
          )}

          {multiplayerView === "host" && (
            <View style={styles.multiplayerPanel}>
              <View style={styles.multiplayerNavRow}>
                <Pressable
                  onPress={() => setMultiplayerView("choice")}
                  style={styles.multiplayerBackButton}
                >
                  <Text style={styles.multiplayerBackButtonText}>Back</Text>
                </Pressable>
              </View>
              <Text style={styles.inputLabel}>Player name</Text>
              <TextInput
                value={multiplayerName}
                onChangeText={updateProfileName}
                onEndEditing={commitProfileName}
                autoCapitalize="words"
                placeholder="Player 1"
                style={styles.input}
              />
              <Text style={styles.helperText}>
                This phone will run the local lobby. Keep it open and connected
                to Wi-Fi while other players join.
              </Text>
              <SpriteButton
                title={isStartingHost ? "Starting..." : "Start hosting"}
                small
                disabled={isStartingHost}
                onPress={hostLocalMatch}
              />
              {!!hostScanMessage && (
                <Text style={styles.helperText}>{hostScanMessage}</Text>
              )}
            </View>
          )}

          {multiplayerView === "join" && (
            <View style={styles.multiplayerPanel}>
              <View style={styles.multiplayerNavRow}>
                <Pressable
                  onPress={() => setMultiplayerView("choice")}
                  style={styles.multiplayerBackButton}
                >
                  <Text style={styles.multiplayerBackButtonText}>Back</Text>
                </Pressable>
              </View>
              <Text style={styles.inputLabel}>Host IP address</Text>
              <TextInput
                value={manualHostAddress}
                onChangeText={setManualHostAddress}
                keyboardType="numbers-and-punctuation"
                placeholder="192.168.1.25"
                style={styles.input}
              />
              <View style={styles.inlineActions}>
                <Pressable
                  onPress={() => void refreshLocalHosts()}
                  disabled={isScanningHosts}
                  style={styles.inlineButton}
                >
                  <Text style={styles.inlineButtonText}>
                    {isScanningHosts ? "Scanning..." : "Refresh"}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => joinLocalMatch(manualHostAddress)}
                  style={styles.inlineButtonPrimary}
                >
                  <Text style={styles.inlineButtonText}>Connect</Text>
                </Pressable>
              </View>

              <Text style={styles.helperText}>{hostScanMessage}</Text>

              {localHosts.length === 0 && !isScanningHosts && (
                <Text style={styles.emptyHostState}>
                  No hosts responded yet. Try the same Wi‑Fi network or hotspot,
                  then refresh again.
                </Text>
              )}

              {localHosts.map((host) => (
                <Pressable
                  key={host.id}
                  onPress={() => joinLocalMatch(host.address)}
                  style={styles.hostCard}
                >
                  <Text style={styles.hostName}>{host.name}</Text>
                  <Text style={styles.hostAddress}>{host.address}</Text>
                  <Text style={styles.hostStatus}>Status: {host.status}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </View>
    </View>
  );

  const renderProfileView = () => (
    <View style={styles.menuPage}>
      <View style={styles.subScreenShell}>
        <View style={styles.profileScreenCard}>
          <View style={styles.profileScreenHeader}>
            <View style={styles.profileScreenTitleGroup}>
              <Text style={styles.profileScreenKicker}>PLAYER PROFILE</Text>
              <Text style={styles.profileScreenTitle}>Make it yours</Text>
            </View>
            <View style={styles.profileSavedBadge}>
              <View style={styles.profileSavedDot} />
              <Text style={styles.profileSavedText}>SAVED ON THIS DEVICE</Text>
            </View>
          </View>

          <View style={styles.profileIdentityPanel}>
            <View
              style={[
                styles.profileAvatarLargeFrame,
                getProfileBorderStyle(profileBorder),
              ]}
            >
              <Image
                source={PROFILE_PICTURES[profilePicture]}
                style={styles.profileAvatarLarge}
                contentFit="cover"
                accessibilityLabel={`${profilePicture} profile picture`}
              />
              <ProfileBorderOverlay borderId={profileBorder} />
            </View>
            <View style={styles.profileNameEditor}>
              <Text style={styles.profileFieldLabel}>PLAYER NAME</Text>
              <TextInput
                value={profileName}
                onChangeText={updateProfileName}
                onEndEditing={commitProfileName}
                autoCapitalize="words"
                autoCorrect={false}
                maxLength={20}
                placeholder="Player 1"
                placeholderTextColor="#8ba89c"
                returnKeyType="done"
                selectTextOnFocus
                style={[styles.input, styles.profileNameInput]}
              />
              <Text style={styles.profileHint}>
                Used in solo and multiplayer games.
              </Text>
            </View>
          </View>

          <View
            accessible
            accessibilityLabel={`Level ${playerLevel.level}, ${playerLevel.xpIntoLevel} of ${playerLevel.xpForNextLevel} XP to next level`}
            style={styles.profileLevelPanel}
          >
            <View style={styles.profileLevelHeading}>
              <Text style={styles.profileLevelTitle}>PLAYER LEVEL</Text>
              <Text style={styles.profileLevelValue}>
                LVL {playerLevel.level}
              </Text>
            </View>
            <View style={styles.profileLevelProgressTrack}>
              <View
                style={[
                  styles.profileLevelProgressFill,
                  { width: `${playerLevel.progress * 100}%` },
                ]}
              />
            </View>
            <Text style={styles.profileLevelXpText}>
              {playerLevel.xpIntoLevel} / {playerLevel.xpForNextLevel} XP to
              next level
              <Text style={styles.profileLevelTotalXp}>
                {`  ·  ${playerLevel.totalXp} XP total`}
              </Text>
            </Text>
          </View>

          <View style={styles.profileTabs}>
            {(
              [
                { id: "picture", label: "PICTURE", icon: "▣" },
                { id: "border", label: "BORDER", icon: "◇" },
              ] as const
            ).map((tab) => (
              <Pressable
                key={tab.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: profileTab === tab.id }}
                onPress={() => setProfileTab(tab.id)}
                style={[
                  styles.profileTab,
                  profileTab === tab.id && styles.profileTabActive,
                ]}
              >
                <Text style={styles.profileTabIcon}>{tab.icon}</Text>
                <Text
                  style={[
                    styles.profileTabText,
                    profileTab === tab.id && styles.profileTabTextActive,
                  ]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.profileOptionsPanel}>
            {profileTab === "picture" ? (
              <View style={styles.profileOptionGrid}>
                {PROFILE_PICTURE_CHOICES.map((picture) => {
                  const isSelected = profilePicture === picture.id;
                  return (
                    <Pressable
                      key={picture.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${picture.name} profile picture`}
                      accessibilityState={{ selected: isSelected }}
                      onPress={() => setProfilePicture(picture.id)}
                      style={[
                        styles.profileOptionCard,
                        isSelected && styles.profileOptionCardSelected,
                      ]}
                    >
                      <View
                        style={[
                          styles.profileOptionImageFrame,
                          getProfileBorderStyle(profileBorder),
                        ]}
                      >
                        <Image
                          source={PROFILE_PICTURES[picture.id]}
                          style={styles.profileOptionImage}
                          contentFit="cover"
                        />
                        <ProfileBorderOverlay borderId={profileBorder} />
                      </View>
                      <Text style={styles.profileOptionName}>
                        {picture.name}
                      </Text>
                      {isSelected && (
                        <Text style={styles.profileSelectedLabel}>
                          SELECTED
                        </Text>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <View style={styles.profileOptionGrid}>
                {PROFILE_BORDERS.map((border) => {
                  const isSelected = profileBorder === border.id;
                  return (
                    <Pressable
                      key={border.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${border.name} profile border`}
                      accessibilityState={{ selected: isSelected }}
                      onPress={() => setProfileBorder(border.id)}
                      style={[
                        styles.profileOptionCard,
                        isSelected && styles.profileOptionCardSelected,
                      ]}
                    >
                      <View
                        style={[
                          styles.profileOptionImageFrame,
                          getProfileBorderStyle(border.id),
                        ]}
                      >
                        <Image
                          source={PROFILE_PICTURES[profilePicture]}
                          style={styles.profileOptionImage}
                          contentFit="cover"
                        />
                        <ProfileBorderOverlay borderId={border.id} />
                      </View>
                      <Text style={styles.profileOptionName}>
                        {border.name}
                      </Text>
                      {isSelected && (
                        <Text style={styles.profileSelectedLabel}>
                          SELECTED
                        </Text>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        </View>
      </View>
    </View>
  );

  const renderSettingsView = () => (
    <View style={styles.menuPage}>
      <View style={styles.subScreenShell}>
        <View style={styles.profileScreenCard}>
          <View style={styles.profileScreenHeader}>
            <View style={styles.profileScreenTitleGroup}>
              <Text style={styles.profileScreenKicker}>PREFERENCES</Text>
              <Text style={styles.profileScreenTitle}>Settings</Text>
            </View>
            <View style={styles.profileSavedBadge}>
              <View style={styles.profileSavedDot} />
              <Text style={styles.profileSavedText}>SAVED ON THIS DEVICE</Text>
            </View>
          </View>

          <View style={styles.settingsOptionsPanel}>
            <View style={styles.settingsOptionRow}>
              <View style={styles.settingsOptionCopy}>
                <Text style={styles.settingsOptionTitle}>Vibration</Text>
                <Text style={styles.settingsOptionDescription}>
                  Vibrate when your player takes damage during a match.
                </Text>
              </View>
              <Switch
                accessibilityLabel="Vibration on damage"
                accessibilityHint="Turns damage vibration on or off"
                value={vibrationEnabled}
                onValueChange={toggleVibration}
                trackColor={{ false: "#475569", true: "#16a34a" }}
                thumbColor={vibrationEnabled ? "#dcfce7" : "#e2e8f0"}
              />
            </View>
            <Text style={styles.settingsSavedHint}>
              {vibrationEnabled
                ? "Vibration is enabled"
                : "Vibration is disabled"}
            </Text>
          </View>

          <View style={styles.settingsOptionsPanel}>
            <View style={styles.settingsVolumeHeading}>
              <View style={styles.settingsOptionCopy}>
                <Text style={styles.settingsOptionTitle}>
                  Sound effects volume
                </Text>
                <Text style={styles.settingsOptionDescription}>
                  Set shooting and orb sound volume.
                </Text>
              </View>
              <Text style={styles.settingsVolumeValue}>
                {Math.round(soundEffectsVolume * 100)}%
              </Text>
            </View>
            <Slider
              accessibilityLabel="Sound effects volume"
              accessibilityValue={{
                min: 0,
                max: 100,
                now: Math.round(soundEffectsVolume * 100),
              }}
              minimumValue={0}
              maximumValue={1}
              step={0.01}
              value={soundEffectsVolume}
              onValueChange={changeSoundEffectsVolume}
              onSlidingComplete={(volume) =>
                void saveSoundEffectsVolume(volume).catch(() => undefined)
              }
              minimumTrackTintColor="#4ade80"
              maximumTrackTintColor="#334155"
              thumbTintColor="#dcfce7"
              style={styles.nativeVolumeSlider}
            />
            <View style={styles.settingsVolumeLabels}>
              <Text style={styles.settingsVolumeEndpoint}>OFF</Text>
              <Text style={styles.settingsVolumeEndpoint}>100%</Text>
            </View>
          </View>

          <View style={styles.settingsOptionsPanel}>
            <View style={styles.settingsVolumeHeading}>
              <View style={styles.settingsOptionCopy}>
                <Text style={styles.settingsOptionTitle}>Music volume</Text>
                <Text style={styles.settingsOptionDescription}>
                  Drag to adjust the music in menus and battles.
                </Text>
              </View>
              <Text style={styles.settingsVolumeValue}>
                {Math.round(musicVolume * 100)}%
              </Text>
            </View>
            <Slider
              accessibilityLabel="Music volume"
              accessibilityValue={{
                min: 0,
                max: 100,
                now: Math.round(musicVolume * 100),
              }}
              minimumValue={0}
              maximumValue={1}
              step={0.01}
              value={musicVolume}
              onValueChange={changeMusicVolume}
              onSlidingComplete={(volume) =>
                void saveMusicVolume(volume).catch(() => undefined)
              }
              minimumTrackTintColor="#4ade80"
              maximumTrackTintColor="#334155"
              thumbTintColor="#dcfce7"
              style={styles.nativeVolumeSlider}
            />
            <View style={styles.settingsVolumeLabels}>
              <Text style={styles.settingsVolumeEndpoint}>0%</Text>
              <Text style={styles.settingsVolumeEndpoint}>100%</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );

  const renderStoreView = () => (
    <View style={styles.menuPage}>
      <View style={styles.storeShell}>
        <View style={styles.storeHeader}>
          <View style={styles.storeTitleGroup}>
            <Text style={styles.storeKicker}>WILD PAW MARKET</Text>
            <Text style={styles.storeTitle}>Store</Text>
          </View>
          <CoinBalanceBadge balance={coinBalance} />
        </View>

        <View
          style={[
            styles.storeContentRow,
            viewportWidth < 700 && styles.storeContentColumn,
          ]}
        >
          {inventoryLoaded &&
            selectedStoreHero &&
            storeTab === "hero" &&
            (() => {
              const item = selectedStoreHero;
              const price = getHeroPricing(item.id);
              const isOwned = inventory.heroes.includes(item.id);
              const isPurchasing = purchasingItem === item.id;
              const cannotAfford = coinBalance < price.finalPrice;
              return (
                <View
                  style={[
                    styles.storeSelectedPreview,
                    viewportWidth < 700 && styles.storeSelectedPreviewCompact,
                  ]}
                >
                  <View style={styles.storePreviewImageColumn}>
                    <Image
                      source={getHeroImage(item.id)}
                      style={styles.storeSelectedImage}
                      contentFit="contain"
                      pointerEvents="none"
                      accessibilityLabel={`${item.name} hero preview`}
                    />
                    {isOwned && (
                      <View style={styles.storeOwnedBadge}>
                        <Text style={styles.storeOwnedBadgeText}>OWNED</Text>
                      </View>
                    )}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        storePreviewDetailsVisible
                          ? "Hide hero preview details"
                          : "Show hero preview details"
                      }
                      accessibilityState={{
                        expanded: storePreviewDetailsVisible,
                      }}
                      onPress={() =>
                        setStorePreviewDetailsVisible((visible) => !visible)
                      }
                      style={styles.storePreviewToggle}
                    >
                      <Image
                        source={
                          storePreviewDetailsVisible
                            ? previewMinimizeImage
                            : previewExpandImage
                        }
                        style={styles.storePreviewToggleImage}
                        contentFit="contain"
                      />
                    </Pressable>
                    <Text style={styles.storePreviewRarityBadge}>
                      {(item.rarity ?? "common").toUpperCase()}
                    </Text>
                    {storePreviewDetailsVisible && (
                      <View
                        style={[
                          styles.storeSelectedDetails,
                          isOwned
                            ? styles.storeSelectedDetailsOwned
                            : styles.storeSelectedDetailsAbovePurchase,
                        ]}
                      >
                        <Text style={styles.storePreviewTitle}>
                          {item.name}
                        </Text>
                        <Text style={styles.storeItemMeta}>
                          {item.type} hero
                        </Text>
                        <Text style={styles.storeItemDescription}>
                          {item.ability}
                        </Text>
                        <Text style={styles.storePreviewStats}>
                          POW {item.stats.power} · SPD {item.stats.speed} · DEF{" "}
                          {item.stats.defense}
                        </Text>
                      </View>
                    )}
                    {storePreviewDetailsVisible && !isOwned && (
                      <View style={styles.storePreviewPurchase}>
                        <View style={styles.storePreviewPurchaseDetails}>
                          {price.discountPercent > 0 && (
                            <View style={styles.storePriceRow}>
                              <Text style={styles.storeOriginalPrice}>
                                {price.price} coins
                              </Text>
                              <Text style={styles.storeDiscount}>
                                -{price.discountPercent}%
                              </Text>
                            </View>
                          )}
                          <Text style={styles.storePreviewPrice}>
                            {price.finalPrice} coins
                          </Text>
                        </View>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{
                            disabled: !!purchasingItem || cannotAfford,
                          }}
                          disabled={!!purchasingItem || cannotAfford}
                          onPress={() =>
                            void purchaseItem(
                              "hero",
                              item.id,
                              "",
                              price.finalPrice,
                            )
                          }
                          style={[
                            styles.storeBuyButton,
                            styles.storePreviewBuyButton,
                            cannotAfford && styles.storeBuyButtonDisabled,
                          ]}
                        >
                          <Text style={styles.storeBuyText}>
                            {isPurchasing
                              ? "Buying…"
                              : cannotAfford
                                ? "Not enough coins"
                                : "Buy hero"}
                          </Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                </View>
              );
            })()}

          {inventoryLoaded &&
            selectedStoreSkin &&
            storeTab === "skin" &&
            (() => {
              const { hero: itemHero, skin } = selectedStoreSkin;
              const price = selectedStoreSkin.price;
              const isOwned = inventory.skins.includes(
                selectedStoreSkin.inventoryId,
              );
              const ownsHero = inventory.heroes.includes(itemHero.id);
              const isPurchasing =
                purchasingItem === selectedStoreSkin.inventoryId;
              const cannotAfford = coinBalance < price.finalPrice;
              return (
                <View
                  style={[
                    styles.storeSelectedPreview,
                    viewportWidth < 700 && styles.storeSelectedPreviewCompact,
                  ]}
                >
                  <View style={styles.storePreviewImageColumn}>
                    <Image
                      source={getSkinImage(itemHero.id, skin.id)}
                      style={styles.storeSelectedImage}
                      contentFit="contain"
                      pointerEvents="none"
                      accessibilityLabel={`${skin.name} skin for ${itemHero.name}`}
                    />
                    {isOwned && (
                      <View style={styles.storeOwnedBadge}>
                        <Text style={styles.storeOwnedBadgeText}>OWNED</Text>
                      </View>
                    )}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        storePreviewDetailsVisible
                          ? "Hide skin preview details"
                          : "Show skin preview details"
                      }
                      accessibilityState={{
                        expanded: storePreviewDetailsVisible,
                      }}
                      onPress={() =>
                        setStorePreviewDetailsVisible((visible) => !visible)
                      }
                      style={styles.storePreviewToggle}
                    >
                      <Image
                        source={
                          storePreviewDetailsVisible
                            ? previewMinimizeImage
                            : previewExpandImage
                        }
                        style={styles.storePreviewToggleImage}
                        contentFit="contain"
                      />
                    </Pressable>
                    <Text style={styles.storePreviewRarityBadge}>
                      {(skin.rarity ?? "common").toUpperCase()}
                    </Text>
                    {storePreviewDetailsVisible && (
                      <View
                        style={[
                          styles.storeSelectedDetails,
                          isOwned
                            ? styles.storeSelectedDetailsOwned
                            : styles.storeSelectedDetailsAbovePurchase,
                        ]}
                      >
                        <Text style={styles.storePreviewTitle}>
                          {skin.name}
                        </Text>
                        <Text style={styles.storeItemMeta}>
                          {itemHero.name} · {itemHero.type}
                        </Text>
                      </View>
                    )}
                    {storePreviewDetailsVisible && !isOwned && (
                      <View style={styles.storePreviewPurchase}>
                        <View style={styles.storePreviewPurchaseDetails}>
                          {price.discountPercent > 0 && (
                            <View style={styles.storePriceRow}>
                              <Text style={styles.storeOriginalPrice}>
                                {price.price} coins
                              </Text>
                              <Text style={styles.storeDiscount}>
                                -{price.discountPercent}%
                              </Text>
                            </View>
                          )}
                          <Text style={styles.storePreviewPrice}>
                            {price.finalPrice} coins
                          </Text>
                          {!ownsHero && (
                            <Text style={styles.storeRequirementText}>
                              Unlock {itemHero.name} first to buy this skin.
                            </Text>
                          )}
                        </View>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{
                            disabled: !!purchasingItem || cannotAfford,
                          }}
                          disabled={!!purchasingItem || cannotAfford}
                          onPress={() =>
                            void purchaseItem(
                              "skin",
                              itemHero.id,
                              skin.id,
                              price.finalPrice,
                            )
                          }
                          style={[
                            styles.storeBuyButton,
                            styles.storePreviewBuyButton,
                            cannotAfford && styles.storeBuyButtonDisabled,
                          ]}
                        >
                          <Text style={styles.storeBuyText}>
                            {isPurchasing
                              ? "Buying…"
                              : cannotAfford
                                ? "Not enough coins"
                                : !ownsHero
                                  ? "Buy hero first"
                                  : "Buy skin"}
                          </Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                </View>
              );
            })()}

          {inventoryLoaded &&
            selectedStoreOrb &&
            storeTab === "orb" &&
            (() => {
              const orb = selectedStoreOrb;
              const isOwned = inventory.orbSkins.includes(orb.id);
              const isPurchasing = purchasingItem === orb.id;
              const cannotAfford = coinBalance < orb.price.finalPrice;
              return (
                <View
                  style={[
                    styles.storeSelectedPreview,
                    viewportWidth < 700 && styles.storeSelectedPreviewCompact,
                  ]}
                >
                  <View style={styles.storePreviewImageColumn}>
                    <Image
                      source={orb.orbImage}
                      style={styles.storeOrbPreviewImage}
                      contentFit="contain"
                      pointerEvents="none"
                      accessibilityLabel={`${orb.name} orb preview`}
                    />
                    <View
                      pointerEvents="none"
                      style={styles.storeOrbLaserInset}
                    >
                      <Text style={styles.storeOrbLaserLabel}>LASER</Text>
                      <Image
                        source={orb.laserImage}
                        style={styles.storeOrbLaserImage}
                        contentFit="contain"
                        accessibilityLabel={`${orb.name} laser preview`}
                      />
                    </View>
                    {isOwned && (
                      <View style={styles.storeOwnedBadge}>
                        <Text style={styles.storeOwnedBadgeText}>OWNED</Text>
                      </View>
                    )}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        storePreviewDetailsVisible
                          ? "Hide orb preview details"
                          : "Show orb preview details"
                      }
                      accessibilityState={{
                        expanded: storePreviewDetailsVisible,
                      }}
                      onPress={() =>
                        setStorePreviewDetailsVisible((visible) => !visible)
                      }
                      style={styles.storePreviewToggle}
                    >
                      <Image
                        source={
                          storePreviewDetailsVisible
                            ? previewMinimizeImage
                            : previewExpandImage
                        }
                        style={styles.storePreviewToggleImage}
                        contentFit="contain"
                      />
                    </Pressable>
                    <Text style={styles.storePreviewRarityBadge}>
                      <Text style={{ color: getOrbRarityColor(orb.rarity) }}>
                        {orb.rarity.toUpperCase()}
                      </Text>
                    </Text>
                    {storePreviewDetailsVisible && (
                      <View
                        style={[
                          styles.storeSelectedDetails,
                          isOwned
                            ? styles.storeSelectedDetailsOwned
                            : styles.storeSelectedDetailsAbovePurchase,
                        ]}
                      >
                        <Text style={styles.storePreviewTitle}>{orb.name}</Text>
                        <Text style={styles.storeItemMeta}>
                          Orb companion skin
                        </Text>
                      </View>
                    )}
                    {storePreviewDetailsVisible && !isOwned && (
                      <View style={styles.storePreviewPurchase}>
                        <View style={styles.storePreviewPurchaseDetails}>
                          {orb.price.discountPercent > 0 && (
                            <View style={styles.storePriceRow}>
                              <Text style={styles.storeOriginalPrice}>
                                {orb.price.price} coins
                              </Text>
                              <Text style={styles.storeDiscount}>
                                -{orb.price.discountPercent}%
                              </Text>
                            </View>
                          )}
                          <Text style={styles.storePreviewPrice}>
                            {orb.price.finalPrice} coins
                          </Text>
                        </View>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{
                            disabled: !!purchasingItem || cannotAfford,
                          }}
                          disabled={!!purchasingItem || cannotAfford}
                          onPress={() =>
                            void purchaseItem(
                              "orb",
                              "",
                              orb.id,
                              orb.price.finalPrice,
                            )
                          }
                          style={[
                            styles.storeBuyButton,
                            styles.storePreviewBuyButton,
                            cannotAfford && styles.storeBuyButtonDisabled,
                          ]}
                        >
                          <Text style={styles.storeBuyText}>
                            {isPurchasing
                              ? "Buying…"
                              : cannotAfford
                                ? "Not enough coins"
                                : "Buy orb"}
                          </Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                </View>
              );
            })()}

          {inventoryLoaded &&
            selectedStoreBuddy &&
            storeTab === "buddy" &&
            (() => {
              const buddy = selectedStoreBuddy;
              const isOwned = inventory.buddies.includes(buddy.id);
              const isPurchasing = purchasingItem === buddy.id;
              const isLocked = playerLevel.level < 10;
              const cannotAfford = coinBalance < buddy.price.finalPrice;
              return (
                <View
                  style={[
                    styles.storeSelectedPreview,
                    viewportWidth < 700 && styles.storeSelectedPreviewCompact,
                  ]}
                >
                  <View style={styles.storePreviewImageColumn}>
                    <Image
                      source={buddy.source}
                      style={styles.storeBuddyPreviewImage}
                      contentFit="contain"
                      accessibilityLabel={`${buddy.name} buddy preview`}
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        storePreviewDetailsVisible
                          ? "Hide buddy preview details"
                          : "Show buddy preview details"
                      }
                      accessibilityState={{
                        expanded: storePreviewDetailsVisible,
                      }}
                      onPress={() =>
                        setStorePreviewDetailsVisible((visible) => !visible)
                      }
                      style={styles.storePreviewToggle}
                    >
                      <Image
                        source={
                          storePreviewDetailsVisible
                            ? previewMinimizeImage
                            : previewExpandImage
                        }
                        style={styles.storePreviewToggleImage}
                        contentFit="contain"
                      />
                    </Pressable>
                    {isOwned && (
                      <View style={styles.storeOwnedBadge}>
                        <Text style={styles.storeOwnedBadgeText}>OWNED</Text>
                      </View>
                    )}
                    <Text style={styles.storePreviewRarityBadge}>
                      <Text
                        style={{ color: getBuddyRarityColor(buddy.rarity) }}
                      >
                        {buddy.rarity.toUpperCase()}
                      </Text>
                    </Text>
                    {storePreviewDetailsVisible && (
                      <View
                        style={[
                          styles.storeSelectedDetails,
                          isOwned
                            ? styles.storeSelectedDetailsOwned
                            : styles.storeSelectedDetailsAbovePurchase,
                        ]}
                      >
                        <Text style={styles.storePreviewTitle}>
                          {buddy.name}
                        </Text>
                        <Text style={styles.storeItemMeta}>
                          {getBuddyBonusSummary(buddy)}
                        </Text>
                      </View>
                    )}
                    {storePreviewDetailsVisible && !isOwned && (
                      <View style={styles.storePreviewPurchase}>
                        <View style={styles.storePreviewPurchaseDetails}>
                          {buddy.price.discountPercent > 0 && (
                            <View style={styles.storePriceRow}>
                              <Text style={styles.storeOriginalPrice}>
                                {buddy.price.price} coins
                              </Text>
                              <Text style={styles.storeDiscount}>
                                -{buddy.price.discountPercent}%
                              </Text>
                            </View>
                          )}
                          <Text style={styles.storePreviewPrice}>
                            {buddy.price.finalPrice} coins
                          </Text>
                        </View>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{
                            disabled:
                              isLocked || !!purchasingItem || cannotAfford,
                          }}
                          disabled={
                            isLocked || !!purchasingItem || cannotAfford
                          }
                          onPress={() =>
                            void purchaseItem(
                              "buddy",
                              buddy.id,
                              buddy.id,
                              buddy.price.finalPrice,
                            )
                          }
                          style={[
                            styles.storeBuyButton,
                            styles.storePreviewBuyButton,
                            (isLocked || cannotAfford) &&
                              styles.storeBuyButtonDisabled,
                          ]}
                        >
                          <Text style={styles.storeBuyText}>
                            {isLocked
                              ? "Unlocks at level 10"
                              : isPurchasing
                                ? "Buying…"
                                : cannotAfford
                                  ? "Not enough coins"
                                  : "Buy buddy"}
                          </Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                </View>
              );
            })()}

          <ScrollView
            style={styles.storeScroll}
            contentContainerStyle={styles.storeGrid}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.storeGalleryToolbar}>
              <View style={styles.storeGalleryToolbarSpacer} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Filter store items"
                accessibilityState={{ expanded: storeFiltersOpen }}
                onPress={() => {
                  setStoreFiltersOpen((previous) => !previous);
                  setStoreSortOpen(false);
                }}
                style={styles.storeToolbarButton}
              >
                <Text style={styles.storeToolbarButtonText}>Filter⌄</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sort store items"
                accessibilityState={{ expanded: storeSortOpen }}
                onPress={() => {
                  setStoreSortOpen((previous) => !previous);
                  setStoreFiltersOpen(false);
                }}
                style={styles.storeToolbarButton}
              >
                <Text style={styles.storeToolbarButtonText}>Sort⌄</Text>
              </Pressable>
            </View>

            {storeFiltersOpen && (
              <View style={styles.storeFilterDropdown}>
                <View style={styles.storeFilterDropdownRow}>
                  <Text style={styles.storeFilterLabel}>RARITY</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.storeDropdownOptions}
                  >
                    {[
                      { id: "all" as const, label: "All" },
                      ...ITEM_RARITIES.map((rarity) => ({
                        id: rarity,
                        label: rarity.charAt(0).toUpperCase() + rarity.slice(1),
                      })),
                    ].map((filter) => {
                      const isActive = storeRarityFilter === filter.id;
                      return (
                        <Pressable
                          key={filter.id}
                          accessibilityRole="button"
                          accessibilityState={{ selected: isActive }}
                          onPress={() => setStoreRarityFilter(filter.id)}
                          style={[
                            styles.storeFilterChip,
                            isActive && styles.storeFilterChipActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.storeFilterChipText,
                              isActive && styles.storeFilterChipTextActive,
                            ]}
                          >
                            {filter.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
                {storeTab === "skin" && (
                  <>
                    <View style={styles.storeFilterDropdownRow}>
                      <Text style={styles.storeFilterLabel}>HERO</Text>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.storeDropdownOptions}
                      >
                        {[{ id: "all", name: "All" }, ...heroes].map(
                          (filter) => {
                            const isActive = storeHeroFilter === filter.id;
                            return (
                              <Pressable
                                key={filter.id}
                                accessibilityRole="button"
                                accessibilityState={{ selected: isActive }}
                                onPress={() => setStoreHeroFilter(filter.id)}
                                style={[
                                  styles.storeFilterChip,
                                  isActive && styles.storeFilterChipActive,
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.storeFilterChipText,
                                    isActive &&
                                      styles.storeFilterChipTextActive,
                                  ]}
                                >
                                  {filter.name}
                                </Text>
                              </Pressable>
                            );
                          },
                        )}
                      </ScrollView>
                    </View>
                  </>
                )}
                {(storeTab === "skin" ||
                  storeTab === "orb" ||
                  storeTab === "buddy") && (
                  <View style={styles.storeFilterDropdownRow}>
                    <Text style={styles.storeFilterLabel}>SHOW</Text>
                    <View style={styles.storeDropdownOptions}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected: storeOwnedOnly }}
                        onPress={() =>
                          setStoreOwnedOnly((previous) => !previous)
                        }
                        style={[
                          styles.storeFilterChip,
                          storeOwnedOnly && styles.storeFilterChipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.storeFilterChipText,
                            storeOwnedOnly && styles.storeFilterChipTextActive,
                          ]}
                        >
                          {storeOwnedOnly ? "Owned only ✓" : "Owned only"}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              </View>
            )}

            {storeSortOpen && (
              <View style={styles.storeSortDropdown}>
                {(
                  [
                    { id: "featured", label: "Featured" },
                    { id: "low-to-high", label: "Price ↑" },
                    { id: "high-to-low", label: "Price ↓" },
                  ] as const
                ).map((sortOption) => {
                  const isActive = storePriceSort === sortOption.id;
                  return (
                    <Pressable
                      key={sortOption.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isActive }}
                      onPress={() => {
                        setStorePriceSort(sortOption.id);
                        setStoreSortOpen(false);
                      }}
                      style={[
                        styles.storeFilterChip,
                        isActive && styles.storeFilterChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.storeFilterChipText,
                          isActive && styles.storeFilterChipTextActive,
                        ]}
                      >
                        {sortOption.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {!!storeMessage && (
              <Text style={styles.storeMessage}>{storeMessage}</Text>
            )}
            {!inventoryLoaded ? (
              <Text style={styles.storeEmptyText}>
                Loading your collection…
              </Text>
            ) : storeTab === "hero" ? (
              storeHeroes.length === 0 ? (
                <Text style={styles.storeEmptyText}>
                  No heroes match this rarity.
                </Text>
              ) : (
                storeHeroes.map((entry) => {
                  const itemId = `hero:${entry.id}`;
                  const isSelected = resolvedStoreSelectedItemId === itemId;
                  const isOwned = inventory.heroes.includes(entry.id);
                  const heroPrice = getHeroPricing(entry.id);
                  return (
                    <View
                      key={entry.id}
                      style={[styles.storeCardWrapper, storeCardWidthStyle]}
                    >
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Preview ${entry.name} hero, ${isOwned ? "owned" : `${heroPrice.finalPrice} coins`}`}
                        accessibilityState={{ selected: !!isSelected }}
                        onPress={() => {
                          setStoreSelectedItemId(itemId);
                          setStoreMessage("");
                        }}
                        style={[
                          styles.storeItemCard,
                          isSelected && styles.storeItemCardSelected,
                        ]}
                      >
                        <Image
                          source={getRarityCardImage(entry.rarity)}
                          style={styles.storeCardBackground}
                          contentFit="fill"
                          pointerEvents="none"
                        />
                        <Image
                          source={getHeroImage(entry.id)}
                          style={styles.storeCatalogImage}
                          contentFit="contain"
                          pointerEvents="none"
                        />
                        <View style={styles.storeCatalogLabel}>
                          <Text
                            numberOfLines={1}
                            style={styles.storeCatalogName}
                          >
                            {entry.name}
                          </Text>
                          <Text
                            numberOfLines={1}
                            style={styles.storeCatalogRarity}
                          >
                            {(entry.rarity ?? "common").toUpperCase()}
                          </Text>
                          {!isOwned && (
                            <View style={styles.storeCatalogPriceRow}>
                              <Text
                                numberOfLines={1}
                                style={styles.storeCatalogPrice}
                              >
                                {heroPrice.finalPrice} coins
                              </Text>
                              {heroPrice.discountPercent > 0 && (
                                <Text
                                  numberOfLines={1}
                                  style={styles.storeCatalogOriginalPrice}
                                >
                                  {heroPrice.price}
                                </Text>
                              )}
                            </View>
                          )}
                        </View>
                      </Pressable>
                      {isOwned && (
                        <View
                          pointerEvents="none"
                          style={styles.storeOwnedListBadge}
                        >
                          <Text style={styles.storeOwnedBadgeText}>OWNED</Text>
                        </View>
                      )}
                      {heroPrice.discountPercent > 0 && !isOwned && (
                        <View
                          pointerEvents="none"
                          style={styles.storeSaleBadge}
                        >
                          <Text style={styles.storeSaleBadgeText}>SALE</Text>
                        </View>
                      )}
                    </View>
                  );
                })
              )
            ) : storeTab === "skin" && storeSkins.length === 0 ? (
              <Text style={styles.storeEmptyText}>
                {storeOwnedOnly
                  ? "No owned skins match these filters."
                  : "No skins match this hero type."}
              </Text>
            ) : storeTab === "skin" ? (
              storeSkins.map(({ hero: entry, skin, inventoryId, price }) => {
                const itemId = `skin:${inventoryId}`;
                const isSelected = resolvedStoreSelectedItemId === itemId;
                const isOwned = inventory.skins.includes(inventoryId);
                return (
                  <View
                    key={inventoryId}
                    style={[styles.storeCardWrapper, storeCardWidthStyle]}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Preview ${skin.name} skin for ${entry.name}, ${isOwned ? "owned" : `${price.finalPrice} coins`}`}
                      accessibilityState={{ selected: !!isSelected }}
                      onPress={() => {
                        setStoreSelectedItemId(itemId);
                        setStoreMessage("");
                      }}
                      style={[
                        styles.storeItemCard,
                        isSelected && styles.storeItemCardSelected,
                      ]}
                    >
                      <Image
                        source={getRarityCardImage(skin.rarity)}
                        style={styles.storeCardBackground}
                        contentFit="fill"
                        pointerEvents="none"
                      />
                      <Image
                        source={getSkinImage(entry.id, skin.id)}
                        style={styles.storeCatalogImage}
                        contentFit="contain"
                        pointerEvents="none"
                      />
                      <View style={styles.storeCatalogLabel}>
                        <Text numberOfLines={1} style={styles.storeCatalogName}>
                          {skin.name}
                        </Text>
                        <Text
                          numberOfLines={1}
                          style={styles.storeCatalogRarity}
                        >
                          {(skin.rarity ?? "common").toUpperCase()}
                        </Text>
                        {!isOwned && (
                          <View style={styles.storeCatalogPriceRow}>
                            <Text
                              numberOfLines={1}
                              style={styles.storeCatalogPrice}
                            >
                              {price.finalPrice} coins
                            </Text>
                            {price.discountPercent > 0 && (
                              <Text
                                numberOfLines={1}
                                style={styles.storeCatalogOriginalPrice}
                              >
                                {price.price}
                              </Text>
                            )}
                          </View>
                        )}
                      </View>
                    </Pressable>
                    {isOwned && (
                      <View
                        pointerEvents="none"
                        style={styles.storeOwnedListBadge}
                      >
                        <Text style={styles.storeOwnedBadgeText}>OWNED</Text>
                      </View>
                    )}
                    {price.discountPercent > 0 && !isOwned && (
                      <View pointerEvents="none" style={styles.storeSaleBadge}>
                        <Text style={styles.storeSaleBadgeText}>SALE</Text>
                      </View>
                    )}
                  </View>
                );
              })
            ) : storeTab === "buddy" && storeBuddies.length === 0 ? (
              <Text style={styles.storeEmptyText}>
                {storeOwnedOnly
                  ? "No owned buddies match this rarity."
                  : "No buddies match this rarity."}
              </Text>
            ) : storeTab === "buddy" ? (
              storeBuddies.map((buddy) => {
                const itemId = `buddy:${buddy.id}`;
                const isSelected = resolvedStoreSelectedItemId === itemId;
                const isOwned = inventory.buddies.includes(buddy.id);
                return (
                  <View
                    key={buddy.id}
                    style={[styles.storeCardWrapper, storeCardWidthStyle]}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Preview ${buddy.name}, ${buddy.rarity} rarity, ${isOwned ? "owned" : `${buddy.price.finalPrice} coins`}`}
                      accessibilityState={{ selected: isSelected }}
                      onPress={() => {
                        setStoreSelectedItemId(itemId);
                        setStoreMessage("");
                      }}
                      style={[
                        styles.storeItemCard,
                        isSelected && styles.storeItemCardSelected,
                      ]}
                    >
                      <Image
                        source={getRarityCardImage(buddy.rarity)}
                        style={styles.storeCardBackground}
                        contentFit="fill"
                        pointerEvents="none"
                      />
                      <Image
                        source={buddy.source}
                        style={styles.storeBuddyCatalogImage}
                        contentFit="contain"
                        pointerEvents="none"
                      />
                      <View style={styles.storeCatalogLabel}>
                        <Text numberOfLines={1} style={styles.storeCatalogName}>
                          {buddy.name}
                        </Text>
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.storeCatalogRarity,
                            { color: getBuddyRarityColor(buddy.rarity) },
                          ]}
                        >
                          {buddy.rarity.toUpperCase()}
                        </Text>
                        {!isOwned && (
                          <View style={styles.storeCatalogPriceRow}>
                            <Text
                              numberOfLines={1}
                              style={styles.storeCatalogPrice}
                            >
                              {playerLevel.level < 10
                                ? "LEVEL 10"
                                : `${buddy.price.finalPrice} coins`}
                            </Text>
                          </View>
                        )}
                      </View>
                    </Pressable>
                    {isOwned && (
                      <View
                        pointerEvents="none"
                        style={styles.storeOwnedListBadge}
                      >
                        <Text style={styles.storeOwnedBadgeText}>OWNED</Text>
                      </View>
                    )}
                  </View>
                );
              })
            ) : storeOrbs.length === 0 ? (
              <Text style={styles.storeEmptyText}>
                {storeOwnedOnly
                  ? "No owned orb skins match these filters."
                  : "No orb skins match this rarity."}
              </Text>
            ) : (
              storeOrbs.map((orb) => {
                const itemId = `orb:${orb.id}`;
                const isSelected = resolvedStoreSelectedItemId === itemId;
                const isOwned = inventory.orbSkins.includes(orb.id);
                return (
                  <View
                    key={orb.id}
                    style={[styles.storeCardWrapper, storeCardWidthStyle]}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Preview ${orb.name} orb skin, ${isOwned ? "owned" : `${orb.price.finalPrice} coins`}`}
                      accessibilityState={{ selected: isSelected }}
                      onPress={() => {
                        setStoreSelectedItemId(itemId);
                        setStoreMessage("");
                      }}
                      style={[
                        styles.storeItemCard,
                        isSelected && styles.storeItemCardSelected,
                      ]}
                    >
                      <Image
                        source={getRarityCardImage(orb.rarity)}
                        style={styles.storeCardBackground}
                        contentFit="fill"
                        pointerEvents="none"
                      />
                      <Image
                        source={orb.orbImage}
                        style={styles.storeOrbCatalogImage}
                        contentFit="contain"
                        pointerEvents="none"
                      />
                      <View style={styles.storeCatalogLabel}>
                        <Text numberOfLines={1} style={styles.storeCatalogName}>
                          {orb.name}
                        </Text>
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.storeCatalogRarity,
                            { color: getOrbRarityColor(orb.rarity) },
                          ]}
                        >
                          {orb.rarity.toUpperCase()}
                        </Text>
                        {!isOwned && (
                          <View style={styles.storeCatalogPriceRow}>
                            <Text
                              numberOfLines={1}
                              style={styles.storeCatalogPrice}
                            >
                              {orb.price.finalPrice} coins
                            </Text>
                            {orb.price.discountPercent > 0 && (
                              <Text
                                numberOfLines={1}
                                style={styles.storeCatalogOriginalPrice}
                              >
                                {orb.price.price}
                              </Text>
                            )}
                          </View>
                        )}
                      </View>
                    </Pressable>
                    {isOwned && (
                      <View
                        pointerEvents="none"
                        style={styles.storeOwnedListBadge}
                      >
                        <Text style={styles.storeOwnedBadgeText}>OWNED</Text>
                      </View>
                    )}
                    {orb.price.discountPercent > 0 && !isOwned && (
                      <View pointerEvents="none" style={styles.storeSaleBadge}>
                        <Text style={styles.storeSaleBadgeText}>SALE</Text>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </ScrollView>
          <View style={styles.storeSideTabs}>
            {(
              [
                {
                  id: "hero",
                  label: "Hero",
                  image: storeHeroTabImage,
                },
                {
                  id: "skin",
                  label: "Skin",
                  image: storeSkinTabImage,
                },
                {
                  id: "orb",
                  label: "Orb",
                  image: storeOrbTabImage,
                },
                {
                  id: "buddy",
                  label: "Buddy",
                  image: storeBuddyTabImage,
                },
              ] as const
            ).map((tab) => (
              <Pressable
                key={tab.id}
                accessibilityRole="tab"
                accessibilityLabel={`${tab.label} store items`}
                accessibilityState={{ selected: storeTab === tab.id }}
                onPress={() => {
                  setStoreTab(tab.id);
                  setStoreSelectedItemId("");
                  setStoreMessage("");
                }}
                style={[
                  styles.storeSideTab,
                  storeTab === tab.id && styles.storeSideTabActive,
                ]}
              >
                <Image
                  source={tab.image}
                  style={styles.storeSideTabImage}
                  contentFit="contain"
                  accessibilityLabel={`${tab.label} icon`}
                />
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </View>
  );

  const renderHeroSelector = () => (
    <View style={styles.menuPage}>
      <View style={styles.appShell}>
        <View style={styles.headerRow}>
          <View />
          <View style={styles.heroHeaderRight}>
            <CoinBalanceBadge balance={coinBalance} />
          </View>
        </View>

        <View style={styles.selectorRow}>
          <View style={styles.previewPanel}>
            <View style={styles.heroPictureColumn}>
              <Animated.View
                style={[
                  styles.heroPreview,
                  { backgroundColor: selectedSkin.color },
                  { transform: [{ scale: previewScale }] },
                ]}
              >
                {renderHeroArtwork(
                  getSkinImage(hero.id, selectedSkin.id)!,
                  116,
                  28,
                )}
              </Animated.View>
            </View>

            <View style={styles.heroDetailsColumn}>
              <View style={styles.previewHeader}>
                <Text style={styles.previewKicker}>Selected Hero</Text>
                <Text style={styles.previewName}>{hero.name}</Text>
                <Text style={[styles.roleLabel, { color: hero.accent }]}>
                  {hero.type}
                </Text>
              </View>

              <View style={styles.statRow}>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Power</Text>
                  <Text style={styles.statValue}>{hero.stats.power}</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Speed</Text>
                  <Text style={styles.statValue}>{hero.stats.speed}</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Defense</Text>
                  <Text style={styles.statValue}>{hero.stats.defense}</Text>
                </View>
              </View>

              <View style={styles.abilityBox}>
                <Text style={styles.abilityTitle}>Ability</Text>
                <Text style={styles.abilityText}>{hero.ability}</Text>
              </View>
            </View>
          </View>

          <View style={styles.selectionPanel}>
            <View style={styles.selectionTabs}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Show heroes"
                accessibilityState={{ selected: selectionTab === "hero" }}
                onPress={() => setSelectionTab("hero")}
                style={[
                  styles.selectionTab,
                  selectionTab === "hero" && styles.selectionTabActive,
                ]}
              >
                <Text style={styles.selectionTabIcon}>🐾</Text>
                <Text
                  style={[
                    styles.selectionTabText,
                    selectionTab === "hero" && styles.selectionTabTextActive,
                  ]}
                >
                  Hero
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Show skins for selected hero"
                accessibilityState={{ selected: selectionTab === "skin" }}
                onPress={() => setSelectionTab("skin")}
                style={[
                  styles.selectionTab,
                  selectionTab === "skin" && styles.selectionTabActive,
                ]}
              >
                <Text style={styles.selectionTabIcon}>🎨</Text>
                <Text
                  style={[
                    styles.selectionTabText,
                    selectionTab === "skin" && styles.selectionTabTextActive,
                  ]}
                >
                  Skin
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Show orb companion"
                accessibilityState={{ selected: selectionTab === "orb" }}
                onPress={() => setSelectionTab("orb")}
                style={[
                  styles.selectionTab,
                  selectionTab === "orb" && styles.selectionTabActive,
                ]}
              >
                <Text style={styles.selectionTabIcon}>✦</Text>
                <Text
                  style={[
                    styles.selectionTabText,
                    selectionTab === "orb" && styles.selectionTabTextActive,
                  ]}
                >
                  Orb
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Show buddy companions"
                accessibilityState={{ selected: selectionTab === "buddy" }}
                onPress={() => setSelectionTab("buddy")}
                style={[
                  styles.selectionTab,
                  selectionTab === "buddy" && styles.selectionTabActive,
                ]}
              >
                <Text style={styles.selectionTabIcon}>🐾</Text>
                <Text
                  style={[
                    styles.selectionTabText,
                    selectionTab === "buddy" && styles.selectionTabTextActive,
                  ]}
                >
                  Buddy
                </Text>
              </Pressable>
            </View>
            <ScrollView
              style={styles.selectionScroll}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.selectionGrid}
            >
              {!inventoryLoaded ? (
                <Text style={styles.storeEmptyText}>
                  Loading your collection…
                </Text>
              ) : selectionTab === "hero" ? (
                ownedHeroes.map((entry) => {
                  const isSelected = selectedHero === entry.id;
                  return (
                    <Pressable
                      key={entry.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      onPress={() => setSelectedHero(entry.id)}
                      style={[
                        styles.selectionCard,
                        isSelected && styles.selectionCardSelected,
                        {
                          borderColor: isSelected ? entry.accent : "#315c4c",
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.selectionArtwork,
                          { backgroundColor: entry.accent },
                        ]}
                      >
                        {renderHeroArtwork(getHeroImage(entry.id)!, 44, 14)}
                      </View>
                      <Text style={styles.selectionName}>{entry.name}</Text>
                    </Pressable>
                  );
                })
              ) : selectionTab === "skin" && ownedSkins.length === 0 ? (
                <Text style={styles.storeEmptyText}>
                  No skins owned yet. Visit the store to find one.
                </Text>
              ) : selectionTab === "skin" ? (
                ownedSkins.map((skin) => {
                  const isSelected = selectedSkin.id === skin.id;
                  return (
                    <Pressable
                      key={skin.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${isSelected ? "Unequip" : "Equip"} ${skin.name} skin`}
                      accessibilityState={{ selected: isSelected }}
                      onPress={() => selectSkin(skin.id)}
                      style={[
                        styles.selectionCard,
                        isSelected && styles.selectionCardSelected,
                        {
                          borderColor: isSelected ? skin.color : "#315c4c",
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.selectionArtwork,
                          { backgroundColor: skin.color },
                        ]}
                      >
                        {renderHeroArtwork(
                          getSkinImage(hero.id, skin.id)!,
                          44,
                          14,
                        )}
                      </View>
                      <Text style={styles.selectionName}>{skin.name}</Text>
                      <Text
                        style={[
                          styles.skinEquipStatus,
                          isSelected && styles.skinEquipStatusEquipped,
                        ]}
                      >
                        {isSelected ? "EQUIPPED" : "EQUIP"}
                      </Text>
                    </Pressable>
                  );
                })
              ) : selectionTab === "orb" ? (
                <View style={styles.selectionOrbContent}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      playerLevel.level < 5
                        ? "Orb locked until level 5"
                        : inventory.equippedOrb
                          ? "Unequip orb"
                          : "Equip orb"
                    }
                    accessibilityState={{
                      disabled: playerLevel.level < 5 || !inventoryLoaded,
                      selected: inventory.equippedOrb,
                    }}
                    disabled={playerLevel.level < 5 || !inventoryLoaded}
                    onPress={() => void toggleOrbEquipment()}
                    style={[
                      styles.selectionCard,
                      styles.selectionOrbCard,
                      inventory.equippedOrb && styles.selectionCardSelected,
                      (playerLevel.level < 5 || !inventoryLoaded) &&
                        styles.selectionOrbCardLocked,
                    ]}
                  >
                    <Image
                      source={orbImage}
                      style={styles.selectionOrbImage}
                      contentFit="contain"
                      accessibilityLabel="Orb companion"
                    />
                    <Text style={styles.selectionName}>Orb companion</Text>
                    <Text
                      style={[
                        styles.skinEquipStatus,
                        inventory.equippedOrb && styles.skinEquipStatusEquipped,
                      ]}
                    >
                      {playerLevel.level < 5
                        ? "UNLOCKS AT LEVEL 5"
                        : inventory.equippedOrb
                          ? "EQUIPPED · TAP TO UNEQUIP"
                          : "UNLOCKED · TAP TO EQUIP"}
                    </Text>
                  </Pressable>
                  <Text style={styles.selectionOrbSectionTitle}>
                    OWNED ORB SKINS
                  </Text>
                  <View style={styles.selectionOrbSkinList}>
                    {ORB_SKINS.filter((orb) =>
                      inventory.orbSkins.includes(orb.id),
                    ).map((orb) => {
                      const isSelected = inventory.equippedOrbSkin === orb.id;
                      return (
                        <Pressable
                          key={orb.id}
                          accessibilityRole="button"
                          accessibilityLabel={`${isSelected ? "Equipped" : "Equip"} ${orb.name}`}
                          accessibilityState={{
                            disabled: playerLevel.level < 5,
                            selected: isSelected,
                          }}
                          disabled={playerLevel.level < 5}
                          onPress={() => void equipOrbSkin(orb.id)}
                          style={[
                            styles.selectionOrbSkinCard,
                            isSelected && styles.selectionCardSelected,
                            playerLevel.level < 5 &&
                              styles.selectionOrbCardLocked,
                          ]}
                        >
                          <Image
                            source={orb.orbImage}
                            style={styles.selectionOrbSkinImage}
                            contentFit="contain"
                            accessibilityLabel={orb.name}
                          />
                          <Text
                            numberOfLines={1}
                            style={styles.selectionOrbSkinName}
                          >
                            {orb.name}
                          </Text>
                          <Text
                            style={[
                              styles.selectionOrbSkinRarity,
                              { color: getOrbRarityColor(orb.rarity) },
                            ]}
                          >
                            {orb.rarity.toUpperCase()}
                          </Text>
                          <Text
                            style={[
                              styles.skinEquipStatus,
                              isSelected && styles.skinEquipStatusEquipped,
                            ]}
                          >
                            {isSelected ? "EQUIPPED" : "EQUIP"}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Text style={styles.selectionOrbDescription}>
                    Automatically targets nearby enemies and fires a laser.
                  </Text>
                  {!!orbMessage && (
                    <Text style={styles.orbStatusMessage}>{orbMessage}</Text>
                  )}
                </View>
              ) : (
                <View style={styles.selectionBuddyContent}>
                  <Text style={styles.selectionOrbSectionTitle}>
                    {playerLevel.level < 10
                      ? "BUDDY SYSTEM · UNLOCKS AT LEVEL 10"
                      : "YOUR BUDDIES · EQUIP ONE"}
                  </Text>
                  {playerLevel.level < 10 ? (
                    <Text style={styles.selectionOrbDescription}>
                      Reach player level 10 to unlock buddies and their
                      permanent powers.
                    </Text>
                  ) : inventory.buddies.length === 0 ? (
                    <View style={styles.selectionBuddyEmpty}>
                      <Text style={styles.selectionOrbDescription}>
                        No buddies owned yet. Visit the store to find a little
                        companion.
                      </Text>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => {
                          setStoreTab("buddy");
                          setStoreSelectedItemId("");
                          setStoreMessage("");
                          setScreen("store");
                        }}
                        style={styles.storeBuyButton}
                      >
                        <Text style={styles.storeBuyText}>
                          VISIT BUDDY STORE
                        </Text>
                      </Pressable>
                    </View>
                  ) : (
                    <View style={styles.selectionBuddyGrid}>
                      {inventory.buddies.map((buddyId) => {
                        const buddy = getBuddy(buddyId);
                        if (!buddy) return null;
                        const isEquipped = inventory.equippedBuddy === buddy.id;
                        return (
                          <Pressable
                            key={buddy.id}
                            accessibilityRole="button"
                            accessibilityLabel={`${isEquipped ? "Unequip" : "Equip"} ${buddy.name}; ${getBuddyBonusSummary(buddy)}`}
                            accessibilityState={{ selected: isEquipped }}
                            onPress={() => void equipBuddy(buddy.id)}
                            style={[
                              styles.selectionCard,
                              styles.selectionBuddyCard,
                              isEquipped && styles.selectionCardSelected,
                            ]}
                          >
                            <Image
                              source={buddy.source}
                              style={styles.selectionBuddyImage}
                              contentFit="contain"
                              accessibilityLabel={buddy.name}
                            />
                            <Text
                              numberOfLines={1}
                              style={styles.selectionName}
                            >
                              {buddy.name}
                            </Text>
                            <Text
                              style={[
                                styles.selectionBuddyRarity,
                                { color: getBuddyRarityColor(buddy.rarity) },
                              ]}
                            >
                              {buddy.rarity.toUpperCase()}
                            </Text>
                            <Text
                              style={[
                                styles.skinEquipStatus,
                                isEquipped && styles.skinEquipStatusEquipped,
                              ]}
                            >
                              {isEquipped ? "EQUIPPED" : "EQUIP"}
                            </Text>
                            <Text
                              numberOfLines={2}
                              style={styles.selectionBuddyBonus}
                            >
                              {getBuddyBonusSummary(buddy)}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                  {!!buddyMessage && (
                    <Text style={styles.orbStatusMessage}>{buddyMessage}</Text>
                  )}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <Image
        source={menuBackground}
        style={styles.menuBackground}
        contentFit="cover"
        pointerEvents="none"
      />
      {screen === "main"
        ? renderMainMenu()
        : screen === "play"
          ? renderPlaySelector()
          : screen === "multiplayer"
            ? renderMultiplayerMenu()
            : screen === "profile"
              ? renderProfileView()
              : screen === "settings"
                ? renderSettingsView()
                : screen === "store"
                  ? renderStoreView()
                  : renderHeroSelector()}
      {screen !== "hero" && screen !== "store" && screen !== "settings" && (
        <View pointerEvents="none" style={styles.coinBalancePosition}>
          <CoinBalanceBadge balance={coinBalance} />
        </View>
      )}
      {screen !== "main" && (
        <View style={styles.backIconPosition}>
          <BackIconButton onPress={() => setScreen("main")} />
        </View>
      )}
      {screen === "main" && (
        <View style={styles.profilePicturePosition}>
          <ProfilePicture
            name={profileName}
            picture={profilePicture}
            border={profileBorder}
            level={playerLevel.level}
            onPress={() => setScreen("profile")}
            onStorePress={() => {
              setStoreMessage("");
              setScreen("store");
            }}
            onSettingsPress={() => setScreen("settings")}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "transparent",
  },
  menuBackground: {
    ...StyleSheet.absoluteFill,
  },
  menuPage: {
    flex: 1,
  },
  coinBalanceBadge: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: "rgba(255, 224, 160, 0.85)",
    backgroundColor: "rgba(5, 18, 14, 0.82)",
    zIndex: 30,
  },
  coinBalancePosition: {
    position: "absolute",
    top: 10,
    right: 12,
    zIndex: 40,
  },
  profilePicturePosition: {
    position: "absolute",
    top: 10,
    left: 12,
    zIndex: 40,
  },
  profileAvatarLargeFrame: {
    width: 76,
    height: 76,
    padding: 3,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: "rgba(255, 224, 160, 0.9)",
    backgroundColor: "rgba(5, 18, 14, 0.9)",
  },
  profileAvatarLarge: {
    width: 64,
    height: 64,
    borderRadius: 17,
  },
  backIconPosition: {
    position: "absolute",
    top: 10,
    left: 12,
    zIndex: 50,
  },
  profileRail: {
    alignItems: "center",
    gap: 12,
  },
  profileBadge: {
    alignItems: "center",
    gap: 3,
  },
  profileLevelBadge: {
    overflow: "hidden",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255, 224, 160, 0.8)",
    backgroundColor: "rgba(120, 83, 10, 0.72)",
    color: "#fff3c4",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.6,
    textAlign: "center",
  },
  profilePictureFrame: {
    width: 58,
    height: 58,
    padding: 3,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: "rgba(255, 224, 160, 0.9)",
    backgroundColor: "rgba(5, 18, 14, 0.9)",
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
  profilePicture: {
    marginLeft: 5,
    marginTop: 8,
    width: 42,
    height: 42,
    borderRadius: 4,
    shadowColor: "#000",
    shadowOpacity: 0.75,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  profileUserName: {
    maxWidth: 78,
    color: "#fff3c4",
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  profileMenuIcon: {
    width: 30,
    height: 30,
  },
  profileMenuIconTile: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: "rgba(255, 224, 160, 0.75)",
    backgroundColor: "rgba(5, 18, 14, 0.9)",
    shadowColor: "#000",
    shadowOpacity: 0.55,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
  coinBalanceIcon: {
    width: 26,
    height: 26,
  },
  coinBalanceText: {
    color: "#fff3c4",
    fontSize: 15,
    fontWeight: "900",
    minWidth: 18,
    textAlign: "center",
    textShadowColor: "#281507",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  heroHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  mainMenuShell: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    backgroundColor: "transparent",
  },
  mainMenuCard: {
    width: "100%",
    height: "95%",
    maxWidth: 340,
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 20,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: "rgba(255, 224, 160, 0.72)",
    backgroundColor: "rgba(5, 18, 14, 0.86)",
    shadowColor: "#000",
    shadowOpacity: 0.86,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  subScreenShell: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 20,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  playSelectionCard: {
    width: "100%",
    maxWidth: 480,
    padding: 20,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: "rgba(255, 224, 160, 0.72)",
    backgroundColor: "rgba(5, 18, 14, 0.86)",
    shadowColor: "#000",
    shadowOpacity: 0.86,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  profileScreenCard: {
    width: "100%",
    maxWidth: 760,
    padding: 18,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: "rgba(255, 224, 160, 0.72)",
    backgroundColor: "rgba(5, 18, 14, 0.9)",
    shadowColor: "#000",
    shadowOpacity: 0.86,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  storeShell: {
    flex: 1,
    width: "100%",
    maxWidth: 1200,
    alignSelf: "center",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 14,
  },
  storeHeader: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 0,
    marginBottom: 2,
    marginLeft: 10,
  },
  storeTitleGroup: {
    gap: 0,
  },
  storeKicker: {
    color: "#7dd3fc",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.8,
  },
  storeTitle: {
    color: "#f0fdf4",
    fontSize: 18,
    fontWeight: "900",
  },
  storeGalleryToolbar: {
    width: "100%",
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    marginBottom: 4,
  },
  storeGalleryToolbarSpacer: {
    flex: 1,
  },
  storeToolbarButton: {
    width: 72,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: "rgba(255, 224, 160, 0.75)",
    backgroundColor: "rgba(5, 18, 14, 0.92)",
  },
  storeToolbarButtonText: {
    color: "#f0fdf4",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "lowercase",
  },
  storeSortDropdown: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 5,
    padding: 7,
    marginBottom: 5,
    borderWidth: 1,
    borderColor: "rgba(255, 224, 160, 0.75)",
    borderRadius: 6,
    backgroundColor: "rgba(5, 18, 14, 0.98)",
  },
  storeTabs: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  storeTab: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.3)",
    backgroundColor: "rgba(5, 18, 14, 0.88)",
  },
  storeTabActive: {
    borderColor: "#4ade80",
    backgroundColor: "rgba(21, 128, 61, 0.42)",
  },
  storeTabIcon: {
    fontSize: 17,
  },
  storeTabText: {
    color: "#9bb7aa",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
  },
  storeTabTextActive: {
    color: "#f0fdf4",
  },
  storeSideTabs: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: 70,
    gap: 7,
    paddingTop: 1,
  },
  storeSideTab: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: "rgba(255, 224, 160, 0.62)",
    backgroundColor: "rgba(5, 18, 14, 0.9)",
  },
  storeSideTabActive: {
    borderColor: "#fde68a",
    backgroundColor: "rgba(21, 128, 61, 0.48)",
  },
  storeSideTabImage: {
    width: 42,
    height: 42,
  },
  storeFilters: {
    gap: 6,
    marginBottom: 8,
  },
  storeFilterLabel: {
    color: "#9bb7aa",
    width: 42,
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 1,
  },
  storeFilterDropdownTrigger: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 11,
    marginBottom: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.35)",
    backgroundColor: "rgba(5, 18, 14, 0.88)",
  },
  storeFilterTriggerText: {
    flex: 1,
    color: "#d1fae5",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  storeFilterChevron: {
    color: "#a7f3d0",
    fontSize: 9,
    fontWeight: "900",
  },
  storeFilterDropdown: {
    width: "100%",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 7,
    marginBottom: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(125, 211, 252, 0.25)",
    backgroundColor: "rgba(5, 18, 14, 0.94)",
  },
  storeFilterDropdownRow: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  storeDropdownOptions: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  storeFilterChip: {
    minHeight: 24,
    justifyContent: "center",
    paddingHorizontal: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.3)",
    backgroundColor: "rgba(5, 18, 14, 0.88)",
  },
  storeFilterChipActive: {
    borderColor: "#4ade80",
    backgroundColor: "rgba(21, 128, 61, 0.42)",
  },
  storeFilterChipText: {
    color: "#9bb7aa",
    fontSize: 9,
    fontWeight: "800",
  },
  storeFilterChipTextActive: {
    color: "#f0fdf4",
  },
  storeContentRow: {
    flex: 1,
    minHeight: 0,
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
    paddingRight: 82,
  },
  storeContentColumn: {
    flexDirection: "column",
    paddingRight: 82,
  },
  storeSelectedPreview: {
    width: "36%",
    minWidth: 220,
    maxWidth: 360,
    alignSelf: "stretch",
    flexDirection: "column",
    alignItems: "stretch",
    position: "relative",
    overflow: "hidden",
    justifyContent: "flex-start",
    padding: 0,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: "rgba(255, 224, 160, 0.62)",
    backgroundColor: "rgba(5, 18, 14, 0.92)",
  },
  storeSelectedPreviewCompact: {
    width: "100%",
    minWidth: 0,
    maxWidth: undefined,
    minHeight: 0,
    flex: 1,
    padding: 0,
  },
  storePreviewImageColumn: {
    ...StyleSheet.absoluteFill,
  },
  storeSelectedImage: {
    ...StyleSheet.absoluteFill,
  },
  storeOrbPreviewImage: {
    position: "absolute",
    top: "5%",
    left: "8%",
    width: "84%",
    height: "84%",
  },
  storeBuddyPreviewImage: {
    position: "absolute",
    top: "4%",
    left: "18%",
    width: "64%",
    height: "64%",
  },
  storeOrbLaserInset: {
    position: "absolute",
    left: 10,
    bottom: 102,
    zIndex: 3,
    width: 92,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    padding: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(255, 224, 160, 0.78)",
    backgroundColor: "rgba(3, 12, 9, 0.86)",
  },
  storeOrbLaserLabel: {
    color: "#f0fdf4",
    fontSize: 6,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  storeOrbLaserImage: {
    width: "100%",
    height: 30,
  },
  storePreviewToggle: {
    position: "absolute",
    bottom: 10,
    left: 8,
    zIndex: 4,
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 224, 160, 0.62)",
    backgroundColor: "rgba(3, 12, 9, 0.8)",
  },
  storePreviewToggleImage: {
    width: 26,
    height: 26,
  },
  storePreviewRarityBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    zIndex: 3,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255, 224, 160, 0.72)",
    backgroundColor: "rgba(3, 12, 9, 0.82)",
    color: "#fde68a",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.8,
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  storeOwnedBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    zIndex: 4,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255, 224, 160, 0.72)",
    backgroundColor: "rgba(3, 12, 9, 0.82)",
  },
  storeOwnedListBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    zIndex: 5,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255, 224, 160, 0.72)",
    backgroundColor: "rgba(3, 12, 9, 0.82)",
  },
  storeOwnedBadgeText: {
    color: "#fde68a",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.8,
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  storeSelectedDetails: {
    position: "absolute",
    bottom: 8,
    left: 8,
    right: 8,
    zIndex: 2,
    alignItems: "flex-start",
    paddingHorizontal: 9,
    paddingVertical: 8,
    borderRadius: 4,
    backgroundColor: "rgba(3, 12, 9, 0.72)",
  },
  storeSelectedDetailsAbovePurchase: {
    bottom: 66,
  },
  storeSelectedDetailsOwned: {
    bottom: 8,
    left: 54,
  },
  storePreviewPurchase: {
    position: "absolute",
    left: 54,
    right: 8,
    bottom: 8,
    zIndex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    minHeight: 49,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 4,
    backgroundColor: "rgba(3, 12, 9, 0.82)",
  },
  storePreviewPurchaseDetails: {
    flex: 1,
    minWidth: 0,
  },
  storePreviewStats: {
    color: "#cbd5e1",
    fontSize: 8,
    fontWeight: "800",
    marginTop: 3,
  },
  storePreviewTitle: {
    width: "100%",
    color: "#f0fdf4",
    fontSize: 17,
    fontWeight: "900",
    marginTop: 3,
  },
  storePreviewPrice: {
    color: "#fde68a",
    fontSize: 11,
    fontWeight: "900",
    marginTop: 4,
    textShadowColor: "rgba(0, 0, 0, 0.85)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  storeScroll: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1.5,
    borderColor: "rgba(255, 224, 160, 0.5)",
    borderRadius: 4,
    backgroundColor: "rgba(5, 18, 14, 0.84)",
  },
  storeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    gap: 8,
    padding: 8,
    paddingBottom: 18,
  },
  storeItemCard: {
    height: 145,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  storeItemCardFourCol: {
    width: "22%",
  },
  storeCardWrapper: {
    position: "relative",
    overflow: "visible",
    zIndex: 1,
  },
  storeSaleBadge: {
    position: "absolute",
    top: 5,
    right: -5,
    zIndex: 5,
    width: 40,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
    backgroundColor: "#dc2626",
    transform: [{ rotate: "8deg" }],
    elevation: 5,
  },
  storeSaleBadgeText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  storeItemCardSelected: {
    borderWidth: 2,
    borderColor: "#fde68a",
  },
  storeCardBackground: {
    ...StyleSheet.absoluteFill,
  },
  storeCatalogImage: {
    width: "100%",
    height: "82%",
  },
  storeOrbCatalogImage: {
    width: "100%",
    height: "82%",
    padding: 8,
  },
  storeBuddyCatalogImage: {
    width: "100%",
    height: "82%",
    padding: 4,
  },
  storeCatalogLabel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    paddingVertical: 3,
    backgroundColor: "rgba(3, 12, 9, 0.82)",
  },
  storeCatalogName: {
    width: "100%",
    color: "#f0fdf4",
    fontSize: 9,
    fontWeight: "900",
    textAlign: "center",
  },
  storeCatalogRarity: {
    color: "#fde68a",
    fontSize: 6,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  storeCatalogPrice: {
    color: "#f0fdf4",
    fontSize: 7,
    fontWeight: "900",
    marginTop: 1,
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  storeCatalogPriceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  storeCatalogOriginalPrice: {
    color: "#94a3b8",
    fontSize: 6,
    fontWeight: "800",
    textDecorationLine: "line-through",
  },
  storeItemMeta: {
    color: "#9bb7aa",
    fontSize: 9,
    fontWeight: "700",
    marginTop: 2,
  },
  storeItemDescription: {
    width: "100%",
    color: "#d1fae5",
    fontSize: 9,
    fontWeight: "600",
    lineHeight: 13,
    marginTop: 5,
  },
  storeRarityLabel: {
    color: "#f8fafc",
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 1.1,
    marginTop: 2,
    marginBottom: 1,
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  storePriceRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 3,
  },
  storeOriginalPrice: {
    color: "#94a3b8",
    fontSize: 7,
    fontWeight: "800",
    textDecorationLine: "line-through",
  },
  storeDiscount: {
    color: "#052e16",
    fontSize: 7,
    fontWeight: "900",
    paddingHorizontal: 5,
    paddingVertical: 2,
    overflow: "hidden",
    borderRadius: 999,
    backgroundColor: "#86efac",
  },
  storePrice: {
    minHeight: 14,
    color: "#fde68a",
    fontSize: 9,
    fontWeight: "900",
    marginTop: 2,
  },
  storeBuyButton: {
    width: "100%",
    minHeight: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#4ade80",
    backgroundColor: "#166534",
  },
  storePreviewBuyButton: {
    width: 108,
    minWidth: 96,
    minHeight: 34,
    flexShrink: 0,
    paddingHorizontal: 4,
  },
  storeBuyButtonOwned: {
    borderColor: "rgba(148, 163, 184, 0.35)",
    backgroundColor: "rgba(71, 85, 105, 0.35)",
  },
  storeBuyButtonDisabled: {
    borderColor: "rgba(148, 163, 184, 0.35)",
    backgroundColor: "rgba(71, 85, 105, 0.35)",
    opacity: 0.7,
  },
  storeBuyText: {
    color: "#f0fdf4",
    fontSize: 7,
    fontWeight: "900",
    textAlign: "center",
  },
  storeEmptyText: {
    width: "100%",
    color: "#cbd5e1",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
    textAlign: "center",
    paddingHorizontal: 14,
    paddingVertical: 22,
  },
  storeMessage: {
    width: "100%",
    color: "#fde68a",
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 16,
    textAlign: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  storeRequirementText: {
    color: "#fca5a5",
    fontSize: 6,
    fontWeight: "800",
    marginBottom: 2,
  },
  profileScreenHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  profileScreenTitleGroup: {
    alignItems: "center",
    gap: 2,
  },
  profileScreenKicker: {
    color: "#7dd3fc",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.8,
  },
  profileScreenTitle: {
    color: "#f0fdf4",
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  profileSavedBadge: {
    position: "absolute",
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(21, 128, 61, 0.28)",
    borderWidth: 1,
    borderColor: "rgba(134, 239, 172, 0.42)",
  },
  profileSavedDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: "#4ade80",
  },
  profileSavedText: {
    color: "#bbf7d0",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  profileIdentityPanel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(125, 211, 252, 0.28)",
    backgroundColor: "rgba(9, 29, 24, 0.9)",
    marginBottom: 12,
  },
  profileLevelPanel: {
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: -4,
    marginBottom: 10,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(250, 204, 21, 0.28)",
    backgroundColor: "rgba(40, 31, 11, 0.55)",
  },
  profileLevelHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  profileLevelTitle: {
    color: "#fde68a",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1,
  },
  profileLevelValue: {
    color: "#fff3c4",
    fontSize: 11,
    fontWeight: "900",
  },
  profileLevelProgressTrack: {
    height: 6,
    overflow: "hidden",
    borderRadius: 999,
    backgroundColor: "rgba(15, 23, 42, 0.9)",
  },
  profileLevelProgressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#facc15",
  },
  profileLevelXpText: {
    color: "#fef3c7",
    fontSize: 8,
    fontWeight: "800",
  },
  profileLevelTotalXp: {
    color: "#cbd5e1",
    fontWeight: "600",
  },
  profileNameEditor: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  profileFieldLabel: {
    color: "#9ae6b4",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },
  profileNameInput: {
    paddingVertical: 7,
    fontSize: 14,
  },
  profileHint: {
    color: "#9bb7aa",
    fontSize: 9,
    fontWeight: "600",
  },
  profileTabs: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  profileTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    minHeight: 38,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.28)",
    backgroundColor: "rgba(8, 24, 19, 0.78)",
  },
  profileTabActive: {
    backgroundColor: "rgba(21, 128, 61, 0.32)",
    borderColor: "#4ade80",
  },
  profileTabIcon: {
    color: "#a7f3d0",
    fontSize: 15,
    fontWeight: "900",
  },
  profileTabText: {
    color: "#9bb7aa",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  profileTabTextActive: {
    color: "#ecfdf5",
  },
  profileOptionsPanel: {
    minHeight: 132,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 224, 160, 0.22)",
    backgroundColor: "rgba(4, 17, 13, 0.7)",
  },
  settingsOptionsPanel: {
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 224, 160, 0.22)",
    backgroundColor: "rgba(4, 17, 13, 0.7)",
  },
  settingsOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  settingsVolumeHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  settingsOptionCopy: {
    flex: 1,
    gap: 5,
  },
  settingsOptionTitle: {
    color: "#f0fdf4",
    fontSize: 15,
    fontWeight: "900",
  },
  settingsOptionDescription: {
    color: "#9bb7aa",
    fontSize: 11,
    fontWeight: "600",
  },
  settingsSavedHint: {
    marginTop: 10,
    color: "#86efac",
    fontSize: 10,
    fontWeight: "700",
  },
  settingsVolumeValue: {
    minWidth: 42,
    color: "#fef3c7",
    fontSize: 13,
    fontWeight: "900",
    textAlign: "right",
  },
  settingsVolumeSliderTouchArea: {
    height: 40,
    justifyContent: "center",
    marginTop: 8,
    paddingHorizontal: 10,
  },
  nativeVolumeSlider: {
    width: "100%",
    height: 40,
    marginTop: 8,
  },
  settingsVolumeTrack: {
    height: 8,
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: "#334155",
  },
  settingsVolumeTrackFill: {
    height: 8,
    borderRadius: 999,
    backgroundColor: "#4ade80",
  },
  settingsVolumeThumb: {
    position: "absolute",
    width: 20,
    height: 20,
    marginLeft: -10,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#dcfce7",
    backgroundColor: "#16a34a",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  settingsVolumeLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 10,
  },
  settingsVolumeEndpoint: {
    color: "#9bb7aa",
    fontSize: 9,
    fontWeight: "700",
  },
  profileOptionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "stretch",
    justifyContent: "center",
    gap: 8,
  },
  profileOptionCard: {
    width: 104,
    minHeight: 106,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    padding: 7,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.28)",
    backgroundColor: "rgba(10, 31, 25, 0.85)",
  },
  profileOptionCardSelected: {
    borderWidth: 2,
    borderColor: "#facc15",
    backgroundColor: "rgba(120, 83, 10, 0.24)",
  },
  profileOptionImageFrame: {
    width: 58,
    height: 58,
    padding: 3,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 17,
    borderWidth: 1,
    backgroundColor: "rgba(5, 18, 14, 0.9)",
    shadowRadius: 7,
  },
  profileOptionImage: {
    width: 48,
    height: 48,
    borderRadius: 12,
  },
  profileOptionName: {
    color: "#f0fdf4",
    fontSize: 10,
    fontWeight: "800",
    textAlign: "center",
  },
  profileSelectedLabel: {
    color: "#fde68a",
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  orbStatusMessage: {
    width: "100%",
    color: "#a7f3d0",
    fontSize: 9,
    fontWeight: "700",
    textAlign: "center",
  },
  playSelectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  playHeaderSpacer: {
    width: 68,
  },
  playSelectionTitle: {
    flex: 1,
    textAlign: "center",
    marginBottom: 0,
  },
  modeList: {
    width: "100%",
    alignItems: "center",
    gap: 4,
  },
  appShell: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 18,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  titleImageWrap: {
    width: "100%",
    maxWidth: 250,
  },
  titleImage: {
    width: "100%",
    aspectRatio: 1.5,
  },
  mainMenuStack: {
    width: "100%",
    maxWidth: 260,
    marginTop: 8,
    gap: 8,
  },
  multiplayerPanel: {
    width: "100%",
    gap: 12,
  },
  multiplayerNavRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
  },
  multiplayerBackButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 224, 160, 0.8)",
    backgroundColor: "rgba(16, 27, 22, 0.85)",
  },
  multiplayerBackButtonText: {
    color: "#fff3c4",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  inputLabel: {
    color: "#fff3c4",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  input: {
    borderWidth: 1,
    borderColor: "rgba(255, 224, 160, 0.8)",
    borderRadius: 12,
    backgroundColor: "rgba(12, 23, 18, 0.9)",
    color: "#f8f3d0",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: "700",
  },
  helperText: {
    color: "#d9f5dc",
    fontSize: 13,
    lineHeight: 19,
  },
  hostAddressText: {
    color: "#fff3c4",
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 22,
  },
  inlineActions: {
    flexDirection: "row",
    gap: 10,
  },
  inlineButton: {
    flex: 1,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 224, 160, 0.8)",
    backgroundColor: "rgba(16, 27, 22, 0.85)",
  },
  inlineButtonPrimary: {
    flex: 1,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(125, 211, 252, 0.9)",
    backgroundColor: "rgba(19, 40, 34, 0.9)",
  },
  inlineButtonText: {
    color: "#fff3c4",
    fontWeight: "800",
  },
  emptyHostState: {
    color: "#d9f5dc",
    fontSize: 13,
    lineHeight: 18,
  },
  hostCard: {
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 224, 160, 0.7)",
    backgroundColor: "rgba(12, 23, 18, 0.82)",
    gap: 4,
  },
  hostName: {
    color: "#fff3c4",
    fontSize: 15,
    fontWeight: "800",
  },
  hostAddress: {
    color: "#d9f5dc",
    fontSize: 13,
    fontWeight: "600",
  },
  hostStatus: {
    color: "#7dd3fc",
    fontSize: 12,
    fontWeight: "700",
  },
  primaryButton: {
    width: "100%",
    aspectRatio: 3.1,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonCompact: {
    width: 68,
  },
  primaryButtonSmall: {
    width: "88%",
    maxWidth: 240,
    aspectRatio: 4.5,
  },
  primaryButtonImage: {
    position: "absolute",
    width: "100%",
    height: "100%",
  },
  lockBadge: {
    position: "absolute",
    top: "12%",
    right: "14%",
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255, 243, 196, 0.9)",
    backgroundColor: "rgba(41, 25, 12, 0.92)",
    zIndex: 2,
  },
  lockBadgeIcon: {
    fontSize: 11,
    lineHeight: 14,
  },
  primaryButtonPressed: {
    transform: [{ scale: 1.06 }],
  },
  primaryButtonPressedOverlay: {
    position: "absolute",
    width: "72%",
    height: "72%",
    borderRadius: 16,
    backgroundColor: "rgba(255, 232, 150, 0.2)",
  },
  primaryButtonLabels: {
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  primaryButtonDisabled: {
    opacity: 0.8,
  },
  primaryButtonText: {
    color: "#fff3c4",
    fontWeight: "900",
    fontSize: 20,
    textShadowColor: "#281507",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 3,
  },
  primaryButtonCompactText: {
    fontSize: 14,
  },
  primaryButtonWithSubtitleText: {
    fontSize: 17,
  },
  primaryButtonSmallText: {
    fontSize: 15,
  },
  primaryButtonEmphasizedText: {
    fontSize: 21,
  },
  primaryButtonSmallWithSubtitleText: {
    fontSize: 14,
  },
  primaryButtonSubtitle: {
    color: "#fff3c4",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 1,
    textShadowColor: "#281507",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  primaryButtonSmallSubtitle: {
    fontSize: 9,
  },
  modePill: {
    backgroundColor: "#12302a",
    borderWidth: 1,
    borderColor: "#2dd4bf",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  modePillText: {
    color: "#d1fae5",
    fontWeight: "800",
    fontSize: 12,
    textTransform: "uppercase",
  },
  selectorRow: {
    flex: 1,
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
    alignItems: "stretch",
  },
  previewPanel: {
    flex: 2,
    minWidth: 0,
    backgroundColor: "rgba(5, 18, 14, 0.86)",
    borderWidth: 2,
    borderColor: "rgba(255, 224, 160, 0.72)",
    borderRadius: 28,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.86,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  heroPictureColumn: {
    width: "44%",
    alignItems: "center",
    justifyContent: "center",
  },
  heroDetailsColumn: {
    flex: 1,
    justifyContent: "center",
    gap: 12,
  },
  selectionPanel: {
    flex: 3,
    minWidth: 0,
    backgroundColor: "rgba(5, 18, 14, 0.86)",
    borderWidth: 2,
    borderColor: "rgba(255, 224, 160, 0.72)",
    borderRadius: 28,
    padding: 12,
    shadowColor: "#000",
    shadowOpacity: 0.86,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  selectionTabs: {
    flexDirection: "row",
    gap: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#2d5749",
  },
  selectionScroll: {
    flex: 1,
  },
  selectionTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: "#0b1d16",
    borderWidth: 1,
    borderColor: "#254d40",
  },
  selectionTabActive: {
    backgroundColor: "#1c4937",
    borderColor: "#4ade80",
  },
  selectionTabIcon: {
    fontSize: 15,
  },
  selectionTabText: {
    color: "#9ab9a8",
    fontSize: 12,
    fontWeight: "800",
  },
  selectionTabTextActive: {
    color: "#f0fdf4",
  },
  selectionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    paddingTop: 12,
    paddingBottom: 4,
  },
  selectionCard: {
    width: "18%",
    backgroundColor: "#0d1d17",
    borderWidth: 2,
    borderColor: "#315c4c",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 3,
    alignItems: "center",
    marginBottom: 10,
  },
  selectionCardSelected: {
    backgroundColor: "#1f4d3c",
  },
  selectionOrbContent: {
    width: "100%",
    alignItems: "center",
    gap: 8,
  },
  selectionBuddyContent: {
    width: "100%",
    alignItems: "center",
    gap: 8,
  },
  selectionBuddyEmpty: {
    width: "100%",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
  },
  selectionBuddyGrid: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 6,
  },
  selectionBuddyCard: {
    width: "30%",
    minHeight: 128,
    paddingHorizontal: 5,
    gap: 3,
  },
  selectionBuddyImage: {
    width: 52,
    height: 48,
  },
  selectionBuddyRarity: {
    color: "#fcd34d",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  selectionBuddyBonus: {
    color: "#cbd5e1",
    fontSize: 8,
    textAlign: "center",
  },
  selectionOrbCard: {
    width: "48%",
    minHeight: 138,
    gap: 5,
    paddingHorizontal: 8,
    borderColor: "#4ade80",
  },
  selectionOrbCardLocked: {
    opacity: 0.68,
    borderColor: "#315c4c",
  },
  selectionOrbSectionTitle: {
    width: "100%",
    marginTop: 4,
    color: "#a7f3d0",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
    textAlign: "center",
  },
  selectionOrbSkinList: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 6,
  },
  selectionOrbSkinCard: {
    width: 82,
    minHeight: 94,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    padding: 5,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#315c4c",
    backgroundColor: "#0d1d17",
  },
  selectionOrbSkinImage: {
    width: 52,
    height: 52,
  },
  selectionOrbSkinName: {
    maxWidth: "100%",
    color: "#ebfff4",
    fontSize: 8,
    fontWeight: "800",
    textAlign: "center",
  },
  selectionOrbSkinRarity: {
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0.5,
    textAlign: "center",
  },
  selectionOrbImage: {
    width: 68,
    height: 68,
  },
  selectionOrbDescription: {
    color: "#a7f3d0",
    fontSize: 10,
    fontWeight: "600",
    textAlign: "center",
  },
  selectionArtwork: {
    width: 48,
    height: 48,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginBottom: 5,
  },
  selectionName: {
    color: "#ebfff4",
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
  },
  skinEquipStatus: {
    color: "#a7f3d0",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.6,
    marginTop: 4,
  },
  skinEquipStatusEquipped: {
    color: "#fde68a",
  },
  sectionTitle: {
    color: "#ebfff4",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 10,
  },
  previewHeader: {
    alignItems: "flex-start",
    width: "100%",
    gap: 2,
  },
  previewKicker: {
    color: "#94a3b8",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    fontWeight: "700",
  },
  previewName: {
    color: "#f0fdf4",
    fontSize: 22,
    fontWeight: "900",
    marginTop: 3,
  },
  roleLabel: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  heroPreview: {
    width: 124,
    height: 124,
    borderRadius: 30,
    alignSelf: "center",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 6,
  },
  statBox: {
    flex: 1,
    backgroundColor: "#122c25",
    borderRadius: 8,
    paddingVertical: 6,
    alignItems: "center",
  },
  statLabel: {
    color: "#9ae6b4",
    fontSize: 9,
    textTransform: "uppercase",
    fontWeight: "700",
  },
  statValue: {
    color: "#ebfff4",
    fontSize: 14,
    fontWeight: "900",
    marginTop: 2,
  },
  abilityBox: {
    backgroundColor: "#132b24",
    borderRadius: 10,
    padding: 8,
  },
  abilityTitle: {
    color: "#fef3c7",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  abilityText: {
    color: "#d1fae5",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
  modeCard: {
    backgroundColor: "#0d1f1a",
    borderWidth: 1,
    borderColor: "#2d5749",
    borderRadius: 18,
    padding: 18,
  },
  modeCardSelected: {
    borderColor: "#22c55e",
    backgroundColor: "#102d23",
  },
  modeCardDisabled: {
    opacity: 0.6,
  },
  modeTitle: {
    color: "#f0fdf4",
    fontSize: 18,
    fontWeight: "800",
  },
  modeMeta: {
    color: "#9ae6b4",
    fontSize: 12,
    marginTop: 6,
  },
  launchButton: {
    backgroundColor: "#22c55e",
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  launchButtonText: {
    color: "#052e16",
    fontWeight: "900",
    fontSize: 16,
  },
});
