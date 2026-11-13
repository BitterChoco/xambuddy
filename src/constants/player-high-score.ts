import AsyncStorage from "@react-native-async-storage/async-storage";

const PLAYER_HIGH_SCORE_KEY = "wild-paw.player-high-score";

export type PlayerHighScore = {
  score: number;
  playerName: string;
};

function normalizeHighScore(value: unknown): PlayerHighScore {
  if (!value || typeof value !== "object") {
    return { score: 0, playerName: "Player 1" };
  }
  const record = value as Partial<PlayerHighScore>;
  return {
    score:
      Number.isSafeInteger(record.score) && (record.score ?? 0) >= 0
        ? record.score!
        : 0,
    playerName:
      typeof record.playerName === "string" && record.playerName.trim()
        ? record.playerName.trim().slice(0, 20)
        : "Player 1",
  };
}

export async function getPlayerHighScore(): Promise<PlayerHighScore> {
  try {
    const stored = await AsyncStorage.getItem(PLAYER_HIGH_SCORE_KEY);
    if (!stored) return { score: 0, playerName: "Player 1" };
    return normalizeHighScore(JSON.parse(stored) as unknown);
  } catch {
    return { score: 0, playerName: "Player 1" };
  }
}

export async function recordPlayerHighScore(
  score: number,
  playerName: string,
): Promise<PlayerHighScore> {
  const current = await getPlayerHighScore();
  const safeScore = Number.isSafeInteger(score) ? Math.max(0, score) : 0;
  const safeName = playerName.trim().slice(0, 20) || "Player 1";
  const next =
    safeScore > current.score
      ? { score: safeScore, playerName: safeName }
      : current;
  await AsyncStorage.setItem(PLAYER_HIGH_SCORE_KEY, JSON.stringify(next));
  return next;
}
