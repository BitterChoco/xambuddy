import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import Constants, { AppOwnership } from "expo-constants";
import { Image } from "expo-image";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import React, { useEffect, useMemo, useState } from "react";
import {
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
import { nextRecurringDueDate } from "@/utils/care-reminders";
import { birthdayDateInMonth, calendarMonthDates } from "@/utils/care-calendar";

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
  breed: string;
  birthDate: string;
  weight: string;
  allergies: string;
  birthdayReminderEnabled?: boolean;
  profilePhotoUri?: string;
  otherPhotoUris?: string[];
  createdAt: string;
};

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
  createdAt: string;
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
  createdAt: string;
};

type ReminderRepeat = "once" | "daily" | "weekly" | "monthly" | "yearly";
type CareReminder = {
  id: string;
  petId: string;
  title: string;
  dueAt: string;
  repeat: ReminderRepeat;
  notificationId: string | null;
  healthRecordId?: string;
  icon?: string;
  snoozedFrom?: string;
};
type ReminderCompletion = {
  id: string;
  reminderId: string;
  petId: string;
  petName: string;
  title: string;
  scheduledFor: string;
  completedAt: string;
  repeat?: ReminderRepeat;
  icon?: string;
  healthRecordId?: string;
  restoredReminderId?: string;
};

type CareTab = "pets" | "journal" | "reminders" | "calendar";
type NotificationsModule = typeof import("expo-notifications");
const REMINDER_NOTIFICATION_COLOR = "#E85D3F";

const STORAGE_KEYS = {
  pets: "petcare-personal-pets-v1",
  journal: "petcare-journal-v1",
  reminders: "petcare-reminders-v1",
  reminderHistory: "petcare-reminder-history-v1",
  healthRecords: "petcare-health-records-v1",
  weightMeasurements: "petcare-weight-measurements-v1",
} as const;

const MAX_OTHER_PHOTOS = 5;
const GENERAL_REMINDER_PET_ID = "__general__";
const DEFAULT_HEALTH_RECORD_TYPES = ["Vet visit", "Vaccine", "4-in-1 vaccine", "Anti-rabies vaccine", "Other vaccine", "Medication", "Procedure", "Test / screening", "Other"];
const JOURNAL_TYPE_ICONS: Record<string, string> = {
  Health: "health",
  Meals: "food",
  "Vet visit": "paw",
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
  Custom: "note",
};
const REMINDER_ICON_OPTIONS = [
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
const LEGACY_ICON_NAMES: Record<string, string> = {
  "🐾": "dog", paw: "dog", "💉": "vaccine", "💊": "medication", "🏥": "hospital", "🧪": "test",
  "📝": "note", "✨": "dog", "🩺": "stethoscope", "🍽️": "food", "🎂": "gift", birthday: "gift",
  "🏃": "activity", "🧴": "bath", "⚖️": "weight", "🧫": "test", "🐶": "dog", bone: "treat", water: "waterDrop", waterBowl: "waterDrop",
};
const REPEAT_OPTIONS: { id: ReminderRepeat; label: string }[] = [
  { id: "once", label: "Once" },
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "yearly", label: "Yearly" },
];

function getJournalIcon(type: string) {
  return JOURNAL_TYPE_ICONS[type] ?? "note";
}

function normalizeIconName(icon: string | undefined) {
  if (!icon) return "dog";
  return LEGACY_ICON_NAMES[icon] ?? icon;
}

function getHealthRecordIcon(record: Pick<HealthRecord, "type" | "customType">) {
  return HEALTH_RECORD_ICONS[getHealthRecordCategory(record)] ?? HEALTH_RECORD_ICONS.Other;
}

function getHealthRecordCategory(record: Pick<HealthRecord, "type" | "customType">) {
  if (["4-in-1 vaccine", "Anti-rabies vaccine", "Other vaccine"].includes(record.type)) return "Vaccine";
  if (record.type === "Deworming") return "Medication";
  if (record.type === "Other healthcare") return "Other";
  if (record.type === "Custom") return "Other";
  return DEFAULT_HEALTH_RECORD_TYPES.includes(record.type) ? record.type : "Other";
}

