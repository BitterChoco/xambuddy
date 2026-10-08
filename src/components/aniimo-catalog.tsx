import { Image } from "expo-image";
import { router, type Href } from "expo-router";
import {
    FlatList,
    Pressable,
    ScrollView,
    StyleSheet,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AniimoEvolutionPath } from "@/components/reference-pages";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import catalog from "@/data/aniimos.json";
import { useTheme } from "@/hooks/use-theme";
import React, { useMemo, useState } from "react";

type Aniimo = {
  number: string;
  name: string;
  picture: string;
  information: string;
  habitat: string;
  skillTypes: string[];
  evolutionPath?: string[];
};

type SortBy = "name" | "number";

const ANIIMOS = catalog.aniimos as Aniimo[];
const SKILL_STYLES: Record<string, { icon: string; color: string }> = {
  Fire: { icon: "🔥", color: "#F97316" },
  Water: { icon: "💧", color: "#168BDE" },
  Earth: { icon: "🪨", color: "#92734E" },
  Air: { icon: "🌪️", color: "#8097AA" },
  Wind: { icon: "🌬️", color: "#56A89A" },
  Grass: { icon: "🌿", color: "#38A169" },
  Dark: { icon: "🌑", color: "#7865B2" },
  Ice: { icon: "❄️", color: "#52AFC9" },
  Electric: { icon: "⚡", color: "#D6A700" },
  Light: { icon: "✨", color: "#D29320" },
};

function SkillBadges({ skillTypes }: { skillTypes: string[] }) {
  return (
    <View style={styles.skillList}>
      {skillTypes.map((skill) => {
        const style = SKILL_STYLES[skill] ?? { icon: "✦", color: "#777777" };
        return (
          <View
            key={skill}
            style={[styles.skillBadge, { backgroundColor: `${style.color}18` }]}
          >
            <ThemedText style={styles.skillIcon}>{style.icon}</ThemedText>
            <ThemedText style={[styles.skillLabel, { color: style.color }]}>
              {skill}
            </ThemedText>
          </View>
        );
      })}
    </View>
  );
}

function CatalogHeader({
  query,
  setQuery,
  sortBy,
  setSortBy,
  ascending,
  setAscending,
  selectedSkill,
  setSelectedSkill,
  skills,
  resultCount,
}: {
  query: string;
  setQuery: (value: string) => void;
  sortBy: SortBy;
  setSortBy: (value: SortBy) => void;
  ascending: boolean;
  setAscending: (value: boolean) => void;
  selectedSkill: string;
  setSelectedSkill: (value: string) => void;
  skills: string[];
  resultCount: number;
}) {
  const theme = useTheme();

  return (
    <View style={styles.header}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <ThemedText type="title" style={styles.title}>
            Aniimo
          </ThemedText>
          <ThemedText themeColor="textSecondary">
            Your field guide to the Aniimo world.
          </ThemedText>
        </View>
        <View style={styles.countBubble}>
          <ThemedText type="smallBold">{resultCount}</ThemedText>
        </View>
      </View>

      <View
        style={[styles.searchBox, { backgroundColor: theme.backgroundElement }]}
      >
        <ThemedText style={styles.searchIcon}>⌕</ThemedText>
        <TextInput
          accessibilityLabel="Search Aniimo by name"
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name"
          placeholderTextColor={theme.textSecondary}
          returnKeyType="search"
          style={[styles.searchInput, { color: theme.text }]}
        />
        {query.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            onPress={() => setQuery("")}
            hitSlop={10}
          >
            <ThemedText themeColor="textSecondary">×</ThemedText>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.controlHeading}>
        <ThemedText type="smallBold">Sort by</ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Sort ${ascending ? "descending" : "ascending"}`}
          onPress={() => setAscending(!ascending)}
          style={styles.directionButton}
        >
          <ThemedText type="smallBold">{ascending ? "↑" : "↓"}</ThemedText>
        </Pressable>
      </View>
      <View style={styles.sortOptions}>
        <ChoiceChip
          label="Name"
          selected={sortBy === "name"}
          onPress={() => setSortBy("name")}
        />
        <ChoiceChip
          label="Aniimo number"
          selected={sortBy === "number"}
          onPress={() => setSortBy("number")}
        />
      </View>

      <ThemedText type="smallBold" style={styles.filterTitle}>
        Filter by skill type
      </ThemedText>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
      >
        <ChoiceChip
          label="All"
          selected={selectedSkill === "All"}
          onPress={() => setSelectedSkill("All")}
        />
        {skills.map((skill) => {
          const badge = SKILL_STYLES[skill] ?? { icon: "✦", color: "#777777" };
          return (
            <ChoiceChip
              key={skill}
              label={`${badge.icon} ${skill}`}
              selected={selectedSkill === skill}
              onPress={() => setSelectedSkill(skill)}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}

function ChoiceChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.choiceChip,
        {
          backgroundColor: selected ? "#242052" : theme.backgroundElement,
          borderColor: selected ? "#6C63FF" : "transparent",
        },
      ]}
    >
      <ThemedText
        type="smallBold"
        style={{ color: selected ? "#FFFFFF" : theme.text }}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
}

function AniimoCard({
  aniimo,
  onPress,
}: {
  aniimo: Aniimo;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View ${aniimo.name}, Aniimo number ${aniimo.number}`}
      onPress={onPress}
      style={({ pressed }) => [styles.cardPressable, pressed && styles.pressed]}
    >
      <ThemedView type="backgroundElement" style={styles.card}>
        <Image
          source={{ uri: aniimo.picture }}
          contentFit="cover"
          transition={180}
          style={styles.cardImage}
        />
        <View style={styles.cardContent}>
          <View style={styles.cardTitleRow}>
            <View style={styles.cardTitleCopy}>
              <ThemedText
                type="smallBold"
                style={styles.name}
                numberOfLines={1}
              >
                {aniimo.name}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                No. {aniimo.number}
              </ThemedText>
            </View>
            <ThemedText
              style={[styles.chevron, { color: theme.textSecondary }]}
            >
              ›
            </ThemedText>
          </View>
          <SkillBadges skillTypes={aniimo.skillTypes} />
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            Habitat · {aniimo.habitat}
          </ThemedText>
        </View>
      </ThemedView>
    </Pressable>
  );
}

