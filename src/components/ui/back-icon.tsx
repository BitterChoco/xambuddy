import { getRemoteAssetSource } from "@/services/remote-assets";
import { Image } from "expo-image";

const backIcon = getRemoteAssetSource("game/icons/back_1.png");

export function BackIcon() {
  return (
    <Image
      source={backIcon}
      style={{ width: 24, height: 24, alignSelf: "center" }}
      contentFit="contain"
      pointerEvents="none"
    />
  );
}
