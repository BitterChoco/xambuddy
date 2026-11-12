import { Stack, useLocalSearchParams } from "expo-router";

import { WildPawGame } from "@/components/wild-paw-game";
import { DEFAULT_HERO_ID } from "@/constants/game-catalog";

export default function GameScreen() {
  const {
    hero,
    skinId,
    skinColor,
    mode,
    multiplayerRole,
    hostAddress,
    hostIpAddress,
    hostIpAddresses,
    playerName,
    profilePicture,
    profileBorder,
    orbEquipped,
    orbSkinId,
    buddyId,
  } = useLocalSearchParams<{
    hero?: string;
    skinId?: string;
    skinColor?: string;
    mode?: string;
    multiplayerRole?: string;
    hostAddress?: string;
    hostIpAddress?: string;
    hostIpAddresses?: string;
    playerName?: string;
    profilePicture?: string;
    profileBorder?: string;
    orbEquipped?: string;
    orbSkinId?: string;
    buddyId?: string;
  }>();

  return (
    <>
      <Stack.Screen
        options={{
          gestureEnabled: false,
          fullScreenGestureEnabled: false,
        }}
      />
      <WildPawGame
        selectedHero={hero ?? DEFAULT_HERO_ID}
        selectedSkinId={skinId}
        selectedSkinColor={skinColor}
        multiplayerMode={mode}
        multiplayerRole={multiplayerRole}
        hostAddress={hostAddress}
        hostIpAddress={hostIpAddress}
        hostIpAddresses={hostIpAddresses}
        playerName={playerName}
        profilePicture={profilePicture}
        profileBorder={profileBorder}
        orbEquipped={orbEquipped === "true"}
        orbSkinId={orbSkinId}
        buddyId={buddyId}
      />
    </>
  );
}
