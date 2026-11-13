import {
    DEFAULT_PROFILE_PICTURE,
    PROFILE_PICTURES,
    isProfilePictureId,
} from "@/constants/game-catalog";
import {
    getPlayerLevelProgress,
    getPlayerXp,
} from "@/constants/player-experience";
import { getPlayerHighScore } from "@/constants/player-high-score";
import { getRemoteAssetSource } from "@/services/remote-assets";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const PROFILE_STORAGE_KEY = "wild-paw.player-profile";
const rankBackdrop = require("@/assets/images/background_1.png");
const rankIcon = getRemoteAssetSource("game/icons/rank_1.png");

type RankTab = "score" | "level";
type RankPlayer = {
  name: string;
  picture: string;
  highScore: number;
  level: number;
  totalXp: number;
};

export default function RankScreen() {
  const [activeTab, setActiveTab] = useState<RankTab>("score");
  const [player, setPlayer] = useState<RankPlayer>({
    name: "Player 1",
    picture: DEFAULT_PROFILE_PICTURE,
    highScore: 0,
    level: 1,
    totalXp: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    void Promise.all([
      AsyncStorage.getItem(PROFILE_STORAGE_KEY),
      getPlayerHighScore(),
      getPlayerXp(),
    ])
      .then(([storedProfile, highScore, totalXp]) => {
        if (!mounted) return;

        let name = highScore.playerName || "Player 1";
        let picture = DEFAULT_PROFILE_PICTURE;
        if (storedProfile) {
          try {
            const profile = JSON.parse(storedProfile) as {
              name?: unknown;
              picture?: unknown;
              avatar?: unknown;
            };
            if (typeof profile.name === "string" && profile.name.trim()) {
              name = profile.name.trim().slice(0, 20);
            }
            const savedPicture = profile.picture ?? profile.avatar;
            if (isProfilePictureId(savedPicture)) picture = savedPicture;
          } catch {
            // Use the saved high-score name and default profile image.
          }
        }

        setPlayer({
          name,
          picture,
          highScore: highScore.score,
          level: getPlayerLevelProgress(totalXp).level,
          totalXp,
        });
      })
      .catch(() => undefined)
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const isScoreTab = activeTab === "score";

  return (
    <SafeAreaView style={styles.safeArea}>
      <Image
        source={rankBackdrop}
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
            <Text style={styles.eyebrow}>WILD PAW · COMMUNITY</Text>
            <Text style={styles.title}>Player Rankings</Text>
          </View>
          <Image
            source={rankIcon}
            style={styles.headerIcon}
            contentFit="contain"
            accessibilityLabel="Rank"
          />
        </View>

        <View style={styles.card}>
          <View style={styles.tabs}>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: isScoreTab }}
              onPress={() => setActiveTab("score")}
              style={[styles.tab, isScoreTab && styles.activeTab]}
            >
              <Text
                style={[styles.tabText, isScoreTab && styles.activeTabText]}
              >
                HIGH SCORE
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: !isScoreTab }}
              onPress={() => setActiveTab("level")}
              style={[styles.tab, !isScoreTab && styles.activeTab]}
            >
              <Text
                style={[styles.tabText, !isScoreTab && styles.activeTabText]}
              >
                PLAYER LEVEL
              </Text>
            </Pressable>
          </View>

          <View style={styles.listHeader}>
            <View>
              <Text style={styles.listTitle}>
                {isScoreTab
                  ? "HIGH SCORE LEADERBOARD"
                  : "PLAYER LEVEL LEADERBOARD"}
              </Text>
              <Text style={styles.listSubtitle}>YOUR LOCAL PLAYER PROFILE</Text>
            </View>
            <View style={styles.localBadge}>
              <Text style={styles.localBadgeText}>LOCAL</Text>
            </View>
          </View>

          <ScrollView
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {isLoading ? (
              <View style={styles.loadingState}>
                <ActivityIndicator color="#a3e635" />
                <Text style={styles.loadingText}>Loading player rank…</Text>
              </View>
            ) : (
              <View style={styles.playerRow}>
                <View style={styles.rankPosition}>
                  <Text style={styles.rankNumber}>#1</Text>
                </View>
                <View style={styles.avatarFrame}>
                  <Image
                    source={
                      PROFILE_PICTURES[player.picture] ??
                      PROFILE_PICTURES[DEFAULT_PROFILE_PICTURE]
                    }
                    style={styles.avatar}
                    contentFit="cover"
                    accessibilityLabel={`${player.name}'s profile picture`}
                  />
                </View>
                <View style={styles.playerDetails}>
                  <View style={styles.playerNameRow}>
                    <Text numberOfLines={1} style={styles.playerName}>
                      {player.name}
                    </Text>
                    <View style={styles.youBadge}>
                      <Text style={styles.youBadgeText}>YOU</Text>
                    </View>
                  </View>
                  <Text style={styles.playerDetail}>
                    {isScoreTab
                      ? "PERSONAL BEST"
                      : `${player.totalXp.toLocaleString()} TOTAL XP`}
                  </Text>
                </View>
                <Text style={styles.playerValue}>
                  {isScoreTab
                    ? player.highScore.toLocaleString()
                    : `LEVEL ${player.level}`}
                </Text>
              </View>
            )}

            {!isLoading && (
              <View style={styles.futureNotice}>
                <Text style={styles.futureIcon}>✦</Text>
                <View style={styles.futureTextGroup}>
                  <Text style={styles.futureTitle}>
                    Community rankings are coming
                  </Text>
                  <Text style={styles.futureDescription}>
                    This list currently shows your saved record on this device.
                    Friends and global player rankings can be added here later.
                  </Text>
                </View>
              </View>
            )}
          </ScrollView>
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
    flexDirection: "row",
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(217, 249, 157, 0.15)",
  },
  tab: {
    minWidth: 120,
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 9,
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
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  listTitle: {
    color: "#f0fdf4",
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  listSubtitle: {
    marginTop: 2,
    color: "#94a3b8",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1,
  },
  localBadge: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(163, 230, 53, 0.35)",
    backgroundColor: "rgba(163, 230, 53, 0.1)",
  },
  localBadgeText: {
    color: "#bef264",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  listContent: { flexGrow: 1, paddingHorizontal: 12, paddingBottom: 14 },
  playerRow: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(163, 230, 53, 0.32)",
    backgroundColor: "rgba(15, 35, 25, 0.94)",
  },
  rankPosition: { width: 28, alignItems: "center" },
  rankNumber: { color: "#bef264", fontSize: 15, fontWeight: "900" },
  avatarFrame: {
    width: 40,
    height: 40,
    padding: 2,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "rgba(217, 249, 157, 0.62)",
    backgroundColor: "rgba(5, 18, 14, 0.9)",
  },
  avatar: { width: 32, height: 32, borderRadius: 9 },
  playerDetails: { flex: 1, minWidth: 0 },
  playerNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  playerName: {
    flexShrink: 1,
    color: "#f0fdf4",
    fontSize: 12,
    fontWeight: "900",
  },
  youBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(163, 230, 53, 0.18)",
  },
  youBadgeText: { color: "#bef264", fontSize: 7, fontWeight: "900" },
  playerDetail: {
    marginTop: 3,
    color: "#94a3b8",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  playerValue: {
    marginLeft: 4,
    color: "#d9f99d",
    fontSize: 14,
    fontWeight: "900",
    textAlign: "right",
  },
  loadingState: {
    flex: 1,
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  loadingText: { color: "#cbd5e1", fontSize: 11, fontWeight: "700" },
  futureNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.2)",
    backgroundColor: "rgba(15, 23, 42, 0.3)",
  },
  futureIcon: { color: "#bef264", fontSize: 16, fontWeight: "900" },
  futureTextGroup: { flex: 1, gap: 3 },
  futureTitle: { color: "#d9f99d", fontSize: 10, fontWeight: "900" },
  futureDescription: { color: "#a8b4c3", fontSize: 9, lineHeight: 13 },
});
