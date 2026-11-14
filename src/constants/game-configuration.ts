import { readRemoteAssetJson } from "@/services/remote-assets";

type DropCommonConfig = {
  enabled: boolean;
  dropChance: number;
  stayDurationSeconds: number;
  flickerDurationSeconds: number;
  flickerIntervalSeconds: number;
  pickupRadius: number;
  iconSize: number;
};

export type DropKind =
  | "heart"
  | "grenade"
  | "medkit"
  | "boots"
  | "rapidFire"
  | "highDamage"
  | "chest";

export type DropConfig = {
  heart: DropCommonConfig & {
    healAmount: number;
    healPopupDurationSeconds: number;
  };
  grenade: DropCommonConfig & { amount: number; inventoryCap: number };
  medkit: DropCommonConfig & { amount: number; inventoryCap: number };
  boots: DropCommonConfig & { amount: number };
  rapidFire: DropCommonConfig;
  highDamage: DropCommonConfig;
  chest: DropCommonConfig;
};

export type CoinRewardConfig = {
  pointsPerCoin: number;
};

export let dropConfig = {} as DropConfig;
export let coinRewards = {} as CoinRewardConfig;

const DEFAULT_DROP_CONFIG: DropConfig = {
  heart: {
    enabled: true,
    dropChance: 0.35,
    stayDurationSeconds: 8,
    flickerDurationSeconds: 2,
    flickerIntervalSeconds: 0.18,
    pickupRadius: 18,
    iconSize: 22,
    healAmount: 25,
    healPopupDurationSeconds: 1,
  },
  grenade: {
    enabled: true,
    dropChance: 0.2,
    stayDurationSeconds: 12,
    flickerDurationSeconds: 2,
    flickerIntervalSeconds: 0.2,
    pickupRadius: 18,
    iconSize: 20,
    amount: 1,
    inventoryCap: 3,
  },
  medkit: {
    enabled: true,
    dropChance: 0.18,
    stayDurationSeconds: 12,
    flickerDurationSeconds: 2,
    flickerIntervalSeconds: 0.2,
    pickupRadius: 18,
    iconSize: 20,
    amount: 1,
    inventoryCap: 3,
  },
  boots: {
    enabled: true,
    dropChance: 0.14,
    stayDurationSeconds: 12,
    flickerDurationSeconds: 2,
    flickerIntervalSeconds: 0.2,
    pickupRadius: 18,
    iconSize: 20,
    amount: 1,
  },
  rapidFire: {
    enabled: true,
    dropChance: 0.12,
    stayDurationSeconds: 12,
    flickerDurationSeconds: 2,
    flickerIntervalSeconds: 0.2,
    pickupRadius: 18,
    iconSize: 22,
  },
  highDamage: {
    enabled: true,
    dropChance: 0.1,
    stayDurationSeconds: 12,
    flickerDurationSeconds: 2,
    flickerIntervalSeconds: 0.2,
    pickupRadius: 18,
    iconSize: 20,
  },
  chest: {
    enabled: true,
    dropChance: 1,
    stayDurationSeconds: 30,
    flickerDurationSeconds: 0,
    flickerIntervalSeconds: 0.2,
    pickupRadius: 22,
    iconSize: 28,
  },
};

export async function initializeRemoteGameConfiguration() {
  const [remoteDropConfig, remoteCoinRewards] = await Promise.all([
    readRemoteAssetJson<Partial<DropConfig>>("game/constants/drop-config.json"),
    readRemoteAssetJson<CoinRewardConfig>("game/constants/coin-rewards.json"),
  ]);
  dropConfig = { ...DEFAULT_DROP_CONFIG, ...remoteDropConfig };
  coinRewards = remoteCoinRewards;
}
