import { Image } from "expo-image";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useContext, useMemo, useState } from "react";
import {
  Alert,
  AppState,
  BackHandler,
  Linking,
  Pressable as NativePressable,
  ScrollView as NativeScrollView,
  StyleSheet,
  Text as NativeText,
  TextInput as NativeTextInput,
  View as NativeView,
} from "react-native";
import type { ComponentProps } from "react";
import { SafeAreaView as NativeSafeAreaView } from "react-native-safe-area-context";
import DraggableFlatList, { ScaleDecorator } from "react-native-draggable-flatlist";
import { HomeIcon } from "@/components/action-icon";
import { CareToolsScreen, completeReminderFromCalendar, iconNameOrDefault, initializeCareNotifications, snoozeReminderFromCalendar, SolidPetIcon, updateOverdueReminderBadge } from "@/components/care-tools";
import { EXPENSE_CURRENCY_OPTIONS, EXPENSE_CURRENCY_STORAGE_KEY, ExpensesScreen } from "@/components/expenses";
import type { ExpenseCurrencyCode } from "@/components/expenses";
import { calendarMonthDates, reminderDatesInMonth, REMINDER_REPEAT_COLORS, type CalendarReminderRepeat } from "@/utils/care-calendar";


type Pet = {
  id: string;
  name: string;
  type: string;
  description: string;
};

type PetCategoryDetails = {
  id: string;
  description: string;
  careTips: string[];
  pets: Pet[];
};

type PetDetails = {
  petId: string;
  samplePicture: string;
  generalInformation: string;
  traits: string[];
  diet: {
    foodsEats: string;
    allowed: string[];
    dangerous: string[];
  };
  mating: {
    season: string;
    frequency: string;
    note: string;
  };
  ageBehavior: { age: string; ageRange?: string; behavior: string }[];
  ageComparison: { petAge: string; humanAge: string }[];
};

type PetSource = {
  topic: string;
  name: string;
  url: string;
  reviewedAt?: string;
};

type PetCategory = {
  id: string;
  name: string;
  type: string;
  logo: string;
  favorite?: boolean;
  accent: string;
};

type AppManifestFile = {
  url: string;
  sha256: string;
};

type AppManifest = {
  version: number;
  updatedAt?: string;
  files: Record<string, AppManifestFile>;
};

type DataSource = "remote" | "cached";
type LibraryCardId = "directory" | "care" | "expenses";

const REMOTE_MANIFEST_URL = "https://github.com/BitterChoco/storage-release/raw/refs/heads/main/pet-care-companion/data/manifest.json";

const EMPTY_CATEGORIES: PetCategory[] = [];
const EMPTY_CATEGORY_DETAILS: PetCategoryDetails[] = [];
const EMPTY_PET_DETAILS: PetDetails[] = [];
const EMPTY_SETTINGS = {
  theme: "light" as ThemeName,
  filters: { favoritesOnly: false },
  availableThemes: ["light", "blue", "orange", "green", "yellow", "rose", "dark", "midnight", "charcoal"] as ThemeName[],
  autoSyncEnabled: true,
  showCalendar: true,
  showCalendarEventListByDefault: true,
  showPetDirectory: true,
  showExpenses: true,
};

let CATEGORIES = EMPTY_CATEGORIES;
let CATEGORY_DETAILS = EMPTY_CATEGORY_DETAILS;
let CATEGORY_BY_ID = new Map(CATEGORY_DETAILS.map((category) => [category.id, category]));
const getCategoryDetails = (categoryId: string) => CATEGORY_BY_ID.get(categoryId);
let PET_DETAILS = EMPTY_PET_DETAILS;
let PET_DETAILS_BY_ID = new Map(PET_DETAILS.map((pet) => [pet.petId, pet]));
let PET_SOURCES: PetSource[] = [];
const getPetDetails = (petId: string) => PET_DETAILS_BY_ID.get(petId);

const DATA_CACHE_KEYS = {
  categories: "petcare-data-categories",
  pets: "petcare-data-pets",
  petDetails: "petcare-data-pet-details",
  settings: "petcare-data-settings",
  manifest: "petcare-manifest",
} as const;

const PERSONAL_REMINDER_KEY = "petcare-reminders-v1";
const PERSONAL_REMINDER_HISTORY_KEY = "petcare-reminder-history-v1";
const PERSONAL_PETS_KEY = "petcare-personal-pets-v1";
const DASHBOARD_LIBRARY_ORDER_KEY = "petcare-dashboard-library-order-v1";

type HomeReminder = { id: string; petId: string; title: string; dueAt: string; repeat: CalendarReminderRepeat; allDay?: boolean; icon?: string };
type HomeReminderCompletion = { id: string; reminderId: string; petId: string; petName: string; title: string; scheduledFor: string; completedAt: string; repeat?: CalendarReminderRepeat; allDay?: boolean; icon?: string };
type HomePet = { id: string; name: string; profilePhotoUri?: string };

function localDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function displayReminderDateTime(dueAt: string, allDay?: boolean) {
  if (allDay) return "All day";
  return new Date(dueAt).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function applyDataBundle({
  categories,
  categoryDetails,
  petDetails,
  petSources,
  settings,
}: {
  categories: PetCategory[];
  categoryDetails: PetCategoryDetails[];
  petDetails: PetDetails[];
  petSources: PetSource[];
  settings: ReturnType<typeof getDefaultSettings>;
}) {
  CATEGORIES = categories;
  CATEGORY_DETAILS = categoryDetails;
  CATEGORY_BY_ID = new Map(CATEGORY_DETAILS.map((category) => [category.id, category]));
  PET_DETAILS = petDetails;
  PET_DETAILS_BY_ID = new Map(PET_DETAILS.map((pet) => [pet.petId, pet]));
  PET_SOURCES = petSources;
  DEFAULT_SETTINGS = settings;
}

async function saveCachedJson<T>(key: string, value: T) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

async function readCachedJson<T>(key: string): Promise<T | null> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function loadCachedData() {
  const [categoriesDataCache, categoryDetailsDataCache, petDetailsDataCache, settingsDataCache, manifestCache] = await Promise.all([
    readCachedJson<{ categories: PetCategory[] }>(DATA_CACHE_KEYS.categories),
    readCachedJson<{ categories: PetCategoryDetails[] }>(DATA_CACHE_KEYS.pets),
    readCachedJson<{ pets: PetDetails[]; sources?: PetSource[] }>(DATA_CACHE_KEYS.petDetails),
    readCachedJson<ReturnType<typeof getDefaultSettings>>(DATA_CACHE_KEYS.settings),
    readCachedJson<AppManifest>(DATA_CACHE_KEYS.manifest),
  ]);

  if (
    categoriesDataCache?.categories &&
    categoryDetailsDataCache?.categories &&
    petDetailsDataCache?.pets &&
    settingsDataCache
  ) {
    return {
      categories: categoriesDataCache.categories,
      categoryDetails: categoryDetailsDataCache.categories,
      petDetails: petDetailsDataCache.pets,
      petSources: petDetailsDataCache.sources ?? [],
      settings: settingsDataCache,
      manifest: manifestCache,
    };
  }

  return null;
}

async function sha256FromText(value: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  return "";
}

async function cleanupExpiredCache() {
  const manifest = await readCachedJson<AppManifest>(DATA_CACHE_KEYS.manifest);
  if (!manifest?.updatedAt) return;

  const updatedAt = new Date(manifest.updatedAt).getTime();
  const staleCutoff = Date.now() - 1000 * 60 * 60 * 24 * 30;
  if (updatedAt < staleCutoff) {
    await Promise.all([
      AsyncStorage.removeItem(DATA_CACHE_KEYS.categories),
      AsyncStorage.removeItem(DATA_CACHE_KEYS.pets),
      AsyncStorage.removeItem(DATA_CACHE_KEYS.petDetails),
      AsyncStorage.removeItem(DATA_CACHE_KEYS.settings),
      AsyncStorage.removeItem(DATA_CACHE_KEYS.manifest),
    ]);
  }
}

async function refreshRemoteDataBundle(options?: {
  force?: boolean;
  onStep?: (status: string, progress: number) => void;
  maxRetries?: number;
}): Promise<{ updated?: boolean; offline?: boolean; noData?: boolean; updatedAt?: string; version?: number; source?: DataSource }> {
  const localCache = await loadCachedData();
  const maxRetries = options?.maxRetries ?? 3;
  const report = (status: string, progress: number) => options?.onStep?.(status, progress);

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      report("Checking manifest", 10 + attempt * 3);
      const response = await fetch(REMOTE_MANIFEST_URL, {
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error("manifest fetch failed");
      }

      const remoteManifest = (await response.json()) as AppManifest;
      const localManifest = localCache?.manifest ?? null;
      const shouldRefresh = options?.force || !localManifest || remoteManifest.version > localManifest.version;

      if (!shouldRefresh) {
        if (localCache) {
          applyDataBundle({
            categories: localCache.categories,
            categoryDetails: localCache.categoryDetails,
            petDetails: localCache.petDetails,
            petSources: localCache.petSources,
            settings: localCache.settings,
          });
        }

        return {
          updated: false,
          updatedAt: localManifest?.updatedAt ?? localCache?.manifest?.updatedAt ?? new Date().toISOString(),
          version: localManifest?.version ?? localCache?.manifest?.version ?? 0,
          source: "cached",
        };
      }

      const files = Object.entries(remoteManifest.files);
      const next = {
        categories: CATEGORIES,
        categoryDetails: CATEGORY_DETAILS,
        petDetails: PET_DETAILS,
        petSources: PET_SOURCES,
        settings: DEFAULT_SETTINGS,
      };

      for (const [index, [fileName, fileMeta]] of files.entries()) {
        const downloadProgress = 25 + (index / Math.max(files.length, 1)) * 60;
        report(`Downloading ${fileName}`, Math.round(downloadProgress));

        const fileResponse = await fetch(fileMeta.url);
        if (!fileResponse.ok) {
          throw new Error(`Failed to download ${fileName}`);
        }

        const fileText = await fileResponse.text();
        const actualHash = await sha256FromText(fileText);
        const expectedHash = fileMeta.sha256.trim().toLowerCase();
        if (expectedHash && actualHash && actualHash !== expectedHash) {
          throw new Error(`${fileName} failed integrity check`);
        }

        const fileJson = JSON.parse(fileText);

        if (fileName === "categories.json") {
          next.categoryDetails = fileJson.categories as PetCategoryDetails[];
        } else if (fileName === "pets.json") {
          next.categories = fileJson.categories as PetCategory[];
        } else if (fileName === "pet_details.json") {
          next.petDetails = fileJson.pets as PetDetails[];
          next.petSources = (fileJson._sources ?? []) as PetSource[];
        } else if (fileName === "settings.json") {
          next.settings = fileJson as ReturnType<typeof getDefaultSettings>;
        }
      }

      report("Saving updated data", 90);
      await Promise.all([
        saveCachedJson(DATA_CACHE_KEYS.categories, { categories: next.categories }),
        saveCachedJson(DATA_CACHE_KEYS.pets, { categories: next.categoryDetails }),
        saveCachedJson(DATA_CACHE_KEYS.petDetails, { pets: next.petDetails, sources: next.petSources }),
        saveCachedJson(DATA_CACHE_KEYS.settings, next.settings),
        saveCachedJson(DATA_CACHE_KEYS.manifest, remoteManifest),
      ]);

      applyDataBundle(next);
      return {
        updated: true,
        updatedAt: remoteManifest.updatedAt ?? new Date().toISOString(),
        version: remoteManifest.version,
        source: "remote",
      };
    } catch (error) {
      if (attempt >= maxRetries) {
        if (localCache) {
          applyDataBundle({
            categories: localCache.categories,
            categoryDetails: localCache.categoryDetails,
            petDetails: localCache.petDetails,
            petSources: localCache.petSources,
            settings: localCache.settings,
          });
          return {
            offline: true,
            updatedAt: localCache.manifest?.updatedAt ?? new Date().toISOString(),
            version: localCache.manifest?.version ?? 0,
            source: "cached",
          };
        }

        return { noData: true, offline: true, source: "cached" };
      }

      report(`Retrying update (${attempt + 1}/${maxRetries})`, 20 + attempt * 10);
    }
  }

  return { offline: true };
}

const INK = "#27352E";
const MUTED = "#7E8980";
const CANVAS = "#F7F6F1";
const CARD = "#FFFFFF";
const LINE = "#E9E8E1";
const GREEN = "#557B5D";

type ThemeName = "light" | "dark" | "blue" | "orange" | "green" | "yellow" | "rose" | "midnight" | "charcoal";
type ThemePalette = {
  bg: string;
  card: string;
  cardAlt: string;
  text: string;
  muted: string;
  line: string;
  primary: string;
  action: string;
  menuIcon: string;
  soft: string;
  hero: string;
  heroArt: string;
  highlight: string;
  caution: string;
};

const THEME_PALETTES: Record<ThemeName, ThemePalette> = {
  light: { bg: CANVAS, card: CARD, cardAlt: "#F7F8F4", text: INK, muted: "#626E65", line: "#D6D9D1", primary: "#3F6347", action: "#3F6347", menuIcon: "#52785A", soft: "#E8EDE5", hero: "#E8ECE3", heroArt: "#DCE3D6", highlight: "#F4F0DF", caution: "#F1EEDF" },
  dark: { bg: "#1B211F", card: "#272F2C", cardAlt: "#2C3431", text: "#EEF2ED", muted: "#A8B2AA", line: "#3B4540", primary: "#A3C39A", action: "#5F765C", menuIcon: "#789273", soft: "#313C35", hero: "#29342F", heroArt: "#35443B", highlight: "#414436", caution: "#403B2E" },
  blue: { bg: "#F1F6FA", card: "#FFFFFF", cardAlt: "#F5F9FC", text: "#253847", muted: "#5D7180", line: "#C7D5DE", primary: "#2E5D78", action: "#2E5D78", menuIcon: "#40718B", soft: "#DFEBF2", hero: "#DFEAF1", heroArt: "#CEDFE9", highlight: "#F2EFDF", caution: "#ECEFE8" },
  orange: { bg: "#FBF4ED", card: "#FFFFFF", cardAlt: "#FFF8F1", text: "#45352B", muted: "#765F51", line: "#E4CDBB", primary: "#94502F", action: "#94502F", menuIcon: "#A76342", soft: "#F3E3D5", hero: "#F2E3D6", heroArt: "#E9D2BF", highlight: "#F8ECD8", caution: "#F3E8DC" },
  green: { bg: "#F1F6F0", card: "#FFFFFF", cardAlt: "#F5F9F3", text: "#2D3E31", muted: "#5D7060", line: "#C9D9C8", primary: "#3F6345", action: "#3F6345", menuIcon: "#527956", soft: "#DDE9DC", hero: "#DFEADF", heroArt: "#CCDECA", highlight: "#F1EFDC", caution: "#E9EBDD" },
  yellow: { bg: "#FBF8EC", card: "#FFFFFF", cardAlt: "#FFFBEF", text: "#403B27", muted: "#6D6549", line: "#DED4AD", primary: "#705D17", action: "#705D17", menuIcon: "#887331", soft: "#F0E9CB", hero: "#F0E9D0", heroArt: "#E5D9AD", highlight: "#F6EDC9", caution: "#F0E8D0" },
  rose: { bg: "#FBF2F4", card: "#FFFFFF", cardAlt: "#FFF7F8", text: "#49343B", muted: "#806A72", line: "#E5CDD4", primary: "#914F64", action: "#914F64", menuIcon: "#A46478", soft: "#F2DFE5", hero: "#F3E2E7", heroArt: "#EACFD8", highlight: "#F7EAD9", caution: "#F3E8E2" },
  midnight: { bg: "#171D2A", card: "#222B3B", cardAlt: "#293448", text: "#EEF2FA", muted: "#AAB6CC", line: "#3A465C", primary: "#9BB9F2", action: "#5A6F9B", menuIcon: "#7185AD", soft: "#2C3B57", hero: "#26344B", heroArt: "#344966", highlight: "#3C3A4D", caution: "#403A3A" },
  charcoal: { bg: "#211F1D", card: "#302D2A", cardAlt: "#393531", text: "#F3F0EC", muted: "#B7AEA5", line: "#4A433D", primary: "#E0AE83", action: "#92704F", menuIcon: "#A07D5E", soft: "#49392E", hero: "#3C312A", heroArt: "#514035", highlight: "#514538", caution: "#4C3A34" },
};

function getDefaultSettings() {
  return EMPTY_SETTINGS as {
    theme: ThemeName;
    filters: { favoritesOnly: boolean };
    availableThemes: ThemeName[];
    autoSyncEnabled: boolean;
    showCalendar: boolean;
    showCalendarEventListByDefault: boolean;
    showPetDirectory: boolean;
    showExpenses: boolean;
  };
}

let DEFAULT_SETTINGS = getDefaultSettings();

const PetCareThemeContext = React.createContext<{
  name: ThemeName;
  palette: ThemePalette;
}>({ name: "light", palette: THEME_PALETTES.light });

function themedStyle(value: unknown, palette: ThemePalette): unknown {
  if (Array.isArray(value)) return value.map((item) => themedStyle(item, palette));
  if (!value || typeof value !== "object") return value;
  const colorMap: Record<string, string> = {
    [INK.toLowerCase()]: palette.text,
    [MUTED.toLowerCase()]: palette.muted,
    [CANVAS.toLowerCase()]: palette.bg,
    [CARD.toLowerCase()]: palette.card,
    [LINE.toLowerCase()]: palette.line,
    [GREEN.toLowerCase()]: palette.primary,
    "#fdfdfb": palette.cardAlt,
    "#fbfcf9": palette.cardAlt,
    "#eef1ea": palette.soft,
    "#e9efe6": palette.soft,
    "#e8efe5": palette.soft,
    "#e9ede5": palette.soft,
    "#eff3ec": palette.soft,
    "#f1f3ef": palette.soft,
    "#f0f2ed": palette.soft,
    "#edefe8": palette.hero,
    "#e2e7db": palette.heroArt,
    "#f0e8de": palette.heroArt,
    "#f7f3e4": palette.highlight,
    "#faf4e8": palette.highlight,
    "#f5f2e8": palette.caution,
    "#68746a": palette.muted,
    "#59665c": palette.muted,
    "#899188": palette.muted,
    "#9aa197": palette.muted,
    "#8e988d": palette.muted,
    "#a8aea5": palette.muted,
    "#abb3a7": palette.muted,
    "#d1d6cc": palette.line,
    "#e8e9e2": palette.line,
  };
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      typeof item === "string" ? colorMap[item.toLowerCase()] ?? item : themedStyle(item, palette),
    ]),
  );
}

