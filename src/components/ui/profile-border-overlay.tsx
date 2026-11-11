import { getProfileBorder } from "@/constants/player-profile";
import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";

export function ProfileBorderOverlay({
  borderId,
}: {
  borderId: string;
}) {
  const border = getProfileBorder(borderId);

  if (!border.source) {
    return null;
  }

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Image
        source={border.source}
        contentFit="contain"
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
