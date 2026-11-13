import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
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

import { getRemoteAssetSource } from "@/services/remote-assets";

const FRIENDS_STORAGE_KEY = "wild-paw.player-friends";
const friendsBackdrop = require("@/assets/images/background_1.png");
const friendsIcon = getRemoteAssetSource("game/icons/friends_1.png");

type Friend = {
  id: string;
  name: string;
};

function parseFriends(value: string | null): Friend[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry): Friend[] => {
      if (
        !entry ||
        typeof entry !== "object" ||
        !("id" in entry) ||
        typeof entry.id !== "string" ||
        !("name" in entry) ||
        typeof entry.name !== "string" ||
        !entry.name.trim()
      ) {
        return [];
      }
      return [{ id: entry.id, name: entry.name.trim().slice(0, 24) }];
    });
  } catch {
    return [];
  }
}

export default function FriendsScreen() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendName, setFriendName] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let isMounted = true;
    void AsyncStorage.getItem(FRIENDS_STORAGE_KEY)
      .then((storedFriends) => {
        if (isMounted) setFriends(parseFriends(storedFriends));
      })
      .catch(() => {
        if (isMounted) setMessage("Could not load your friends list.");
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const visibleFriends = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return query
      ? friends.filter((friend) =>
          friend.name.toLocaleLowerCase().includes(query),
        )
      : friends;
  }, [friends, search]);

  const persistFriends = async (nextFriends: Friend[]) => {
    setIsSaving(true);
    setMessage("");
    try {
      await AsyncStorage.setItem(
        FRIENDS_STORAGE_KEY,
        JSON.stringify(nextFriends),
      );
      setFriends(nextFriends);
      return true;
    } catch {
      setMessage("Could not save your friends list. Please try again.");
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const addFriend = async () => {
    const name = friendName.trim().replace(/\s+/g, " ").slice(0, 24);
    if (!name || isSaving) return;
    if (
      friends.some(
        (friend) =>
          friend.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
      )
    ) {
      setMessage("That friend is already on your list.");
      return;
    }

    const nextFriends = [
      ...friends,
      { id: `${Date.now()}-${Math.random()}`, name },
    ];
    if (await persistFriends(nextFriends)) {
      setFriendName("");
      setMessage(`${name} added to your friends list.`);
    }
  };

  const removeFriend = async (friend: Friend) => {
    if (isSaving) return;
    const nextFriends = friends.filter((entry) => entry.id !== friend.id);
    if (await persistFriends(nextFriends)) {
      setMessage(`${friend.name} removed from your friends list.`);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Image
        source={friendsBackdrop}
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
            <Text style={styles.title}>Friends</Text>
          </View>
          <Image
            source={friendsIcon}
            style={styles.headerIcon}
            contentFit="contain"
            accessibilityLabel="Friends"
          />
        </View>

        <View style={styles.card}>
          <View style={styles.tabs}>
            <View style={[styles.tab, styles.activeTab]}>
              <Text style={[styles.tabText, styles.activeTabText]}>
                MY FRIENDS
              </Text>
            </View>
            <View style={styles.friendCount}>
              <Text style={styles.friendCountText}>
                {friends.length} FRIENDS
              </Text>
            </View>
          </View>

          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Add a friend</Text>
              <Text style={styles.panelDescription}>
                Keep track of the players you want to team up with.
              </Text>
              <View style={styles.addRow}>
                <TextInput
                  accessibilityLabel="Friend name"
                  value={friendName}
                  onChangeText={(value) => {
                    setFriendName(value.slice(0, 24));
                    setMessage("");
                  }}
                  onSubmitEditing={() => void addFriend()}
                  autoCapitalize="words"
                  autoCorrect={false}
                  editable={!isSaving}
                  maxLength={24}
                  placeholder="ENTER PLAYER NAME"
                  placeholderTextColor="rgba(226,232,240,0.42)"
                  returnKeyType="done"
                  style={styles.nameInput}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Add friend"
                  accessibilityState={{
                    disabled: isSaving || !friendName.trim(),
                  }}
                  disabled={isSaving || !friendName.trim()}
                  onPress={() => void addFriend()}
                  style={[
                    styles.addButton,
                    (isSaving || !friendName.trim()) && styles.disabledButton,
                  ]}
                >
                  {isSaving ? (
                    <ActivityIndicator color="#14220b" />
                  ) : (
                    <Text style={styles.addButtonText}>ADD</Text>
                  )}
                </Pressable>
              </View>
              {!!message && (
                <Text accessibilityRole="alert" style={styles.feedback}>
                  {message}
                </Text>
              )}
            </View>

            <View style={styles.listHeader}>
              <View>
                <Text style={styles.listTitle}>Friends list</Text>
                <Text style={styles.listSubtitle}>Saved on this device</Text>
              </View>
              {friends.length > 0 && (
                <TextInput
                  accessibilityLabel="Search friends"
                  value={search}
                  onChangeText={setSearch}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="SEARCH"
                  placeholderTextColor="rgba(226,232,240,0.42)"
                  style={styles.searchInput}
                />
              )}
            </View>

            {isLoading ? (
              <View style={styles.loadingArea}>
                <ActivityIndicator color="#bef264" />
                <Text style={styles.mutedText}>Loading friends…</Text>
              </View>
            ) : visibleFriends.length > 0 ? (
              <View style={styles.friendList}>
                {visibleFriends.map((friend, index) => (
                  <View key={friend.id} style={styles.friendRow}>
                    <View style={styles.friendAvatar}>
                      <Text style={styles.friendInitial}>
                        {friend.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.friendDetails}>
                      <Text numberOfLines={1} style={styles.friendName}>
                        {friend.name}
                      </Text>
                      <Text style={styles.friendStatus}>
                        PLAYER · {index + 1}
                      </Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${friend.name}`}
                      accessibilityState={{ disabled: isSaving }}
                      disabled={isSaving}
                      onPress={() => void removeFriend(friend)}
                      style={styles.removeButton}
                    >
                      <Text style={styles.removeButtonText}>REMOVE</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.emptyState}>
                <View style={styles.emptyIconFrame}>
                  <Image
                    source={friendsIcon}
                    style={styles.emptyIcon}
                    contentFit="contain"
                  />
                </View>
                <Text style={styles.emptyTitle}>
                  {search.trim() ? "No friends found" : "Your list is waiting"}
                </Text>
                <Text style={styles.emptyDescription}>
                  {search.trim()
                    ? "Try a different name."
                    : "Add player names above to start building your friends list."}
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
  friendCount: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(163, 230, 53, 0.12)",
  },
  friendCountText: {
    color: "#bef264",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  content: { flexGrow: 1, padding: 12 },
  panel: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(163, 230, 53, 0.3)",
    backgroundColor: "rgba(15, 35, 25, 0.94)",
  },
  panelTitle: { color: "#f0fdf4", fontSize: 17, fontWeight: "900" },
  panelDescription: {
    marginTop: 3,
    marginBottom: 10,
    color: "#cbd5e1",
    fontSize: 11,
    lineHeight: 15,
  },
  addRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  nameInput: {
    flex: 1,
    minHeight: 42,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "rgba(217, 249, 157, 0.42)",
    backgroundColor: "rgba(2, 12, 9, 0.95)",
    color: "#f0fdf4",
    fontSize: 12,
    fontWeight: "700",
  },
  addButton: {
    minWidth: 76,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: "#a3e635",
  },
  addButtonText: {
    color: "#14220b",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  disabledButton: { opacity: 0.5 },
  feedback: {
    marginTop: 8,
    color: "#bef264",
    fontSize: 10,
    fontWeight: "700",
  },
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 18,
    marginBottom: 8,
  },
  listTitle: { color: "#f0fdf4", fontSize: 16, fontWeight: "900" },
  listSubtitle: { marginTop: 2, color: "#94a3b8", fontSize: 10 },
  searchInput: {
    width: 140,
    minHeight: 32,
    paddingHorizontal: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(217, 249, 157, 0.25)",
    color: "#f0fdf4",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  friendList: { gap: 7 },
  friendRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(217, 249, 157, 0.16)",
    backgroundColor: "rgba(5, 18, 14, 0.82)",
  },
  friendAvatar: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: "rgba(163, 230, 53, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(163, 230, 53, 0.45)",
  },
  friendInitial: { color: "#d9f99d", fontSize: 17, fontWeight: "900" },
  friendDetails: { flex: 1 },
  friendName: { color: "#f0fdf4", fontSize: 12, fontWeight: "900" },
  friendStatus: {
    marginTop: 2,
    color: "#94a3b8",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  removeButton: {
    minHeight: 30,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(248, 113, 113, 0.45)",
    backgroundColor: "rgba(127, 29, 29, 0.24)",
  },
  removeButtonText: {
    color: "#fca5a5",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  loadingArea: {
    minHeight: 100,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  mutedText: { color: "#cbd5e1", fontSize: 11 },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingVertical: 24,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(217, 249, 157, 0.16)",
    backgroundColor: "rgba(5, 18, 14, 0.56)",
  },
  emptyIconFrame: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: "rgba(163, 230, 53, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(163, 230, 53, 0.3)",
  },
  emptyIcon: { width: 32, height: 32 },
  emptyTitle: {
    marginTop: 10,
    color: "#f0fdf4",
    fontSize: 16,
    fontWeight: "900",
    textAlign: "center",
  },
  emptyDescription: {
    maxWidth: 360,
    marginTop: 4,
    color: "#cbd5e1",
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
  },
});
