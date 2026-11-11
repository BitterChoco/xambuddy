import AsyncStorage from "@react-native-async-storage/async-storage";

const COIN_BALANCE_KEY = "wild-paw.coin-balance";

type CoinListener = (balance: number) => void;

const listeners = new Set<CoinListener>();
let cachedBalance: number | null = null;
let balanceLoad: Promise<number> | null = null;
let updateQueue: Promise<void> = Promise.resolve();

export async function getCoinBalance() {
  if (cachedBalance !== null) {
    return cachedBalance;
  }

  if (!balanceLoad) {
    balanceLoad = AsyncStorage.getItem(COIN_BALANCE_KEY)
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

export function subscribeToCoinBalance(listener: CoinListener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function awardCoins(amount: number) {
  const reward = Math.max(0, Math.floor(amount));
  if (reward === 0) {
    return getCoinBalance();
  }

  const update = updateQueue.then(async () => {
    const currentBalance = await getCoinBalance();
    const nextBalance = currentBalance + reward;
    await AsyncStorage.setItem(COIN_BALANCE_KEY, String(nextBalance));
    cachedBalance = nextBalance;
    for (const listener of listeners) {
      listener(nextBalance);
    }
    return nextBalance;
  });

  updateQueue = update.then(
    () => undefined,
    () => undefined,
  );
  return update;
}

export function spendCoins(amount: number) {
  const cost = Math.max(0, Math.floor(amount));
  if (cost === 0) {
    return Promise.resolve(true);
  }

  const update = updateQueue.then(async () => {
    const currentBalance = await getCoinBalance();
    if (currentBalance < cost) {
      return false;
    }

    const nextBalance = currentBalance - cost;
    await AsyncStorage.setItem(COIN_BALANCE_KEY, String(nextBalance));
    cachedBalance = nextBalance;
    for (const listener of listeners) {
      listener(nextBalance);
    }
    return true;
  });

  updateQueue = update.then(
    () => undefined,
    () => undefined,
  );
  return update;
}
