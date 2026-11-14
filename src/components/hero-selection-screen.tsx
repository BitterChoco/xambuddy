import { Image } from "expo-image";
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
} from "react-native";

import {
    getBuddy,
    getBuddyBonusSummary,
    getBuddyRarityColor,
} from "@/constants/buddy-catalog";
import {
    getHeroImage,
    getSkinImage,
    type HeroRecord,
    type SkinRecord,
} from "@/constants/game-catalog";
import { getOrbRarityColor, ORB_SKINS } from "@/constants/orb-catalog";
import type { PlayerInventory } from "@/constants/player-inventory";
import { getRemoteAssetSource } from "@/services/remote-assets";

export type HeroSelectionTab = "hero" | "orb" | "buddy";

type HeroSelectionScreenProps = {
  coinBalance: number;
  hero: HeroRecord;
  ownedHeroes: HeroRecord[];
  selectedHero: string;
  onSelectHero: (heroId: string) => void;
  ownedSkins: SkinRecord[];
  selectedSkin: SkinRecord;
  onSelectSkin: (skinId: string) => void;
  selectionTab: HeroSelectionTab;
  onSelectionTabChange: (tab: HeroSelectionTab) => void;
  inventory: PlayerInventory;
  inventoryLoaded: boolean;
  playerLevel: number;
  orbMessage: string;
  buddyMessage: string;
  onToggleOrbEquipment: () => void;
  onEquipOrbSkin: (skinId: string) => void;
  onEquipBuddy: (buddyId: string) => void;
  onOpenStore: (tab: "skin" | "buddy") => void;
  onBack: () => void;
};

const coinIcon = getRemoteAssetSource("game/icons/coin_1.png");

function Artwork({
  source,
  size,
}: {
  source: number | { uri: string; width?: number; height?: number } | undefined;
  size: number;
}) {
  if (!source) return null;

  return (
    <Image
      source={source}
      style={{ width: size, height: size }}
      contentFit="contain"
      loading="eager"
    />
  );
}

