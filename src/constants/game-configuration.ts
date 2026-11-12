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
  | "highDamage";

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
};

export type CoinRewardConfig = {
  pointsPerCoin: number;
};

export let dropConfig = {} as DropConfig;
export let coinRewards = {} as CoinRewardConfig;

export async function initializeRemoteGameConfiguration() {
  const [remoteDropConfig, remoteCoinRewards] = await Promise.all([
    readRemoteAssetJson<DropConfig>("game/constants/drop-config.json"),
    readRemoteAssetJson<CoinRewardConfig>("game/constants/coin-rewards.json"),
  ]);
  dropConfig = remoteDropConfig;
  coinRewards = remoteCoinRewards;
}
