import { BackIcon } from "@/components/ui/back-icon";
import { SoundPressable as Pressable } from "@/components/ui/sound-pressable";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  loadRedeemCodes,
  redeemCode,
  type RedeemCode,
} from "@/services/redeem-codes";
import { getRemoteAssetSource } from "@/services/remote-assets";
import {
  claimAdReward,
  getAdState,
  loadAdRewards,
  type AdReward,
  type AdState,
} from "@/services/watch-ads";
import {
  claimLoginReward,
  getLoginRoadmapState,
  loadLoginRewards,
  type LoginReward,
  type LoginRoadmapState,
} from "@/services/weekly-login";

const eventBackdrop = require("@/assets/images/background_1.png");
const eventIcon = getRemoteAssetSource("game/icons/calendar_1.png");
const watchAdsIcon = getRemoteAssetSource("game/icons/watch_ads_1.png");
const weeklyRewardIcons = {
  coin: getRemoteAssetSource("game/icons/coins_1.png"),
  exp: getRemoteAssetSource("game/icons/xp_1.png"),
  diamond: getRemoteAssetSource("game/icons/diamond_1.png"),
};

export default function EventScreen() {
  const [activeTab, setActiveTab] = useState<"events" | "redeem">("events");
  const [codes, setCodes] = useState<RedeemCode[]>([]);
  const [codeInput, setCodeInput] = useState("");
  const [message, setMessage] = useState("");
  const [messageIsSuccess, setMessageIsSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [weeklyRewards, setWeeklyRewards] = useState<LoginReward[]>([]);
  const [weeklyState, setWeeklyState] = useState<LoginRoadmapState | null>(
    null,
  );
  const [weeklyMessage, setWeeklyMessage] = useState("");
  const [isClaimingWeekly, setIsClaimingWeekly] = useState(false);
  const [adRewards, setAdRewards] = useState<AdReward[]>([]);
  const [adState, setAdState] = useState<AdState | null>(null);
  const [adMessage, setAdMessage] = useState("");
  const [adMessageStatus, setAdMessageStatus] = useState<
    "loading" | "success" | "error" | null
  >(null);
  const [isClaimingAd, setIsClaimingAd] = useState(false);

  useEffect(() => {
    let isMounted = true;
    void loadAdRewards()
      .then(async (rewards) => {
        const state = await getAdState();
        if (!isMounted) return;
        setAdRewards(rewards);
        setAdState(state);
      })
      .catch(() => undefined);
    return () => {
      isMounted = false;
    };
  }, []);

  const claimAd = async () => {
    if (isClaimingAd) return;
    setIsClaimingAd(true);
    setAdMessage("Checking for an available ad…");
    setAdMessageStatus("loading");
    try {
      const { state, outcome } = await claimAdReward(adRewards);
      setAdState(state);
      const message =
        outcome === "claimed"
          ? "Reward sent to your email. Open the mailbox to claim it."
          : outcome === "dismissed"
            ? "Watch the full ad to earn the reward."
            : outcome === "unavailable"
              ? "No ads are available right now. Please try again later."
              : "";
      setAdMessage(message);
      setAdMessageStatus(
        outcome === "claimed" ? "success" : outcome === "none" ? null : "error",
      );
    } catch {
      setAdMessage("Could not claim your reward. Please try again.");
      setAdMessageStatus("error");
    } finally {
      setIsClaimingAd(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    void loadLoginRewards()
      .then(async (rewards) => {
        const state = await getLoginRoadmapState(rewards);
        if (!isMounted) return;
        setWeeklyRewards(rewards);
        setWeeklyState(state);
      })
      .catch(() => undefined);
    return () => {
      isMounted = false;
    };
  }, []);

  const claimWeekly = async () => {
    if (isClaimingWeekly) return;
    setIsClaimingWeekly(true);
    try {
      setWeeklyState(await claimLoginReward(weeklyRewards));
      setWeeklyMessage(
        "Reward sent to your email. Open the mailbox to claim it.",
      );
    } catch {
      setWeeklyMessage("Could not claim your reward. Please try again.");
    } finally {
      setIsClaimingWeekly(false);
    }
  };

  const refreshCodes = useCallback(async () => {
    setIsLoading(true);
    try {
      const loadedCodes = await loadRedeemCodes();
      setCodes(loadedCodes);
      setMessage("");
    } catch {
      setMessage(
        "Could not load event rewards. Check your connection and retry.",
      );
      setMessageIsSuccess(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    void loadRedeemCodes()
      .then((loadedCodes) => {
        if (!isMounted) return;
        setCodes(loadedCodes);
        setMessage("");
      })
      .catch(() => {
        if (!isMounted) return;
        setMessage(
          "Could not load event rewards. Check your connection and retry.",
        );
        setMessageIsSuccess(false);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const submitCode = async () => {
    if (isRedeeming) return;
    setIsRedeeming(true);
    setMessage("");
    try {
      const result = await redeemCode(codeInput, codes);
      setMessage(result.message);
      setMessageIsSuccess(result.success);
      if (result.success) setCodeInput("");
    } catch {
      setMessage("Could not redeem this code. Please try again.");
      setMessageIsSuccess(false);
    } finally {
      setIsRedeeming(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Image
        source={eventBackdrop}
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
            <BackIcon />
          </Pressable>
          <View style={styles.titleGroup}>
            <Text style={styles.eyebrow}>WILD PAW · COMMUNITY</Text>
            <Text style={styles.title}>Events & Rewards</Text>
          </View>
          <Image
            source={eventIcon}
            style={styles.headerIcon}
            contentFit="contain"
            accessibilityLabel="Events"
          />
        </View>

        <View style={styles.card}>
          <View style={styles.tabs}>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === "events" }}
              onPress={() => {
                setActiveTab("events");
                setMessage("");
              }}
              style={[styles.tab, activeTab === "events" && styles.activeTab]}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === "events" && styles.activeTabText,
                ]}
              >
                EVENTS
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === "redeem" }}
              onPress={() => {
                setActiveTab("redeem");
                setMessage("");
              }}
              style={[styles.tab, activeTab === "redeem" && styles.activeTab]}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === "redeem" && styles.activeTabText,
                ]}
              >
                REDEEM CODE
              </Text>
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            {activeTab === "events" ? (
              <View style={styles.eventsColumn}>
                {weeklyRewards.length > 0 && weeklyState && (
                  <View style={styles.weeklyPanel}>
                    <Text style={styles.eventBadgeText}>
                      DAILY LOGIN REWARDS
                    </Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.roadmapRow}
                    >
                      {weeklyRewards.map((reward, index) => {
                        const completed =
                          reward.day <= weeklyState.completedDays;
                        const canClaim =
                          reward.day === weeklyState.claimableDay;
                        return (
                          <View key={reward.day} style={styles.roadmapStep}>
                            {index > 0 && (
                              <View
                                style={[
                                  styles.roadmapLine,
                                  completed && styles.roadmapLineDone,
                                ]}
                              />
                            )}
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Day ${reward.day} reward, ${completed ? "collected" : canClaim ? "tap to claim" : "locked"}`}
                              accessibilityState={{ disabled: !canClaim }}
                              disabled={!canClaim || isClaimingWeekly}
                              onPress={() => void claimWeekly()}
                              style={styles.roadmapNodeWrap}
                            >
                              <View
                                style={[
                                  styles.roadmapNode,
                                  completed && styles.roadmapNodeDone,
                                  canClaim && styles.roadmapNodeActive,
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.roadmapNodeText,
                                    completed && styles.roadmapNodeTextDone,
                                  ]}
                                >
                                  {completed ? "✓" : reward.day}
                                </Text>
                              </View>
                              <Text style={styles.roadmapDay}>
                                {canClaim ? "CLAIM" : `DAY ${reward.day}`}
                              </Text>
                              {reward.rewards.map((item) => (
                                <View
                                  key={item.id}
                                  style={styles.roadmapReward}
                                >
                                  <Image
                                    source={weeklyRewardIcons[item.id]}
                                    style={styles.roadmapRewardIcon}
                                    contentFit="contain"
                                  />
                                  <Text style={styles.roadmapAmount}>
                                    {item.amount.toLocaleString()}
                                  </Text>
                                </View>
                              ))}
                            </Pressable>
                          </View>
                        );
                      })}
                    </ScrollView>
                    {!!weeklyMessage && (
                      <Text style={[styles.feedback, styles.successMessage]}>
                        {weeklyMessage}
                      </Text>
                    )}
                  </View>
                )}
                {adRewards.length > 0 && adState && (
                  <View style={styles.weeklyPanel}>
                    <Text style={styles.eventBadgeText}>WATCH ADS REWARDS</Text>
                    <Text style={styles.adHint}>
                      Claim in order. Resets every day.
                    </Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.roadmapRow}
                    >
                      {adRewards.map((reward, index) => {
                        const completed = index < adState.claimedCount;
                        const canClaim = index === adState.claimedCount;
                        return (
                          <View key={reward.slot} style={styles.roadmapStep}>
                            {index > 0 && (
                              <View
                                style={[
                                  styles.roadmapLine,
                                  completed && styles.roadmapLineDone,
                                ]}
                              />
                            )}
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Ad reward ${reward.slot}, ${completed ? "collected" : canClaim ? (isClaimingAd ? "checking for an ad" : "tap to watch and claim") : "locked"}`}
                              accessibilityState={{ disabled: !canClaim }}
                              disabled={!canClaim || isClaimingAd}
                              onPress={() => void claimAd()}
                              style={styles.roadmapNodeWrap}
                            >
                              <View
                                style={[
                                  styles.roadmapNode,
                                  completed && styles.roadmapNodeDone,
                                  canClaim && styles.roadmapNodeActive,
                                ]}
                              >
                                {canClaim && isClaimingAd ? (
                                  <ActivityIndicator
                                    size="small"
                                    color="#d9f99d"
                                    accessibilityLabel="Checking for an ad"
                                  />
                                ) : canClaim ? (
                                  <Image
                                    source={watchAdsIcon}
                                    style={styles.watchAdsIcon}
                                    contentFit="contain"
                                    pointerEvents="none"
                                  />
                                ) : (
                                  <Text
                                    style={[
                                      styles.roadmapNodeText,
                                      completed && styles.roadmapNodeTextDone,
                                    ]}
                                  >
                                    {completed ? "✓" : reward.slot}
                                  </Text>
                                )}
                              </View>
                              <Text style={styles.roadmapDay}>
                                {canClaim
                                  ? isClaimingAd
                                    ? "LOADING"
                                    : "CLAIM"
                                  : `AD ${reward.slot}`}
                              </Text>
                              {reward.rewards.map((item) => (
                                <View
                                  key={item.id}
                                  style={styles.roadmapReward}
                                >
                                  <Image
                                    source={weeklyRewardIcons[item.id]}
                                    style={styles.roadmapRewardIcon}
                                    contentFit="contain"
                                  />
                                  <Text style={styles.roadmapAmount}>
                                    {item.amount.toLocaleString()}
                                  </Text>
                                </View>
                              ))}
                            </Pressable>
                          </View>
                        );
                      })}
                    </ScrollView>
                    {!!adMessage && (
                      <Text
                        style={[
                          styles.feedback,
                          adMessageStatus === "error"
                            ? styles.errorMessage
                            : adMessageStatus === "loading"
                              ? styles.loadingMessage
                              : styles.successMessage,
                        ]}
                      >
                        {adMessage}
                      </Text>
                    )}
                  </View>
                )}
                <View style={styles.featuredEvent}>
                  <View style={styles.eventBadge}>
                    <Text style={styles.eventBadgeText}>
                      LIMITED-TIME REWARDS
                    </Text>
                  </View>
                  <Text style={styles.eventTitle}>
                    A gift for your next adventure
                  </Text>
                  <Text style={styles.eventDescription}>
                    Redeem a limited-time code for bonus coins and XP. Each code
                    can be used once per device.
                  </Text>
                  <View style={styles.eventFooter}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        setMessage("");
                        setActiveTab("redeem");
                      }}
                      style={styles.primaryButton}
                    >
                      <Text style={styles.primaryButtonText}>
                        REDEEM A CODE
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.redeemPanel}>
                <Text style={styles.panelTitle}>Redeem a code</Text>
                <Text style={styles.panelDescription}>
                  One use per code on this device.
                </Text>
                <TextInput
                  accessibilityLabel="Redeem code"
                  value={codeInput}
                  onChangeText={(value) => {
                    setCodeInput(value.toUpperCase());
                    setMessage("");
                  }}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  editable={!isRedeeming}
                  maxLength={40}
                  placeholder="ENTER CODE"
                  placeholderTextColor="rgba(226,232,240,0.42)"
                  returnKeyType="done"
                  style={styles.codeInput}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isRedeeming || isLoading }}
                  disabled={isRedeeming || isLoading}
                  onPress={() => void submitCode()}
                  style={[
                    styles.primaryButton,
                    styles.redeemButton,
                    (isRedeeming || isLoading) && styles.disabledButton,
                  ]}
                >
                  {isRedeeming ? (
                    <ActivityIndicator color="#10220d" />
                  ) : (
                    <Text style={styles.primaryButtonText}>
                      {isLoading ? "LOADING…" : "REDEEM REWARD"}
                    </Text>
                  )}
                </Pressable>
                {!!message && (
                  <Text
                    accessibilityRole="alert"
                    style={[
                      styles.feedback,
                      messageIsSuccess
                        ? styles.successMessage
                        : styles.errorMessage,
                    ]}
                  >
                    {message}
                  </Text>
                )}
                {!isLoading && codes.length === 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void refreshCodes()}
                    style={styles.retryButton}
                  >
                    <Text style={styles.retryText}>RETRY LOADING CODES</Text>
                  </Pressable>
                ) : null}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#06150f",
  },
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
  titleGroup: {
    flex: 1,
  },
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
  headerIcon: {
    width: 34,
    height: 34,
  },
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
    minWidth: 100,
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  activeTab: {
    borderBottomColor: "#a3e635",
  },
  tabText: {
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  activeTabText: {
    color: "#d9f99d",
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 12,
  },
  eventsColumn: {
    width: "100%",
    maxWidth: 620,
    alignSelf: "center",
    gap: 10,
  },
  weeklyPanel: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(163, 230, 53, 0.35)",
    backgroundColor: "rgba(15, 35, 25, 0.94)",
  },
  adHint: { marginTop: 4, color: "#94a3b8", fontSize: 10 },
  roadmapRow: {
    alignItems: "flex-start",
    paddingTop: 12,
    paddingBottom: 2,
  },
  roadmapStep: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  roadmapLine: {
    width: 26,
    height: 4,
    marginTop: 15,
    borderRadius: 2,
    backgroundColor: "rgba(148, 163, 184, 0.3)",
  },
  roadmapLineDone: { backgroundColor: "#a3e635" },
  roadmapNodeWrap: { width: 58, alignItems: "center" },
  roadmapNode: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 17,
    borderWidth: 2,
    borderColor: "rgba(148, 163, 184, 0.4)",
    backgroundColor: "rgba(2, 12, 9, 0.95)",
  },
  roadmapNodeDone: { borderColor: "#a3e635", backgroundColor: "#a3e635" },
  roadmapNodeActive: {
    borderColor: "#facc15",
    backgroundColor: "rgba(250, 204, 21, 0.2)",
  },
  roadmapNodeText: { color: "#94a3b8", fontSize: 13, fontWeight: "900" },
  roadmapNodeTextDone: { color: "#14220b" },
  watchAdsIcon: { width: 24, height: 24 },
  roadmapDay: {
    marginTop: 4,
    color: "#cbd5e1",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  roadmapReward: {
    marginTop: 3,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  roadmapRewardIcon: { width: 14, height: 14 },
  roadmapAmount: { color: "#f0fdf4", fontSize: 10, fontWeight: "900" },
  featuredEvent: {
    width: "100%",
    maxWidth: 620,
    alignSelf: "center",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(163, 230, 53, 0.35)",
    backgroundColor: "rgba(15, 35, 25, 0.94)",
  },
  eventBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(163, 230, 53, 0.15)",
  },
  eventBadgeText: {
    color: "#bef264",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  eventTitle: {
    marginTop: 9,
    color: "#f0fdf4",
    fontSize: 20,
    fontWeight: "900",
  },
  eventDescription: {
    maxWidth: 540,
    marginTop: 5,
    color: "#cbd5e1",
    fontSize: 12,
    lineHeight: 17,
  },
  eventFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 12,
    marginTop: 12,
  },
  primaryButton: {
    minHeight: 38,
    minWidth: 120,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#a3e635",
  },
  primaryButtonText: {
    color: "#14220b",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  redeemPanel: {
    width: "100%",
    maxWidth: 440,
    alignSelf: "center",
  },
  panelTitle: {
    color: "#f0fdf4",
    fontSize: 21,
    fontWeight: "900",
  },
  panelDescription: {
    marginTop: 3,
    marginBottom: 10,
    color: "#cbd5e1",
    fontSize: 11,
    lineHeight: 15,
  },
  codeInput: {
    minHeight: 43,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "rgba(217, 249, 157, 0.42)",
    backgroundColor: "rgba(2, 12, 9, 0.95)",
    color: "#f0fdf4",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  redeemButton: {
    marginTop: 8,
  },
  disabledButton: {
    opacity: 0.55,
  },
  feedback: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 15,
  },
  successMessage: {
    color: "#bef264",
  },
  loadingMessage: {
    color: "#e2e8f0",
  },
  errorMessage: {
    color: "#fca5a5",
  },
  retryButton: {
    alignSelf: "flex-start",
    marginTop: 8,
    padding: 4,
  },
  retryText: {
    color: "#bef264",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
});
