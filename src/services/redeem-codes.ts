import AsyncStorage from "@react-native-async-storage/async-storage";

import { addMail } from "@/services/mailbox";
import { fetchRemoteAssetJson } from "@/services/remote-assets";

const REDEEM_CODES_PATH = "game/constants/redeem-codes.json";
const REDEEMED_CODES_KEY = "wild-paw.redeemed-codes";

type RedeemReward = {
  id: "coin" | "exp";
  amount: number;
};

export type RedeemCode = {
  code: string;
  message?: string;
  rewards: RedeemReward[];
  expiry: string;
};

type RedeemCodeCatalog = {
  items: RedeemCode[];
};

export type RedeemResult = {
  success: boolean;
  message: string;
};

let redemptionQueue: Promise<void> = Promise.resolve();

export async function loadRedeemCodes() {
  const catalog =
    await fetchRemoteAssetJson<Partial<RedeemCodeCatalog>>(REDEEM_CODES_PATH);
  if (!Array.isArray(catalog.items)) {
    throw new Error("The redeem-code catalog has an unsupported format.");
  }

  return catalog.items.flatMap((item): RedeemCode[] => {
    if (
      !item ||
      typeof item.code !== "string" ||
      typeof item.expiry !== "string" ||
      !Number.isFinite(Date.parse(item.expiry)) ||
      !Array.isArray(item.rewards)
    ) {
      return [];
    }

    const rewards = item.rewards.filter(
      (reward): reward is RedeemReward =>
        !!reward &&
        (reward.id === "coin" || reward.id === "exp") &&
        Number.isSafeInteger(reward.amount) &&
        reward.amount > 0,
    );
    const code = item.code.trim().toUpperCase();
    return code && rewards.length > 0
      ? [
          {
            code,
            message:
              typeof item.message === "string" && item.message.trim()
                ? item.message.trim()
                : undefined,
            rewards,
            expiry: item.expiry,
          },
        ]
      : [];
  });
}

function readRedeemedCodes(value: string | null) {
  if (!value) return [] as string[];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((code): code is string => typeof code === "string")
      : [];
  } catch {
    return [];
  }
}

async function redeemCodeNow(
  input: string,
  codes: RedeemCode[],
): Promise<RedeemResult> {
  const code = input.trim().toUpperCase();
  if (!code) {
    return { success: false, message: "Enter a redeem code first." };
  }

  const redeemCode = codes.find((entry) => entry.code === code);
  if (!redeemCode) {
    return { success: false, message: "That code is invalid or unavailable." };
  }
  if (Date.now() > Date.parse(redeemCode.expiry)) {
    return { success: false, message: "That code has expired." };
  }

  const redeemedCodes = readRedeemedCodes(
    await AsyncStorage.getItem(REDEEMED_CODES_KEY),
  );
  if (redeemedCodes.includes(code)) {
    return { success: false, message: "You have already redeemed that code." };
  }

  try {
    await addMail({
      title: "Code Redemption",
      message:
        redeemCode.message ??
        "Thank you for redeeming your code! Here are your rewards.",
      rewards: redeemCode.rewards,
    });
    await AsyncStorage.setItem(
      REDEEMED_CODES_KEY,
      JSON.stringify([...redeemedCodes, code]),
    );
  } catch {
    return {
      success: false,
      message: "Could not save your reward. Please try again.",
    };
  }

  return {
    success: true,
    message:
      "Code redeemed! Your rewards were sent to your email. Open the mailbox to claim them.",
  };
}

export function redeemCode(input: string, codes: RedeemCode[]) {
  const redemption = redemptionQueue.then(() => redeemCodeNow(input, codes));
  redemptionQueue = redemption.then(
    () => undefined,
    () => undefined,
  );
  return redemption;
}
