import {
    getSoundEffectsVolume,
    subscribeToSoundEffectsVolume,
} from "@/constants/player-settings";
import { getRemoteAssetSource } from "@/services/remote-assets";
import { createAudioPlayer } from "expo-audio";
import { useCallback, type ComponentProps } from "react";
import { Pressable as NativePressable } from "react-native";

const buttonClickSound = getRemoteAssetSource("game/sound/button_click_1.mp3");
let clickPlayer: ReturnType<typeof createAudioPlayer> | null = null;
let clickVolume = 0.75;
let hasInitializedVolume = false;

function initializeClickSound() {
  if (hasInitializedVolume) return;
  hasInitializedVolume = true;
  subscribeToSoundEffectsVolume((volume) => {
    clickVolume = volume;
    if (clickPlayer) clickPlayer.volume = volume;
  });
  void getSoundEffectsVolume().then((volume) => {
    clickVolume = volume;
    if (clickPlayer) clickPlayer.volume = volume;
  });
}

function playButtonClickSound() {
  initializeClickSound();
  if (clickVolume <= 0) return;

  try {
    clickPlayer ??= createAudioPlayer(buttonClickSound);
    clickPlayer.volume = clickVolume;
    void clickPlayer
      .seekTo(0)
      .then(() => clickPlayer?.play())
      .catch(() => undefined);
  } catch {
    // Keep button actions working if the sound asset is unavailable.
  }
}

type SoundPressableProps = ComponentProps<typeof NativePressable>;

export function SoundPressable({ onPress, ...props }: SoundPressableProps) {
  const handlePress = useCallback<NonNullable<SoundPressableProps["onPress"]>>(
    (event) => {
      if (onPress) {
        playButtonClickSound();
        onPress(event);
      }
    },
    [onPress],
  );

  return <NativePressable {...props} onPress={handlePress} />;
}