function View(props: ComponentProps<typeof NativeView>) {
  const { palette } = useContext(PetCareThemeContext);
  return <NativeView {...props} style={themedStyle(props.style, palette) as ComponentProps<typeof NativeView>["style"]} />;
}

function Pressable(props: ComponentProps<typeof NativePressable>) {
  const { palette } = useContext(PetCareThemeContext);
  const originalStyle = props.style;
  const style = typeof originalStyle === "function"
    ? (state: { pressed: boolean; hovered?: boolean; focused?: boolean }) =>
        themedStyle((originalStyle as (state: { pressed: boolean; hovered?: boolean; focused?: boolean }) => unknown)(state), palette) as never
    : themedStyle(originalStyle, palette) as never;
  return <NativePressable {...props} style={style} />;
}

function ScrollView(props: ComponentProps<typeof import("react-native").ScrollView>) {
  const { palette } = useContext(PetCareThemeContext);
  return (
    <NativeScrollView
      {...props}
      style={themedStyle(props.style, palette) as ComponentProps<typeof NativeScrollView>["style"]}
      contentContainerStyle={themedStyle(props.contentContainerStyle, palette) as ComponentProps<typeof NativeScrollView>["contentContainerStyle"]}
    />
  );
}

function SafeAreaView(props: ComponentProps<typeof NativeSafeAreaView>) {
  const { palette } = useContext(PetCareThemeContext);
  return <NativeSafeAreaView {...props} style={themedStyle(props.style, palette) as ComponentProps<typeof NativeSafeAreaView>["style"]} />;
}

function TextInput(props: ComponentProps<typeof NativeTextInput>) {
  const { palette } = useContext(PetCareThemeContext);
  return (
    <NativeTextInput
      {...props}
      placeholderTextColor={palette.muted}
      style={themedStyle(props.style, palette) as ComponentProps<typeof NativeTextInput>["style"]}
    />
  );
}

type Screen = "menu" | "pets" | "settings" | "care" | "reminders" | "expenses";
function matchesPetSearch(pet: Pet, query: string) {
  if (!query) return true;
  return `${pet.name} ${pet.type}`.toLocaleLowerCase().includes(query);
}

function IconButton({
  label,
  onPress,
  children,
  style,
}: {
  label: string;
  onPress: () => void;
  children: React.ReactNode;
  style?: object;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, style, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
  );
}

function SolidMenuIcon({ kind }: { kind: "book" | "paw" | "wallet" }) {
  const { palette } = useContext(PetCareThemeContext);
  if (kind === "wallet") {
    return (
      <View style={styles.solidMenuIconCanvas}>
        <View style={[styles.walletBack, { backgroundColor: palette.menuIcon }]} />
        <View style={[styles.walletBody, { backgroundColor: palette.menuIcon }]}>
          <View style={[styles.walletFlap, { backgroundColor: palette.menuIcon, borderColor: palette.soft }]} />
          <View style={[styles.walletSnap, { backgroundColor: palette.soft }]} />
        </View>
      </View>
    );
  }

  if (kind === "book") {
    return (
      <View style={styles.solidMenuIconCanvas}>
        <View style={[styles.bookLeftPage, { backgroundColor: palette.menuIcon }]} />
        <View style={[styles.bookRightPage, { backgroundColor: palette.menuIcon }]} />
        <View style={[styles.bookSpine, { backgroundColor: palette.soft }]} />
        <View style={styles.bookPawMark}>
          <View style={[styles.bookPawToe, styles.bookPawToeOne, { backgroundColor: palette.soft }]} />
          <View style={[styles.bookPawToe, styles.bookPawToeTwo, { backgroundColor: palette.soft }]} />
          <View style={[styles.bookPawToe, styles.bookPawToeThree, { backgroundColor: palette.soft }]} />
          <View style={[styles.bookPawToe, styles.bookPawToeFour, { backgroundColor: palette.soft }]} />
          <View style={[styles.bookPawPad, { backgroundColor: palette.soft }]} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.solidMenuIconCanvas}>
      <View style={[styles.menuPawToe, styles.menuPawToeOne, { backgroundColor: palette.menuIcon }]} />
      <View style={[styles.menuPawToe, styles.menuPawToeTwo, { backgroundColor: palette.menuIcon }]} />
      <View style={[styles.menuPawToe, styles.menuPawToeThree, { backgroundColor: palette.menuIcon }]} />
      <View style={[styles.menuPawToe, styles.menuPawToeFour, { backgroundColor: palette.menuIcon }]} />
      <View style={[styles.menuPawPad, { backgroundColor: palette.menuIcon }]} />
    </View>
  );
}

function CategoryLogo({
  logo,
  accent,
  size = 62,
}: {
  logo: string;
  accent: string;
  size?: number;
}) {
  const isUrl = /^https?:\/\//i.test(logo);
  if (isUrl) {
    return (
      <Image
        source={{ uri: logo }}
        contentFit="cover"
        style={{ width: size, height: size, borderRadius: size * 0.34 }}
      />
    );
  }
  return (
    <View
      style={[
        styles.emojiLogo,
        {
          width: size,
          height: size,
          borderRadius: size * 0.34,
          backgroundColor: `${accent}20`,
        },
      ]}
    >
      <View style={styles.emojiLogoInner}>
        <Text style={{ fontSize: size * 0.5 }}>{logo}</Text>
      </View>
    </View>
  );
}

function scaleReadableTextStyle(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scaleReadableTextStyle);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      key === "fontSize" && typeof item === "number"
        ? Math.round(item * 1.15)
        : key === "lineHeight" && typeof item === "number"
          ? Math.round(item * 1.12)
          : scaleReadableTextStyle(item),
    ]),
  );
}

function Text({
  children,
  style,
  numberOfLines,
  allowFontScaling = true,
}: {
  children: React.ReactNode;
  style?: object;
  numberOfLines?: number;
  allowFontScaling?: boolean;
}) {
  const { palette } = useContext(PetCareThemeContext);
  return (
    <NativeText allowFontScaling={allowFontScaling} numberOfLines={numberOfLines} style={themedStyle([{ color: INK }, scaleReadableTextStyle(style)], palette) as ComponentProps<typeof NativeText>["style"]}>
      {children}
    </NativeText>
  );
}

function Header({
  eyebrow,
  title,
  onBack,
  backToHome = false,
  right,
}: {
  eyebrow: string;
  title: string;
  onBack?: () => void;
  backToHome?: boolean;
  right?: React.ReactNode;
}) {
  const { palette } = useContext(PetCareThemeContext);
  return (
    <View style={styles.header}>
      {onBack ? (
        <IconButton label={backToHome ? "Back to home" : "Back"} onPress={onBack} style={[styles.backButton, { backgroundColor: palette.soft }]}>
          {backToHome ? <HomeIcon color={palette.primary} cutout={palette.soft} size={22} /> : <Text style={[styles.backArrow, { color: palette.primary }]}>‹</Text>}
        </IconButton>
      ) : null}
      <View style={styles.headerCopy}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.headerTitle}>{title}</Text>
      </View>
      {right}
    </View>
  );
}

