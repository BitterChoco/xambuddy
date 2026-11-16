import AsyncStorage from "@react-native-async-storage/async-storage";

const VIBRATION_ENABLED_KEY = "wild-paw.settings.vibration-enabled";
const SOUND_EFFECTS_ENABLED_KEY = "wild-paw.settings.sound-effects-enabled";
const SOUND_EFFECTS_VOLUME_KEY = "wild-paw.settings.sound-effects-volume";
const MUSIC_VOLUME_KEY = "wild-paw.settings.music-volume";
const BATTLE_CONTROLS_KEY = "wild-paw.settings.battle-controls";
const DEFAULT_MUSIC_VOLUME = 0.5;
const DEFAULT_SOUND_EFFECTS_VOLUME = 0.75;
const musicVolumeListeners = new Set<(volume: number) => void>();
const soundEffectsVolumeListeners = new Set<(volume: number) => void>();

let cachedMusicVolume = DEFAULT_MUSIC_VOLUME;
let hasLoadedMusicVolume = false;
let cachedSoundEffectsVolume = DEFAULT_SOUND_EFFECTS_VOLUME;
let hasLoadedSoundEffectsVolume = false;

export type ControlSide = {
  x: number;
  y: number;
  size: number;
  opacity: number;
};

export type BattleControlId =
  | "joystick"
  | "fire"
  | "gun"
  | "grenade"
  | "heal"
  | "dash";

export type BattleControlSettings = {
  mode: "lefty" | "righty" | "custom";
  controls: Record<BattleControlId, ControlSide>;
};

const RIGHTY_CONTROL_POSITIONS: Record<BattleControlId, ControlSide> = {
  joystick: { x: 0.134, y: 0.707, size: 1, opacity: 1 },
  fire: { x: 0.816, y: 0.631, size: 1, opacity: 1 },
  gun: { x: 0.732, y: 0.798, size: 1, opacity: 1 },
  grenade: { x: 0.797, y: 0.863, size: 1, opacity: 1 },
  heal: { x: 0.882, y: 0.84, size: 1, opacity: 1 },
  dash: { x: 0.91, y: 0.462, size: 1, opacity: 1 },
};

export const DEFAULT_BATTLE_CONTROLS: BattleControlSettings = {
  mode: "righty",
  controls: RIGHTY_CONTROL_POSITIONS,
};

export function createBattleControlPreset(
  mode: "lefty" | "righty",
): BattleControlSettings {
  const controls = Object.fromEntries(
    Object.entries(RIGHTY_CONTROL_POSITIONS).map(([id, control]) => [
      id,
      {
        ...control,
        ...(mode === "lefty" ? { x: 1 - control.x } : {}),
      },
    ]),
  ) as Record<BattleControlId, ControlSide>;
  return { mode, controls };
}

function normalizeControlSide(
  value: unknown,
  fallback: ControlSide,
): ControlSide {
  const parsed =
    value && typeof value === "object" ? (value as Partial<ControlSide>) : {};
  const normalize = (
    candidate: unknown,
    minimum: number,
    maximum: number,
    defaultValue: number,
  ) => {
    const number = Number(candidate);
    return Number.isFinite(number)
      ? Math.max(minimum, Math.min(maximum, number))
      : defaultValue;
  };

  return {
    x: normalize(parsed.x, 0, 1, fallback.x),
    y: normalize(parsed.y, 0, 1, fallback.y),
    size: normalize(parsed.size, 0.65, 1.5, fallback.size),
    opacity: normalize(parsed.opacity, 0.25, 1, fallback.opacity),
  };
}

