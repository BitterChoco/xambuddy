import AsyncStorage from "@react-native-async-storage/async-storage";

const DIAMOND_BALANCE_KEY = "wild-paw.diamond-balance";

type DiamondListener = (balance: number) => void;

const listeners = new Set<DiamondListener>();
let cachedBalance: number | null = null;
let balanceLoad: Promise<number> | null = null;
let updateQueue: Promise<void> = Promise.resolve();

export async function getDiamondBalance() {
  if (cachedBalance !== null) return cachedBalance;

  if (!balanceLoad) {
    balanceLoad = AsyncStorage.getItem(DIAMOND_BALANCE_KEY)
      .then((storedBalance) => {
        const parsedBalance = Number(storedBalance ?? 0);
        cachedBalance =
          Number.isSafeInteger(parsedBalance) && parsedBalance >= 0
            ? parsedBalance
            : 0;
        return cachedBalance;
      })
      .finally(() => {
        balanceLoad = null;
      });
  }

  return balanceLoad;
}

export function subscribeToDiamondBalance(listener: DiamondListener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function awardDiamonds(amount: number) {
  const reward = Math.max(0, Math.floor(amount));
  if (reward === 0) return getDiamondBalance();

  const update = updateQueue.then(async () => {
    const nextBalance = (await getDiamondBalance()) + reward;
    await AsyncStorage.setItem(DIAMOND_BALANCE_KEY, String(nextBalance));
    cachedBalance = nextBalance;
    for (const listener of listeners) listener(nextBalance);
    return nextBalance;
  });

  updateQueue = update.then(
    () => undefined,
    () => undefined,
  );
  return update;
}

export function spendDiamonds(amount: number) {
  const cost = Math.max(0, Math.floor(amount));
  if (cost === 0) return Promise.resolve(true);

  const update = updateQueue.then(async () => {
    const currentBalance = await getDiamondBalance();
    if (currentBalance < cost) return false;

    const nextBalance = currentBalance - cost;
    await AsyncStorage.setItem(DIAMOND_BALANCE_KEY, String(nextBalance));
    cachedBalance = nextBalance;
    for (const listener of listeners) listener(nextBalance);
    return true;
  });

  updateQueue = update.then(
    () => undefined,
    () => undefined,
  );
  return update;
}
