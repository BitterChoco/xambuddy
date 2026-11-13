import { Image } from "expo-image";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Pressable,
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

const eventBackdrop = getRemoteAssetSource("images/background_1.png");
const eventIcon = getRemoteAssetSource("game/icons/calendar_1.png");

export default function EventScreen() {
  const [activeTab, setActiveTab] = useState<"events" | "redeem">("events");
  const [codes, setCodes] = useState<RedeemCode[]>([]);
  const [activeCodeCount, setActiveCodeCount] = useState(0);
  const [codeInput, setCodeInput] = useState("");
  const [message, setMessage] = useState("");
  const [messageIsSuccess, setMessageIsSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRedeeming, setIsRedeeming] = useState(false);

  const refreshCodes = useCallback(async () => {
    setIsLoading(true);
    try {
      const loadedCodes = await loadRedeemCodes();
      setCodes(loadedCodes);
      setActiveCodeCount(
        loadedCodes.filter((entry) => Date.now() <= Date.parse(entry.expiry))
          .length,
      );
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
        setActiveCodeCount(
          loadedCodes.filter((entry) => Date.now() <= Date.parse(entry.expiry))
            .length,
        );
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
            <Text style={styles.backButtonText}>‹ MENU</Text>
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
              <View style={styles.featuredEvent}>
                <View style={styles.eventBadge}>
                  <Text style={styles.eventBadgeText}>
                    LIMITED-TIME REWARDS
                  </Text>
                </View>
                <Text style={styles.eventTitle}>
                  A little gift for your next adventure
                </Text>
                <Text style={styles.eventDescription}>
                  Have a Wild Paw code? Redeem it for bonus coins and XP. Codes
                  are available for a limited time and can only be used once on
                  this device.
                </Text>
                <View style={styles.eventFooter}>
                  <Text style={styles.eventCount}>
                    {isLoading
                      ? "Checking rewards…"
                      : `${activeCodeCount} active reward${activeCodeCount === 1 ? "" : "s"}`}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setMessage("");
                      setActiveTab("redeem");
                    }}
                    style={styles.primaryButton}
                  >
                    <Text style={styles.primaryButtonText}>ENTER CODE</Text>
                  </Pressable>
                </View>
                {isLoading && (
                  <ActivityIndicator
                    color="#a3e635"
                    style={styles.eventLoader}
                  />
                )}
              </View>
            ) : (
              <View style={styles.redeemPanel}>
                <Text style={styles.panelEyebrow}>CLAIM YOUR REWARD</Text>
                <Text style={styles.panelTitle}>Redeem a code</Text>
                <Text style={styles.panelDescription}>
                  Enter a code exactly as shown. Each code can be redeemed once
                  per device before its expiry date.
                </Text>
                <TextInput
                  accessibilityLabel="Redeem code"
                  value={codeInput}
                  onChangeText={(value) => {
                    setCodeInput(value.toUpperCase());
                    setMessage("");
                  }}
                  onSubmitEditing={() => void submitCode()}
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
                    <Text style={styles.primaryButtonText}>REDEEM REWARD</Text>
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
                {isLoading ? (
                  <ActivityIndicator
                    color="#a3e635"
                    style={styles.codeLoader}
                  />
                ) : codes.length === 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void refreshCodes()}
                    style={styles.retryButton}
                  >
                    <Text style={styles.retryText}>RETRY LOADING CODES</Text>
                  </Pressable>
                ) : (
                  <Text style={styles.expiryNote}>
                    {activeCodeCount > 0
                      ? `There ${activeCodeCount === 1 ? "is" : "are"} ${activeCodeCount} active code${activeCodeCount === 1 ? "" : "s"}. Enter one to view and claim its reward.`
                      : "There are no active codes right now. Check back later!"}
                  </Text>
                )}
              </View>
            )}
          </ScrollView>
        </View>
        <Text style={styles.footerNote}>
          Codes are saved as redeemed on this device.
        </Text>
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
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 8,
  },
  header: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginBottom: 12,
  },
  backButton: {
    minWidth: 82,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
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
    fontSize: 23,
    fontWeight: "900",
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 5,
  },
  headerIcon: {
    width: 43,
    height: 43,
  },
  card: {
    flex: 1,
    overflow: "hidden",
    borderRadius: 25,
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
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(217, 249, 157, 0.15)",
  },
  tab: {
    minWidth: 125,
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: 3,
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
    padding: 22,
  },
  featuredEvent: {
    width: "100%",
    maxWidth: 690,
    alignSelf: "center",
    padding: 24,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: "rgba(163, 230, 53, 0.35)",
    backgroundColor: "rgba(15, 35, 25, 0.94)",
  },
  eventBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
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
    marginTop: 15,
    color: "#f0fdf4",
    fontSize: 25,
    fontWeight: "900",
  },
  eventDescription: {
    maxWidth: 600,
    marginTop: 9,
    color: "#cbd5e1",
    fontSize: 14,
    lineHeight: 21,
  },
  eventFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 22,
  },
  eventCount: {
    color: "#bef264",
    fontSize: 12,
    fontWeight: "800",
  },
  primaryButton: {
    minHeight: 43,
    minWidth: 135,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 13,
    backgroundColor: "#a3e635",
  },
  primaryButtonText: {
    color: "#14220b",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  eventLoader: {
    marginTop: 14,
  },
  redeemPanel: {
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
  },
  panelEyebrow: {
    color: "#a3e635",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  panelTitle: {
    marginTop: 5,
    color: "#f0fdf4",
    fontSize: 24,
    fontWeight: "900",
  },
  panelDescription: {
    marginTop: 7,
    marginBottom: 18,
    color: "#cbd5e1",
    fontSize: 13,
    lineHeight: 19,
  },
  codeInput: {
    minHeight: 51,
    paddingHorizontal: 15,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: "rgba(217, 249, 157, 0.42)",
    backgroundColor: "rgba(2, 12, 9, 0.95)",
    color: "#f0fdf4",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  redeemButton: {
    marginTop: 12,
  },
  disabledButton: {
    opacity: 0.55,
  },
  feedback: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
  },
  successMessage: {
    color: "#bef264",
  },
  errorMessage: {
    color: "#fca5a5",
  },
  codeLoader: {
    marginTop: 18,
  },
  retryButton: {
    alignSelf: "flex-start",
    marginTop: 18,
    padding: 8,
  },
  retryText: {
    color: "#bef264",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  expiryNote: {
    marginTop: 17,
    color: "#94a3b8",
    fontSize: 11,
    lineHeight: 16,
  },
  footerNote: {
    marginTop: 7,
    color: "rgba(226,232,240,0.72)",
    fontSize: 10,
    textAlign: "center",
  },
});
