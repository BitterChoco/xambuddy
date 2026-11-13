import { ProfileBorderOverlay } from "@/components/ui/profile-border-overlay";
import {
    DEFAULT_PROFILE_BORDER,
    DEFAULT_PROFILE_PICTURE,
    getProfileBorderStyle,
    isProfilePictureId,
    PROFILE_BORDERS,
    PROFILE_PICTURE_CHOICES,
    PROFILE_PICTURES,
    type ProfilePictureId,
} from "@/constants/game-catalog";
import {
    getPlayerLevelProgress,
    getPlayerXp,
    subscribeToPlayerXp,
} from "@/constants/player-experience";
import {
    DEFAULT_PLAYER_INVENTORY,
    loadPlayerInventory,
    type PlayerInventory,
} from "@/constants/player-inventory";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const PROFILE_STORAGE_KEY = "wild-paw.player-profile";
const profileBackdrop = require("@/assets/images/background_1.png");

type ProfileTab = "picture" | "border";
type SavedProfile = {
  name: string;
  picture: ProfilePictureId;
  border: string;
};

export default function ProfileScreen() {
  const [profileName, setProfileName] = useState("Player 1");
  const [profilePicture, setProfilePicture] = useState<ProfilePictureId>(
    DEFAULT_PROFILE_PICTURE,
  );
  const [profileBorder, setProfileBorder] = useState(DEFAULT_PROFILE_BORDER);
  const [profileTab, setProfileTab] = useState<ProfileTab>("picture");
  const [inventory, setInventory] = useState<PlayerInventory>(
    DEFAULT_PLAYER_INVENTORY,
  );
  const [playerXp, setPlayerXp] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const playerLevel = getPlayerLevelProgress(playerXp);
  const selectedPicture = PROFILE_PICTURES[profilePicture];

  useEffect(() => {
    let isMounted = true;
    void Promise.all([
      AsyncStorage.getItem(PROFILE_STORAGE_KEY),
      loadPlayerInventory(),
      getPlayerXp(),
    ])
      .then(([storedProfile, loadedInventory, xp]) => {
        if (!isMounted) return;
        setInventory(loadedInventory);
        setPlayerXp(xp);
        if (storedProfile) {
          const parsed = JSON.parse(storedProfile) as {
            name?: unknown;
            avatar?: unknown;
            picture?: unknown;
            border?: unknown;
          };
          if (typeof parsed.name === "string" && parsed.name.trim()) {
            setProfileName(parsed.name.trim().slice(0, 20));
          }
          const picture = parsed.picture ?? parsed.avatar;
          if (isProfilePictureId(picture)) setProfilePicture(picture);
          if (
            parsed.border === "none" ||
            (typeof parsed.border === "string" &&
              loadedInventory.borders.includes(parsed.border))
          ) {
            setProfileBorder(parsed.border);
          }
        }
      })
      .catch(() => {
        if (isMounted) setSaveMessage("Could not load your profile settings.");
      })
      .finally(() => {
        if (isMounted) setIsLoaded(true);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    void getPlayerXp().then((xp) => {
      if (isMounted) setPlayerXp(xp);
    });
    const unsubscribe = subscribeToPlayerXp(setPlayerXp);
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    const timeout = setTimeout(() => {
      const profile: SavedProfile = {
        name: profileName.trim().slice(0, 20) || "Player 1",
        picture: profilePicture,
        border: profileBorder,
      };
      void AsyncStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile))
        .then(() => setSaveMessage("Profile saved on this device."))
        .catch(() => setSaveMessage("Could not save your profile. Try again."));
    }, 250);
    return () => clearTimeout(timeout);
  }, [isLoaded, profileBorder, profileName, profilePicture]);

  const availableBorders = useMemo(
    () =>
      PROFILE_BORDERS.filter(
        (border) =>
          border.id === "none" || inventory.borders.includes(border.id),
      ),
    [inventory.borders],
  );

  const selectBorder = (borderId: string) => {
    if (borderId !== "none" && !inventory.borders.includes(borderId)) {
      return;
    }
    setProfileBorder(borderId);
    setSaveMessage("");
  };

  const commitProfileName = () => {
    setProfileName((current) => current.trim().slice(0, 20) || "Player 1");
    setSaveMessage("");
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Image
        source={profileBackdrop}
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
            <Text style={styles.eyebrow}>WILD PAW · PLAYER</Text>
            <Text style={styles.title}>Profile</Text>
          </View>
          <View
            style={[
              styles.headerAvatarFrame,
              getProfileBorderStyle(profileBorder),
            ]}
          >
            {selectedPicture ? (
              <Image
                source={selectedPicture}
                style={styles.headerAvatar}
                contentFit="cover"
              />
            ) : null}
            <ProfileBorderOverlay borderId={profileBorder} />
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.cardKicker}>PLAYER PROFILE</Text>
              <Text style={styles.cardTitle}>Make it yours</Text>
            </View>
            <View style={styles.savedBadge}>
              <View style={styles.savedDot} />
              <Text style={styles.savedText}>SAVED ON THIS DEVICE</Text>
            </View>
          </View>

          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.identityPanel}>
              <View
                style={[
                  styles.avatarLargeFrame,
                  getProfileBorderStyle(profileBorder),
                ]}
              >
                {selectedPicture ? (
                  <Image
                    source={selectedPicture}
                    style={styles.avatarLarge}
                    contentFit="cover"
                    accessibilityLabel={`${profilePicture} profile picture`}
                  />
                ) : null}
                <ProfileBorderOverlay borderId={profileBorder} />
              </View>
              <View style={styles.nameEditor}>
                <Text style={styles.fieldLabel}>PLAYER NAME</Text>
                <TextInput
                  accessibilityLabel="Player name"
                  value={profileName}
                  onChangeText={(value) => {
                    setProfileName(value.slice(0, 20));
                    setSaveMessage("");
                  }}
                  onEndEditing={commitProfileName}
                  autoCapitalize="words"
                  autoCorrect={false}
                  maxLength={20}
                  placeholder="Player 1"
                  placeholderTextColor="#8ba89c"
                  returnKeyType="done"
                  selectTextOnFocus
                  style={styles.nameInput}
                />
                <Text style={styles.profileHint}>
                  Used in solo and multiplayer games.
                </Text>
              </View>
            </View>

            <View
              accessible
              accessibilityLabel={`Level ${playerLevel.level}, ${playerLevel.xpIntoLevel} of ${playerLevel.xpForNextLevel} XP to next level`}
              style={styles.levelPanel}
            >
              <View style={styles.levelHeading}>
                <Text style={styles.levelTitle}>PLAYER LEVEL</Text>
                <Text style={styles.levelValue}>LVL {playerLevel.level}</Text>
              </View>
              <View style={styles.levelProgressTrack}>
                <View
                  style={[
                    styles.levelProgressFill,
                    { width: `${playerLevel.progress * 100}%` },
                  ]}
                />
              </View>
              <Text style={styles.levelXpText}>
                {playerLevel.xpIntoLevel} / {playerLevel.xpForNextLevel} XP to
                next level
                <Text
                  style={styles.levelTotalXp}
                >{`  ·  ${playerLevel.totalXp} XP total`}</Text>
              </Text>
            </View>

            <View style={styles.tabs}>
              {(
                [
                  { id: "picture", label: "PICTURE", icon: "▣" },
                  { id: "border", label: "BORDER", icon: "◇" },
                ] as const
              ).map((tab) => (
                <Pressable
                  key={tab.id}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: profileTab === tab.id }}
                  onPress={() => setProfileTab(tab.id)}
                  style={[
                    styles.tab,
                    profileTab === tab.id && styles.activeTab,
                  ]}
                >
                  <Text style={styles.tabIcon}>{tab.icon}</Text>
                  <Text
                    style={[
                      styles.tabText,
                      profileTab === tab.id && styles.activeTabText,
                    ]}
                  >
                    {tab.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.optionsPanel}>
              {profileTab === "picture" ? (
                <View style={styles.optionGrid}>
                  {PROFILE_PICTURE_CHOICES.map((picture) => {
                    const selected = profilePicture === picture.id;
                    return (
                      <Pressable
                        key={picture.id}
                        accessibilityRole="button"
                        accessibilityLabel={`${picture.name} profile picture`}
                        accessibilityState={{ selected }}
                        onPress={() => {
                          setProfilePicture(picture.id);
                          setSaveMessage("");
                        }}
                        style={[
                          styles.optionCard,
                          selected && styles.optionCardSelected,
                        ]}
                      >
                        <View
                          style={[
                            styles.optionImageFrame,
                            getProfileBorderStyle(profileBorder),
                          ]}
                        >
                          <Image
                            source={PROFILE_PICTURES[picture.id]}
                            style={styles.optionImage}
                            contentFit="cover"
                          />
                          <ProfileBorderOverlay borderId={profileBorder} />
                        </View>
                        <Text style={styles.optionName}>{picture.name}</Text>
                        {selected && (
                          <Text style={styles.selectedLabel}>SELECTED</Text>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <View>
                  <Text style={styles.borderHint}>
                    Unlock frames in the store to equip them.
                  </Text>
                  <View style={styles.optionGrid}>
                    {availableBorders.map((border) => {
                      const selected = profileBorder === border.id;
                      return (
                        <Pressable
                          key={border.id}
                          accessibilityRole="button"
                          accessibilityLabel={`${border.name} profile border`}
                          accessibilityState={{ selected }}
                          onPress={() => selectBorder(border.id)}
                          style={[
                            styles.optionCard,
                            selected && styles.optionCardSelected,
                          ]}
                        >
                          <View
                            style={[
                              styles.optionImageFrame,
                              getProfileBorderStyle(border.id),
                            ]}
                          >
                            {selectedPicture ? (
                              <Image
                                source={selectedPicture}
                                style={styles.optionImage}
                                contentFit="cover"
                              />
                            ) : null}
                            <ProfileBorderOverlay borderId={border.id} />
                          </View>
                          <Text style={styles.optionName}>{border.name}</Text>
                          {selected && (
                            <Text style={styles.selectedLabel}>SELECTED</Text>
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}
            </View>
            {!!saveMessage && (
              <Text accessibilityRole="alert" style={styles.saveMessage}>
                {saveMessage}
              </Text>
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
  headerAvatarFrame: {
    width: 38,
    height: 38,
    padding: 2,
    borderRadius: 13,
    borderWidth: 1,
    backgroundColor: "rgba(5, 18, 14, 0.9)",
  },
  headerAvatar: { width: "100%", height: "100%", borderRadius: 10 },
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
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(217, 249, 157, 0.15)",
  },
  cardKicker: {
    color: "#a3e635",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  cardTitle: {
    marginTop: 2,
    color: "#f0fdf4",
    fontSize: 16,
    fontWeight: "900",
  },
  savedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(21, 128, 61, 0.28)",
    borderWidth: 1,
    borderColor: "rgba(134, 239, 172, 0.42)",
  },
  savedDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: "#4ade80",
  },
  savedText: {
    color: "#bbf7d0",
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  content: { flexGrow: 1, padding: 12, gap: 10 },
  identityPanel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(163, 230, 53, 0.28)",
    backgroundColor: "rgba(15, 35, 25, 0.94)",
  },
  avatarLargeFrame: {
    width: 74,
    height: 74,
    padding: 4,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    borderWidth: 1,
    backgroundColor: "rgba(5, 18, 14, 0.9)",
  },
  avatarLarge: { width: "100%", height: "100%", borderRadius: 17 },
  nameEditor: { flex: 1, minWidth: 0, gap: 5 },
  fieldLabel: {
    color: "#9ae6b4",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },
  nameInput: {
    minHeight: 38,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "rgba(217, 249, 157, 0.32)",
    backgroundColor: "rgba(2, 12, 9, 0.8)",
    color: "#f0fdf4",
    fontSize: 14,
    fontWeight: "800",
  },
  profileHint: { color: "#9bb7aa", fontSize: 9, fontWeight: "600" },
  levelPanel: {
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(250, 204, 21, 0.28)",
    backgroundColor: "rgba(40, 31, 11, 0.55)",
  },
  levelHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  levelTitle: {
    color: "#fde68a",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1,
  },
  levelValue: { color: "#fff3c4", fontSize: 11, fontWeight: "900" },
  levelProgressTrack: {
    height: 6,
    overflow: "hidden",
    borderRadius: 999,
    backgroundColor: "rgba(15, 23, 42, 0.9)",
  },
  levelProgressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#facc15",
  },
  levelXpText: { color: "#fef3c7", fontSize: 8, fontWeight: "800" },
  levelTotalXp: { color: "#cbd5e1", fontWeight: "600" },
  tabs: { flexDirection: "row", gap: 8 },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    minHeight: 38,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.28)",
    backgroundColor: "rgba(8, 24, 19, 0.78)",
  },
  activeTab: {
    backgroundColor: "rgba(21, 128, 61, 0.32)",
    borderColor: "#4ade80",
  },
  tabIcon: { color: "#a7f3d0", fontSize: 15, fontWeight: "900" },
  tabText: {
    color: "#9bb7aa",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  activeTabText: { color: "#ecfdf5" },
  optionsPanel: {
    minHeight: 132,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(217, 249, 157, 0.2)",
    backgroundColor: "rgba(4, 17, 13, 0.7)",
  },
  optionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "stretch",
    justifyContent: "center",
    gap: 8,
  },
  borderHint: {
    marginBottom: 8,
    color: "#cbd5e1",
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center",
  },
  optionCard: {
    width: 104,
    minHeight: 106,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    padding: 7,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.28)",
    backgroundColor: "rgba(10, 31, 25, 0.85)",
  },
  optionCardSelected: {
    borderWidth: 2,
    borderColor: "#facc15",
    backgroundColor: "rgba(120, 83, 10, 0.24)",
  },
  optionImageFrame: {
    width: 58,
    height: 58,
    padding: 3,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 17,
    borderWidth: 1,
    backgroundColor: "rgba(5, 18, 14, 0.9)",
    shadowRadius: 7,
  },
  optionImage: { width: 48, height: 48, borderRadius: 12 },
  optionName: {
    color: "#f0fdf4",
    fontSize: 10,
    fontWeight: "800",
    textAlign: "center",
  },
  selectedLabel: {
    color: "#fde68a",
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  saveMessage: {
    color: "#bbf7d0",
    fontSize: 9,
    fontWeight: "700",
    textAlign: "right",
  },
});
