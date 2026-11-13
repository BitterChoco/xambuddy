import { Image } from "expo-image";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { getRemoteAssetSource } from "@/services/remote-assets";

const tasksBackdrop = require("@/assets/images/background_1.png");
const tasksIcon = getRemoteAssetSource("game/icons/task_1.png");

const taskPreviews = [
  {
    icon: "⚔",
    title: "Into the Wild",
    description: "Complete a match in the arena.",
  },
  {
    icon: "✦",
    title: "Garden Guardian",
    description: "Defeat enemies and protect the garden.",
  },
  {
    icon: "◈",
    title: "Gather Your Rewards",
    description: "Collect helpful items during your adventure.",
  },
];

export default function TasksScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <Image
        source={tasksBackdrop}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        pointerEvents="none"
      />
      <View style={styles.scrim} />
      <View style={styles.page}>
        <View style={styles.header}>
          <PressableBack />
          <View style={styles.titleGroup}>
            <Text style={styles.eyebrow}>WILD PAW · MISSIONS</Text>
            <Text style={styles.title}>Daily Tasks</Text>
          </View>
          <Image
            source={tasksIcon}
            style={styles.headerIcon}
            contentFit="contain"
            accessibilityLabel="Daily tasks"
          />
        </View>

        <View style={styles.card}>
          <View style={styles.tabs}>
            <View style={[styles.tab, styles.activeTab]}>
              <Text style={[styles.tabText, styles.activeTabText]}>DAILY</Text>
            </View>
            <View style={styles.refreshBadge}>
              <Text style={styles.refreshText}>REFRESHES DAILY</Text>
            </View>
          </View>
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.introCard}>
              <View style={styles.introIconFrame}>
                <Image
                  source={tasksIcon}
                  style={styles.introIcon}
                  contentFit="contain"
                />
              </View>
              <View style={styles.introTextGroup}>
                <View style={styles.previewBadge}>
                  <Text style={styles.previewBadgeText}>
                    MISSION BOARD PREVIEW
                  </Text>
                </View>
                <Text style={styles.introTitle}>A new adventure every day</Text>
                <Text style={styles.introDescription}>
                  Daily task progress and rewards are coming soon. Here’s a
                  preview of the missions you’ll be able to take on.
                </Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>UPCOMING TASKS</Text>
            <View style={styles.taskList}>
              {taskPreviews.map((task) => (
                <View key={task.title} style={styles.taskRow}>
                  <View style={styles.taskIconFrame}>
                    <Text style={styles.taskIcon}>{task.icon}</Text>
                  </View>
                  <View style={styles.taskDetails}>
                    <Text style={styles.taskTitle}>{task.title}</Text>
                    <Text style={styles.taskDescription}>
                      {task.description}
                    </Text>
                  </View>
                  <View style={styles.soonBadge}>
                    <Text style={styles.soonText}>SOON</Text>
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      </View>
    </SafeAreaView>
  );
}

function PressableBack() {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back to menu"
      onPress={() => router.back()}
      style={styles.backButton}
    >
      <Text style={styles.backButtonText}>‹ MENU</Text>
    </Pressable>
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
    maxWidth: 1000,
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
    letterSpacing: 2,
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
    minHeight: 39,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(217, 249, 157, 0.15)",
  },
  tab: {
    minWidth: 100,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch",
    paddingHorizontal: 10,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  activeTab: { borderBottomColor: "#a3e635" },
  tabText: {
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  activeTabText: { color: "#d9f99d" },
  refreshBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(163, 230, 53, 0.12)",
  },
  refreshText: {
    color: "#bef264",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  content: { flexGrow: 1, padding: 12, gap: 16 },
  introCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 15,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(163, 230, 53, 0.35)",
    backgroundColor: "rgba(15, 35, 25, 0.94)",
  },
  introIconFrame: {
    width: 64,
    height: 64,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(163, 230, 53, 0.4)",
    backgroundColor: "rgba(163, 230, 53, 0.1)",
  },
  introIcon: { width: 38, height: 38 },
  introTextGroup: { flex: 1 },
  previewBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(163, 230, 53, 0.15)",
  },
  previewBadgeText: {
    color: "#bef264",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1,
  },
  introTitle: {
    marginTop: 7,
    color: "#f0fdf4",
    fontSize: 18,
    fontWeight: "900",
  },
  introDescription: {
    marginTop: 4,
    color: "#cbd5e1",
    fontSize: 11,
    lineHeight: 16,
  },
  sectionTitle: {
    marginBottom: -8,
    color: "#a3e635",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.6,
  },
  taskList: { gap: 8 },
  taskRow: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 10,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(217, 249, 157, 0.16)",
    backgroundColor: "rgba(5, 18, 14, 0.82)",
  },
  taskIconFrame: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: "rgba(163, 230, 53, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(163, 230, 53, 0.28)",
  },
  taskIcon: { color: "#d9f99d", fontSize: 19, fontWeight: "900" },
  taskDetails: { flex: 1 },
  taskTitle: { color: "#f0fdf4", fontSize: 12, fontWeight: "900" },
  taskDescription: { marginTop: 3, color: "#94a3b8", fontSize: 10 },
  soonBadge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(148, 163, 184, 0.12)",
  },
  soonText: {
    color: "#cbd5e1",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
});