function LoadingScreen({
  status,
  progress,
  error,
  onRetry,
}: {
  status: string;
  progress: number;
  error?: string;
  onRetry?: () => void;
}) {
  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: "#F7F6F1" }]}>
      <View style={[styles.app, { justifyContent: "center", alignItems: "center", backgroundColor: "#F7F6F1" }]}>
        <View style={styles.loadingCard}>
          <Text style={styles.loadingTitle}>Loading resources</Text>
          <Text style={styles.loadingStatus}>{status}</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
          <Text style={styles.progressText}>{progress}%</Text>
          {error ? <Text style={styles.loadingError}>{error}</Text> : null}
          {onRetry ? (
            <Pressable onPress={onRetry} style={({ pressed }) => [styles.loadingRetryButton, pressed && styles.pressed]}>
              <Text style={styles.loadingRetryText}>Retry</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

function MenuScreen({
  onOpenPets,
  onOpenCare,
  onOpenReminders,
  onOpenExpenses,
  onOpenSettings,
  onRefreshData,
  isSyncing,
  isOffline,
  isStale,
  showCalendar,
  showCalendarEventListByDefault,
  showPetDirectory,
  showExpenses,
}: {
  onOpenPets: () => void;
  onOpenCare: () => void;
  onOpenReminders: () => void;
  onOpenExpenses: () => void;
  onOpenSettings: () => void;
  onRefreshData: () => void;
  isSyncing: boolean;
  isOffline: boolean;
  isStale: boolean;
  showCalendar: boolean;
  showCalendarEventListByDefault: boolean;
  showPetDirectory: boolean;
  showExpenses: boolean;
}) {
  const { palette } = useContext(PetCareThemeContext);
  const [libraryCardOrder, setLibraryCardOrder] = React.useState<LibraryCardId[]>(["directory", "care", "expenses"]);
  const [libraryOrderLoaded, setLibraryOrderLoaded] = React.useState(false);
  const [homeReminders, setHomeReminders] = useState<HomeReminder[]>([]);
  const [homeReminderHistory, setHomeReminderHistory] = useState<HomeReminderCompletion[]>([]);
  const [homePetsById, setHomePetsById] = useState<Map<string, HomePet>>(() => new Map());
  const [remindersLoaded, setRemindersLoaded] = useState(false);
  const [reminderBadgeClock, setReminderBadgeClock] = useState(() => Date.now());
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [calendarSelectedDate, setCalendarSelectedDate] = useState(() => localDateInput(new Date()));
  const [selectedCalendarEventsExpanded, setSelectedCalendarEventsExpanded] = useState(showCalendarEventListByDefault);
  const [selectedCalendarStatuses, setSelectedCalendarStatuses] = useState<Array<"overdue" | "pending" | "completed">>(["overdue", "pending"]);
  const visibleLibraryCardIds = libraryCardOrder.filter((id) => id === "care" || (id === "directory" && showPetDirectory) || (id === "expenses" && showExpenses));

  React.useEffect(() => {
    let active = true;
    AsyncStorage.getItem(DASHBOARD_LIBRARY_ORDER_KEY).then((raw) => {
      if (!active || !raw) return;
      const stored: unknown = JSON.parse(raw);
      if (Array.isArray(stored)) {
        const validIds = stored.filter((id): id is LibraryCardId => id === "directory" || id === "care" || id === "expenses");
        setLibraryCardOrder([...new Set<LibraryCardId>([...validIds, "directory", "care", "expenses"])]);
      }
    }).catch(() => {
      // Keep the default dashboard card order when no valid saved order is available.
    }).finally(() => {
      if (active) setLibraryOrderLoaded(true);
    });
    return () => { active = false; };
  }, []);

  React.useEffect(() => {
    if (!libraryOrderLoaded) return;
    AsyncStorage.setItem(DASHBOARD_LIBRARY_ORDER_KEY, JSON.stringify(libraryCardOrder)).catch(() => undefined);
  }, [libraryCardOrder, libraryOrderLoaded]);

  function reorderVisibleLibraryCards(nextVisibleOrder: LibraryCardId[]) {
    const visibleIds = new Set(visibleLibraryCardIds);
    let nextIndex = 0;
    setLibraryCardOrder((current) => current.map((id) => visibleIds.has(id) ? nextVisibleOrder[nextIndex++] : id));
  }
  const overdueReminderCount = remindersLoaded
    ? homeReminders.filter((reminder) => new Date(reminder.dueAt).getTime() < reminderBadgeClock).length
    : 0;

  React.useEffect(() => {
    const interval = setInterval(() => setReminderBadgeClock(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const monthEvents = React.useMemo(() => {
    return homeReminders
      .flatMap((reminder) => {
        const due = new Date(reminder.dueAt);
        if (Number.isNaN(due.getTime())) return [];
        return reminderDatesInMonth(reminder.dueAt, reminder.repeat, calendarMonth.getFullYear(), calendarMonth.getMonth()).map((date) => {
          const occurrenceDate = new Date(`${date}T00:00:00`);
          occurrenceDate.setHours(due.getHours(), due.getMinutes(), due.getSeconds(), due.getMilliseconds());
          return {
            id: `${reminder.id}-${date}`,
            reminderId: reminder.id,
            date,
            dueAt: occurrenceDate.toISOString(),
            title: reminder.title,
            petId: reminder.petId,
            icon: reminder.icon,
            repeat: reminder.repeat,
            allDay: reminder.allDay,
            color: REMINDER_REPEAT_COLORS[reminder.repeat],
            completed: false,
            overdue: occurrenceDate.getTime() < Date.now(),
            kind: "Reminder",
          };
        });
      })
      .concat(homeReminderHistory.flatMap((completion) => {
        const due = new Date(completion.scheduledFor);
        if (Number.isNaN(due.getTime())) return [];
        const repeat = completion.repeat ?? "once";
        const date = localDateInput(due);
        if (due.getFullYear() !== calendarMonth.getFullYear() || due.getMonth() !== calendarMonth.getMonth()) return [];
        return [{
          id: `completed-${completion.id}`,
          reminderId: completion.reminderId,
          date,
          dueAt: completion.scheduledFor,
          title: completion.title,
          petId: completion.petId,
          icon: completion.icon,
          repeat,
          allDay: completion.allDay,
          color: REMINDER_REPEAT_COLORS[repeat],
          completed: true,
          overdue: false,
          kind: "Reminder",
        }];
      }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  }, [calendarMonth, homeReminders]);

  const calendarDates = calendarMonthDates(calendarMonth.getFullYear(), calendarMonth.getMonth());
  const selectedEvents = monthEvents.filter((event) => event.date === calendarSelectedDate);
  const orderedSelectedEvents = [...selectedEvents].sort((a, b) => {
    const statusRank = (event: typeof a) => event.completed ? 2 : event.overdue ? 0 : 1;
    return statusRank(a) - statusRank(b) || a.dueAt.localeCompare(b.dueAt) || a.title.localeCompare(b.title);
  });
  const selectedEventCounts = {
    overdue: selectedEvents.filter((event) => event.overdue && !event.completed).length,
    pending: selectedEvents.filter((event) => !event.overdue && !event.completed).length,
    completed: selectedEvents.filter((event) => event.completed).length,
  };
  const filteredSelectedEvents = orderedSelectedEvents.filter((event) => {
    const status = event.completed ? "completed" : event.overdue ? "overdue" : "pending";
    return selectedCalendarStatuses.includes(status);
  });
  function toggleCalendarStatus(status: "overdue" | "pending" | "completed") {
    setSelectedCalendarStatuses((current) => current.includes(status)
      ? current.filter((item) => item !== status)
      : [...current, status]);
  }
  async function markCalendarReminderDone(reminderId: string) {
    try {
      const result = await completeReminderFromCalendar(reminderId);
      if (result) {
        setHomeReminders(result.reminders);
        setHomeReminderHistory(result.history);
      }
    } catch {
      // Keep the calendar usable if local storage or notification scheduling fails.
    }
  }
  function confirmCalendarReminderDone(reminderId: string, title: string) {
    Alert.alert("Mark reminder done?", `Mark “${title}” as completed?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Mark done", onPress: () => { void markCalendarReminderDone(reminderId); } },
    ]);
  }
  async function snoozeCalendarReminder(reminderId: string) {
    try {
      const reminders = await snoozeReminderFromCalendar(reminderId);
      if (reminders) setHomeReminders(reminders);
    } catch {
      // Keep the calendar usable if local storage or notification scheduling fails.
    }
  }
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  React.useEffect(() => {
    let active = true;
    Promise.all([
      AsyncStorage.getItem(PERSONAL_REMINDER_KEY),
      AsyncStorage.getItem(PERSONAL_REMINDER_HISTORY_KEY),
      AsyncStorage.getItem(PERSONAL_PETS_KEY),
    ]).then(([remindersRaw, reminderHistoryRaw, petsRaw]) => {
      const remindersValue: unknown = remindersRaw ? JSON.parse(remindersRaw) : [];
      const reminderHistoryValue: unknown = reminderHistoryRaw ? JSON.parse(reminderHistoryRaw) : [];
      const petsValue: unknown = petsRaw ? JSON.parse(petsRaw) : [];
      const reminders = Array.isArray(remindersValue)
        ? remindersValue.filter((item): item is HomeReminder => item !== null
          && typeof item === "object"
          && typeof item.id === "string"
          && typeof item.petId === "string"
          && typeof item.title === "string"
          && typeof item.dueAt === "string"
          && (item.repeat === "once" || item.repeat === "daily" || item.repeat === "weekly" || item.repeat === "monthly" || item.repeat === "yearly")
          && (item.allDay === undefined || typeof item.allDay === "boolean")
          && (item.icon === undefined || typeof item.icon === "string")
          && !Number.isNaN(new Date(item.dueAt).getTime()))
        : [];
      const reminderHistory = Array.isArray(reminderHistoryValue)
        ? reminderHistoryValue.filter((item): item is HomeReminderCompletion => item !== null
          && typeof item === "object"
          && typeof item.id === "string"
          && typeof item.reminderId === "string"
          && typeof item.petId === "string"
          && typeof item.petName === "string"
          && typeof item.title === "string"
          && typeof item.scheduledFor === "string"
          && typeof item.completedAt === "string"
          && (item.repeat === undefined || item.repeat === "once" || item.repeat === "daily" || item.repeat === "weekly" || item.repeat === "monthly" || item.repeat === "yearly")
          && (item.allDay === undefined || typeof item.allDay === "boolean")
          && (item.icon === undefined || typeof item.icon === "string")
          && !Number.isNaN(new Date(item.scheduledFor).getTime()))
        : [];
      const pets = Array.isArray(petsValue)
        ? petsValue.filter((item): item is HomePet => item !== null
          && typeof item === "object"
          && typeof item.id === "string"
          && typeof item.name === "string"
          && (item.profilePhotoUri === undefined || typeof item.profilePhotoUri === "string"))
        : [];
      if (active) {
        setHomeReminders(reminders.sort((a, b) => a.dueAt.localeCompare(b.dueAt)));
        setHomeReminderHistory(reminderHistory);
        setHomePetsById(new Map(pets.map((pet) => [pet.id, pet])));
      }
    }).catch(() => {
      if (active) {
        setHomeReminders([]);
        setHomeReminderHistory([]);
        setHomePetsById(new Map());
      }
    }).finally(() => {
      if (active) setRemindersLoaded(true);
    });
    return () => { active = false; };
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <DraggableFlatList
        data={visibleLibraryCardIds}
        keyExtractor={(id) => id}
        contentContainerStyle={styles.menuContent}
        animationConfig={{ damping: 20, mass: 0.2, stiffness: 140, overshootClamping: true }}
        activationDistance={8}
        onDragEnd={({ data }) => reorderVisibleLibraryCards(data)}
        ListHeaderComponent={(
          <>
        <View style={styles.topBar}>
          <View style={styles.brandIcon}>
            <Text style={styles.brandPaw}>✿</Text>
          </View>
          <Text style={styles.brandWord}>PETCARE</Text>
          <Text style={styles.brandCompanion}>COMPANION</Text>
          <View style={styles.topBarRight}>
            <View style={styles.onlineDot} />
            <Text style={styles.todayText}>YOUR CARE SPACE</Text>
            <IconButton label="Open settings" onPress={onOpenSettings} style={styles.topSettingsButton}>
              <Text style={styles.topSettingsGlyph}>⚙</Text>
            </IconButton>
          </View>
        </View>

        {isSyncing || isOffline || isStale ? (
          <View style={styles.homeSyncBanner}>
            <Text style={styles.homeSyncBannerText}>
              {isSyncing ? "Checking for pet-library updates…" : isOffline ? "Offline mode · showing saved pet data" : "Saved pet data may be out of date"}
            </Text>
            {!isSyncing ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Retry pet-library sync" onPress={onRefreshData} style={styles.homeSyncButton}>
                <Text style={styles.homeSyncButtonText}>Retry</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {showCalendar ? <View style={styles.homeCalendarSection}>
          <View style={styles.homeRemindersHeader}>
            <View>
              <Text style={styles.sectionEyebrow}>YOUR CARE PLAN</Text>
              <Text style={styles.sectionTitle}>Care calendar</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Open Reminders" onPress={onOpenReminders} style={styles.homeRemindersLink}>
              <Text style={styles.homeRemindersLinkText}>Open Reminders →</Text>
            </Pressable>
          </View>
          {!remindersLoaded ? (
            <View style={styles.homeReminderEmpty}><Text style={styles.homeReminderEmptyText}>Loading calendar…</Text></View>
          ) : (
            <View style={styles.homeCalendarCard}>
              <View style={styles.homeCalendarMonthRow}>
                <Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => {
                  const previous = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
                  setCalendarMonth(previous);
                  setCalendarSelectedDate(localDateInput(previous));
                }} style={styles.homeCalendarArrow}><Text style={styles.homeCalendarArrowText}>‹</Text></Pressable>
                <Text style={styles.homeCalendarMonth}>{calendarMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Next month" onPress={() => {
                  const next = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
                  setCalendarMonth(next);
                  setCalendarSelectedDate(localDateInput(next));
                }} style={styles.homeCalendarArrow}><Text style={styles.homeCalendarArrowText}>›</Text></Pressable>
              </View>
              <View style={styles.homeCalendarGrid}>
                {weekdays.map((weekday) => (
                  <Text key={weekday} style={styles.homeCalendarWeekday}>{weekday}</Text>
                ))}
                {calendarDates.map((date, index) => {
                  if (!date) return <View key={`blank-${index}`} style={styles.homeCalendarDayCell} />;
                  const day = Number(date.slice(-2));
                  const isToday = date === localDateInput(new Date());
                  const selected = date === calendarSelectedDate;
                  const eventColors = [...new Set(monthEvents.filter((event) => event.date === date).map((event) => event.color))];
                  const eventCount = monthEvents.filter((event) => event.date === date).length;
                  return (
                    <Pressable
                      key={date}
                      accessibilityRole="button"
                      accessibilityLabel={`${calendarMonth.toLocaleDateString(undefined, { month: "long" })} ${day}${eventCount ? `, ${eventCount} care events` : ""}`}
                      onPress={() => setCalendarSelectedDate(date)}
                      style={[styles.homeCalendarDayCell, selected && styles.homeCalendarDaySelected, isToday && !selected && styles.homeCalendarDayToday]}
                    >
                      <Text style={[styles.homeCalendarDayNumber, selected && styles.homeCalendarDayNumberSelected]}>{day}</Text>
                      {eventCount ? (
                        <View style={styles.homeCalendarEventDots}>
                          {eventColors.map((color) => <View key={color} style={[styles.homeCalendarEventDot, { backgroundColor: color }]} />)}
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.homeCalendarSelectedDayHeader}>
                <Text style={styles.homeCalendarSelectedDate}>{new Date(`${calendarSelectedDate}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</Text>
                <View style={styles.homeCalendarSelectedDayControls}>
                  <View style={styles.homeCalendarTotalCountBadge}>
                    <Text style={styles.homeCalendarSelectedCount}>{selectedEvents.length} {selectedEvents.length === 1 ? "event" : "events"}</Text>
                  </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: selectedCalendarEventsExpanded }}
                  accessibilityLabel={selectedCalendarEventsExpanded ? "Collapse calendar event list" : "Expand calendar event list"}
                  onPress={() => setSelectedCalendarEventsExpanded((expanded) => !expanded)}
                  style={({ pressed }) => [styles.homeCalendarListToggle, pressed && styles.pressed]}
                >
                  <Text style={styles.homeCalendarListToggleText}>{selectedCalendarEventsExpanded ? "Hide list" : "Show list"}</Text>
                </Pressable>
                </View>
              </View>
              <View style={styles.homeCalendarStatusCounts}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selectedCalendarStatuses.includes("overdue") }}
                  accessibilityLabel={`${selectedEventCounts.overdue} overdue events filter`}
                  onPress={() => toggleCalendarStatus("overdue")}
                  style={[styles.homeCalendarStatusFilter, { backgroundColor: selectedCalendarStatuses.includes("overdue") ? palette.soft : palette.bg, borderColor: selectedCalendarStatuses.includes("overdue") ? palette.primary : palette.line, borderWidth: selectedCalendarStatuses.includes("overdue") ? 2 : 1 }]}
                >
                  <Text style={[styles.homeCalendarStatusCount, { color: selectedCalendarStatuses.includes("overdue") ? palette.primary : palette.muted }]}>Overdue {selectedEventCounts.overdue}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selectedCalendarStatuses.includes("pending") }}
                  accessibilityLabel={`${selectedEventCounts.pending} pending events filter`}
                  onPress={() => toggleCalendarStatus("pending")}
                  style={[styles.homeCalendarStatusFilter, { backgroundColor: selectedCalendarStatuses.includes("pending") ? palette.soft : palette.bg, borderColor: selectedCalendarStatuses.includes("pending") ? palette.primary : palette.line, borderWidth: selectedCalendarStatuses.includes("pending") ? 2 : 1 }]}
                >
                  <Text style={[styles.homeCalendarStatusCount, { color: selectedCalendarStatuses.includes("pending") ? palette.primary : palette.muted }]}>Pending {selectedEventCounts.pending}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selectedCalendarStatuses.includes("completed") }}
                  accessibilityLabel={`${selectedEventCounts.completed} completed events filter`}
                  onPress={() => toggleCalendarStatus("completed")}
                  style={[styles.homeCalendarStatusFilter, { backgroundColor: selectedCalendarStatuses.includes("completed") ? palette.soft : palette.bg, borderColor: selectedCalendarStatuses.includes("completed") ? palette.primary : palette.line, borderWidth: selectedCalendarStatuses.includes("completed") ? 2 : 1 }]}
                >
                  <Text style={[styles.homeCalendarStatusCount, { color: selectedCalendarStatuses.includes("completed") ? palette.primary : palette.muted }]}>Completed {selectedEventCounts.completed}</Text>
                </Pressable>
              </View>
              {selectedCalendarEventsExpanded && filteredSelectedEvents.length ? (
                <ScrollView style={styles.homeCalendarListScroll} contentContainerStyle={styles.homeCalendarList} nestedScrollEnabled showsVerticalScrollIndicator>
                  {filteredSelectedEvents.map((event) => (
                    <View key={event.id} style={[styles.homeCalendarItem, { borderLeftColor: event.color }]}>
                      {homePetsById.get(event.petId)?.profilePhotoUri ? (
                        <View style={styles.homeCalendarPetIdentity}>
                          <Image source={{ uri: homePetsById.get(event.petId)?.profilePhotoUri }} contentFit="cover" style={styles.homeCalendarPetAvatar} />
                          <View style={[styles.homeCalendarEventIcon, styles.homeCalendarEventIconOverlay]}><SolidPetIcon name={iconNameOrDefault(event.icon)} color={GREEN} cutout="#E8EFE5" size={14} /></View>
                        </View>
                      ) : <View style={styles.homeCalendarEventIcon}><SolidPetIcon name={iconNameOrDefault(event.icon)} color={GREEN} cutout="#E8EFE5" size={18} /></View>}
                      <View style={styles.homeReminderCopy}>
                        <Text style={styles.homeReminderTitle} numberOfLines={1}>{event.title}</Text>
                        <Text style={styles.homeReminderPet}>{homePetsById.get(event.petId)?.name ?? "General"}</Text>
                        {event.completed ? (
                          <View style={styles.homeReminderCompletedBadge}>
                            <Text style={styles.homeReminderCompletedText}>✓ Completed</Text>
                          </View>
                        ) : null}
                        {event.overdue ? (
                          <View style={styles.homeReminderOverdueBadge}>
                            <NativeText style={[styles.homeReminderDateTime, { color: "#FFFFFF" }]} numberOfLines={1}>Overdue · {displayReminderDateTime(event.dueAt, event.allDay)}</NativeText>
                          </View>
                        ) : (
                          <Text style={styles.homeReminderDateTime} numberOfLines={1}>{displayReminderDateTime(event.dueAt, event.allDay)}</Text>
                        )}
                      </View>
                      {!event.completed && event.date === localDateInput(new Date()) ? (
                        <View style={styles.homeCalendarEventActions}>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Mark ${event.title} done`}
                              onPress={() => confirmCalendarReminderDone(event.reminderId, event.title)}
                            style={({ pressed }) => [styles.homeCalendarEventAction, styles.homeCalendarDoneAction, pressed && styles.pressed]}
                          >
                            <Text style={styles.homeCalendarDoneActionText}>Mark done</Text>
                          </Pressable>
                          {event.overdue ? (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Snooze ${event.title}`}
                              onPress={() => void snoozeCalendarReminder(event.reminderId)}
                              style={({ pressed }) => [styles.homeCalendarEventAction, styles.homeCalendarSnoozeAction, pressed && styles.pressed]}
                            >
                              <Text style={styles.homeCalendarSnoozeActionText}>Snooze</Text>
                            </Pressable>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  ))}
                </ScrollView>
              ) : selectedCalendarEventsExpanded ? (
                <Text style={styles.homeReminderEmptyText}>
                  {selectedEvents.length === 0
                    ? "No care events for this day."
                    : selectedCalendarStatuses.length === 0
                      ? "Select a status to show events."
                      : "No events match the selected statuses."}
                </Text>
              ) : null}
            </View>
          )}
        </View> : null}

        {visibleLibraryCardIds.length > 0 ? <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionEyebrow}>YOUR LIBRARY</Text>
            <Text style={styles.sectionTitle}>Where shall we begin?</Text>
          </View>
          <Text style={styles.sectionCount}>{`0${visibleLibraryCardIds.length}/03`}</Text>
        </View> : null}
          </>
        )}
        ListFooterComponent={(
          <>
        <View style={styles.comingSoon}>
          <View style={styles.comingSoonIcon}><Text style={styles.comingSoonGlyph}>＋</Text></View>
          <View style={styles.comingSoonCopy}>
            <Text style={styles.comingSoonTitle}>A little more room to grow</Text>
            <Text style={styles.comingSoonDescription}>More companion tools can find a home here.</Text>
          </View>
          <Text style={styles.comingSoonTag}>SOON</Text>
        </View>

        <View style={styles.menuFooter}>
          <Text style={styles.footerPaw}>✳</Text>
          <Text style={styles.footerText}>MADE FOR THE ONES WHO MAKE US WHOLE</Text>
          <Text style={styles.footerPaw}>✳</Text>
        </View>
          </>
        )}
        renderItem={({ item, drag, getIndex }) => {
          const cardIndex = getIndex() ?? Math.max(libraryCardOrder.indexOf(item), 0);
            const cardNumber = String(cardIndex + 1).padStart(2, "0");
            const label = item === "directory" ? "Pet Directory" : item === "care" ? "My Pets" : "Expenses";
            const accessibilityLabel = item === "care" && overdueReminderCount > 0
              ? `Open My Pets and personal care tools, ${overdueReminderCount} overdue reminders`
              : item === "directory" ? "Browse the Pet Directory" : item === "care" ? "Open My Pets and personal care tools" : "Open pet-care expenses";
            return (
              <ScaleDecorator activeScale={1.02}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={accessibilityLabel}
                  accessibilityHint={`Long press and drag to rearrange ${label}`}
                  onPress={item === "directory" ? onOpenPets : item === "care" ? onOpenCare : onOpenExpenses}
                  onLongPress={drag}
                  delayLongPress={220}
                  style={({ pressed }) => [
                    styles.menuCardPressable,
                    item === "care" && styles.myPetsMenuCard,
                    item === "expenses" && styles.expensesMenuCard,
                    { marginTop: cardIndex > 0 ? 12 : 0, opacity: pressed ? 0.78 : 1 },
                  ]}
                >
                  <View style={styles.menuCard}>
                    {item === "directory" ? (
                      <>
                        <View style={styles.menuCardArt}>
                          <View style={styles.menuCardSun} />
                          <SolidMenuIcon kind="book" />
                          <View style={styles.menuCardSparkle}><Text style={styles.menuCardSparkleText}>✦</Text></View>
                        </View>
                        <View style={styles.menuCardCopy}>
                          <View style={styles.cardTag}><Text style={styles.cardTagText}>THE STARTING POINT</Text></View>
                          <Text style={styles.menuCardTitle}>Pet Directory</Text>
                          <Text style={styles.menuCardDescription}>Discover categories, save favourites, and find the care notes you need.</Text>
                          <Text style={styles.menuCardAction}>Browse the collection <Text style={styles.menuCardArrow}>→</Text></Text>
                        </View>
                      </>
                    ) : item === "care" ? (
                      <>
                        <View style={[styles.menuCardArt, styles.myPetsMenuArt]}>
                          <View style={styles.menuCardSun} />
                          <SolidMenuIcon kind="paw" />
                          <View style={styles.menuCardSparkle}><Text style={styles.menuCardSparkleText}>✚</Text></View>
                        </View>
                        <View style={styles.menuCardCopy}>
                          <View style={styles.cardTag}><Text style={styles.cardTagText}>YOUR PERSONAL CARE</Text></View>
                          <Text style={styles.menuCardTitle}>My Pets</Text>
                          <Text style={styles.menuCardDescription}>Create pet profiles, keep photos, and organize reminders and care notes.</Text>
                          <Text style={styles.menuCardAction}>Open your care center <Text style={styles.menuCardArrow}>→</Text></Text>
                        </View>
                        {overdueReminderCount > 0 ? (
                          <View style={styles.myPetsOverdueBadge}>
                            <NativeText style={styles.myPetsOverdueBadgeText}>{overdueReminderCount > 99 ? "99+" : overdueReminderCount}</NativeText>
                          </View>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <View style={[styles.menuCardArt, styles.expensesMenuArt]}>
                          <View style={styles.menuCardSun} />
                          <Text style={[styles.expensesMenuSymbol, { color: palette.menuIcon }]}>$</Text>
                          <View style={styles.menuCardSparkle}><Text style={styles.menuCardSparkleText}>＋</Text></View>
                        </View>
                        <View style={styles.menuCardCopy}>
                          <View style={styles.cardTag}><Text style={styles.cardTagText}>PET-CARE BUDGET</Text></View>
                          <Text style={styles.menuCardTitle}>Expenses</Text>
                          <Text style={styles.menuCardDescription}>Track vet visits, food, medicine, and everyday costs with spending summaries.</Text>
                          <Text style={styles.menuCardAction}>Review expenses <Text style={styles.menuCardArrow}>→</Text></Text>
                        </View>
                      </>
                    )}
                    <Text style={[styles.menuCardNumber, item === "care" && styles.myPetsMenuCardNumber]}>{cardNumber}</Text>
                    <Text style={styles.menuCardDragHint}>⠿</Text>
                  </View>
                </Pressable>
              </ScaleDecorator>
            );
          }}
      />
    </SafeAreaView>
  );
}

const THEME_OPTIONS: { id: ThemeName; label: string; detail: string; swatches: string[] }[] = [
  { id: "light", label: "Light", detail: "Soft and airy", swatches: ["#F7F6F1", "#FFFFFF", "#3F6347"] },
  { id: "blue", label: "Blue", detail: "Calm coastal tones", swatches: ["#F1F6FA", "#FFFFFF", "#2E5D78"] },
  { id: "orange", label: "Orange", detail: "Warm and sunny", swatches: ["#FBF4ED", "#FFFFFF", "#94502F"] },
  { id: "green", label: "Green", detail: "A little outdoorsy", swatches: ["#F1F6F0", "#FFFFFF", "#3F6345"] },
  { id: "yellow", label: "Yellow", detail: "Bright and gentle", swatches: ["#FBF8EC", "#FFFFFF", "#705D17"] },
  { id: "rose", label: "Rose", detail: "Soft blush tones", swatches: ["#FBF2F4", "#FFFFFF", "#914F64"] },
  { id: "dark", label: "Dark", detail: "Easy on the eyes", swatches: ["#1B211F", "#272F2C", "#5F765C"] },
  { id: "midnight", label: "Midnight", detail: "Deep blue night", swatches: ["#171D2A", "#222B3B", "#5A6F9B"] },
  { id: "charcoal", label: "Charcoal", detail: "Warm charcoal", swatches: ["#211F1D", "#302D2A", "#92704F"] },
];