export function normalizeBattleControlSettings(
  value: unknown,
): BattleControlSettings {
  const parsed =
    value && typeof value === "object"
      ? (value as Partial<BattleControlSettings>)
      : {};
  const mode =
    parsed.mode === "lefty" || parsed.mode === "custom"
      ? parsed.mode
      : "righty";
  const defaults = createBattleControlPreset(
    mode === "custom" ? "righty" : mode,
  );
  const legacy = parsed as Partial<BattleControlSettings> & {
    joystick?: unknown;
    actions?: unknown;
  };
  const storedControls =
    legacy.controls && typeof legacy.controls === "object"
      ? (legacy.controls as Partial<Record<BattleControlId, unknown>>)
      : null;
  const legacyJoystick =
    legacy.joystick && typeof legacy.joystick === "object"
      ? (legacy.joystick as Partial<ControlSide>)
      : null;
  const legacyActions =
    legacy.actions && typeof legacy.actions === "object"
      ? (legacy.actions as Partial<ControlSide>)
      : null;
  const oldActionDefaults: Record<
    Exclude<BattleControlId, "joystick">,
    { x: number; y: number }
  > = {
    fire: { x: 0, y: -0.145 },
    gun: { x: 0.18, y: 0.1 },
    grenade: { x: 0.08, y: 0.1 },
    heal: { x: -0.02, y: 0.1 },
    dash: { x: 0.18, y: -0.08 },
  };
  const migratedAction = (id: Exclude<BattleControlId, "joystick">) => {
    if (!legacyActions) return defaults.controls[id];
    const direction = mode === "lefty" ? 1 : -1;
    return {
      ...defaults.controls[id],
      x: Number.isFinite(Number(legacyActions.x))
        ? Number(legacyActions.x) + oldActionDefaults[id].x * direction
        : defaults.controls[id].x,
      y: Number.isFinite(Number(legacyActions.y))
        ? Number(legacyActions.y) + oldActionDefaults[id].y
        : defaults.controls[id].y,
      size: Number.isFinite(Number(legacyActions.size))
        ? Number(legacyActions.size)
        : defaults.controls[id].size,
      opacity: Number.isFinite(Number(legacyActions.opacity))
        ? Number(legacyActions.opacity)
        : defaults.controls[id].opacity,
    };
  };
  const previousPresetAnchors: Partial<
    Record<BattleControlId, { x: number; y: number }[]>
  > = {
    joystick: [
      { x: 0.15, y: 0.72 },
      { x: 0.1, y: 0.72 },
      { x: 0.1, y: 0.88 },
      { x: 0.045, y: 0.94 },
    ],
    fire: [
      { x: 0.85, y: 0.72 },
      { x: 0.9, y: 0.72 },
      { x: 0.955, y: 0.72 },
    ],
    gun: [{ x: 0.78, y: 0.94 }],
    grenade: [{ x: 0.86, y: 0.94 }],
    heal: [{ x: 0.955, y: 0.94 }],
    dash: [
      { x: 0.95, y: 0.48 },
      { x: 0.9, y: 0.53 },
      { x: 0.78, y: 0.79 },
    ],
  };
  const normalizePresetControl = (
    id: BattleControlId,
    value: unknown,
  ): ControlSide => {
    const saved = normalizeControlSide(value, defaults.controls[id]);
    if (mode === "custom") return saved;

    const previousAnchors = previousPresetAnchors[id] ?? [];
    const wasPresetAnchor = previousAnchors.some((anchor) => {
      const expectedX = mode === "lefty" ? 1 - anchor.x : anchor.x;
      return (
        Math.abs(saved.x - expectedX) < 0.001 &&
        Math.abs(saved.y - anchor.y) < 0.001
      );
    });
    return wasPresetAnchor
      ? { ...saved, x: defaults.controls[id].x, y: defaults.controls[id].y }
      : saved;
  };

  return {
    mode,
    controls: {
      joystick: normalizePresetControl(
        "joystick",
        storedControls?.joystick ?? legacyJoystick,
      ),
      fire: normalizePresetControl(
        "fire",
        storedControls?.fire ?? migratedAction("fire"),
      ),
      gun: normalizePresetControl(
        "gun",
        storedControls?.gun ?? migratedAction("gun"),
      ),
      grenade: normalizePresetControl(
        "grenade",
        storedControls?.grenade ?? migratedAction("grenade"),
      ),
      heal: normalizePresetControl(
        "heal",
        storedControls?.heal ?? migratedAction("heal"),
      ),
      dash: normalizePresetControl(
        "dash",
        storedControls?.dash ?? migratedAction("dash"),
      ),
    },
  };
}