function getHealthRecordTypeName(record: HealthRecord) {
  if (record.type === "Custom" || record.type === "Other") return record.customType?.trim() || "Other";
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
  return normalizeIconName(reminder.icon);
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

export function initializeCareNotifications() {
  getNotificationsModule();
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

async function scheduleReminder(title: string, petName: string, dueAt: string) {
  const Notifications = getNotificationsModule();
  if (!Notifications) return null;
  const permitted = await requestReminderPermission();
  if (!permitted) return null;
  return Notifications.scheduleNotificationAsync({
    content: {
      title: `${title} · ${petName}`,
      body: "It's time for a pet-care task.",
      sound: "default",
      badge: 1,
      color: REMINDER_NOTIFICATION_COLOR,
      data: { screen: "care-reminders" },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(dueAt),
      channelId: Platform.OS === "android" ? "care-reminders" : undefined,
    },
  });
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

function SolidPetIcon({ name, color, size = 22, cutout = "#FFFFFF" }: { name: string; color: string; size?: number; cutout?: string }) {
  const unit = size / 24;
  const shape = (left: number, top: number, width: number, height: number, radius = 3, extra: object = {}, fill = color) => (
    <View style={[styles.solidIconPart, { left: left * unit, top: top * unit, width: width * unit, height: height * unit, borderRadius: radius * unit, backgroundColor: fill }, extra]} />
  );

  switch (name) {
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
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  palette: CarePalette;
  multiline?: boolean;
  keyboardType?: "default" | "numeric" | "decimal-pad";
  error?: boolean;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={palette.muted}
      keyboardType={keyboardType}
      multiline={multiline}
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
  const [reminderHistory, setReminderHistory] = useState<ReminderCompletion[]>([]);
  const [reminderHistoryPetFilter, setReminderHistoryPetFilter] = useState("");
  const [healthRecords, setHealthRecords] = useState<HealthRecord[]>([]);
  const [weightMeasurements, setWeightMeasurements] = useState<WeightMeasurement[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedPetId, setSelectedPetId] = useState(initialTab === "reminders" ? GENERAL_REMINDER_PET_ID : "");
  const [activePetId, setActivePetId] = useState<string | null>(null);
  const [selectedHealthRecord, setSelectedHealthRecord] = useState<HealthRecord | null>(null);
  const [healthSearchQuery, setHealthSearchQuery] = useState("");
  const [weightFormOpen, setWeightFormOpen] = useState(false);
  const [weightValue, setWeightValue] = useState("");
  const [weightUnit, setWeightUnit] = useState<"kg" | "lb">("kg");
  const [weightMeasuredAt, setWeightMeasuredAt] = useState(() => localDateInput(new Date()));
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [calendarSelectedDate, setCalendarSelectedDate] = useState(() => localDateInput(new Date()));
  const [editingHealthRecordId, setEditingHealthRecordId] = useState<string | null>(null);
  const [healthRecordFormOpen, setHealthRecordFormOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const careScrollRef = React.useRef<ScrollView>(null);
  const healthFormOffsetRef = React.useRef(0);

  const [petFormOpen, setPetFormOpen] = useState(false);
  const [editingPetId, setEditingPetId] = useState<string | null>(null);
  const [petName, setPetName] = useState("");
  const [petSpecies, setPetSpecies] = useState("");
  const [petBreed, setPetBreed] = useState("");
  const [petBirthDate, setPetBirthDate] = useState("");
  const [petWeight, setPetWeight] = useState("");
  const [petAllergies, setPetAllergies] = useState("");
  const [petBirthdayReminderEnabled, setPetBirthdayReminderEnabled] = useState(false);
  const [profilePhotoUri, setProfilePhotoUri] = useState<string | undefined>();
  const [otherPhotoUris, setOtherPhotoUris] = useState<string[]>([]);
  const [healthType, setHealthType] = useState(DEFAULT_HEALTH_RECORD_TYPES[0]);
  const [healthTypePickerOpen, setHealthTypePickerOpen] = useState(false);
  const [customHealthType, setCustomHealthType] = useState("");
  const [createReminderForDueDate, setCreateReminderForDueDate] = useState(true);
  const [photoViewerUri, setPhotoViewerUri] = useState<string | null>(null);
  const [healthTitle, setHealthTitle] = useState("");
  const [healthDateGiven, setHealthDateGiven] = useState(localDateInput(new Date()));
  const [healthNextDueDate, setHealthNextDueDate] = useState("");
  const [healthClinic, setHealthClinic] = useState("");
  const [healthNotes, setHealthNotes] = useState("");

  const [entryTitle, setEntryTitle] = useState("");
  const [entryNotes, setEntryNotes] = useState("");

  const [reminderTitle, setReminderTitle] = useState("");
  const [editingReminderId, setEditingReminderId] = useState<string | null>(null);
  const [reminderDate, setReminderDate] = useState(() => localDateInput(new Date()));
  const [reminderTime, setReminderTime] = useState(() => formatReminderTime(new Date()));
  const [reminderTitleError, setReminderTitleError] = useState(false);
  const [reminderDateError, setReminderDateError] = useState(false);
  const [reminderTimeError, setReminderTimeError] = useState(false);
  const [reminderScheduleError, setReminderScheduleError] = useState(false);
  const [reminderRepeat, setReminderRepeat] = useState<ReminderRepeat>("once");
  const [reminderIcon, setReminderIcon] = useState<string>(REMINDER_ICON_OPTIONS[0].value);

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (photoViewerUri) {
        setPhotoViewerUri(null);
        return true;
      }
      if (selectedHealthRecord) {
        setSelectedHealthRecord(null);
        return true;
      }
      if (healthTypePickerOpen) {
        setHealthTypePickerOpen(false);
        return true;
      }
      if (healthRecordFormOpen) {
        resetHealthRecordForm();
        return true;
      }
      if (weightFormOpen) {
        setWeightFormOpen(false);
        return true;
      }
      if (editingReminderId) {
        resetReminderForm();
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
    editingReminderId,
    healthRecordFormOpen,
    healthTypePickerOpen,
    onBack,
    petFormOpen,
    photoViewerUri,
    selectedHealthRecord,
    tab,
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
      try { if (savedPets) setPets(JSON.parse(savedPets) as PetProfile[]); } catch { /* Ignore invalid local records. */ }
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
    if (tab === "reminders" && selectedPetId === GENERAL_REMINDER_PET_ID) return;
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

      const Notifications = getNotificationsModule();
      let notificationsCleared = false;
      if (Notifications) {
        try {
          const presentedNotifications = await Notifications.getPresentedNotificationsAsync();
          if (presentedNotifications.length > 0) {
            await Notifications.dismissAllNotificationsAsync();
            notificationsCleared = true;
          }
        } catch {
          // Refresh the care data even if the OS doesn't allow clearing notifications.
        }
      }
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

  function hasHealthRecordReminder(record: HealthRecord) {
    if (!record.nextDueDate) return false;
    const dueAt = new Date(`${record.nextDueDate}T09:00:00`).toISOString();
    return reminders.some((reminder) => reminder.petId === record.petId && reminder.title === `${getHealthRecordTypeName(record)} due` && reminder.dueAt === dueAt);
  }

  function resetPetForm() {
    setEditingPetId(null);
    setPetName("");
    setPetSpecies("");
    setPetBreed("");
    setPetBirthDate("");
    setPetWeight("");
    setPetAllergies("");
    setPetBirthdayReminderEnabled(false);
    setProfilePhotoUri(undefined);
    setOtherPhotoUris([]);
    setPetFormOpen(false);
  }

  function editPet(pet: PetProfile) {
    setEditingPetId(pet.id);
    setPetName(pet.name);
    setPetSpecies(pet.species);
    setPetBreed(pet.breed);
    setPetBirthDate(pet.birthDate);
    setPetWeight(pet.weight);
    setPetAllergies(pet.allergies);
    setPetBirthdayReminderEnabled(Boolean(pet.birthdayReminderEnabled));
    setProfilePhotoUri(pet.profilePhotoUri);
    setOtherPhotoUris(pet.otherPhotoUris ?? []);
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

  async function chooseOtherPhotos(source: "library" | "camera") {
    const remaining = MAX_OTHER_PHOTOS - otherPhotoUris.length;
    if (remaining <= 0) return;

    if (source === "camera") {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setNotice("Allow camera access to add pet photos.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        setOtherPhotoUris((current) => [...current, result.assets[0].uri].slice(0, MAX_OTHER_PHOTOS));
      }
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setNotice("Allow photo library access to choose pet photos.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.8,
    });
    if (!result.canceled) {
      setOtherPhotoUris((current) => [...current, ...result.assets.map((asset) => asset.uri)].slice(0, MAX_OTHER_PHOTOS));
    }
  }

  async function downloadImage(uri: string) {
    if (!uri) return;
    try {
      await Share.share({
        title: "Pet photo",
        message: "Save this pet photo from the profile.",
        url: uri,
      });
    } catch {
      setNotice("Unable to share this photo right now.");
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
    const existing = pets.find((pet) => pet.id === editingPetId);
    const saved: PetProfile = {
      id: editingPetId ?? makeId(),
      name: petName.trim(),
      species: petSpecies.trim(),
      breed: petBreed.trim(),
      birthDate: petBirthDate.trim(),
      weight: petWeight.trim(),
      allergies: petAllergies.trim(),
      birthdayReminderEnabled: petBirthdayReminderEnabled,
      profilePhotoUri,
      otherPhotoUris,
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
          icon: "birthday",
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
    if (!selectedPetId || selectedPetId === GENERAL_REMINDER_PET_ID || !petById.has(selectedPetId)) {
      setNotice("Add and select a pet before saving a journal entry.");
      return;
    }
    if (!entryTitle.trim()) {
      setNotice("Add a short title for this journal entry.");
      return;
    }
    const entry: JournalEntry = {
      id: makeId(),
      petId: selectedPetId,
      type: "Other",
      title: entryTitle.trim(),
      notes: entryNotes.trim(),
      icon: "📝",
      createdAt: new Date().toISOString(),
    };
    setJournal((current) => [entry, ...current]);
    setEntryTitle("");
    setEntryNotes("");
    setNotice("Journal entry saved.");
  }

  function editHealthRecord(record: HealthRecord) {
    setEditingHealthRecordId(record.id);
    const category = getHealthRecordCategory(record);
    setHealthType(DEFAULT_HEALTH_RECORD_TYPES.includes(record.type) ? record.type : category);
    setCustomHealthType(category === "Other" && record.type !== "Other" ? getHealthRecordTypeName(record) : record.customType ?? "");
    setHealthTitle(record.title);
    setHealthDateGiven(record.dateGiven);
    setHealthNextDueDate(record.nextDueDate);
    setHealthClinic(record.clinic);
    setHealthNotes(record.notes);
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
    setCreateReminderForDueDate(true);
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
      createdAt: existingRecord?.createdAt ?? new Date().toISOString(),
    };
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

    let notificationId: string | null = null;
    try {
      notificationId = await scheduleReminder(reminderTitle, petById.get(record.petId)?.name ?? "your pet", dueAt);
    } catch {
      // Keep the in-app reminder even if a native notification cannot be scheduled.
    }
    const replacement: CareReminder = {
      id: linkedReminder?.id ?? makeId(),
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
    setReminderDate(localDateInput(now));
    setReminderTime(formatReminderTime(now));
    setReminderRepeat("once");
    setReminderIcon(REMINDER_ICON_OPTIONS[0].value);
    setReminderTitleError(false);
    setReminderDateError(false);
    setReminderTimeError(false);
    setReminderScheduleError(false);
  }

  function beginEditReminder(reminder: CareReminder) {
    const dueAt = new Date(reminder.dueAt);
    setEditingReminderId(reminder.id);
    setSelectedPetId(reminder.petId || GENERAL_REMINDER_PET_ID);
    setReminderTitle(reminder.title);
    setReminderDate(localDateInput(dueAt));
    setReminderTime(formatReminderTime(dueAt));
    setReminderRepeat(reminder.repeat);
    setReminderIcon(normalizeIconName(reminder.icon));
    setReminderTitleError(false);
    setReminderDateError(false);
    setReminderTimeError(false);
    setReminderScheduleError(false);
  }

  async function saveReminder() {
    const titleMissing = !reminderTitle.trim();
    setReminderTitleError(titleMissing);
    const parsedTime = parseReminderTime(reminderTime);
    const dateValid = isValidDateInput(reminderDate);
    setReminderDateError(!dateValid);
    setReminderTimeError(!parsedTime);
    setReminderScheduleError(false);
    if (!dateValid || !parsedTime) {
      setNotice(titleMissing
        ? "Add a reminder name and choose a valid date and time."
        : "Choose a valid date and enter the time as 9:00 AM or 3:30 PM.");
      return;
    }
    const due = new Date(`${reminderDate}T00:00:00`);
    due.setHours(parsedTime.hour, parsedTime.minute, 0, 0);
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
    let notificationId: string | null = null;
    if (existingReminder?.notificationId) {
      await getNotificationsModule()?.cancelScheduledNotificationAsync(existingReminder.notificationId).catch(() => undefined);
    }
    try {
      notificationId = await scheduleReminder(reminderTitle.trim(), reminderPetName, due.toISOString());
    } catch {
      setNotice("Reminder saved in the app, but the notification could not be scheduled.");
    }
    const reminder: CareReminder = {
      id: existingReminder?.id ?? makeId(),
      petId: reminderPetId,
      title: reminderTitle.trim(),
      dueAt: due.toISOString(),
      repeat: reminderRepeat,
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
      repeat: reminder.repeat,
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
      notificationId = await scheduleReminder(reminder.title, petById.get(reminder.petId)?.name ?? "General", nextDue.toISOString());
    } catch {
      setNotice("Marked complete; the next reminder was saved but its notification could not be scheduled.");
    }
    setReminders((current) => current.map((item) => item.id === reminder.id
      ? { ...item, dueAt: nextDue.toISOString(), notificationId, snoozedFrom: undefined }
      : item));
    if (notificationId) setNotice(`Done. Next ${reminder.repeat} reminder scheduled for ${displayDate(nextDue.toISOString())}.`);
  }

  async function snoozeReminder(reminder: CareReminder) {
    if (reminder.notificationId) {
      await getNotificationsModule()?.cancelScheduledNotificationAsync(reminder.notificationId).catch(() => undefined);
    }
    const snoozedUntil = new Date(Date.now() + 60 * 60 * 1000);
    let notificationId: string | null = null;
    try {
      notificationId = await scheduleReminder(reminder.title, petById.get(reminder.petId)?.name ?? "General", snoozedUntil.toISOString());
    } catch {
      // Keep the snoozed reminder visible in-app if the OS cannot schedule it.
    }
    setReminders((current) => current.map((item) => item.id === reminder.id
      ? { ...item, dueAt: snoozedUntil.toISOString(), notificationId, snoozedFrom: reminder.snoozedFrom ?? reminder.dueAt }
      : item));
    setNotice(notificationId
      ? `Reminder snoozed for one hour, until ${displayDate(snoozedUntil.toISOString())}.`
      : "Reminder snoozed for one hour in-app; a device alert was not scheduled.");
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
      const notificationId = await scheduleReminder(reminder.title, petById.get(reminder.petId)?.name ?? "General", reminder.dueAt);
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
    let notificationId: string | null = null;
    try {
      notificationId = await scheduleReminder(
        completion.title,
        petById.get(completion.petId)?.name ?? completion.petName,
        dueAt,
      );
    } catch {
      // Keep the restored reminder in-app if notification scheduling fails.
    }
    const restoredReminder: CareReminder = {
      id: makeId(),
      petId: completion.petId,
      title: completion.title,
      dueAt,
      repeat,
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
  async function deleteReminder(reminder: CareReminder) {
    if (reminder.notificationId) await getNotificationsModule()?.cancelScheduledNotificationAsync(reminder.notificationId).catch(() => undefined);
    setReminders((current) => current.filter((item) => item.id !== reminder.id));
    setNotice("Reminder removed.");
  }

  function renderPetForm() {
    return (
      <View style={[styles.formCard, { backgroundColor: palette.card, borderColor: palette.line }]}>
        <Text style={[styles.cardTitle, { color: palette.text }]}>{editingPetId ? "Edit pet profile" : "Add a pet"}</Text>
        <CareInput value={petName} onChangeText={setPetName} placeholder="Pet's name *" palette={palette} />
        <CareInput value={petSpecies} onChangeText={setPetSpecies} placeholder="Species (e.g. dog, cat, fish) *" palette={palette} />
        <CareInput value={petBreed} onChangeText={setPetBreed} placeholder="Breed or type (optional)" palette={palette} />
        <CalendarDateField value={petBirthDate} onChange={setPetBirthDate} placeholder="Birth date (optional)" palette={palette} optional />
        <CareInput value={petWeight} onChangeText={setPetWeight} placeholder="Weight with units, e.g. 12 kg (optional)" palette={palette} />
        <CareInput value={petAllergies} onChangeText={setPetAllergies} placeholder="Allergies or important notes (optional)" palette={palette} multiline />
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
              <CareButton title={profilePhotoUri ? "Change library" : "Choose from library"} onPress={() => void chooseProfilePhoto("library")} palette={palette} secondary />
              <CameraActionButton title="Take photo" onPress={() => void chooseProfilePhoto("camera")} palette={palette} />
            </View>
            {profilePhotoUri ? <Pressable onPress={() => setProfilePhotoUri(undefined)} style={styles.textAction}><Text style={{ color: palette.muted }}>Remove picture</Text></Pressable> : null}
          </View>
        </View>
        <Text style={[styles.fieldLabel, { color: palette.muted }]}>OTHER PHOTOS · {otherPhotoUris.length}/{MAX_OTHER_PHOTOS}</Text>
        <View style={styles.photoGrid}>
          {otherPhotoUris.map((uri, index) => (
            <View key={`${uri}-${index}`} style={styles.otherPhotoWrap}>
              <Image source={{ uri }} contentFit="cover" style={styles.otherPhotoPreview} />
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove other photo ${index + 1}`} onPress={() => setOtherPhotoUris((current) => current.filter((_, photoIndex) => photoIndex !== index))} style={styles.removePhotoButton}>
                <Text style={styles.removePhotoText}>×</Text>
              </Pressable>
            </View>
          ))}
        </View>
        {otherPhotoUris.length < MAX_OTHER_PHOTOS ? (
          <View style={styles.photoActionsRow}>
            <CareButton title="＋ Add from library" onPress={() => void chooseOtherPhotos("library")} palette={palette} secondary />
            <CameraActionButton title="Take photo" onPress={() => void chooseOtherPhotos("camera")} palette={palette} />
          </View>
        ) : null}
        <Text style={[styles.helpText, { color: palette.muted }]}>Choose one profile picture and up to five additional photos.</Text>
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
        <CareInput value={healthTitle} onChangeText={setHealthTitle} placeholder="Name, dose, or visit reason (optional)" palette={palette} />
        <CalendarDateField value={healthDateGiven} onChange={setHealthDateGiven} placeholder="Choose date given *" palette={palette} />
        <CalendarDateField value={healthNextDueDate} onChange={setHealthNextDueDate} placeholder="Choose next due date (optional)" palette={palette} optional />
        <CareInput value={healthClinic} onChangeText={setHealthClinic} placeholder="Clinic or veterinarian (optional)" palette={palette} />
        <CareInput value={healthNotes} onChangeText={setHealthNotes} placeholder="Notes, results, or instructions (optional)" palette={palette} multiline />
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
          {editingHealthRecordId ? <CareButton title="Cancel edit" onPress={resetHealthRecordForm} palette={palette} secondary /> : null}
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

  function renderPetDetail(pet: PetProfile) {
    const records = healthRecords
      .filter((record) => record.petId === pet.id)
      .sort((a, b) => b.dateGiven.localeCompare(a.dateGiven));
    const normalizedHealthQuery = healthSearchQuery.trim().toLocaleLowerCase();
    const filteredRecords = records.filter((record) => !normalizedHealthQuery
      || [record.type, record.customType, record.title, record.dateGiven, record.nextDueDate, record.clinic, record.notes]
        .some((value) => value?.toLocaleLowerCase().includes(normalizedHealthQuery)));
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
    return (
      <>
        <Pressable onPress={() => { setWeightFormOpen(false); setActivePetId(null); }} style={styles.detailBackButton}>
          <Text style={{ color: palette.primary, fontWeight: "800" }}>‹  Back to My Pets</Text>
        </Pressable>
        <View style={[styles.recordCard, { backgroundColor: palette.card, borderColor: palette.line }]}>
          <View style={styles.petDetailHeader}>
            {pet.profilePhotoUri ? (
              <Pressable accessibilityRole="button" accessibilityLabel={`View ${pet.name}'s profile photo full screen`} onPress={() => setPhotoViewerUri(pet.profilePhotoUri ?? null)}>
                <Image source={{ uri: pet.profilePhotoUri }} contentFit="cover" style={styles.petDetailAvatar} />
              </Pressable>
            ) : (
              <View style={[styles.petDetailAvatar, styles.petDetailAvatarPlaceholder, { backgroundColor: palette.soft }]}><Text style={{ fontSize: 34 }}>🐾</Text></View>
            )}
            <View style={styles.grow}>
              <Text style={[styles.petDetailName, { color: palette.text }]}>{pet.name}</Text>
              <Text style={[styles.bodyText, { color: palette.primary }]}>{[pet.species, pet.breed].filter(Boolean).join(" · ")}</Text>
              {ageLabel ? <Text style={[styles.bodyText, { color: palette.muted }]}>{ageLabel}</Text> : null}
            </View>
          </View>
          {pet.weight ? <Text style={[styles.bodyText, { color: palette.text }]}>Profile weight: {pet.weight}</Text> : null}
          {pet.allergies ? <Text style={[styles.bodyText, { color: palette.text }]}>Notes: {pet.allergies}</Text> : null}
          {(pet.otherPhotoUris?.length ?? 0) > 0 ? (
            <>
              <Text style={[styles.fieldLabel, { color: palette.muted }]}>OTHER PHOTOS</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.otherPhotosRow}>
                {pet.otherPhotoUris?.map((uri, index) => (
                  <Pressable key={`${uri}-${index}`} accessibilityRole="button" accessibilityLabel={`View ${pet.name}'s other photo ${index + 1} full screen`} onPress={() => setPhotoViewerUri(uri)}>
                    <Image source={{ uri }} contentFit="cover" style={styles.petGalleryImageLarge} />
                  </Pressable>
                ))}
              </ScrollView>
            </>
          ) : null}
          <View style={styles.actionRow}>
            <CareButton title="Edit profile" onPress={() => editPet(pet)} palette={palette} secondary />
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
          <View style={styles.healthHistoryHeading}>
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
          {weightFormOpen ? (
            <View style={styles.weightForm}>
              <CareInput value={weightValue} onChangeText={setWeightValue} placeholder="Weight (e.g. 4.2) *" palette={palette} keyboardType="decimal-pad" />
              <View style={styles.actionRow}>
                {(["kg", "lb"] as const).map((unit) => {
                  const selected = weightUnit === unit;
                  return <Pressable key={unit} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => setWeightUnit(unit)} style={[styles.chip, { backgroundColor: selected ? palette.action : palette.bg, borderColor: selected ? palette.action : palette.line }]}><Text style={[styles.chipText, { color: selected ? "#FFFFFF" : palette.text }]}>{unit}</Text></Pressable>;
                })}
              </View>
              <CalendarDateField value={weightMeasuredAt} onChange={setWeightMeasuredAt} placeholder="Measurement date" palette={palette} />
              <View style={styles.actionRow}>
                <CareButton title="Save measurement" onPress={() => {
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
                }} palette={palette} />
                <CareButton title="Cancel" onPress={() => setWeightFormOpen(false)} palette={palette} secondary />
              </View>
            </View>
          ) : <CareButton title="＋  Add weight measurement" onPress={() => setWeightFormOpen(true)} palette={palette} secondary />}
        </View>

        <View style={styles.healthHistoryHeading}>
          <View style={styles.grow}>
            <Text style={[styles.fieldLabel, { color: palette.primary }]}>HEALTHCARE</Text>
            <Text style={[styles.cardTitle, { color: palette.text }]}>Health & vet history</Text>
          </View>
          <Text style={[styles.helpText, { color: palette.muted }]}>{records.length} records</Text>
        </View>

        {healthRecordFormOpen ? (
          <>
            <Pressable onPress={resetHealthRecordForm} style={styles.detailBackButton}>
              <Text style={{ color: palette.primary, fontWeight: "800" }}>‹  Back to health history</Text>
            </Pressable>
            {renderHealthRecordForm(pet)}
          </>
        ) : (
          <>
            <CareButton title="＋  Add healthcare record" onPress={beginAddHealthRecord} palette={palette} />
            <TextInput
              accessibilityLabel={`Search ${pet.name}'s health history`}
              value={healthSearchQuery}
              onChangeText={setHealthSearchQuery}
              placeholder="Search health history"
              placeholderTextColor={palette.muted}
              style={[styles.input, styles.healthSearchInput, { backgroundColor: palette.bg, color: palette.text, borderColor: palette.line }]}
            />
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
                          </View>
                          {record.nextDueDate ? <Text style={[styles.nextDueText, { color: overdue ? "#C46C5C" : palette.primary }]}>{overdue ? "Overdue · " : "Next · "}{record.nextDueDate}</Text> : null}
                        </View>
                        <Text style={[styles.openDetailsHint, { color: palette.primary }]}>Tap to view full details  →</Text>
                      </Pressable>
                    );
                  })}
                </View>
              );
            })}
            {records.length === 0 ? (
              <EmptyCard title="No health records yet" description="Add vet visits, vaccinations, deworming, and their next due dates using Add healthcare record." palette={palette} />
            ) : filteredRecords.length === 0 ? (
              <EmptyCard title="No matching records" description="Try a different title, record type, clinic, date, or note." palette={palette} />
            ) : null}
          </>
        )}
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
            <Pressable accessibilityRole="button" accessibilityLabel={`Open ${pet.name}'s profile and healthcare history`} onPress={() => setActivePetId(pet.id)} style={({ pressed }) => [styles.cardHeaderRow, pressed && { opacity: 0.75 }]}>
              {pet.profilePhotoUri ? (
                <Image source={{ uri: pet.profilePhotoUri }} contentFit="cover" style={styles.petProfileImage} />
              ) : (
                <View style={[styles.petProfilePlaceholder, { backgroundColor: palette.soft }]}><Text style={{ fontSize: 25 }}>🐾</Text></View>
              )}
              <View style={styles.grow}>
                <Text style={[styles.cardTitle, { color: palette.text }]}>{pet.name}</Text>
                <Text style={[styles.bodyText, { color: palette.primary }]}>{pet.species}</Text>
                {pet.breed ? <Text style={[styles.bodyText, { color: palette.muted }]}>{pet.breed}</Text> : null}
              </View>
              <Text style={[styles.petOpenArrow, { color: palette.primary }]}>›</Text>
            </Pressable>
            <View style={styles.actionRow}>
              <CareButton title="View details & health" onPress={() => setActivePetId(pet.id)} palette={palette} />
              <CareButton title="Edit" onPress={() => editPet(pet)} palette={palette} secondary />
              <CareButton title="Remove" onPress={() => deletePet(pet)} palette={palette} secondary />
            </View>
          </View>
        ))}
      </>
    );
  }

  function renderJournal() {
    return (
      <>
        <View style={[styles.formCard, { backgroundColor: palette.card, borderColor: palette.line }]}>
          <Text style={[styles.cardTitle, { color: palette.text }]}>Add a care note</Text>
          <Text style={[styles.fieldLabel, { color: palette.muted }]}>FOR WHICH PET?</Text>
          <PetChips pets={pets} selectedPetId={selectedPetId} onSelect={setSelectedPetId} palette={palette} />
          <CareInput value={entryTitle} onChangeText={setEntryTitle} placeholder="Short title *" palette={palette} />
          <CareInput value={entryNotes} onChangeText={setEntryNotes} placeholder="Notes, measurements, or observations" palette={palette} multiline />
          <CareButton title="Save journal entry" onPress={saveJournalEntry} palette={palette} disabled={pets.length === 0} />
          <Text style={[styles.helpText, { color: palette.muted }]}>Entries are time-stamped and stored locally on this device.</Text>
        </View>
        <Text style={[styles.sectionTitle, { color: palette.text }]}>Recent entries</Text>
        {sortedJournal.length === 0 ? (
          <EmptyCard title="Your journal is ready" description="Log a meal, health observation, weight, or vet visit to start a history." palette={palette} />
        ) : sortedJournal.map((entry) => (
          <View key={entry.id} style={[styles.recordCard, { backgroundColor: palette.card, borderColor: palette.line }]}>
            <View style={styles.cardHeaderRow}>
              <View style={[styles.iconBadge, { backgroundColor: palette.soft }]}><SolidPetIcon name={normalizeIconName(entry.icon ?? getJournalIcon(entry.type))} color={palette.primary} cutout={palette.soft} /></View>
              <View style={styles.grow}>
                <Text style={[styles.cardTitle, { color: palette.text }]}>{entry.title}</Text>
                <Text style={[styles.bodyText, { color: palette.primary }]}>{petById.get(entry.petId)?.name ?? "Pet"}</Text>
              </View>
              <Text style={[styles.dateText, { color: palette.muted }]}>{new Date(entry.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</Text>
            </View>
            {entry.notes ? <Text style={[styles.bodyText, { color: palette.muted }]}>{entry.notes}</Text> : null}
            <Pressable onPress={() => setJournal((current) => current.filter((item) => item.id !== entry.id))} style={styles.textAction}>
              <Text style={{ color: palette.muted }}>Remove entry</Text>
            </Pressable>
          </View>
        ))}
      </>
    );
  }

  function renderReminders() {
    const visibleReminderHistory = reminderHistory
      .filter((completion) => !reminderHistoryPetFilter || completion.petId === reminderHistoryPetFilter)
      .slice(0, 20);
    return (
      <>
        <View style={[styles.formCard, { backgroundColor: palette.card, borderColor: palette.line }]}>
          <Text style={[styles.cardTitle, { color: palette.text }]}>{editingReminderId ? "Edit care reminder" : "Schedule a care reminder"}</Text>
          <Text style={[styles.fieldLabel, { color: palette.muted }]}>FOR WHICH PET?</Text>
          <PetChips pets={pets} selectedPetId={selectedPetId} onSelect={setSelectedPetId} palette={palette} allowGeneral />
          <CareInput value={reminderTitle} onChangeText={(value) => { setReminderTitle(value); if (value.trim()) setReminderTitleError(false); }} placeholder="Medication, grooming, checkup… *" palette={palette} error={reminderTitleError} />
          <View style={styles.inlineInputs}>
            <View style={styles.grow}>
              <CalendarDateField value={reminderDate} onChange={(value) => { setReminderDate(value); setReminderDateError(false); setReminderScheduleError(false); }} placeholder="Choose reminder date" palette={palette} error={reminderDateError || reminderScheduleError} />
            </View>
            <View style={styles.timeInput}>
              <ReminderTimeField value={reminderTime} onChange={(value) => { setReminderTime(value); setReminderTimeError(false); setReminderScheduleError(false); }} palette={palette} error={reminderTimeError || reminderScheduleError} />
            </View>
          </View>
          {Platform.OS === "web" ? <Text style={[styles.helpText, { color: palette.muted }]}>Enter time with AM or PM, such as 9:00 AM.</Text> : null}
          <Text style={[styles.fieldLabel, { color: palette.muted }]}>REPEAT</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {REPEAT_OPTIONS.map((option) => (
              <Pressable key={option.id} onPress={() => setReminderRepeat(option.id)} style={[styles.chip, { backgroundColor: reminderRepeat === option.id ? palette.action : palette.bg, borderColor: reminderRepeat === option.id ? palette.action : palette.line }]}>
                <Text style={[styles.chipText, { color: reminderRepeat === option.id ? "#FFFFFF" : palette.text }]}>{option.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
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
        <Text style={[styles.sectionTitle, { color: palette.text }]}>Upcoming reminders</Text>
        {sortedReminders.length === 0 ? (
          <EmptyCard title="No reminders yet" description="Add a medication, grooming, or checkup reminder for one of your pets." palette={palette} />
        ) : sortedReminders.map((reminder) => {
          const overdue = new Date(reminder.dueAt) < new Date();
          return (
            <View key={reminder.id} style={[styles.recordCard, { backgroundColor: palette.card, borderColor: overdue ? "#D87967" : palette.line }]}>
              <View style={styles.cardHeaderRow}>
                <View style={[styles.iconBadge, { backgroundColor: palette.soft }]}><SolidPetIcon name={normalizeIconName(getReminderIcon(reminder, healthRecords))} color={palette.primary} cutout={palette.soft} /></View>
                <View style={styles.grow}>
                  <Text style={[styles.cardTitle, { color: palette.text }]}>{reminder.title}</Text>
                  <Text style={[styles.bodyText, { color: palette.primary }]}>{petById.get(reminder.petId)?.name ?? "General"} · {reminder.repeat === "once" ? "One-time" : `Repeats ${reminder.repeat}`}</Text>
                </View>
                <Text style={[styles.dateText, { color: overdue ? "#C46C5C" : palette.muted }]}>{overdue ? "Overdue · " : reminder.snoozedFrom ? "Snoozed · " : ""}{displayDate(reminder.dueAt)}</Text>
              </View>
              <Text style={[styles.helpText, { color: palette.muted }]}>{reminder.notificationId ? "Device notification scheduled" : "In-app reminder only"}</Text>
              <View style={styles.actionRow}>
                <CareButton title={reminder.repeat === "once" ? "Mark done" : "Done · schedule next"} onPress={() => void completeReminder(reminder)} palette={palette} />
                <CareButton title="Snooze 1 hour" onPress={() => void snoozeReminder(reminder)} palette={palette} secondary />
                <CareButton title="Edit" onPress={() => beginEditReminder(reminder)} palette={palette} secondary />
                {!reminder.notificationId && notificationsAvailable() ? <CareButton title="Retry alert" onPress={() => void retryReminderNotification(reminder)} palette={palette} secondary /> : null}
                <CareButton title="Remove" onPress={() => void deleteReminder(reminder)} palette={palette} secondary />
              </View>
            </View>
          );
        })}
        <View style={[styles.historyHeading, { marginTop: 22 }]}>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>Completed recently</Text>
          {reminderHistory.length > 0 ? <CareButton title="Clear history" onPress={clearReminderHistory} palette={palette} secondary /> : null}
        </View>
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
          <View key={completion.id} style={[styles.recordCard, { backgroundColor: palette.card, borderColor: palette.line }]}>
            <View style={styles.cardHeaderRow}>
              <View style={[styles.iconBadge, { backgroundColor: palette.soft }]}><Text style={{ color: palette.primary, fontWeight: "900" }}>✓</Text></View>
              <View style={styles.grow}>
                <Text style={[styles.cardTitle, { color: palette.text }]}>{completion.title}</Text>
                <Text style={[styles.bodyText, { color: palette.muted }]}>{completion.petName} · Due {displayDate(completion.scheduledFor)}</Text>
              </View>
              <Text style={[styles.dateText, { color: palette.muted }]}>{displayDate(completion.completedAt)}</Text>
            </View>
            <View style={styles.actionRow}>
              <CareButton
                title={completion.restoredReminderId ? "Restored" : "Restore reminder"}
                onPress={() => void restoreCompletedReminder(completion)}
                palette={palette}
                secondary
                disabled={Boolean(completion.restoredReminderId)}
              />
            </View>
          </View>
        ))}
      </>
    );
  }

  function renderCalendar() {
    const monthStart = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const monthEnd = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
    const monthEvents: { id: string; date: string; petId: string; title: string; kind: string }[] = [];

    for (const reminder of reminders) {
      const originalDue = new Date(reminder.dueAt);
      if (Number.isNaN(originalDue.getTime())) continue;
      if (reminder.snoozedFrom) {
        if (originalDue >= monthStart && originalDue < monthEnd) {
          monthEvents.push({ id: reminder.id, date: localDateInput(originalDue), petId: reminder.petId, title: reminder.title, kind: "Reminder · snoozed" });
        }
        continue;
      }
      const birthdayPet = pets.find((pet) => pet.id === reminder.petId && pet.birthdayReminderEnabled);
      if (birthdayPet && reminder.title === `${birthdayPet.name}'s birthday`) continue;
      if (reminder.repeat === "once") {
        if (originalDue >= monthStart && originalDue < monthEnd) {
          monthEvents.push({ id: reminder.id, date: localDateInput(originalDue), petId: reminder.petId, title: reminder.title, kind: "Reminder" });
        }
        continue;
      }
      let occurrence = nextRecurringDueDate(reminder.snoozedFrom ?? reminder.dueAt, reminder.repeat, new Date(monthStart.getTime() - 1));
      let count = 0;
      while (occurrence < monthEnd && count < 40) {
        if (occurrence >= monthStart) {
          monthEvents.push({ id: `${reminder.id}-${occurrence.toISOString()}`, date: localDateInput(occurrence), petId: reminder.petId, title: reminder.title, kind: "Reminder" });
        }
        occurrence = nextRecurringDueDate(occurrence.toISOString(), reminder.repeat, occurrence);
        count += 1;
      }
    }

    for (const record of healthRecords) {
      if (!record.nextDueDate) continue;
      const dueDate = new Date(`${record.nextDueDate}T00:00:00`);
      if (dueDate >= monthStart && dueDate < monthEnd) {
        monthEvents.push({ id: `health-${record.id}`, date: record.nextDueDate, petId: record.petId, title: `${getHealthRecordTypeName(record)} due`, kind: "Health follow-up" });
      }
    }

    for (const pet of pets) {
      if (!pet.birthdayReminderEnabled || !pet.birthDate) continue;
      const birthday = birthdayDateInMonth(pet.birthDate, calendarMonth.getFullYear(), calendarMonth.getMonth());
      if (!birthday) continue;
      monthEvents.push({ id: `birthday-${pet.id}-${calendarMonth.getFullYear()}`, date: birthday, petId: pet.id, title: `${pet.name}'s birthday`, kind: "Birthday" });
    }

    monthEvents.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
    const calendarDates = calendarMonthDates(calendarMonth.getFullYear(), calendarMonth.getMonth());
    const selectedEvents = monthEvents.filter((event) => event.date === calendarSelectedDate);
    const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    return (
      <>
        <View style={styles.calendarHeading}>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>Care calendar</Text>
          <View style={styles.calendarMonthControls}>
            <Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => { const previous = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1); setCalendarMonth(previous); setCalendarSelectedDate(localDateInput(previous)); }} style={[styles.calendarMonthArrow, { backgroundColor: palette.soft }]}><Text style={{ color: palette.primary }}>‹</Text></Pressable>
            <Text style={[styles.calendarMonthLabel, { color: palette.text }]}>{calendarMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Next month" onPress={() => { const next = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1); setCalendarMonth(next); setCalendarSelectedDate(localDateInput(next)); }} style={[styles.calendarMonthArrow, { backgroundColor: palette.soft }]}><Text style={{ color: palette.primary }}>›</Text></Pressable>
          </View>
        </View>
        <View style={[styles.calendarCard, { backgroundColor: palette.card, borderColor: palette.line }]}>
          <View style={styles.calendarGrid}>
            {weekdays.map((weekday) => <Text key={weekday} style={[styles.calendarWeekday, { color: palette.muted }]}>{weekday}</Text>)}
            {calendarDates.map((date, index) => {
              if (!date) return <View key={`blank-${index}`} style={styles.calendarDayCell} />;
              const day = Number(date.slice(-2));
              const isToday = date === localDateInput(new Date());
              const selected = date === calendarSelectedDate;
              const eventCount = monthEvents.filter((event) => event.date === date).length;
              return (
                <Pressable key={date} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`${calendarMonth.toLocaleDateString(undefined, { month: "long" })} ${day}${eventCount ? `, ${eventCount} care events` : ""}`} onPress={() => setCalendarSelectedDate(date)} style={[styles.calendarDayCell, styles.calendarDayButton, selected && { backgroundColor: palette.action }, isToday && !selected && { borderColor: palette.primary, borderWidth: 1 }]}>
                  <Text style={[styles.calendarDayNumber, { color: selected ? "#FFFFFF" : palette.text }]}>{day}</Text>
                  {eventCount ? <View style={[styles.calendarEventDot, { backgroundColor: selected ? "#FFFFFF" : palette.primary }]} /> : null}
                </Pressable>
              );
            })}
          </View>
          <View style={styles.calendarLegend}>
            <View style={[styles.calendarEventDot, { backgroundColor: palette.primary }]} />
            <Text style={[styles.helpText, { color: palette.muted }]}>Reminder · birthday · health follow-up</Text>
          </View>
        </View>
        <Text style={[styles.sectionTitle, { color: palette.text, marginTop: 18 }]}>{new Date(`${calendarSelectedDate}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</Text>
        {selectedEvents.length ? selectedEvents.map((event) => (
          <View key={event.id} style={[styles.recordCard, { backgroundColor: palette.card, borderColor: palette.line }]}>
            <View style={styles.cardHeaderRow}>
              <View style={[styles.iconBadge, { backgroundColor: palette.soft }]}><Text style={{ color: palette.primary, fontWeight: "900" }}>{event.kind === "Birthday" ? "★" : event.kind === "Reminder" ? "◷" : "＋"}</Text></View>
              <View style={styles.grow}>
                <Text style={[styles.cardTitle, { color: palette.text }]}>{event.title}</Text>
                <Text style={[styles.bodyText, { color: palette.muted }]}>{event.kind} · {petById.get(event.petId)?.name ?? "Pet"}</Text>
              </View>
            </View>
          </View>
        )) : <EmptyCard title="No care events" description="Nothing is scheduled for this day." palette={palette} />}
        {pets.length === 0 ? <Text style={[styles.helpText, { color: palette.muted, marginTop: 12 }]}>Add pet profiles to see birthdays and pet names on your calendar.</Text> : null}
      </>
    );
  }

  const tabs: { id: CareTab; label: string }[] = [
    { id: "pets", label: "My pets" },
    { id: "journal", label: "Journal" },
    { id: "reminders", label: "Reminders" },
    { id: "calendar", label: "Calendar" },
  ];

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.bg }]}>
      <ScrollView
        ref={careScrollRef}
        contentContainerStyle={styles.content}
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
            <Text style={{ color: palette.primary, fontSize: 24 }}>‹</Text>
          </Pressable>
          <View style={styles.grow}>
            <Text style={[styles.eyebrow, { color: palette.primary }]}>YOUR CARE SPACE</Text>
            <Text style={[styles.headerTitle, { color: palette.text }]}>Care center</Text>
          </View>
        </View>
        <View style={[styles.tabs, { backgroundColor: palette.soft }]}>
          {tabs.map((item) => (
            <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected: tab === item.id }} onPress={() => { setTab(item.id); if (item.id === "reminders") setSelectedPetId(GENERAL_REMINDER_PET_ID); }} style={[styles.tab, tab === item.id && { backgroundColor: palette.card }]}>
              <Text style={[styles.tabText, { color: tab === item.id ? palette.primary : palette.muted }]}>{item.label}</Text>
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
        {loaded && tab === "calendar" ? renderCalendar() : null}
        <Text style={[styles.disclaimer, { color: palette.muted }]}>Personal records stay on this device. Reminders and journal notes are organizational tools, not a substitute for veterinary advice.</Text>
      </ScrollView>
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
                  <Text style={[styles.healthDetailLabel, { color: palette.muted }]}>NOTES</Text>
                  <Text style={[styles.healthDetailValue, { color: palette.text }]}>{selectedHealthRecord.notes || "No notes added."}</Text>
                </View>
                <Text style={[styles.healthDetailMeta, { color: palette.muted }]}>Saved {new Date(selectedHealthRecord.createdAt).toLocaleString()}</Text>
              </ScrollView>
              <View style={styles.healthDetailActions}>
                <CareButton title="Edit record" onPress={() => editHealthRecord(selectedHealthRecord)} palette={palette} secondary />
                {selectedHealthRecord.nextDueDate ? (
                  <CareButton
                    title={hasHealthRecordReminder(selectedHealthRecord) ? "Reminder added" : "Add reminder"}
                    onPress={() => void addReminderForHealthRecord(selectedHealthRecord)}
                    palette={palette}
                    secondary
                    disabled={hasHealthRecordReminder(selectedHealthRecord)}
                  />
                ) : null}
                <CareButton title="Remove record" onPress={() => removeHealthRecord(selectedHealthRecord)} palette={palette} destructive />
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
  header: { minHeight: 82, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", gap: 13 },
  backButton: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  eyebrow: { fontSize: 8, fontWeight: "800", letterSpacing: 1.6, marginBottom: 4 },
  headerTitle: { fontSize: 23, fontWeight: "700" },
  tabs: { flexDirection: "row", borderRadius: 13, padding: 4, gap: 3, marginTop: 17, marginBottom: 15 },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 39, borderRadius: 10 },
  tabText: { fontSize: 10, fontWeight: "800" },
  notice: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, marginBottom: 12 },
  noticeText: { flex: 1, fontSize: 9, fontWeight: "700" },
  introCard: { padding: 16, borderRadius: 15, marginBottom: 13, gap: 5 },
  formCard: { borderWidth: 1, borderRadius: 15, padding: 14, gap: 10, marginBottom: 14 },
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
  iconChoice: { width: 68, minHeight: 64, borderWidth: 1, borderRadius: 13, alignItems: "center", justifyContent: "center", gap: 2, paddingHorizontal: 4, paddingVertical: 5 },
  iconChoiceText: { fontSize: 20 },
  iconChoiceLabel: { width: "100%", minHeight: 18, textAlign: "center", fontSize: 7, lineHeight: 9, fontWeight: "700" },
  solidIconPart: { position: "absolute" },
  button: { minHeight: 39, justifyContent: "center", alignItems: "center", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  buttonText: { fontSize: 9, fontWeight: "800" },
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
  petDetailHeader: { flexDirection: "row", alignItems: "center", gap: 13, marginBottom: 5 },
  petDetailAvatar: { width: 82, height: 82, borderRadius: 24 },
  petDetailAvatarPlaceholder: { alignItems: "center", justifyContent: "center" },
  petDetailName: { fontSize: 22, fontWeight: "800" },
  petOpenArrow: { fontSize: 28, fontWeight: "700", paddingHorizontal: 4 },
  petGalleryImageLarge: { width: 58, height: 58, borderRadius: 12 },
  healthHistoryHeading: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginTop: 18, marginBottom: 9 },
  healthSearchInput: { marginTop: 10, marginBottom: 4 },
  dashboardCard: { borderRadius: 15, padding: 15, gap: 10, marginTop: 12 },
  dashboardColumns: { gap: 11 },
  dashboardSection: { gap: 4 },
  dashboardValue: { fontSize: 9, lineHeight: 14 },
  weightCard: { borderWidth: 1, borderRadius: 15, padding: 14, gap: 10, marginTop: 12 },
  weightForm: { gap: 9, marginTop: 5 },
  weightChart: { gap: 8, marginVertical: 5 },
  weightChartItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  weightChartValue: { width: 68, fontSize: 8, fontWeight: "700" },
  weightBarTrack: { flex: 1, height: 10, borderRadius: 6, overflow: "hidden" },
  weightBar: { height: "100%", borderRadius: 6 },
  weightChartDate: { width: 48, fontSize: 7, textAlign: "right" },
  calendarHeading: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 },
  calendarMonthControls: { flexDirection: "row", alignItems: "center", gap: 7 },
  calendarMonthArrow: { width: 33, height: 33, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  calendarMonthLabel: { minWidth: 118, textAlign: "center", fontSize: 11, fontWeight: "800" },
  calendarCard: { borderWidth: 1, borderRadius: 15, padding: 10 },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap" },
  calendarWeekday: { width: "14.2857%", minHeight: 30, textAlign: "center", textAlignVertical: "center", fontSize: 8, fontWeight: "800" },
  calendarDayCell: { width: "14.2857%", height: 43, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  calendarDayButton: { gap: 3 },
  calendarDayNumber: { fontSize: 9, fontWeight: "700" },
  calendarEventDot: { width: 5, height: 5, borderRadius: 3 },
  calendarLegend: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 8, paddingHorizontal: 4 },
  healthTypeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  healthTypeChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 8 },
  healthGroup: { gap: 7, marginBottom: 13 },
  healthGroupTitle: { fontSize: 13, fontWeight: "800", marginTop: 3 },
  healthRecordCard: { borderWidth: 1, borderRadius: 13, padding: 12, gap: 6 },
  healthRecordTitle: { fontSize: 12, fontWeight: "800" },
  nextDueText: { fontSize: 9, fontWeight: "800", textAlign: "right", maxWidth: 130 },
  openDetailsHint: { fontSize: 8, fontWeight: "800", alignSelf: "flex-end", marginTop: 1 },
  healthDetailModal: { width: "100%", maxWidth: 460, maxHeight: "85%", borderRadius: 18, padding: 17 },
  healthDetailScroll: { flexShrink: 1 },
  healthDetailContent: { paddingBottom: 12 },
  closeDetailButton: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  healthDetailTitle: { fontSize: 21, fontWeight: "800", marginTop: 6 },
  healthDetailPet: { fontSize: 12, fontWeight: "700", marginTop: 4, marginBottom: 14 },
  healthDetailSection: { borderTopWidth: 1, paddingVertical: 11, gap: 5 },
  healthDetailNotes: { borderBottomWidth: 1 },
  healthDetailLabel: { fontSize: 8, fontWeight: "800", letterSpacing: 1 },
  healthDetailValue: { fontSize: 12, lineHeight: 19 },
  healthDetailMeta: { fontSize: 9, marginTop: 12 },
  healthDetailActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingTop: 12 },
  petProfileImage: { width: 56, height: 56, borderRadius: 16 },
  petProfilePlaceholder: { width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  profilePhotoPreview: { width: 58, height: 58, borderRadius: 16 },
  profilePhotoPlaceholder: { width: 58, height: 58, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  iconBadge: { width: 28, height: 28, borderRadius: 10, backgroundColor: "#F2F3EF", alignItems: "center", justifyContent: "center" },
  photoPickerRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  otherPhotosRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  otherPhotoWrap: { position: "relative", width: 46, height: 46 },
  otherPhotoPreview: { width: 46, height: 46, borderRadius: 12 },
  photoActionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  petGalleryImage: { width: 56, height: 56, borderRadius: 11 },
  removePhotoButton: { position: "absolute", top: -6, right: -6, width: 21, height: 21, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "#C96D5E" },
  removePhotoText: { color: "#FFFFFF", fontSize: 15, lineHeight: 17, fontWeight: "800" },
  petAge: { fontSize: 8, fontWeight: "700", textAlign: "right" },
  dateText: { fontSize: 8, fontWeight: "700", textAlign: "right", maxWidth: 120 },
  dateFieldRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  dateFieldButton: { minHeight: 45, flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dateFieldText: { fontSize: 11, fontWeight: "600" },
  clearDateButton: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#F2F3EF" },
  modalScrim: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#00000066", padding: 18 },
  calendarModal: { width: "100%", maxWidth: 400, borderRadius: 18, padding: 14 },
  typePickerModal: { width: "100%", maxWidth: 420, maxHeight: "75%", borderRadius: 18, padding: 15 },
  modalHeader: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
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
