import { SoundPressable as Pressable } from "@/components/ui/sound-pressable";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  claimMail,
  deleteMail,
  deleteReadMails,
  markAllMailRead,
  markMailRead,
  useMailbox,
  type ClaimedTotals,
  type MailMessage,
} from "@/services/mailbox";
import { getRemoteAssetSource } from "@/services/remote-assets";

const mailBackdrop = require("@/assets/images/background_1.png");
const mailIcon = getRemoteAssetSource("game/icons/email_1.png");
const rewardIcons = {
  coin: getRemoteAssetSource("game/icons/coin_1.png"),
  exp: getRemoteAssetSource("game/icons/xp_1.png"),
};

function formatMailDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function MailScreen() {
  const { mails, unreadCount } = useMailbox();
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [claimedSummary, setClaimedSummary] = useState<ClaimedTotals | null>(
    null,
  );
  const openMail = mails.find((mail) => mail.id === openId) ?? null;
  const canMarkAll = mails.some((mail) => !mail.read || !mail.claimed);
  const canDeleteRead = mails.some((mail) => mail.read);

  const showClaimed = (totals: ClaimedTotals) => {
    if (totals.coin > 0 || totals.exp > 0) setClaimedSummary(totals);
  };

  const markAllAsRead = async () => {
    if (claimingId) return;
    setClaimingId("all");
    try {
      showClaimed(await markAllMailRead());
    } finally {
      setClaimingId(null);
    }
  };

  const open = (id: string) => {
    setOpenId(id);
    void markMailRead(id);
  };

  const confirmDelete = (mail: MailMessage) => {
    Alert.alert(
      "Delete email?",
      mail.claimed
        ? "This email will be permanently deleted."
        : "Its rewards will be claimed, then the email will be permanently deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            if (claimingId) return;
            setClaimingId(mail.id);
            void deleteMail(mail.id)
              .then(showClaimed)
              .finally(() => setClaimingId(null));
          },
        },
      ],
    );
  };

  const confirmDeleteRead = () => {
    Alert.alert(
      "Delete read emails?",
      "Rewards in opened emails will be claimed, then those emails will be permanently deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            if (claimingId) return;
            setClaimingId("all");
            void deleteReadMails()
              .then(showClaimed)
              .finally(() => setClaimingId(null));
          },
        },
      ],
    );
  };

  const claim = async (id: string) => {
    if (claimingId) return;
    setClaimingId(id);
    try {
      await claimMail(id);
    } finally {
      setClaimingId(null);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Image
        source={mailBackdrop}
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
            <Text style={styles.eyebrow}>WILD PAW · MESSAGES</Text>
            <Text style={styles.title}>Mailbox</Text>
          </View>
          <Image
            source={mailIcon}
            style={styles.headerIcon}
            contentFit="contain"
            accessibilityLabel="Mailbox"
          />
        </View>

        <View style={styles.card}>
          <View style={styles.tabs}>
            <View style={[styles.tab, styles.activeTab]}>
              <Text style={[styles.tabText, styles.activeTabText]}>INBOX</Text>
            </View>
            <View style={styles.inboxActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Mark all as read"
                disabled={!canMarkAll || claimingId !== null}
                onPress={() => void markAllAsRead()}
                style={[
                  styles.actionButton,
                  (!canMarkAll || claimingId !== null) &&
                    styles.actionButtonDisabled,
                ]}
              >
                <Text style={styles.actionButtonText}>MARK ALL AS READ</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Delete read emails"
                disabled={!canDeleteRead || claimingId !== null}
                onPress={confirmDeleteRead}
                style={[
                  styles.actionButton,
                  (!canDeleteRead || claimingId !== null) &&
                    styles.actionButtonDisabled,
                ]}
              >
                <Text style={styles.actionButtonText}>DELETE READ EMAILS</Text>
              </Pressable>
              <View style={styles.inboxCount}>
                <Text style={styles.inboxCountText}>{unreadCount} NEW</Text>
              </View>
            </View>
          </View>
          <ScrollView
            contentContainerStyle={[
              styles.content,
              mails.length > 0 && styles.contentTopLeft,
            ]}
            showsVerticalScrollIndicator={false}
          >
            <Modal
              visible={!!openMail}
              transparent
              animationType="fade"
              supportedOrientations={["landscape", "portrait"]}
              onRequestClose={() => setOpenId(null)}
            >
              <View style={styles.modalOverlay}>
                <Pressable
                  accessibilityLabel="Close email"
                  onPress={() => setOpenId(null)}
                  style={StyleSheet.absoluteFill}
                />
                {openMail && (
                  <View style={styles.mailPopup}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Close email"
                      onPress={() => setOpenId(null)}
                      style={styles.popupCloseButton}
                    >
                      <Text style={styles.inboxBackText}>✕</Text>
                    </Pressable>
                    <Text style={styles.mailTitle}>{openMail.title}</Text>
                    <Text style={styles.mailMessage}>{openMail.message}</Text>
                    <View style={styles.rewardList}>
                      {openMail.rewards.map((reward) => (
                        <View key={reward.id} style={styles.rewardRow}>
                          <Image
                            source={rewardIcons[reward.id]}
                            style={styles.rewardIcon}
                            contentFit="contain"
                            accessibilityLabel={
                              reward.id === "coin" ? "Coins" : "XP"
                            }
                          />
                          <Text style={styles.rewardAmount}>
                            {reward.amount.toLocaleString()}
                          </Text>
                        </View>
                      ))}
                    </View>
                    <View style={styles.mailFooter}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{
                          disabled: openMail.claimed || claimingId !== null,
                        }}
                        disabled={openMail.claimed || claimingId !== null}
                        onPress={() => void claim(openMail.id)}
                        style={[
                          styles.claimButton,
                          openMail.claimed && styles.claimButtonDone,
                        ]}
                      >
                        <Text style={styles.claimButtonText}>
                          {openMail.claimed ? "CLAIMED" : "CLAIM"}
                        </Text>
                      </Pressable>
                      <Text style={styles.mailDate}>
                        {formatMailDate(openMail.receivedAt)}
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            </Modal>
            <Modal
              visible={!!claimedSummary}
              transparent
              animationType="fade"
              supportedOrientations={["landscape", "portrait"]}
              onRequestClose={() => setClaimedSummary(null)}
            >
              <View style={styles.modalOverlay}>
                <Pressable
                  accessibilityLabel="Dismiss rewards"
                  onPress={() => setClaimedSummary(null)}
                  style={StyleSheet.absoluteFill}
                />
                {claimedSummary && (
                  <View style={styles.mailPopup}>
                    <Text style={styles.mailTitle}>REWARDS CLAIMED</Text>
                    <View style={styles.rewardList}>
                      {(
                        [
                          { id: "exp", amount: claimedSummary.exp },
                          { id: "coin", amount: claimedSummary.coin },
                        ] as const
                      )
                        .filter((reward) => reward.amount > 0)
                        .map((reward) => (
                          <View key={reward.id} style={styles.rewardRow}>
                            <Image
                              source={rewardIcons[reward.id]}
                              style={styles.rewardIcon}
                              contentFit="contain"
                              accessibilityLabel={
                                reward.id === "coin" ? "Coins" : "XP"
                              }
                            />
                            <Text style={styles.rewardAmount}>
                              {reward.amount.toLocaleString()}
                            </Text>
                          </View>
                        ))}
                    </View>
                    <View style={styles.mailFooter}>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => setClaimedSummary(null)}
                        style={styles.claimButton}
                      >
                        <Text style={styles.claimButtonText}>OK</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              </View>
            </Modal>
            {mails.map((mail) => (
              <Pressable
                key={mail.id}
                accessibilityRole="button"
                accessibilityLabel={`${mail.title}, ${formatMailDate(mail.receivedAt)}${mail.read ? "" : ", new"}`}
                onPress={() => open(mail.id)}
                style={[styles.mailRow, !mail.read && styles.mailRowUnread]}
              >
                <Image
                  source={mailIcon}
                  style={styles.mailRowIcon}
                  contentFit="contain"
                />
                <View style={styles.mailRowText}>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.mailTitle,
                      mail.read && styles.mailTitleRead,
                    ]}
                  >
                    {mail.title}
                  </Text>
                  <Text numberOfLines={1} style={styles.mailRowPreview}>
                    {mail.message}
                  </Text>
                </View>
                <View style={styles.mailRowMeta}>
                  {!mail.read && (
                    <View style={styles.newPill}>
                      <Text style={styles.newPillText}>NEW</Text>
                    </View>
                  )}
                  <Text style={styles.mailDate}>
                    {formatMailDate(mail.receivedAt)}
                  </Text>
                </View>
                {mail.read && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${mail.title}`}
                    hitSlop={8}
                    onPress={() => confirmDelete(mail)}
                    style={styles.trashButton}
                  >
                    <Text style={styles.trashIcon}>🗑</Text>
                  </Pressable>
                )}
              </Pressable>
            ))}
            {mails.length === 0 && !openMail && (
              <View style={styles.emptyMailbox}>
                <View style={styles.mailIconFrame}>
                  <Image
                    source={mailIcon}
                    style={styles.emptyMailIcon}
                    contentFit="contain"
                    accessibilityLabel="Empty inbox"
                  />
                </View>
                <View style={styles.mailBadge}>
                  <Text style={styles.mailBadgeText}>ALL CAUGHT UP</Text>
                </View>
                <Text style={styles.emptyTitle}>Your mailbox is quiet</Text>
                <Text style={styles.emptyDescription}>
                  Messages, gifts, and updates from the Wild Paw team will show
                  up here.
                </Text>
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
  inboxCount: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(163, 230, 53, 0.12)",
  },
  inboxCountText: {
    color: "#bef264",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 12,
    gap: 10,
  },
  contentTopLeft: { justifyContent: "flex-start", alignItems: "flex-start" },
  modalOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    backgroundColor: "rgba(2, 12, 9, 0.7)",
  },
  mailPopup: {
    width: "100%",
    maxWidth: 480,
    padding: 16,
    paddingTop: 30,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "rgba(217, 249, 157, 0.5)",
    backgroundColor: "rgba(4, 17, 13, 0.98)",
  },
  mailCard: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "flex-start",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(163, 230, 53, 0.3)",
    backgroundColor: "rgba(15, 35, 25, 0.94)",
  },
  mailTitleRead: { color: "#94a3b8" },
  mailTitle: {
    color: "#d9f99d",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  mailMessage: {
    marginTop: 4,
    color: "#e2e8f0",
    fontSize: 12,
    lineHeight: 17,
  },
  rewardList: { marginTop: 10, gap: 6 },
  mailFooter: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  mailDate: { color: "#94a3b8", fontSize: 10, fontWeight: "700" },
  popupCloseButton: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
  },
  inboxActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  actionButton: {
    paddingHorizontal: 8,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(163, 230, 53, 0.4)",
    backgroundColor: "rgba(163, 230, 53, 0.12)",
  },
  actionButtonDisabled: { opacity: 0.35 },
  actionButtonText: {
    color: "#d9f99d",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  trashButton: { padding: 4 },
  trashIcon: { fontSize: 16 },
  inboxBackText: {
    color: "#bef264",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  mailRow: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(163, 230, 53, 0.2)",
    backgroundColor: "rgba(15, 35, 25, 0.94)",
  },
  mailRowUnread: { borderColor: "rgba(163, 230, 53, 0.7)" },
  mailRowIcon: { width: 28, height: 28 },
  mailRowText: { flex: 1 },
  mailRowPreview: { marginTop: 2, color: "#94a3b8", fontSize: 11 },
  mailRowMeta: { alignItems: "flex-end", gap: 4 },
  newPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "#ef4444",
  },
  newPillText: {
    color: "#fff",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  rewardRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  rewardIcon: { width: 26, height: 26 },
  rewardAmount: { color: "#fff", fontSize: 15, fontWeight: "900" },
  claimButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#a3e635",
  },
  claimButtonDone: { backgroundColor: "rgba(148, 163, 184, 0.35)" },
  claimButtonText: {
    color: "#10220d",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  emptyMailbox: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(163, 230, 53, 0.3)",
    backgroundColor: "rgba(15, 35, 25, 0.94)",
  },
  mailIconFrame: {
    width: 74,
    height: 74,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(163, 230, 53, 0.35)",
    backgroundColor: "rgba(163, 230, 53, 0.1)",
  },
  emptyMailIcon: {
    width: 42,
    height: 42,
  },
  mailBadge: {
    marginTop: 16,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(163, 230, 53, 0.15)",
  },
  mailBadgeText: {
    color: "#bef264",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  emptyTitle: {
    marginTop: 10,
    color: "#f0fdf4",
    fontSize: 20,
    fontWeight: "900",
    textAlign: "center",
  },
  emptyDescription: {
    maxWidth: 390,
    marginTop: 6,
    color: "#cbd5e1",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
});