export async function getBattleControlSettings(): Promise<BattleControlSettings> {
  try {
    const stored = await AsyncStorage.getItem(BATTLE_CONTROLS_KEY);
    return stored
      ? normalizeBattleControlSettings(JSON.parse(stored) as unknown)
      : DEFAULT_BATTLE_CONTROLS;
  } catch {
    return DEFAULT_BATTLE_CONTROLS;
  }
}

export async function saveBattleControlSettings(
  settings: BattleControlSettings,
) {
  const normalized = normalizeBattleControlSettings(settings);
  await AsyncStorage.setItem(BATTLE_CONTROLS_KEY, JSON.stringify(normalized));
}

function normalizeMusicVolume(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(0, Math.min(1, parsed))
    : DEFAULT_MUSIC_VOLUME;
}

export async function getVibrationEnabled() {
  try {
    return (await AsyncStorage.getItem(VIBRATION_ENABLED_KEY)) !== "false";
  } catch {
    return true;
  }
}

export async function saveVibrationEnabled(enabled: boolean) {
  await AsyncStorage.setItem(VIBRATION_ENABLED_KEY, String(enabled));
}

export async function getSoundEffectsVolume() {
  if (hasLoadedSoundEffectsVolume) return cachedSoundEffectsVolume;
  try {
    const storedVolume = await AsyncStorage.getItem(SOUND_EFFECTS_VOLUME_KEY);
    if (storedVolume !== null) {
      cachedSoundEffectsVolume = normalizeMusicVolume(storedVolume);
    } else {
      const legacyEnabled = await AsyncStorage.getItem(
        SOUND_EFFECTS_ENABLED_KEY,
      );
      cachedSoundEffectsVolume =
        legacyEnabled === "false" ? 0 : DEFAULT_SOUND_EFFECTS_VOLUME;
    }
  } catch {
    cachedSoundEffectsVolume = DEFAULT_SOUND_EFFECTS_VOLUME;
  }
  hasLoadedSoundEffectsVolume = true;
  return cachedSoundEffectsVolume;
}

export function subscribeToSoundEffectsVolume(
  listener: (volume: number) => void,
) {
  soundEffectsVolumeListeners.add(listener);
  return () => soundEffectsVolumeListeners.delete(listener);
}

export function updateSoundEffectsVolume(volume: number) {
  cachedSoundEffectsVolume = normalizeMusicVolume(volume);
  hasLoadedSoundEffectsVolume = true;
  for (const listener of soundEffectsVolumeListeners) {
    listener(cachedSoundEffectsVolume);
  }
}

export async function saveSoundEffectsVolume(volume: number) {
  const normalizedVolume = normalizeMusicVolume(volume);
  updateSoundEffectsVolume(normalizedVolume);
  await AsyncStorage.setItem(
    SOUND_EFFECTS_VOLUME_KEY,
    String(normalizedVolume),
  );
}

export async function getMusicVolume() {
  if (hasLoadedMusicVolume) return cachedMusicVolume;
  try {
    const storedVolume = await AsyncStorage.getItem(MUSIC_VOLUME_KEY);
    cachedMusicVolume =
      storedVolume === null
        ? DEFAULT_MUSIC_VOLUME
        : normalizeMusicVolume(storedVolume);
  } catch {
    cachedMusicVolume = DEFAULT_MUSIC_VOLUME;
  }
  hasLoadedMusicVolume = true;
  return cachedMusicVolume;
}

export function subscribeToMusicVolume(listener: (volume: number) => void) {
  musicVolumeListeners.add(listener);
  return () => musicVolumeListeners.delete(listener);
}

export function updateMusicVolume(volume: number) {
  cachedMusicVolume = normalizeMusicVolume(volume);
  hasLoadedMusicVolume = true;
  for (const listener of musicVolumeListeners) listener(cachedMusicVolume);
}

export async function saveMusicVolume(volume: number) {
  const normalizedVolume = normalizeMusicVolume(volume);
  updateMusicVolume(normalizedVolume);
  await AsyncStorage.setItem(MUSIC_VOLUME_KEY, String(normalizedVolume));
}
