import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

import { awardCoins } from "@/constants/coin-wallet";
import { awardPlayerXp } from "@/constants/player-experience";

const MAILBOX_KEY = "wild-paw.mailbox";

export type MailReward = { id: "coin" | "exp"; amount: number };

export type MailMessage = {
  id: string;
  title: string;
  message: string;
  rewards: MailReward[];
  receivedAt: number;
  read: boolean;
  claimed: boolean;
};

const listeners = new Set<(mails: MailMessage[]) => void>();
let cache: MailMessage[] | null = null;
let queue: Promise<unknown> = Promise.resolve();

function parseMails(value: string | null): MailMessage[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (mail): mail is MailMessage =>
          !!mail &&
          typeof mail.id === "string" &&
          typeof mail.message === "string" &&
          Array.isArray(mail.rewards),
      )
      .map((mail) => ({
        ...mail,
        // Older redemption mails embedded the code in the title and message.
        title: /^Code (?!Redemption$)/.test(mail.title)
          ? "Code Redemption"
          : mail.title,
        message: mail.message.replace(
          /^Thank you for redeeming code .+?! Here are your rewards\.$/,
          "Thank you for redeeming your code! Here are your rewards.",
        ),
      }));
  } catch {
    return [];
  }
}

export async function loadMails() {
  if (cache) return cache;
  cache = parseMails(await AsyncStorage.getItem(MAILBOX_KEY));
  return cache;
}

// Serialized so concurrent updates never overwrite each other.
function updateMails(
  update: (mails: MailMessage[]) => MailMessage[],
): Promise<MailMessage[]> {
  const run = queue.then(async () => {
    const next = update(await loadMails());
    await AsyncStorage.setItem(MAILBOX_KEY, JSON.stringify(next));
    cache = next;
    for (const listener of listeners) listener(next);
    return next;
  });
  queue = run.catch(() => undefined);
  return run;
}

export function addMail(
  mail: Pick<MailMessage, "title" | "message" | "rewards">,
) {
  return updateMails((mails) => [
    {
      ...mail,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      receivedAt: Date.now(),
      read: false,
      claimed: false,
    },
    ...mails,
  ]);
}

export function markMailRead(id: string) {
  return updateMails((mails) =>
    mails.map((mail) => (mail.id === id ? { ...mail, read: true } : mail)),
  );
}

// Claims the email's unclaimed rewards, then deletes it.
export function deleteMail(id: string) {
  return bulkUpdate(
    (mails) => mails.filter((mail) => mail.id !== id),
    (mail) => mail.id === id,
  );
}

export type ClaimedTotals = { coin: number; exp: number };

async function bulkUpdate(
  update: (mails: MailMessage[]) => MailMessage[],
  isClaimable: (mail: MailMessage) => boolean,
): Promise<ClaimedTotals> {
  const totals: ClaimedTotals = { coin: 0, exp: 0 };
  await updateMails((mails) => {
    // Reset so a re-run of the updater never double counts.
    totals.coin = 0;
    totals.exp = 0;
    for (const mail of mails) {
      if (mail.claimed || !isClaimable(mail)) continue;
      for (const reward of mail.rewards) totals[reward.id] += reward.amount;
    }
    return update(mails);
  });
  // Marked claimed before awarding so a failure can't grant rewards twice.
  if (totals.coin > 0) await awardCoins(totals.coin);
  if (totals.exp > 0) await awardPlayerXp(totals.exp);
  return totals;
}

// Opens every email and claims all unclaimed rewards.
export function markAllMailRead() {
  return bulkUpdate(
    (mails) => mails.map((mail) => ({ ...mail, read: true, claimed: true })),
    () => true,
  );
}

// Claims rewards from opened emails, then deletes the opened emails.
export function deleteReadMails() {
  return bulkUpdate(
    (mails) => mails.filter((mail) => !mail.read),
    (mail) => mail.read,
  );
}

export async function claimMail(id: string) {
  const mails = await loadMails();
  const target = mails.find((mail) => mail.id === id);
  if (!target || target.claimed) return;
  // Mark claimed first so a failed save can't grant the reward twice.
  await updateMails((current) =>
    current.map((mail) =>
      mail.id === id ? { ...mail, claimed: true, read: true } : mail,
    ),
  );
  for (const reward of target.rewards) {
    if (reward.id === "coin") await awardCoins(reward.amount);
    else await awardPlayerXp(reward.amount);
  }
}

export function useMailbox() {
  const [mails, setMails] = useState<MailMessage[]>(cache ?? []);

  useEffect(() => {
    let isMounted = true;
    listeners.add(setMails);
    void loadMails()
      .then((loaded) => {
        if (isMounted) setMails(loaded);
      })
      .catch(() => undefined);
    return () => {
      isMounted = false;
      listeners.delete(setMails);
    };
  }, []);

  return { mails, unreadCount: mails.filter((mail) => !mail.read).length };
}
