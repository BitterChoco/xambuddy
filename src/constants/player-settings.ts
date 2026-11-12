import AsyncStorage from "@react-native-async-storage/async-storage";

const VIBRATION_ENABLED_KEY = "wild-paw.settings.vibration-enabled";
const SOUND_EFFECTS_ENABLED_KEY = "wild-paw.settings.sound-effects-enabled";
const SOUND_EFFECTS_VOLUME_KEY = "wild-paw.settings.sound-effects-volume";
const MUSIC_VOLUME_KEY = "wild-paw.settings.music-volume";
const DEFAULT_MUSIC_VOLUME = 0.5;
const DEFAULT_SOUND_EFFECTS_VOLUME = 0.75;
const musicVolumeListeners = new Set<(volume: number) => void>();
const soundEffectsVolumeListeners = new Set<(volume: number) => void>();

let cachedMusicVolume = DEFAULT_MUSIC_VOLUME;
let hasLoadedMusicVolume = false;
let cachedSoundEffectsVolume = DEFAULT_SOUND_EFFECTS_VOLUME;
let hasLoadedSoundEffectsVolume = false;

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