function AniimoDetails({
  aniimo,
  onBack,
  onSelectAniimo,
}: {
  aniimo: Aniimo;
  onBack: () => void;
  onSelectAniimo: (aniimo: Aniimo) => void;
}) {
  const theme = useTheme();
  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.background }]}
    >
      <ScrollView
        contentContainerStyle={styles.detailContent}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Aniimo list"
          onPress={onBack}
          style={styles.backButton}
        >
          <ThemedText style={styles.backArrow}>‹</ThemedText>
          <ThemedText type="smallBold">Aniimo list</ThemedText>
        </Pressable>

        <View style={styles.detailImageFrame}>
          <Image
            source={{ uri: aniimo.picture }}
            contentFit="contain"
            transition={200}
            style={styles.detailImage}
          />
        </View>

        <View style={styles.detailHeading}>
          <View style={styles.detailTitleCopy}>
            <ThemedText type="title" style={styles.detailTitle}>
              {aniimo.name}
            </ThemedText>
            <ThemedText themeColor="textSecondary">
              ANIIMO NO. {aniimo.number}
            </ThemedText>
          </View>
          <View style={styles.numberBadge}>
            <ThemedText type="smallBold">#{aniimo.number}</ThemedText>
          </View>
        </View>

        <View style={styles.detailSection}>
          <ThemedText type="smallBold">Skill type</ThemedText>
          <SkillBadges skillTypes={aniimo.skillTypes} />
        </View>

        <DetailInfoCard title="Information" text={aniimo.information} />
        <View style={styles.detailSection}>
          <View style={styles.detailSubheading}>
            <ThemedText type="smallBold">Habitat</ThemedText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open habitat map"
              onPress={() => router.push("/map" as Href)}
              style={styles.mapLink}
            >
              <ThemedText style={styles.mapLinkIcon}>🗺️</ThemedText>
              <ThemedText type="smallBold" style={styles.mapLinkText}>
                Open map
              </ThemedText>
            </Pressable>
          </View>
          <DetailInfoCard title="" text={aniimo.habitat} />
        </View>

        <View style={styles.detailSection}>
          <ThemedText type="smallBold">Evolution path</ThemedText>
          <AniimoEvolutionPath
            aniimo={aniimo}
            pathNumbers={aniimo.evolutionPath ?? []}
            onSelect={onSelectAniimo}
          />
        </View>

        <ThemedText
          type="small"
          themeColor="textSecondary"
          style={styles.sourceNote}
        >
          Update this Aniimo&apos;s picture and field notes in
          src/data/aniimos.json.
        </ThemedText>
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailInfoCard({ title, text }: { title: string; text: string }) {
  return (
    <ThemedView type="backgroundElement" style={styles.infoCard}>
      <ThemedText type="smallBold">{title}</ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.infoText}>
        {text}
      </ThemedText>
    </ThemedView>
  );
}

