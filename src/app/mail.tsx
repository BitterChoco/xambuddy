import { Image } from "expo-image";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { getRemoteAssetSource } from "@/services/remote-assets";

const mailBackdrop = require("@/assets/images/background_1.png");
const mailIcon = getRemoteAssetSource("game/icons/email_1.png");

export default function MailScreen() {
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
            <View style={styles.inboxCount}>
              <Text style={styles.inboxCountText}>0 NEW</Text>
            </View>
          </View>
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
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
                Messages, gifts, and updates from the Wild Paw team will show up
                here.
              </Text>
            </View>
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
