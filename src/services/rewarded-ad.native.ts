import { Platform, TurboModuleRegistry } from "react-native";

import { REWARDED_AD_UNIT_IDS } from "@/constants/ads-config";

export type RewardedAdResult = "earned" | "dismissed" | "unavailable";

const AD_LOAD_TIMEOUT_MS = 20000;

let initialization: Promise<unknown> | null = null;

function ensureInitialized(
  mobileAds: typeof import("react-native-google-mobile-ads").default,
) {
  initialization ??= mobileAds()
    .initialize()
    .catch((error: unknown) => {
      initialization = null;
      throw error;
    });
  return initialization;
}

function getUnitId(testUnitId: string) {
  const productionId =
    Platform.OS === "ios"
      ? REWARDED_AD_UNIT_IDS.ios
      : REWARDED_AD_UNIT_IDS.android;
  // App IDs contain "~"; rewarded ad unit IDs contain "/".
  return __DEV__ || !/^ca-app-pub-\d+\/\d+$/.test(productionId)
    ? testUnitId
    : productionId;
}

// Loads and shows one rewarded ad; resolves "earned" only if it was watched.
export async function showRewardedAd(): Promise<RewardedAdResult> {
  // Expo Go and outdated native builds do not include this module. Avoid
  // importing the library until we know its native implementation exists.
  if (!TurboModuleRegistry.get("RNGoogleMobileAdsModule")) {
    console.warn(
      "[RewardedAd] Native Google Mobile Ads module is missing. Rebuild and reinstall the Android app after adding the ads plugin.",
    );
    return "unavailable";
  }

  let ads: typeof import("react-native-google-mobile-ads");
  try {
    ads = await import("react-native-google-mobile-ads");
  } catch (error) {
    console.warn("[RewardedAd] Could not load the native ads package:", error);
    return "unavailable";
  }
  const {
    default: mobileAds,
    AdEventType,
    RewardedAd,
    RewardedAdEventType,
    TestIds,
  } = ads;

  return new Promise((resolve) => {
    const ad = RewardedAd.createForAdRequest(getUnitId(TestIds.REWARDED));
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
      ad.addAdEventListener(AdEventType.ERROR, (error) => {
        console.warn("[RewardedAd] Ad request failed:", error);
        finish("unavailable");
      }),
    );

    loadTimer = setTimeout(() => {
      console.warn(
        `[RewardedAd] No ad loaded within ${AD_LOAD_TIMEOUT_MS}ms. Check connectivity and AdMob app/unit ID configuration.`,
      );
      finish("unavailable");
    }, AD_LOAD_TIMEOUT_MS);
    ensureInitialized(mobileAds)
      .then(() => ad.load())
      .catch((error: unknown) => {
        console.warn("[RewardedAd] Ads SDK initialization failed:", error);
        finish("unavailable");
      });
  });
}
