export type RewardedAdResult = "earned" | "dismissed" | "unavailable";

// Ads are not supported on web, so the reward is granted without an ad.
export async function showRewardedAd(): Promise<RewardedAdResult> {
  return "earned";
}
