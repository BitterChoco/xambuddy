import { ScrollView, StyleSheet, useColorScheme, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import React from "react";

export default function SettingsScreen() {
  const theme = useTheme();
  const scheme = useColorScheme();
  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.background }]}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="title" style={styles.title}>
          Settings
        </ThemedText>
        <ThemedText themeColor="textSecondary">
          Manage your XamBuddy experience.
        </ThemedText>
        <ThemedView type="backgroundElement" style={styles.card}>
          <View style={styles.row}>
            <View style={styles.copy}>
              <ThemedText type="smallBold">Appearance</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Follows your device theme
              </ThemedText>
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              {scheme === "dark" ? "Dark" : "Light"}
            </ThemedText>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <View style={styles.copy}>
              <ThemedText type="smallBold">XamBuddy</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Your Aniimo field guide
              </ThemedText>
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              v1.0.0
            </ThemedText>
          </View>
        </ThemedView>
        <ThemedText
          type="small"
          themeColor="textSecondary"
          style={styles.footer}
        >
          Keep learning, one step at a time.
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
    padding: Spacing.four,
    gap: Spacing.two,
  },
  title: { fontSize: 34, lineHeight: 42, marginBottom: Spacing.one },
  card: {
    borderRadius: 18,
    paddingHorizontal: Spacing.three,
    marginTop: Spacing.three,
  },
  row: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.three,
  },
  copy: { flex: 1, gap: Spacing.one },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: "#88888855" },
  footer: { textAlign: "center", marginTop: Spacing.four },
});
