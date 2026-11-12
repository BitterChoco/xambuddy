import AsyncStorage from "@react-native-async-storage/async-storage";

const PLAYER_XP_KEY = "wild-paw.player-experience";
export const XP_PER_LEVEL = 1000;
const XP_LEVEL_INCREMENT = 500;

type ExperienceListener = (totalXp: number) => void;

const listeners = new Set<ExperienceListener>();
let cachedTotalXp: number | null = null;
let experienceLoad: Promise<number> | null = null;
let updateQueue: Promise<void> = Promise.resolve();

function normalizeTotalXp(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export async function getPlayerXp() {
  if (cachedTotalXp !== null) {
    return cachedTotalXp;
  }

  if (!experienceLoad) {
    experienceLoad = AsyncStorage.getItem(PLAYER_XP_KEY)
      .then((storedXp) => {
        cachedTotalXp = normalizeTotalXp(storedXp);
        return cachedTotalXp;
      })
      .finally(() => {
        experienceLoad = null;
      });
  }

  return experienceLoad;
}

export function subscribeToPlayerXp(listener: ExperienceListener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function awardPlayerXp(amount: number) {
  const reward = normalizeTotalXp(Math.floor(amount));
  if (reward === 0) {
    return getPlayerXp();
  }

  const update = updateQueue.then(async () => {
    const currentXp = await getPlayerXp();
    const nextXp = normalizeTotalXp(currentXp + reward);
    await AsyncStorage.setItem(PLAYER_XP_KEY, String(nextXp));
    cachedTotalXp = nextXp;
    for (const listener of listeners) {
      listener(nextXp);
    }
    return nextXp;
  });

  updateQueue = update.then(
    () => undefined,
    () => undefined,
  );
  return update;
}

export function getPlayerLevelProgress(totalXp: number) {
  const safeTotalXp = normalizeTotalXp(totalXp);
  const xpRequiredToReachLevel = (level: number) => {
    const completedLevels = level - 1;
    return (
      completedLevels * XP_PER_LEVEL +
      (XP_LEVEL_INCREMENT * completedLevels * (completedLevels - 1)) / 2
    );
  };

  let low = 1;
  let high = Math.floor(Math.sqrt(safeTotalXp / (XP_LEVEL_INCREMENT / 2))) + 2;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (xpRequiredToReachLevel(middle) <= safeTotalXp) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }

  const level = low;
  const xpIntoLevel = safeTotalXp - xpRequiredToReachLevel(level);
  const xpForNextLevel = XP_PER_LEVEL + (level - 1) * XP_LEVEL_INCREMENT;

  return {
    level,
    totalXp: safeTotalXp,
    xpIntoLevel,
    xpForNextLevel,
    xpToNextLevel: xpForNextLevel - xpIntoLevel,
    progress: xpIntoLevel / xpForNextLevel,
  };
}
