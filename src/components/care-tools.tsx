import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import Constants, { AppOwnership } from "expo-constants";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Alert,
  BackHandler,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text as NativeText,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import DraggableFlatList, { ScaleDecorator } from "react-native-draggable-flatlist";
import { nextRecurringDueDate } from "@/utils/care-reminders";
import { REMINDER_REPEAT_COLORS } from "@/utils/care-calendar";
import { ActionIcon, HomeIcon } from "@/components/action-icon";
import { CARE_TAB_ITEMS, type CareTab } from "./care-tabs";

function Text({ style, ...props }: React.ComponentProps<typeof NativeText>) {
  const flattenedStyle = StyleSheet.flatten(style);
  const readableStyle = flattenedStyle ? {
    ...flattenedStyle,
    ...(typeof flattenedStyle.fontSize === "number" ? { fontSize: Math.round(flattenedStyle.fontSize * 1.15) } : {}),
    ...(typeof flattenedStyle.lineHeight === "number" ? { lineHeight: Math.round(flattenedStyle.lineHeight * 1.12) } : {}),
  } : flattenedStyle;
  return <NativeText {...props} style={readableStyle} />;
}

type CarePalette = {
  bg: string;
  card: string;
  text: string;
  muted: string;
  line: string;
  primary: string;
  action: string;
  soft: string;
};

type PetProfile = {
  id: string;
  name: string;
  species: string;
  gender?: "Female" | "Male" | "Unknown";
  microchipNumber?: string;
  adoptionDate?: string;
  insuranceProvider?: string;
  insurancePolicyNumber?: string;
  emergencyContactName?: string;
  emergencyContactRelationship?: string;
  emergencyContactPhone?: string;
  breed: string;
  birthDate: string;
  weight: string;
  allergies: string;
  birthdayReminderEnabled?: boolean;
  profilePhotoUri?: string;
  albumPhotos?: PetAlbumPhoto[];
  createdAt: string;
};

type PetAlbumPhoto = {
  id: string;
  uri: string;
  description: string;
  pinned: boolean;
};

const MAX_PET_ALBUM_PHOTOS = 50;
const MAX_PINNED_PET_ALBUM_PHOTOS = 5;
type HealthDateRange = "all" | "30-days" | "90-days" | "this-year";
const HEALTH_DATE_RANGE_OPTIONS: { id: HealthDateRange; label: string }[] = [
  { id: "all", label: "All time" },
  { id: "30-days", label: "30 days" },
  { id: "90-days", label: "90 days" },
  { id: "this-year", label: "This year" },
];

type WeightMeasurement = {
  id: string;
  petId: string;
  value: number;
  unit: "kg" | "lb";
  measuredAt: string;
  createdAt: string;
};

type JournalEntry = {
  id: string;
  petId: string;
  type: string;
  title: string;
  notes: string;
  icon?: string;
  photos?: string[];
  documents?: JournalDocument[];
  createdAt: string;
};

type JournalDocument = {
  id: string;
  name: string;
  uri: string;
  mimeType?: string;
};

type HealthRecord = {
  id: string;
  petId: string;
  type: string;
  customType?: string;
  title: string;
  dateGiven: string;
  nextDueDate: string;
  clinic: string;
  notes: string;
  icon?: string;
  photos?: string[];
  documents?: JournalDocument[];
  createdAt: string;
};

type ReminderRepeat = "once" | "daily" | "weekly" | "monthly" | "yearly";
type ReminderSnoozeMinutes = 15 | 30 | 60;
type CareReminder = {
  id: string;
  petId: string;
  title: string;
  notes?: string;
  dueAt: string;
  allDay?: boolean;
  repeat: ReminderRepeat;
  notificationId: string | null;
  healthRecordId?: string;
  icon?: string;
  snoozedFrom?: string;
  snoozeMinutes?: ReminderSnoozeMinutes;
};
type ReminderCompletion = {
  id: string;
  reminderId: string;
  petId: string;
  petName: string;
  title: string;
  notes?: string;
  scheduledFor: string;
  completedAt: string;
  allDay?: boolean;
  repeat?: ReminderRepeat;
  snoozeMinutes?: ReminderSnoozeMinutes;
  icon?: string;
  healthRecordId?: string;
  restoredReminderId?: string;
};

type NotificationsModule = typeof import("expo-notifications");
const REMINDER_NOTIFICATION_COLOR = "#E85D3F";
const REMINDER_NOTIFICATION_CATEGORY = "CARE_REMINDER_ACTIONS";
const REMINDER_DONE_ACTION = "CARE_REMINDER_DONE";
const REMINDER_SNOOZE_ACTION = "CARE_REMINDER_SNOOZE";

const STORAGE_KEYS = {
  pets: "petcare-personal-pets-v1",
  journal: "petcare-journal-v1",
  reminders: "petcare-reminders-v1",
  reminderHistory: "petcare-reminder-history-v1",
  healthRecords: "petcare-health-records-v1",
  weightMeasurements: "petcare-weight-measurements-v1",
} as const;

const GENERAL_REMINDER_PET_ID = "__general__";
const DEFAULT_HEALTH_RECORD_TYPES = ["Vet visit", "Vaccine", "Medication", "Procedure", "Test / screening", "Other"];
const JOURNAL_TYPE_ICONS: Record<string, string> = {
  Health: "health",
  Meals: "food",
  "Vet visit": "dog",
  Weight: "weight",
  Other: "note",
};
const HEALTH_RECORD_ICONS: Record<string, string> = {
  "Vet visit": "dog",
  Vaccine: "vaccine",
  Medication: "medication",
  Procedure: "hospital",
  "Test / screening": "test",
  Other: "note",
};
const REMINDER_ICON_OPTIONS = [
  { value: "general", label: "General" },
  { value: "training", label: "Training" },
  { value: "dog", label: "Vet visit" },
  { value: "vaccine", label: "Vaccine" },
  { value: "medication", label: "Medication" },
  { value: "hospital", label: "Procedure or healthcare" },
  { value: "test", label: "Test or screening" },
  { value: "health", label: "Health" },
  { value: "food", label: "Food" },
  { value: "gift", label: "Birthday" },
  { value: "activity", label: "Activity" },
  { value: "bath", label: "Bath and shower" },
  { value: "treat", label: "Treat" },
  { value: "waterDrop", label: "Water" },
  { value: "note", label: "Other" },
] as const;
const REPEAT_OPTIONS: { id: ReminderRepeat; label: string }[] = [
  { id: "once", label: "Once" },
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "yearly", label: "Yearly" },
];
const SNOOZE_OPTIONS: { id: ReminderSnoozeMinutes; label: string }[] = [
  { id: 15, label: "15 min" },
  { id: 30, label: "30 min" },
  { id: 60, label: "1 hour" },
];

function getJournalIcon(type: string) {
  return JOURNAL_TYPE_ICONS[type] ?? "note";
}

export function iconNameOrDefault(icon: string | undefined) {
  return icon ?? "dog";
}

function getHealthRecordIcon(record: Pick<HealthRecord, "type" | "customType">) {
  return HEALTH_RECORD_ICONS[getHealthRecordCategory(record)] ?? HEALTH_RECORD_ICONS.Other;
}

function getHealthRecordCategory(record: Pick<HealthRecord, "type" | "customType">) {
  if (["4-in-1 vaccine", "Anti-rabies vaccine", "Other vaccine"].includes(record.type)) return "Vaccine";
  return DEFAULT_HEALTH_RECORD_TYPES.includes(record.type) ? record.type : "Other";
}

function getHealthRecordTypeName(record: HealthRecord) {
  if (record.type === "Other") return record.customType?.trim() || "Other";
  return record.type;
}

function getHealthRecordGroupLabel(record: HealthRecord) {
  return getHealthRecordCategory(record);
}

function getReminderIcon(reminder: CareReminder, healthRecords: HealthRecord[]) {
  const linkedRecord = reminder.healthRecordId
    ? healthRecords.find((record) => record.id === reminder.healthRecordId)
    : healthRecords.find((record) => record.petId === reminder.petId
      && reminder.title === `${getHealthRecordTypeName(record)} due`);
  if (linkedRecord) return getHealthRecordIcon(linkedRecord);
  return iconNameOrDefault(reminder.icon);
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function localDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isValidDateInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime()) && localDateInput(date) === value;
}

function displayDate(date: string) {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function displayReminderDueDate(date: string, allDay?: boolean) {
  if (!allDay) return displayDate(date);
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? date : `${parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} · All day`;
}

function parseReminderTime(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 1 || hours > 12 || minutes > 59) return null;
  const isAfternoon = match[3].toUpperCase() === "PM";
  return { hour: (hours % 12) + (isAfternoon ? 12 : 0), minute: minutes };
}