export default function AniimoCatalogScreen() {
  const theme = useTheme();
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("number");
  const [ascending, setAscending] = useState(true);
  const [selectedSkill, setSelectedSkill] = useState("All");
  const [selectedAniimo, setSelectedAniimo] = useState<Aniimo | null>(null);

  const skills = useMemo(
    () =>
      Array.from(
        new Set(ANIIMOS.flatMap((aniimo) => aniimo.skillTypes)),
      ).sort(),
    [],
  );
  const filteredAniimos = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return ANIIMOS.filter((aniimo) => {
      const matchesName = aniimo.name
        .toLocaleLowerCase()
        .includes(normalizedQuery);
      const matchesSkill =
        selectedSkill === "All" || aniimo.skillTypes.includes(selectedSkill);
      return matchesName && matchesSkill;
    }).sort((a, b) => {
      const comparison =
        sortBy === "name"
          ? a.name.localeCompare(b.name)
          : Number(a.number) - Number(b.number);
      return ascending ? comparison : -comparison;
    });
  }, [ascending, query, selectedSkill, sortBy]);

  if (selectedAniimo) {
    return (
      <AniimoDetails
        aniimo={selectedAniimo}
        onBack={() => setSelectedAniimo(null)}
        onSelectAniimo={setSelectedAniimo}
      />
    );
  }

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.background }]}
    >
      <FlatList
        data={filteredAniimos}
        keyExtractor={(aniimo) => aniimo.number}
        renderItem={({ item }) => (
          <AniimoCard aniimo={item} onPress={() => setSelectedAniimo(item)} />
        )}
        ListHeaderComponent={
          <CatalogHeader
            query={query}
            setQuery={setQuery}
            sortBy={sortBy}
            setSortBy={setSortBy}
            ascending={ascending}
            setAscending={setAscending}
            selectedSkill={selectedSkill}
            setSelectedSkill={setSelectedSkill}
            skills={skills}
            resultCount={filteredAniimos.length}
          />
        }
        ListEmptyComponent={
          <ThemedView type="backgroundElement" style={styles.emptyState}>
            <ThemedText type="subtitle" style={styles.emptyIcon}>
              ◌
            </ThemedText>
            <ThemedText type="smallBold">No Aniimo found</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Try another name or skill type.
            </ThemedText>
          </ThemedView>
        }
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.cardSeparator} />}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  listContent: {
    width: "100%",
    maxWidth: 800,
    alignSelf: "center",
    paddingHorizontal: Spacing.three,
    paddingBottom: 100,
  },
  header: {
    gap: Spacing.three,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.three,
  },
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headingCopy: {
    gap: Spacing.one,
  },
  title: {
    fontSize: 36,
    lineHeight: 42,
  },
  countBubble: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E9E7FF",
  },
  searchBox: {
    minHeight: 50,
    borderRadius: 16,
    paddingHorizontal: Spacing.three,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  searchIcon: {
    fontSize: 26,
    lineHeight: 30,
  },
  searchInput: {
    flex: 1,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  controlHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  directionButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E9E7FF",
  },
  sortOptions: {
    flexDirection: "row",
    gap: Spacing.two,
  },
  choiceChip: {
    minHeight: 38,
    paddingHorizontal: Spacing.three,
    borderWidth: 1,
    borderRadius: 20,
    justifyContent: "center",
  },
  filterTitle: {
    marginBottom: -Spacing.two,
  },
  filters: {
    gap: Spacing.two,
    paddingVertical: Spacing.one,
    paddingRight: Spacing.three,
  },
  cardPressable: {
    borderRadius: 20,
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.99 }],
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
    borderRadius: 20,
  },
  cardImage: {
    width: 108,
    height: 124,
    backgroundColor: "#E5E2F8",
  },
  cardContent: {
    flex: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: Spacing.two,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.one,
  },
  cardTitleCopy: {
    flex: 1,
    gap: Spacing.one,
  },
  name: {
    fontSize: 18,
  },
  chevron: {
    fontSize: 25,
  },
  skillList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.one,
  },
  skillBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: 12,
  },
  skillIcon: {
    fontSize: 14,
  },
  skillLabel: {
    fontSize: 12,
    fontWeight: "700",
  },
  cardSeparator: {
    height: Spacing.two,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.five,
    borderRadius: 20,
    gap: Spacing.two,
  },
  emptyIcon: {
    color: "#6C63FF",
  },
  detailContent: {
    width: "100%",
    maxWidth: 800,
    alignSelf: "center",
    padding: Spacing.three,
    paddingBottom: 100,
    gap: Spacing.three,
  },
  backButton: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: Spacing.two,
    paddingRight: Spacing.three,
  },
  backArrow: {
    fontSize: 34,
    lineHeight: 38,
    color: "#6C63FF",
  },
  detailImageFrame: {
    height: 340,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "#E9E7FF",
  },
  detailImage: {
    width: "100%",
    height: "100%",
  },
  detailHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: Spacing.two,
  },
  detailTitleCopy: {
    gap: Spacing.one,
  },
  detailTitle: {
    fontSize: 34,
    lineHeight: 40,
  },
  numberBadge: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    backgroundColor: "#E9E7FF",
    borderRadius: 16,
  },
  detailSection: {
    gap: Spacing.two,
  },
  detailSubheading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  mapLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: 12,
    backgroundColor: "#E9E7FF",
  },
  mapLinkIcon: {
    fontSize: 16,
  },
  mapLinkText: {
    color: "#5149C8",
  },
  infoCard: {
    padding: Spacing.three,
    borderRadius: 18,
    gap: Spacing.two,
  },
  infoText: {
    lineHeight: 23,
  },
  sourceNote: {
    lineHeight: 20,
    textAlign: "center",
  },
});
