import { Platform } from "react-native";
import mobileAds, {
    AdEventType,
    RewardedAd,
    RewardedAdEventType,
    TestIds,
} from "react-native-google-mobile-ads";

import { REWARDED_AD_UNIT_IDS } from "@/constants/ads-config";

export type RewardedAdResult = "earned" | "dismissed" | "unavailable";

const AD_LOAD_TIMEOUT_MS = 20000;

let initialization: Promise<unknown> | null = null;

function ensureInitialized() {
  initialization ??= mobileAds()
    .initialize()
    .catch((error: unknown) => {
      initialization = null;
      throw error;
    });
  return initialization;
}

function getUnitId() {
  const productionId =
    Platform.OS === "ios"
      ? REWARDED_AD_UNIT_IDS.ios
      : REWARDED_AD_UNIT_IDS.android;
  return __DEV__ || !productionId ? TestIds.REWARDED : productionId;
}

// Loads and shows one rewarded ad; resolves "earned" only if it was watched.
export function showRewardedAd(): Promise<RewardedAdResult> {
  return new Promise((resolve) => {
    const ad = RewardedAd.createForAdRequest(getUnitId());
    const unsubscribers: (() => void)[] = [];
    let earned = false;
    let settled = false;
    let loadTimer: ReturnType<typeof setTimeout> | undefined;

    const finish = (result: RewardedAdResult) => {
      if (settled) return;
      settled = true;
      if (loadTimer) clearTimeout(loadTimer);
      for (const unsubscribe of unsubscribers) unsubscribe();
      resolve(result);
    };

    unsubscribers.push(
      ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
        if (loadTimer) clearTimeout(loadTimer);
        ad.show().catch(() => finish("unavailable"));
      }),
      ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
        earned = true;
      }),
      ad.addAdEventListener(AdEventType.CLOSED, () => {
        finish(earned ? "earned" : "dismissed");
      }),
      ad.addAdEventListener(AdEventType.ERROR, () => finish("unavailable")),
    );

    loadTimer = setTimeout(() => finish("unavailable"), AD_LOAD_TIMEOUT_MS);
    ensureInitialized()
      .then(() => ad.load())
      .catch(() => finish("unavailable"));
  });
}
