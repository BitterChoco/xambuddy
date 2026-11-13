import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BUDDIES, getBuddyBonusSummary } from "@/constants/buddy-catalog";
import {
    awardCoins,
    getCoinBalance,
    spendCoins,
    subscribeToCoinBalance,
} from "@/constants/coin-wallet";
import {
    DEFAULT_HERO_ID,
    getHeroImage,
    getRarityCardImage,
    getSkinImage,
    HEROES,
    ITEM_RARITIES,
    type BundledImage,
    type ItemRarity,
} from "@/constants/game-catalog";
import {
    DEFAULT_ORB_SKIN_ID,
    getOrbRarityColor,
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
    getBuddyPricing,
    getHeroPricing,
    getOrbPricing,
    getSkinPricing,
} from "@/constants/store-pricing";
import { getRemoteAssetSource } from "@/services/remote-assets";

const backdrop = require("@/assets/images/background_1.png");
const storeIcon = getRemoteAssetSource("game/icons/shop_1.png");
const coinIcon = getRemoteAssetSource("game/icons/coin_1.png");

type StoreTab = "hero" | "skin" | "orb" | "buddy";
type Price = { price: number; discountPercent: number; finalPrice: number };
type StoreItem = {
  key: string;
  id: string;
  kind: StoreTab;
  name: string;
  subtitle: string;
  rarity: ItemRarity;
  image?: BundledImage;
  price: Price;
  owned: boolean;
  locked: boolean;
  description: string;
};

type RarityFilter = ItemRarity | "all";
type SortOrder = "featured" | "low-to-high" | "high-to-low";

