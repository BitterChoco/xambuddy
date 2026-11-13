import Slider from "@react-native-community/slider";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
    getMusicVolume,
    getSoundEffectsVolume,
    getVibrationEnabled,
    saveMusicVolume,
    saveSoundEffectsVolume,
    saveVibrationEnabled,
    updateMusicVolume,
    updateSoundEffectsVolume,
} from "@/constants/player-settings";
import { getRemoteAssetSource } from "@/services/remote-assets";

const settingsBackdrop = require("@/assets/images/background_1.png");
const settingsIcon = getRemoteAssetSource("game/icons/settings_1.png");

export default function SettingsScreen() {
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [soundEffectsVolume, setSoundEffectsVolume] = useState(0.75);
  const [musicVolume, setMusicVolume] = useState(0.5);

  useEffect(() => {
    let isMounted = true;
    void Promise.all([
      getVibrationEnabled(),
      getSoundEffectsVolume(),
      getMusicVolume(),
    ]).then(([vibration, soundEffects, music]) => {
      if (!isMounted) return;
      setVibrationEnabled(vibration);
      setSoundEffectsVolume(soundEffects);
      setMusicVolume(music);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const toggleVibration = (enabled: boolean) => {
    setVibrationEnabled(enabled);
    void saveVibrationEnabled(enabled).catch(() => {
      setVibrationEnabled(!enabled);
    });
  };

  const changeSoundEffectsVolume = (volume: number) => {
    setSoundEffectsVolume(volume);
    updateSoundEffectsVolume(volume);
  };

  const changeMusicVolume = (volume: number) => {
    setMusicVolume(volume);
    updateMusicVolume(volume);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Image
        source={settingsBackdrop}
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
            <Text style={styles.eyebrow}>WILD PAW · PREFERENCES</Text>
            <Text style={styles.title}>Settings</Text>
          </View>
          <Image
            source={settingsIcon}
            style={styles.headerIcon}
            contentFit="contain"
            accessibilityLabel="Settings"
          />
        </View>

        <View style={styles.card}>
          <View style={styles.settingsPanel}>
            <View style={styles.vibrationRow}>
              <View style={styles.optionCopy}>
                <Text style={styles.optionTitle}>Vibration</Text>
                <Text style={styles.optionDescription}>
                  Damage feedback during matches
                </Text>
              </View>
              <Switch
                accessibilityLabel="Vibration on damage"
                accessibilityHint="Turns damage vibration on or off"
                value={vibrationEnabled}
                onValueChange={toggleVibration}
                trackColor={{ false: "#475569", true: "#16a34a" }}
                thumbColor={vibrationEnabled ? "#dcfce7" : "#e2e8f0"}
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.volumeHeading}>
              <Text style={styles.optionTitle}>Sound effects</Text>
              <Text style={styles.volumeValue}>
                {Math.round(soundEffectsVolume * 100)}%
              </Text>
            </View>
            <Slider
              accessibilityLabel="Sound effects volume"
              accessibilityValue={{
                min: 0,
                max: 100,
                now: Math.round(soundEffectsVolume * 100),
              }}
              minimumValue={0}
              maximumValue={1}
              step={0.01}
              value={soundEffectsVolume}
              onValueChange={changeSoundEffectsVolume}
              onSlidingComplete={(volume) =>
                void saveSoundEffectsVolume(volume).catch(() => undefined)
              }
              minimumTrackTintColor="#4ade80"
              maximumTrackTintColor="#334155"
              thumbTintColor="#dcfce7"
              style={styles.slider}
            />

            <View style={styles.divider} />

            <View style={styles.volumeHeading}>
              <Text style={styles.optionTitle}>Music volume</Text>
              <Text style={styles.volumeValue}>
                {Math.round(musicVolume * 100)}%
              </Text>
            </View>
            <Slider
              accessibilityLabel="Music volume"
              accessibilityValue={{
                min: 0,
                max: 100,
                now: Math.round(musicVolume * 100),
              }}
              minimumValue={0}
              maximumValue={1}
              step={0.01}
              value={musicVolume}
              onValueChange={changeMusicVolume}
              onSlidingComplete={(volume) =>
                void saveMusicVolume(volume).catch(() => undefined)
              }
              minimumTrackTintColor="#4ade80"
              maximumTrackTintColor="#334155"
              thumbTintColor="#dcfce7"
              style={styles.slider}
            />
          </View>
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
    letterSpacing: 1.6,
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
    justifyContent: "center",
    overflow: "hidden",
    padding: 12,
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
  settingsPanel: {
    width: "100%",
    maxWidth: 620,
    alignSelf: "center",
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(163, 230, 53, 0.3)",
    backgroundColor: "rgba(15, 35, 25, 0.94)",
  },
  vibrationRow: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  optionCopy: {
    flex: 1,
    gap: 2,
  },
  optionDescription: {
    color: "#9bb7aa",
    fontSize: 10,
    fontWeight: "600",
  },
  optionTitle: {
    color: "#f0fdf4",
    fontSize: 13,
    fontWeight: "900",
  },
  divider: {
    height: 1,
    marginVertical: 5,
    backgroundColor: "rgba(217, 249, 157, 0.14)",
  },
  volumeHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  volumeValue: {
    minWidth: 42,
    color: "#bef264",
    fontSize: 12,
    fontWeight: "900",
    textAlign: "right",
  },
  slider: {
    width: "100%",
    height: 32,
    marginTop: 1,
  },
});