function SettingsScreen({
  themeName,
  favoritesOnly,
  onSelectTheme,
  onToggleFavoritesOnly,
  onBack,
  lastUpdatedAt,
  lastCheckedAt,
  onRefreshData,
  syncStatus,
  dataSource,
  version,
  isSyncing,
  autoSyncEnabled,
  onToggleAutoSync,
  isStale,
  showCalendar,
  onToggleShowCalendar,
  showCalendarEventListByDefault,
  onToggleShowCalendarEventListByDefault,
  showPetDirectory,
  onToggleShowPetDirectory,
  showExpenses,
  onToggleShowExpenses,
  onRestoreDefaults,
  backToHome,
}: {
  themeName: ThemeName;
  favoritesOnly: boolean;
  onSelectTheme: (theme: ThemeName) => void;
  onToggleFavoritesOnly: () => void;
  onBack: () => void;
  lastUpdatedAt: string | null;
  lastCheckedAt: string | null;
  onRefreshData: () => void;
  syncStatus: string | null;
  dataSource: DataSource;
  version: number;
  isSyncing: boolean;
  autoSyncEnabled: boolean;
  onToggleAutoSync: () => void;
  isStale: boolean;
  showCalendar: boolean;
  onToggleShowCalendar: () => void;
  showCalendarEventListByDefault: boolean;
  onToggleShowCalendarEventListByDefault: () => void;
  showPetDirectory: boolean;
  onToggleShowPetDirectory: () => void;
  showExpenses: boolean;
  onToggleShowExpenses: () => void;
  onRestoreDefaults: () => void;
  backToHome: boolean;
}) {
  const { palette } = useContext(PetCareThemeContext);
  const [expenseCurrency, setExpenseCurrency] = useState<ExpenseCurrencyCode>("USD");
  const [expenseCurrencyLoaded, setExpenseCurrencyLoaded] = useState(false);

  React.useEffect(() => {
    let active = true;
    AsyncStorage.getItem(EXPENSE_CURRENCY_STORAGE_KEY).then((savedCurrency) => {
      if (active && EXPENSE_CURRENCY_OPTIONS.some((option) => option.code === savedCurrency)) {
        setExpenseCurrency(savedCurrency as ExpenseCurrencyCode);
      }
    }).catch(() => {
      // Keep USD as the fallback if the saved expense preference cannot be read.
    }).finally(() => {
      if (active) setExpenseCurrencyLoaded(true);
    });
    return () => { active = false; };
  }, []);

  React.useEffect(() => {
    if (!expenseCurrencyLoaded) return;
    AsyncStorage.setItem(EXPENSE_CURRENCY_STORAGE_KEY, expenseCurrency).catch(() => undefined);
  }, [expenseCurrency, expenseCurrencyLoaded]);

  function confirmRestoreDefaults() {
    Alert.alert(
      "Restore default configurations?",
      "This resets your theme, dashboard visibility, favourites-only preference, event-list setting, expense currency, and sync preference. Your saved pet data will not be changed.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Restore defaults", onPress: () => {
          onRestoreDefaults();
          setExpenseCurrency("USD");
        } },
      ],
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.bg }]}>
      <ScrollView contentContainerStyle={styles.settingsContent}>
        <Header eyebrow="MAKE IT YOURS" title="Settings" onBack={onBack} backToHome={backToHome} />

        <View style={styles.settingsIntro}>
          <Text style={styles.listIntroTitle}>A space that feels like yours.</Text>
          <Text style={styles.listIntroDescription}>
            Choose your theme, dashboard options, and how your pet library opens.
          </Text>
        </View>

        <View style={[styles.settingsGroupCard, { backgroundColor: palette.card, borderColor: palette.line }]}>
          <View style={styles.settingsSectionHeading}>
            <View>
              <Text style={styles.sectionEyebrow}>CONFIGURATIONS</Text>
              <Text style={styles.sectionTitle}>Restore defaults</Text>
            </View>
          </View>
          <Text style={styles.preferenceDescription}>Reset Settings preferences to their defaults. Saved pet profiles, health records, reminders, and expenses will remain unchanged.</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Restore all default configurations"
            onPress={confirmRestoreDefaults}
            style={({ pressed }) => [styles.restoreDefaultsButton, { backgroundColor: palette.soft, borderColor: palette.line, opacity: pressed ? 0.76 : 1 }]}
          >
            <Text style={[styles.restoreDefaultsText, { color: palette.primary }]}>Restore all default configurations</Text>
          </Pressable>
        </View>

        <View style={[styles.settingsGroupCard, { backgroundColor: palette.card, borderColor: palette.line }]}>
        <View style={styles.settingsSectionHeading}>
          <View>
            <Text style={styles.sectionEyebrow}>APPEARANCE</Text>
            <Text style={styles.sectionTitle}>Choose a theme</Text>
          </View>
          <Text style={styles.sectionCount}>9 OPTIONS</Text>
        </View>

        <View style={styles.themeGrid}>
          {THEME_OPTIONS.map((option) => {
            const selected = themeName === option.id;
            return (
              <Pressable
                key={option.id}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`${option.label} theme`}
                onPress={() => onSelectTheme(option.id)}
                style={({ pressed }) => [styles.themeOption, selected && styles.themeOptionSelected, pressed && styles.pressed]}
              >
                <View style={styles.themeSwatches}>
                  {option.swatches.map((color, index) => (
                    <NativeView
                      key={`${option.id}-${index}`}
                      style={[styles.themeSwatch, { backgroundColor: color, borderColor: ["dark", "midnight", "charcoal"].includes(option.id) && index < 2 ? "#56615A" : "#00000012" }]}
                    />
                  ))}
                </View>
                <View style={styles.themeOptionCopy}>
                  <Text style={styles.themeOptionName}>{option.label}</Text>
                  <View style={[styles.themeRadio, selected && styles.themeRadioSelected]}>
                    {selected ? <View style={styles.themeRadioDot} /> : null}
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
        </View>

        <View style={[styles.settingsGroupCard, { backgroundColor: palette.card, borderColor: palette.line }]}>
        <View style={styles.settingsSectionHeading}>
          <View>
            <Text style={styles.sectionEyebrow}>CALENDAR</Text>
            <Text style={styles.sectionTitle}>Calendar preferences</Text>
          </View>
        </View>
        <View style={styles.settingsPreferenceRow}>
          <View style={styles.preferenceIcon}><Text style={styles.preferenceIconText}>▦</Text></View>
          <View style={styles.preferenceCopy}>
            <Text style={styles.preferenceTitle}>Show Calendar</Text>
            <Text style={styles.preferenceDescription}>Display the Care calendar on your dashboard.</Text>
          </View>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: showCalendar }}
            accessibilityLabel="Show Calendar on dashboard"
            onPress={onToggleShowCalendar}
            style={[styles.toggleTrack, showCalendar && styles.toggleTrackOn]}
          >
            <View style={[styles.toggleThumb, showCalendar && styles.toggleThumbOn]} />
          </Pressable>
        </View>
        {showCalendar ? (
          <View style={[styles.settingsPreferenceRow, styles.nestedSettingsPreferenceRow, { borderTopColor: palette.line }]}>
            <View style={[styles.preferenceIcon, styles.calendarListPreferenceIcon]}><Text style={styles.preferenceIconText}>☷</Text></View>
            <View style={styles.preferenceCopy}>
              <Text style={styles.preferenceTitle}>Show events list as default</Text>
              <Text style={styles.preferenceDescription}>Expand the selected day’s event list automatically.</Text>
            </View>
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: showCalendarEventListByDefault }}
              accessibilityLabel="Show calendar events list by default"
              onPress={onToggleShowCalendarEventListByDefault}
              style={[styles.toggleTrack, showCalendarEventListByDefault && styles.toggleTrackOn]}
            >
              <View style={[styles.toggleThumb, showCalendarEventListByDefault && styles.toggleThumbOn]} />
            </Pressable>
          </View>
        ) : null}
        </View>

        <View style={[styles.settingsGroupCard, { backgroundColor: palette.card, borderColor: palette.line }]}>
        <View style={styles.settingsSectionHeading}>
          <View>
            <Text style={styles.sectionEyebrow}>PET DIRECTORY</Text>
            <Text style={styles.sectionTitle}>Directory preferences</Text>
          </View>
        </View>
        <View style={styles.settingsPreferenceRow}>
          <View style={[styles.preferenceIcon, styles.directoryPreferenceIcon]}><Text style={styles.preferenceIconText}>▤</Text></View>
          <View style={styles.preferenceCopy}>
            <Text style={styles.preferenceTitle}>Show Pet Directory</Text>
            <Text style={styles.preferenceDescription}>Display the Pet Directory card on your dashboard.</Text>
          </View>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: showPetDirectory }}
            accessibilityLabel="Show Pet Directory on dashboard"
            onPress={onToggleShowPetDirectory}
            style={[styles.toggleTrack, showPetDirectory && styles.toggleTrackOn]}
          >
            <View style={[styles.toggleThumb, showPetDirectory && styles.toggleThumbOn]} />
          </Pressable>
        </View>
        {showPetDirectory ? (
          <View style={[styles.settingsPreferenceRow, styles.nestedSettingsPreferenceRow, { borderTopColor: palette.line }]}>
            <View style={[styles.preferenceIcon, styles.favoritesPreferenceIcon]}><Text style={styles.preferenceIconText}>♥</Text></View>
            <View style={styles.preferenceCopy}>
              <Text style={styles.preferenceTitle}>Open to favourites</Text>
              <Text style={styles.preferenceDescription}>Start the Pet Directory with saved categories and pets only.</Text>
            </View>
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: favoritesOnly }}
              accessibilityLabel="Default to favourites only"
              onPress={onToggleFavoritesOnly}
              style={[styles.toggleTrack, favoritesOnly && styles.toggleTrackOn]}
            >
              <View style={[styles.toggleThumb, favoritesOnly && styles.toggleThumbOn]} />
            </Pressable>
          </View>
        ) : null}
        </View>

        <View style={[styles.settingsGroupCard, { backgroundColor: palette.card, borderColor: palette.line }]}>
        <View style={styles.settingsSectionHeading}>
          <View>
            <Text style={styles.sectionEyebrow}>EXPENSES</Text>
            <Text style={styles.sectionTitle}>Expense preferences</Text>
          </View>
        </View>
        <View style={styles.settingsPreferenceRow}>
          <View style={[styles.preferenceIcon, styles.expensesPreferenceIcon]}><Text style={styles.preferenceIconText}>$</Text></View>
          <View style={styles.preferenceCopy}>
            <Text style={styles.preferenceTitle}>Show Expenses</Text>
            <Text style={styles.preferenceDescription}>Display the Expenses card on your dashboard.</Text>
          </View>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: showExpenses }}
            accessibilityLabel="Show Expenses on dashboard"
            onPress={onToggleShowExpenses}
            style={[styles.toggleTrack, showExpenses && styles.toggleTrackOn]}
          >
            <View style={[styles.toggleThumb, showExpenses && styles.toggleThumbOn]} />
          </Pressable>
        </View>
        {showExpenses ? (
          <View style={styles.expenseSettingsContent}>
            <Text style={styles.preferenceTitle}>Currency</Text>
            <Text style={styles.preferenceDescription}>Currency can be changed here. Changing currency does not convert expense amounts.</Text>
            <View style={styles.expenseCurrencyOptions}>
              {EXPENSE_CURRENCY_OPTIONS.map((option) => {
                const selected = expenseCurrency === option.code;
                return (
                  <Pressable
                    key={option.code}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${option.code} currency`}
                    onPress={() => setExpenseCurrency(option.code)}
                    style={[styles.expenseCurrencyOption, selected && styles.expenseCurrencyOptionSelected]}
                  >
                    <Text style={[styles.expenseCurrencyOptionText, selected && styles.expenseCurrencyOptionTextSelected]}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}
        </View>

        <View style={styles.settingsSavedNote}>
          <Text style={styles.settingsSavedIcon}>✓</Text>
          <Text style={styles.settingsSavedText}>Your choices are saved on this device.</Text>
        </View>

        <View style={[styles.settingsGroupCard, { backgroundColor: palette.card, borderColor: palette.line }]}>
        <View style={styles.settingsSectionHeading}>
          <Text style={styles.sectionEyebrow}>SYNC</Text>
        </View>
        <View style={styles.settingsPreferenceRow}>
          <View style={styles.preferenceIcon}><Text style={styles.preferenceIconText}>⏱</Text></View>
          <View style={styles.preferenceCopy}>
            <Text style={styles.preferenceTitle}>Background sync</Text>
            <Text style={styles.preferenceDescription}>Check for updates when the app becomes active again.</Text>
          </View>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: autoSyncEnabled }}
            accessibilityLabel="Toggle background sync"
            onPress={onToggleAutoSync}
            style={[styles.toggleTrack, autoSyncEnabled && styles.toggleTrackOn]}
          >
            <View style={[styles.toggleThumb, autoSyncEnabled && styles.toggleThumbOn]} />
          </Pressable>
        </View>

        <Pressable
          onPress={onRefreshData}
          style={({ pressed }) => [styles.settingsPreferenceRow, pressed && styles.pressed]}
        >
          <View style={styles.preferenceIcon}><Text style={styles.preferenceIconText}>↻</Text></View>
          <View style={styles.preferenceCopy}>
            <Text style={styles.preferenceTitle}>Check for updates</Text>
            <Text style={styles.preferenceDescription}>Check the remote manifest and update cached app data if needed.</Text>
          </View>
          <Text style={styles.preferenceArrow}>→</Text>
        </Pressable>
        {(syncStatus || isSyncing || isStale) ? (
          <View style={styles.syncBanner}>
            <Text style={styles.syncBannerText}>{isSyncing ? "Syncing data..." : syncStatus ?? "Data may be outdated."}</Text>
          </View>
        ) : null}

        <View style={styles.settingsInfoRow}>
          <Text style={styles.updatedLabel}>Last checked</Text>
          <Text style={styles.updatedText}>{lastCheckedAt ? new Date(lastCheckedAt).toLocaleString() : "Not checked yet"}</Text>
        </View>
        </View>

        <View style={[styles.settingsGroupCard, { backgroundColor: palette.card, borderColor: palette.line }]}>
        <View style={styles.settingsSectionHeading}>
          <View>
            <Text style={styles.sectionEyebrow}>ABOUT</Text>
            <Text style={styles.sectionTitle}>Application Information</Text>
          </View>
        </View>

        <View style={styles.applicationInfoRows}>
          <View style={styles.settingsInfoRow}>
            <Text style={styles.updatedLabel}>Source</Text>
            <Text style={styles.updatedText}>{dataSource === "remote" ? "Remote" : "Cached"}</Text>
          </View>
          <View style={styles.settingsInfoRow}>
            <Text style={styles.updatedLabel}>Data version</Text>
            <Text style={styles.updatedText}>{version}</Text>
          </View>
          <View style={styles.settingsInfoRow}>
            <Text style={styles.updatedLabel}>Data release date</Text>
            <Text style={styles.updatedText}>{lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—"}</Text>
          </View>
          <View style={styles.settingsInfoRow}>
            <Text style={styles.updatedLabel}>App version</Text>
            <Text style={styles.updatedText}>v{Constants.expoConfig?.version ?? "—"}</Text>
          </View>
        </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

function PetsListScreen({
  favoriteCategories,
  favoritePets,
  onToggleCategoryFavorite,
  onTogglePetFavorite,
  favoritesOnly,
  onToggleFavoritesOnly,
  onOpenSettings,
  onBack,
}: {
  favoriteCategories: string[];
  favoritePets: string[];
  onToggleCategoryFavorite: (id: string) => void;
  onTogglePetFavorite: (id: string) => void;
  favoritesOnly: boolean;
  onToggleFavoritesOnly: () => void;
  onOpenSettings: () => void;
  onBack: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<PetCategory | null>(null);
  const [selectedPet, setSelectedPet] = useState<{ pet: Pet; category: PetCategory } | null>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase();

  React.useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (selectedPet) {
        setSelectedPet(null);
        return true;
      }
      if (selectedCategory) {
        setSelectedCategory(null);
        return true;
      }
      onBack();
      return true;
    });
    return () => subscription.remove();
  }, [onBack, selectedCategory, selectedPet]);

  const filteredCategories = useMemo(() => CATEGORIES
    .filter((category) => {
      const pets = getCategoryDetails(category.id)?.pets ?? [];
      const categoryMatches =
        category.name.toLocaleLowerCase().includes(normalizedQuery) ||
        category.type.toLocaleLowerCase().includes(normalizedQuery);
      const matchingPets = pets.filter((pet) => matchesPetSearch(pet, normalizedQuery));
      const hasFavorite =
        favoriteCategories.includes(category.id) ||
        pets.some((pet) => favoritePets.includes(pet.id));
      return (categoryMatches || matchingPets.length > 0) && (!favoritesOnly || hasFavorite);
    })
    .sort((a, b) => {
      const aPets = getCategoryDetails(a.id)?.pets ?? [];
      const bPets = getCategoryDetails(b.id)?.pets ?? [];
      const aRank = favoriteCategories.includes(a.id)
        ? 0
        : aPets.some((pet) => favoritePets.includes(pet.id)) ? 1 : 2;
      const bRank = favoriteCategories.includes(b.id)
        ? 0
        : bPets.some((pet) => favoritePets.includes(pet.id)) ? 1 : 2;
      return aRank - bRank;
    }), [favoriteCategories, favoritePets, favoritesOnly, normalizedQuery]);

  if (selectedPet) {
    return (
      <PetInformationScreen
        category={selectedPet.category}
        pet={selectedPet.pet}
        isFavorite={favoritePets.includes(selectedPet.pet.id)}
        onToggleFavorite={() => onTogglePetFavorite(selectedPet.pet.id)}
        onBack={() => setSelectedPet(null)}
        onPet={(pet) => setSelectedPet({ pet, category: selectedPet.category })}
        onCategory={() => {
          setSelectedPet(null);
          setSelectedCategory(selectedPet.category);
        }}
      />
    );
  }
  if (selectedCategory) {
    return (
      <PetInformationScreen
        category={selectedCategory}
        isFavorite={favoriteCategories.includes(selectedCategory.id)}
        onToggleFavorite={() => onToggleCategoryFavorite(selectedCategory.id)}
        onBack={() => setSelectedCategory(null)}
        onPet={(pet) => setSelectedPet({ pet, category: selectedCategory })}
        favoritePets={favoritePets}
        onTogglePetFavorite={onTogglePetFavorite}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={[styles.listContent, styles.categoryScreenContent]} keyboardShouldPersistTaps="handled">
        <Header
          eyebrow="THE CARE LIBRARY"
          title="Pet Directory"
          onBack={onBack}
          backToHome
          right={(
            <View style={styles.headerActions}>
              <IconButton label="Open settings" onPress={onOpenSettings} style={styles.headerSettingsButton}>
                <Text style={styles.headerSettingsGlyph}>⚙</Text>
              </IconButton>
              <View style={styles.listCounter}><Text style={styles.listCounterText}>{String(filteredCategories.length).padStart(2, "0")}</Text></View>
            </View>
          )}
        />

        <View style={styles.listIntro}>
          <Text style={styles.listIntroTitle}>A world of wonderful companions.</Text>
          <Text style={styles.listIntroDescription}>Browse pet categories. Open one to explore its breeds and care notes.</Text>
        </View>

        <View style={styles.searchContainer}>
          <Text style={styles.searchGlyph}>⌕</Text>
          <TextInput
            accessibilityLabel="Search pets by name or type"
            value={query}
            onChangeText={setQuery}
            placeholder="Search category or breed"
            placeholderTextColor="#929990"
            returnKeyType="search"
            style={styles.searchInput}
          />
          {query.length > 0 ? (
            <IconButton label="Clear search" onPress={() => setQuery("")} style={styles.clearSearch}>
              <Text style={styles.clearSearchText}>×</Text>
            </IconButton>
          ) : null}
        </View>

        <View style={styles.filterRow}>
          <View style={styles.filterLabelWrap}>
            <Text style={styles.filterEyebrow}>QUICK FILTER</Text>
            <Text style={styles.filterTitle}>Your favourites</Text>
          </View>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: favoritesOnly }}
            accessibilityLabel="Show favorites only"
            onPress={onToggleFavoritesOnly}
            style={[styles.toggleTrack, favoritesOnly && styles.toggleTrackOn]}
          >
            <View style={[styles.toggleThumb, favoritesOnly && styles.toggleThumbOn]} />
          </Pressable>
        </View>

        <View style={styles.resultsHeading}>
          <Text style={styles.resultsTitle}>{favoritesOnly ? "YOUR FAVORITES" : "PET CATEGORIES"}</Text>
          <Text style={styles.resultsCount}>{filteredCategories.length} CATEGORIES</Text>
        </View>

        <View style={styles.categoryListCard}>
          {filteredCategories.length > 0 ? (
          <ScrollView style={styles.categoryListScroll} contentContainerStyle={styles.categoryList} nestedScrollEnabled showsVerticalScrollIndicator>
            {filteredCategories.map((category) => {
              const pets = getCategoryDetails(category.id)?.pets ?? [];
              const categoryFavorite = favoriteCategories.includes(category.id);
              const matchingBreeds = normalizedQuery
                ? pets.filter((pet) => matchesPetSearch(pet, normalizedQuery))
                : [];
              const hasPetFavorite = pets.some((pet) => favoritePets.includes(pet.id));
              return (
                <View key={category.id} style={styles.categoryCard}>
                  <IconButton
                    label={`${categoryFavorite ? "Remove" : "Add"} ${category.name} category ${categoryFavorite ? "from" : "to"} favorites`}
                    onPress={() => onToggleCategoryFavorite(category.id)}
                    style={[styles.categoryFavoriteTop, (categoryFavorite || hasPetFavorite) && styles.favoriteButtonOn]}
                  >
                    <Text style={[styles.heart, (categoryFavorite || hasPetFavorite) && styles.heartOn]}>
                      {categoryFavorite || hasPetFavorite ? "♥" : "♡"}
                    </Text>
                  </IconButton>
                  <Pressable
                    onPress={() => setSelectedCategory(category)}
                    style={({ pressed }) => [styles.categoryMain, pressed && styles.pressed]}
                  >
                    <CategoryLogo logo={category.logo} accent={category.accent} size={66} />
                    <View style={styles.categoryCopy}>
                      <Text style={styles.categoryName}>{category.name}</Text>
                      <View style={styles.categoryMeta}>
                        <Text style={styles.categoryPetCount}>{pets.length} entries</Text>
                      </View>
                    </View>
                  </Pressable>
                  <View style={styles.categoryBottom}>
                    <Text style={styles.categoryHint}>OPEN CARE NOTES</Text>
                  </View>
                  {matchingBreeds.length > 0 ? (
                    <View style={styles.searchBreedMatches}>
                      {matchingBreeds.slice(0, 3).map((pet) => (
                        <Pressable key={pet.id} onPress={() => setSelectedPet({ pet, category })} style={({ pressed }) => [styles.searchBreedMatch, pressed && styles.pressed]}>
                          <Text style={styles.searchBreedMatchText}>{pet.name}</Text>
                        </Pressable>
                      ))}
                      {matchingBreeds.length > 3 ? <Text style={styles.searchBreedMore}>+{matchingBreeds.length - 3} more</Text> : null}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </ScrollView>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🐾</Text>
            <Text style={styles.emptyTitle}>{favoritesOnly ? "No favourites just yet" : "No pets found"}</Text>
            <Text style={styles.emptyDescription}>
              {favoritesOnly ? "Tap the heart on a category or pet to save it here." : "Try another name or type to find your companion."}
            </Text>
            {favoritesOnly ? (
              <Pressable onPress={onToggleFavoritesOnly} style={styles.emptyButton}>
                <Text style={styles.emptyButtonText}>Browse all categories</Text>
              </Pressable>
            ) : null}
          </View>
          )}
        </View>

        <View style={styles.listFooter}>
          <Text style={styles.footerPaw}>✳</Text>
          <Text style={styles.footerText}>SMALL STEPS, SOFTER PAWS</Text>
          <Text style={styles.footerPaw}>✳</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

type CommonsImageResult = {
  url: string;
  title: string;
  license?: string;
};

type CommonsImageInfo = {
  thumburl?: string;
  url?: string;
  extmetadata?: { LicenseShortName?: { value?: string } };
};

type CommonsPage = {
  title?: string;
  imageinfo?: CommonsImageInfo[];
};

async function findCommonsPetPhoto(petName: string, petType: string): Promise<CommonsImageResult | null> {
  const search = `${petName} ${petType} animal`;
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: `filetype:bitmap ${search}`,
    gsrnamespace: "6",
    gsrlimit: "6",
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "640",
    format: "json",
    origin: "*",
  });
  const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return null;
  const data = await response.json() as { query?: { pages?: Record<string, CommonsPage> } };
  const pages = Object.values(data.query?.pages ?? {});
  const page = pages.find((entry) => entry.imageinfo?.[0]?.thumburl || entry.imageinfo?.[0]?.url);
  const image = page?.imageinfo?.[0];
  if (!page || !image) return null;
  return {
    url: image.thumburl ?? image.url ?? "",
    title: (page.title ?? "Wikimedia Commons").replace(/^File:/, ""),
    license: image.extmetadata?.LicenseShortName?.value,
  };
}

function SamplePetPicture({ picture, accent }: { picture: string; accent: string }) {
  const isUrl = /^https?:\/\//i.test(picture);
  return (
    <View style={[styles.samplePictureFrame, { backgroundColor: `${accent}22` }]}>
      {isUrl ? (
        <Image source={{ uri: picture }} contentFit="cover" style={styles.samplePictureImage} />
      ) : (
        <Text style={styles.samplePictureEmoji}>{picture || "🐾"}</Text>
      )}
    </View>
  );
}

function BreedPhotoSection({ petName, petType, configuredPicture }: { petName: string; petType: string; configuredPicture?: string }) {
  const configuredImageUrl = configuredPicture && /^https?:\/\//i.test(configuredPicture) ? configuredPicture : null;
  const [commonsPhoto, setCommonsPhoto] = useState<CommonsImageResult | null>(null);
  React.useEffect(() => {
    if (configuredImageUrl || !petName) return;
    let active = true;
    findCommonsPetPhoto(petName, petType)
      .then((photo) => { if (active) setCommonsPhoto(photo); })
      .catch(() => { if (active) setCommonsPhoto(null); });
    return () => { active = false; };
  }, [configuredImageUrl, petName, petType]);

  const imageUri = configuredImageUrl ?? commonsPhoto?.url;
  if (!imageUri) return null;

  return (
    <View style={styles.breedPhotoSection}>
      <Text style={styles.sectionEyebrow}>ANIMAL PHOTO</Text>
      <View style={styles.breedPhotoFrame}>
        <Image source={{ uri: imageUri }} contentFit="cover" style={styles.breedPhotoImage} />
      </View>
      {!configuredImageUrl && commonsPhoto ? (
        <Text style={styles.samplePictureCredit} numberOfLines={1}>
          Wikimedia Commons · {commonsPhoto.license ? `${commonsPhoto.license} · ` : ""}{commonsPhoto.title}
        </Text>
      ) : null}
    </View>
  );
}

function DetailSectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <View style={styles.detailSectionHeading}>
      <View>
        <Text style={styles.sectionEyebrow}>{eyebrow}</Text>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <Text style={styles.sectionCount}>PET GUIDE</Text>
    </View>
  );
}

function DietList({
  title,
  entries,
  tone,
}: {
  title: string;
  entries: string[];
  tone: "good" | "avoid";
}) {
  return (
    <View style={[styles.dietListSection, tone === "good" ? styles.dietListGood : styles.dietListAvoid]}>
      <Text style={[styles.dietListTitle, tone === "avoid" && styles.dietListTitleAvoid]}>{title}</Text>
      {entries.map((entry) => (
        <View key={entry} style={styles.dietListRow}>
          <View style={[styles.dietBullet, tone === "avoid" && styles.dietBulletAvoid]}>
            <Text style={[styles.dietBulletText, tone === "avoid" && styles.dietBulletTextAvoid]}>
              {tone === "good" ? "✓" : "!"}
            </Text>
          </View>
          <Text style={styles.dietListText}>{entry}</Text>
        </View>
      ))}
    </View>
  );
}

function SourceReferences({ sources }: { sources: PetSource[] }) {
  const references = sources.filter((source) => source.name && /^https?:\/\//i.test(source.url));
  return (
    <View style={styles.sourceSection}>
      <View style={styles.detailSectionHeading}>
        <View>
          <Text style={styles.sectionEyebrow}>TRANSPARENCY</Text>
          <Text style={styles.sectionTitle}>Sources & review</Text>
        </View>
      </View>
      {references.length > 0 ? references.map((source) => (
        <Pressable
          key={`${source.name}-${source.url}`}
          accessibilityRole="link"
          accessibilityLabel={`Open source: ${source.name}`}
          onPress={() => { void Linking.openURL(source.url).catch(() => undefined); }}
          style={({ pressed }) => [styles.sourceCard, pressed && styles.pressed]}
        >
          <View style={styles.sourceCardCopy}>
            <Text style={styles.sourceTopic}>{source.topic}</Text>
            <Text style={styles.sourceName}>{source.name}</Text>
            <Text style={styles.sourceReviewed}>{source.reviewedAt ? `Reviewed ${source.reviewedAt}` : "No topic-specific review date supplied"}</Text>
          </View>
          <Text style={styles.sourceArrow}>↗</Text>
        </Pressable>
      )) : (
        <View style={styles.sourceCard}>
          <Text style={styles.sourceReviewed}>No source citations are provided for this guide yet. Topic-specific review dates are not available.</Text>
        </View>
      )}
      {references.length > 0 ? (
        <Text style={styles.sourceNote}>These references support selected topics in the library; they do not indicate that every entry has been independently reviewed.</Text>
      ) : null}
    </View>
  );
}

function RelatedGuides({
  category,
  pet,
  onPet,
}: {
  category: PetCategory;
  pet: Pet;
  onPet?: (pet: Pet) => void;
}) {
  const related = (getCategoryDetails(category.id)?.pets ?? [])
    .filter((candidate) => candidate.id !== pet.id)
    .slice(0, 3);
  if (related.length === 0) return null;
  return (
    <>
      <DetailSectionHeader eyebrow="KEEP EXPLORING" title="Related guides" />
      <View style={styles.relatedGuides}>
        {related.map((candidate) => (
          <Pressable key={candidate.id} onPress={() => onPet?.(candidate)} style={({ pressed }) => [styles.relatedGuide, pressed && styles.pressed]}>
            <View style={styles.relatedGuideCopy}>
              <Text style={styles.relatedGuideName}>{candidate.name}</Text>
              <Text style={styles.relatedGuideDescription} numberOfLines={2}>{candidate.description}</Text>
            </View>
            <Text style={styles.categoryArrow}>→</Text>
          </Pressable>
        ))}
      </View>
    </>
  );
}

function PetInformationScreen({
  category,
  pet,
  isFavorite,
  onToggleFavorite,
  onBack,
  onPet,
  favoritePets = [],
  onTogglePetFavorite,
  onCategory,
}: {
  category: PetCategory;
  pet?: Pet;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onBack: () => void;
  onPet?: (pet: Pet) => void;
  favoritePets?: string[];
  onTogglePetFavorite?: (id: string) => void;
  onCategory?: () => void;
}) {
  const item = pet ?? null;
  const categoryDetails = getCategoryDetails(category.id);
  const categoryPets = categoryDetails?.pets ?? [];
  const careTips = categoryDetails?.careTips ?? [];
  const petDetails = item ? getPetDetails(item.id) : undefined;
  const relevantSources = PET_SOURCES.filter((source) => {
    const topic = source.topic.toLocaleLowerCase();
    return topic.includes(category.name.toLocaleLowerCase()) || topic.includes(category.type.toLocaleLowerCase());
  });
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const [typeQuery, setTypeQuery] = useState("");
  const filteredTypes = categoryPets.filter((entry) => {
    const search = typeQuery.trim().toLocaleLowerCase();
    return entry.name.toLocaleLowerCase().includes(search) || entry.type.toLocaleLowerCase().includes(search);
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.detailContent}>
        <Header
          eyebrow={item ? category.name.toUpperCase() : "CATEGORY INFORMATION"}
          title={item ? item.name : category.name}
          onBack={onBack}
          right={(
            <IconButton
              label={isFavorite ? "Remove from favorites" : "Add to favorites"}
              onPress={onToggleFavorite}
              style={[styles.detailHeart, isFavorite && styles.detailHeartOn]}
            >
              <Text style={[styles.detailHeartGlyph, isFavorite && styles.detailHeartGlyphOn]}>{isFavorite ? "♥" : "♡"}</Text>
            </IconButton>
          )}
        />

        <View style={[styles.detailHero, { backgroundColor: `${category.accent}19` }]}>
          <View style={styles.detailHeroShape} />
          <View style={styles.detailLogoWrap}>
            {item ? (
              <SamplePetPicture
                picture={petDetails?.samplePicture ?? category.logo}
                accent={category.accent}
              />
            ) : (
              <CategoryLogo logo={category.logo} accent={category.accent} size={104} />
            )}
          </View>
          <View style={styles.detailHeroCopy}>
            <Text style={styles.detailType}>{item?.type ?? category.type}</Text>
            <Text style={styles.detailSummary}>
              {item ? petDetails?.generalInformation ?? item.description : categoryDetails?.description}
            </Text>
            {item ? (
              onCategory ? (
                <Pressable onPress={onCategory} style={styles.detailInlineLink}>
                  <Text style={styles.detailInlineText}>← View {category.name} category</Text>
                </Pressable>
              ) : null
            ) : (
              <Text style={styles.detailNote}>A quick guide for thoughtful everyday care</Text>
            )}
          </View>
        </View>

        {item ? (
          <BreedPhotoSection
            petName={item.name}
            petType={item.type}
            configuredPicture={petDetails?.samplePicture}
          />
        ) : null}

        {!item ? (
          <>
            <View style={styles.typePickerSection}>
              <View style={styles.typePickerHeading}>
                <View style={styles.typePickerCopy}>
                  <Text style={styles.sectionEyebrow}>FIND A SPECIFIC TYPE</Text>
                  <Text style={styles.sectionTitle}>Quick select</Text>
                </View>
                <Text style={styles.typePickerCount}>{categoryPets.length} TYPES</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: typePickerOpen }}
                accessibilityLabel={`Search and select a ${category.name} type`}
                onPress={() => setTypePickerOpen((open) => !open)}
                style={styles.typePickerButton}
              >
                <View style={styles.typePickerIcon}>
                  <Text style={styles.typePickerIconText}>⌕</Text>
                </View>
                <View style={styles.typePickerButtonCopy}>
                  <Text style={styles.typePickerButtonTitle}>Choose a {category.name.toLowerCase()} type</Text>
                  <Text style={styles.typePickerButtonHint}>Search the list and open its information</Text>
                </View>
                <View style={[styles.typePickerChevron, typePickerOpen && styles.typePickerChevronOpen]} />
              </Pressable>

              {typePickerOpen ? (
                <View style={styles.typePickerDropdown}>
                  <View style={styles.typeSearchBox}>
                    <Text style={styles.typeSearchGlyph}>⌕</Text>
                    <TextInput
                      accessibilityLabel={`Search ${category.name} types`}
                      value={typeQuery}
                      onChangeText={setTypeQuery}
                      placeholder={`Search ${category.name.toLowerCase()} types`}
                      placeholderTextColor="#929990"
                      autoCapitalize="none"
                      returnKeyType="search"
                      style={styles.typeSearchInput}
                    />
                    {typeQuery.length > 0 ? (
                      <IconButton label="Clear type search" onPress={() => setTypeQuery("")} style={styles.clearSearch}>
                        <Text style={styles.clearSearchText}>×</Text>
                      </IconButton>
                    ) : null}
                  </View>
                  {filteredTypes.length > 0 ? filteredTypes.map((entry, index) => (
                    <Pressable
                      key={entry.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${entry.name} information`}
                      onPress={() => {
                        setTypePickerOpen(false);
                        setTypeQuery("");
                        onPet?.(entry);
                      }}
                      style={({ pressed }) => [styles.typeOption, index === filteredTypes.length - 1 && styles.typeOptionLast, pressed && styles.pressed]}
                    >
                      <View style={[styles.typeOptionDot, { backgroundColor: category.accent }]} />
                      <View style={styles.typeOptionCopy}>
                        <Text style={styles.typeOptionName}>{entry.name}</Text>
                        <Text style={styles.typeOptionKind}>{entry.type}</Text>
                      </View>
                      <Text style={styles.typeOptionArrow}>↗</Text>
                    </Pressable>
                  )) : (
                    <View style={styles.typeEmptyState}>
                      <Text style={styles.typeEmptyText}>No matching types. Try another search.</Text>
                    </View>
                  )}
                </View>
              ) : null}
            </View>

            <View style={styles.detailSectionHeading}>
              <View>
                <Text style={styles.sectionEyebrow}>A FEW GENTLE REMINDERS</Text>
                <Text style={styles.sectionTitle}>Care notes</Text>
              </View>
              <Text style={styles.sectionCount}>01 — {String(careTips.length).padStart(2, "0")}</Text>
            </View>
            <View style={styles.careList}>
              {careTips.map((tip, index) => (
                <View key={tip} style={styles.careCard}>
                  <View style={[styles.careNumber, { backgroundColor: `${category.accent}24` }]}>
                    <Text style={[styles.careNumberText, { color: category.accent }]}>
                      {String(index + 1).padStart(2, "0")}
                    </Text>
                  </View>
                  <Text style={styles.careText}>{tip}</Text>
                  <Text style={styles.careMark}>✳</Text>
                </View>
              ))}
            </View>
            <View style={styles.detailSectionHeading}>
              <View>
                <Text style={styles.sectionEyebrow}>GET TO KNOW THEM</Text>
                <Text style={styles.sectionTitle}>In this category</Text>
              </View>
              <Text style={styles.sectionCount}>{String(categoryPets.length).padStart(2, "0")} TYPES</Text>
            </View>
            <View style={styles.categoryPetList}>
              {categoryPets.map((entry, index) => {
                const favorite = favoritePets.includes(entry.id);
                return (
                  <View key={entry.id} style={[styles.categoryPetRow, index === categoryPets.length - 1 && styles.categoryPetRowLast]}>
                    <Pressable onPress={() => onPet?.(entry)} style={styles.categoryPetMain}>
                      <View style={[styles.petNumber, { backgroundColor: `${category.accent}20` }]}>
                        <Text style={[styles.petNumberText, { color: category.accent }]}>
                          {String(index + 1).padStart(2, "0")}
                        </Text>
                      </View>
                      <View style={styles.categoryPetCopy}>
                        <Text style={styles.categoryPetName}>{entry.name}</Text>
                        <Text style={styles.categoryPetDescription} numberOfLines={2}>{entry.description}</Text>
                      </View>
                    </Pressable>
                    {onTogglePetFavorite ? (
                      <IconButton
                        label={`${favorite ? "Remove" : "Add"} ${entry.name} ${favorite ? "from" : "to"} favorites`}
                        onPress={() => onTogglePetFavorite(entry.id)}
                        style={styles.petFavoriteButton}
                      >
                        <Text style={[styles.heart, favorite && styles.heartOn]}>{favorite ? "♥" : "♡"}</Text>
                      </IconButton>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </>
        ) : petDetails ? (
          <>
            <DetailSectionHeader eyebrow="AT A GLANCE" title="General information" />
            <View style={styles.traitsCard}>
              {petDetails.traits.map((trait) => (
                <View key={trait} style={styles.traitRow}>
                  <View style={[styles.traitMark, { backgroundColor: `${category.accent}24` }]}>
                    <Text style={[styles.traitMarkText, { color: category.accent }]}>✦</Text>
                  </View>
                  <Text style={styles.traitText}>{trait}</Text>
                </View>
              ))}
            </View>

            <DetailSectionHeader eyebrow="FOOD & NUTRITION" title="Diet" />
            <View style={styles.dietCard}>
              <Text style={styles.dietSubheading}>What they eat</Text>
              <Text style={styles.dietDescription}>{petDetails.diet.foodsEats}</Text>
              <DietList title="Generally suitable" entries={petDetails.diet.allowed} tone="good" />
              <DietList title="Avoid / potentially dangerous" entries={petDetails.diet.dangerous} tone="avoid" />
            </View>

            <DetailSectionHeader eyebrow="REPRODUCTION" title="Mating & breeding" />
            <View style={styles.matingCard}>
              <View style={styles.matingFact}>
                <Text style={styles.matingLabel}>SEASON</Text>
                <Text style={styles.matingValue}>{petDetails.mating.season}</Text>
              </View>
              <View style={styles.matingDivider} />
              <View style={styles.matingFact}>
                <Text style={styles.matingLabel}>FREQUENCY</Text>
                <Text style={styles.matingValue}>{petDetails.mating.frequency}</Text>
              </View>
              <View style={styles.matingCaution}>
                <Text style={styles.matingCautionIcon}>ⓘ</Text>
                <Text style={styles.matingCautionText}>{petDetails.mating.note}</Text>
              </View>
            </View>

            <DetailSectionHeader eyebrow="LIFE STAGES" title="Age & behavior" />
            <View style={styles.ageStageList}>
              {petDetails.ageBehavior.map((stage, index) => (
                <View key={stage.age} style={styles.ageStageCard}>
                  <View style={[styles.ageStageMarker, { backgroundColor: category.accent }]}>
                    <Text style={styles.ageStageNumber}>{String(index + 1).padStart(2, "0")}</Text>
                  </View>
                  <View style={styles.ageStageCopy}>
                    <Text style={styles.ageStageName}>{stage.age}</Text>
                    {stage.ageRange ? <Text style={styles.ageStageRange}>{stage.ageRange}</Text> : null}
                    <Text style={styles.ageStageDescription}>{stage.behavior}</Text>
                  </View>
                </View>
              ))}
            </View>

            <DetailSectionHeader eyebrow="AN APPROXIMATE GUIDE" title="Pet age vs. human age" />
            <View style={styles.ageTable}>
              <View style={styles.ageTableHeader}>
                <Text style={styles.ageTableHeaderText}>PET AGE</Text>
                <Text style={styles.ageTableHeaderText}>HUMAN AGE COMPARISON</Text>
              </View>
              {petDetails.ageComparison.map((row, index) => (
                <View key={row.petAge} style={[styles.ageTableRow, index % 2 === 1 && styles.ageTableRowAlternate]}>
                  <Text style={styles.ageTablePetAge}>{row.petAge}</Text>
                  <Text style={styles.ageTableHumanAge}>{row.humanAge}</Text>
                </View>
              ))}
            </View>
            {item ? <RelatedGuides category={category} pet={item} onPet={onPet} /> : null}
          </>
        ) : (
          <View style={styles.detailCareNote}>
            <View style={styles.detailCareIcon}><Text style={styles.detailCareEmoji}>✦</Text></View>
            <View style={styles.detailCareCopy}>
              <Text style={styles.detailCareTitle}>More details coming soon</Text>
              <Text style={styles.detailCareDescription}>
                Add a record for this pet in src/data/pet_details.json to show its diet, life stages, and other care details.
              </Text>
            </View>
          </View>
        )}

        <SourceReferences sources={relevantSources} />

        <View style={styles.detailDisclaimer}>
          <Text style={styles.disclaimerPaw}>✳</Text>
          <Text style={styles.disclaimerText}>These general notes are for inspiration and are not a substitute for veterinary advice.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function PetCareApp() {
  const [screen, setScreen] = useState<Screen>("menu");
  const [settingsReturnTo, setSettingsReturnTo] = useState<"menu" | "pets">("menu");
  const [favoriteCategories, setFavoriteCategories] = useState<string[]>(() => CATEGORIES.filter((category) => category.favorite).map((category) => category.id));
  const [favoritePets, setFavoritePets] = useState<string[]>([]);
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);
  const [themeName, setThemeName] = useState<ThemeName>(DEFAULT_SETTINGS.theme);
  const [favoritesOnly, setFavoritesOnly] = useState(DEFAULT_SETTINGS.filters.favoritesOnly);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<DataSource>("cached");
  const [isOffline, setIsOffline] = useState(false);
  const [manifestVersion, setManifestVersion] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(DEFAULT_SETTINGS.autoSyncEnabled);
  const [showCalendar, setShowCalendar] = useState(DEFAULT_SETTINGS.showCalendar);
  const [showCalendarEventListByDefault, setShowCalendarEventListByDefault] = useState(DEFAULT_SETTINGS.showCalendarEventListByDefault);
  const [showPetDirectory, setShowPetDirectory] = useState(DEFAULT_SETTINGS.showPetDirectory);
  const [showExpenses, setShowExpenses] = useState(DEFAULT_SETTINGS.showExpenses);
  const [isStale, setIsStale] = useState(false);
  const [booting, setBooting] = useState(true);
  const [bootStatus, setBootStatus] = useState("Checking resources");
  const [bootProgress, setBootProgress] = useState(10);
  const [bootError, setBootError] = useState<string | undefined>();

  React.useEffect(() => {
    initializeCareNotifications();
    const syncOverdueBadge = () => { void updateOverdueReminderBadge(); };
    syncOverdueBadge();
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") syncOverdueBadge();
    });
    const interval = setInterval(syncOverdueBadge, 60_000);
    return () => {
      subscription.remove();
      clearInterval(interval);
    };
  }, []);

  React.useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (screen === "settings") {
        setScreen(settingsReturnTo);
        return true;
      }
      if (screen === "menu") {
        Alert.alert(
          "Exit PetCare Companion?",
          "Would you like to close the app?",
          [
            { text: "Stay", style: "cancel" },
            { text: "Exit", style: "destructive", onPress: () => BackHandler.exitApp() },
          ],
          { cancelable: true },
        );
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [screen, settingsReturnTo]);

  const bootstrapResources = React.useCallback(async (manualRefresh = false) => {
    setLastCheckedAt(new Date().toISOString());
    setBootStatus("Checking manifest");
    setBootProgress(10);
    setBootError(undefined);
    setIsSyncing(true);
    if (manualRefresh) {
      setRefreshMessage("Checking for new pet data...");
    }

    const result = await refreshRemoteDataBundle({
      force: manualRefresh,
      onStep: (status, progress) => {
        setBootStatus(status);
        setBootProgress(progress);
      },
    });

    setIsSyncing(false);
    setIsOffline(Boolean(result.offline));

    if (result.updatedAt) {
      setLastUpdatedAt(result.updatedAt);
      const staleThreshold = Date.now() - 1000 * 60 * 60 * 24 * 7;
      setIsStale(new Date(result.updatedAt).getTime() < staleThreshold);
    }
    if (typeof result.version === "number") {
      setManifestVersion(result.version);
    }
    if (result.source) {
      setDataSource(result.source);
    }

    if (manualRefresh) {
      if (result.updated) {
        setRefreshMessage("Pet data updated successfully.");
      } else if (result.offline) {
        setRefreshMessage("Using cached pet data. Internet is unavailable.");
      } else {
        setRefreshMessage("Pet data is already up to date.");
      }
      setTimeout(() => setRefreshMessage(null), 3000);
    }

    if (result.noData) {
      setBootStatus("No cached data available");
      setBootProgress(100);
      setBootError("Please connect to the internet to load the latest pet data.");
      setBooting(true);
      return;
    }

    if (result.offline) {
      setBootStatus("Using cached resources");
      setBootProgress(100);
      setTimeout(() => {
        setBooting(false);
      }, 400);
      return;
    }

    if (result.updated) {
      setBootStatus("Loading resources");
      setBootProgress(100);
      setTimeout(() => {
        setBooting(false);
      }, 500);
      return;
    }

    setBootStatus("Resources are up to date");
    setBootProgress(100);
    setTimeout(() => {
      setBooting(false);
    }, 400);
  }, []);

  React.useEffect(() => {
    cleanupExpiredCache();
  }, []);

  React.useEffect(() => {
    bootstrapResources();
  }, [bootstrapResources]);

  React.useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active" && autoSyncEnabled) {
        bootstrapResources(false);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [autoSyncEnabled, bootstrapResources]);

  React.useEffect(() => {
    let active = true;
    AsyncStorage.getItem("petcare-favorites")
      .then((raw) => {
        if (raw) {
          const saved = JSON.parse(raw) as { categories?: string[]; pets?: string[] };
          if (active) {
            setFavoriteCategories(saved.categories ?? CATEGORIES.filter((category) => category.favorite).map((category) => category.id));
            setFavoritePets(saved.pets ?? []);
          }
        }
      })
      .catch(() => {
        // Keep the app usable if saved favorites cannot be read.
      })
      .finally(() => {
        if (active) setFavoritesLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    let active = true;
    AsyncStorage.getItem("petcare-settings")
      .then((raw) => {
        if (!raw) return;
        const saved = JSON.parse(raw) as { theme?: string; filters?: { favoritesOnly?: boolean }; autoSyncEnabled?: boolean; showCalendar?: boolean; showCalendarEventListByDefault?: boolean; showPetDirectory?: boolean; showExpenses?: boolean };
        if (active) {
          if (saved.theme && DEFAULT_SETTINGS.availableThemes.includes(saved.theme as ThemeName)) {
            setThemeName(saved.theme as ThemeName);
          }
          if (typeof saved.filters?.favoritesOnly === "boolean") {
            setFavoritesOnly(saved.filters.favoritesOnly);
          }
          if (typeof saved.autoSyncEnabled === "boolean") {
            setAutoSyncEnabled(saved.autoSyncEnabled);
          }
          if (typeof saved.showCalendar === "boolean") {
            setShowCalendar(saved.showCalendar);
          }
          if (typeof saved.showCalendarEventListByDefault === "boolean") {
            setShowCalendarEventListByDefault(saved.showCalendarEventListByDefault);
          }
          if (typeof saved.showPetDirectory === "boolean") {
            setShowPetDirectory(saved.showPetDirectory);
          }
          if (typeof saved.showExpenses === "boolean") {
            setShowExpenses(saved.showExpenses);
          }
        }
      })
      .catch(() => {
        // Keep the JSON defaults if saved preferences are unavailable or invalid.
      })
      .finally(() => {
        if (active) setSettingsLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    if (!favoritesLoaded) return;
    AsyncStorage.setItem(
      "petcare-favorites",
      JSON.stringify({ categories: favoriteCategories, pets: favoritePets }),
    ).catch(() => {
      // Favorites remain available during the current session if storage is unavailable.
    });
  }, [favoriteCategories, favoritePets, favoritesLoaded]);

  React.useEffect(() => {
    if (!settingsLoaded) return;
    AsyncStorage.setItem(
      "petcare-settings",
      JSON.stringify({ theme: themeName, filters: { favoritesOnly }, autoSyncEnabled, showCalendar, showCalendarEventListByDefault, showPetDirectory, showExpenses }),
    ).catch(() => {
      // The active settings remain usable for this session if persistence fails.
    });
  }, [autoSyncEnabled, favoritesOnly, settingsLoaded, showCalendar, showCalendarEventListByDefault, showPetDirectory, showExpenses, themeName]);

  const toggleFavorite = (id: string, values: string[], setValues: (value: string[]) => void) => {
    setValues(values.includes(id) ? values.filter((value) => value !== id) : [...values, id]);
  };

  const openSettings = (returnTo: "menu" | "pets") => {
    setSettingsReturnTo(returnTo);
    setScreen("settings");
  };
  function restoreDefaultSettings() {
    setThemeName(DEFAULT_SETTINGS.theme);
    setFavoritesOnly(DEFAULT_SETTINGS.filters.favoritesOnly);
    setAutoSyncEnabled(DEFAULT_SETTINGS.autoSyncEnabled);
    setShowCalendar(DEFAULT_SETTINGS.showCalendar);
    setShowCalendarEventListByDefault(DEFAULT_SETTINGS.showCalendarEventListByDefault);
    setShowPetDirectory(DEFAULT_SETTINGS.showPetDirectory);
    setShowExpenses(DEFAULT_SETTINGS.showExpenses);
    void AsyncStorage.setItem(DASHBOARD_LIBRARY_ORDER_KEY, JSON.stringify(["directory", "care", "expenses"])).catch(() => undefined);
  }
  const palette = THEME_PALETTES[themeName];

  if (booting) {
    return (
      <PetCareThemeContext.Provider value={{ name: themeName, palette }}>
        <LoadingScreen
          status={bootStatus}
          progress={bootProgress}
          error={bootError}
          onRetry={bootError ? bootstrapResources : undefined}
        />
      </PetCareThemeContext.Provider>
    );
  }

  return (
    <PetCareThemeContext.Provider value={{ name: themeName, palette }}>
      <View style={[styles.app, { backgroundColor: palette.bg }]}>
        {screen === "menu" ? (
          <MenuScreen
            onOpenPets={() => setScreen("pets")}
            onOpenCare={() => setScreen("care")}
            onOpenReminders={() => setScreen("reminders")}
            onOpenExpenses={() => setScreen("expenses")}
            onOpenSettings={() => openSettings("menu")}
            onRefreshData={() => void bootstrapResources(true)}
            isSyncing={isSyncing}
            isOffline={isOffline}
            isStale={isStale}
            showCalendar={showCalendar}
            showCalendarEventListByDefault={showCalendarEventListByDefault}
            showPetDirectory={showPetDirectory}
            showExpenses={showExpenses}
          />
        ) : screen === "pets" ? (
          <PetsListScreen
            favoriteCategories={favoriteCategories}
            favoritePets={favoritePets}
            favoritesOnly={favoritesOnly}
            onToggleFavoritesOnly={() => setFavoritesOnly((value) => !value)}
            onOpenSettings={() => openSettings("pets")}
            onToggleCategoryFavorite={(id) => toggleFavorite(id, favoriteCategories, setFavoriteCategories)}
            onTogglePetFavorite={(id) => toggleFavorite(id, favoritePets, setFavoritePets)}
            onBack={() => setScreen("menu")}
          />
        ) : screen === "care" || screen === "reminders" ? (
          <CareToolsScreen palette={palette} onBack={() => setScreen("menu")} initialTab={screen === "reminders" ? "reminders" : "pets"} />
        ) : screen === "expenses" ? (
          <ExpensesScreen palette={palette} onBack={() => setScreen("menu")} />
        ) : (
          <SettingsScreen
            themeName={themeName}
            favoritesOnly={favoritesOnly}
            onSelectTheme={setThemeName}
            onToggleFavoritesOnly={() => setFavoritesOnly((value) => !value)}
            onBack={() => setScreen(settingsReturnTo)}
            backToHome={settingsReturnTo === "menu"}
            lastUpdatedAt={lastUpdatedAt}
            lastCheckedAt={lastCheckedAt}
            onRefreshData={() => bootstrapResources(true)}
            syncStatus={refreshMessage}
            dataSource={dataSource}
            version={manifestVersion}
            isSyncing={isSyncing}
            autoSyncEnabled={autoSyncEnabled}
            onToggleAutoSync={() => setAutoSyncEnabled((value) => !value)}
            isStale={isStale}
            showCalendar={showCalendar}
            onToggleShowCalendar={() => setShowCalendar((value) => !value)}
            showCalendarEventListByDefault={showCalendarEventListByDefault}
            onToggleShowCalendarEventListByDefault={() => setShowCalendarEventListByDefault((value) => !value)}
            showPetDirectory={showPetDirectory}
            onToggleShowPetDirectory={() => setShowPetDirectory((value) => !value)}
            showExpenses={showExpenses}
            onToggleShowExpenses={() => setShowExpenses((value) => !value)}
            onRestoreDefaults={restoreDefaultSettings}
          />
        )}
      </View>
    </PetCareThemeContext.Provider>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: CANVAS },
  safeArea: { flex: 1, backgroundColor: CANVAS },
  menuContent: { maxWidth: 980, width: "100%", alignSelf: "center", paddingHorizontal: 30, paddingBottom: 42 },
  topBar: { minHeight: 88, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: LINE },
  brandIcon: { width: 39, height: 39, borderRadius: 15, backgroundColor: "#E8EFE5", alignItems: "center", justifyContent: "center", marginRight: 9 },
  brandPaw: { color: GREEN, fontSize: 25, lineHeight: 30 },
  brandWord: { color: INK, fontSize: 12, fontWeight: "900", letterSpacing: 2.1 },
  brandCompanion: { color: MUTED, fontSize: 9, fontWeight: "700", letterSpacing: 2.2, position: "absolute", left: 49, top: 51 },
  topBarRight: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 8 },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#8CAA7E" },
  todayText: { color: MUTED, fontSize: 9, fontWeight: "800", letterSpacing: 1.3 },
  topSettingsButton: { width: 37, height: 37, borderRadius: 13, marginLeft: 7, backgroundColor: "#E8EFE5" },
  topSettingsGlyph: { color: GREEN, fontSize: 18 },
  refreshDataButton: { alignSelf: "center", backgroundColor: "#E8EFE5", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7, marginLeft: 8 },
  refreshDataText: { color: GREEN, fontSize: 9, fontWeight: "800", letterSpacing: 0.9 },
  updatedBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 12, marginBottom: 4, paddingHorizontal: 2 },
  applicationInfoRows: { gap: 2 },
  updatedLabel: { color: MUTED, fontSize: 9, fontWeight: "700", letterSpacing: 1.1 },
  updatedText: { color: INK, fontSize: 9, fontWeight: "700", textAlign: "right", flexShrink: 1 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 8, marginBottom: 8 },
  metaLabel: { color: MUTED, fontSize: 9, fontWeight: "700", letterSpacing: 0.8 },
  metaValue: { color: INK, fontSize: 9, fontWeight: "800" },
  metaDivider: { color: MUTED, fontSize: 9 },
  syncBanner: { backgroundColor: "#E8EFE5", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginTop: 10 },
  syncBannerText: { color: GREEN, fontSize: 10, fontWeight: "800", letterSpacing: 0.6 },
  homeSyncBanner: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 12, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 12, backgroundColor: "#E8EFE5" },
  homeSyncBannerText: { flex: 1, color: GREEN, fontSize: 10, fontWeight: "700" },
  homeSyncButton: { minHeight: 34, justifyContent: "center", paddingHorizontal: 12, borderRadius: 9, backgroundColor: CARD },
  homeSyncButtonText: { color: GREEN, fontSize: 9, fontWeight: "800" },
  preferenceArrow: { color: GREEN, fontSize: 18, fontWeight: "700" },
  sectionHeader: { marginTop: 24, marginBottom: 17, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  sectionEyebrow: { color: GREEN, fontSize: 9, fontWeight: "800", letterSpacing: 1.7, marginBottom: 7 },
  sectionTitle: { color: INK, fontSize: 22, fontWeight: "700", letterSpacing: -0.5 },
  sectionCount: { color: "#9AA197", fontSize: 9, fontWeight: "800", letterSpacing: 1.2 },
  menuCardPressable: { borderRadius: 18 },
  menuCard: { flexDirection: "row", minHeight: 178, backgroundColor: CARD, borderWidth: 1, borderColor: LINE, borderRadius: 18, overflow: "hidden", position: "relative" },
  menuCardArt: { width: 162, backgroundColor: "#F0E8DE", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  menuCardSun: { width: 100, height: 100, backgroundColor: "#FAF4E8", borderRadius: 55, position: "absolute", top: 20 },
  solidMenuIconCanvas: { width: 92, height: 94, alignItems: "center", justifyContent: "center", marginTop: 8 },
  bookLeftPage: { position: "absolute", left: 8, top: 22, width: 37, height: 53, borderTopLeftRadius: 8, borderBottomLeftRadius: 5, borderTopRightRadius: 13, borderBottomRightRadius: 4, transform: [{ rotate: "-5deg" }] },
  bookRightPage: { position: "absolute", right: 8, top: 22, width: 37, height: 53, borderTopLeftRadius: 13, borderBottomLeftRadius: 4, borderTopRightRadius: 8, borderBottomRightRadius: 5, transform: [{ rotate: "5deg" }] },
  bookSpine: { position: "absolute", top: 25, left: 44, width: 4, height: 49, borderRadius: 3 },
  bookPawMark: { position: "absolute", right: 15, top: 34, width: 30, height: 33 },
  bookPawToe: { position: "absolute", width: 6, height: 9, borderRadius: 4 },
  bookPawToeOne: { left: 2, top: 2, transform: [{ rotate: "-18deg" }] },
  bookPawToeTwo: { left: 10, top: 0 },
  bookPawToeThree: { left: 18, top: 2, transform: [{ rotate: "18deg" }] },
  bookPawToeFour: { left: 24, top: 7, width: 5, height: 7 },
  bookPawPad: { position: "absolute", left: 7, top: 12, width: 18, height: 16, borderRadius: 9 },
  menuPawToe: { position: "absolute", width: 17, height: 22, borderRadius: 10 },
  menuPawToeOne: { left: 13, top: 20, transform: [{ rotate: "-18deg" }] },
  menuPawToeTwo: { left: 32, top: 11 },
  menuPawToeThree: { right: 22, top: 16, transform: [{ rotate: "18deg" }] },
  menuPawToeFour: { right: 9, top: 32, width: 14, height: 18, transform: [{ rotate: "28deg" }] },
  menuPawPad: { position: "absolute", left: 20, top: 39, width: 53, height: 42, borderRadius: 28, transform: [{ rotate: "-5deg" }] },
  walletBack: { position: "absolute", top: 25, left: 17, width: 60, height: 43, borderRadius: 9, transform: [{ rotate: "-7deg" }] },
  walletBody: { position: "absolute", top: 34, left: 10, width: 72, height: 43, borderRadius: 9, justifyContent: "center", paddingLeft: 43 },
  walletFlap: { position: "absolute", left: 0, top: 8, width: 72, height: 27, borderTopWidth: 2, borderBottomWidth: 2, borderRadius: 5 },
  walletSnap: { width: 8, height: 8, borderRadius: 5, zIndex: 1 },
  menuCardSparkle: { width: 25, height: 25, borderRadius: 13, backgroundColor: "#78917C", position: "absolute", top: 24, right: 25, alignItems: "center", justifyContent: "center" },
  menuCardSparkleText: { color: "#FFFFFF", fontSize: 14 },
  menuCardCopy: { flex: 1, justifyContent: "center", paddingHorizontal: 25, paddingVertical: 21 },
  cardTag: { alignSelf: "flex-start", backgroundColor: "#EFF3EC", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5 },
  cardTagText: { color: GREEN, fontSize: 8, fontWeight: "800", letterSpacing: 1 },
  menuCardTitle: { color: INK, fontSize: 21, fontWeight: "700", marginTop: 10 },
  menuCardDescription: { color: MUTED, fontSize: 11, lineHeight: 17, marginTop: 5, maxWidth: 400 },
  menuCardAction: { color: GREEN, fontSize: 10, fontWeight: "800", marginTop: 14 },
  menuCardArrow: { fontSize: 14 },
  menuCardNumber: { color: "#D5D8CF", fontSize: 10, fontWeight: "800", position: "absolute", top: 15, right: 17, letterSpacing: 1 },
  menuCardDragHint: { color: "#9AA197", fontSize: 18, fontWeight: "800", position: "absolute", bottom: 9, right: 12, lineHeight: 20 },
  myPetsMenuCardNumber: { top: 37 },
  myPetsOverdueBadge: { position: "absolute", top: 7, right: 7, minWidth: 19, height: 19, alignItems: "center", justifyContent: "center", borderRadius: 10, paddingHorizontal: 5, backgroundColor: "#D94B4B" },
  myPetsOverdueBadgeText: { color: "#FFFFFF", fontSize: 8, fontWeight: "900", lineHeight: 10 },
  comingSoon: { flexDirection: "row", alignItems: "center", marginTop: 12, paddingHorizontal: 15, paddingVertical: 13, borderRadius: 14, borderWidth: 1, borderColor: "#E8E9E2", borderStyle: "dashed" },
  myPetsMenuCard: { marginTop: 12 },
  myPetsMenuArt: { backgroundColor: "#E8EFE5" },
  expensesMenuCard: { marginTop: 12 },
  expensesMenuArt: { backgroundColor: "#F0E8DE" },
  expensesMenuSymbol: { color: GREEN, fontSize: 82, lineHeight: 96, fontWeight: "800", marginTop: 6 },
  homeCalendarSection: { marginTop: 30 },
  homeRemindersHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 11 },
  homeRemindersLink: { paddingHorizontal: 4, paddingVertical: 7 },
  homeRemindersLinkText: { color: GREEN, fontSize: 9, fontWeight: "800" },
  homeCalendarCard: { backgroundColor: CARD, borderWidth: 1, borderColor: LINE, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  homeCalendarMonthRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  homeCalendarArrow: { width: 30, height: 30, borderRadius: 10, backgroundColor: "#E8EFE5", alignItems: "center", justifyContent: "center" },
  homeCalendarArrowText: { color: GREEN, fontSize: 20, fontWeight: "700" },
  homeCalendarMonth: { color: GREEN, fontSize: 10, fontWeight: "800", letterSpacing: 1.2, flex: 1, textAlign: "center" },
  homeCalendarGrid: { flexDirection: "row", flexWrap: "wrap" },
  homeCalendarWeekday: { width: "14.2857%", textAlign: "center", color: MUTED, fontSize: 8, fontWeight: "800", paddingVertical: 4 },
  homeCalendarDayCell: { width: "14.2857%", height: 38, alignItems: "center", justifyContent: "center", borderRadius: 10, gap: 3 },
  homeCalendarDaySelected: { backgroundColor: "#E8EFE5", borderWidth: 1, borderColor: GREEN },
  homeCalendarDayToday: { borderWidth: 1, borderColor: GREEN },
  homeCalendarDayNumber: { color: INK, fontSize: 9, fontWeight: "700" },
  homeCalendarDayNumberSelected: { color: GREEN },
  homeCalendarEventDots: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 2 },
  homeCalendarEventDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: GREEN },
  homeCalendarLegend: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 2 },
  homeCalendarSelectedDayHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 4 },
  homeCalendarSelectedDate: { color: INK, fontSize: 11, fontWeight: "800", flex: 1 },
  homeCalendarSelectedCount: { color: MUTED, fontSize: 8, fontWeight: "800" },
  homeCalendarStatusCounts: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 5 },
  homeCalendarSelectedDayControls: { flexDirection: "row", alignItems: "center", gap: 6 },
  homeCalendarTotalCountBadge: { backgroundColor: "#E8EFE5", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  homeCalendarListToggle: { minHeight: 27, justifyContent: "center", backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: GREEN, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  homeCalendarListToggleText: { color: GREEN, fontSize: 8, fontWeight: "800" },
  homeCalendarStatusFilter: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  homeCalendarStatusCount: { fontSize: 8, fontWeight: "800" },
  homeCalendarListScroll: { width: "100%", marginTop: 4 },
  homeCalendarList: { gap: 8, paddingBottom: 2 },
  homeCalendarItem: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#D4DDD0", borderLeftWidth: 4, borderRadius: 11, paddingHorizontal: 10, paddingVertical: 8 },
  homeCalendarPetIdentity: { position: "relative", alignSelf: "flex-start" },
  homeCalendarPetAvatar: { width: 34, height: 34, borderRadius: 11 },
  homeCalendarEventIcon: { width: 28, height: 28, borderRadius: 9, backgroundColor: "#E8EFE5", alignItems: "center", justifyContent: "center" },
  homeCalendarEventIconOverlay: { position: "absolute", top: -4, right: -4, width: 18, height: 18, borderRadius: 7, borderWidth: 2, borderColor: "#FFFFFF" },
  homeReminderCopy: { flex: 1, gap: 4 },
  homeCalendarEventActions: { alignItems: "flex-end", gap: 5, marginLeft: 4, alignSelf: "flex-start" },
  homeCalendarEventAction: { minHeight: 27, justifyContent: "center", borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  homeCalendarDoneAction: { backgroundColor: "#E8EFE5" },
  homeCalendarDoneActionText: { color: GREEN, fontSize: 8, fontWeight: "800" },
  homeCalendarSnoozeAction: { backgroundColor: "#E8EFE5" },
  homeCalendarSnoozeActionText: { color: GREEN, fontSize: 8, fontWeight: "800" },
  homeReminderTitle: { color: INK, fontSize: 10, fontWeight: "800" },
  homeReminderPet: { color: MUTED, fontSize: 8, fontWeight: "600" },
  homeReminderDateTime: { color: MUTED, fontSize: 8, fontWeight: "700" },
  homeReminderCompletedBadge: { alignSelf: "flex-start", backgroundColor: "#E8EFE5", borderRadius: 7, paddingHorizontal: 7, paddingVertical: 3 },
  homeReminderCompletedText: { color: GREEN, fontSize: 7, fontWeight: "800" },
  homeReminderDate: { color: GREEN, fontSize: 8, fontWeight: "800", textAlign: "right", maxWidth: 112 },
  homeReminderOverdueBadge: { alignSelf: "flex-start", maxWidth: "100%", backgroundColor: "#A61B1B", borderRadius: 7, paddingHorizontal: 7, paddingVertical: 4 },
  homeReminderEmpty: { minHeight: 54, justifyContent: "center", backgroundColor: CARD, borderWidth: 1, borderColor: LINE, borderStyle: "dashed", borderRadius: 13, paddingHorizontal: 14, paddingVertical: 11 },
  homeReminderEmptyText: { color: MUTED, fontSize: 9, lineHeight: 14 },
  comingSoonIcon: { width: 32, height: 32, borderRadius: 11, backgroundColor: "#EEF0E9", alignItems: "center", justifyContent: "center", marginRight: 11 },
  comingSoonGlyph: { color: GREEN, fontSize: 20 },
  comingSoonCopy: { flex: 1 },
  comingSoonTitle: { color: "#68746A", fontSize: 10, fontWeight: "700" },
  comingSoonDescription: { color: "#9AA197", fontSize: 9, marginTop: 3 },
  comingSoonTag: { color: "#97A08F", fontSize: 8, fontWeight: "800", letterSpacing: 1 },
  menuFooter: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 10, marginTop: 33 },
  footerPaw: { color: "#9DAA95", fontSize: 13 },
  footerText: { color: "#9AA197", fontSize: 8, fontWeight: "800", letterSpacing: 1.5 },

  listContent: { maxWidth: 900, width: "100%", alignSelf: "center", paddingHorizontal: 26, paddingBottom: 42 },
  categoryScreenContent: { flexGrow: 1, height: "100%" },
  header: { flexDirection: "row", alignItems: "center", minHeight: 89, borderBottomWidth: 1, borderBottomColor: LINE, gap: 14 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerSettingsButton: { width: 38, height: 38, borderRadius: 13, backgroundColor: "#E8EFE5" },
  headerSettingsGlyph: { color: GREEN, fontSize: 18 },
  backButton: { width: 40, height: 40, borderRadius: 14, backgroundColor: "#E9EDE5", justifyContent: "center", alignItems: "center" },
  backArrow: { color: GREEN, fontSize: 31, lineHeight: 34, marginTop: -4 },
  headerCopy: { flex: 1 },
  eyebrow: { color: GREEN, fontSize: 8, fontWeight: "800", letterSpacing: 1.55, marginBottom: 5 },
  headerTitle: { color: INK, fontSize: 25, fontWeight: "700", letterSpacing: -0.6 },
  listCounter: { width: 42, height: 42, borderRadius: 15, backgroundColor: "#E8EFE5", justifyContent: "center", alignItems: "center" },
  listCounterText: { color: GREEN, fontSize: 14, fontWeight: "800" },
  listIntro: { marginTop: 25, marginBottom: 17 },
  listIntroTitle: { color: INK, fontSize: 21, lineHeight: 27, fontWeight: "700", letterSpacing: -0.4 },
  listIntroDescription: { color: MUTED, fontSize: 11, lineHeight: 17, marginTop: 6, maxWidth: 480 },
  searchContainer: { flexDirection: "row", alignItems: "center", height: 48, backgroundColor: CARD, borderRadius: 13, borderWidth: 1, borderColor: LINE, paddingHorizontal: 14 },
  searchGlyph: { color: GREEN, fontSize: 25, lineHeight: 30, marginRight: 9 },
  searchInput: { flex: 1, paddingVertical: 10, color: INK, fontSize: 14, outlineStyle: "none" } as object,
  clearSearch: { width: 28, height: 28, backgroundColor: "#F0F2ED" },
  clearSearchText: { color: MUTED, fontSize: 17, lineHeight: 19 },
  searchBreedMatches: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 7, paddingBottom: 11, paddingHorizontal: 2 },
  searchBreedMatch: { backgroundColor: "#EEF1EA", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  searchBreedMatchText: { color: GREEN, fontSize: 9, fontWeight: "700" },
  searchBreedMore: { color: MUTED, fontSize: 8, fontWeight: "700" },
  filterRow: { marginTop: 13, backgroundColor: "#EEF1EA", borderRadius: 14, paddingHorizontal: 15, paddingVertical: 11, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  filterLabelWrap: { gap: 2 },
  filterEyebrow: { color: GREEN, fontSize: 8, fontWeight: "800", letterSpacing: 1.1 },
  filterTitle: { color: INK, fontSize: 11, fontWeight: "700" },
  toggleTrack: { width: 42, height: 24, borderRadius: 13, backgroundColor: "#D1D6CC", padding: 3, justifyContent: "center" },
  toggleTrackOn: { backgroundColor: GREEN },
  toggleThumb: { width: 18, height: 18, borderRadius: 10, backgroundColor: CARD, shadowColor: "#000000", shadowOpacity: 0.12, shadowRadius: 4, elevation: 2 },
  toggleThumbOn: { alignSelf: "flex-end" },
  resultsHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 27, marginBottom: 11 },
  resultsTitle: { color: INK, fontSize: 9, fontWeight: "800", letterSpacing: 1.25 },
  resultsCount: { color: MUTED, fontSize: 8, fontWeight: "700", letterSpacing: 0.7 },
  categoryListCard: { flex: 1, minHeight: 0, backgroundColor: CARD, borderWidth: 1, borderColor: LINE, borderRadius: 16, padding: 10, overflow: "hidden" },
  categoryListScroll: { flex: 1, minHeight: 0, width: "100%" },
  categoryList: { gap: 7, paddingBottom: 2 },
  categoryCard: { backgroundColor: CARD, borderWidth: 1, borderColor: LINE, borderRadius: 13, paddingHorizontal: 11, overflow: "hidden", position: "relative" },
  categoryMain: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 0, paddingRight: 28 },
  emojiLogo: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
  emojiLogoInner: { alignItems: "center", justifyContent: "center" },
  categoryCopy: { flex: 1, paddingVertical: 7 },
  categoryName: { color: INK, fontSize: 15, fontWeight: "700", letterSpacing: -0.2 },
  categoryMeta: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 2 },
  categoryType: { color: GREEN, fontSize: 9, fontWeight: "700" },
  metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: "#ABB3A7" },
  categoryPetCount: { color: MUTED, fontSize: 9 },
  categoryPreview: { color: "#899188", fontSize: 9, marginTop: 7, maxWidth: 365 },
  categoryArrow: { color: GREEN, fontSize: 20, paddingHorizontal: 4 },
  categoryBottom: { position: "absolute", right: 11, bottom: 5, flexDirection: "row", justifyContent: "flex-end", alignItems: "center", height: 19 },
  categoryHint: { color: "#9AA197", fontSize: 7, fontWeight: "800", letterSpacing: 1.1 },
  iconButton: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#F1F3EF" },
  favoriteButton: { width: 30, height: 30, borderRadius: 10, backgroundColor: "transparent" },
  favoriteButtonOn: { backgroundColor: "#FCEDEA" },
  categoryFavoriteTop: { position: "absolute", top: 7, right: 8, zIndex: 2, width: 32, height: 32, borderRadius: 11, backgroundColor: CARD },
  heart: { color: "#8E988D", fontSize: 18, lineHeight: 21 },
  heartOn: { color: "#D87967" },
  petMiniList: { borderTopWidth: 1, borderTopColor: "#F0F0EA", paddingVertical: 4 },
  petMiniRow: { minHeight: 45, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#F4F3EE" },
  petMiniInfo: { flex: 1, minHeight: 44, flexDirection: "row", alignItems: "center", gap: 9 },
  petMiniDot: { width: 7, height: 7, borderRadius: 4, marginLeft: 4 },
  petMiniCopy: { flex: 1 },
  petMiniName: { color: INK, fontSize: 10, fontWeight: "700" },
  petMiniType: { color: MUTED, fontSize: 8, marginTop: 3 },
  petMiniArrow: { color: "#A8AEA5", fontSize: 13, paddingHorizontal: 8 },
  petFavoriteButton: { width: 32, height: 32, backgroundColor: "transparent" },
  emptyState: { backgroundColor: CARD, borderWidth: 1, borderColor: LINE, borderRadius: 17, paddingHorizontal: 23, paddingVertical: 32, alignItems: "center", marginTop: 8 },
  emptyEmoji: { fontSize: 35, marginBottom: 8 },
  emptyTitle: { color: INK, fontSize: 15, fontWeight: "700" },
  emptyDescription: { color: MUTED, fontSize: 10, lineHeight: 16, marginTop: 5, textAlign: "center", maxWidth: 290 },
  emptyButton: { backgroundColor: GREEN, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, marginTop: 14 },
  emptyButtonText: { color: "#FFFFFF", fontSize: 9, fontWeight: "800" },
  listFooter: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 9, marginTop: 28 },

  settingsContent: { width: "100%", maxWidth: 900, alignSelf: "center", paddingHorizontal: 26, paddingBottom: 46 },
  settingsIntro: { marginTop: 24, marginBottom: 4 },
  settingsGroupCard: { marginTop: 16, borderWidth: 1, borderRadius: 17, padding: 15, gap: 13 },
  settingsSectionHeading: { marginTop: 0, marginBottom: 0, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  themeGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8 },
  themeOption: { width: "31%", minHeight: 66, flexBasis: "31%", backgroundColor: CARD, borderWidth: 1, borderColor: LINE, borderRadius: 13, paddingHorizontal: 9, paddingVertical: 9, gap: 7 },
  themeOptionSelected: { borderColor: GREEN, borderWidth: 2 },
  themeSwatches: { width: "100%", height: 21, flexDirection: "row", gap: 3 },
  themeSwatch: { flex: 1, height: 21, borderRadius: 6, borderWidth: 1 },
  themeOptionCopy: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 4 },
  themeOptionName: { color: INK, fontSize: 10, fontWeight: "800" },
  themeRadio: { width: 15, height: 15, borderRadius: 8, borderWidth: 1.5, borderColor: "#C9D0C7", alignItems: "center", justifyContent: "center" },
  themeRadioSelected: { borderColor: GREEN },
  themeRadioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: GREEN },
  settingsPreferenceRow: { minHeight: 70, flexDirection: "row", alignItems: "center", gap: 11 },
  nestedSettingsPreferenceRow: { minHeight: 62, borderTopWidth: StyleSheet.hairlineWidth, marginLeft: 47, paddingTop: 7 },
  preferenceIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: "#FCEDEA", alignItems: "center", justifyContent: "center" },
  calendarListPreferenceIcon: { backgroundColor: "#E8EFE5" },
  directoryPreferenceIcon: { backgroundColor: "#E8EFE5" },
  favoritesPreferenceIcon: { backgroundColor: "#FCEDEA" },
  expensesPreferenceIcon: { backgroundColor: "#F0E8DE" },
  preferenceIconText: { color: "#D87967", fontSize: 18 },
  preferenceCopy: { flex: 1, gap: 4 },
  preferenceTitle: { color: INK, fontSize: 10, fontWeight: "800" },
  preferenceDescription: { color: MUTED, fontSize: 8, lineHeight: 13 },
  expenseSettingsContent: { gap: 9 },
  expenseCurrencyOptions: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 2 },
  expenseCurrencyOption: { minHeight: 34, justifyContent: "center", borderWidth: 1, borderColor: LINE, borderRadius: 10, backgroundColor: CARD, paddingHorizontal: 10, paddingVertical: 7 },
  expenseCurrencyOptionSelected: { borderColor: GREEN, backgroundColor: "#E8EFE5" },
  expenseCurrencyOptionText: { color: MUTED, fontSize: 8, fontWeight: "700" },
  expenseCurrencyOptionTextSelected: { color: GREEN, fontWeight: "800" },
  restoreDefaultsButton: { minHeight: 42, alignItems: "center", justifyContent: "center", borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  restoreDefaultsText: { fontSize: 9, fontWeight: "800" },
  settingsInfoRow: { minHeight: 30, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingVertical: 5, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: LINE },
  settingsSavedNote: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 19 },
  settingsSavedIcon: { color: GREEN, fontSize: 12, fontWeight: "800" },
  settingsSavedText: { color: MUTED, fontSize: 8 },

  detailContent: { width: "100%", maxWidth: 900, alignSelf: "center", paddingHorizontal: 26, paddingBottom: 40 },
  detailHeart: { width: 40, height: 40, borderRadius: 14 },
  detailHeartOn: { backgroundColor: "#FCEDEA" },
  detailHeartGlyph: { color: "#8E988D", fontSize: 21, lineHeight: 24 },
  detailHeartGlyphOn: { color: "#D87967" },
  detailHero: { minHeight: 185, borderRadius: 17, marginTop: 24, flexDirection: "row", alignItems: "center", padding: 22, overflow: "hidden" },
  detailHeroShape: { position: "absolute", width: 210, height: 210, borderRadius: 110, backgroundColor: "#FFFFFF80", right: -70, top: -100 },
  detailLogoWrap: { marginRight: 21 },
  samplePictureFrame: { width: 104, height: 104, borderRadius: 28, alignItems: "center", justifyContent: "center", overflow: "hidden", borderWidth: 1, borderColor: "#FFFFFFAA" },
  samplePictureImage: { width: "100%", height: "100%" },
  samplePictureEmoji: { fontSize: 58 },
  samplePictureCredit: { color: MUTED, fontSize: 9, lineHeight: 14, marginTop: 6 },
  detailHeroCopy: { flex: 1 },
  breedPhotoSection: { marginTop: 22, alignItems: "flex-start" },
  breedPhotoFrame: { width: "100%", height: 240, borderRadius: 16, overflow: "hidden", backgroundColor: "#E9EDE5", borderWidth: 1, borderColor: LINE },
  breedPhotoImage: { width: "100%", height: "100%" },
  detailType: { color: GREEN, fontSize: 9, fontWeight: "800", letterSpacing: 1.2, textTransform: "uppercase" },
  detailSummary: { color: INK, fontSize: 12, lineHeight: 19, marginTop: 8 },
  detailNote: { color: MUTED, fontSize: 9, marginTop: 9, fontStyle: "italic" },
  detailInlineLink: { alignSelf: "flex-start", marginTop: 10, paddingVertical: 5 },
  detailInlineText: { color: GREEN, fontSize: 9, fontWeight: "800" },
  typePickerSection: { marginTop: 26 },
  typePickerHeading: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 12 },
  typePickerCopy: { gap: 4 },
  typePickerCount: { color: MUTED, fontSize: 8, fontWeight: "700", letterSpacing: 0.8 },
  typePickerButton: { minHeight: 67, flexDirection: "row", alignItems: "center", backgroundColor: CARD, borderWidth: 1, borderColor: LINE, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 10 },
  typePickerIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: "#E9EFE6", alignItems: "center", justifyContent: "center", marginRight: 11 },
  typePickerIconText: { color: GREEN, fontSize: 23, lineHeight: 26 },
  typePickerButtonCopy: { flex: 1, gap: 4 },
  typePickerButtonTitle: { color: INK, fontSize: 10, fontWeight: "700" },
  typePickerButtonHint: { color: MUTED, fontSize: 8 },
  typePickerChevron: { width: 9, height: 9, borderRightWidth: 2, borderBottomWidth: 2, borderColor: GREEN, marginLeft: 9, marginRight: 5, marginTop: -5, transform: [{ rotate: "45deg" }] },
  typePickerChevronOpen: { transform: [{ rotate: "225deg" }] },
  typePickerDropdown: { backgroundColor: CARD, borderWidth: 1, borderColor: LINE, borderRadius: 14, marginTop: 8, paddingHorizontal: 11, paddingTop: 11, paddingBottom: 4 },
  typeSearchBox: { minHeight: 42, flexDirection: "row", alignItems: "center", backgroundColor: "#F7F8F5", borderWidth: 1, borderColor: "#ECEEE8", borderRadius: 11, paddingHorizontal: 10, marginBottom: 5 },
  typeSearchGlyph: { color: GREEN, fontSize: 21, lineHeight: 25, marginRight: 8 },
  typeSearchInput: { flex: 1, minHeight: 40, paddingVertical: 7, color: INK, fontSize: 12, outlineStyle: "none" } as object,
  typeOption: { minHeight: 51, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#F0F0EA", paddingHorizontal: 4 },
  typeOptionLast: { borderBottomWidth: 0 },
  typeOptionDot: { width: 7, height: 7, borderRadius: 4, marginRight: 10 },
  typeOptionCopy: { flex: 1, gap: 3 },
  typeOptionName: { color: INK, fontSize: 10, fontWeight: "700" },
  typeOptionKind: { color: MUTED, fontSize: 8 },
  typeOptionArrow: { color: GREEN, fontSize: 16, paddingHorizontal: 7 },
  typeEmptyState: { paddingVertical: 18, alignItems: "center" },
  typeEmptyText: { color: MUTED, fontSize: 9 },
  detailSectionHeading: { marginTop: 30, marginBottom: 13, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  traitsCard: { backgroundColor: CARD, borderWidth: 1, borderColor: LINE, borderRadius: 15, paddingHorizontal: 14, paddingVertical: 4 },
  traitRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 51 },
  traitMark: { width: 27, height: 27, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  traitMarkText: { fontSize: 14 },
  traitText: { flex: 1, color: "#59665C", fontSize: 10, lineHeight: 16 },
  dietCard: { backgroundColor: CARD, borderWidth: 1, borderColor: LINE, borderRadius: 15, padding: 15 },
  dietSubheading: { color: INK, fontSize: 11, fontWeight: "800" },
  dietDescription: { color: "#68746A", fontSize: 10, lineHeight: 16, marginTop: 5 },
  dietListSection: { marginTop: 12, borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 11 },
  dietListGood: { backgroundColor: CARD, borderColor: "#86A879" },
  dietListAvoid: { backgroundColor: CARD, borderColor: "#D58C82" },
  dietListTitle: { color: "#315B37", fontSize: 10, fontWeight: "800", marginBottom: 5 },
  dietListTitleAvoid: { color: "#8F352C" },
  dietListRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 5 },
  dietBullet: { width: 17, height: 17, borderRadius: 6, backgroundColor: "#EAF1E8", alignItems: "center", justifyContent: "center", marginTop: 1 },
  dietBulletAvoid: { backgroundColor: "#F9ECE8" },
  dietBulletText: { color: GREEN, fontSize: 10, fontWeight: "800" },
  dietBulletTextAvoid: { color: "#C46C5C" },
  dietListText: { flex: 1, color: "#68746A", fontSize: 9, lineHeight: 15 },
  matingCard: { backgroundColor: CARD, borderWidth: 1, borderColor: LINE, borderRadius: 15, padding: 15 },
  matingFact: { paddingVertical: 3 },
  matingLabel: { color: GREEN, fontSize: 8, fontWeight: "800", letterSpacing: 1.1 },
  matingValue: { color: "#59665C", fontSize: 10, lineHeight: 16, marginTop: 5 },
  matingDivider: { height: 1, backgroundColor: "#F0F0EA", marginVertical: 12 },
  matingCaution: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "#F5F2E8", padding: 10, borderRadius: 10, marginTop: 13 },
  matingCautionIcon: { color: "#9A8050", fontSize: 13, fontWeight: "800" },
  matingCautionText: { flex: 1, color: "#77694C", fontSize: 9, lineHeight: 15 },
  ageStageList: { gap: 8 },
  ageStageCard: { flexDirection: "row", alignItems: "flex-start", gap: 11, backgroundColor: CARD, borderWidth: 1, borderColor: LINE, borderRadius: 14, padding: 12 },
  ageStageMarker: { width: 31, height: 31, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  ageStageNumber: { color: "#FFFFFF", fontSize: 9, fontWeight: "800" },
  ageStageCopy: { flex: 1, gap: 4, paddingTop: 1 },
  ageStageName: { color: INK, fontSize: 10, fontWeight: "800" },
  ageStageRange: { color: GREEN, fontSize: 8, fontWeight: "700" },
  ageStageDescription: { color: MUTED, fontSize: 9, lineHeight: 15 },
  ageTable: { backgroundColor: CARD, borderWidth: 1, borderColor: LINE, borderRadius: 14, overflow: "hidden" },
  ageTableHeader: { minHeight: 38, flexDirection: "row", alignItems: "center", backgroundColor: "#EEF1EA", paddingHorizontal: 13, gap: 10 },
  ageTableHeaderText: { flex: 1, color: GREEN, fontSize: 8, fontWeight: "800", letterSpacing: 0.7 },
  ageTableRow: { minHeight: 43, flexDirection: "row", alignItems: "center", paddingHorizontal: 13, gap: 10, borderTopWidth: 1, borderTopColor: "#F0F0EA" },
  ageTableRowAlternate: { backgroundColor: "#FBFCF9" },
  ageTablePetAge: { flex: 0.75, color: INK, fontSize: 9, fontWeight: "700" },
  ageTableHumanAge: { flex: 1.5, color: MUTED, fontSize: 9, lineHeight: 14 },
  careList: { gap: 8 },
  careCard: { flexDirection: "row", alignItems: "center", minHeight: 66, backgroundColor: CARD, borderWidth: 1, borderColor: LINE, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 11 },
  careNumber: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center", marginRight: 12 },
  careNumberText: { fontSize: 10, fontWeight: "800" },
  careText: { flex: 1, color: "#59665C", fontSize: 10, lineHeight: 16 },
  careMark: { color: "#A9B59F", fontSize: 13, marginLeft: 8 },
  categoryPetList: { backgroundColor: CARD, borderWidth: 1, borderBottomWidth: 0, borderColor: LINE, borderRadius: 15, paddingHorizontal: 13 },
  categoryPetRow: { minHeight: 56, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#F0F0EA" },
  categoryPetRowLast: { borderBottomWidth: 0 },
  categoryPetMain: { flex: 1, minHeight: 54, flexDirection: "row", alignItems: "center" },
  petNumber: { width: 32, height: 32, borderRadius: 10, justifyContent: "center", alignItems: "center", marginRight: 12 },
  petNumberText: { fontSize: 9, fontWeight: "800" },
  categoryPetCopy: { flex: 1, paddingRight: 7 },
  categoryPetName: { color: INK, fontSize: 11, fontWeight: "700" },
  categoryPetDescription: { color: MUTED, fontSize: 9, lineHeight: 14, marginTop: 3 },
  detailCareNote: { flexDirection: "row", alignItems: "flex-start", backgroundColor: "#EDF1E9", borderRadius: 14, padding: 15, marginTop: 23 },
  detailCareIcon: { width: 31, height: 31, borderRadius: 11, backgroundColor: CARD, alignItems: "center", justifyContent: "center", marginRight: 11 },
  detailCareEmoji: { color: GREEN, fontSize: 17 },
  detailCareCopy: { flex: 1 },
  detailCareTitle: { color: INK, fontSize: 10, fontWeight: "800" },
  detailCareDescription: { color: "#68746A", fontSize: 9, lineHeight: 15, marginTop: 4 },
  detailDisclaimer: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 25, paddingHorizontal: 2 },
  disclaimerPaw: { color: GREEN, fontSize: 14 },
  disclaimerText: { flex: 1, color: "#9AA197", fontSize: 8, lineHeight: 13 },
  sourceSection: { marginTop: 4 },
  sourceCard: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: CARD, borderWidth: 1, borderColor: LINE, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 11, marginBottom: 7 },
  sourceCardCopy: { flex: 1, gap: 4 },
  sourceTopic: { color: GREEN, fontSize: 8, fontWeight: "800", letterSpacing: 0.5 },
  sourceName: { color: INK, fontSize: 9, fontWeight: "700", lineHeight: 14 },
  sourceReviewed: { color: MUTED, fontSize: 8, lineHeight: 13 },
  sourceArrow: { color: GREEN, fontSize: 16, fontWeight: "700" },
  sourceNote: { color: MUTED, fontSize: 8, lineHeight: 13, marginTop: 3 },
  relatedGuides: { gap: 7 },
  relatedGuide: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: CARD, borderWidth: 1, borderColor: LINE, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 10 },
  relatedGuideCopy: { flex: 1, gap: 3 },
  relatedGuideName: { color: INK, fontSize: 10, fontWeight: "800" },
  relatedGuideDescription: { color: MUTED, fontSize: 8, lineHeight: 13 },
  loadingCard: {
    width: "90%",
    maxWidth: 420,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E9E8E1",
    borderRadius: 22,
    paddingHorizontal: 24,
    paddingVertical: 24,
    shadowColor: "#000000",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  loadingTitle: { color: INK, fontSize: 26, fontWeight: "700", letterSpacing: -0.6 },
  loadingStatus: { color: MUTED, fontSize: 12, marginTop: 10, marginBottom: 16 },
  progressTrack: { width: "100%", height: 12, borderRadius: 999, backgroundColor: "#EDF1EA", overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 999, backgroundColor: GREEN },
  progressText: { color: GREEN, fontSize: 12, fontWeight: "800", marginTop: 10 },
  loadingError: { color: "#C66F5B", fontSize: 11, lineHeight: 16, marginTop: 12 },
  loadingRetryButton: {
    marginTop: 18,
    alignSelf: "center",
    backgroundColor: GREEN,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
    minWidth: 116,
    alignItems: "center",
  },
  loadingRetryText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800", letterSpacing: 0.35 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
});