export default function StoreScreen() {
  const { width } = useWindowDimensions();
  const { tab: requestedTab } = useLocalSearchParams<{ tab?: StoreTab }>();
  const [tab, setTab] = useState<StoreTab>(() =>
    requestedTab === "skin" ||
    requestedTab === "orb" ||
    requestedTab === "buddy"
      ? requestedTab
      : "hero",
  );
  const [rarity, setRarity] = useState<RarityFilter>("all");
  const [heroFilter, setHeroFilter] = useState("all");
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [sortOrder, setSortOrder] = useState<SortOrder>("featured");
  const [selectedKey, setSelectedKey] = useState("");
  const [inventory, setInventory] = useState<PlayerInventory>(
    DEFAULT_PLAYER_INVENTORY,
  );
  const [inventoryLoaded, setInventoryLoaded] = useState(false);
  const [coinBalance, setCoinBalance] = useState(0);
  const [playerXp, setPlayerXp] = useState(0);
  const [purchasingItem, setPurchasingItem] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const playerLevel = getPlayerLevelProgress(playerXp);
  const isCompact = width < 760;

  useEffect(() => {
    let mounted = true;
    const unsubscribeCoins = subscribeToCoinBalance(setCoinBalance);
    const unsubscribeXp = subscribeToPlayerXp(setPlayerXp);

    void Promise.all([getCoinBalance(), getPlayerXp(), loadPlayerInventory()])
      .then(([balance, xp, loadedInventory]) => {
        if (!mounted) return;
        setCoinBalance(balance);
        setPlayerXp(xp);
        setInventory(loadedInventory);
      })
      .catch(() => {
        if (mounted) setMessage("Could not load your collection.");
      })
      .finally(() => {
        if (mounted) setInventoryLoaded(true);
      });

    return () => {
      mounted = false;
      unsubscribeCoins();
      unsubscribeXp();
    };
  }, []);

  const allItems = useMemo<StoreItem[]>(() => {
    const heroes = HEROES.filter((hero) => hero.id !== DEFAULT_HERO_ID).map(
      (hero) => ({
        key: `hero:${hero.id}`,
        id: hero.id,
        kind: "hero" as const,
        name: hero.name,
        subtitle: `${hero.type} hero`,
        rarity: hero.rarity ?? "common",
        image: getHeroImage(hero.id),
        price: getHeroPricing(hero.id),
        owned: inventory.heroes.includes(hero.id),
        locked: false,
        description: hero.ability,
      }),
    );
    const skins = HEROES.flatMap((hero) =>
      hero.skins.map((skin) => ({
        key: `skin:${hero.id}:${skin.id}`,
        id: `${hero.id}:${skin.id}`,
        kind: "skin" as const,
        name: skin.name,
        subtitle: `${hero.name} · ${hero.type}`,
        rarity: skin.rarity ?? "common",
        image: getSkinImage(hero.id, skin.id),
        price: getSkinPricing(hero.id, skin.id),
        owned: inventory.skins.includes(`${hero.id}:${skin.id}`),
        locked: false,
        description: `A unique look for ${hero.name}.`,
      })),
    );
    const orbs = ORB_SKINS.filter((orb) => orb.id !== DEFAULT_ORB_SKIN_ID).map(
      (orb) => ({
        key: `orb:${orb.id}`,
        id: orb.id,
        kind: "orb" as const,
        name: orb.name,
        subtitle: "Orb companion skin",
        rarity: orb.rarity as ItemRarity,
        image: orb.orbImage,
        price: getOrbPricing(orb.id),
        owned: inventory.orbSkins.includes(orb.id),
        locked: false,
        description: "A new look for your loyal orb companion.",
      }),
    );
    const buddies = BUDDIES.map((buddy) => ({
      key: `buddy:${buddy.id}`,
      id: buddy.id,
      kind: "buddy" as const,
      name: buddy.name,
      subtitle: `${buddy.rarity} buddy`,
      rarity: buddy.rarity,
      image: buddy.source,
      price: getBuddyPricing(buddy.id, buddy.rarity),
      owned: inventory.buddies.includes(buddy.id),
      locked: playerLevel.level < 10,
      description: getBuddyBonusSummary(buddy),
    }));
    return [...heroes, ...skins, ...orbs, ...buddies];
  }, [inventory, playerLevel.level]);

  const items = useMemo(() => {
    const visible = allItems.filter((item) => {
      if (item.kind !== tab) return false;
      if (rarity !== "all" && item.rarity !== rarity) return false;
      if (ownedOnly && !item.owned) return false;
      if (
        tab === "skin" &&
        heroFilter !== "all" &&
        !item.id.startsWith(`${heroFilter}:`)
      ) {
        return false;
      }
      return true;
    });
    if (sortOrder === "low-to-high") {
      visible.sort((a, b) => a.price.finalPrice - b.price.finalPrice);
    } else if (sortOrder === "high-to-low") {
      visible.sort((a, b) => b.price.finalPrice - a.price.finalPrice);
    }
    return visible;
  }, [allItems, heroFilter, ownedOnly, rarity, sortOrder, tab]);

  const selectedItem =
    items.find((item) => item.key === selectedKey) ?? items[0] ?? null;

  const purchaseItem = async (item: StoreItem) => {
    if (item.owned || item.locked || purchasingItem) return;
    if (
      item.kind === "skin" &&
      !inventory.heroes.includes(item.id.split(":")[0])
    ) {
      setMessage(
        `Unlock ${item.subtitle.split(" · ")[0]} first to buy this skin.`,
      );
      return;
    }
    if (coinBalance < item.price.finalPrice) {
      setMessage("Not enough coins yet. Play a match to earn more!");
      return;
    }

    setPurchasingItem(item.id);
    setMessage("");
    let coinsSpent = false;
    try {
      if (!(await spendCoins(item.price.finalPrice))) {
        setMessage("Not enough coins yet. Play a match to earn more!");
        return;
      }
      coinsSpent = item.price.finalPrice > 0;
      const nextInventory: PlayerInventory = {
        ...inventory,
        heroes:
          item.kind === "hero"
            ? [...inventory.heroes, item.id]
            : inventory.heroes,
        skins:
          item.kind === "skin"
            ? [...inventory.skins, item.id]
            : inventory.skins,
        orbSkins:
          item.kind === "orb"
            ? [...inventory.orbSkins, item.id]
            : inventory.orbSkins,
        buddies:
          item.kind === "buddy"
            ? [...inventory.buddies, item.id]
            : inventory.buddies,
      };
      await savePlayerInventory(nextInventory);
      setInventory(nextInventory);
      setMessage(`${item.name} added to your collection!`);
    } catch {
      if (coinsSpent)
        await awardCoins(item.price.finalPrice).catch(() => undefined);
      setMessage("Purchase could not be saved. Please try again.");
    } finally {
      setPurchasingItem(null);
    }
  };

  const cycleSort = () => {
    setSortOrder((current) =>
      current === "featured"
        ? "low-to-high"
        : current === "low-to-high"
          ? "high-to-low"
          : "featured",
    );
  };

  const tabLabels: { id: StoreTab; label: string }[] = [
    { id: "hero", label: "Heroes" },
    { id: "skin", label: "Skins" },
    { id: "orb", label: "Orbs" },
    { id: "buddy", label: "Buddies" },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <Image
        source={backdrop}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        pointerEvents="none"
      />
      <View style={styles.scrim} />
      <View style={styles.page}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to menu"
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Text style={styles.backButtonText}>‹ MENU</Text>
          </Pressable>
          <View style={styles.titleGroup}>
            <Text style={styles.eyebrow}>WILD PAW · MARKET</Text>
            <Text style={styles.title}>Store</Text>
          </View>
          <Image
            source={storeIcon}
            style={styles.headerIcon}
            contentFit="contain"
            accessibilityLabel="Store"
          />
          <View style={styles.balanceBadge}>
            <Image
              source={coinIcon}
              style={styles.coinIcon}
              contentFit="contain"
              accessibilityLabel="Coins"
            />
            <Text style={styles.balanceText}>
              {coinBalance.toLocaleString()}
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.tabs}>
            {tabLabels.map((entry) => (
              <Pressable
                key={entry.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === entry.id }}
                onPress={() => {
                  setTab(entry.id);
                  setSelectedKey("");
                  setMessage("");
                }}
                style={[styles.tab, tab === entry.id && styles.activeTab]}
              >
                <Text
                  style={[
                    styles.tabText,
                    tab === entry.id && styles.activeTabText,
                  ]}
                >
                  {entry.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.toolbar}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterList}
            >
              {["all", ...ITEM_RARITIES].map((value) => {
                const selected = rarity === value;
                const label = value === "all" ? "All rarities" : value;
                return (
                  <Pressable
                    key={value}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setRarity(value as RarityFilter)}
                    style={[styles.chip, selected && styles.selectedChip]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        selected && styles.selectedChipText,
                      ]}
                    >
                      {label.toUpperCase()}
                    </Text>
                  </Pressable>
                );
              })}
              {tab === "skin" && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.filterList}
                >
                  {[{ id: "all", name: "All heroes" }, ...HEROES].map(
                    (hero) => (
                      <Pressable
                        key={hero.id}
                        accessibilityRole="button"
                        accessibilityState={{
                          selected: heroFilter === hero.id,
                        }}
                        onPress={() => setHeroFilter(hero.id)}
                        style={[
                          styles.chip,
                          heroFilter === hero.id && styles.selectedChip,
                        ]}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            heroFilter === hero.id && styles.selectedChipText,
                          ]}
                        >
                          {hero.name.toUpperCase()}
                        </Text>
                      </Pressable>
                    ),
                  )}
                </ScrollView>
              )}
            </ScrollView>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                ownedOnly ? "Show all items" : "Show owned items only"
              }
              accessibilityState={{ selected: ownedOnly }}
              onPress={() => setOwnedOnly((value) => !value)}
              style={[styles.chip, ownedOnly && styles.selectedChip]}
            >
              <Text
                style={[styles.chipText, ownedOnly && styles.selectedChipText]}
              >
                {ownedOnly ? "OWNED ✓" : "OWNED"}
              </Text>
            </Pressable>
            <Pressable onPress={cycleSort} style={styles.sortButton}>
              <Text style={styles.sortText}>
                {sortOrder === "featured"
                  ? "FEATURED"
                  : sortOrder === "low-to-high"
                    ? "PRICE ↑"
                    : "PRICE ↓"}
              </Text>
            </Pressable>
          </View>

          {!!message && <Text style={styles.message}>{message}</Text>}

          {!inventoryLoaded ? (
            <View style={styles.loadingArea}>
              <Text style={styles.emptyText}>Loading your collection…</Text>
            </View>
          ) : (
            <View
              style={[styles.storeBody, isCompact && styles.storeBodyCompact]}
            >
              <View style={styles.catalogPane}>
                {items.length === 0 ? (
                  <View style={styles.emptyArea}>
                    <Text style={styles.emptyText}>
                      No items match these filters.
                    </Text>
                  </View>
                ) : (
                  <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.catalogGrid}
                  >
                    {items.map((item) => {
                      const selected = selectedItem?.key === item.key;
                      return (
                        <Pressable
                          key={item.key}
                          accessibilityRole="button"
                          accessibilityLabel={`${item.name}, ${item.owned ? "owned" : `${item.price.finalPrice} coins`}`}
                          accessibilityState={{ selected }}
                          onPress={() => {
                            setSelectedKey(item.key);
                            setMessage("");
                          }}
                          style={[
                            styles.itemCard,
                            selected && styles.itemCardSelected,
                          ]}
                        >
                          <Image
                            source={getRarityCardImage(item.rarity)}
                            style={styles.itemCardBackground}
                            contentFit="fill"
                            pointerEvents="none"
                          />
                          {!item.owned && item.price.discountPercent > 0 && (
                            <View pointerEvents="none" style={styles.saleBadge}>
                              <Text style={styles.saleBadgeText}>SALE</Text>
                            </View>
                          )}
                          {item.image && (
                            <Image
                              source={item.image}
                              style={styles.itemImage}
                              contentFit="contain"
                              pointerEvents="none"
                            />
                          )}
                          <Text numberOfLines={1} style={styles.itemName}>
                            {item.name}
                          </Text>
                          <Text numberOfLines={1} style={styles.itemRarity}>
                            {item.rarity.toUpperCase()}
                          </Text>
                          <Text
                            numberOfLines={1}
                            style={
                              item.owned ? styles.ownedLabel : styles.itemPrice
                            }
                          >
                            {item.owned
                              ? "OWNED"
                              : item.locked
                                ? "LEVEL 10"
                                : `${item.price.finalPrice.toLocaleString()} COINS`}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                )}
              </View>

              <View
                style={[
                  styles.detailPane,
                  isCompact && styles.detailPaneCompact,
                ]}
              >
                {selectedItem ? (
                  <>
                    <View style={styles.detailImageFrame}>
                      {selectedItem.image && (
                        <Image
                          source={selectedItem.image}
                          style={styles.detailImage}
                          contentFit="contain"
                          accessibilityLabel={`${selectedItem.name} preview`}
                        />
                      )}
                    </View>
                    <Text
                      style={[
                        styles.detailRarity,
                        selectedItem.kind === "orb" && {
                          color: getOrbRarityColor(
                            selectedItem.rarity as
                              | "common"
                              | "rare"
                              | "epic"
                              | "legendary"
                              | "mythic",
                          ),
                        },
                      ]}
                    >
                      {selectedItem.rarity.toUpperCase()}
                    </Text>
                    <Text style={styles.detailTitle}>{selectedItem.name}</Text>
                    <Text style={styles.detailSubtitle}>
                      {selectedItem.subtitle}
                    </Text>
                    <Text numberOfLines={4} style={styles.detailDescription}>
                      {selectedItem.description}
                    </Text>
                    {!selectedItem.owned &&
                      selectedItem.price.discountPercent > 0 && (
                        <Text style={styles.discountText}>
                          {selectedItem.price.price} coins ·{" "}
                          {selectedItem.price.discountPercent}% off
                        </Text>
                      )}
                    <Text style={styles.detailPrice}>
                      {selectedItem.owned
                        ? "IN YOUR COLLECTION"
                        : selectedItem.locked
                          ? "UNLOCKS AT LEVEL 10"
                          : `${selectedItem.price.finalPrice.toLocaleString()} COINS`}
                    </Text>
                    {!selectedItem.owned && (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{
                          disabled:
                            !!purchasingItem ||
                            selectedItem.locked ||
                            coinBalance < selectedItem.price.finalPrice,
                        }}
                        disabled={
                          !!purchasingItem ||
                          selectedItem.locked ||
                          coinBalance < selectedItem.price.finalPrice
                        }
                        onPress={() => void purchaseItem(selectedItem)}
                        style={[
                          styles.buyButton,
                          (!!purchasingItem ||
                            selectedItem.locked ||
                            coinBalance < selectedItem.price.finalPrice) &&
                            styles.disabledButton,
                        ]}
                      >
                        <Text style={styles.buyButtonText}>
                          {purchasingItem === selectedItem.id
                            ? "BUYING…"
                            : selectedItem.locked
                              ? "LEVEL 10 REQUIRED"
                              : coinBalance < selectedItem.price.finalPrice
                                ? "NOT ENOUGH COINS"
                                : "BUY ITEM"}
                        </Text>
                      </Pressable>
                    )}
                  </>
                ) : (
                  <Text style={styles.emptyText}>
                    No items in this category.
                  </Text>
                )}
              </View>
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#06150f" },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(2, 12, 9, 0.76)",
  },
  page: {
    flex: 1,
    width: "100%",
    maxWidth: 1200,
    alignSelf: "center",
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 4,
  },
  header: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 5,
  },
  backButton: {
    minWidth: 68,
    paddingVertical: 7,
    paddingHorizontal: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(217, 249, 157, 0.28)",
    backgroundColor: "rgba(5, 18, 14, 0.82)",
  },
  backButtonText: {
    color: "#d9f99d",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  titleGroup: { flex: 1 },
  eyebrow: {
    color: "#a3e635",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.6,
  },
  title: {
    color: "#f0fdf4",
    fontSize: 19,
    fontWeight: "900",
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 5,
  },
  headerIcon: { width: 34, height: 34 },
  balanceBadge: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(217, 249, 157, 0.4)",
    backgroundColor: "rgba(5, 18, 14, 0.9)",
  },
  coinIcon: { width: 22, height: 22 },
  balanceText: { color: "#f0fdf4", fontSize: 13, fontWeight: "900" },
  card: {
    flex: 1,
    overflow: "hidden",
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "rgba(217, 249, 157, 0.4)",
    backgroundColor: "rgba(4, 17, 13, 0.94)",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  tabs: {
    flexDirection: "row",
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(217, 249, 157, 0.15)",
  },
  tab: {
    minWidth: 72,
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  activeTab: { borderBottomColor: "#a3e635" },
  tabText: {
    color: "#94a3b8",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  activeTabText: { color: "#d9f99d" },
  toolbar: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(217, 249, 157, 0.12)",
  },
  filterList: { alignItems: "center", gap: 5, paddingRight: 4 },
  chip: {
    minHeight: 26,
    justifyContent: "center",
    paddingHorizontal: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(217, 249, 157, 0.2)",
    backgroundColor: "rgba(5, 18, 14, 0.82)",
  },
  selectedChip: {
    borderColor: "rgba(163, 230, 53, 0.75)",
    backgroundColor: "rgba(163, 230, 53, 0.15)",
  },
  chipText: { color: "#b6c8bc", fontSize: 8, fontWeight: "900" },
  selectedChipText: { color: "#d9f99d" },
  sortButton: {
    minHeight: 26,
    justifyContent: "center",
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: "rgba(163, 230, 53, 0.12)",
  },
  sortText: { color: "#d9f99d", fontSize: 8, fontWeight: "900" },
  message: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    color: "#bef264",
    fontSize: 10,
    fontWeight: "700",
  },
  storeBody: { flex: 1, flexDirection: "row", gap: 10, padding: 10 },
  storeBodyCompact: { flexDirection: "column-reverse" },
  catalogPane: { flex: 1.5, minHeight: 0 },
  catalogGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignContent: "flex-start",
    justifyContent: "center",
    gap: 8,
    paddingBottom: 8,
  },
  itemCard: {
    width: 112,
    height: 142,
    alignItems: "center",
    overflow: "hidden",
    padding: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(217, 249, 157, 0.2)",
    backgroundColor: "rgba(15, 35, 25, 0.94)",
  },
  itemCardSelected: {
    borderColor: "#a3e635",
    borderWidth: 2,
  },
  itemCardBackground: { ...StyleSheet.absoluteFill, opacity: 0.55 },
  saleBadge: {
    position: "absolute",
    top: 7,
    right: -14,
    zIndex: 2,
    minWidth: 54,
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 3,
    backgroundColor: "#dc2626",
    transform: [{ rotate: "12deg" }],
  },
  saleBadgeText: {
    color: "#fff",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  itemImage: { width: 76, height: 82, marginTop: 2 },
  itemName: {
    width: "100%",
    marginTop: 2,
    color: "#f0fdf4",
    fontSize: 10,
    fontWeight: "900",
    textAlign: "center",
  },
  itemRarity: {
    marginTop: 2,
    color: "#bef264",
    fontSize: 8,
    fontWeight: "900",
  },
  itemPrice: { marginTop: 3, color: "#fef3c7", fontSize: 8, fontWeight: "800" },
  ownedLabel: {
    marginTop: 3,
    color: "#86efac",
    fontSize: 8,
    fontWeight: "900",
  },
  detailPane: {
    width: 260,
    minHeight: 0,
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(163, 230, 53, 0.28)",
    backgroundColor: "rgba(15, 35, 25, 0.86)",
  },
  detailPaneCompact: {
    width: "100%",
    minHeight: 150,
  },
  detailImageFrame: {
    width: 110,
    height: 100,
    alignItems: "center",
    justifyContent: "center",
  },
  detailImage: { width: "100%", height: "100%" },
  detailRarity: {
    marginTop: 3,
    color: "#bef264",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1,
  },
  detailTitle: {
    marginTop: 4,
    color: "#f0fdf4",
    fontSize: 16,
    fontWeight: "900",
    textAlign: "center",
  },
  detailSubtitle: {
    marginTop: 3,
    color: "#9bb7aa",
    fontSize: 10,
    textAlign: "center",
  },
  detailDescription: {
    marginTop: 7,
    color: "#cbd5e1",
    fontSize: 10,
    lineHeight: 14,
    textAlign: "center",
  },
  discountText: {
    marginTop: 7,
    color: "#fcd34d",
    fontSize: 9,
    fontWeight: "800",
  },
  detailPrice: {
    marginTop: 8,
    color: "#bef264",
    fontSize: 11,
    fontWeight: "900",
  },
  buyButton: {
    minHeight: 36,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 9,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "#a3e635",
  },
  disabledButton: { opacity: 0.5 },
  buyButtonText: {
    color: "#14220b",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
    textAlign: "center",
  },
  emptyArea: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingArea: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { color: "#cbd5e1", fontSize: 12, textAlign: "center" },
});