export function HeroSelectionScreen({
  coinBalance,
  hero,
  ownedHeroes,
  selectedHero,
  onSelectHero,
  ownedSkins,
  selectedSkin,
  onSelectSkin,
  selectionTab,
  onSelectionTabChange,
  inventory,
  inventoryLoaded,
  playerLevel,
  orbMessage,
  buddyMessage,
  onToggleOrbEquipment,
  onEquipOrbSkin,
  onEquipBuddy,
  onOpenStore,
  onBack,
}: HeroSelectionScreenProps) {
  const { width } = useWindowDimensions();
  const isCompact = width < 760;
  const tabs: { id: HeroSelectionTab; label: string }[] = [
    { id: "hero", label: "Heroes" },
    { id: "orb", label: "Orb" },
    { id: "buddy", label: "Buddies" },
  ];

  const renderCatalog = () => {
    if (!inventoryLoaded) {
      return (
        <View style={styles.emptyArea}>
          <Text style={styles.emptyText}>Loading your collection…</Text>
        </View>
      );
    }

    if (selectionTab === "hero") {
      return (
        <View style={styles.heroCollection}>
          <View style={styles.heroCollectionSection}>
            <Text style={styles.sectionLabel}>YOUR HEROES</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalCatalog}
            >
              {ownedHeroes.map((entry) => {
                const selected = selectedHero === entry.id;
                return (
                  <Pressable
                    key={entry.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${entry.name}, ${selected ? "selected" : "select hero"}`}
                    accessibilityState={{ selected }}
                    onPress={() => onSelectHero(entry.id)}
                    style={[
                      styles.itemCard,
                      styles.horizontalItemCard,
                      selected && styles.itemCardSelected,
                    ]}
                  >
                    <Image
                      source={getRemoteAssetSource(
                        `game/functions/card/hero_card_${entry.rarity ?? "common"}.png`,
                      )}
                      style={styles.itemCardBackground}
                      contentFit="fill"
                      pointerEvents="none"
                    />
                    <View
                      style={[
                        styles.artworkFrame,
                        styles.horizontalArtworkFrame,
                        { backgroundColor: entry.accent },
                      ]}
                    >
                      <Artwork source={getHeroImage(entry.id)} size={48} />
                    </View>
                    <Text numberOfLines={1} style={styles.itemName}>
                      {entry.name}
                    </Text>
                    <Text numberOfLines={1} style={styles.itemMeta}>
                      {entry.type.toUpperCase()}
                    </Text>
                    <Text
                      style={selected ? styles.selectedLabel : styles.itemMeta}
                    >
                      {selected
                        ? "SELECTED"
                        : (entry.rarity ?? "common").toUpperCase()}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.heroCollectionSection}>
            <Text style={styles.sectionLabel}>
              SKINS · {hero.name.toUpperCase()}
            </Text>
            {ownedSkins.length ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.horizontalCatalog}
              >
                {ownedSkins.map((skin) => {
                  const selected = selectedSkin.id === skin.id;
                  return (
                    <Pressable
                      key={skin.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${selected ? "Unequip" : "Equip"} ${skin.name} skin`}
                      accessibilityState={{ selected }}
                      onPress={() => onSelectSkin(skin.id)}
                      style={[
                        styles.itemCard,
                        styles.horizontalItemCard,
                        selected && styles.itemCardSelected,
                      ]}
                    >
                      <Image
                        source={getRemoteAssetSource(
                          `game/functions/card/hero_card_${skin.rarity ?? "common"}.png`,
                        )}
                        style={styles.itemCardBackground}
                        contentFit="fill"
                        pointerEvents="none"
                      />
                      <View
                        style={[
                          styles.artworkFrame,
                          styles.horizontalArtworkFrame,
                          { backgroundColor: skin.color },
                        ]}
                      >
                        <Artwork
                          source={getSkinImage(hero.id, skin.id)}
                          size={48}
                        />
                      </View>
                      <Text numberOfLines={1} style={styles.itemName}>
                        {skin.name}
                      </Text>
                      <Text
                        style={
                          selected ? styles.selectedLabel : styles.itemMeta
                        }
                      >
                        {selected
                          ? "EQUIPPED"
                          : (skin.rarity ?? "common").toUpperCase()}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : (
              <View style={styles.skinEmptyState}>
                <Text style={styles.emptyText}>No skins owned yet.</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => onOpenStore("skin")}
                  style={styles.secondaryButton}
                >
                  <Text style={styles.secondaryButtonText}>
                    VISIT SKIN STORE
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      );
    }

    if (selectionTab === "orb") {
      return (
        <View style={styles.companionContent}>
          <View style={styles.companionGrid}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                playerLevel < 5
                  ? "Orb locked until level 5"
                  : inventory.equippedOrb
                    ? "Unequip orb"
                    : "Equip orb"
              }
              accessibilityState={{
                disabled: playerLevel < 5,
                selected: inventory.equippedOrb,
              }}
              disabled={playerLevel < 5}
              onPress={onToggleOrbEquipment}
              style={[
                styles.companionCard,
                inventory.equippedOrb && styles.itemCardSelected,
                playerLevel < 5 && styles.lockedCard,
              ]}
            >
              <Image
                source={getRemoteAssetSource("game/orbs/orb_1-1.png")}
                style={styles.companionImage}
                contentFit="contain"
              />
              <Text style={styles.itemName}>Orb companion</Text>
              <Text
                style={
                  inventory.equippedOrb ? styles.selectedLabel : styles.itemMeta
                }
              >
                {playerLevel < 5
                  ? "UNLOCKS AT LEVEL 5"
                  : inventory.equippedOrb
                    ? "EQUIPPED · TAP TO UNEQUIP"
                    : "UNLOCKED · TAP TO EQUIP"}
              </Text>
            </Pressable>
          </View>
          <Text style={styles.sectionLabel}>OWNED ORB SKINS</Text>
          <View style={styles.catalogGrid}>
            {ORB_SKINS.filter((orb) => inventory.orbSkins.includes(orb.id)).map(
              (orb) => {
                const selected = inventory.equippedOrbSkin === orb.id;
                return (
                  <Pressable
                    key={orb.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${selected ? "Equipped" : "Equip"} ${orb.name}`}
                    accessibilityState={{ disabled: playerLevel < 5, selected }}
                    disabled={playerLevel < 5}
                    onPress={() => onEquipOrbSkin(orb.id)}
                    style={[
                      styles.itemCard,
                      selected && styles.itemCardSelected,
                      playerLevel < 5 && styles.lockedCard,
                    ]}
                  >
                    <Image
                      source={getRemoteAssetSource(
                        `game/functions/card/hero_card_${orb.rarity}.png`,
                      )}
                      style={styles.itemCardBackground}
                      contentFit="fill"
                      pointerEvents="none"
                    />
                    <Image
                      source={orb.orbImage}
                      style={styles.orbSkinImage}
                      contentFit="contain"
                    />
                    <Text numberOfLines={1} style={styles.itemName}>
                      {orb.name}
                    </Text>
                    <Text
                      style={[
                        styles.itemMeta,
                        { color: getOrbRarityColor(orb.rarity) },
                      ]}
                    >
                      {orb.rarity.toUpperCase()}
                    </Text>
                    <Text
                      style={selected ? styles.selectedLabel : styles.itemMeta}
                    >
                      {selected ? "EQUIPPED" : "EQUIP"}
                    </Text>
                  </Pressable>
                );
              },
            )}
          </View>
          <Text style={styles.helperText}>
            Automatically targets nearby enemies and fires a laser.
          </Text>
          {!!orbMessage && (
            <Text style={styles.statusMessage}>{orbMessage}</Text>
          )}
        </View>
      );
    }

    const buddies = inventory.buddies
      .map((id) => getBuddy(id))
      .filter((buddy) => buddy !== undefined);
    if (playerLevel < 10) {
      return (
        <View style={styles.emptyArea}>
          <Text style={styles.sectionLabel}>
            BUDDY SYSTEM · UNLOCKS AT LEVEL 10
          </Text>
          <Text style={styles.helperText}>
            Reach player level 10 to unlock buddies and their permanent powers.
          </Text>
        </View>
      );
    }
    if (buddies.length === 0) {
      return (
        <View style={styles.emptyArea}>
          <Text style={styles.emptyText}>
            No buddies owned yet. Find a companion in the store.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => onOpenStore("buddy")}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>VISIT BUDDY STORE</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View style={styles.catalogGrid}>
        {buddies.map((buddy) => {
          const selected = inventory.equippedBuddy === buddy.id;
          return (
            <Pressable
              key={buddy.id}
              accessibilityRole="button"
              accessibilityLabel={`${selected ? "Unequip" : "Equip"} ${buddy.name}; ${getBuddyBonusSummary(buddy)}`}
              accessibilityState={{ selected }}
              onPress={() => onEquipBuddy(buddy.id)}
              style={[
                styles.itemCard,
                styles.buddyCard,
                selected && styles.itemCardSelected,
              ]}
            >
              <Image
                source={getRemoteAssetSource(
                  `game/functions/card/hero_card_${buddy.rarity}.png`,
                )}
                style={styles.itemCardBackground}
                contentFit="fill"
                pointerEvents="none"
              />
              <Image
                source={buddy.source}
                style={styles.buddyImage}
                contentFit="contain"
              />
              <Text numberOfLines={1} style={styles.itemName}>
                {buddy.name}
              </Text>
              <Text
                style={[
                  styles.itemMeta,
                  { color: getBuddyRarityColor(buddy.rarity) },
                ]}
              >
                {buddy.rarity.toUpperCase()}
              </Text>
              <Text style={selected ? styles.selectedLabel : styles.itemMeta}>
                {selected ? "EQUIPPED" : "EQUIP"}
              </Text>
              <Text numberOfLines={2} style={styles.buddyBonus}>
                {getBuddyBonusSummary(buddy)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  };

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to menu"
          onPress={onBack}
          style={styles.backButton}
        >
          <Text style={styles.backButtonText}>‹ MENU</Text>
        </Pressable>
        <View style={styles.titleGroup}>
          <Text style={styles.eyebrow}>WILD PAW · COLLECTION</Text>
          <Text style={styles.title}>Choose Your Hero</Text>
        </View>
        <View style={styles.balanceBadge}>
          <Image
            source={coinIcon}
            style={styles.coinIcon}
            contentFit="contain"
            accessibilityLabel="Coins"
          />
          <Text style={styles.balanceText}>{coinBalance.toLocaleString()}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.tabs}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {tabs.map((tab) => (
              <Pressable
                key={tab.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: selectionTab === tab.id }}
                onPress={() => onSelectionTabChange(tab.id)}
                style={[
                  styles.tab,
                  selectionTab === tab.id && styles.activeTab,
                ]}
              >
                <Text
                  style={[
                    styles.tabText,
                    selectionTab === tab.id && styles.activeTabText,
                  ]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <View style={[styles.storeBody, isCompact && styles.storeBodyCompact]}>
          <View style={styles.catalogPane}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.catalogScroll}
            >
              {renderCatalog()}
            </ScrollView>
          </View>
          <View
            style={[styles.detailPane, isCompact && styles.detailPaneCompact]}
          >
            <View
              style={[
                styles.detailImageFrame,
                { backgroundColor: selectedSkin.color },
              ]}
            >
              <Artwork
                source={getSkinImage(hero.id, selectedSkin.id)}
                size={116}
              />
            </View>
            <Text style={[styles.detailRarity, { color: hero.accent }]}>
              {hero.type.toUpperCase()} ·{" "}
              {(hero.rarity ?? "common").toUpperCase()}
            </Text>
            <Text style={styles.detailTitle}>{hero.name}</Text>
            <Text style={styles.detailSubtitle}>
              {selectedSkin.id
                ? `${selectedSkin.name} equipped`
                : "Default appearance"}
            </Text>
            <Text style={styles.detailDescription}>{hero.ability}</Text>
            <View style={styles.statRow}>
              {(["power", "speed", "defense"] as const).map((stat) => (
                <View key={stat} style={styles.statBox}>
                  <Text style={styles.statLabel}>{stat.toUpperCase()}</Text>
                  <Text style={styles.statValue}>{hero.stats[stat]}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
  storeBody: { flex: 1, flexDirection: "row", gap: 10, padding: 10 },
  storeBodyCompact: { flexDirection: "column-reverse" },
  catalogPane: { flex: 1.5, minHeight: 0 },
  catalogScroll: { flexGrow: 1, paddingBottom: 8 },
  catalogGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignContent: "flex-start",
    justifyContent: "center",
    gap: 8,
  },
  heroCollection: {
    flex: 1,
    minHeight: 278,
    gap: 8,
    paddingBottom: 4,
  },
  heroCollectionSection: {
    flex: 1,
    minHeight: 132,
  },
  horizontalCatalog: {
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 2,
    paddingVertical: 4,
  },
  horizontalItemCard: {
    width: 108,
    height: 112,
    minHeight: 0,
    padding: 5,
  },
  horizontalArtworkFrame: {
    width: 58,
    height: 58,
    borderRadius: 9,
  },
  skinEmptyState: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 10,
  },
  itemCard: {
    width: 112,
    minHeight: 142,
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
    backgroundColor: "rgba(48, 75, 35, 0.96)",
  },
  itemCardBackground: { ...StyleSheet.absoluteFill, opacity: 0.55 },
  artworkFrame: {
    width: 76,
    height: 76,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    marginBottom: 4,
  },
  itemName: {
    width: "100%",
    marginTop: 2,
    color: "#f0fdf4",
    fontSize: 10,
    fontWeight: "900",
    textAlign: "center",
  },
  itemMeta: {
    marginTop: 3,
    color: "#bef264",
    fontSize: 8,
    fontWeight: "900",
    textAlign: "center",
  },
  selectedLabel: {
    marginTop: 3,
    color: "#86efac",
    fontSize: 8,
    fontWeight: "900",
    textAlign: "center",
  },
  detailPane: {
    width: 280,
    minHeight: 0,
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(163, 230, 53, 0.28)",
    backgroundColor: "rgba(15, 35, 25, 0.86)",
  },
  detailPaneCompact: { width: "100%", minHeight: 205 },
  detailImageFrame: {
    width: 110,
    height: 100,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
  },
  detailRarity: {
    marginTop: 7,
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
  statRow: { flexDirection: "row", alignSelf: "stretch", gap: 6, marginTop: 8 },
  statBox: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "rgba(163, 230, 53, 0.1)",
  },
  statLabel: { color: "#9bb7aa", fontSize: 7, fontWeight: "900" },
  statValue: {
    marginTop: 2,
    color: "#d9f99d",
    fontSize: 13,
    fontWeight: "900",
  },
  emptyArea: {
    flex: 1,
    minHeight: 130,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 12,
  },
  emptyText: { color: "#cbd5e1", fontSize: 12, textAlign: "center" },
  secondaryButton: {
    minHeight: 34,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    borderRadius: 9,
    backgroundColor: "#a3e635",
  },
  secondaryButtonText: { color: "#14220b", fontSize: 9, fontWeight: "900" },
  companionContent: { alignItems: "center", gap: 9, paddingBottom: 10 },
  companionGrid: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "center",
  },
  companionCard: {
    width: 180,
    minHeight: 135,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(217, 249, 157, 0.25)",
    backgroundColor: "rgba(15, 35, 25, 0.94)",
  },
  companionImage: { width: 68, height: 68 },
  lockedCard: { opacity: 0.58 },
  sectionLabel: {
    width: "100%",
    marginTop: 4,
    color: "#bef264",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
    textAlign: "center",
  },
  orbSkinImage: { width: 74, height: 78 },
  helperText: { color: "#cbd5e1", fontSize: 10, textAlign: "center" },
  statusMessage: {
    color: "#bef264",
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center",
  },
  buddyCard: { minHeight: 154 },
  buddyImage: { width: 64, height: 58 },
  buddyBonus: {
    marginTop: 3,
    color: "#cbd5e1",
    fontSize: 8,
    textAlign: "center",
  },
});
