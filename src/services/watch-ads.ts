import AsyncStorage from "@react-native-async-storage/async-storage";

import { addMail, isRewardId, type MailReward } from "@/services/mailbox";
import { fetchRemoteAssetJson } from "@/services/remote-assets";
import { showRewardedAd } from "@/services/rewarded-ad";

const AD_REWARDS_PATH = "game/constants/watch-ads-rewards.json";
const AD_STATE_KEY = "wild-paw.watch-ads";
const MAX_AD_SLOTS = 10;

export type AdReward = { slot: number; rewards: MailReward[] };

export type AdState = {
  /** Slots already claimed today. */
  claimedCount: number;
};

type StoredAdState = { date: string; claimedCount: number };

// Used until a watch-ads-rewards.json is uploaded.
const DEFAULT_AD_REWARDS: AdReward[] = [
  { slot: 1, rewards: [{ id: "coin", amount: 100 }] },
  { slot: 2, rewards: [{ id: "coin", amount: 150 }] },
  { slot: 3, rewards: [{ id: "coin", amount: 200 }] },
  { slot: 4, rewards: [{ id: "coin", amount: 300 }] },
  { slot: 5, rewards: [{ id: "coin", amount: 400 }] },
  { slot: 6, rewards: [{ id: "coin", amount: 500 }] },
  { slot: 7, rewards: [{ id: "diamond", amount: 1 }] },
];

function todayKey() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export async function loadAdRewards(): Promise<AdReward[]> {
  try {
    const catalog = await fetchRemoteAssetJson<{ items?: unknown }>(
      AD_REWARDS_PATH,
    );
    if (!Array.isArray(catalog.items)) return DEFAULT_AD_REWARDS;

    const bySlot = new Map<number, AdReward>();
    for (const item of catalog.items as Partial<AdReward>[]) {
      if (
        !item ||
        !Number.isInteger(item.slot) ||
        item.slot! < 1 ||
        item.slot! > MAX_AD_SLOTS ||
        !Array.isArray(item.rewards)
      ) {
        continue;
      }
      const rewards = item.rewards.filter(
        (reward): reward is MailReward =>
          !!reward &&
          isRewardId(reward.id) &&
          Number.isSafeInteger(reward.amount) &&
          reward.amount > 0,
      );
      if (rewards.length > 0) {
        bySlot.set(item.slot!, { slot: item.slot!, rewards });
      }
    }
    const rewards = [...bySlot.values()].sort((a, b) => a.slot - b.slot);
    return rewards.length > 0 ? rewards : DEFAULT_AD_REWARDS;
  } catch {
    return DEFAULT_AD_REWARDS;
  }
}

async function readClaimedCount(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(AD_STATE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<StoredAdState>) : null;
    // A new day starts with nothing claimed.
    if (parsed?.date === todayKey() && Number.isInteger(parsed.claimedCount)) {
      return Math.max(0, parsed.claimedCount as number);
    }
  } catch {
    // Unreadable data is treated as nothing claimed.
  }
  return 0;
}

export async function getAdState(): Promise<AdState> {
  return { claimedCount: await readClaimedCount() };
}

export type AdClaimResult = {
  state: AdState;
  outcome: "claimed" | "dismissed" | "unavailable" | "none";
};

let claimQueue: Promise<unknown> = Promise.resolve();

// Shows an ad, then claims the next slot in order and mails the reward.
export function claimAdReward(rewards: AdReward[]): Promise<AdClaimResult> {
  const run = claimQueue.then(async (): Promise<AdClaimResult> => {
    const claimedCount = await readClaimedCount();
    const reward = rewards[claimedCount];
    if (!reward) return { state: { claimedCount }, outcome: "none" };

    const adResult = await showRewardedAd();
    if (adResult !== "earned") {
      return { state: { claimedCount }, outcome: adResult };
    }

    // Saved before the mail is sent so a failure can't allow a double claim.
    const next = claimedCount + 1;
    await AsyncStorage.setItem(
      AD_STATE_KEY,
      JSON.stringify({
        date: todayKey(),
        claimedCount: next,
      } satisfies StoredAdState),
    );
    await addMail({
      title: "Watch Ads Reward",
      message: `Thanks for watching! Here is your reward for ad ${reward.slot}.`,
      rewards: reward.rewards,
    });
    return { state: { claimedCount: next }, outcome: "claimed" };
  });
  claimQueue = run.catch(() => undefined);
  return run;
}
