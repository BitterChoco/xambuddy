import { Image } from "expo-image";
import { Link, type Href } from "expo-router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import events from "@/data/events.json";
import regions from "@/data/regions.json";
import { useTheme } from "@/hooks/use-theme";
import React from "react";

const tiles = [
  {
    title: "World map",
    description: "Explore regions, habitats, and Aniimo sightings.",
    href: "/map",
    icon: "🗺️",
    picture: regions.regions[0].thumbnail,
  },
  {
    title: "Events",
    description: `${events.events.length} event notes and rewards`,
    href: "/events",
    icon: "🎉",
  },
  {
    title: "Redeem codes",
    description: "Codes, rewards, and expiry notes",
    href: "/codes",
    icon: "🎁",
  },
  {
    title: "Skill counters",
    description: "Quick type-matchup reference",
    href: "/counters",
    icon: "⚔️",
  },
  {
    title: "Aniimo catalog",
    description: "Search, filter, and browse Aniimo",
    href: "/explore",
    icon: "✨",
  },
] as const;

export default function HomeHub() {
  const theme = useTheme();

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.background }]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.brandMark}>
            <ThemedText style={styles.brandIcon}>✦</ThemedText>
          </View>
          <ThemedText type="title" style={styles.title}>
            XamBuddy
          </ThemedText>
          <ThemedText themeColor="textSecondary">
            Your Aniimo field guide
          </ThemedText>
        </View>

        <View style={styles.sectionHeading}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            Explore
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Maps, events, codes, and battle notes
          </ThemedText>
        </View>

        <View style={styles.tileList}>
          {tiles.map((tile) => (
            <Link key={tile.href} href={tile.href as Href} asChild>
              <Pressable
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.tilePressable,
                  pressed && styles.pressed,
                ]}
              >
                <ThemedView type="backgroundElement" style={styles.tile}>
                  {"picture" in tile ? (
                    <Image
                      source={{ uri: tile.picture }}
                      contentFit="cover"
                      style={styles.tilePicture}
                    />
                  ) : tile.title === "Skill counters" ? (
                    <View
                      style={[
                        styles.counterPreview,
                        { backgroundColor: theme.backgroundSelected },
                      ]}
                    >
                      <ThemedText style={styles.counterIcons}>
                        🔥 💧 🌿
                      </ThemedText>
                      <ThemedText type="smallBold" style={styles.counterVersus}>
                        VS
                      </ThemedText>
                      <ThemedText style={styles.counterIcons}>
                        ⚡ ❄️ 🌑
                      </ThemedText>
                    </View>
                  ) : (
                    <View
                      style={[
                        styles.tileIcon,
                        { backgroundColor: theme.backgroundSelected },
                      ]}
                    >
                      <ThemedText style={styles.iconText}>
                        {tile.icon}
                      </ThemedText>
                    </View>
                  )}
                  <View style={styles.tileCopy}>
                    <ThemedText type="smallBold" style={styles.tileTitle}>
                      {tile.title}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {tile.description}
                    </ThemedText>
                  </View>
                  <ThemedText
                    style={[styles.chevron, { color: theme.textSecondary }]}
                  >
                    ›
                  </ThemedText>
                </ThemedView>
              </Pressable>
            </Link>
          ))}
        </View>

        <ThemedText
          type="small"
          themeColor="textSecondary"
          style={styles.editHint}
        >
          Reference lists can be updated in the JSON files under src/data.
        </ThemedText>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 800,
    alignSelf: "center",
    padding: Spacing.three,
    paddingBottom: 100,
    gap: Spacing.four,
  },
  header: { alignItems: "center", gap: Spacing.one, paddingTop: Spacing.three },
  brandMark: {
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: "#6C63FF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.two,
  },
  brandIcon: { fontSize: 32, color: "#FFFFFF" },
  title: { fontSize: 34, lineHeight: 40 },
  sectionHeading: { gap: Spacing.one, marginTop: Spacing.two },
  sectionTitle: { fontSize: 24, lineHeight: 30 },
  tileList: { gap: Spacing.two },
  tilePressable: { borderRadius: 18 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  tile: {
    minHeight: 96,
    borderRadius: 18,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    paddingRight: Spacing.three,
    gap: Spacing.three,
  },
  tilePicture: { width: 100, height: 96, backgroundColor: "#DCE9E2" },
  tileIcon: {
    width: 70,
    height: 70,
    borderRadius: 18,
    marginLeft: Spacing.two,
    alignItems: "center",
    justifyContent: "center",
  },
  iconText: { fontSize: 32 },
  counterPreview: {
    width: 100,
    height: 96,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  counterIcons: { fontSize: 17 },
  counterVersus: { color: "#6C63FF", fontSize: 10 },
  tileCopy: { flex: 1, gap: Spacing.one },
  tileTitle: { fontSize: 17 },
  chevron: { fontSize: 27 },
  editHint: { textAlign: "center", marginTop: Spacing.one },
});