function formatReminderTime(date: Date) {
  const hours = date.getHours();
  const displayHour = hours % 12 || 12;
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${displayHour}:${minute} ${hours >= 12 ? "PM" : "AM"}`;
}

function reminderTimeDate(value: string) {
  const parsed = parseReminderTime(value);
  const date = new Date();
  date.setHours(parsed?.hour ?? 9, parsed?.minute ?? 0, 0, 0);
  return date;
}

function notificationEmojiForReminder(icon: string | undefined) {
  const icons: Record<string, string> = {
    general: "🐾",
    training: "🎓",
    dog: "🐶",
    vaccine: "💉",
    medication: "💊",
    hospital: "🏥",
    test: "🔬",
    health: "❤️",
    food: "🍽️",
    gift: "🎁",
    activity: "🐾",
    bath: "🛁",
    treat: "🦴",
    waterDrop: "💧",
    note: "📝",
  };
  return icons[icon ?? "dog"] ?? "🐾";
}

function getNextBirthdayDate(birthDate: string) {
  if (!birthDate) return null;
  const birth = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;

  const today = new Date();
  const thisYearBirthday = new Date(today.getFullYear(), birth.getMonth(), birth.getDate());
  const nextBirthday = thisYearBirthday >= today ? thisYearBirthday : new Date(today.getFullYear() + 1, birth.getMonth(), birth.getDate());
  return localDateInput(nextBirthday);
}

function petAge(birthDate: string) {
  if (!birthDate) return "";
  const birth = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(birth.getTime()) || birth > new Date()) return "";

  const now = new Date();
  const diffDays = Math.max(0, Math.floor((now.getTime() - birth.getTime()) / (1000 * 60 * 60 * 24)));

  if (diffDays < 7) {
    const days = Math.max(1, diffDays);
    return `${days} day${days === 1 ? "" : "s"} old`;
  }

  if (diffDays < 30) {
    const weeks = Math.max(1, Math.floor(diffDays / 7));
    const remainingDays = diffDays % 7;
    if (remainingDays === 0) return `${weeks} week${weeks === 1 ? "" : "s"} old`;
    return `${weeks} week${weeks === 1 ? "" : "s"}, ${remainingDays} day${remainingDays === 1 ? "" : "s"} old`;
  }

  if (diffDays < 365) {
    const months = Math.max(1, Math.round(diffDays / 30.4375));
    return `${months} month${months === 1 ? "" : "s"} old`;
  }

  let monthDifference = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
  if (now.getDate() < birth.getDate()) monthDifference -= 1;

  const years = Math.max(0, Math.floor(monthDifference / 12));
  const remainingMonths = Math.max(0, monthDifference % 12);
  if (years === 0) return `${remainingMonths} month${remainingMonths === 1 ? "" : "s"} old`;
  return `${years} year${years === 1 ? "" : "s"}${remainingMonths ? `, ${remainingMonths} month${remainingMonths === 1 ? "" : "s"}` : ""} old`;
}

function notificationsAvailable() {
  return Platform.OS !== "web" && !(Platform.OS === "android" && Constants.appOwnership === AppOwnership.Expo);
}

let notificationHandlerConfigured = false;
let notificationResponseSubscription: ReturnType<NotificationsModule["addNotificationResponseReceivedListener"]> | null = null;
const handledNotificationResponses = new Set<string>();

function getNotificationsModule(): NotificationsModule | null {
  if (!notificationsAvailable()) return null;
  try {
    const Notifications = require("expo-notifications") as NotificationsModule;
    if (!notificationHandlerConfigured) {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
        }),
      });
      notificationHandlerConfigured = true;
    }
    return Notifications;
  } catch {
    return null;
  }
}

export async function updateOverdueReminderBadge(reminders?: readonly Pick<CareReminder, "dueAt">[]) {
  const Notifications = getNotificationsModule();
  if (!Notifications) return;
  try {
    let remindersToCount = reminders;
    if (!remindersToCount) {
      const storedReminders = await AsyncStorage.getItem(STORAGE_KEYS.reminders);
      const parsed: unknown = storedReminders ? JSON.parse(storedReminders) : [];
      remindersToCount = Array.isArray(parsed)
        ? parsed.filter((reminder): reminder is Pick<CareReminder, "dueAt"> => reminder !== null
          && typeof reminder === "object"
          && typeof reminder.dueAt === "string")
        : [];
    }
    const now = Date.now();
    const overdueCount = remindersToCount.filter((reminder) => {
      const dueAt = new Date(reminder.dueAt).getTime();
      return Number.isFinite(dueAt) && dueAt < now;
    }).length;
    await Notifications.setBadgeCountAsync(overdueCount);
  } catch {
    // Badge updates are best-effort and do not affect in-app reminders.
  }
}

export async function dismissPresentedCareNotifications() {
  const Notifications = getNotificationsModule();
  if (!Notifications) return false;
  try {
    const presentedNotifications = await Notifications.getPresentedNotificationsAsync();
    if (presentedNotifications.length === 0) return false;
    await Notifications.dismissAllNotificationsAsync();
    return true;
  } catch {
    return false;
  }
}

export function initializeCareNotifications() {
  const Notifications = getNotificationsModule();
  if (!Notifications || notificationResponseSubscription) return;

  void Notifications.setNotificationCategoryAsync(REMINDER_NOTIFICATION_CATEGORY, [
    { identifier: REMINDER_DONE_ACTION, buttonTitle: "Mark Done", options: { opensAppToForeground: false } },
    { identifier: REMINDER_SNOOZE_ACTION, buttonTitle: "Snooze", options: { opensAppToForeground: false } },
  ]).catch(() => undefined);

  notificationResponseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
    void handleReminderNotificationResponse(response).catch(() => undefined);
  });
  void Notifications.getLastNotificationResponseAsync()
    .then((response) => response ? handleReminderNotificationResponse(response) : undefined)
    .catch(() => undefined);
}

async function handleReminderNotificationResponse(
  response: Parameters<NotificationsModule["addNotificationResponseReceivedListener"]>[0] extends (value: infer T) => void ? T : never,
) {
  const action = response.actionIdentifier;
  if (action !== REMINDER_DONE_ACTION && action !== REMINDER_SNOOZE_ACTION) return;

  const reminderId = response.notification.request.content.data?.reminderId;
  if (typeof reminderId !== "string") return;
  const responseKey = `${response.notification.request.identifier}:${action}`;
  if (handledNotificationResponses.has(responseKey)) return;
  handledNotificationResponses.add(responseKey);

  const [savedReminders, savedHistory, savedPets] = await Promise.all([
    AsyncStorage.getItem(STORAGE_KEYS.reminders),
    AsyncStorage.getItem(STORAGE_KEYS.reminderHistory),
    AsyncStorage.getItem(STORAGE_KEYS.pets),
  ]);
  const reminders: CareReminder[] = savedReminders ? JSON.parse(savedReminders) as CareReminder[] : [];
  const history: ReminderCompletion[] = savedHistory ? JSON.parse(savedHistory) as ReminderCompletion[] : [];
  const pets: PetProfile[] = savedPets ? JSON.parse(savedPets) as PetProfile[] : [];
  const reminder = reminders.find((item) => item.id === reminderId);
  if (!reminder) return;

  const Notifications = getNotificationsModule();
  if (reminder.notificationId && Notifications) {
    await Notifications.cancelScheduledNotificationAsync(reminder.notificationId).catch(() => undefined);
  }

  if (action === REMINDER_SNOOZE_ACTION) {
    const snoozeMinutes = reminder.snoozeMinutes ?? 60;
    const snoozedUntil = new Date(Date.now() + snoozeMinutes * 60 * 1000);
    let notificationId: string | null = null;
    try {
      notificationId = await scheduleReminder(
        reminder.title,
        pets.find((pet) => pet.id === reminder.petId)?.name ?? "General",
        snoozedUntil.toISOString(),
        reminder.id,
        reminder.notes,
        reminder.icon,
        pets.find((pet) => pet.id === reminder.petId)?.profilePhotoUri,
      );
    } catch {
      // The snoozed reminder remains available in-app if the OS cannot reschedule it.
    }
    const nextReminders = reminders.map((item) => item.id === reminder.id
      ? { ...item, dueAt: snoozedUntil.toISOString(), notificationId, snoozedFrom: item.snoozedFrom ?? item.dueAt }
      : item);
    await AsyncStorage.setItem(STORAGE_KEYS.reminders, JSON.stringify(nextReminders));
    await Notifications?.clearLastNotificationResponseAsync().catch(() => undefined);
    return;
  }

  const petName = pets.find((pet) => pet.id === reminder.petId)?.name ?? "General";
  const completed: ReminderCompletion = {
    id: makeId(),
    reminderId: reminder.id,
    petId: reminder.petId,
    petName,
    title: reminder.title,
    notes: reminder.notes,
    scheduledFor: reminder.snoozedFrom ?? reminder.dueAt,
    completedAt: new Date().toISOString(),
    allDay: reminder.allDay,
    repeat: reminder.repeat,
    snoozeMinutes: reminder.snoozeMinutes ?? 60,
    icon: reminder.icon,
    healthRecordId: reminder.healthRecordId,
  };
  let nextReminders = reminders.filter((item) => item.id !== reminder.id);
  if (reminder.repeat !== "once") {
    const nextDue = nextRecurringDueDate(reminder.snoozedFrom ?? reminder.dueAt, reminder.repeat, new Date());
    let notificationId: string | null = null;
    try {
      notificationId = await scheduleReminder(reminder.title, petName, nextDue.toISOString(), reminder.id, reminder.notes, reminder.icon, pets.find((pet) => pet.id === reminder.petId)?.profilePhotoUri);
    } catch {
      // Keep the next recurring reminder available in-app if scheduling fails.
    }
    nextReminders = reminders.map((item) => item.id === reminder.id
      ? { ...item, dueAt: nextDue.toISOString(), notificationId, snoozedFrom: undefined }
      : item);
  }
  await Promise.all([
    AsyncStorage.setItem(STORAGE_KEYS.reminders, JSON.stringify(nextReminders)),
    AsyncStorage.setItem(STORAGE_KEYS.reminderHistory, JSON.stringify([completed, ...history].slice(0, 200))),
  ]);
  await Notifications?.clearLastNotificationResponseAsync().catch(() => undefined);
}

async function requestReminderPermission() {
  const Notifications = getNotificationsModule();
  if (!Notifications) return false;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("care-reminders", {
      name: "Pet care reminders",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      showBadge: true,
      lightColor: REMINDER_NOTIFICATION_COLOR,
    });
  }
  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted || (Platform.OS === "ios" && permission.ios?.allowsAlert === false)) {
    permission = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    });
  }
  return permission.granted;
}

async function scheduleReminder(title: string, petName: string, dueAt: string, reminderId?: string, notes?: string, icon?: string, profilePhotoUri?: string) {
  const Notifications = getNotificationsModule();
  if (!Notifications) return null;
  const permitted = await requestReminderPermission();
  if (!permitted) return null;
  return Notifications.scheduleNotificationAsync({
    content: {
      title: `${notificationEmojiForReminder(icon)} ${title} · ${petName}`,
      body: notes?.trim() || "It's time for a pet-care task.",
      sound: "default",
      badge: 1,
      color: REMINDER_NOTIFICATION_COLOR,
      categoryIdentifier: REMINDER_NOTIFICATION_CATEGORY,
      data: { screen: "care-reminders", reminderId },
      ...(Platform.OS === "ios" && profilePhotoUri ? { attachments: [{ identifier: "pet-profile-photo", url: profilePhotoUri, type: "public.image", typeHint: "public.image" }] } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(dueAt),
      channelId: Platform.OS === "android" ? "care-reminders" : undefined,
    },
  });
}

export async function completeReminderFromCalendar(reminderId: string) {
  const [savedReminders, savedHistory, savedPets] = await Promise.all([
    AsyncStorage.getItem(STORAGE_KEYS.reminders),
    AsyncStorage.getItem(STORAGE_KEYS.reminderHistory),
    AsyncStorage.getItem(STORAGE_KEYS.pets),
  ]);
  const reminders: CareReminder[] = savedReminders ? JSON.parse(savedReminders) as CareReminder[] : [];
  const history: ReminderCompletion[] = savedHistory ? JSON.parse(savedHistory) as ReminderCompletion[] : [];
  const pets: PetProfile[] = savedPets ? JSON.parse(savedPets) as PetProfile[] : [];
  const reminder = reminders.find((item) => item.id === reminderId);
  if (!reminder) return null;

  if (reminder.notificationId) await getNotificationsModule()?.cancelScheduledNotificationAsync(reminder.notificationId).catch(() => undefined);
  const pet = pets.find((item) => item.id === reminder.petId);
  const completed: ReminderCompletion = {
    id: makeId(),
    reminderId: reminder.id,
    petId: reminder.petId,
    petName: pet?.name ?? "General",
    title: reminder.title,
    notes: reminder.notes,
    scheduledFor: reminder.snoozedFrom ?? reminder.dueAt,
    completedAt: new Date().toISOString(),
    allDay: reminder.allDay,
    repeat: reminder.repeat,
    snoozeMinutes: reminder.snoozeMinutes ?? 60,
    icon: reminder.icon,
    healthRecordId: reminder.healthRecordId,
  };
  let nextReminders = reminders.filter((item) => item.id !== reminder.id);
  if (reminder.repeat !== "once") {
    const nextDue = nextRecurringDueDate(reminder.snoozedFrom ?? reminder.dueAt, reminder.repeat, new Date());
    let notificationId: string | null = null;
    try {
      notificationId = await scheduleReminder(reminder.title, pet?.name ?? "General", nextDue.toISOString(), reminder.id, reminder.notes, reminder.icon, pet?.profilePhotoUri);
    } catch {
      // The next reminder remains in-app if the platform cannot schedule its alert.
    }
    nextReminders = reminders.map((item) => item.id === reminder.id
      ? { ...item, dueAt: nextDue.toISOString(), notificationId, snoozedFrom: undefined }
      : item);
  }
  const nextHistory = [completed, ...history].slice(0, 200);
  await Promise.all([
    AsyncStorage.setItem(STORAGE_KEYS.reminders, JSON.stringify(nextReminders)),
    AsyncStorage.setItem(STORAGE_KEYS.reminderHistory, JSON.stringify(nextHistory)),
  ]);
  return { reminders: nextReminders, history: nextHistory };
}

export async function snoozeReminderFromCalendar(reminderId: string) {
  const [savedReminders, savedPets] = await Promise.all([
    AsyncStorage.getItem(STORAGE_KEYS.reminders),
    AsyncStorage.getItem(STORAGE_KEYS.pets),
  ]);
  const reminders: CareReminder[] = savedReminders ? JSON.parse(savedReminders) as CareReminder[] : [];
  const pets: PetProfile[] = savedPets ? JSON.parse(savedPets) as PetProfile[] : [];
  const reminder = reminders.find((item) => item.id === reminderId);
  if (!reminder) return null;

  if (reminder.notificationId) await getNotificationsModule()?.cancelScheduledNotificationAsync(reminder.notificationId).catch(() => undefined);
  const snoozeMinutes = reminder.snoozeMinutes ?? 60;
  const snoozedUntil = new Date(Date.now() + snoozeMinutes * 60 * 1000);
  const pet = pets.find((item) => item.id === reminder.petId);
  let notificationId: string | null = null;
  try {
    notificationId = await scheduleReminder(reminder.title, pet?.name ?? "General", snoozedUntil.toISOString(), reminder.id, reminder.notes, reminder.icon, pet?.profilePhotoUri);
  } catch {
    // The snoozed reminder remains available in-app if the OS cannot schedule it.
  }
  const nextReminders = reminders.map((item) => item.id === reminder.id
    ? { ...item, dueAt: snoozedUntil.toISOString(), notificationId, snoozedFrom: item.snoozedFrom ?? item.dueAt }
    : item);
  await AsyncStorage.setItem(STORAGE_KEYS.reminders, JSON.stringify(nextReminders));
  return nextReminders;
}

function CareButton({
  title,
  onPress,
  palette,
  secondary = false,
  disabled = false,
  destructive = false,
}: {
  title: string;
  onPress: () => void;
  palette: CarePalette;
  secondary?: boolean;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: destructive ? "#B84F43" : secondary ? palette.soft : palette.action, opacity: disabled ? 0.5 : pressed ? 0.78 : 1 },
      ]}
    >
      <Text style={[styles.buttonText, { color: secondary && !destructive ? palette.primary : "#FFFFFF" }]}>{title}</Text>
    </Pressable>
  );
}

function CopyNotesButton({ text, palette, onCopied }: { text: string; palette: CarePalette; onCopied: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Copy notes"
      onPress={() => { void Clipboard.setStringAsync(text).then(onCopied).catch(() => undefined); }}
      style={({ pressed }) => [styles.copyNotesButton, { backgroundColor: palette.soft, opacity: pressed ? 0.75 : 1 }]}
    >
      <Text style={[styles.copyNotesButtonText, { color: palette.primary }]}>Copy</Text>
    </Pressable>
  );
}

function IconActionButton({
  icon,
  label,
  onPress,
  palette,
}: {
  icon: "edit" | "remove";
  label: string;
  onPress: () => void;
  palette: CarePalette;
  destructive?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.iconActionButton, { backgroundColor: palette.soft, opacity: pressed ? 0.72 : 1 }]}
    >
      <ActionIcon name={icon} color={palette.primary} cutout={palette.soft} size={20} />
    </Pressable>
  );
}

export function SolidPetIcon({ name, color, size = 22, cutout = "#FFFFFF" }: { name: string; color: string; size?: number; cutout?: string }) {
  const unit = size / 24;
  const shape = (left: number, top: number, width: number, height: number, radius = 3, extra: object = {}, fill = color) => (
    <View style={[styles.solidIconPart, { left: left * unit, top: top * unit, width: width * unit, height: height * unit, borderRadius: radius * unit, backgroundColor: fill }, extra]} />
  );

  switch (name) {
    case "general":
      return <View style={{ width: size, height: size }}>
        {shape(10, 2, 4, 20, 2)}{shape(2, 10, 20, 4, 2)}
        {shape(4, 4, 4, 4, 2)}{shape(16, 16, 4, 4, 2)}
      </View>;
    case "training":
      return <View style={{ width: size, height: size }}>
        {shape(6, 10, 12, 4, 2)}
        {shape(2, 6, 4, 12, 2)}{shape(18, 6, 4, 12, 2)}
        {shape(0, 8, 3, 8, 1)}{shape(21, 8, 3, 8, 1)}
      </View>;
    case "dog":
      return <View style={{ width: size, height: size }}>
        {shape(2, 3, 7, 10, 3, { transform: [{ rotate: "-18deg" }] })}{shape(15, 3, 7, 10, 3, { transform: [{ rotate: "18deg" }] })}
        {shape(4, 5, 16, 17, 8)}{shape(8, 14, 8, 7, 4)}{shape(7, 11, 2, 2, 1, {}, cutout)}{shape(15, 11, 2, 2, 1, {}, cutout)}
        {shape(10, 15, 4, 3, 2, {}, cutout)}
      </View>;
    case "food":
      return <View style={{ width: size, height: size }}>
        {shape(6, 5, 4, 3, 2)}{shape(11, 3, 4, 3, 2)}{shape(16, 5, 4, 3, 2)}
        {shape(2, 9, 20, 3, 2)}{shape(4, 12, 16, 8, 2, { borderBottomLeftRadius: 7 * unit, borderBottomRightRadius: 7 * unit })}{shape(8, 21, 8, 2, 1)}
      </View>;
    case "bath":
      return <View style={{ width: size, height: size }}>
        {shape(4, 1, 2, 8, 1)}{shape(4, 1, 10, 2, 1)}{shape(12, 1, 5, 3, 1)}
        {shape(13, 5, 1.5, 2, 1)}{shape(16, 6, 1.5, 2, 1)}{shape(19, 7, 1.5, 2, 1)}
        {shape(2, 11, 20, 3, 1)}{shape(4, 13, 16, 7, 2, { borderBottomLeftRadius: 5 * unit, borderBottomRightRadius: 5 * unit })}
        {shape(6, 19, 2, 4, 1)}{shape(17, 19, 2, 4, 1)}
      </View>;
    case "vaccine":
      return <View style={{ width: size, height: size }}>
        {shape(7, 8, 11, 8, 2)}{shape(3, 6, 3, 12, 1)}{shape(1, 10, 3, 3, 1)}
        {shape(18, 11, 4, 2, 1)}{shape(21, 10.5, 3, 1, 0)}
        {shape(10, 9, 1, 5, 0, {}, cutout)}{shape(14, 9, 1, 5, 0, {}, cutout)}
      </View>;
    case "medication":
      return <View style={{ width: size, height: size }}>
        {shape(3, 8, 18, 9, 5)}{shape(11, 8, 2, 9, 1, {}, cutout)}
      </View>;
    case "hospital":
      return <View style={{ width: size, height: size }}>
        {shape(4, 4, 16, 19, 2)}{shape(9, 7, 6, 2, 1, {}, cutout)}{shape(11, 5, 2, 6, 1, {}, cutout)}
        {shape(10, 15, 4, 8, 1, {}, cutout)}
      </View>;
    case "test":
      return <View style={{ width: size, height: size }}>
        {shape(2, 4, 5, 2, 1)}{shape(3, 6, 3, 4, 1)}{shape(1, 10, 7, 12, 3)}
        {shape(9, 2, 5, 2, 1)}{shape(10, 4, 3, 5, 1)}{shape(8, 9, 7, 13, 3)}
        {shape(17, 4, 5, 2, 1)}{shape(18, 6, 3, 4, 1)}{shape(16, 10, 7, 12, 3)}
        {shape(2, 16, 5, 2, 1, {}, cutout)}{shape(9, 15, 5, 2, 1, {}, cutout)}{shape(17, 16, 5, 2, 1, {}, cutout)}
      </View>;
    case "note":
      return <View style={{ width: size, height: size }}>
        {shape(3, 2, 16, 20, 2)}{shape(6, 6, 9, 1.5, 1, {}, cutout)}{shape(6, 10, 9, 1.5, 1, {}, cutout)}{shape(6, 14, 7, 1.5, 1, {}, cutout)}
        {shape(15, 15, 3, 8, 1, { transform: [{ rotate: "35deg" }] })}{shape(18, 14, 3, 2, 1, { transform: [{ rotate: "35deg" }] })}
      </View>;
    case "health":
      return <View style={{ width: size, height: size }}>
        {shape(9, 2, 6, 20, 2)}{shape(2, 9, 20, 6, 2)}
      </View>;
    case "stethoscope":
      return <View style={{ width: size, height: size }}>
        {shape(4, 2, 3, 10, 1)}{shape(17, 2, 3, 10, 1)}{shape(2, 1, 6, 3, 1)}{shape(16, 1, 6, 3, 1)}
        {shape(5, 10, 3, 5, 1)}{shape(16, 10, 3, 5, 1)}{shape(7, 14, 11, 3, 1)}{shape(16, 15, 7, 7, 4)}
        {shape(18, 17, 3, 3, 2, {}, cutout)}
      </View>;
    case "gift":
      return <View style={{ width: size, height: size }}>
        {shape(3, 9, 18, 13, 2)}{shape(2, 6, 20, 4, 1)}{shape(10, 6, 4, 16, 1, {}, cutout)}
        {shape(6, 1, 6, 5, 3)}{shape(12, 1, 6, 5, 3)}{shape(10, 3, 4, 3, 1)}
      </View>;
    case "activity":
      return <View style={{ width: size, height: size }}>
        {shape(5, 8, 14, 8, 5)}{shape(16, 5, 6, 7, 3)}{shape(20, 8, 4, 2, 1)}
        {shape(2, 6, 5, 2, 1, { transform: [{ rotate: "-25deg" }] })}
        {shape(7, 14, 3, 8, 1, { transform: [{ rotate: "12deg" }] })}{shape(12, 14, 3, 8, 1, { transform: [{ rotate: "-12deg" }] })}
        {shape(17, 12, 3, 8, 1, { transform: [{ rotate: "18deg" }] })}{shape(7, 8, 2, 2, 1, {}, cutout)}
      </View>;
    case "bone":
      return <View style={{ width: size, height: size }}>
        {shape(6, 9, 13, 7, 3, { transform: [{ rotate: "-35deg" }] })}{shape(3, 5, 7, 7, 4)}{shape(1, 10, 7, 7, 4)}{shape(15, 3, 7, 7, 4)}{shape(16, 10, 7, 7, 4)}
      </View>;
    case "treat":
      return <View style={{ width: size, height: size }}>
        {shape(5, 4, 14, 16, 3)}{shape(8, 8, 2, 2, 1, {}, cutout)}{shape(14, 8, 2, 2, 1, {}, cutout)}{shape(8, 14, 2, 2, 1, {}, cutout)}{shape(14, 14, 2, 2, 1, {}, cutout)}
      </View>;
    case "waterDrop":
      return <View style={{ width: size, height: size }}>
        <View style={[styles.solidIconPart, { left: 6 * unit, top: 1 * unit, width: 0, height: 0, borderLeftWidth: 6 * unit, borderRightWidth: 6 * unit, borderBottomWidth: 10 * unit, borderLeftColor: "transparent", borderRightColor: "transparent", borderBottomColor: color, backgroundColor: "transparent" }]} />
        {shape(6, 7, 12, 15, 7)}{shape(10, 13, 2, 5, 1, {}, cutout)}
      </View>;
    case "weight":
      return <View style={{ width: size, height: size }}>
        {shape(3, 5, 18, 18, 4)}{shape(7, 1, 10, 8, 5, {}, cutout)}{shape(11, 10, 2, 5, 1, { transform: [{ rotate: "25deg" }] }, cutout)}
      </View>;
    default:
      return <View style={{ width: size, height: size }}>{shape(2, 3, 20, 18, 7)}</View>;
  }
}

function CameraActionButton({ title, onPress, palette }: { title: string; onPress: () => void; palette: CarePalette }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.cameraActionButton, { backgroundColor: palette.soft, opacity: pressed ? 0.76 : 1 }]}
    >
      <View style={styles.cameraIcon}>
        <View style={[styles.cameraTop, { backgroundColor: palette.primary }]} />
        <View style={[styles.cameraBody, { backgroundColor: palette.primary }]}>
          <View style={[styles.cameraLens, { borderColor: palette.soft }]} />
        </View>
      </View>
      <Text style={[styles.cameraActionLabel, { color: palette.primary }]}>{title}</Text>
    </Pressable>
  );
}

function CareInput({
  value,
  onChangeText,
  placeholder,
  palette,
  multiline = false,
  keyboardType,
  error = false,
  maxLength,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  palette: CarePalette;
  multiline?: boolean;
  keyboardType?: "default" | "numeric" | "decimal-pad" | "phone-pad";
  error?: boolean;
  maxLength?: number;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={palette.muted}
      keyboardType={keyboardType}
      multiline={multiline}
      maxLength={maxLength}
      textAlignVertical={multiline ? "top" : "center"}
      style={[
        styles.input,
        { backgroundColor: palette.bg, color: palette.text, borderColor: error ? "#C64040" : palette.line },
        multiline && styles.multilineInput,
      ]}
    />
  );
}

function CalendarDateField({
  value,
  onChange,
  placeholder,
  palette,
  optional = false,
  error = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  palette: CarePalette;
  optional?: boolean;
  error?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const [draftDate, setDraftDate] = useState(value ? new Date(`${value}T00:00:00`) : new Date());
  const currentDate = value ? new Date(`${value}T00:00:00`) : new Date();

  function handleValueChange(_event: DateTimePickerEvent | unknown, selectedDate?: Date) {
    if (Platform.OS === "android") setVisible(false);
    if (!selectedDate) return;
    if (Platform.OS === "ios") {
      setDraftDate(selectedDate);
      return;
    }
    onChange(localDateInput(selectedDate));
  }

  return (
    <View>
      <View style={styles.dateFieldRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={value ? `${placeholder}: ${value}. Open calendar` : `${placeholder}. Open calendar`}
          onPress={() => {
            setDraftDate(currentDate);
            setVisible(true);
          }}
          style={[styles.dateFieldButton, { backgroundColor: palette.bg, borderColor: error ? "#C64040" : palette.line }]}
        >
          <Text style={[styles.dateFieldText, { color: value ? palette.text : palette.muted }]}>{value ? new Date(`${value}T00:00:00`).toLocaleDateString() : placeholder}</Text>
          <Text style={{ color: palette.primary, fontSize: 17 }}>▦</Text>
        </Pressable>
        {optional && value ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear date" onPress={() => onChange("")} style={styles.clearDateButton}>
            <Text style={{ color: palette.muted, fontWeight: "800" }}>×</Text>
          </Pressable>
        ) : null}
      </View>
      {visible && Platform.OS === "android" ? (
        <DateTimePicker value={currentDate} mode="date" display="calendar" onValueChange={handleValueChange} onDismiss={() => setVisible(false)} />
      ) : null}
      {Platform.OS === "ios" ? (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
          <View style={styles.modalScrim}>
            <View style={[styles.calendarModal, { backgroundColor: palette.card }]}>
              <View style={styles.modalHeader}>
                <Pressable onPress={() => setVisible(false)}><Text style={{ color: palette.muted, fontWeight: "700" }}>Cancel</Text></Pressable>
                <Text style={{ color: palette.text, fontWeight: "800" }}>Choose date</Text>
                <Pressable onPress={() => { onChange(localDateInput(draftDate)); setVisible(false); }}><Text style={{ color: palette.primary, fontWeight: "800" }}>Done</Text></Pressable>
              </View>
              <DateTimePicker value={draftDate} mode="date" display="inline" onValueChange={handleValueChange} onDismiss={() => setVisible(false)} />
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

function ReminderTimeField({ value, onChange, palette, error = false }: { value: string; onChange: (value: string) => void; palette: CarePalette; error?: boolean }) {
  const [visible, setVisible] = useState(false);
  const [draftTime, setDraftTime] = useState(() => reminderTimeDate(value));

  function handleValueChange(_event: DateTimePickerEvent | unknown, selectedTime?: Date) {
    if (Platform.OS === "android") setVisible(false);
    if (!selectedTime) return;
    if (Platform.OS === "ios") {
      setDraftTime(selectedTime);
      return;
    }
    onChange(formatReminderTime(selectedTime));
  }

  if (Platform.OS === "web") {
    return (
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="9:00 AM"
        placeholderTextColor={palette.muted}
        accessibilityLabel="Reminder time in AM or PM"
        style={[styles.input, styles.timeFieldInput, { backgroundColor: palette.bg, color: palette.text, borderColor: error ? "#C64040" : palette.line }]}
      />
    );
  }

  const currentTime = reminderTimeDate(value);
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Reminder time ${value}. Choose time`}
        onPress={() => { setDraftTime(currentTime); setVisible(true); }}
        style={[styles.dateFieldButton, styles.timePickerButton, { backgroundColor: palette.bg, borderColor: error ? "#C64040" : palette.line }]}
      >
        <Text style={[styles.dateFieldText, { color: palette.text }]}>{value || "Choose time"}</Text>
        <Text style={{ color: palette.primary, fontSize: 16 }}>◷</Text>
      </Pressable>
      {visible && Platform.OS === "android" ? (
        <DateTimePicker value={currentTime} mode="time" display="default" is24Hour={false} onValueChange={handleValueChange} onDismiss={() => setVisible(false)} />
      ) : null}
      {Platform.OS === "ios" ? (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
          <View style={styles.modalScrim}>
            <View style={[styles.calendarModal, { backgroundColor: palette.card }]}>
              <View style={styles.modalHeader}>
                <Pressable onPress={() => setVisible(false)}><Text style={{ color: palette.muted, fontWeight: "700" }}>Cancel</Text></Pressable>
                <Text style={{ color: palette.text, fontWeight: "800" }}>Choose time</Text>
                <Pressable onPress={() => { onChange(formatReminderTime(draftTime)); setVisible(false); }}><Text style={{ color: palette.primary, fontWeight: "800" }}>Done</Text></Pressable>
              </View>
              <DateTimePicker value={draftTime} mode="time" display="spinner" is24Hour={false} onValueChange={handleValueChange} onDismiss={() => setVisible(false)} />
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

function PetChips({
  pets,
  selectedPetId,
  onSelect,
  palette,
  allowGeneral = false,
}: {
  pets: PetProfile[];
  selectedPetId: string;
  onSelect: (petId: string) => void;
  palette: CarePalette;
  allowGeneral?: boolean;
}) {
  if (pets.length === 0 && !allowGeneral) {
    return <Text style={[styles.helpText, { color: palette.muted }]}>Add a pet profile first to link this item to them.</Text>;
  }
  const options = [
    ...(allowGeneral ? [{ id: GENERAL_REMINDER_PET_ID, name: "General" }] : []),
    ...pets.map((pet) => ({ id: pet.id, name: pet.name })),
  ];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
      {options.map((pet) => {
        const selected = selectedPetId === pet.id;
        return (
          <Pressable
            key={pet.id}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onSelect(pet.id)}
            style={[styles.chip, { backgroundColor: selected ? palette.action : palette.bg, borderColor: selected ? palette.action : palette.line }]}
          >
            <Text style={[styles.chipText, { color: selected ? "#FFFFFF" : palette.text }]}>{pet.name}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function CareToolsScreen({
  palette,
  onBack,
  initialTab = "pets",
}: {
  palette: CarePalette;
  onBack: () => void;
  initialTab?: CareTab;
}) {
  const [tab, setTab] = useState<CareTab>(initialTab);
  const [pets, setPets] = useState<PetProfile[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [reminders, setReminders] = useState<CareReminder[]>([]);
  const [reminderBadgeClock, setReminderBadgeClock] = useState(() => Date.now());
  const [reminderHistory, setReminderHistory] = useState<ReminderCompletion[]>([]);
  const [completedHistoryOpen, setCompletedHistoryOpen] = useState(false);
  const [reminderHistoryPetFilter, setReminderHistoryPetFilter] = useState("");
  const [healthRecords, setHealthRecords] = useState<HealthRecord[]>([]);
  const [weightMeasurements, setWeightMeasurements] = useState<WeightMeasurement[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedPetId, setSelectedPetId] = useState(initialTab === "reminders" ? GENERAL_REMINDER_PET_ID : "");
  const [activePetId, setActivePetId] = useState<string | null>(null);
  const [selectedHealthRecord, setSelectedHealthRecord] = useState<HealthRecord | null>(null);
  const [selectedJournalEntry, setSelectedJournalEntry] = useState<JournalEntry | null>(null);
  const [selectedReminder, setSelectedReminder] = useState<CareReminder | null>(null);
  const [selectedReminderCompletion, setSelectedReminderCompletion] = useState<ReminderCompletion | null>(null);
  const [healthSearchQuery, setHealthSearchQuery] = useState("");
  const [healthFiltersExpanded, setHealthFiltersExpanded] = useState(false);
  const [healthTypeFilter, setHealthTypeFilter] = useState("All types");
  const [healthDateRange, setHealthDateRange] = useState<HealthDateRange>("all");
  const [healthClinicFilter, setHealthClinicFilter] = useState("");
  const [weightFormOpen, setWeightFormOpen] = useState(false);
  const [weightValue, setWeightValue] = useState("");
  const [weightUnit, setWeightUnit] = useState<"kg" | "lb">("kg");
  const [weightMeasuredAt, setWeightMeasuredAt] = useState(() => localDateInput(new Date()));
  const [editingHealthRecordId, setEditingHealthRecordId] = useState<string | null>(null);
  const [healthRecordFormOpen, setHealthRecordFormOpen] = useState(false);
  const [healthRecordPhotos, setHealthRecordPhotos] = useState<string[]>([]);
  const [healthRecordDocuments, setHealthRecordDocuments] = useState<JournalDocument[]>([]);
  const [notice, setNotice] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const careScrollRef = React.useRef<ScrollView>(null);
  const healthFormOffsetRef = React.useRef(0);

  const [petFormOpen, setPetFormOpen] = useState(false);
  const [editingPetId, setEditingPetId] = useState<string | null>(null);
  const [petName, setPetName] = useState("");
  const [petSpecies, setPetSpecies] = useState("");
  const [petGender, setPetGender] = useState<PetProfile["gender"]>("Unknown");
  const [petMicrochipNumber, setPetMicrochipNumber] = useState("");
  const [petAdoptionDate, setPetAdoptionDate] = useState("");
  const [petInsuranceProvider, setPetInsuranceProvider] = useState("");
  const [petInsurancePolicyNumber, setPetInsurancePolicyNumber] = useState("");
  const [petEmergencyContactName, setPetEmergencyContactName] = useState("");
  const [petEmergencyContactRelationship, setPetEmergencyContactRelationship] = useState("");
  const [petEmergencyContactPhone, setPetEmergencyContactPhone] = useState("");
  const [petBreed, setPetBreed] = useState("");
  const [petBirthDate, setPetBirthDate] = useState("");
  const [petWeight, setPetWeight] = useState("");
  const [petAllergies, setPetAllergies] = useState("");
  const [petBirthdayReminderEnabled, setPetBirthdayReminderEnabled] = useState(false);
  const [profilePhotoUri, setProfilePhotoUri] = useState<string | undefined>();
  const [healthType, setHealthType] = useState(DEFAULT_HEALTH_RECORD_TYPES[0]);
  const [healthTypePickerOpen, setHealthTypePickerOpen] = useState(false);
  const [customHealthType, setCustomHealthType] = useState("");
  const [createReminderForDueDate, setCreateReminderForDueDate] = useState(true);
  const [photoViewerUri, setPhotoViewerUri] = useState<string | null>(null);
  const [petAlbumModalPetId, setPetAlbumModalPetId] = useState<string | null>(null);
  const [selectedAlbumPhotoIds, setSelectedAlbumPhotoIds] = useState<string[]>([]);
  const [petAlbumUploadProgress, setPetAlbumUploadProgress] = useState<{ petId: string; completed: number; total: number } | null>(null);
  const [healthTitle, setHealthTitle] = useState("");
  const [healthDateGiven, setHealthDateGiven] = useState(localDateInput(new Date()));
  const [healthNextDueDate, setHealthNextDueDate] = useState("");
  const [healthClinic, setHealthClinic] = useState("");
  const [healthNotes, setHealthNotes] = useState("");

  const [entryTitle, setEntryTitle] = useState("");
  const [entryNotes, setEntryNotes] = useState("");
  const [journalFormOpen, setJournalFormOpen] = useState(false);
  const [editingJournalEntryId, setEditingJournalEntryId] = useState<string | null>(null);
  const [journalPhotos, setJournalPhotos] = useState<string[]>([]);
  const [journalDocuments, setJournalDocuments] = useState<JournalDocument[]>([]);

  const [reminderTitle, setReminderTitle] = useState("");
  const [reminderNotes, setReminderNotes] = useState("");
  const [editingReminderId, setEditingReminderId] = useState<string | null>(null);
  const [reminderFormOpen, setReminderFormOpen] = useState(false);
  const [reminderDate, setReminderDate] = useState(() => localDateInput(new Date()));
  const [reminderTime, setReminderTime] = useState(() => formatReminderTime(new Date()));
  const [reminderAllDay, setReminderAllDay] = useState(false);
  const [reminderTitleError, setReminderTitleError] = useState(false);
  const [reminderDateError, setReminderDateError] = useState(false);
  const [reminderTimeError, setReminderTimeError] = useState(false);
  const [reminderScheduleError, setReminderScheduleError] = useState(false);
  const [reminderRepeat, setReminderRepeat] = useState<ReminderRepeat>("once");
  const [reminderSnoozeMinutes, setReminderSnoozeMinutes] = useState<ReminderSnoozeMinutes>(60);
  const [reminderIcon, setReminderIcon] = useState<string>(REMINDER_ICON_OPTIONS[0].value);

  const overdueReminderCount = reminders.filter((reminder) => {
    const dueAt = new Date(reminder.dueAt).getTime();
    return Number.isFinite(dueAt) && dueAt < reminderBadgeClock;
  }).length;

  useEffect(() => {
    const interval = setInterval(() => setReminderBadgeClock(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (loaded) void updateOverdueReminderBadge(reminders);
  }, [loaded, reminders]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (photoViewerUri) {
        setPhotoViewerUri(null);
        return true;
      }
      if (petAlbumModalPetId) {
        closePetAlbumManager();
        return true;
      }
      if (selectedJournalEntry) {
        setSelectedJournalEntry(null);
        return true;
      }
      if (selectedReminder) {
        setSelectedReminder(null);
        return true;
      }
      if (selectedReminderCompletion) {
        setSelectedReminderCompletion(null);
        return true;
      }
      if (selectedHealthRecord) {
        setSelectedHealthRecord(null);
        return true;
      }
      if (journalFormOpen) {
        cancelJournalForm();
        return true;
      }
      if (healthTypePickerOpen) {
        setHealthTypePickerOpen(false);
        return true;
      }
      if (healthRecordFormOpen) {
        cancelHealthRecordForm();
        return true;
      }
      if (weightFormOpen) {
        setWeightFormOpen(false);
        return true;
      }
      if (reminderFormOpen) {
        resetReminderForm();
        return true;
      }
      if (journalFormOpen) {
        cancelJournalForm();
        return true;
      }
      if (petFormOpen) {
        resetPetForm();
        return true;
      }
      if (activePetId) {
        setActivePetId(null);
        return true;
      }
      if (tab !== "pets") {
        setTab("pets");
        return true;
      }
      onBack();
      return true;
    });
    return () => subscription.remove();
  }, [
    activePetId,
    editingHealthRecordId,
    editingReminderId,
    journalFormOpen,
    healthRecordFormOpen,
    healthRecordDocuments,
    healthRecordPhotos,
    healthRecords,
    healthTypePickerOpen,
    onBack,
    petFormOpen,
    photoViewerUri,
    petAlbumModalPetId,
    selectedHealthRecord,
    selectedJournalEntry,
    selectedReminder,
    selectedReminderCompletion,
    tab,
    reminderFormOpen,
    weightFormOpen,
  ]);

  useEffect(() => {
    let active = true;
    Promise.all([
      AsyncStorage.getItem(STORAGE_KEYS.pets),
      AsyncStorage.getItem(STORAGE_KEYS.journal),
      AsyncStorage.getItem(STORAGE_KEYS.reminders),
      AsyncStorage.getItem(STORAGE_KEYS.reminderHistory),
      AsyncStorage.getItem(STORAGE_KEYS.healthRecords),
      AsyncStorage.getItem(STORAGE_KEYS.weightMeasurements),
    ]).then(([savedPets, savedJournal, savedReminders, savedReminderHistory, savedHealthRecords, savedWeightMeasurements]) => {
      if (!active) return;
      try {
        if (savedPets) {
          setPets(JSON.parse(savedPets) as PetProfile[]);
        }
      } catch { /* Ignore invalid local records. */ }
      try { if (savedJournal) setJournal(JSON.parse(savedJournal) as JournalEntry[]); } catch { /* Ignore invalid local records. */ }
      try { if (savedReminders) setReminders(JSON.parse(savedReminders) as CareReminder[]); } catch { /* Ignore invalid local records. */ }
      try { if (savedReminderHistory) setReminderHistory(JSON.parse(savedReminderHistory) as ReminderCompletion[]); } catch { /* Ignore invalid local history. */ }
      try { if (savedHealthRecords) setHealthRecords(JSON.parse(savedHealthRecords) as HealthRecord[]); } catch { /* Ignore invalid local records. */ }
      try { if (savedWeightMeasurements) setWeightMeasurements(JSON.parse(savedWeightMeasurements) as WeightMeasurement[]); } catch { /* Ignore invalid local records. */ }
    }).catch(() => {
      setNotice("Personal care data could not be loaded; you can still use this screen.");
    }).finally(() => {
      if (active) setLoaded(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    Promise.all([
      AsyncStorage.setItem(STORAGE_KEYS.pets, JSON.stringify(pets)),
      AsyncStorage.setItem(STORAGE_KEYS.journal, JSON.stringify(journal)),
      AsyncStorage.setItem(STORAGE_KEYS.reminders, JSON.stringify(reminders)),
      AsyncStorage.setItem(STORAGE_KEYS.reminderHistory, JSON.stringify(reminderHistory)),
      AsyncStorage.setItem(STORAGE_KEYS.healthRecords, JSON.stringify(healthRecords)),
      AsyncStorage.setItem(STORAGE_KEYS.weightMeasurements, JSON.stringify(weightMeasurements)),
    ]).catch(() => setNotice("Changes are available now, but could not be saved on this device."));
  }, [healthRecords, journal, loaded, pets, reminderHistory, reminders, weightMeasurements]);

  useEffect(() => {
    if ((tab === "reminders" || tab === "journal") && selectedPetId === GENERAL_REMINDER_PET_ID) return;
    if (!pets.some((pet) => pet.id === selectedPetId)) setSelectedPetId(pets[0]?.id ?? "");
  }, [pets, selectedPetId, tab]);

  const petById = useMemo(() => new Map(pets.map((pet) => [pet.id, pet])), [pets]);
  const sortedJournal = useMemo(() => [...journal].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [journal]);
  const sortedReminders = useMemo(() => [...reminders].sort((a, b) => a.dueAt.localeCompare(b.dueAt)), [reminders]);
  const availableHealthTypes = DEFAULT_HEALTH_RECORD_TYPES;

  async function refreshCareCenter() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const [savedPets, savedJournal, savedReminders, savedReminderHistory, savedHealthRecords, savedWeightMeasurements] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.pets),
        AsyncStorage.getItem(STORAGE_KEYS.journal),
        AsyncStorage.getItem(STORAGE_KEYS.reminders),
        AsyncStorage.getItem(STORAGE_KEYS.reminderHistory),
        AsyncStorage.getItem(STORAGE_KEYS.healthRecords),
        AsyncStorage.getItem(STORAGE_KEYS.weightMeasurements),
      ]);
      const parseListOrCurrent = <T,>(raw: string | null, current: T[]) => {
        if (!raw) return current;
        try {
          const parsed: unknown = JSON.parse(raw);
          return Array.isArray(parsed) ? parsed as T[] : current;
        } catch {
          return current;
        }
      };
      const nextPets = parseListOrCurrent(savedPets, pets);
      const nextJournal = parseListOrCurrent(savedJournal, journal);
      const nextReminders = parseListOrCurrent(savedReminders, reminders);
      const nextReminderHistory = parseListOrCurrent(savedReminderHistory, reminderHistory);
      const nextHealthRecords = parseListOrCurrent(savedHealthRecords, healthRecords);
      const nextWeightMeasurements = parseListOrCurrent(savedWeightMeasurements, weightMeasurements);
      const dataChanged = JSON.stringify(nextPets) !== JSON.stringify(pets)
        || JSON.stringify(nextJournal) !== JSON.stringify(journal)
        || JSON.stringify(nextReminders) !== JSON.stringify(reminders)
        || JSON.stringify(nextReminderHistory) !== JSON.stringify(reminderHistory)
        || JSON.stringify(nextHealthRecords) !== JSON.stringify(healthRecords);
      const weightsChanged = JSON.stringify(nextWeightMeasurements) !== JSON.stringify(weightMeasurements);

      if (dataChanged || weightsChanged) {
        setPets(nextPets);
        setJournal(nextJournal);
        setReminders(nextReminders);
        setReminderHistory(nextReminderHistory);
        setHealthRecords(nextHealthRecords);
        setWeightMeasurements(nextWeightMeasurements);
      }

      const notificationsCleared = await dismissPresentedCareNotifications();
      if (dataChanged && notificationsCleared) {
        setNotice("Care data updated and delivered notifications cleared. Upcoming reminders are still scheduled.");
      } else if (dataChanged) {
        setNotice("Care data updated. Upcoming reminders are still scheduled.");
      } else if (notificationsCleared) {
        setNotice("Delivered notifications cleared. Upcoming reminders are still scheduled.");
      } else {
        setNotice("");
      }
    } catch (error) {
      const reason = error instanceof Error && error.message ? error.message : "unknown storage error";
      setNotice(`Could not refresh saved care data: ${reason}`);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active" && loaded) void refreshCareCenter();
    });
    return () => subscription.remove();
  }, [loaded]);

  function hasHealthRecordReminder(record: HealthRecord) {
    if (!record.nextDueDate) return false;
    const dueAt = new Date(`${record.nextDueDate}T09:00:00`).toISOString();
    return reminders.some((reminder) => reminder.petId === record.petId && reminder.title === `${getHealthRecordTypeName(record)} due` && reminder.dueAt === dueAt);
  }

  function resetPetForm() {
    setEditingPetId(null);
    setPetName("");
    setPetSpecies("");
    setPetGender("Unknown");
    setPetMicrochipNumber("");
    setPetAdoptionDate("");
    setPetInsuranceProvider("");
    setPetInsurancePolicyNumber("");
    setPetEmergencyContactName("");
    setPetEmergencyContactRelationship("");
    setPetEmergencyContactPhone("");
    setPetBreed("");
    setPetBirthDate("");
    setPetWeight("");
    setPetAllergies("");
    setPetBirthdayReminderEnabled(false);
    setProfilePhotoUri(undefined);
    setPetFormOpen(false);
  }

  function editPet(pet: PetProfile) {
    setEditingPetId(pet.id);
    setPetName(pet.name);
    setPetSpecies(pet.species);
    setPetGender(pet.gender ?? "Unknown");
    setPetMicrochipNumber(pet.microchipNumber ?? "");
    setPetAdoptionDate(pet.adoptionDate ?? "");
    setPetInsuranceProvider(pet.insuranceProvider ?? "");
    setPetInsurancePolicyNumber(pet.insurancePolicyNumber ?? "");
    setPetEmergencyContactName(pet.emergencyContactName ?? "");
    setPetEmergencyContactRelationship(pet.emergencyContactRelationship ?? "");
    setPetEmergencyContactPhone(pet.emergencyContactPhone ?? "");
    setPetBreed(pet.breed);
    setPetBirthDate(pet.birthDate);
    setPetWeight(pet.weight);
    setPetAllergies(pet.allergies);
    setPetBirthdayReminderEnabled(Boolean(pet.birthdayReminderEnabled));
    setProfilePhotoUri(pet.profilePhotoUri);
    setPetFormOpen(true);
    setActivePetId(null);
    setTab("pets");
  }

  async function chooseProfilePhoto(source: "library" | "camera") {
    if (source === "camera") {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setNotice("Allow camera access to take a profile picture.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) setProfilePhotoUri(result.assets[0].uri);
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setNotice("Allow photo library access to choose a profile picture.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) setProfilePhotoUri(result.assets[0].uri);
  }

  async function addPetAlbumPhotos(pet: PetProfile) {
    if (petAlbumUploadProgress) return;
    const remaining = Math.max(0, MAX_PET_ALBUM_PHOTOS - (pet.albumPhotos?.length ?? 0));
    if (!remaining) {
      setNotice(`A pet album can include up to ${MAX_PET_ALBUM_PHOTOS} photos.`);
      return;
    }
    const photos: PetAlbumPhoto[] = [];
    setPetAlbumUploadProgress({ petId: pet.id, completed: 0, total: 0 });
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setNotice("Allow photo library access to add pet album photos.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        selectionLimit: Math.min(remaining, 20),
        quality: 0.85,
        base64: Platform.OS === "web",
      });
      if (result.canceled) return;
      const selected = result.assets.slice(0, remaining);
      if (!selected.length) return;
      setPetAlbumUploadProgress({ petId: pet.id, completed: 0, total: selected.length });
      for (const [index, asset] of selected.entries()) {
        photos.push({
          id: makeId(),
          uri: await persistJournalFile(asset.uri, asset.fileName ?? `pet-album-${Date.now()}-${index}.jpg`, "image/jpeg", asset.base64 ?? undefined, "pet-album-attachments"),
          description: "",
          pinned: false,
        });
        setPetAlbumUploadProgress({ petId: pet.id, completed: index + 1, total: selected.length });
      }
      setPets((current) => current.map((item) => item.id === pet.id
        ? { ...item, albumPhotos: [...(item.albumPhotos ?? []), ...photos].slice(0, MAX_PET_ALBUM_PHOTOS) }
        : item));
      setNotice(`${photos.length} photo${photos.length === 1 ? "" : "s"} added to ${pet.name}'s album.`);
    } catch {
      discardPetAlbumPhotos(photos);
      setNotice("Could not save one or more pet album photos.");
    } finally {
      setPetAlbumUploadProgress(null);
    }
  }

  function discardPetAlbumPhotos(photos: PetAlbumPhoto[]) {
    if (Platform.OS === "web" || !FileSystem.documentDirectory) return;
    const folder = `${FileSystem.documentDirectory}pet-album-attachments/`;
    photos.forEach((photo) => {
      if (photo.uri.startsWith(folder)) void FileSystem.deleteAsync(photo.uri, { idempotent: true }).catch(() => undefined);
    });
  }

  function updatePetAlbumPhoto(pet: PetProfile, photoId: string, changes: Partial<PetAlbumPhoto>) {
    setPets((current) => current.map((item) => item.id === pet.id
      ? { ...item, albumPhotos: (item.albumPhotos ?? []).map((photo) => photo.id === photoId ? { ...photo, ...changes } : photo) }
      : item));
  }

  function togglePetAlbumPhotoPin(pet: PetProfile, photo: PetAlbumPhoto) {
    const pinnedCount = (pet.albumPhotos ?? []).filter((item) => item.pinned).length;
    if (!photo.pinned && pinnedCount >= MAX_PINNED_PET_ALBUM_PHOTOS) {
      setNotice(`You can pin up to ${MAX_PINNED_PET_ALBUM_PHOTOS} photos in the pet view.`);
      return;
    }
    updatePetAlbumPhoto(pet, photo.id, { pinned: !photo.pinned });
  }

  function closePetAlbumManager() {
    setPetAlbumModalPetId(null);
    setSelectedAlbumPhotoIds([]);
  }

  function toggleAlbumPhotoSelection(photoId: string) {
    setSelectedAlbumPhotoIds((current) => current.includes(photoId)
      ? current.filter((id) => id !== photoId)
      : [...current, photoId]);
  }

  function toggleSelectAllAlbumPhotos(pet: PetProfile) {
    const photos = pet.albumPhotos ?? [];
    const allSelected = photos.length > 0 && photos.every((photo) => selectedAlbumPhotoIds.includes(photo.id));
    setSelectedAlbumPhotoIds(allSelected ? [] : photos.map((photo) => photo.id));
  }

  function deleteSelectedAlbumPhotos(pet: PetProfile) {
    const selectedIds = new Set(selectedAlbumPhotoIds);
    const photosToDelete = (pet.albumPhotos ?? []).filter((photo) => selectedIds.has(photo.id));
    if (!photosToDelete.length) return;
    Alert.alert(`Delete ${photosToDelete.length} photo${photosToDelete.length === 1 ? "" : "s"}?`, "Selected photos and their descriptions will be permanently removed from this pet's album.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => {
        discardPetAlbumPhotos(photosToDelete);
        setPets((current) => current.map((item) => item.id === pet.id
          ? { ...item, albumPhotos: (item.albumPhotos ?? []).filter((photo) => !selectedIds.has(photo.id)) }
          : item));
        setSelectedAlbumPhotoIds([]);
      } },
    ]);
  }

  function removePetAlbumPhoto(pet: PetProfile, photo: PetAlbumPhoto) {
    Alert.alert("Remove album photo?", "This photo and its description will be removed from this pet's album.", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => {
        discardPetAlbumPhotos([photo]);
        setPets((current) => current.map((item) => item.id === pet.id
          ? { ...item, albumPhotos: (item.albumPhotos ?? []).filter((itemPhoto) => itemPhoto.id !== photo.id) }
          : item));
        setSelectedAlbumPhotoIds((current) => current.filter((id) => id !== photo.id));
      } },
    ]);
  }

  async function downloadImage(uri: string, fileName = "journal-photo.jpg") {
    if (!uri) return;
    try {
      if (Platform.OS === "web") {
        const anchor = window.document.createElement("a");
        anchor.href = uri;
        anchor.download = fileName;
        anchor.click();
      } else if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "image/*", dialogTitle: "Save or share photo" });
      } else {
        await Share.share({ title: "Pet photo", message: "Save this pet photo from the profile.", url: uri });
      }
    } catch {
      setNotice("Unable to share this photo right now.");
    }
  }

  async function persistJournalFile(sourceUri: string, originalName: string, mimeType?: string, base64?: string, folder = "journal-attachments") {
    if (Platform.OS === "web") return base64 && mimeType ? `data:${mimeType};base64,${base64}` : sourceUri;
    if (!FileSystem.documentDirectory) return sourceUri;
    const directory = `${FileSystem.documentDirectory}${folder}/`;
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true }).catch(() => undefined);
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const destination = `${directory}${makeId()}-${safeName || "attachment"}`;
    await FileSystem.copyAsync({ from: sourceUri, to: destination });
    return destination;
  }

  async function chooseJournalPhotos() {
    const remaining = Math.max(0, 5 - journalPhotos.length);
    if (!remaining) {
      setNotice("A journal entry can include up to five photos.");
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setNotice("Allow photo library access to attach journal photos.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.85,
      base64: Platform.OS === "web",
    });
    if (result.canceled) return;
    try {
      const storedPhotos = await Promise.all(result.assets.slice(0, remaining).map((asset, index) =>
        persistJournalFile(asset.uri, asset.fileName ?? `journal-photo-${Date.now()}-${index}.jpg`, "image/jpeg", asset.base64 ?? undefined),
      ));
      setJournalPhotos((current) => [...current, ...storedPhotos].slice(0, 5));
    } catch {
      setNotice("Could not save one or more journal photos.");
    }
  }

  async function chooseJournalDocuments() {
    const remaining = Math.max(0, 10 - journalDocuments.length);
    if (!remaining) {
      setNotice("A journal entry can include up to ten documents.");
      return;
    }
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: "*/*", multiple: true, copyToCacheDirectory: true, base64: Platform.OS === "web" });
      if (result.canceled) return;
      const selected = result.assets.slice(0, remaining);
      const storedDocuments = await Promise.all(selected.map(async (asset) => ({
        id: makeId(),
        name: asset.name,
        uri: await persistJournalFile(asset.uri, asset.name, asset.mimeType, asset.base64),
        mimeType: asset.mimeType,
      })));
      setJournalDocuments((current) => [...current, ...storedDocuments].slice(0, 10));
    } catch {
      setNotice("Could not attach the selected document. Please try again.");
    }
  }

  async function chooseHealthRecordPhotos() {
    const remaining = Math.max(0, 5 - healthRecordPhotos.length);
    if (!remaining) {
      setNotice("A healthcare record can include up to five photos.");
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setNotice("Allow photo library access to attach healthcare record photos.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.85,
      base64: Platform.OS === "web",
    });
    if (result.canceled) return;
    try {
      const storedPhotos = await Promise.all(result.assets.slice(0, remaining).map((asset, index) =>
        persistJournalFile(asset.uri, asset.fileName ?? `health-record-photo-${Date.now()}-${index}.jpg`, "image/jpeg", asset.base64 ?? undefined, "health-record-attachments"),
      ));
      setHealthRecordPhotos((current) => [...current, ...storedPhotos].slice(0, 5));
    } catch {
      setNotice("Could not save one or more healthcare record photos.");
    }
  }

  async function chooseHealthRecordDocuments() {
    const remaining = Math.max(0, 10 - healthRecordDocuments.length);
    if (!remaining) {
      setNotice("A healthcare record can include up to ten documents.");
      return;
    }
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: "*/*", multiple: true, copyToCacheDirectory: true, base64: Platform.OS === "web" });
      if (result.canceled) return;
      const selected = result.assets.slice(0, remaining);
      const storedDocuments = await Promise.all(selected.map(async (asset) => ({
        id: makeId(),
        name: asset.name,
        uri: await persistJournalFile(asset.uri, asset.name, asset.mimeType, asset.base64, "health-record-attachments"),
        mimeType: asset.mimeType,
      })));
      setHealthRecordDocuments((current) => [...current, ...storedDocuments].slice(0, 10));
    } catch {
      setNotice("Could not attach the selected healthcare record document.");
    }
  }

  async function downloadJournalDocument(document: JournalDocument) {
    try {
      if (Platform.OS === "web") {
        const anchor = window.document.createElement("a");
        anchor.href = document.uri;
        anchor.download = document.name;
        anchor.click();
        return;
      }
      if (Platform.OS === "android") {
        const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!permission.granted) {
          setNotice("Choose a folder to save the attached document.");
          return;
        }
        const extension = document.name.match(/(\.[^./\\]+)$/)?.[1] ?? "";
        const fileName = extension ? document.name.slice(0, -extension.length) : document.name;
        const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
          permission.directoryUri,
          fileName,
          document.mimeType ?? "application/octet-stream",
        );
        const contents = await FileSystem.readAsStringAsync(document.uri, { encoding: FileSystem.EncodingType.Base64 });
        await FileSystem.StorageAccessFramework.writeAsStringAsync(fileUri, contents, { encoding: FileSystem.EncodingType.Base64 });
        setNotice(`${document.name} saved to the selected folder.`);
        return;
      }
      if (!(await Sharing.isAvailableAsync())) {
        setNotice("Sharing is not available on this device.");
        return;
      }
      await Sharing.shareAsync(document.uri, { mimeType: document.mimeType, dialogTitle: `Save ${document.name}` });
    } catch {
      setNotice(`Could not download ${document.name}.`);
    }
  }

  function savePet() {
    if (!petName.trim() || !petSpecies.trim()) {
      setNotice("Add your pet's name and species to save the profile.");
      return;
    }
    if (petBirthDate && Number.isNaN(new Date(`${petBirthDate}T00:00:00`).getTime())) {
      setNotice("Enter the birth date as YYYY-MM-DD, or leave it blank.");
      return;
    }
    if (petAdoptionDate && !isValidDateInput(petAdoptionDate)) {
      setNotice("Enter the adoption date as a real date, or leave it blank.");
      return;
    }
    const existing = pets.find((pet) => pet.id === editingPetId);
    const saved: PetProfile = {
      id: editingPetId ?? makeId(),
      name: petName.trim(),
      species: petSpecies.trim(),
      gender: petGender ?? "Unknown",
      microchipNumber: petMicrochipNumber.trim(),
      adoptionDate: petAdoptionDate.trim(),
      insuranceProvider: petInsuranceProvider.trim(),
      insurancePolicyNumber: petInsurancePolicyNumber.trim(),
      emergencyContactName: petEmergencyContactName.trim(),
      emergencyContactRelationship: petEmergencyContactRelationship.trim(),
      emergencyContactPhone: petEmergencyContactPhone.trim(),
      breed: petBreed.trim(),
      birthDate: petBirthDate.trim(),
      weight: petWeight.trim(),
      allergies: petAllergies.trim(),
      birthdayReminderEnabled: petBirthdayReminderEnabled,
      profilePhotoUri,
      albumPhotos: existing?.albumPhotos ?? [],
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };

    if (petBirthdayReminderEnabled && petBirthDate) {
      const nextBirthday = getNextBirthdayDate(petBirthDate);
      if (nextBirthday) {
        const birthdayReminder: CareReminder = {
          id: makeId(),
          petId: saved.id,
          title: `${petName.trim()}'s birthday`,
          dueAt: new Date(`${nextBirthday}T09:00:00`).toISOString(),
          repeat: "yearly",
          notificationId: null,
          icon: "gift",
        };
        setReminders((current) => {
          const replaced = current.filter((reminder) => reminder.petId !== saved.id || reminder.title !== birthdayReminder.title);
          return [birthdayReminder, ...replaced];
        });
      }
    } else {
      setReminders((current) => current.filter((reminder) => reminder.petId !== saved.id || reminder.title !== `${petName.trim()}'s birthday`));
    }
    setPets((current) => editingPetId
      ? current.map((pet) => pet.id === editingPetId ? saved : pet)
      : [saved, ...current]);
    if (!editingPetId) setSelectedPetId(saved.id);
    resetPetForm();
    setNotice(editingPetId ? "Pet profile updated." : "Pet profile saved on this device.");
  }

  function deletePet(pet: PetProfile) {
    Alert.alert("Remove pet profile?", `This also removes ${pet.name}'s journal entries and reminders.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => {
        const Notifications = getNotificationsModule();
        const petReminders = reminders.filter((reminder) => reminder.petId === pet.id);
        petReminders.forEach((reminder) => {
          if (reminder.notificationId && Notifications) void Notifications.cancelScheduledNotificationAsync(reminder.notificationId).catch(() => undefined);
        });
        setPets((current) => current.filter((item) => item.id !== pet.id));
        if (petAlbumModalPetId === pet.id) closePetAlbumManager();
        const petJournalEntries = journal.filter((entry) => entry.petId === pet.id);
        petJournalEntries.forEach((entry) => { void deleteJournalFiles(entry); });
        const petHealthRecords = healthRecords.filter((record) => record.petId === pet.id);
        petHealthRecords.forEach((record) => discardHealthRecordAttachments(record.photos ?? [], record.documents ?? []));
        discardPetAlbumPhotos(pet.albumPhotos ?? []);
        setJournal((current) => current.filter((entry) => entry.petId !== pet.id));
        setReminders((current) => current.filter((reminder) => reminder.petId !== pet.id));
        setHealthRecords((current) => current.filter((record) => record.petId !== pet.id));
        setWeightMeasurements((current) => current.filter((measurement) => measurement.petId !== pet.id));
        if (activePetId === pet.id) setActivePetId(null);
        setNotice(`${pet.name}'s profile and linked care records were removed.`);
      } },
    ]);
  }

  function saveJournalEntry() {
    const isGeneralJournalEntry = selectedPetId === GENERAL_REMINDER_PET_ID;
    if (!selectedPetId || (!isGeneralJournalEntry && !petById.has(selectedPetId))) {
      setNotice("Select a pet or General before saving a journal entry.");
      return;
    }
    if (!entryTitle.trim()) {
      setNotice("Add a short title for this journal entry.");
      return;
    }
    const existingEntry = journal.find((entry) => entry.id === editingJournalEntryId);
    const entry: JournalEntry = {
      id: existingEntry?.id ?? makeId(),
      petId: isGeneralJournalEntry ? GENERAL_REMINDER_PET_ID : selectedPetId,
      type: "Other",
      title: entryTitle.trim(),
      notes: entryNotes.trim(),
      icon: "note",
      photos: journalPhotos,
      documents: journalDocuments,
      createdAt: existingEntry?.createdAt ?? new Date().toISOString(),
    };
    setJournal((current) => existingEntry
      ? current.map((item) => item.id === entry.id ? entry : item)
      : [entry, ...current]);
    setEditingJournalEntryId(null);
    setEntryTitle("");
    setEntryNotes("");
    setJournalPhotos([]);
    setJournalDocuments([]);
    setJournalFormOpen(false);
    setNotice(existingEntry ? "Journal entry updated." : "Journal entry saved.");
  }

  function beginAddJournalEntry() {
    setEditingJournalEntryId(null);
    setEntryTitle("");
    setEntryNotes("");
    setJournalPhotos([]);
    setJournalDocuments([]);
    setJournalFormOpen(true);
  }

  function beginEditJournalEntry(entry: JournalEntry) {
    setEditingJournalEntryId(entry.id);
    setSelectedPetId(entry.petId);
    setEntryTitle(entry.title);
    setEntryNotes(entry.notes);
    setJournalPhotos(entry.photos ?? []);
    setJournalDocuments(entry.documents ?? []);
    setSelectedJournalEntry(null);
    setJournalFormOpen(true);
  }

  function discardJournalAttachments(photos: string[], documents: JournalDocument[]) {
    if (Platform.OS === "web" || !FileSystem.documentDirectory) return;
    const files = [...photos, ...documents.map((document) => document.uri)]
      .filter((uri) => uri.startsWith(`${FileSystem.documentDirectory}journal-attachments/`));
    files.forEach((uri) => { void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined); });
  }

  function discardHealthRecordAttachments(photos: string[], documents: JournalDocument[]) {
    if (Platform.OS === "web" || !FileSystem.documentDirectory) return;
    const folder = `${FileSystem.documentDirectory}health-record-attachments/`;
    const files = [...photos, ...documents.map((document) => document.uri)]
      .filter((uri) => uri.startsWith(folder));
    files.forEach((uri) => { void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined); });
  }

  function cancelJournalForm() {
    const existingEntry = journal.find((entry) => entry.id === editingJournalEntryId);
    if (!existingEntry) discardJournalAttachments(journalPhotos, journalDocuments);
    else {
      const originalPhotos = new Set(existingEntry.photos ?? []);
      const originalDocuments = new Set((existingEntry.documents ?? []).map((document) => document.uri));
      discardJournalAttachments(
        journalPhotos.filter((uri) => !originalPhotos.has(uri)),
        journalDocuments.filter((document) => !originalDocuments.has(document.uri)),
      );
    }
    setEditingJournalEntryId(null);
    setJournalFormOpen(false);
    setEntryTitle("");
    setEntryNotes("");
    setJournalPhotos([]);
    setJournalDocuments([]);
  }

  function removeDraftJournalPhoto(uri: string) {
    Alert.alert("Remove attached photo?", "This photo will not be included in the journal entry.", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => {
        discardJournalAttachments([uri], []);
        setJournalPhotos((current) => current.filter((item) => item !== uri));
      } },
    ]);
  }

  function removeDraftJournalDocument(document: JournalDocument) {
    Alert.alert("Remove attached document?", `“${document.name}” will not be included in the journal entry.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => {
        discardJournalAttachments([], [document]);
        setJournalDocuments((current) => current.filter((item) => item.id !== document.id));
      } },
    ]);
  }

  async function deleteJournalFiles(entry: JournalEntry) {
    if (Platform.OS === "web" || !FileSystem.documentDirectory) return;
    discardJournalAttachments(entry.photos ?? [], entry.documents ?? []);
  }

  function editHealthRecord(record: HealthRecord) {
    setEditingHealthRecordId(record.id);
    const category = getHealthRecordCategory(record);
    setHealthType(DEFAULT_HEALTH_RECORD_TYPES.includes(record.type) ? record.type : category);
    setCustomHealthType(record.customType ?? "");
    setHealthTitle(record.title);
    setHealthDateGiven(record.dateGiven);
    setHealthNextDueDate(record.nextDueDate);
    setHealthClinic(record.clinic);
    setHealthNotes(record.notes);
    setHealthRecordPhotos(record.photos ?? []);
    setHealthRecordDocuments(record.documents ?? []);
    setCreateReminderForDueDate(Boolean(record.nextDueDate && hasHealthRecordReminder(record)));
    setHealthRecordFormOpen(true);
    setSelectedHealthRecord(null);
    setTimeout(() => careScrollRef.current?.scrollTo({ y: Math.max(healthFormOffsetRef.current - 12, 0), animated: true }), 80);
  }

  function beginAddHealthRecord() {
    resetHealthRecordForm();
    setHealthRecordFormOpen(true);
    setTimeout(() => careScrollRef.current?.scrollTo({ y: Math.max(healthFormOffsetRef.current - 12, 0), animated: true }), 80);
  }

  function resetHealthRecordForm() {
    setEditingHealthRecordId(null);
    setHealthRecordFormOpen(false);
    setHealthType(DEFAULT_HEALTH_RECORD_TYPES[0]);
    setCustomHealthType("");
    setHealthTitle("");
    setHealthDateGiven(localDateInput(new Date()));
    setHealthNextDueDate("");
    setHealthClinic("");
    setHealthNotes("");
    setHealthRecordPhotos([]);
    setHealthRecordDocuments([]);
    setCreateReminderForDueDate(true);
  }

  function cancelHealthRecordForm() {
    const existingRecord = healthRecords.find((record) => record.id === editingHealthRecordId);
    if (!existingRecord) {
      discardHealthRecordAttachments(healthRecordPhotos, healthRecordDocuments);
    } else {
      const originalPhotos = new Set(existingRecord.photos ?? []);
      const originalDocuments = new Set((existingRecord.documents ?? []).map((document) => document.uri));
      discardHealthRecordAttachments(
        healthRecordPhotos.filter((uri) => !originalPhotos.has(uri)),
        healthRecordDocuments.filter((document) => !originalDocuments.has(document.uri)),
      );
    }
    resetHealthRecordForm();
  }

  function removeHealthRecordPhoto(uri: string) {
    Alert.alert("Remove attached photo?", "This photo will not be included in the healthcare record.", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => {
        const existingRecord = healthRecords.find((record) => record.id === editingHealthRecordId);
        if (!existingRecord?.photos?.includes(uri)) discardHealthRecordAttachments([uri], []);
        setHealthRecordPhotos((current) => current.filter((item) => item !== uri));
      } },
    ]);
  }

  function removeHealthRecordDocument(document: JournalDocument) {
    Alert.alert("Remove attached document?", `“${document.name}” will not be included in the healthcare record.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => {
        const existingRecord = healthRecords.find((record) => record.id === editingHealthRecordId);
        if (!existingRecord?.documents?.some((item) => item.uri === document.uri)) discardHealthRecordAttachments([], [document]);
        setHealthRecordDocuments((current) => current.filter((item) => item.id !== document.id));
      } },
    ]);
  }

  async function saveHealthRecord(petId: string) {
    if (!isValidDateInput(healthDateGiven)) {
      setNotice("Enter the date given as a real date in YYYY-MM-DD format.");
      return;
    }
    if (healthNextDueDate && !isValidDateInput(healthNextDueDate)) {
      setNotice("Enter the next due date as YYYY-MM-DD, or leave it blank.");
      return;
    }
    if (healthNextDueDate && healthNextDueDate < healthDateGiven) {
      setNotice("The next due date cannot be earlier than the date given.");
      return;
    }
    if (healthType === "Other" && !customHealthType.trim()) {
      setNotice("Enter a name for this other healthcare record type.");
      return;
    }
    const existingRecord = healthRecords.find((item) => item.id === editingHealthRecordId);
    const customTypeName = healthType === "Other" ? customHealthType.trim().replace(/\s+/g, " ") : undefined;
    const record: HealthRecord = {
      id: existingRecord?.id ?? makeId(),
      petId,
      type: healthType === "Other" ? "Other" : healthType,
      customType: customTypeName,
      title: healthTitle.trim() || customTypeName || healthType,
      dateGiven: healthDateGiven,
      nextDueDate: healthNextDueDate,
      clinic: healthClinic.trim(),
      notes: healthNotes.trim(),
      icon: getHealthRecordIcon({ type: healthType, customType: customTypeName }),
      photos: healthRecordPhotos,
      documents: healthRecordDocuments,
      createdAt: existingRecord?.createdAt ?? new Date().toISOString(),
    };
    if (existingRecord) {
      const retainedPhotos = new Set(healthRecordPhotos);
      const retainedDocuments = new Set(healthRecordDocuments.map((document) => document.uri));
      discardHealthRecordAttachments(
        (existingRecord.photos ?? []).filter((uri) => !retainedPhotos.has(uri)),
        (existingRecord.documents ?? []).filter((document) => !retainedDocuments.has(document.uri)),
      );
    }
    setHealthRecords((current) => existingRecord
      ? current.map((item) => item.id === record.id ? record : item)
      : [record, ...current]);

    let reminderNotice: string | null = null;
    if (existingRecord) {
      reminderNotice = await syncHealthRecordReminder(record, Boolean(record.nextDueDate && createReminderForDueDate), existingRecord);
    } else if (record.nextDueDate && createReminderForDueDate) {
      reminderNotice = await syncHealthRecordReminder(record, true);
    }

    const recordTypeName = customTypeName ?? healthType;
    setNotice(reminderNotice ?? `${recordTypeName} record ${existingRecord ? "updated" : "saved"} for ${petById.get(petId)?.name ?? "your pet"}.`);
    resetHealthRecordForm();
  }

  function removeHealthRecord(record: HealthRecord) {
    Alert.alert("Remove healthcare record?", `Remove this ${getHealthRecordTypeName(record).toLocaleLowerCase()} entry?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => {
        const linkedReminder = reminders.find((reminder) => reminder.healthRecordId === record.id)
          ?? (record.nextDueDate
            ? reminders.find((reminder) => reminder.petId === record.petId
              && reminder.title === `${getHealthRecordTypeName(record)} due`
              && reminder.dueAt === new Date(`${record.nextDueDate}T09:00:00`).toISOString())
            : undefined);
        if (linkedReminder?.notificationId) void getNotificationsModule()?.cancelScheduledNotificationAsync(linkedReminder.notificationId).catch(() => undefined);
        discardHealthRecordAttachments(record.photos ?? [], record.documents ?? []);
        if (linkedReminder) setReminders((current) => current.filter((reminder) => reminder.id !== linkedReminder.id));
        setHealthRecords((current) => current.filter((item) => item.id !== record.id));
        setSelectedHealthRecord(null);
      } },
    ]);
  }

  async function syncHealthRecordReminder(record: HealthRecord, shouldHaveReminder: boolean, previousRecord?: HealthRecord): Promise<string | null> {
    const linkedReminder = reminders.find((reminder) => reminder.healthRecordId === record.id)
      ?? (previousRecord?.nextDueDate
        ? reminders.find((reminder) => reminder.petId === previousRecord.petId
          && reminder.title === `${getHealthRecordTypeName(previousRecord)} due`
          && reminder.dueAt === new Date(`${previousRecord.nextDueDate}T09:00:00`).toISOString())
        : undefined);
    if (!shouldHaveReminder || !record.nextDueDate) {
      if (!linkedReminder) return null;
      if (linkedReminder.notificationId) await getNotificationsModule()?.cancelScheduledNotificationAsync(linkedReminder.notificationId).catch(() => undefined);
      setReminders((current) => current.filter((reminder) => reminder.id !== linkedReminder.id));
      return "The linked due-date reminder was removed.";
    }

    const dueAt = new Date(`${record.nextDueDate}T09:00:00`).toISOString();
    const reminderTitle = `${getHealthRecordTypeName(record)} due`;
    if (linkedReminder?.dueAt === dueAt && linkedReminder.title === reminderTitle) return null;
    const matchingReminder = reminders.find((reminder) =>
      reminder.id !== linkedReminder?.id && reminder.petId === record.petId && reminder.title === reminderTitle && reminder.dueAt === dueAt,
    );
    if (linkedReminder?.notificationId) await getNotificationsModule()?.cancelScheduledNotificationAsync(linkedReminder.notificationId).catch(() => undefined);
    if (matchingReminder) {
      if (linkedReminder) setReminders((current) => current.filter((reminder) => reminder.id !== linkedReminder.id));
      return "A reminder for this due date is already saved.";
    }

    const reminderId = linkedReminder?.id ?? makeId();
    let notificationId: string | null = null;
    try {
      notificationId = await scheduleReminder(reminderTitle, petById.get(record.petId)?.name ?? "your pet", dueAt, reminderId, undefined, getHealthRecordIcon(record), petById.get(record.petId)?.profilePhotoUri);
    } catch {
      // Keep the in-app reminder even if a native notification cannot be scheduled.
    }
    const replacement: CareReminder = {
      id: reminderId,
      petId: record.petId,
      title: reminderTitle,
      dueAt,
      repeat: "once",
      notificationId,
      healthRecordId: record.id,
      icon: getHealthRecordIcon(record),
    };
    setReminders((current) => [...current.filter((reminder) => reminder.id !== linkedReminder?.id), replacement]);
    return linkedReminder
      ? `Linked reminder updated for ${record.nextDueDate}.`
      : notificationId
        ? `Reminder added for ${record.nextDueDate}.`
        : `In-app reminder added for ${record.nextDueDate}.`;
  }

  async function addReminderForHealthRecord(record: HealthRecord) {
    const reminderMessage = await syncHealthRecordReminder(record, true);
    setNotice(reminderMessage ?? "A reminder for this due date is already saved.");
    setSelectedHealthRecord(null);
  }

  function resetReminderForm() {
    const now = new Date();
    setEditingReminderId(null);
    setReminderTitle("");
    setReminderNotes("");
    setReminderDate(localDateInput(now));
    setReminderTime(formatReminderTime(now));
    setReminderAllDay(false);
    setReminderRepeat("once");
    setReminderSnoozeMinutes(60);
    setReminderIcon(REMINDER_ICON_OPTIONS[0].value);
    setReminderTitleError(false);
    setReminderDateError(false);
    setReminderTimeError(false);
    setReminderScheduleError(false);
    setReminderFormOpen(false);
  }

  function beginAddReminder() {
    resetReminderForm();
    setSelectedPetId(GENERAL_REMINDER_PET_ID);
    setReminderFormOpen(true);
  }

  function beginEditReminder(reminder: CareReminder) {
    const dueAt = new Date(reminder.dueAt);
    setEditingReminderId(reminder.id);
    setSelectedPetId(reminder.petId || GENERAL_REMINDER_PET_ID);
    setReminderTitle(reminder.title);
    setReminderNotes(reminder.notes ?? "");
    setReminderDate(localDateInput(dueAt));
    setReminderTime(formatReminderTime(dueAt));
    setReminderAllDay(Boolean(reminder.allDay));
    setReminderRepeat(reminder.repeat);
    setReminderSnoozeMinutes(reminder.snoozeMinutes ?? 60);
    setReminderIcon(iconNameOrDefault(reminder.icon));
    setReminderTitleError(false);
    setReminderDateError(false);
    setReminderTimeError(false);
    setReminderScheduleError(false);
    setReminderFormOpen(true);
  }

  async function saveReminder() {
    const titleMissing = !reminderTitle.trim();
    setReminderTitleError(titleMissing);
    const parsedTime = parseReminderTime(reminderTime);
    const dateValid = isValidDateInput(reminderDate);
    setReminderDateError(!dateValid);
    setReminderTimeError(!reminderAllDay && !parsedTime);
    setReminderScheduleError(false);
    if (!dateValid || (!reminderAllDay && !parsedTime)) {
      setNotice(titleMissing
        ? "Add a reminder name and choose a valid date and time."
        : "Choose a valid date and enter the time as 9:00 AM or 3:30 PM.");
      return;
    }
    const due = new Date(`${reminderDate}T00:00:00`);
    if (reminderAllDay) {
      due.setHours(9, 0, 0, 0);
      if (reminderDate === localDateInput(new Date()) && due <= new Date()) due.setTime(Date.now() + 60_000);
    } else {
      due.setHours(parsedTime!.hour, parsedTime!.minute, 0, 0);
    }
    const scheduleIsPast = Number.isNaN(due.getTime()) || due <= new Date();
    setReminderScheduleError(scheduleIsPast);
    if (titleMissing || scheduleIsPast) {
      setNotice(titleMissing && scheduleIsPast
        ? "Add a reminder name and choose a future date and time."
        : titleMissing
          ? "Add a name for this care reminder."
          : "Choose a reminder date and time in the future.");
      return;
    }
    const isGeneralReminder = selectedPetId === GENERAL_REMINDER_PET_ID;
    const selectedPet = isGeneralReminder ? undefined : petById.get(selectedPetId);
    if (!selectedPetId || (!isGeneralReminder && !selectedPet)) {
      setNotice("Choose General or select a pet before creating a reminder.");
      return;
    }
    const reminderPetId = isGeneralReminder ? "" : selectedPet!.id;
    const reminderPetName = selectedPet?.name ?? "General";
    const existingReminder = reminders.find((reminder) => reminder.id === editingReminderId);
    const reminderId = existingReminder?.id ?? makeId();
    let notificationId: string | null = null;
    if (existingReminder?.notificationId) {
      await getNotificationsModule()?.cancelScheduledNotificationAsync(existingReminder.notificationId).catch(() => undefined);
    }
    try {
      notificationId = await scheduleReminder(reminderTitle.trim(), reminderPetName, due.toISOString(), reminderId, reminderNotes.trim(), reminderIcon, selectedPet?.profilePhotoUri);
    } catch {
      setNotice("Reminder saved in the app, but the notification could not be scheduled.");
    }
    const reminder: CareReminder = {
      id: reminderId,
      petId: reminderPetId,
      title: reminderTitle.trim(),
      notes: reminderNotes.trim(),
      dueAt: due.toISOString(),
      allDay: reminderAllDay,
      repeat: reminderRepeat,
      snoozeMinutes: reminderSnoozeMinutes,
      notificationId,
      icon: reminderIcon,
      healthRecordId: existingReminder?.healthRecordId,
    };
    setReminders((current) => existingReminder
      ? current.map((item) => item.id === reminder.id ? reminder : item)
      : [reminder, ...current]);
    setEditingReminderId(null);
    resetReminderForm();
    setNotice(notificationId
      ? existingReminder ? "Reminder updated and its notification was rescheduled." : "Reminder saved and a notification was scheduled."
      : Platform.OS === "android" && Constants.appOwnership === AppOwnership.Expo
        ? `${existingReminder ? "Reminder updated" : "Reminder saved"} in-app. Android system alerts require a development or production build; Expo Go cannot schedule them here.`
      : Platform.OS === "web"
        ? `${existingReminder ? "Reminder updated" : "Reminder saved"} for this device; browser notifications are not enabled here.`
        : `${existingReminder ? "Reminder updated" : "Reminder saved"} in the app, but the device did not schedule its alert. Check app notifications and Android Alarms & reminders access.`);
  }

  async function completeReminder(reminder: CareReminder) {
    if (reminder.notificationId) {
      await getNotificationsModule()?.cancelScheduledNotificationAsync(reminder.notificationId).catch(() => undefined);
    }
    setReminderHistory((current) => [{
      id: makeId(),
      reminderId: reminder.id,
      petId: reminder.petId,
      petName: petById.get(reminder.petId)?.name ?? "General",
      title: reminder.title,
      scheduledFor: reminder.snoozedFrom ?? reminder.dueAt,
      completedAt: new Date().toISOString(),
      allDay: reminder.allDay,
      repeat: reminder.repeat,
      notes: reminder.notes,
      snoozeMinutes: reminder.snoozeMinutes ?? 60,
      icon: reminder.icon,
      healthRecordId: reminder.healthRecordId,
    }, ...current].slice(0, 200));
    if (reminder.repeat === "once") {
      setReminders((current) => current.filter((item) => item.id !== reminder.id));
      setNotice("Reminder completed and added to history.");
      return;
    }
    const nextDue = nextRecurringDueDate(reminder.snoozedFrom ?? reminder.dueAt, reminder.repeat, new Date());
    let notificationId: string | null = null;
    try {
      notificationId = await scheduleReminder(reminder.title, petById.get(reminder.petId)?.name ?? "General", nextDue.toISOString(), reminder.id, reminder.notes, reminder.icon, petById.get(reminder.petId)?.profilePhotoUri);
    } catch {
      setNotice("Marked complete; the next reminder was saved but its notification could not be scheduled.");
    }
    setReminders((current) => current.map((item) => item.id === reminder.id
      ? { ...item, dueAt: nextDue.toISOString(), notificationId, snoozedFrom: undefined }
      : item));
    if (notificationId) setNotice(`Done. Next ${reminder.repeat} reminder scheduled for ${displayDate(nextDue.toISOString())}.`);
  }

  function confirmCompleteReminder(reminder: CareReminder) {
    Alert.alert("Mark reminder done?", `Mark “${reminder.title}” as completed?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Mark done", onPress: () => { void completeReminder(reminder); } },
    ]);
  }

  async function snoozeReminder(reminder: CareReminder) {
    if (reminder.notificationId) {
      await getNotificationsModule()?.cancelScheduledNotificationAsync(reminder.notificationId).catch(() => undefined);
    }
    const snoozeMinutes = reminder.snoozeMinutes ?? 60;
    const snoozedUntil = new Date(Date.now() + snoozeMinutes * 60 * 1000);
    let notificationId: string | null = null;
    try {
      notificationId = await scheduleReminder(reminder.title, petById.get(reminder.petId)?.name ?? "General", snoozedUntil.toISOString(), reminder.id, reminder.notes, reminder.icon, petById.get(reminder.petId)?.profilePhotoUri);
    } catch {
      // Keep the snoozed reminder visible in-app if the OS cannot schedule it.
    }
    setReminders((current) => current.map((item) => item.id === reminder.id
      ? { ...item, dueAt: snoozedUntil.toISOString(), notificationId, snoozedFrom: reminder.snoozedFrom ?? reminder.dueAt }
      : item));
    setNotice(notificationId
      ? `Reminder snoozed for ${snoozeMinutes} minutes, until ${displayDate(snoozedUntil.toISOString())}.`
      : `Reminder snoozed for ${snoozeMinutes} minutes in-app; a device alert was not scheduled.`);
  }

  async function retryReminderNotification(reminder: CareReminder) {
    if (!notificationsAvailable()) {
      setNotice("Device notifications are unavailable on this platform. The reminder remains available in-app.");
      return;
    }
    if (new Date(reminder.dueAt) <= new Date()) {
      setNotice("This reminder is overdue. Snooze it to set a new alert time.");
      return;
    }
    try {
      const notificationId = await scheduleReminder(reminder.title, petById.get(reminder.petId)?.name ?? "General", reminder.dueAt, reminder.id, reminder.notes, reminder.icon, petById.get(reminder.petId)?.profilePhotoUri);
      if (!notificationId) {
        setNotice("Alert still unavailable. Check notification permission and try again.");
        return;
      }
      setReminders((current) => current.map((item) => item.id === reminder.id ? { ...item, notificationId } : item));
      setNotice("Device alert scheduled.");
    } catch {
      setNotice("Could not schedule the device alert. Check notification permission and try again.");
    }
  }


  async function restoreCompletedReminder(completion: ReminderCompletion) {
    if (completion.restoredReminderId) {
      setNotice("This completed reminder has already been restored.");
      return;
    }
    const repeat = completion.repeat ?? "once";
    const now = new Date();
    const dueAt = repeat === "once"
      ? new Date(completion.scheduledFor) > now
        ? completion.scheduledFor
        : new Date(now.getTime() + 60 * 60 * 1000).toISOString()
      : nextRecurringDueDate(completion.scheduledFor, repeat, now).toISOString();
    const restoredReminderId = makeId();
    let notificationId: string | null = null;
    try {
      notificationId = await scheduleReminder(
        completion.title,
        petById.get(completion.petId)?.name ?? completion.petName,
        dueAt,
        restoredReminderId,
        completion.notes,
        completion.icon,
        petById.get(completion.petId)?.profilePhotoUri,
      );
    } catch {
      // Keep the restored reminder in-app if notification scheduling fails.
    }
    const restoredReminder: CareReminder = {
      id: restoredReminderId,
      petId: completion.petId,
      title: completion.title,
      notes: completion.notes,
      dueAt,
      allDay: completion.allDay,
      repeat,
      snoozeMinutes: completion.snoozeMinutes ?? 60,
      notificationId,
      healthRecordId: completion.healthRecordId,
      icon: completion.icon,
    };
    setReminders((current) => [restoredReminder, ...current]);
    setReminderHistory((current) => current.map((item) => item.id === completion.id
      ? { ...item, restoredReminderId: restoredReminder.id }
      : item));
    setNotice(notificationId
      ? `Reminder restored for ${displayDate(dueAt)}.`
      : `Reminder restored in-app for ${displayDate(dueAt)}; a device alert was not scheduled.`);
  }

  function clearReminderHistory() {
    if (reminderHistory.length === 0) return;
    Alert.alert("Clear completed history?", "This removes all completed reminder entries from this device. Upcoming reminders will not be affected.", [
      { text: "Cancel", style: "cancel" },
      { text: "Clear history", style: "destructive", onPress: () => {
        setReminderHistory([]);
        setNotice("Completed reminder history cleared.");
      } },
    ]);
  }
  function removeReminderCompletion(completion: ReminderCompletion) {
    Alert.alert("Remove completed reminder?", `Remove “${completion.title}” from completed history?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => {
        setReminderHistory((current) => current.filter((item) => item.id !== completion.id));
        setSelectedReminderCompletion(null);
        setNotice("Completed reminder removed from history.");
      } },
    ]);
  }
  async function deleteReminder(reminder: CareReminder) {
    Alert.alert("Remove reminder?", `Remove “${reminder.title}” from your reminders?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => {
        if (reminder.notificationId) void getNotificationsModule()?.cancelScheduledNotificationAsync(reminder.notificationId).catch(() => undefined);
        setReminders((current) => current.filter((item) => item.id !== reminder.id));
        setNotice("Reminder removed.");
      } },
    ]);
  }

  function removeJournalEntry(entry: JournalEntry) {
    Alert.alert("Remove journal entry?", `Remove “${entry.title}” from this pet's journal?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => {
        const persistedEntry = journal.find((item) => item.id === entry.id);
        if (persistedEntry) void deleteJournalFiles(persistedEntry);
        setJournal((current) => current.filter((item) => item.id !== entry.id));
        if (selectedJournalEntry?.id === entry.id) setSelectedJournalEntry(null);
        setNotice("Journal entry removed.");
      } },
    ]);
  }

  function removeProfilePicture() {
    Alert.alert("Remove profile picture?", "This only removes the picture from this pet's profile.", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => setProfilePhotoUri(undefined) },
    ]);
  }

  function renderPetForm() {
    return (
      <View style={[styles.formCard, { backgroundColor: palette.card, borderColor: palette.line }]}>
        <Text style={[styles.cardTitle, { color: palette.text }]}>{editingPetId ? "Edit pet profile" : "Add a pet"}</Text>
        <CareInput value={petName} onChangeText={setPetName} placeholder="Pet's name *" palette={palette} maxLength={50} />
        <CareInput value={petSpecies} onChangeText={setPetSpecies} placeholder="Species (e.g. dog, cat, fish) *" palette={palette} />
        <CareInput value={petBreed} onChangeText={setPetBreed} placeholder="Breed or type (optional)" palette={palette} />
        <CareInput value={petMicrochipNumber} onChangeText={setPetMicrochipNumber} placeholder="Microchip number (optional)" palette={palette} />
        <Text style={[styles.fieldLabel, { color: palette.muted }]}>GENDER</Text>
        <View style={styles.actionRow}>
          {(["Female", "Male", "Unknown"] as const).map((gender) => {
            const selected = (petGender ?? "Unknown") === gender;
            return (
              <Pressable key={gender} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => setPetGender(gender)} style={[styles.chip, { backgroundColor: selected ? palette.action : palette.bg, borderColor: selected ? palette.action : palette.line }]}>
                <Text style={[styles.chipText, { color: selected ? "#FFFFFF" : palette.text }]}>{gender}</Text>
              </Pressable>
            );
          })}
        </View>
        <CalendarDateField value={petBirthDate} onChange={setPetBirthDate} placeholder="Birth date (optional)" palette={palette} optional />
        <CalendarDateField value={petAdoptionDate} onChange={setPetAdoptionDate} placeholder="Adoption date (optional)" palette={palette} optional />
        <CareInput value={petWeight} onChangeText={setPetWeight} placeholder="Weight with units, e.g. 12 kg (optional)" palette={palette} />
        <CareInput value={petAllergies} onChangeText={setPetAllergies} placeholder="Allergies or important notes (optional)" palette={palette} multiline />
        <Text style={[styles.fieldLabel, { color: palette.muted }]}>PET INSURANCE · OPTIONAL</Text>
        <CareInput value={petInsuranceProvider} onChangeText={setPetInsuranceProvider} placeholder="Insurance provider" palette={palette} maxLength={80} />
        <CareInput value={petInsurancePolicyNumber} onChangeText={setPetInsurancePolicyNumber} placeholder="Policy number" palette={palette} maxLength={80} />
        <Text style={[styles.fieldLabel, { color: palette.muted }]}>EMERGENCY CONTACT · OPTIONAL</Text>
        <CareInput value={petEmergencyContactName} onChangeText={setPetEmergencyContactName} placeholder="Contact name" palette={palette} maxLength={80} />
        <View style={styles.inlineInputs}>
          <View style={styles.grow}>
            <CareInput value={petEmergencyContactRelationship} onChangeText={setPetEmergencyContactRelationship} placeholder="Relationship" palette={palette} maxLength={50} />
          </View>
          <View style={styles.grow}>
            <CareInput value={petEmergencyContactPhone} onChangeText={setPetEmergencyContactPhone} placeholder="Phone number" palette={palette} keyboardType="phone-pad" maxLength={30} />
          </View>
        </View>
        {petBirthDate ? (
          <Pressable accessibilityRole="switch" accessibilityState={{ checked: petBirthdayReminderEnabled }} accessibilityLabel="Toggle birthday reminder" onPress={() => setPetBirthdayReminderEnabled((value) => !value)} style={[styles.reminderOption, { backgroundColor: palette.soft }]}>
            <View style={[styles.checkBox, { borderColor: palette.action, backgroundColor: petBirthdayReminderEnabled ? palette.action : "transparent" }]}> 
              {petBirthdayReminderEnabled ? <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>✓</Text> : null}
            </View>
            <Text style={[styles.reminderOptionText, { color: palette.text }]}>Send annual birthday reminder</Text>
          </Pressable>
        ) : null}
        <Text style={[styles.fieldLabel, { color: palette.muted }]}>PROFILE PICTURE</Text>
        <View style={styles.photoPickerRow}>
          {profilePhotoUri ? (
            <Image source={{ uri: profilePhotoUri }} contentFit="cover" style={styles.profilePhotoPreview} />
          ) : (
            <View style={[styles.profilePhotoPlaceholder, { backgroundColor: palette.soft }]}><Text style={{ fontSize: 26 }}>🐾</Text></View>
          )}
          <View style={styles.grow}>
            <View style={styles.actionRow}>
              {profilePhotoUri ? <IconActionButton icon="remove" label="Remove profile picture" onPress={removeProfilePicture} palette={palette} destructive /> : null}
              <CareButton title="Choose photo" onPress={() => void chooseProfilePhoto("library")} palette={palette} secondary />
              <CameraActionButton title="Take photo" onPress={() => void chooseProfilePhoto("camera")} palette={palette} />
            </View>
          </View>
        </View>
        <Text style={[styles.helpText, { color: palette.muted }]}>Choose a profile picture here; manage additional photos in Pet Albums.</Text>
        <View style={styles.actionRow}>
          <CareButton title={editingPetId ? "Save changes" : "Save pet"} onPress={savePet} palette={palette} />
          <CareButton title="Cancel" onPress={resetPetForm} palette={palette} secondary />
        </View>
      </View>
    );
  }

  function renderHealthRecordForm(pet: PetProfile) {
    return (
      <View onLayout={(event) => { healthFormOffsetRef.current = event.nativeEvent.layout.y; }} style={[styles.formCard, { backgroundColor: palette.card, borderColor: palette.line }]}>
        <Text style={[styles.cardTitle, { color: palette.text }]}>{editingHealthRecordId ? "Update healthcare record" : "Add healthcare record"}</Text>
        <Text style={[styles.fieldLabel, { color: palette.muted }]}>RECORD TYPE</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`Record type: ${healthType}. Choose type`} onPress={() => setHealthTypePickerOpen(true)} style={[styles.typeDropdown, { backgroundColor: palette.bg, borderColor: palette.line }]}>
          <Text style={{ color: palette.text, fontSize: 11, fontWeight: "700" }}>{healthType}</Text>
          <View style={[styles.dropdownCaret, { borderColor: palette.primary }]} />
        </Pressable>
        {healthType === "Other" ? <CareInput value={customHealthType} onChangeText={setCustomHealthType} placeholder="Enter other record type *" palette={palette} /> : null}
        <CareInput value={healthTitle} onChangeText={setHealthTitle} placeholder="Name, dose, or visit reason (optional)" palette={palette} maxLength={50} />
        <CalendarDateField value={healthDateGiven} onChange={setHealthDateGiven} placeholder="Choose date given *" palette={palette} />
        <CalendarDateField value={healthNextDueDate} onChange={setHealthNextDueDate} placeholder="Choose next due date (optional)" palette={palette} optional />
        <CareInput value={healthClinic} onChangeText={setHealthClinic} placeholder="Clinic or veterinarian (optional)" palette={palette} />
        <CareInput value={healthNotes} onChangeText={setHealthNotes} placeholder="Notes, results, or instructions (optional)" palette={palette} multiline />
        <Text style={[styles.fieldLabel, { color: palette.muted }]}>PHOTOS · {healthRecordPhotos.length}/5</Text>
        <Text style={[styles.helpText, { color: palette.muted }]}>Attach up to five photos to this healthcare record.</Text>
        <View style={styles.actionRow}>
          <CareButton title="＋ Add photos" onPress={() => void chooseHealthRecordPhotos()} palette={palette} secondary disabled={healthRecordPhotos.length >= 5} />
        </View>
        {healthRecordPhotos.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.journalPhotoStrip}>
            {healthRecordPhotos.map((uri, index) => (
              <View key={`${uri}-${index}`} style={styles.journalPhotoItem}>
                <Image source={{ uri }} contentFit="cover" style={styles.journalPhotoPreview} />
                  <Pressable accessibilityRole="button" accessibilityLabel={`Remove healthcare record photo ${index + 1}`} onPress={() => removeHealthRecordPhoto(uri)} style={[styles.journalAttachmentRemove, { backgroundColor: palette.soft }]}>
                    <ActionIcon name="remove" color={palette.primary} cutout={palette.soft} size={12} />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        ) : null}
        <Text style={[styles.fieldLabel, { color: palette.muted }]}>DOCUMENTS · {healthRecordDocuments.length}/10</Text>
        <Text style={[styles.helpText, { color: palette.muted }]}>Attach up to ten files, including PDF, Word, and Excel documents.</Text>
        <CareButton title="＋ Attach documents" onPress={() => void chooseHealthRecordDocuments()} palette={palette} secondary disabled={healthRecordDocuments.length >= 10} />
        {healthRecordDocuments.map((document) => (
          <View key={document.id} style={styles.journalPendingDocument}>
            <Text style={[styles.bodyText, styles.grow, { color: palette.text }]} numberOfLines={1}>📎 {document.name}</Text>
            <IconActionButton icon="remove" label={`Remove ${document.name}`} onPress={() => removeHealthRecordDocument(document)} palette={palette} destructive />
          </View>
        ))}
        {healthNextDueDate ? (
          <Pressable accessibilityRole="switch" accessibilityState={{ checked: createReminderForDueDate }} onPress={() => setCreateReminderForDueDate((value) => !value)} style={[styles.reminderOption, { backgroundColor: palette.soft }]}>
            <View style={[styles.checkBox, { borderColor: palette.action, backgroundColor: createReminderForDueDate ? palette.action : "transparent" }]}>
              {createReminderForDueDate ? <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>✓</Text> : null}
            </View>
            <Text style={[styles.reminderOptionText, { color: palette.text }]}>Add a reminder for {healthNextDueDate}</Text>
          </Pressable>
        ) : null}
        <View style={styles.actionRow}>
          <CareButton title={editingHealthRecordId ? "Update record" : "Save record"} onPress={() => void saveHealthRecord(pet.id)} palette={palette} />
          {editingHealthRecordId ? <CareButton title="Cancel edit" onPress={cancelHealthRecordForm} palette={palette} secondary /> : null}
        </View>
        <Text style={[styles.helpText, { color: palette.muted }]}>Choose dates from the calendar. Due dates are follow-up reminders, not medical advice.</Text>

        <Modal visible={healthTypePickerOpen} transparent animationType="fade" onRequestClose={() => setHealthTypePickerOpen(false)}>
          <View style={styles.modalScrim}>
            <View style={[styles.typePickerModal, { backgroundColor: palette.card }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.cardTitle, { color: palette.text }]}>Choose record type</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Close type picker" onPress={() => setHealthTypePickerOpen(false)}><Text style={{ color: palette.primary, fontSize: 22 }}>×</Text></Pressable>
              </View>
              <ScrollView style={styles.typeOptionsList}>
                {availableHealthTypes.map((type) => (
                  <Pressable key={type} accessibilityRole="radio" accessibilityState={{ selected: type === healthType }} onPress={() => { setHealthType(type); setHealthTypePickerOpen(false); }} style={[styles.typeOptionRow, { borderBottomColor: palette.line }]}>
                    <Text style={[styles.typeOptionLabel, { color: type === healthType ? palette.primary : palette.text }]}>{type}</Text>
                    {type === healthType ? <Text style={{ color: palette.primary, fontWeight: "900" }}>✓</Text> : null}
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  function saveWeightMeasurement(pet: PetProfile) {
    const parsedWeight = Number(weightValue.trim().replace(/,/g, ""));
    if (!Number.isFinite(parsedWeight) || parsedWeight <= 0 || parsedWeight > 10000 || !isValidDateInput(weightMeasuredAt) || weightMeasuredAt > localDateInput(new Date())) {
      setNotice("Enter a positive weight and a valid measurement date no later than today.");
      return;
    }
    setWeightMeasurements((current) => [...current, { id: makeId(), petId: pet.id, value: parsedWeight, unit: weightUnit, measuredAt: weightMeasuredAt, createdAt: new Date().toISOString() }]);
    setWeightValue("");
    setWeightMeasuredAt(localDateInput(new Date()));
    setWeightFormOpen(false);
    setNotice(`Weight measurement saved for ${pet.name}.`);
  }

  function renderPetDetail(pet: PetProfile) {
    const records = healthRecords
      .filter((record) => record.petId === pet.id)
      .sort((a, b) => b.dateGiven.localeCompare(a.dateGiven));
    const albumPhotos = pet.albumPhotos ?? [];
    const pinnedAlbumPhotos = albumPhotos.filter((photo) => photo.pinned).slice(0, MAX_PINNED_PET_ALBUM_PHOTOS);
    const normalizedHealthQuery = healthSearchQuery.trim().toLocaleLowerCase();
    const normalizedClinicFilter = healthClinicFilter.trim().toLocaleLowerCase();
    const todayDate = localDateInput(new Date());
    const rangeStartDate = healthDateRange === "this-year"
      ? `${new Date().getFullYear()}-01-01`
      : (() => {
        const start = new Date();
        start.setDate(start.getDate() - (healthDateRange === "30-days" ? 29 : 89));
        return localDateInput(start);
      })();
    const availableHealthTypes = [...new Set(records.map(getHealthRecordGroupLabel))].sort((a, b) => a.localeCompare(b));
    const filteredRecords = records.filter((record) => {
      const matchesQuery = !normalizedHealthQuery
        || [record.type, record.customType, record.title, record.dateGiven, record.nextDueDate, record.clinic, record.notes]
          .some((value) => value?.toLocaleLowerCase().includes(normalizedHealthQuery));
      const matchesType = healthTypeFilter === "All types" || getHealthRecordGroupLabel(record) === healthTypeFilter;
      const matchesDateRange = healthDateRange === "all" || (record.dateGiven >= rangeStartDate && record.dateGiven <= todayDate);
      const matchesClinic = !normalizedClinicFilter || record.clinic.toLocaleLowerCase().includes(normalizedClinicFilter);
      return matchesQuery && matchesType && matchesDateRange && matchesClinic;
    });
    const activeHealthFilterCount = Number(healthTypeFilter !== "All types")
      + Number(healthDateRange !== "all")
      + Number(Boolean(normalizedClinicFilter));
    const vetVisits = filteredRecords.filter((record) => record.type === "Vet visit");
    const recordTypes = [...new Set(filteredRecords.map(getHealthRecordGroupLabel))];
    const petWeights = weightMeasurements
      .filter((measurement) => measurement.petId === pet.id)
      .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
    const recentWeights = petWeights.slice(-8);
    const maxWeightKg = Math.max(...recentWeights.map((measurement) => measurement.value * (measurement.unit === "lb" ? 0.45359237 : 1)), 0);
    const weightChange = petWeights.length > 1
      ? petWeights[petWeights.length - 1].value * (petWeights[petWeights.length - 1].unit === "lb" ? 0.45359237 : 1)
        - petWeights[petWeights.length - 2].value * (petWeights[petWeights.length - 2].unit === "lb" ? 0.45359237 : 1)
      : null;
    const upcomingReminder = reminders
      .filter((reminder) => reminder.petId === pet.id && new Date(reminder.dueAt) >= new Date())
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
    const nextHealthDue = healthRecords
      .filter((record) => record.petId === pet.id && record.nextDueDate && record.nextDueDate >= localDateInput(new Date()))
      .sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate))[0];
    const recentActivity = [
      ...journal.filter((entry) => entry.petId === pet.id).map((entry) => ({ title: entry.title, date: entry.createdAt, kind: "Journal" })),
      ...records.map((record) => ({ title: record.title, date: `${record.dateGiven}T12:00:00`, kind: getHealthRecordGroupLabel(record) })),
      ...petWeights.map((measurement) => ({ title: `Weight: ${measurement.value} ${measurement.unit}`, date: `${measurement.measuredAt}T12:00:00`, kind: "Weight" })),
    ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
    const ageLabel = petAge(pet.birthDate);

    if (healthRecordFormOpen) {
      return (
        <>
          <Pressable onPress={cancelHealthRecordForm} style={styles.detailBackButton}>
            <Text style={{ color: palette.primary, fontWeight: "800" }}>‹  Back to {pet.name}'s profile</Text>
          </Pressable>
          {renderHealthRecordForm(pet)}
        </>
      );
    }

    if (weightFormOpen) {
      return (
        <>
          <Pressable onPress={() => setWeightFormOpen(false)} style={styles.detailBackButton}>
            <Text style={{ color: palette.primary, fontWeight: "800" }}>‹  Back to {pet.name}'s profile</Text>
          </Pressable>
          <View style={[styles.formCard, { backgroundColor: palette.card, borderColor: palette.line }]}>
            <Text style={[styles.cardTitle, { color: palette.text }]}>Add weight measurement for {pet.name}</Text>
            <CareInput value={weightValue} onChangeText={setWeightValue} placeholder="Weight (e.g. 4.2) *" palette={palette} keyboardType="decimal-pad" />
            <View style={styles.actionRow}>
              {(["kg", "lb"] as const).map((unit) => {
                const selected = weightUnit === unit;
                return <Pressable key={unit} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => setWeightUnit(unit)} style={[styles.chip, { backgroundColor: selected ? palette.action : palette.bg, borderColor: selected ? palette.action : palette.line }]}><Text style={[styles.chipText, { color: selected ? "#FFFFFF" : palette.text }]}>{unit}</Text></Pressable>;
              })}
            </View>
            <CalendarDateField value={weightMeasuredAt} onChange={setWeightMeasuredAt} placeholder="Measurement date" palette={palette} />
            <View style={styles.actionRow}>
              <CareButton title="Save measurement" onPress={() => saveWeightMeasurement(pet)} palette={palette} />
              <CareButton title="Cancel" onPress={() => setWeightFormOpen(false)} palette={palette} secondary />
            </View>
          </View>
        </>
      );
    }

    return (
      <>
        <Pressable onPress={() => { setWeightFormOpen(false); setActivePetId(null); }} style={styles.detailBackButton}>
          <Text style={{ color: palette.primary, fontWeight: "800" }}>‹  Back to My Pets</Text>
        </Pressable>
        <View style={[styles.recordCard, styles.petProfileCard, { backgroundColor: palette.card, borderColor: palette.line }]}>
          <View style={styles.petProfileActions}>
            <IconActionButton icon="edit" label={`Edit ${pet.name}'s profile`} onPress={() => editPet(pet)} palette={palette} />
            <IconActionButton icon="remove" label={`Remove ${pet.name}'s profile`} onPress={() => deletePet(pet)} palette={palette} destructive />
          </View>
          <View style={styles.petDetailHeader}>
            {pet.profilePhotoUri ? (
              <Pressable accessibilityRole="button" accessibilityLabel={`View ${pet.name}'s profile photo full screen`} onPress={() => setPhotoViewerUri(pet.profilePhotoUri ?? null)}>
                <Image source={{ uri: pet.profilePhotoUri }} contentFit="cover" style={styles.petDetailAvatar} />
              </Pressable>
            ) : (
              <View style={[styles.petDetailAvatar, styles.petDetailAvatarPlaceholder, { backgroundColor: palette.soft }]}><Text style={{ fontSize: 34 }}>🐾</Text></View>
            )}
            <View style={[styles.grow, styles.petDetailCopy]}>
              <Text style={[styles.petDetailName, { color: palette.text }]}>{pet.name}</Text>
              <Text style={[styles.bodyText, { color: palette.primary }]}>{[pet.species, pet.breed].filter(Boolean).join(" · ")}</Text>
              {pet.gender && pet.gender !== "Unknown" ? <Text style={[styles.bodyText, { color: palette.muted }]}>{pet.gender}</Text> : null}
              {ageLabel ? <Text style={[styles.bodyText, { color: palette.muted }]}>{ageLabel}</Text> : null}
            </View>
          </View>
          {pet.weight ? <Text style={[styles.bodyText, { color: palette.text }]}>Profile weight: {pet.weight}</Text> : null}
          {pet.microchipNumber ? <Text style={[styles.bodyText, { color: palette.text }]}>Microchip number: {pet.microchipNumber}</Text> : null}
          {pet.adoptionDate ? <Text style={[styles.bodyText, { color: palette.text }]}>Adoption date: {new Date(`${pet.adoptionDate}T00:00:00`).toLocaleDateString()}</Text> : null}
          {pet.insuranceProvider || pet.insurancePolicyNumber ? (
            <View style={styles.petDetailInfoGroup}>
              <Text style={[styles.fieldLabel, { color: palette.muted }]}>PET INSURANCE</Text>
              {pet.insuranceProvider ? <Text style={[styles.bodyText, { color: palette.text }]}>{pet.insuranceProvider}</Text> : null}
              {pet.insurancePolicyNumber ? <Text style={[styles.bodyText, { color: palette.text }]}>Policy number: {pet.insurancePolicyNumber}</Text> : null}
            </View>
          ) : null}
          {pet.emergencyContactName || pet.emergencyContactRelationship || pet.emergencyContactPhone ? (
            <View style={styles.petDetailInfoGroup}>
              <Text style={[styles.fieldLabel, { color: palette.muted }]}>EMERGENCY CONTACT</Text>
              {pet.emergencyContactName ? <Text style={[styles.bodyText, { color: palette.text }]}>{pet.emergencyContactName}</Text> : null}
              {pet.emergencyContactRelationship ? <Text style={[styles.bodyText, { color: palette.text }]}>{pet.emergencyContactRelationship}</Text> : null}
              {pet.emergencyContactPhone ? <Text style={[styles.bodyText, { color: palette.text }]}>{pet.emergencyContactPhone}</Text> : null}
            </View>
          ) : null}
          {pet.allergies ? (
            <View style={styles.notesHeaderRow}>
              <Text style={[styles.bodyText, styles.grow, { color: palette.text }]}>Notes: {pet.allergies}</Text>
              <CopyNotesButton text={pet.allergies} palette={palette} onCopied={() => setNotice("Notes copied to clipboard.")} />
            </View>
          ) : null}
        </View>

        <View style={[styles.petAlbumCard, { backgroundColor: palette.card, borderColor: palette.line }]}>
          <View style={styles.petAlbumHeader}>
            <View style={styles.grow}>
              <Text style={[styles.fieldLabel, { color: palette.primary }]}>MEMORIES & MOMENTS</Text>
              <Text style={[styles.cardTitle, { color: palette.text }]}>Pet albums</Text>
            </View>
            <Text style={[styles.helpText, { color: palette.muted }]}>{pinnedAlbumPhotos.length}/{MAX_PINNED_PET_ALBUM_PHOTOS} pinned</Text>
          </View>
          <Text style={[styles.helpText, { color: palette.muted }]}>Pin up to five photos to keep them featured in {pet.name}'s view.</Text>
          {pinnedAlbumPhotos.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.petAlbumPinnedStrip}>
              {pinnedAlbumPhotos.map((photo) => (
                <Pressable key={photo.id} accessibilityRole="button" accessibilityLabel={`View pinned photo${photo.description ? `: ${photo.description}` : ""}`} onPress={() => setPhotoViewerUri(photo.uri)} style={styles.petAlbumPinnedItem}>
                  <Image source={{ uri: photo.uri }} contentFit="cover" style={styles.petAlbumPinnedImage} />
                  {photo.description ? <Text style={[styles.petAlbumPinnedDescription, { color: palette.text }]} numberOfLines={2}>{photo.description}</Text> : null}
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <Text style={[styles.helpText, { color: palette.muted }]}>Photos you pin from the album will appear here.</Text>
          )}
          <View style={styles.petAlbumListHeader}>
            <Text style={[styles.fieldLabel, { color: palette.muted }]}>ALBUM · {albumPhotos.length}/{MAX_PET_ALBUM_PHOTOS} PHOTOS</Text>
            <CareButton title={albumPhotos.length ? "Manage album" : "＋ Add photos"} onPress={() => { setSelectedAlbumPhotoIds([]); setPetAlbumModalPetId(pet.id); }} palette={palette} secondary />
          </View>
        </View>

        <View style={[styles.dashboardCard, { backgroundColor: palette.soft }]}>
          <Text style={[styles.cardTitle, { color: palette.text }]}>{pet.name}'s care overview</Text>
          <View style={styles.dashboardColumns}>
            <View style={styles.dashboardSection}>
              <Text style={[styles.fieldLabel, { color: palette.muted }]}>NEXT CARE</Text>
              {upcomingReminder ? (
                <Text style={[styles.dashboardValue, { color: palette.text }]}>{upcomingReminder.title} · {new Date(upcomingReminder.dueAt).toLocaleDateString()}</Text>
              ) : <Text style={[styles.dashboardValue, { color: palette.muted }]}>No upcoming reminder</Text>}
            </View>
            <View style={styles.dashboardSection}>
              <Text style={[styles.fieldLabel, { color: palette.muted }]}>HEALTH FOLLOW-UP</Text>
              {nextHealthDue ? (
                <Text style={[styles.dashboardValue, { color: palette.text }]}>{getHealthRecordTypeName(nextHealthDue)} · {nextHealthDue.nextDueDate}</Text>
              ) : <Text style={[styles.dashboardValue, { color: palette.muted }]}>No due dates recorded</Text>}
            </View>
            <View style={styles.dashboardSection}>
              <Text style={[styles.fieldLabel, { color: palette.muted }]}>RECENT ACTIVITY</Text>
              {recentActivity.length ? recentActivity.map((activity, index) => (
                <Text key={`${activity.kind}-${activity.date}-${index}`} style={[styles.dashboardValue, { color: palette.text }]} numberOfLines={1}>
                  {activity.kind} · {activity.title} · {new Date(activity.date).toLocaleDateString()}
                </Text>
              )) : <Text style={[styles.dashboardValue, { color: palette.muted }]}>No recent activity yet</Text>}
            </View>
          </View>
        </View>

        <View style={[styles.weightCard, { backgroundColor: palette.card, borderColor: palette.line }]}>
          <View style={[styles.healthHistoryHeading, styles.weightTrackingHeading]}>
            <View style={styles.grow}>
              <Text style={[styles.fieldLabel, { color: palette.primary }]}>GROWTH & WELLNESS</Text>
              <Text style={[styles.cardTitle, { color: palette.text }]}>Weight tracking</Text>
            </View>
            {petWeights.length ? <Text style={[styles.helpText, { color: palette.muted }]}>{petWeights.length} measurements</Text> : null}
          </View>
          {petWeights.length ? (
            <>
              <View style={styles.weightChart} accessibilityRole="image" accessibilityLabel={`Weight history for ${pet.name}`}>
                {recentWeights.map((measurement) => {
                  const normalizedKg = measurement.value * (measurement.unit === "lb" ? 0.45359237 : 1);
                  const barPercent = maxWeightKg ? Math.max((normalizedKg / maxWeightKg) * 100, 8) : 8;
                  return (
                    <View key={measurement.id} style={styles.weightChartItem}>
                      <Text style={[styles.weightChartValue, { color: palette.text }]}>{measurement.value} {measurement.unit}</Text>
                      <View style={[styles.weightBarTrack, { backgroundColor: palette.soft }]}>
                        <View style={[styles.weightBar, { width: `${barPercent}%`, backgroundColor: palette.action }]} />
                      </View>
                      <Text style={[styles.weightChartDate, { color: palette.muted }]}>{new Date(`${measurement.measuredAt}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</Text>
                    </View>
                  );
                })}
              </View>
              {weightChange !== null ? (
                <Text style={[styles.helpText, { color: palette.muted }]}>
                  Change since previous measurement: {weightChange > 0 ? "+" : ""}{(weightChange * (petWeights[petWeights.length - 1].unit === "lb" ? 2.20462 : 1)).toFixed(2)} {petWeights[petWeights.length - 1].unit}
                </Text>
              ) : null}
            </>
          ) : <Text style={[styles.helpText, { color: palette.muted }]}>Record measurements over time to see this pet's weight trend.</Text>}
          <CareButton title="＋  Add weight measurement" onPress={() => setWeightFormOpen(true)} palette={palette} secondary />
        </View>

        <View style={[styles.listSectionCard, { backgroundColor: palette.card, borderColor: palette.line }]}>
          <View style={[styles.healthHistoryHeading, styles.listSectionHeader]}>
            <View style={styles.grow}>
              <Text style={[styles.fieldLabel, { color: palette.primary }]}>HEALTHCARE</Text>
              <Text style={[styles.cardTitle, { color: palette.text }]}>Health & vet history</Text>
            </View>
            <Text style={[styles.helpText, { color: palette.muted }]}>{filteredRecords.length}{filteredRecords.length !== records.length ? ` of ${records.length}` : ""} records</Text>
          </View>
          <CareButton title="＋  Add healthcare record" onPress={beginAddHealthRecord} palette={palette} />
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: healthFiltersExpanded }}
            accessibilityLabel={`${healthFiltersExpanded ? "Hide" : "Show"} health history filters${activeHealthFilterCount ? `, ${activeHealthFilterCount} active` : ""}`}
            onPress={() => setHealthFiltersExpanded((expanded) => !expanded)}
            style={({ pressed }) => [styles.healthFilterDisclosure, { backgroundColor: palette.soft, opacity: pressed ? 0.76 : 1 }]}
          >
            <Text style={[styles.healthFilterDisclosureTitle, { color: palette.text }]}>Filters{activeHealthFilterCount ? ` · ${activeHealthFilterCount} active` : ""}</Text>
            <Text style={[styles.healthFilterDisclosureAction, { color: palette.primary }]}>{healthFiltersExpanded ? "Hide" : "Show"}</Text>
          </Pressable>
          {healthFiltersExpanded ? (
            <View style={styles.healthFiltersPanel}>
              <Text style={[styles.fieldLabel, { color: palette.muted }]}>FILTER BY RECORD TYPE</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {["All types", ...availableHealthTypes].map((type) => {
                  const selected = healthTypeFilter === type;
                  return (
                    <Pressable
                      key={type}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      onPress={() => setHealthTypeFilter(type)}
                      style={[styles.chip, { backgroundColor: selected ? palette.action : palette.bg, borderColor: selected ? palette.action : palette.line }]}
                    >
                      <Text style={[styles.chipText, { color: selected ? "#FFFFFF" : palette.text }]}>{type}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <Text style={[styles.fieldLabel, { color: palette.muted }]}>DATE GIVEN</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {HEALTH_DATE_RANGE_OPTIONS.map((option) => {
                  const selected = healthDateRange === option.id;
                  return (
                    <Pressable
                      key={option.id}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      onPress={() => setHealthDateRange(option.id)}
                      style={[styles.chip, { backgroundColor: selected ? palette.action : palette.bg, borderColor: selected ? palette.action : palette.line }]}
                    >
                      <Text style={[styles.chipText, { color: selected ? "#FFFFFF" : palette.text }]}>{option.label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <TextInput
                accessibilityLabel={`Filter ${pet.name}'s health history by clinic or provider`}
                value={healthClinicFilter}
                onChangeText={setHealthClinicFilter}
                placeholder="Filter by clinic or provider"
                placeholderTextColor={palette.muted}
                style={[styles.input, styles.healthClinicFilter, { backgroundColor: palette.bg, color: palette.text, borderColor: palette.line }]}
              />
            </View>
          ) : null}
          <TextInput
            accessibilityLabel={`Search ${pet.name}'s health history`}
            value={healthSearchQuery}
            onChangeText={setHealthSearchQuery}
            placeholder="Search health history"
            placeholderTextColor={palette.muted}
            style={[styles.input, styles.healthSearchInput, { backgroundColor: palette.bg, color: palette.text, borderColor: palette.line }]}
          />
          <View style={[styles.healthHistoryDivider, { backgroundColor: palette.line }]} />
          <ScrollView style={[styles.listSectionScroll, styles.healthHistoryResults]} contentContainerStyle={styles.listSectionScrollContent} nestedScrollEnabled showsVerticalScrollIndicator>
            {recordTypes.map((type) => {
              const typeRecords = filteredRecords.filter((record) => getHealthRecordGroupLabel(record) === type);
              if (typeRecords.length === 0) return null;
              return (
                <View key={type} style={styles.healthGroup}>
                  <Text style={[styles.healthGroupTitle, { color: palette.text }]}>{type}{type === "Vet visit" ? ` · ${vetVisits.length}` : ""}</Text>
                  {typeRecords.map((record) => {
                    const overdue = Boolean(record.nextDueDate) && record.nextDueDate < localDateInput(new Date());
                    return (
                      <Pressable
                        key={record.id}
                        accessibilityRole="button"
                        accessibilityLabel={`Open full details for ${record.title}, given ${record.dateGiven}`}
                        onPress={() => setSelectedHealthRecord(record)}
                        style={({ pressed }) => [styles.healthRecordCard, { backgroundColor: palette.card, borderColor: overdue ? "#D87967" : palette.line, opacity: pressed ? 0.76 : 1 }]}
                      >
                        <View style={styles.cardHeaderRow}>
                          <View style={[styles.iconBadge, { backgroundColor: palette.soft }]}><SolidPetIcon name={getHealthRecordIcon(record)} color={palette.primary} cutout={palette.soft} /></View>
                          <View style={styles.grow}>
                            <Text style={[styles.healthRecordTitle, { color: palette.text }]}>{record.title}</Text>
                            <Text style={[styles.bodyText, { color: palette.muted }]}>Given: {record.dateGiven}</Text>
                            <View style={styles.journalAttachmentIndicators}>
                              {(record.photos?.length ?? 0) > 0 ? <Text style={[styles.journalIndicator, { color: palette.primary }]}>＋▧ {record.photos?.length} photos</Text> : null}
                              {(record.documents?.length ?? 0) > 0 ? <Text style={[styles.journalIndicator, { color: palette.primary }]}>＋📎 {record.documents?.length} files</Text> : null}
                            </View>
                          </View>
                          {record.nextDueDate ? <Text style={[styles.nextDueText, { color: overdue ? "#C46C5C" : palette.primary }]}>{overdue ? "Overdue · " : "Next · "}{record.nextDueDate}</Text> : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              );
            })}
            {records.length === 0 ? (
              <EmptyCard title="No health records yet" description="Add vet visits, vaccinations, and other healthcare records with optional next due dates." palette={palette} />
            ) : filteredRecords.length === 0 ? (
              <EmptyCard title="No matching records" description="Try a different title, record type, clinic, date, or note." palette={palette} />
            ) : null}
          </ScrollView>
        </View>
      </>
    );
  }

  function renderPets() {
    const activePet = pets.find((pet) => pet.id === activePetId);
    if (activePet) return renderPetDetail(activePet);
    if (petFormOpen) {
      return (
        <>
          <Pressable onPress={resetPetForm} style={styles.detailBackButton}>
            <Text style={{ color: palette.primary, fontWeight: "800" }}>‹  Back to My Pets</Text>
          </Pressable>
          {renderPetForm()}
        </>
      );
    }
    return (
      <>
        <View style={[styles.introCard, { backgroundColor: palette.soft }]}>
          <Text style={[styles.cardTitle, { color: palette.text }]}>Know each pet a little better</Text>
          <Text style={[styles.bodyText, { color: palette.muted }]}>Profiles stay on this device and help organize reminders and journal entries.</Text>
        </View>
        <CareButton title="＋  Add a pet profile" onPress={() => { resetPetForm(); setPetFormOpen(true); }} palette={palette} />
        {pets.length === 0 ? (
          <EmptyCard title="No pet profiles yet" description="Add a profile to start a personal care record." palette={palette} />
        ) : pets.map((pet) => (
          <View key={pet.id} style={[styles.recordCard, { backgroundColor: palette.card, borderColor: palette.line }]}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Open ${pet.name}'s profile and healthcare history`} onPress={() => { setHealthSearchQuery(""); setHealthFiltersExpanded(false); setHealthTypeFilter("All types"); setHealthDateRange("all"); setHealthClinicFilter(""); setActivePetId(pet.id); }} style={({ pressed }) => [styles.cardHeaderRow, pressed && { opacity: 0.75 }]}>
              {pet.profilePhotoUri ? (
                <Image source={{ uri: pet.profilePhotoUri }} contentFit="cover" style={styles.petProfileImage} />
              ) : (
                <View style={[styles.petProfilePlaceholder, { backgroundColor: palette.soft }]}><Text style={{ fontSize: 25 }}>🐾</Text></View>
              )}
              <View style={[styles.grow, styles.petListCopy]}>
                <Text style={[styles.cardTitle, { color: palette.text }]}>{pet.name}</Text>
                <Text style={[styles.bodyText, { color: palette.primary }]}>{pet.species}</Text>
                {pet.breed ? <Text style={[styles.bodyText, { color: palette.muted }]}>{pet.breed}</Text> : null}
              </View>
              <Text style={[styles.petOpenArrow, { color: palette.primary }]}>›</Text>
            </Pressable>
          </View>
        ))}
      </>
    );
  }

  function renderJournal() {
    if (journalFormOpen) {
      return (
        <>
          <Pressable onPress={cancelJournalForm} style={styles.detailBackButton}>
            <Text style={{ color: palette.primary, fontWeight: "800" }}>‹  Back to Journal</Text>
          </Pressable>
          <View style={[styles.formCard, { backgroundColor: palette.card, borderColor: palette.line }]}>
            <Text style={[styles.cardTitle, { color: palette.text }]}>{editingJournalEntryId ? "Edit journal entry" : "Add a care note"}</Text>
            <Text style={[styles.fieldLabel, { color: palette.muted }]}>FOR WHICH PET?</Text>
            <PetChips pets={pets} selectedPetId={selectedPetId} onSelect={setSelectedPetId} palette={palette} allowGeneral />
            <CareInput value={entryTitle} onChangeText={setEntryTitle} placeholder="Short title *" palette={palette} maxLength={50} />
            <CareInput value={entryNotes} onChangeText={setEntryNotes} placeholder="Notes, measurements, or observations" palette={palette} multiline />
            <Text style={[styles.fieldLabel, { color: palette.muted }]}>PHOTOS · {journalPhotos.length}/5</Text>
            <Text style={[styles.helpText, { color: palette.muted }]}>Attach up to five photos to this entry.</Text>
            <View style={styles.actionRow}>
              <CareButton title="＋ Add photos" onPress={() => void chooseJournalPhotos()} palette={palette} secondary disabled={journalPhotos.length >= 5} />
            </View>
            {journalPhotos.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.journalPhotoStrip}>
                {journalPhotos.map((uri) => (
                  <View key={uri} style={styles.journalPhotoItem}>
                    <Image source={{ uri }} contentFit="cover" style={styles.journalPhotoPreview} />
                    <Pressable accessibilityRole="button" accessibilityLabel="Remove attached journal photo" onPress={() => removeDraftJournalPhoto(uri)} style={[styles.journalAttachmentRemove, { backgroundColor: palette.soft }]}>
                      <ActionIcon name="remove" color={palette.primary} cutout={palette.soft} size={12} />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            ) : null}
            <Text style={[styles.fieldLabel, { color: palette.muted }]}>DOCUMENTS · {journalDocuments.length}/10</Text>
            <Text style={[styles.helpText, { color: palette.muted }]}>Attach up to ten files, including PDF, Word, and Excel documents.</Text>
            <CareButton title="＋ Attach documents" onPress={() => void chooseJournalDocuments()} palette={palette} secondary disabled={journalDocuments.length >= 10} />
            {journalDocuments.map((document) => (
              <View key={document.id} style={styles.journalPendingDocument}>
                <Text style={[styles.bodyText, styles.grow, { color: palette.text }]} numberOfLines={1}>📎 {document.name}</Text>
                <IconActionButton icon="remove" label={`Remove ${document.name}`} onPress={() => removeDraftJournalDocument(document)} palette={palette} destructive />
              </View>
            ))}
            <CareButton title={editingJournalEntryId ? "Update journal entry" : "Save journal entry"} onPress={saveJournalEntry} palette={palette} disabled={pets.length === 0 && selectedPetId !== GENERAL_REMINDER_PET_ID} />
            <Text style={[styles.helpText, { color: palette.muted }]}>Entries are time-stamped and stored locally on this device.</Text>
          </View>
        </>
      );
    }
    return (
      <View style={styles.journalListPage}>
        <CareButton title="＋  Add a care note" onPress={beginAddJournalEntry} palette={palette} />
        <View style={[styles.listSectionCard, styles.journalListCard, { backgroundColor: palette.card, borderColor: palette.line }]}>
          <ScrollView style={styles.journalEntriesScroll} contentContainerStyle={styles.listSectionScrollContent} nestedScrollEnabled showsVerticalScrollIndicator>
            {sortedJournal.length === 0 ? (
              <EmptyCard title="Your journal is ready" description="Log a meal, health observation, weight, or vet visit to start a history." palette={palette} />
            ) : sortedJournal.map((entry) => {
          const entryPet = petById.get(entry.petId);
          return (
          <View key={entry.id} style={[styles.recordCard, { backgroundColor: palette.card, borderColor: palette.line }]}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Open journal entry ${entry.title}`} accessibilityHint="Opens the full journal entry and attachments" onPress={() => setSelectedJournalEntry(entry)} style={({ pressed }) => [styles.journalEntryOpen, { opacity: pressed ? 0.78 : 1 }]}>
              <View style={styles.cardHeaderRow}>
                {entryPet?.profilePhotoUri ? (
                  <View style={styles.recordPetIdentity}>
                    <Image source={{ uri: entryPet.profilePhotoUri }} contentFit="cover" style={styles.recordPetAvatar} />
                    <View style={[styles.iconBadge, styles.recordPetIconBadge, { backgroundColor: palette.soft }]}><SolidPetIcon name={iconNameOrDefault(entry.icon ?? getJournalIcon(entry.type))} color={palette.primary} cutout={palette.soft} size={16} /></View>
                  </View>
                ) : <View style={[styles.iconBadge, { backgroundColor: palette.soft }]}><SolidPetIcon name={iconNameOrDefault(entry.icon ?? getJournalIcon(entry.type))} color={palette.primary} cutout={palette.soft} /></View>}
                <View style={styles.grow}>
                  <Text style={[styles.cardTitle, { color: palette.text }]}>{entry.title}</Text>
                  <Text style={[styles.bodyText, { color: palette.primary }]}>{entryPet?.name ?? (entry.petId === GENERAL_REMINDER_PET_ID ? "General" : "Pet")}</Text>
                  <View style={styles.journalAttachmentIndicators}>
                    {(entry.photos?.length ?? 0) > 0 ? <Text style={[styles.journalIndicator, { color: palette.primary }]}>＋▧ {entry.photos?.length} photos</Text> : null}
                    {(entry.documents?.length ?? 0) > 0 ? <Text style={[styles.journalIndicator, { color: palette.primary }]}>＋📎 {entry.documents?.length} files</Text> : null}
                  </View>
                </View>
                <Text style={[styles.dateText, { color: palette.muted }]}>{new Date(entry.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</Text>
              </View>
              {entry.notes ? <Text style={[styles.bodyText, { color: palette.muted }]}>{entry.notes}</Text> : null}
            </Pressable>
          </View>
          );
            })}
          </ScrollView>
        </View>
      </View>
    );
  }

  function renderReminders() {
    const visibleReminderHistory = reminderHistory
      .filter((completion) => !reminderHistoryPetFilter || completion.petId === reminderHistoryPetFilter)
      .slice(0, 20);
    return (
      <>
        {reminderFormOpen ? (
          <View style={styles.reminderFormPage}>
            <Pressable onPress={resetReminderForm} style={styles.detailBackButton}>
              <Text style={{ color: palette.primary, fontWeight: "800" }}>‹  Back to Reminders</Text>
            </Pressable>
        <ScrollView style={styles.reminderFormScroll} contentContainerStyle={styles.reminderFormContent} nestedScrollEnabled keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
        <View style={[styles.formCard, { backgroundColor: palette.card, borderColor: palette.line }]}>
          <Text style={[styles.cardTitle, { color: palette.text }]}>{editingReminderId ? "Edit care reminder" : "Schedule a care reminder"}</Text>
          <Text style={[styles.fieldLabel, { color: palette.muted }]}>FOR WHICH PET?</Text>
          <PetChips pets={pets} selectedPetId={selectedPetId} onSelect={setSelectedPetId} palette={palette} allowGeneral />
          <CareInput value={reminderTitle} onChangeText={(value) => { setReminderTitle(value); if (value.trim()) setReminderTitleError(false); }} placeholder="Medication, grooming, checkup… *" palette={palette} error={reminderTitleError} maxLength={50} />
          <CareInput value={reminderNotes} onChangeText={setReminderNotes} placeholder="Notes or instructions (optional)" palette={palette} multiline />
          <Pressable accessibilityRole="switch" accessibilityState={{ checked: reminderAllDay }} accessibilityLabel="Whole day event" onPress={() => { setReminderAllDay((value) => !value); setReminderTimeError(false); setReminderScheduleError(false); }} style={[styles.reminderOption, { backgroundColor: palette.soft }]}>
            <View style={[styles.checkBox, { borderColor: palette.action, backgroundColor: reminderAllDay ? palette.action : "transparent" }]}>
              {reminderAllDay ? <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>✓</Text> : null}
            </View>
            <Text style={[styles.reminderOptionText, { color: palette.text }]}>Whole day event</Text>
          </Pressable>
          {reminderAllDay ? (
            <CalendarDateField value={reminderDate} onChange={(value) => { setReminderDate(value); setReminderDateError(false); setReminderScheduleError(false); }} placeholder="Choose reminder date" palette={palette} error={reminderDateError || reminderScheduleError} />
          ) : (
            <View style={styles.inlineInputs}>
              <View style={styles.grow}>
                <CalendarDateField value={reminderDate} onChange={(value) => { setReminderDate(value); setReminderDateError(false); setReminderScheduleError(false); }} placeholder="Choose reminder date" palette={palette} error={reminderDateError || reminderScheduleError} />
              </View>
              <View style={styles.timeInput}>
                <ReminderTimeField value={reminderTime} onChange={(value) => { setReminderTime(value); setReminderTimeError(false); setReminderScheduleError(false); }} palette={palette} error={reminderTimeError || reminderScheduleError} />
              </View>
            </View>
          )}
          {!reminderAllDay && Platform.OS === "web" ? <Text style={[styles.helpText, { color: palette.muted }]}>Enter time with AM or PM, such as 9:00 AM.</Text> : null}
          <Text style={[styles.fieldLabel, { color: palette.muted }]}>REPEAT</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {REPEAT_OPTIONS.map((option) => (
              <Pressable key={option.id} onPress={() => setReminderRepeat(option.id)} style={[styles.chip, { backgroundColor: reminderRepeat === option.id ? palette.action : palette.bg, borderColor: reminderRepeat === option.id ? palette.action : palette.line }]}>
                <View style={styles.repeatOptionContent}>
                  <View style={[styles.repeatColorBadge, { backgroundColor: REMINDER_REPEAT_COLORS[option.id] }]} />
                  <Text style={[styles.chipText, { color: reminderRepeat === option.id ? "#FFFFFF" : palette.text }]}>{option.label}</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
          <Text style={[styles.fieldLabel, { color: palette.muted }]}>SNOOZE DURATION</Text>
          <View style={styles.actionRow}>
            {SNOOZE_OPTIONS.map((option) => {
              const selected = reminderSnoozeMinutes === option.id;
              return (
                <Pressable key={option.id} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={`Snooze for ${option.label}`} onPress={() => setReminderSnoozeMinutes(option.id)} style={[styles.chip, { backgroundColor: selected ? palette.action : palette.bg, borderColor: selected ? palette.action : palette.line }]}>
                  <Text style={[styles.chipText, { color: selected ? "#FFFFFF" : palette.text }]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.fieldLabel, { color: palette.muted }]}>ICON</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {REMINDER_ICON_OPTIONS.map((option) => (
              <Pressable key={option.label} accessibilityRole="radio" accessibilityLabel={option.label} accessibilityState={{ selected: reminderIcon === option.value }} onPress={() => setReminderIcon(option.value)} style={[styles.iconChoice, { backgroundColor: reminderIcon === option.value ? palette.action : palette.bg, borderColor: reminderIcon === option.value ? palette.action : palette.line }]}>
                <SolidPetIcon name={option.value} color={reminderIcon === option.value ? "#FFFFFF" : palette.primary} cutout={reminderIcon === option.value ? palette.action : palette.bg} size={24} />
                <Text numberOfLines={2} style={[styles.iconChoiceLabel, { color: reminderIcon === option.value ? "#FFFFFF" : palette.text }]}>{option.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.actionRow}>
            <CareButton title={editingReminderId ? "Update reminder" : "Save reminder"} onPress={() => void saveReminder()} palette={palette} disabled={pets.length === 0 && selectedPetId !== GENERAL_REMINDER_PET_ID} />
            {editingReminderId ? <CareButton title="Cancel edit" onPress={resetReminderForm} palette={palette} secondary /> : null}
          </View>
          <Text style={[styles.helpText, { color: palette.muted }]}>Notifications are scheduled one occurrence at a time. Mark a repeating reminder done to schedule its next occurrence.</Text>
        </View>
        </ScrollView>
          </View>
        ) : (
          <>
        <View style={styles.reminderListPage}>
        <CareButton title="＋  Add a reminder" onPress={beginAddReminder} palette={palette} />
        <View style={[styles.reminderViewTabs, { backgroundColor: palette.soft }]} accessibilityRole="tablist">
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: !completedHistoryOpen }}
            onPress={() => setCompletedHistoryOpen(false)}
            style={[styles.tab, !completedHistoryOpen && { backgroundColor: palette.card }]}
          >
            <Text style={[styles.tabText, { color: !completedHistoryOpen ? palette.primary : palette.muted }]}>Upcoming</Text>
          </Pressable>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: completedHistoryOpen }}
            onPress={() => setCompletedHistoryOpen(true)}
            style={[styles.tab, completedHistoryOpen && { backgroundColor: palette.card }]}
          >
            <Text style={[styles.tabText, { color: completedHistoryOpen ? palette.primary : palette.muted }]}>Completed</Text>
          </Pressable>
        </View>
        {!completedHistoryOpen ? (
        <View style={[styles.listSectionCard, styles.reminderListCard, { backgroundColor: palette.card, borderColor: palette.line }]}>
          <Text style={[styles.sectionTitle, styles.listSectionTitle, { color: palette.text }]}>Upcoming reminders</Text>
          <ScrollView style={styles.reminderListScroll} contentContainerStyle={styles.listSectionScrollContent} nestedScrollEnabled showsVerticalScrollIndicator>
            {sortedReminders.length === 0 ? (
              <EmptyCard title="No reminders yet" description="Add a medication, grooming, or checkup reminder for one of your pets." palette={palette} />
            ) : sortedReminders.map((reminder) => {
          const overdue = new Date(reminder.dueAt) < new Date();
          const reminderPet = petById.get(reminder.petId);
          return (
            <View key={reminder.id} style={[styles.recordCard, styles.reminderRecordCard, reminderPet?.profilePhotoUri && styles.reminderRecordCardWithPhoto, { backgroundColor: palette.card, borderColor: overdue ? "#A61B1B" : palette.line }]}>
              <View pointerEvents="none" style={[styles.reminderRepeatStripe, { backgroundColor: REMINDER_REPEAT_COLORS[reminder.repeat] }]} />
              <View style={styles.cardHeaderRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`View full details for reminder ${reminder.title}`}
                  accessibilityHint="Opens reminder details"
                  onPress={() => setSelectedReminder(reminder)}
                  style={({ pressed }) => [styles.reminderDetailsPressable, { opacity: pressed ? 0.78 : 1 }]}
                >
                  {reminderPet?.profilePhotoUri ? (
                    <View style={styles.recordPetIdentity}>
                      <Image source={{ uri: reminderPet.profilePhotoUri }} contentFit="cover" style={styles.recordPetAvatar} />
                      <View style={[styles.iconBadge, styles.recordPetIconBadge, { backgroundColor: palette.soft }]}><SolidPetIcon name={iconNameOrDefault(getReminderIcon(reminder, healthRecords))} color={palette.primary} cutout={palette.soft} size={16} /></View>
                    </View>
                  ) : <View style={[styles.iconBadge, { backgroundColor: palette.soft }]}><SolidPetIcon name={iconNameOrDefault(getReminderIcon(reminder, healthRecords))} color={palette.primary} cutout={palette.soft} /></View>}
                  <View style={styles.grow}>
                    <Text style={[styles.cardTitle, { color: palette.text }]}>{reminder.title}</Text>
                    <Text style={[styles.bodyText, { color: palette.primary }]}>{reminderPet?.name ?? "General"} · {reminder.repeat === "once" ? "One-time" : `Repeats ${reminder.repeat}`}</Text>
                    {reminder.notes ? <Text style={[styles.bodyText, { color: palette.muted }]}>{reminder.notes}</Text> : null}
                    {reminder.notificationId ? <Text style={[styles.helpText, { color: palette.muted }]}>Device notification scheduled</Text> : null}
                  </View>
                </Pressable>
                <View style={styles.reminderDateActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`View full details for reminder ${reminder.title}, due ${displayReminderDueDate(reminder.dueAt, reminder.allDay)}`}
                    onPress={() => setSelectedReminder(reminder)}
                    style={[styles.reminderDateBadge, { borderColor: overdue ? "#A61B1B" : palette.line, backgroundColor: overdue ? "#A61B1B" : palette.bg }]}
                  >
                    <Text style={[styles.dateText, styles.reminderDateBadgeText, { color: overdue ? "#FFFFFF" : palette.muted }]}>{overdue ? "Overdue · " : reminder.snoozedFrom ? "Snoozed · " : ""}{displayReminderDueDate(reminder.dueAt, reminder.allDay)}</Text>
                  </Pressable>
                  {localDateInput(new Date(reminder.dueAt)) === localDateInput(new Date()) ? <CareButton title="Mark done" onPress={() => confirmCompleteReminder(reminder)} palette={palette} /> : null}
                  {overdue ? <CareButton title={`Snooze ${SNOOZE_OPTIONS.find((option) => option.id === (reminder.snoozeMinutes ?? 60))?.label ?? "1 hour"}`} onPress={() => void snoozeReminder(reminder)} palette={palette} secondary /> : null}
                </View>
              </View>
              <View style={styles.actionRow}>
                {!reminder.notificationId && notificationsAvailable() ? <CareButton title="Retry alert" onPress={() => void retryReminderNotification(reminder)} palette={palette} secondary /> : null}
              </View>
            </View>
          );
            })}
          </ScrollView>
        </View>
        ) : (
        <View style={[styles.listSectionCard, styles.reminderListCard, { backgroundColor: palette.card, borderColor: palette.line }]}>
          <View style={[styles.historyHeading, styles.listSectionTitle]}>
            <Text style={[styles.sectionTitle, { color: palette.text, marginTop: 0 }]}>Completed reminders</Text>
            {reminderHistory.length > 0 ? <CareButton title="Clear history" onPress={clearReminderHistory} palette={palette} secondary /> : null}
          </View>
          <ScrollView style={styles.reminderListScroll} contentContainerStyle={styles.listSectionScrollContent} nestedScrollEnabled showsVerticalScrollIndicator>
            {reminderHistory.length > 0 ? (
              <>
                <Text style={[styles.fieldLabel, { color: palette.muted }]}>FILTER BY PET</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  {[{ id: "", name: "All pets" }, ...pets].map((pet) => {
                    const selected = reminderHistoryPetFilter === pet.id;
                    return (
                      <Pressable
                        key={pet.id || "all-reminder-history"}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        accessibilityLabel={`${pet.name} completed reminders`}
                        onPress={() => setReminderHistoryPetFilter(pet.id)}
                        style={[styles.chip, { backgroundColor: selected ? palette.action : palette.bg, borderColor: selected ? palette.action : palette.line }]}
                      >
                        <Text style={[styles.chipText, { color: selected ? "#FFFFFF" : palette.text }]}>{pet.name}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </>
            ) : null}
            {reminderHistory.length === 0 ? (
              <Text style={[styles.helpText, { color: palette.muted }]}>Completed reminders will appear here.</Text>
            ) : visibleReminderHistory.length === 0 ? (
              <Text style={[styles.helpText, { color: palette.muted }]}>No completed reminders for this pet.</Text>
            ) : visibleReminderHistory.map((completion) => (
              <View key={completion.id} style={[styles.recordCard, styles.reminderHistoryRecordCard, { backgroundColor: palette.card, borderColor: palette.line }]}>
                <View pointerEvents="none" style={[styles.reminderRepeatStripe, { backgroundColor: REMINDER_REPEAT_COLORS[completion.repeat ?? "once"] }]} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`View full details for completed reminder ${completion.title}`}
                  accessibilityHint="Opens completed reminder details"
                  onPress={() => setSelectedReminderCompletion(completion)}
                  style={({ pressed }) => [styles.reminderDetailsPressable, { opacity: pressed ? 0.78 : 1 }]}
                >
                  <View style={styles.cardHeaderRow}>
                    <View style={[styles.iconBadge, { backgroundColor: palette.soft }]}><Text style={{ color: palette.primary, fontWeight: "900" }}>✓</Text></View>
                    <View style={styles.grow}>
                      <Text style={[styles.cardTitle, { color: palette.text }]}>{completion.title}</Text>
                      <Text style={[styles.bodyText, { color: palette.muted }]}>{completion.petName} · Due {displayDate(completion.scheduledFor)}</Text>
                    </View>
                    <Text style={[styles.dateText, { color: palette.muted }]}>{displayDate(completion.completedAt)}</Text>
                  </View>
                </Pressable>
              </View>
            ))}
          </ScrollView>
        </View>
        )}
        </View>
          </>
        )}
      </>
    );
  }

  const tabs = CARE_TAB_ITEMS;
  const petAlbumModalPet = pets.find((pet) => pet.id === petAlbumModalPetId) ?? null;
  const albumModalPhotos = petAlbumModalPet?.albumPhotos ?? [];
  const allAlbumModalPhotosSelected = albumModalPhotos.length > 0
    && albumModalPhotos.every((photo) => selectedAlbumPhotoIds.includes(photo.id));

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.bg }]}>
      <ScrollView
        ref={careScrollRef}
        contentContainerStyle={[styles.content, (tab === "journal" || tab === "reminders") && styles.journalScreenContent]}
        keyboardShouldPersistTaps="handled"
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refreshCareCenter()}
            tintColor={palette.primary}
            colors={[palette.primary]}
            progressBackgroundColor={palette.card}
          />
        )}
      >
        <View style={[styles.header, { borderBottomColor: palette.line }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to home" onPress={onBack} style={[styles.backButton, { backgroundColor: palette.soft }]}>
            <HomeIcon color={palette.primary} cutout={palette.soft} size={21} />
          </Pressable>
          <View style={styles.grow}>
            <Text style={[styles.eyebrow, { color: palette.primary }]}>YOUR CARE SPACE</Text>
            <Text style={[styles.headerTitle, { color: palette.text }]}>Care center</Text>
          </View>
        </View>
        <View style={[styles.tabs, { backgroundColor: palette.soft }]}>
          {tabs.map((item) => (
            <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected: tab === item.id }} accessibilityLabel={item.id === "reminders" && overdueReminderCount > 0 ? `Reminders, ${overdueReminderCount} overdue` : item.label} onPress={() => { setTab(item.id); if (item.id === "reminders") setSelectedPetId(GENERAL_REMINDER_PET_ID); }} style={[styles.tab, tab === item.id && { backgroundColor: palette.card }]}>
              <View style={styles.tabLabelWrap}>
                <Text style={[styles.tabText, { color: tab === item.id ? palette.primary : palette.muted }]}>{item.label}</Text>
                {item.id === "reminders" && overdueReminderCount > 0 ? (
                  <View style={styles.overdueReminderBadge}>
                    <Text style={styles.overdueReminderBadgeText}>{overdueReminderCount > 99 ? "99+" : overdueReminderCount}</Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          ))}
        </View>
        {notice ? (
          <View style={[styles.notice, { backgroundColor: palette.soft, borderColor: palette.primary }]}>
            <Text style={[styles.noticeText, { color: palette.primary }]}>{notice}</Text>
            <Pressable accessibilityLabel="Dismiss message" onPress={() => setNotice("")}><Text style={{ color: palette.primary }}>×</Text></Pressable>
          </View>
        ) : null}
        {!loaded ? <Text style={[styles.bodyText, { color: palette.muted }]}>Loading your care records…</Text> : null}
        {loaded && tab === "pets" ? renderPets() : null}
        {loaded && tab === "journal" ? renderJournal() : null}
        {loaded && tab === "reminders" ? renderReminders() : null}
        <Text style={[styles.disclaimer, { color: palette.muted }]}>Personal records stay on this device. Reminders and journal notes are organizational tools, not a substitute for veterinary advice.</Text>
      </ScrollView>
      <Modal visible={petAlbumModalPet !== null} transparent animationType="fade" onRequestClose={closePetAlbumManager}>
        <GestureHandlerRootView style={styles.modalScrim}>
          {petAlbumModalPet ? (
            <View style={[styles.petAlbumModal, { backgroundColor: palette.card }]}>
              <View style={styles.modalHeader}>
                <View style={styles.grow}>
                  <Text style={[styles.cardTitle, { color: palette.text }]}>{petAlbumModalPet.name}'s album</Text>
                  <Text style={[styles.helpText, { color: palette.muted }]}>{petAlbumModalPet.albumPhotos?.length ?? 0}/{MAX_PET_ALBUM_PHOTOS} photos · pin up to {MAX_PINNED_PET_ALBUM_PHOTOS}</Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Close pet album" onPress={closePetAlbumManager} style={[styles.closeDetailButton, { backgroundColor: palette.soft }]}>
                  <Text style={{ color: palette.primary, fontSize: 20, fontWeight: "700" }}>×</Text>
                </Pressable>
              </View>
              <CareButton title="＋ Add photos" onPress={() => void addPetAlbumPhotos(petAlbumModalPet)} palette={palette} secondary disabled={(petAlbumModalPet.albumPhotos?.length ?? 0) >= MAX_PET_ALBUM_PHOTOS || petAlbumUploadProgress !== null} />
              {petAlbumUploadProgress?.petId === petAlbumModalPet.id ? (
                <View style={styles.petAlbumUploadStatus} accessibilityLiveRegion="polite">
                  <ActivityIndicator size="small" color={palette.primary} />
                  <View style={styles.petAlbumUploadCopy}>
                    <Text style={[styles.helpText, { color: palette.primary }]}>
                      {petAlbumUploadProgress.total
                        ? `Saving photos · ${petAlbumUploadProgress.completed} of ${petAlbumUploadProgress.total}`
                        : "Preparing photo selection…"}
                    </Text>
                    <View style={[styles.petAlbumUploadTrack, { backgroundColor: palette.soft }]}>
                      <View style={[styles.petAlbumUploadFill, { backgroundColor: palette.primary, width: petAlbumUploadProgress.total ? `${Math.max((petAlbumUploadProgress.completed / petAlbumUploadProgress.total) * 100, 8)}%` : "18%" }]} />
                    </View>
                  </View>
                </View>
              ) : null}
              {albumModalPhotos.length ? (
                <View style={styles.petAlbumBulkControls}>
                  <View style={styles.petAlbumSelectionActions}>
                    <Pressable accessibilityRole="button" accessibilityLabel={allAlbumModalPhotosSelected ? "Clear photo selection" : "Select all photos"} onPress={() => toggleSelectAllAlbumPhotos(petAlbumModalPet)} style={styles.petAlbumSelectAllButton}>
                      <Text style={[styles.petAlbumSelectAllText, { color: palette.primary }]}>{allAlbumModalPhotosSelected ? "Clear selection" : "Select all"}</Text>
                    </Pressable>
                    <Text style={[styles.helpText, { color: palette.muted }]}>{selectedAlbumPhotoIds.length} selected</Text>
                  </View>
                  <CareButton title={`Delete selected${selectedAlbumPhotoIds.length ? ` (${selectedAlbumPhotoIds.length})` : ""}`} onPress={() => deleteSelectedAlbumPhotos(petAlbumModalPet)} palette={palette} destructive disabled={selectedAlbumPhotoIds.length === 0} />
                </View>
              ) : null}
              {albumModalPhotos.length ? (
                <DraggableFlatList
                  data={albumModalPhotos}
                  keyExtractor={(photo) => photo.id}
                  containerStyle={styles.petAlbumModalScroll}
                  style={styles.petAlbumModalScroll}
                  contentContainerStyle={styles.petAlbumModalContent}
                  keyboardShouldPersistTaps="handled"
                  activationDistance={8}
                  onDragEnd={({ data }) => setPets((current) => current.map((item) => item.id === petAlbumModalPet.id ? { ...item, albumPhotos: data } : item))}
                  renderItem={({ item: photo, getIndex, drag, isActive }) => {
                    const index = getIndex() ?? 0;
                    return (
                    <ScaleDecorator>
                      <View style={[styles.petAlbumPhotoRow, { borderTopColor: palette.line, backgroundColor: isActive ? palette.soft : "transparent" }]}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Reorder album photo ${index + 1}`}
                          accessibilityHint="Long press and drag to change its position"
                          onLongPress={drag}
                          delayLongPress={180}
                          disabled={isActive}
                          style={styles.petAlbumDragHandle}
                        >
                          <Text style={[styles.petAlbumDragGlyph, { color: palette.muted }]}>⠿</Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: selectedAlbumPhotoIds.includes(photo.id) }}
                          accessibilityLabel={`${selectedAlbumPhotoIds.includes(photo.id) ? "Deselect" : "Select"} album photo ${index + 1}`}
                          onPress={() => toggleAlbumPhotoSelection(photo.id)}
                          style={[styles.petAlbumSelectionBox, { borderColor: selectedAlbumPhotoIds.includes(photo.id) ? palette.primary : palette.line, backgroundColor: selectedAlbumPhotoIds.includes(photo.id) ? palette.primary : palette.bg }]}
                        >
                          {selectedAlbumPhotoIds.includes(photo.id) ? <Text style={styles.petAlbumSelectionMark}>✓</Text> : null}
                        </Pressable>
                        <Pressable accessibilityRole="button" accessibilityLabel={`View album photo ${index + 1}`} onPress={() => setPhotoViewerUri(photo.uri)}>
                          <Image source={{ uri: photo.uri }} contentFit="cover" style={styles.petAlbumPhotoThumbnail} />
                        </Pressable>
                        <View style={styles.petAlbumPhotoCopy}>
                          <TextInput
                            accessibilityLabel={`Description for album photo ${index + 1}`}
                            value={photo.description}
                            onChangeText={(description) => updatePetAlbumPhoto(petAlbumModalPet, photo.id, { description })}
                            placeholder="Add a description"
                            placeholderTextColor={palette.muted}
                            maxLength={160}
                            style={[styles.petAlbumDescriptionInput, { backgroundColor: palette.bg, borderColor: palette.line, color: palette.text }]}
                          />
                          <Pressable
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: photo.pinned }}
                            accessibilityLabel={`${photo.pinned ? "Unpin" : "Pin"} album photo ${index + 1} in pet view`}
                            onPress={() => togglePetAlbumPhotoPin(petAlbumModalPet, photo)}
                            style={[styles.petAlbumPinButton, { backgroundColor: photo.pinned ? palette.soft : palette.bg, borderColor: photo.pinned ? palette.primary : palette.line }]}
                          >
                            <Text style={[styles.petAlbumPinButtonText, { color: photo.pinned ? palette.primary : palette.muted }]}>{photo.pinned ? "✓ Pinned to view" : "＋ Pin to view"}</Text>
                          </Pressable>
                        </View>
                        <IconActionButton icon="remove" label={`Remove album photo ${index + 1}`} onPress={() => removePetAlbumPhoto(petAlbumModalPet, photo)} palette={palette} destructive />
                      </View>
                    </ScaleDecorator>
                    );
                  }}
                />
              ) : (
                <ScrollView style={styles.petAlbumModalScroll} contentContainerStyle={styles.petAlbumModalContent}>
                  <Text style={[styles.helpText, { color: palette.muted }]}>Your album is empty. Add photos and descriptions to create a keepsake collection.</Text>
                </ScrollView>
              )}
              <View style={styles.healthDetailActions}>
                <CareButton title="Done" onPress={closePetAlbumManager} palette={palette} secondary />
              </View>
            </View>
          ) : null}
        </GestureHandlerRootView>
      </Modal>
      <Modal visible={photoViewerUri !== null} transparent animationType="fade" onRequestClose={() => setPhotoViewerUri(null)}>
        <View style={styles.photoViewer}>
          {photoViewerUri ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Download photo" onPress={() => void downloadImage(photoViewerUri)} style={styles.photoViewerDownload}>
              <Text style={styles.photoViewerDownloadText}>⤓</Text>
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" accessibilityLabel="Close photo viewer" onPress={() => setPhotoViewerUri(null)} style={styles.photoViewerClose}>
            <Text style={styles.photoViewerCloseText}>×</Text>
          </Pressable>
          {photoViewerUri ? <Image source={{ uri: photoViewerUri }} contentFit="contain" style={styles.photoViewerImage} /> : null}
        </View>
      </Modal>
      <Modal visible={selectedReminderCompletion !== null} transparent animationType="fade" onRequestClose={() => setSelectedReminderCompletion(null)}>
        <View style={styles.modalScrim}>
          {selectedReminderCompletion ? (
            <View style={[styles.healthDetailModal, { backgroundColor: palette.card }]}>
              <View style={styles.modalHeader}>
                <View style={styles.grow}>
                  <Text style={[styles.fieldLabel, { color: palette.primary }]}>COMPLETED REMINDER</Text>
                  <Text style={[styles.cardTitle, { color: palette.text }]} numberOfLines={2}>{selectedReminderCompletion.title}</Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Close completed reminder details" onPress={() => setSelectedReminderCompletion(null)} style={[styles.closeDetailButton, { backgroundColor: palette.soft }]}>
                  <Text style={{ color: palette.primary, fontSize: 20, fontWeight: "700" }}>×</Text>
                </Pressable>
              </View>
              <ScrollView style={styles.healthDetailScroll} contentContainerStyle={styles.healthDetailContent}>
                <View style={[styles.healthDetailSection, { borderColor: palette.line }]}>
                  <Text style={[styles.healthDetailLabel, { color: palette.muted }]}>FOR</Text>
                  <Text style={[styles.healthDetailValue, { color: palette.text }]}>{selectedReminderCompletion.petName || petById.get(selectedReminderCompletion.petId)?.name || "General reminder"}</Text>
                </View>
                <View style={[styles.healthDetailSection, { borderColor: palette.line }]}>
                  <Text style={[styles.healthDetailLabel, { color: palette.muted }]}>SCHEDULED FOR</Text>
                  <Text style={[styles.healthDetailValue, { color: palette.text }]}>{displayReminderDueDate(selectedReminderCompletion.scheduledFor, selectedReminderCompletion.allDay)}</Text>
                </View>
                <View style={[styles.healthDetailSection, { borderColor: palette.line }]}>
                  <Text style={[styles.healthDetailLabel, { color: palette.muted }]}>COMPLETED AT</Text>
                  <Text style={[styles.healthDetailValue, { color: palette.text }]}>{displayDate(selectedReminderCompletion.completedAt)}</Text>
                </View>
                {selectedReminderCompletion.repeat ? (
                  <View style={[styles.healthDetailSection, { borderColor: palette.line }]}>
                    <Text style={[styles.healthDetailLabel, { color: palette.muted }]}>REPEAT</Text>
                    <Text style={[styles.healthDetailValue, { color: palette.text }]}>{selectedReminderCompletion.repeat === "once" ? "One-time" : `Repeats ${selectedReminderCompletion.repeat}`}</Text>
                  </View>
                ) : null}
                {selectedReminderCompletion.snoozeMinutes ? (
                  <View style={[styles.healthDetailSection, { borderColor: palette.line }]}>
                    <Text style={[styles.healthDetailLabel, { color: palette.muted }]}>SNOOZE DURATION</Text>
                    <Text style={[styles.healthDetailValue, { color: palette.text }]}>{SNOOZE_OPTIONS.find((option) => option.id === selectedReminderCompletion.snoozeMinutes)?.label ?? `${selectedReminderCompletion.snoozeMinutes} minutes`}</Text>
                  </View>
                ) : null}
                <View style={[styles.healthDetailSection, styles.healthDetailNotes, { borderColor: palette.line }]}>
                  <View style={styles.notesHeaderRow}>
                    <Text style={[styles.healthDetailLabel, { color: palette.muted }]}>NOTES</Text>
                    {selectedReminderCompletion.notes?.trim() ? <CopyNotesButton text={selectedReminderCompletion.notes} palette={palette} onCopied={() => setNotice("Notes copied to clipboard.")} /> : null}
                  </View>
                  <Text style={[styles.healthDetailValue, { color: palette.text }]}>{selectedReminderCompletion.notes?.trim() || "No notes added."}</Text>
                </View>
                {selectedReminderCompletion.healthRecordId ? (() => {
                  const linkedRecord = healthRecords.find((record) => record.id === selectedReminderCompletion.healthRecordId);
                  return linkedRecord ? (
                    <View style={[styles.healthDetailSection, { borderColor: palette.line }]}>
                      <Text style={[styles.healthDetailLabel, { color: palette.muted }]}>LINKED HEALTHCARE RECORD</Text>
                      <Text style={[styles.healthDetailValue, { color: palette.text }]}>{linkedRecord.title} · {linkedRecord.dateGiven}</Text>
                    </View>
                  ) : null;
                })() : null}
              </ScrollView>
              <View style={styles.healthDetailActions}>
                <CareButton
                  title={selectedReminderCompletion.restoredReminderId ? "Restored" : "Restore reminder"}
                  onPress={() => {
                    const completion = selectedReminderCompletion;
                    setSelectedReminderCompletion(null);
                    void restoreCompletedReminder(completion);
                  }}
                  palette={palette}
                  secondary
                  disabled={Boolean(selectedReminderCompletion.restoredReminderId)}
                />
                <IconActionButton
                  icon="remove"
                  label={`Remove completed reminder ${selectedReminderCompletion.title}`}
                  onPress={() => removeReminderCompletion(selectedReminderCompletion)}
                  palette={palette}
                  destructive
                />
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
      <Modal visible={selectedReminder !== null} transparent animationType="fade" onRequestClose={() => setSelectedReminder(null)}>
        <View style={styles.modalScrim}>
          {selectedReminder ? (
            <View style={[styles.healthDetailModal, { backgroundColor: palette.card }]}>
              <View style={[styles.modalHeader, styles.recordDetailHeader, { borderBottomColor: palette.line }]}>
                <View style={styles.grow}>
                  <Text style={[styles.fieldLabel, { color: palette.primary }]}>CARE REMINDER</Text>
                  <Text style={[styles.cardTitle, { color: palette.text }]} numberOfLines={2}>{selectedReminder.title}</Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Close reminder details" onPress={() => setSelectedReminder(null)} style={[styles.closeDetailButton, { backgroundColor: palette.soft }]}>
                  <Text style={{ color: palette.primary, fontSize: 20, fontWeight: "700" }}>×</Text>
                </Pressable>
              </View>
              <ScrollView style={styles.healthDetailScroll} contentContainerStyle={styles.healthDetailContent}>
                <View style={[styles.healthDetailSection, { borderColor: palette.line }]}>
                  <Text style={[styles.healthDetailLabel, { color: palette.muted }]}>FOR</Text>
                  <Text style={[styles.healthDetailValue, { color: palette.text }]}>{petById.get(selectedReminder.petId)?.name ?? "General reminder"}</Text>
                </View>
                <View style={[styles.healthDetailSection, { borderColor: palette.line }]}>
                  <Text style={[styles.healthDetailLabel, { color: palette.muted }]}>NEXT DUE</Text>
                  <Text style={[styles.healthDetailValue, { color: new Date(selectedReminder.dueAt) < new Date() ? "#C46C5C" : palette.text }]}>
                    {new Date(selectedReminder.dueAt) < new Date() ? "Overdue · " : ""}{displayReminderDueDate(selectedReminder.dueAt, selectedReminder.allDay)}
                  </Text>
                </View>
                <View style={[styles.healthDetailSection, { borderColor: palette.line }]}>
                  <Text style={[styles.healthDetailLabel, { color: palette.muted }]}>REPEAT</Text>
                  <Text style={[styles.healthDetailValue, { color: palette.text }]}>{selectedReminder.repeat === "once" ? "One-time" : `Repeats ${selectedReminder.repeat}`}</Text>
                </View>
                {selectedReminder.notificationId ? (
                  <View style={[styles.healthDetailSection, { borderColor: palette.line }]}>
                    <Text style={[styles.healthDetailLabel, { color: palette.muted }]}>NOTIFICATION</Text>
                    <Text style={[styles.healthDetailValue, { color: palette.text }]}>Device notification scheduled</Text>
                  </View>
                ) : null}
                <View style={[styles.healthDetailSection, { borderColor: palette.line }]}>
                  <Text style={[styles.healthDetailLabel, { color: palette.muted }]}>SNOOZE DURATION</Text>
                  <Text style={[styles.healthDetailValue, { color: palette.text }]}>{SNOOZE_OPTIONS.find((option) => option.id === (selectedReminder.snoozeMinutes ?? 60))?.label ?? "1 hour"}</Text>
                </View>
                {selectedReminder.snoozedFrom ? (
                  <View style={[styles.healthDetailSection, { borderColor: palette.line }]}>
                    <Text style={[styles.healthDetailLabel, { color: palette.muted }]}>SNOOZED FROM</Text>
                    <Text style={[styles.healthDetailValue, { color: palette.text }]}>{displayDate(selectedReminder.snoozedFrom)}</Text>
                  </View>
                ) : null}
                <View style={[styles.healthDetailSection, styles.healthDetailNotes, { borderColor: palette.line }]}>
                  <View style={styles.notesHeaderRow}>
                    <Text style={[styles.healthDetailLabel, { color: palette.muted }]}>NOTES</Text>
                    {selectedReminder.notes?.trim() ? <CopyNotesButton text={selectedReminder.notes} palette={palette} onCopied={() => setNotice("Notes copied to clipboard.")} /> : null}
                  </View>
                  <Text style={[styles.healthDetailValue, { color: palette.text }]}>{selectedReminder.notes?.trim() || "No notes added."}</Text>
                </View>
                {selectedReminder.healthRecordId ? (() => {
                  const linkedRecord = healthRecords.find((record) => record.id === selectedReminder.healthRecordId);
                  return linkedRecord ? (
                    <View style={[styles.healthDetailSection, { borderColor: palette.line }]}>
                      <Text style={[styles.healthDetailLabel, { color: palette.muted }]}>LINKED HEALTHCARE RECORD</Text>
                      <Text style={[styles.healthDetailValue, { color: palette.text }]}>{linkedRecord.title} · {linkedRecord.dateGiven}</Text>
                    </View>
                  ) : null;
                })() : null}
              </ScrollView>
              <View style={styles.healthDetailActions}>
                {localDateInput(new Date(selectedReminder.dueAt)) === localDateInput(new Date()) ? (
                  <CareButton
                    title="Mark done"
                    onPress={() => {
                      const reminder = selectedReminder;
                      setSelectedReminder(null);
                      confirmCompleteReminder(reminder);
                    }}
                    palette={palette}
                  />
                ) : null}
                {new Date(selectedReminder.dueAt) < new Date() ? (
                  <CareButton
                    title={`Snooze ${SNOOZE_OPTIONS.find((option) => option.id === (selectedReminder.snoozeMinutes ?? 60))?.label ?? "1 hour"}`}
                    onPress={() => {
                      const reminder = selectedReminder;
                      setSelectedReminder(null);
                      void snoozeReminder(reminder);
                    }}
                    palette={palette}
                    secondary
                  />
                ) : null}
                <IconActionButton
                  icon="edit"
                  label={`Edit ${selectedReminder.title}`}
                  onPress={() => {
                    const reminder = selectedReminder;
                    setSelectedReminder(null);
                    beginEditReminder(reminder);
                  }}
                  palette={palette}
                />
                <IconActionButton
                  icon="remove"
                  label={`Remove ${selectedReminder.title}`}
                  onPress={() => {
                    const reminder = selectedReminder;
                    setSelectedReminder(null);
                    void deleteReminder(reminder);
                  }}
                  palette={palette}
                  destructive
                />
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
      <Modal visible={selectedJournalEntry !== null} transparent animationType="fade" onRequestClose={() => setSelectedJournalEntry(null)}>
        <View style={styles.modalScrim}>
          {selectedJournalEntry ? (
            <View style={[styles.journalDetailModal, { backgroundColor: palette.card }]}>
              <View style={[styles.modalHeader, styles.recordDetailHeader, { borderBottomColor: palette.line }]}>
                <Text style={[styles.cardTitle, styles.grow, { color: palette.text }]}>Journal entry</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Close journal entry details" onPress={() => setSelectedJournalEntry(null)} style={[styles.closeDetailButton, { backgroundColor: palette.soft }]}>
                  <Text style={{ color: palette.primary, fontSize: 20, fontWeight: "700" }}>×</Text>
                </Pressable>
              </View>
              <ScrollView style={styles.journalDetailScroll} contentContainerStyle={styles.journalDetailContent}>
                <View style={[styles.healthDetailSection, { borderColor: palette.line }]}>
                  <Text style={[styles.healthDetailLabel, { color: palette.muted }]}>TITLE</Text>
                  <Text style={[styles.healthDetailTitle, { color: palette.text, marginTop: 0 }]}>{selectedJournalEntry.title}</Text>
                </View>
                <View style={[styles.healthDetailSection, { borderColor: palette.line }]}>
                  <Text style={[styles.healthDetailLabel, { color: palette.muted }]}>PET</Text>
                  <Text style={[styles.healthDetailPet, { color: palette.primary, marginTop: 0, marginBottom: 0 }]}>{petById.get(selectedJournalEntry.petId)?.name ?? (selectedJournalEntry.petId === GENERAL_REMINDER_PET_ID ? "General" : "Pet")}</Text>
                </View>
                <View style={[styles.healthDetailSection, { borderColor: palette.line }]}>
                  <Text style={[styles.healthDetailLabel, { color: palette.muted }]}>DATE ADDED</Text>
                  <Text style={[styles.healthDetailMeta, { color: palette.muted, marginTop: 0 }]}>{new Date(selectedJournalEntry.createdAt).toLocaleString()}</Text>
                </View>
                {selectedJournalEntry.notes ? (
                  <View style={[styles.healthDetailSection, styles.healthDetailNotes, { borderColor: palette.line }]}>
                    <View style={styles.notesHeaderRow}>
                      <Text style={[styles.healthDetailLabel, { color: palette.muted }]}>NOTES</Text>
                      <CopyNotesButton text={selectedJournalEntry.notes} palette={palette} onCopied={() => setNotice("Notes copied to clipboard.")} />
                    </View>
                    <Text style={[styles.journalDetailNotes, { color: palette.text }]}>{selectedJournalEntry.notes}</Text>
                  </View>
                ) : null}
                {(selectedJournalEntry.photos?.length ?? 0) > 0 ? (
                  <>
                    <View style={[styles.journalDetailAttachmentHeading, { borderColor: palette.line }]}>
                      <Text style={[styles.healthDetailLabel, { color: palette.muted }]}>PHOTOS · {selectedJournalEntry.photos?.length}</Text>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.journalDetailPhotos}>
                      {selectedJournalEntry.photos?.map((uri, index) => (
                        <View key={`${uri}-${index}`} style={styles.journalDetailPhotoItem}>
                          <Pressable accessibilityRole="button" accessibilityLabel={`View journal photo ${index + 1}`} onPress={() => setPhotoViewerUri(uri)}>
                            <Image source={{ uri }} contentFit="cover" style={styles.journalDetailPhoto} />
                          </Pressable>
                        </View>
                      ))}
                    </ScrollView>
                  </>
                ) : null}
                {(selectedJournalEntry.documents?.length ?? 0) > 0 ? (
                  <>
                    <View style={[styles.journalDetailAttachmentHeading, { borderColor: palette.line }]}>
                      <Text style={[styles.healthDetailLabel, { color: palette.muted }]}>ATTACHED DOCUMENTS · {selectedJournalEntry.documents?.length}</Text>
                    </View>
                    {selectedJournalEntry.documents?.map((document) => (
                      <View key={document.id} style={[styles.journalDocumentRow, { borderColor: palette.line }]}>
                        <View style={styles.grow}>
                          <Text style={[styles.journalDocumentName, { color: palette.text }]} numberOfLines={2}>📎 {document.name}</Text>
                          {document.mimeType ? <Text style={[styles.helpText, { color: palette.muted }]}>{document.mimeType}</Text> : null}
                        </View>
                        <Pressable accessibilityRole="button" accessibilityLabel={`Download ${document.name}`} onPress={() => void downloadJournalDocument(document)} style={[styles.journalDownloadButton, { backgroundColor: palette.soft }]}>
                          <Text style={{ color: palette.primary, fontWeight: "800" }}>↓ Save</Text>
                        </Pressable>
                      </View>
                    ))}
                  </>
                ) : null}
              </ScrollView>
              <View style={styles.healthDetailActions}>
                <IconActionButton icon="edit" label={`Edit ${selectedJournalEntry.title}`} onPress={() => beginEditJournalEntry(selectedJournalEntry)} palette={palette} />
                <IconActionButton icon="remove" label={`Remove ${selectedJournalEntry.title}`} onPress={() => removeJournalEntry(selectedJournalEntry)} palette={palette} destructive />
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
      <Modal visible={selectedHealthRecord !== null} transparent animationType="fade" onRequestClose={() => setSelectedHealthRecord(null)}>
        <View style={styles.modalScrim}>
          {selectedHealthRecord ? (
            <View style={[styles.healthDetailModal, { backgroundColor: palette.card }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.fieldLabel, { color: palette.primary }]}>{getHealthRecordGroupLabel(selectedHealthRecord).toLocaleUpperCase()}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Close health record details" onPress={() => setSelectedHealthRecord(null)} style={[styles.closeDetailButton, { backgroundColor: palette.soft }]}>
                  <Text style={{ color: palette.primary, fontSize: 20, fontWeight: "700" }}>×</Text>
                </Pressable>
              </View>
              <ScrollView style={styles.healthDetailScroll} contentContainerStyle={styles.healthDetailContent}>
                <Text style={[styles.healthDetailTitle, { color: palette.text }]}>{selectedHealthRecord.title}</Text>
                <Text style={[styles.healthDetailPet, { color: palette.primary }]}>{petById.get(selectedHealthRecord.petId)?.name ?? "Pet"}</Text>
                <View style={[styles.healthDetailSection, { borderColor: palette.line }]}>
                  <Text style={[styles.healthDetailLabel, { color: palette.muted }]}>DATE GIVEN</Text>
                  <Text style={[styles.healthDetailValue, { color: palette.text }]}>{new Date(`${selectedHealthRecord.dateGiven}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</Text>
                </View>
                <View style={[styles.healthDetailSection, { borderColor: palette.line }]}>
                  <Text style={[styles.healthDetailLabel, { color: palette.muted }]}>NEXT DUE</Text>
                  <Text style={[styles.healthDetailValue, { color: selectedHealthRecord.nextDueDate && selectedHealthRecord.nextDueDate < localDateInput(new Date()) ? "#C46C5C" : palette.text }]}>
                    {selectedHealthRecord.nextDueDate
                      ? `${selectedHealthRecord.nextDueDate < localDateInput(new Date()) ? "Overdue · " : ""}${new Date(`${selectedHealthRecord.nextDueDate}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`
                      : "No next due date"}
                  </Text>
                </View>
                <View style={[styles.healthDetailSection, { borderColor: palette.line }]}>
                  <Text style={[styles.healthDetailLabel, { color: palette.muted }]}>{selectedHealthRecord.type === "Vet visit" ? "CLINIC / VETERINARIAN" : "PROVIDER"}</Text>
                  <Text style={[styles.healthDetailValue, { color: palette.text }]}>{selectedHealthRecord.clinic || "Not added"}</Text>
                </View>
                <View style={[styles.healthDetailSection, styles.healthDetailNotes, { borderColor: palette.line }]}>
                  <View style={styles.notesHeaderRow}>
                    <Text style={[styles.healthDetailLabel, { color: palette.muted }]}>NOTES</Text>
                    {selectedHealthRecord.notes.trim() ? <CopyNotesButton text={selectedHealthRecord.notes} palette={palette} onCopied={() => setNotice("Notes copied to clipboard.")} /> : null}
                  </View>
                  <Text style={[styles.healthDetailValue, { color: palette.text }]}>{selectedHealthRecord.notes || "No notes added."}</Text>
                </View>
                {(selectedHealthRecord.photos?.length ?? 0) > 0 ? (
                  <>
                    <Text style={[styles.healthDetailLabel, { color: palette.muted, marginTop: 16 }]}>PHOTOS · {selectedHealthRecord.photos?.length}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.journalDetailPhotos}>
                      {selectedHealthRecord.photos?.map((uri, index) => (
                        <View key={`${uri}-${index}`} style={styles.journalDetailPhotoItem}>
                          <Pressable accessibilityRole="button" accessibilityLabel={`View healthcare record photo ${index + 1}`} onPress={() => setPhotoViewerUri(uri)}>
                            <Image source={{ uri }} contentFit="cover" style={styles.journalDetailPhoto} />
                          </Pressable>
                        </View>
                      ))}
                    </ScrollView>
                  </>
                ) : null}
                {(selectedHealthRecord.documents?.length ?? 0) > 0 ? (
                  <>
                    <Text style={[styles.healthDetailLabel, { color: palette.muted, marginTop: 16 }]}>ATTACHED DOCUMENTS · {selectedHealthRecord.documents?.length}</Text>
                    {selectedHealthRecord.documents?.map((document) => (
                      <View key={document.id} style={[styles.journalDocumentRow, { borderColor: palette.line }]}>
                        <View style={styles.grow}>
                          <Text style={[styles.journalDocumentName, { color: palette.text }]} numberOfLines={2}>📎 {document.name}</Text>
                          {document.mimeType ? <Text style={[styles.helpText, { color: palette.muted }]}>{document.mimeType}</Text> : null}
                        </View>
                        <Pressable accessibilityRole="button" accessibilityLabel={`Download ${document.name}`} onPress={() => void downloadJournalDocument(document)} style={[styles.journalDownloadButton, { backgroundColor: palette.soft }]}>
                          <Text style={{ color: palette.primary, fontWeight: "800" }}>↓ Save</Text>
                        </Pressable>
                      </View>
                    ))}
                  </>
                ) : null}
                <Text style={[styles.healthDetailMeta, { color: palette.muted }]}>Saved {new Date(selectedHealthRecord.createdAt).toLocaleString()}</Text>
              </ScrollView>
              <View style={styles.healthDetailActions}>
                <IconActionButton icon="edit" label={`Edit ${selectedHealthRecord.title}`} onPress={() => editHealthRecord(selectedHealthRecord)} palette={palette} />
                {selectedHealthRecord.nextDueDate ? (
                  <CareButton
                    title={hasHealthRecordReminder(selectedHealthRecord) ? "Reminder added" : "Add reminder"}
                    onPress={() => void addReminderForHealthRecord(selectedHealthRecord)}
                    palette={palette}
                    secondary
                    disabled={hasHealthRecordReminder(selectedHealthRecord)}
                  />
                ) : null}
                <IconActionButton icon="remove" label={`Remove ${selectedHealthRecord.title}`} onPress={() => removeHealthRecord(selectedHealthRecord)} palette={palette} destructive />
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function EmptyCard({ title, description, palette }: { title: string; description: string; palette: CarePalette }) {
  return (
    <View style={[styles.emptyCard, { backgroundColor: palette.card, borderColor: palette.line }]}>
      <Text style={[styles.cardTitle, { color: palette.text }]}>{title}</Text>
      <Text style={[styles.bodyText, { color: palette.muted }]}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { width: "100%", maxWidth: 900, alignSelf: "center", paddingHorizontal: 24, paddingBottom: 42 },
  journalScreenContent: { flexGrow: 1, height: "100%" },
  header: { minHeight: 82, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", gap: 13 },
  backButton: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  eyebrow: { fontSize: 8, fontWeight: "800", letterSpacing: 1.6, marginBottom: 4 },
  headerTitle: { fontSize: 23, fontWeight: "700" },
  tabs: { flexDirection: "row", borderRadius: 13, padding: 4, gap: 3, marginTop: 17, marginBottom: 15 },
  reminderViewTabs: { flexDirection: "row", borderRadius: 13, padding: 4, gap: 3, marginTop: 17, marginBottom: 15 },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 39, borderRadius: 10 },
  tabLabelWrap: { position: "relative", alignItems: "center", justifyContent: "center" },
  tabText: { fontSize: 10, fontWeight: "800" },
  overdueReminderBadge: { position: "absolute", top: -10, right: -17, minWidth: 17, height: 17, alignItems: "center", justifyContent: "center", borderRadius: 9, paddingHorizontal: 4, backgroundColor: "#D94B4B" },
  overdueReminderBadgeText: { color: "#FFFFFF", fontSize: 7, fontWeight: "900", lineHeight: 9 },
  notice: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, marginBottom: 12 },
  noticeText: { flex: 1, fontSize: 9, fontWeight: "700" },
  introCard: { padding: 16, borderRadius: 15, marginBottom: 13, gap: 5 },
  formCard: { borderWidth: 1, borderRadius: 15, padding: 14, gap: 10, marginBottom: 14 },
  groupCard: { borderWidth: 1, borderRadius: 15, padding: 14, gap: 10, marginBottom: 14 },
  recordCard: { borderWidth: 1, borderRadius: 15, padding: 14, gap: 9, marginTop: 10 },
  emptyCard: { borderWidth: 1, borderRadius: 15, padding: 18, gap: 6, marginTop: 10 },
  cardTitle: { fontSize: 13, fontWeight: "800" },
  bodyText: { fontSize: 10, lineHeight: 16 },
  input: { minHeight: 45, borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9, fontSize: 12 },
  multilineInput: { minHeight: 72, paddingTop: 11 },
  fieldLabel: { fontSize: 8, fontWeight: "800", letterSpacing: 1, marginTop: 3 },
  helpText: { fontSize: 8, lineHeight: 13 },
  chipRow: { flexDirection: "row", gap: 7, paddingVertical: 2 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  chipText: { fontSize: 9, fontWeight: "700" },
  repeatOptionContent: { flexDirection: "row", alignItems: "center", gap: 6 },
  repeatColorBadge: { width: 7, height: 7, borderRadius: 4 },
  iconChoice: { width: 68, minHeight: 64, borderWidth: 1, borderRadius: 13, alignItems: "center", justifyContent: "center", gap: 2, paddingHorizontal: 4, paddingVertical: 5 },
  iconChoiceText: { fontSize: 20 },
  iconChoiceLabel: { width: "100%", minHeight: 18, textAlign: "center", fontSize: 7, lineHeight: 9, fontWeight: "700" },
  solidIconPart: { position: "absolute" },
  button: { minHeight: 39, justifyContent: "center", alignItems: "center", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  buttonText: { fontSize: 9, fontWeight: "800" },
  iconActionButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 11 },
  iconActionGlyph: { fontSize: 16 },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 2 },
  historyHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  cameraActionButton: { minHeight: 39, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  cameraActionLabel: { fontSize: 9, fontWeight: "800" },
  cameraIcon: { width: 21, height: 18, alignItems: "center", justifyContent: "flex-end" },
  cameraTop: { position: "absolute", top: 1, left: 5, width: 9, height: 4, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  cameraBody: { width: 20, height: 13, borderRadius: 3, alignItems: "center", justifyContent: "center" },
  cameraLens: { width: 8, height: 8, borderWidth: 2, borderRadius: 4 },
  inlineInputs: { flexDirection: "row", gap: 8 },
  timeInput: { width: 145 },
  timeFieldInput: { minHeight: 45 },
  timePickerButton: { minHeight: 45 },
  grow: { flex: 1 },
  cardHeaderRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  detailBackButton: { alignSelf: "flex-start", paddingVertical: 10, paddingHorizontal: 2 },
  petDetailHeader: { flexDirection: "row", alignItems: "flex-start", gap: 13, marginBottom: 5 },
  petProfileCard: { position: "relative", paddingTop: 14 },
  petProfileActions: { position: "absolute", top: 10, right: 12, zIndex: 2, flexDirection: "row", gap: 7 },
  petDetailCopy: { paddingRight: 72 },
  petDetailInfoGroup: { gap: 3, marginTop: 2 },
  petListCopy: { paddingRight: 76 },
  petDetailAvatar: { width: 82, height: 82, borderRadius: 24 },
  petDetailAvatarPlaceholder: { alignItems: "center", justifyContent: "center" },
  recordPetIdentity: { position: "relative", alignSelf: "flex-start" },
  recordPetAvatar: { width: 38, height: 38, borderRadius: 12 },
  recordPetIconBadge: { position: "absolute", top: -5, right: -5, width: 20, height: 20, borderRadius: 7, borderWidth: 2, borderColor: "#FFFFFF" },
  petDetailName: { fontSize: 22, fontWeight: "800" },
  petOpenArrow: { fontSize: 28, fontWeight: "700", paddingHorizontal: 4 },
  healthHistoryHeading: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginTop: 18, marginBottom: 9 },
  weightTrackingHeading: { marginTop: 0 },
  healthSearchInput: { marginTop: 10, marginBottom: 4 },
  healthClinicFilter: { marginTop: 9, marginBottom: 4 },
  healthFiltersPanel: { gap: 4, paddingTop: 7 },
  healthFilterDisclosure: { minHeight: 38, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 10, paddingHorizontal: 11, paddingVertical: 7, marginTop: 5 },
  healthFilterDisclosureTitle: { fontSize: 9, fontWeight: "800" },
  healthFilterDisclosureAction: { fontSize: 8, fontWeight: "800" },
  dashboardCard: { borderRadius: 15, padding: 15, gap: 10, marginTop: 12 },
  dashboardColumns: { gap: 11 },
  dashboardSection: { gap: 4 },
  dashboardValue: { fontSize: 9, lineHeight: 14 },
  petAlbumCard: { borderWidth: 1, borderRadius: 15, padding: 14, gap: 10, marginTop: 12 },
  petAlbumHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  petAlbumPinnedStrip: { flexDirection: "row", gap: 10, paddingVertical: 3 },
  petAlbumPinnedItem: { width: 108, gap: 5 },
  petAlbumPinnedImage: { width: 108, height: 90, borderRadius: 12 },
  petAlbumPinnedDescription: { fontSize: 9, lineHeight: 13, fontWeight: "600" },
  petAlbumListHeader: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 3 },
  petAlbumPhotoRow: { flexDirection: "row", alignItems: "center", gap: 10, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, marginTop: 2 },
  petAlbumDragHandle: { width: 30, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 9 },
  petAlbumDragGlyph: { fontSize: 22, fontWeight: "800", lineHeight: 26 },
  petAlbumPhotoThumbnail: { width: 66, height: 66, borderRadius: 12 },
  petAlbumPhotoCopy: { flex: 1, gap: 7 },
  petAlbumBulkControls: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 },
  petAlbumSelectionActions: { flexDirection: "row", alignItems: "center", gap: 11 },
  petAlbumSelectAllButton: { minHeight: 34, justifyContent: "center", paddingHorizontal: 4 },
  petAlbumSelectAllText: { fontSize: 9, fontWeight: "800" },
  petAlbumSelectionBox: { width: 23, height: 23, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderRadius: 7 },
  petAlbumSelectionMark: { color: "#FFFFFF", fontSize: 13, fontWeight: "900", lineHeight: 15 },
  petAlbumDescriptionInput: { minHeight: 38, borderWidth: 1, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 7, fontSize: 10 },
  petAlbumPinButton: { alignSelf: "flex-start", minHeight: 30, justifyContent: "center", borderWidth: 1, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 5 },
  petAlbumPinButtonText: { fontSize: 8, fontWeight: "800" },
  petAlbumUploadStatus: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 11 },
  petAlbumUploadCopy: { flex: 1, gap: 6 },
  petAlbumUploadTrack: { height: 5, borderRadius: 3, overflow: "hidden" },
  petAlbumUploadFill: { height: "100%", borderRadius: 3 },
  weightCard: { borderWidth: 1, borderRadius: 15, padding: 14, gap: 10, marginTop: 12 },
  listSectionCard: { borderWidth: 1, borderRadius: 15, padding: 13, marginTop: 12, overflow: "hidden" },
  journalListPage: { flex: 1, minHeight: 0 },
  journalListCard: { flex: 1, minHeight: 0 },
  journalEntriesScroll: { flex: 1, minHeight: 0, width: "100%" },
  reminderListPage: { flex: 1, minHeight: 0 },
  reminderListCard: { flex: 1, minHeight: 0 },
  reminderListScroll: { flex: 1, minHeight: 0, width: "100%" },
  reminderFormPage: { flex: 1, minHeight: 0 },
  reminderFormScroll: { flex: 1, minHeight: 0, width: "100%" },
  reminderFormContent: { paddingBottom: 8 },
  listSectionHeader: { marginTop: 0, marginBottom: 10 },
  listSectionTitle: { marginTop: 0, marginBottom: 10 },
  listSectionScroll: { maxHeight: 360, width: "100%" },
  healthHistoryResults: { marginTop: 0 },
  healthHistoryDivider: { height: StyleSheet.hairlineWidth, marginTop: 12, marginBottom: 8 },
  listSectionScrollContent: { paddingBottom: 3 },
  weightForm: { gap: 9, marginTop: 5 },
  weightChart: { gap: 8, marginVertical: 5 },
  weightChartItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  weightChartValue: { width: 68, fontSize: 8, fontWeight: "700" },
  weightBarTrack: { flex: 1, height: 10, borderRadius: 6, overflow: "hidden" },
  weightBar: { height: "100%", borderRadius: 6 },
  weightChartDate: { width: 48, fontSize: 7, textAlign: "right" },
  healthTypeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  healthTypeChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 8 },
  healthGroup: { gap: 7, marginBottom: 13 },
  healthGroupTitle: { fontSize: 13, fontWeight: "800", marginTop: 3 },
  healthRecordCard: { borderWidth: 1, borderRadius: 13, padding: 12, gap: 6 },
  healthRecordTitle: { fontSize: 12, fontWeight: "800" },
  nextDueText: { fontSize: 9, fontWeight: "800", textAlign: "right", maxWidth: 130 },
  healthDetailModal: { width: "100%", maxWidth: 460, maxHeight: "85%", borderRadius: 18, padding: 17 },
  petAlbumModal: { width: "100%", height: "88%", maxWidth: 520, maxHeight: "88%", borderRadius: 18, padding: 16, gap: 10, overflow: "hidden" },
  petAlbumModalScroll: { flex: 1, minHeight: 0, width: "100%" },
  petAlbumModalContent: { paddingBottom: 4 },
  healthDetailScroll: { flexShrink: 1 },
  healthDetailContent: { paddingBottom: 12 },
  closeDetailButton: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  healthDetailTitle: { fontSize: 21, fontWeight: "800", marginTop: 6 },
  healthDetailPet: { fontSize: 12, fontWeight: "700", marginTop: 4, marginBottom: 14 },
  healthDetailSection: { borderTopWidth: 1, paddingVertical: 11, gap: 5 },
  healthDetailNotes: { borderBottomWidth: 1 },
  notesHeaderRow: { minHeight: 28, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  copyNotesButton: { minHeight: 28, justifyContent: "center", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  copyNotesButtonText: { fontSize: 8, fontWeight: "800" },
  healthDetailLabel: { fontSize: 8, fontWeight: "800", letterSpacing: 1 },
  healthDetailValue: { fontSize: 12, lineHeight: 19 },
  healthDetailMeta: { fontSize: 9, marginTop: 12 },
  healthDetailActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingTop: 12 },
  journalPhotoStrip: { flexDirection: "row", gap: 9, paddingVertical: 4 },
  journalPhotoItem: { position: "relative", width: 72, height: 72 },
  journalPhotoPreview: { width: 72, height: 72, borderRadius: 12 },
  journalAttachmentRemove: { position: "absolute", top: -5, right: -5, width: 24, height: 24, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#C96D5E" },
  journalPendingDocument: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: 8 },
  journalAttachmentIndicators: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4 },
  journalIndicator: { fontSize: 9, fontWeight: "800" },
  journalEntryOpen: { gap: 5 },
  journalDetailModal: { width: "100%", maxWidth: 520, maxHeight: "88%", borderRadius: 18, padding: 16 },
  journalDetailScroll: { flexShrink: 1 },
  journalDetailContent: { paddingBottom: 12 },
  journalDetailAttachmentHeading: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, paddingBottom: 2, marginTop: 8 },
  journalDetailNotes: { fontSize: 12, lineHeight: 19, marginTop: 5 },
  journalDetailPhotos: { flexDirection: "row", gap: 10, marginTop: 10 },
  journalDetailPhotoItem: { width: 135, gap: 5 },
  journalDetailPhoto: { width: 135, height: 135, borderRadius: 12 },
  journalDownloadButton: { minHeight: 34, alignItems: "center", justifyContent: "center", alignSelf: "flex-start", paddingHorizontal: 10, borderRadius: 9 },
  journalDocumentRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 58, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  journalDocumentName: { fontSize: 10, fontWeight: "700" },
  petProfileImage: { width: 56, height: 56, borderRadius: 16 },
  petProfilePlaceholder: { width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  profilePhotoPreview: { width: 58, height: 58, borderRadius: 16 },
  profilePhotoPlaceholder: { width: 58, height: 58, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  iconBadge: { width: 28, height: 28, borderRadius: 10, backgroundColor: "#F2F3EF", alignItems: "center", justifyContent: "center" },
  photoPickerRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  petGalleryImage: { width: 56, height: 56, borderRadius: 11 },
  removePhotoText: { color: "#FFFFFF", fontSize: 15, lineHeight: 17, fontWeight: "800" },
  petAge: { fontSize: 8, fontWeight: "700", textAlign: "right" },
  dateText: { fontSize: 8, fontWeight: "700", textAlign: "right", maxWidth: 120 },
  reminderDateBadge: { maxWidth: 132, alignSelf: "flex-end", borderWidth: 1, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 4 },
  reminderDateBadgeText: { maxWidth: 116, textAlign: "right" },
  reminderRecordCard: { position: "relative", overflow: "hidden", paddingTop: 5, paddingBottom: 0 },
  reminderRecordCardWithPhoto: { paddingTop: 9 },
  reminderHistoryRecordCard: { position: "relative", overflow: "hidden" },
  reminderRepeatStripe: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4, borderTopLeftRadius: 14, borderBottomLeftRadius: 14 },
  reminderDetailsPressable: { flex: 1, flexDirection: "row", alignItems: "flex-start", gap: 10 },
  reminderDateActions: { alignItems: "flex-end", gap: 6 },
  dateFieldRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  dateFieldButton: { minHeight: 45, flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dateFieldText: { fontSize: 11, fontWeight: "600" },
  clearDateButton: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#F2F3EF" },
  modalScrim: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#00000066", padding: 18 },
  calendarModal: { width: "100%", maxWidth: 400, borderRadius: 18, padding: 14 },
  typePickerModal: { width: "100%", maxWidth: 420, maxHeight: "75%", borderRadius: 18, padding: 15 },
  modalHeader: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  recordDetailHeader: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 8, marginBottom: 4 },
  typeOptionsList: { maxHeight: 420, marginTop: 4 },
  typeOptionRow: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, paddingHorizontal: 5 },
  typeOptionLabel: { fontSize: 11, fontWeight: "700" },
  typeDropdown: { minHeight: 45, borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dropdownCaret: { width: 9, height: 9, borderRightWidth: 2, borderBottomWidth: 2, transform: [{ rotate: "45deg" }], marginTop: -5, marginRight: 3 },
  addCustomTypeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  reminderOption: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 11, borderRadius: 10 },
  checkBox: { width: 20, height: 20, borderWidth: 1.5, borderRadius: 5, alignItems: "center", justifyContent: "center" },
  reminderOptionText: { fontSize: 10, fontWeight: "700", flex: 1 },
  photoViewer: { flex: 1, backgroundColor: "#080A08", justifyContent: "center", alignItems: "center" },
  photoViewerImage: { width: "100%", height: "82%" },
  photoViewerClose: { position: "absolute", top: 44, right: 18, zIndex: 2, width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF26" },
  photoViewerCloseText: { color: "#FFFFFF", fontSize: 30, lineHeight: 34 },
  photoViewerDownload: { position: "absolute", top: 44, right: 68, zIndex: 2, width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF26" },
  photoViewerDownloadText: { color: "#FFFFFF", fontSize: 20, lineHeight: 22, fontWeight: "800" },
  textAction: { alignSelf: "flex-start", paddingVertical: 3 },
  sectionTitle: { fontSize: 15, fontWeight: "800", marginTop: 8 },
  disclaimer: { textAlign: "center", fontSize: 8, lineHeight: 14, marginTop: 24, paddingHorizontal: 8 },
});
