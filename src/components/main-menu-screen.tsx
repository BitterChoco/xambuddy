import { Image } from "expo-image";
import { useEffect, useState } from "react";
import {
    Animated,
    Pressable,
    StyleSheet,
    Text,
    View,
    useWindowDimensions,
} from "react-native";

import type { BundledImage } from "@/constants/game-catalog";

type MainMenuScreenProps = {
  heroImage?: BundledImage;
  orbImage?: BundledImage;
  buddyImage?: BundledImage;
  onHeroPress: () => void;
  onPlayPress: () => void;
};

export function MainMenuScreen({
  heroImage,
  orbImage,
  buddyImage,
  onHeroPress,
  onPlayPress,
}: MainMenuScreenProps) {
  const { width, height } = useWindowDimensions();
  const [isModePickerOpen, setIsModePickerOpen] = useState(false);
  const [selectedMode, setSelectedMode] = useState("Survival");
  const [facingX] = useState(() => new Animated.Value(1));
  const [orbX] = useState(() => new Animated.Value(0));
  const [orbY] = useState(() => new Animated.Value(0));
  const [buddyX] = useState(() => new Animated.Value(0));
  const [buddyTilt] = useState(() => new Animated.Value(0));
  const spriteHeight = Math.min(height * 0.7, width * 0.42, 390);
  const spriteWidth = spriteHeight * 0.76;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const flipDirection = () => {
      Animated.timing(facingX, {
        toValue: Math.random() < 0.5 ? -1 : 1,
        duration: 180,
        useNativeDriver: true,
      }).start();
      timer = setTimeout(flipDirection, 1800 + Math.random() * 2600);
    };
    timer = setTimeout(flipDirection, 900 + Math.random() * 1500);
    return () => {
      clearTimeout(timer);
      facingX.stopAnimation();
    };
  }, [facingX]);

  useEffect(() => {
    const orbDrift = Animated.loop(
      Animated.sequence([
        Animated.timing(orbX, {
          toValue: 24,
          duration: 4200,
          useNativeDriver: true,
        }),
        Animated.timing(orbX, {
          toValue: -20,
          duration: 6100,
          useNativeDriver: true,
        }),
        Animated.timing(orbX, {
          toValue: 0,
          duration: 3100,
          useNativeDriver: true,
        }),
      ]),
    );
    const orbFloat = Animated.loop(
      Animated.sequence([
        Animated.timing(orbY, {
          toValue: -12,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(orbY, {
          toValue: 10,
          duration: 2200,
          useNativeDriver: true,
        }),
      ]),
    );
    const buddyWalk = Animated.loop(
      Animated.sequence([
        Animated.timing(buddyX, {
          toValue: -12,
          duration: 1700 + Math.random() * 700,
          useNativeDriver: true,
        }),
        Animated.timing(buddyX, {
          toValue: 14,
          duration: 1800 + Math.random() * 700,
          useNativeDriver: true,
        }),
        Animated.timing(buddyX, {
          toValue: 0,
          duration: 1200 + Math.random() * 500,
          useNativeDriver: true,
        }),
      ]),
    );
    const buddyWiggle = Animated.loop(
      Animated.sequence([
        Animated.timing(buddyTilt, {
          toValue: -1,
          duration: 380,
          useNativeDriver: true,
        }),
        Animated.timing(buddyTilt, {
          toValue: 1,
          duration: 420,
          useNativeDriver: true,
        }),
        Animated.timing(buddyTilt, {
          toValue: 0,
          duration: 360,
          useNativeDriver: true,
        }),
      ]),
    );
    orbDrift.start();
    orbFloat.start();
    buddyWalk.start();
    buddyWiggle.start();
    return () => {
      orbDrift.stop();
      orbFloat.stop();
      buddyWalk.stop();
      buddyWiggle.stop();
    };
  }, [buddyTilt, buddyX, orbX, orbY]);

  const buddyRotation = buddyTilt.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ["-5deg", "0deg", "5deg"],
  });

  return (
    <View style={[styles.page, isModePickerOpen && styles.pageModePickerOpen]}>
      {isModePickerOpen && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close game mode menu"
          onPress={() => setIsModePickerOpen(false)}
          style={styles.dismissOverlay}
        />
      )}
      <View style={[styles.heroScene, { left: 84, right: 84, bottom: 86 }]}>
        {orbImage && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.orbSprite,
              {
                left: "50%",
                marginLeft: -spriteWidth / 2 - spriteHeight * 0.13,
                top: "12%",
                transform: [{ translateX: orbX }, { translateY: orbY }],
              },
            ]}
          >
            <Image
              source={orbImage}
              contentFit="contain"
              style={{ width: spriteHeight * 0.2, height: spriteHeight * 0.2 }}
              accessibilityLabel="Equipped orb companion"
            />
          </Animated.View>
        )}
        {heroImage && (
          <Animated.View
            style={[
              styles.heroSprite,
              {
                width: spriteWidth,
                height: spriteHeight,
                left: "50%",
                marginLeft: -spriteWidth / 2,
                transform: [{ scaleX: facingX }],
              },
            ]}
          >
            <Image
              source={heroImage}
              contentFit="contain"
              style={styles.heroImage}
              accessibilityLabel="Selected hero with equipped skin"
            />
          </Animated.View>
        )}
        {buddyImage && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.buddySprite,
              {
                left: "50%",
                marginLeft: spriteWidth * 0.08,
                bottom: -5,
                transform: [{ translateX: buddyX }, { rotate: buddyRotation }],
              },
            ]}
          >
            <Image
              source={buddyImage}
              contentFit="contain"
              style={{
                width: spriteHeight * 0.28,
                height: spriteHeight * 0.25,
              }}
              accessibilityLabel="Equipped buddy companion"
            />
          </Animated.View>
        )}
      </View>

      <View
        style={[
          styles.heroAction,
          {
            left: "50%",
            marginLeft: -74,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose hero, skin, and companions"
          onPress={onHeroPress}
          style={({ pressed }) => [
            styles.heroButton,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.heroButtonText}>CHOOSE HERO</Text>
        </Pressable>
      </View>

      <View style={styles.playControls}>
        {isModePickerOpen && (
          <View style={styles.modeOptions}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: true }}
              disabled
              style={[styles.modeOption, styles.modeOptionDisabled]}
            >
              <Text style={styles.modeOptionText}>Explore</Text>
              <Text style={styles.lockIcon}>🔒</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: selectedMode === "Survival" }}
              onPress={() => {
                setSelectedMode("Survival");
                setIsModePickerOpen(false);
              }}
              style={[styles.modeOption, styles.modeOptionSelected]}
            >
              <Text
                style={[styles.modeOptionText, styles.modeOptionSelectedText]}
              >
                Survival
              </Text>
              <Text style={styles.selectedCheck}>✓</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: true }}
              disabled
              style={[styles.modeOption, styles.modeOptionDisabled]}
            >
              <Text style={styles.modeOptionText}>Adventure</Text>
              <Text style={styles.lockIcon}>🔒</Text>
            </Pressable>
          </View>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${isModePickerOpen ? "Close" : "Choose"} game mode, ${selectedMode} selected`}
          accessibilityState={{ expanded: isModePickerOpen }}
          onPress={() => setIsModePickerOpen((open) => !open)}
          style={({ pressed }) => [
            styles.modeButton,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.modeButtonText}>
            {selectedMode.toUpperCase()} {isModePickerOpen ? "⌄" : "⌃"}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Play ${selectedMode}`}
          onPress={onPlayPress}
          style={({ pressed }) => [
            styles.playButton,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.playButtonText}>PLAY</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "transparent",
  },
  pageModePickerOpen: {
    zIndex: 60,
    elevation: 60,
  },
  heroScene: {
    position: "absolute",
    top: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  dismissOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 1,
  },
  heroSprite: {
    position: "absolute",
    left: "50%",
    bottom: 0,
    zIndex: 2,
  },
  heroImage: {
    width: "100%",
    height: "100%",
  },
  orbSprite: {
    position: "absolute",
    width: 72,
    height: 72,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  buddySprite: {
    position: "absolute",
    zIndex: 3,
  },
  heroAction: {
    position: "absolute",
    bottom: 12,
    zIndex: 4,
  },
  heroButton: {
    minWidth: 148,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(217, 249, 157, 0.42)",
    backgroundColor: "rgba(4, 17, 13, 0.94)",
  },
  heroButtonText: {
    color: "#d9f99d",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  playControls: {
    position: "absolute",
    right: 16,
    alignItems: "center",
    bottom: 12,
    gap: 7,
    zIndex: 5,
  },
  modeOptions: {
    zIndex: 61,
    elevation: 61,
    width: 170,
    gap: 4,
    padding: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(217, 249, 157, 0.4)",
    backgroundColor: "rgba(4, 17, 13, 0.96)",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
  },
  modeOption: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(217, 249, 157, 0.14)",
    backgroundColor: "rgba(15, 35, 25, 0.94)",
  },
  modeOptionDisabled: { opacity: 0.58 },
  modeOptionSelected: {
    borderColor: "rgba(163, 230, 53, 0.75)",
    backgroundColor: "rgba(163, 230, 53, 0.15)",
  },
  modeOptionText: {
    color: "#cbd5e1",
    fontSize: 11,
    fontWeight: "800",
  },
  modeOptionSelectedText: { color: "#d9f99d" },
  lockIcon: { fontSize: 11 },
  selectedCheck: { color: "#bef264", fontSize: 13, fontWeight: "900" },
  modeButton: {
    minWidth: 170,
    minHeight: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "rgba(217, 249, 157, 0.4)",
    backgroundColor: "rgba(4, 17, 13, 0.94)",
  },
  modeButtonText: {
    color: "#d9f99d",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  playButton: {
    width: 170,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "#a3e635",
  },
  playButtonText: {
    color: "#14220b",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 1,
  },
  buttonPressed: { transform: [{ scale: 0.96 }] },
});
