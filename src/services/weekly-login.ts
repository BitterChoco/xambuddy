import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { addMail, isRewardId, type MailReward } from "@/services/mailbox";
import { fetchRemoteAssetJson } from "@/services/remote-assets";

const LOGIN_REWARDS_PATH = "game/constants/weekly-login-rewards.json";
const LOGIN_STREAK_KEY = "wild-paw.login-streak";
const MAX_ROADMAP_DAYS = 31;

export type LoginReward = { day: number; rewards: MailReward[] };

export type LoginRoadmapState = {
  /** Number of roadmap days already collected in the current run. */
  completedDays: number;
  /** The day that can be claimed right now, or null if today's is claimed. */
  claimableDay: number | null;
};

type StoredStreak = { lastClaimDate: string; lastDay: number };

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function getDateKeys() {
  const now = new Date();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  yesterday.setDate(yesterday.getDate() - 1);
  return { today: dateKey(now), yesterday: dateKey(yesterday) };
}

export async function loadLoginRewards(): Promise<LoginReward[]> {
  const catalog = await fetchRemoteAssetJson<{ items?: unknown }>(
    LOGIN_REWARDS_PATH,
  );
  if (!Array.isArray(catalog.items)) {
    throw new Error("The login reward catalog has an unsupported format.");
  }

  const byDay = new Map<number, LoginReward>();
  for (const item of catalog.items as Partial<LoginReward>[]) {
    if (
      !item ||
      !Number.isInteger(item.day) ||
      item.day! < 1 ||
      item.day! > MAX_ROADMAP_DAYS ||
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
    if (rewards.length > 0) byDay.set(item.day!, { day: item.day!, rewards });
  }
  return [...byDay.values()].sort((a, b) => a.day - b.day);
}

async function readStreak(): Promise<StoredStreak | null> {
  try {
    const raw = await AsyncStorage.getItem(LOGIN_STREAK_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<StoredStreak>) : null;
    if (
      parsed &&
      typeof parsed.lastClaimDate === "string" &&
      Number.isInteger(parsed.lastDay)
    ) {
      return {
        lastClaimDate: parsed.lastClaimDate,
        lastDay: parsed.lastDay as number,
      };
    }
  } catch {
    // Unreadable data is treated as no streak.
  }
  return null;
}

function resolveState(
  stored: StoredStreak | null,
  lastRoadmapDay: number,
): LoginRoadmapState {
  const { today, yesterday } = getDateKeys();
  if (stored?.lastClaimDate === today) {
    return { completedDays: stored.lastDay, claimableDay: null };
  }
  // Continue only if yesterday was claimed and the roadmap isn't finished.
  if (stored?.lastClaimDate === yesterday && stored.lastDay < lastRoadmapDay) {
    return { completedDays: stored.lastDay, claimableDay: stored.lastDay + 1 };
  }
  // A skipped day, or a finished roadmap, starts again from day 1.
  return { completedDays: 0, claimableDay: 1 };
}

export async function getLoginRoadmapState(
  rewards: LoginReward[],
): Promise<LoginRoadmapState> {
  const lastDay = rewards[rewards.length - 1]?.day ?? 0;
  return resolveState(await readStreak(), lastDay);
}

let claimQueue: Promise<unknown> = Promise.resolve();
const claimListeners = new Set<() => void>();

// Sends the current day's reward to the mailbox; one claim per calendar day.
export function claimLoginReward(
  rewards: LoginReward[],
): Promise<LoginRoadmapState> {
  const run = claimQueue.then(async () => {
    const lastDay = rewards[rewards.length - 1]?.day ?? 0;
    const state = resolveState(await readStreak(), lastDay);
    const reward = rewards.find((item) => item.day === state.claimableDay);
    if (!reward) return state;

    // Saved before the mail is sent so a failure can't allow a double claim.
    await AsyncStorage.setItem(
      LOGIN_STREAK_KEY,
      JSON.stringify({
        lastClaimDate: getDateKeys().today,
        lastDay: reward.day,
      } satisfies StoredStreak),
    );
    await addMail({
      title: "Daily Login Reward",
      message: `Thanks for playing! Here is your day ${reward.day} login reward.`,
      rewards: reward.rewards,
    });
    return { completedDays: reward.day, claimableDay: null };
  });
  claimQueue = run.catch(() => undefined);
  void run.then(
    () => {
      for (const listener of claimListeners) listener();
    },
    () => undefined,
  );
  return run;
}

// True while today's login reward hasn't been claimed.
export function useHasClaimableLoginReward() {
  const [hasClaimable, setHasClaimable] = useState(false);
  const isMountedRef = useRef(true);

  const refresh = useCallback(() => {
    void loadLoginRewards()
      .then(async (rewards) => {
        const state = await getLoginRoadmapState(rewards);
        if (isMountedRef.current) setHasClaimable(state.claimableDay !== null);
      })
      .catch(() => {
        if (isMountedRef.current) setHasClaimable(false);
      });
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    claimListeners.add(refresh);
    return () => {
      isMountedRef.current = false;
      claimListeners.delete(refresh);
    };
  }, [refresh]);

  // Re-check on focus so a new calendar day is picked up.
  useFocusEffect(refresh);

  return hasClaimable;
}
