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

const eventBackdrop = require("@/assets/images/background_1.png");
const eventIcon = getRemoteAssetSource("game/icons/calendar_1.png");

export default function EventScreen() {
  const [activeTab, setActiveTab] = useState<"events" | "redeem">("events");
  const [codes, setCodes] = useState<RedeemCode[]>([]);
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
                    <Text style={styles.primaryButtonText}>REDEEM A CODE</Text>
                  </Pressable>
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
