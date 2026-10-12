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
  StyleSheet,
  Text as NativeText,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

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
  profilePhotoUri?: string;
  otherPhotoUris?: string[];
  createdAt: string;
};

type JournalEntry = {
  id: string;
  petId: string;
  type: string;
  title: string;
  notes: string;
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
  createdAt: string;
};

type ReminderRepeat = "once" | "daily" | "weekly" | "monthly";
type CareReminder = {
  id: string;
  petId: string;
  title: string;
  dueAt: string;
  repeat: ReminderRepeat;
  notificationId: string | null;
  healthRecordId?: string;
};

type CareTab = "pets" | "journal" | "reminders";
type NotificationsModule = typeof import("expo-notifications");

const STORAGE_KEYS = {
  pets: "petcare-personal-pets-v1",
  journal: "petcare-journal-v1",
  reminders: "petcare-reminders-v1",
  healthRecords: "petcare-health-records-v1",
} as const;

const JOURNAL_TYPES = ["Health", "Meals", "Vet visit", "Weight", "Other"];
const DEFAULT_HEALTH_RECORD_TYPES = ["Vet visit", "4-in-1 vaccine", "Deworming", "Anti-rabies vaccine", "Other vaccine", "Other healthcare", "Custom"];
const REPEAT_OPTIONS: { id: ReminderRepeat; label: string }[] = [
  { id: "once", label: "Once" },
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
];

function getHealthRecordTypeName(record: HealthRecord) {
  if (record.type === "Custom") return record.customType?.trim() || "Custom";
  return record.type;
}

function isLegacyCustomHealthRecord(record: HealthRecord) {
  return !DEFAULT_HEALTH_RECORD_TYPES.includes(record.type);
}

function getHealthRecordGroupLabel(record: HealthRecord) {
  return record.type === "Custom" || isLegacyCustomHealthRecord(record)
    ? `${getHealthRecordTypeName(record)} • (Custom)`
    : record.type;
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

function petAge(birthDate: string) {
  if (!birthDate) return "Age not added";
  const birth = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(birth.getTime()) || birth > new Date()) return "Age not available";
  const months = (new Date().getFullYear() - birth.getFullYear()) * 12
    + new Date().getMonth() - birth.getMonth();
  if (months < 1) return "Under 1 month";
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} old`;
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  return `${years} year${years === 1 ? "" : "s"}${remainingMonths ? `, ${remainingMonths} mo` : ""} old`;
}

function notificationsAvailable() {
  return Platform.OS !== "web" && Constants.appOwnership !== AppOwnership.Expo;
}

function getNotificationsModule(): NotificationsModule | null {
  if (!notificationsAvailable()) return null;
  try {
    return require("expo-notifications") as NotificationsModule;
  } catch {
    return null;
  }
}

async function requestReminderPermission() {
  const Notifications = getNotificationsModule();
  if (!Notifications) return false;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("care-reminders", {
      name: "Pet care reminders",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }
  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
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
        { backgroundColor: destructive ? "#B84F43" : secondary ? palette.soft : palette.primary, opacity: disabled ? 0.5 : pressed ? 0.78 : 1 },
      ]}
    >
      <Text style={[styles.buttonText, { color: secondary && !destructive ? palette.primary : "#FFFFFF" }]}>{title}</Text>
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
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  palette: CarePalette;
  multiline?: boolean;
  keyboardType?: "default" | "numeric" | "decimal-pad";
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
        { backgroundColor: palette.bg, color: palette.text, borderColor: palette.line },
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
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  palette: CarePalette;
  optional?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const [draftDate, setDraftDate] = useState(value ? new Date(`${value}T00:00:00`) : new Date());
  const currentDate = value ? new Date(`${value}T00:00:00`) : new Date();

  function handleChange(event: DateTimePickerEvent, selectedDate?: Date) {
    if (Platform.OS === "android") setVisible(false);
    if (event.type === "dismissed" || !selectedDate) return;
    if (Platform.OS === "ios") setDraftDate(selectedDate);
    else onChange(localDateInput(selectedDate));
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
          style={[styles.dateFieldButton, { backgroundColor: palette.bg, borderColor: palette.line }]}
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
        <DateTimePicker value={currentDate} mode="date" display="calendar" onChange={handleChange} />
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
              <DateTimePicker value={draftDate} mode="date" display="inline" onChange={handleChange} />
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
}: {
  pets: PetProfile[];
  selectedPetId: string;
  onSelect: (petId: string) => void;
  palette: CarePalette;
}) {
  if (pets.length === 0) {
    return <Text style={[styles.helpText, { color: palette.muted }]}>Add a pet profile first to link this item to them.</Text>;
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
      {pets.map((pet) => {
        const selected = selectedPetId === pet.id;
        return (
          <Pressable
            key={pet.id}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onSelect(pet.id)}
            style={[styles.chip, { backgroundColor: selected ? palette.primary : palette.bg, borderColor: selected ? palette.primary : palette.line }]}
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
}: {
  palette: CarePalette;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<CareTab>("pets");
  const [pets, setPets] = useState<PetProfile[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [reminders, setReminders] = useState<CareReminder[]>([]);
  const [healthRecords, setHealthRecords] = useState<HealthRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedPetId, setSelectedPetId] = useState("");
  const [activePetId, setActivePetId] = useState<string | null>(null);
  const [selectedHealthRecord, setSelectedHealthRecord] = useState<HealthRecord | null>(null);
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

  const [entryType, setEntryType] = useState(JOURNAL_TYPES[0]);
  const [entryTitle, setEntryTitle] = useState("");
  const [entryNotes, setEntryNotes] = useState("");

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const [reminderTitle, setReminderTitle] = useState("");
  const [reminderDate, setReminderDate] = useState(localDateInput(tomorrow));
  const [reminderTime, setReminderTime] = useState("09:00");
  const [reminderRepeat, setReminderRepeat] = useState<ReminderRepeat>("once");

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
    healthRecordFormOpen,
    healthTypePickerOpen,
    onBack,
    petFormOpen,
    photoViewerUri,
    selectedHealthRecord,
    tab,
  ]);

  useEffect(() => {
    let active = true;
    Promise.all([
      AsyncStorage.getItem(STORAGE_KEYS.pets),
      AsyncStorage.getItem(STORAGE_KEYS.journal),
      AsyncStorage.getItem(STORAGE_KEYS.reminders),
      AsyncStorage.getItem(STORAGE_KEYS.healthRecords),
    ]).then(([savedPets, savedJournal, savedReminders, savedHealthRecords]) => {
      if (!active) return;
      try { if (savedPets) setPets(JSON.parse(savedPets) as PetProfile[]); } catch { /* Ignore invalid local records. */ }
      try { if (savedJournal) setJournal(JSON.parse(savedJournal) as JournalEntry[]); } catch { /* Ignore invalid local records. */ }
      try { if (savedReminders) setReminders(JSON.parse(savedReminders) as CareReminder[]); } catch { /* Ignore invalid local records. */ }
      try { if (savedHealthRecords) setHealthRecords(JSON.parse(savedHealthRecords) as HealthRecord[]); } catch { /* Ignore invalid local records. */ }
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
      AsyncStorage.setItem(STORAGE_KEYS.healthRecords, JSON.stringify(healthRecords)),
    ]).catch(() => setNotice("Changes are available now, but could not be saved on this device."));
  }, [healthRecords, journal, loaded, pets, reminders]);

  useEffect(() => {
    if (!pets.some((pet) => pet.id === selectedPetId)) setSelectedPetId(pets[0]?.id ?? "");
  }, [pets, selectedPetId]);

  const petById = useMemo(() => new Map(pets.map((pet) => [pet.id, pet])), [pets]);
  const sortedJournal = useMemo(() => [...journal].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [journal]);
  const sortedReminders = useMemo(() => [...reminders].sort((a, b) => a.dueAt.localeCompare(b.dueAt)), [reminders]);
  const availableHealthTypes = DEFAULT_HEALTH_RECORD_TYPES;

  async function refreshCareCenter() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const [savedPets, savedJournal, savedReminders, savedHealthRecords] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.pets),
        AsyncStorage.getItem(STORAGE_KEYS.journal),
        AsyncStorage.getItem(STORAGE_KEYS.reminders),
        AsyncStorage.getItem(STORAGE_KEYS.healthRecords),
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
      const nextHealthRecords = parseListOrCurrent(savedHealthRecords, healthRecords);
      const dataChanged = JSON.stringify(nextPets) !== JSON.stringify(pets)
        || JSON.stringify(nextJournal) !== JSON.stringify(journal)
        || JSON.stringify(nextReminders) !== JSON.stringify(reminders)
        || JSON.stringify(nextHealthRecords) !== JSON.stringify(healthRecords);

      if (dataChanged) {
        setPets(nextPets);
        setJournal(nextJournal);
        setReminders(nextReminders);
        setHealthRecords(nextHealthRecords);
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
    setProfilePhotoUri(pet.profilePhotoUri);
    setOtherPhotoUris(pet.otherPhotoUris ?? []);
    setPetFormOpen(true);
    setActivePetId(null);
    setTab("pets");
  }

  async function chooseProfilePhoto() {
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

  async function chooseOtherPhotos() {
    const remaining = 2 - otherPhotoUris.length;
    if (remaining <= 0) return;
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
      setOtherPhotoUris((current) => [...current, ...result.assets.map((asset) => asset.uri)].slice(0, 2));
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
      profilePhotoUri,
      otherPhotoUris,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
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
        if (activePetId === pet.id) setActivePetId(null);
        setNotice(`${pet.name}'s profile and linked care records were removed.`);
      } },
    ]);
  }

  function saveJournalEntry() {
    if (!selectedPetId) {
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
      type: entryType,
      title: entryTitle.trim(),
      notes: entryNotes.trim(),
      createdAt: new Date().toISOString(),
    };
    setJournal((current) => [entry, ...current]);
    setEntryTitle("");
    setEntryNotes("");
    setNotice("Journal entry saved.");
  }

  function editHealthRecord(record: HealthRecord) {
    setEditingHealthRecordId(record.id);
    const customRecord = record.type === "Custom" || isLegacyCustomHealthRecord(record);
    setHealthType(customRecord ? "Custom" : record.type);
    setCustomHealthType(customRecord ? getHealthRecordTypeName(record) : "");
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
    if (healthType === "Custom" && !customHealthType.trim()) {
      setNotice("Enter a name for this custom healthcare record type.");
      return;
    }
    const existingRecord = healthRecords.find((item) => item.id === editingHealthRecordId);
    const customTypeName = healthType === "Custom" ? customHealthType.trim().replace(/\s+/g, " ") : undefined;
    const record: HealthRecord = {
      id: existingRecord?.id ?? makeId(),
      petId,
      type: healthType,
      customType: customTypeName,
      title: healthTitle.trim() || customTypeName || healthType,
      dateGiven: healthDateGiven,
      nextDueDate: healthNextDueDate,
      clinic: healthClinic.trim(),
      notes: healthNotes.trim(),
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

  async function saveReminder() {
    if (!selectedPetId) {
      setNotice("Add and select a pet before creating a reminder.");
      return;
    }
    if (!reminderTitle.trim()) {
      setNotice("Add a name for this care reminder.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(reminderDate) || !/^\d{2}:\d{2}$/.test(reminderTime)) {
      setNotice("Use YYYY-MM-DD for the date and HH:MM for the time.");
      return;
    }
    const due = new Date(`${reminderDate}T${reminderTime}:00`);
    if (Number.isNaN(due.getTime()) || due <= new Date()) {
      setNotice("Choose a reminder date and time in the future.");
      return;
    }
    const pet = petById.get(selectedPetId);
    if (!pet) return;
    const id = makeId();
    let notificationId: string | null = null;
    try {
      notificationId = await scheduleReminder(reminderTitle.trim(), pet.name, due.toISOString());
    } catch {
      setNotice("Reminder saved in the app, but the notification could not be scheduled.");
    }
    const reminder: CareReminder = {
      id,
      petId: selectedPetId,
      title: reminderTitle.trim(),
      dueAt: due.toISOString(),
      repeat: reminderRepeat,
      notificationId,
    };
    setReminders((current) => [reminder, ...current]);
    setReminderTitle("");
    setNotice(notificationId
      ? "Reminder saved and a notification was scheduled."
      : !notificationsAvailable()
        ? "Reminder saved in-app. System notifications require a development or production build; Expo Go cannot provide them on Android."
      : Platform.OS === "web"
        ? "Reminder saved for this device; browser notifications are not enabled here."
        : "Reminder saved in the app. Enable notifications to receive an alert.");
  }

  async function completeReminder(reminder: CareReminder) {
    if (reminder.notificationId) {
      await getNotificationsModule()?.cancelScheduledNotificationAsync(reminder.notificationId).catch(() => undefined);
    }
    if (reminder.repeat === "once") {
      setReminders((current) => current.filter((item) => item.id !== reminder.id));
      setNotice("Reminder completed and removed.");
      return;
    }
    const nextDue = new Date(reminder.dueAt);
    do {
      if (reminder.repeat === "daily") nextDue.setDate(nextDue.getDate() + 1);
      else if (reminder.repeat === "weekly") nextDue.setDate(nextDue.getDate() + 7);
      else nextDue.setMonth(nextDue.getMonth() + 1);
    } while (nextDue <= new Date());
    let notificationId: string | null = null;
    try {
      notificationId = await scheduleReminder(reminder.title, petById.get(reminder.petId)?.name ?? "your pet", nextDue.toISOString());
    } catch {
      setNotice("Marked complete; the next reminder was saved but its notification could not be scheduled.");
    }
    setReminders((current) => current.map((item) => item.id === reminder.id
      ? { ...item, dueAt: nextDue.toISOString(), notificationId }
      : item));
    if (notificationId) setNotice(`Done. Next ${reminder.repeat} reminder scheduled for ${displayDate(nextDue.toISOString())}.`);
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
        <Text style={[styles.fieldLabel, { color: palette.muted }]}>PROFILE PICTURE</Text>
        <View style={styles.photoPickerRow}>
          {profilePhotoUri ? (
            <Image source={{ uri: profilePhotoUri }} contentFit="cover" style={styles.profilePhotoPreview} />
          ) : (
            <View style={[styles.profilePhotoPlaceholder, { backgroundColor: palette.soft }]}><Text style={{ fontSize: 26 }}>🐾</Text></View>
          )}
          <View style={styles.grow}>
            <CareButton title={profilePhotoUri ? "Change profile picture" : "Choose profile picture"} onPress={() => void chooseProfilePhoto()} palette={palette} secondary />
            {profilePhotoUri ? <Pressable onPress={() => setProfilePhotoUri(undefined)} style={styles.textAction}><Text style={{ color: palette.muted }}>Remove picture</Text></Pressable> : null}
          </View>
        </View>
        <Text style={[styles.fieldLabel, { color: palette.muted }]}>OTHER PHOTOS · {otherPhotoUris.length}/2</Text>
        <View style={styles.otherPhotosRow}>
          {otherPhotoUris.map((uri, index) => (
            <View key={`${uri}-${index}`} style={styles.otherPhotoWrap}>
              <Image source={{ uri }} contentFit="cover" style={styles.otherPhotoPreview} />
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove other photo ${index + 1}`} onPress={() => setOtherPhotoUris((current) => current.filter((_, photoIndex) => photoIndex !== index))} style={styles.removePhotoButton}>
                <Text style={styles.removePhotoText}>×</Text>
              </Pressable>
            </View>
          ))}
          {otherPhotoUris.length < 2 ? <CareButton title="＋ Add photo" onPress={() => void chooseOtherPhotos()} palette={palette} secondary /> : null}
        </View>
        <Text style={[styles.helpText, { color: palette.muted }]}>Choose one profile picture and up to two additional photos.</Text>
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
        {healthType === "Custom" ? <CareInput value={customHealthType} onChangeText={setCustomHealthType} placeholder="Enter custom record type *" palette={palette} /> : null}
        <CareInput value={healthTitle} onChangeText={setHealthTitle} placeholder="Name, dose, or visit reason (optional)" palette={palette} />
        <CalendarDateField value={healthDateGiven} onChange={setHealthDateGiven} placeholder="Choose date given *" palette={palette} />
        <CalendarDateField value={healthNextDueDate} onChange={setHealthNextDueDate} placeholder="Choose next due date (optional)" palette={palette} optional />
        <CareInput value={healthClinic} onChangeText={setHealthClinic} placeholder="Clinic or veterinarian (optional)" palette={palette} />
        <CareInput value={healthNotes} onChangeText={setHealthNotes} placeholder="Notes, results, or instructions (optional)" palette={palette} multiline />
        {healthNextDueDate ? (
          <Pressable accessibilityRole="switch" accessibilityState={{ checked: createReminderForDueDate }} onPress={() => setCreateReminderForDueDate((value) => !value)} style={[styles.reminderOption, { backgroundColor: palette.soft }]}>
            <View style={[styles.checkBox, { borderColor: palette.primary, backgroundColor: createReminderForDueDate ? palette.primary : "transparent" }]}>
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
    const vetVisits = records.filter((record) => record.type === "Vet visit");
    const recordTypes = [...new Set(records.map(getHealthRecordGroupLabel))];
    return (
      <>
        <Pressable onPress={() => setActivePetId(null)} style={styles.detailBackButton}>
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
              <Text style={[styles.bodyText, { color: palette.muted }]}>{petAge(pet.birthDate)}</Text>
            </View>
          </View>
          {pet.weight ? <Text style={[styles.bodyText, { color: palette.text }]}>Weight: {pet.weight}</Text> : null}
          {pet.allergies ? <Text style={[styles.bodyText, { color: palette.text }]}>Health notes / allergies: {pet.allergies}</Text> : null}
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
            {recordTypes.map((type) => {
              const typeRecords = records.filter((record) => getHealthRecordGroupLabel(record) === type);
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
          <Text style={[styles.fieldLabel, { color: palette.muted }]}>ENTRY TYPE</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {JOURNAL_TYPES.map((type) => (
              <Pressable key={type} onPress={() => setEntryType(type)} style={[styles.chip, { backgroundColor: entryType === type ? palette.primary : palette.bg, borderColor: entryType === type ? palette.primary : palette.line }]}>
                <Text style={[styles.chipText, { color: entryType === type ? "#FFFFFF" : palette.text }]}>{type}</Text>
              </Pressable>
            ))}
          </ScrollView>
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
              <View style={styles.grow}>
                <Text style={[styles.cardTitle, { color: palette.text }]}>{entry.title}</Text>
                <Text style={[styles.bodyText, { color: palette.primary }]}>{petById.get(entry.petId)?.name ?? "Pet"} · {entry.type}</Text>
              </View>
              <Text style={[styles.dateText, { color: palette.muted }]}>{new Date(entry.createdAt).toLocaleDateString()}</Text>
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
    return (
      <>
        <View style={[styles.formCard, { backgroundColor: palette.card, borderColor: palette.line }]}>
          <Text style={[styles.cardTitle, { color: palette.text }]}>Schedule a care reminder</Text>
          <Text style={[styles.fieldLabel, { color: palette.muted }]}>FOR WHICH PET?</Text>
          <PetChips pets={pets} selectedPetId={selectedPetId} onSelect={setSelectedPetId} palette={palette} />
          <CareInput value={reminderTitle} onChangeText={setReminderTitle} placeholder="Medication, grooming, checkup… *" palette={palette} />
          <View style={styles.inlineInputs}>
            <View style={styles.grow}>
              <CalendarDateField value={reminderDate} onChange={setReminderDate} placeholder="Choose reminder date" palette={palette} />
            </View>
            <View style={styles.timeInput}>
              <CareInput value={reminderTime} onChangeText={setReminderTime} placeholder="HH:MM" palette={palette} />
            </View>
          </View>
          <Text style={[styles.fieldLabel, { color: palette.muted }]}>REPEAT</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {REPEAT_OPTIONS.map((option) => (
              <Pressable key={option.id} onPress={() => setReminderRepeat(option.id)} style={[styles.chip, { backgroundColor: reminderRepeat === option.id ? palette.primary : palette.bg, borderColor: reminderRepeat === option.id ? palette.primary : palette.line }]}>
                <Text style={[styles.chipText, { color: reminderRepeat === option.id ? "#FFFFFF" : palette.text }]}>{option.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <CareButton title="Save reminder" onPress={() => void saveReminder()} palette={palette} disabled={pets.length === 0} />
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
                <View style={styles.grow}>
                  <Text style={[styles.cardTitle, { color: palette.text }]}>{reminder.title}</Text>
                  <Text style={[styles.bodyText, { color: palette.primary }]}>{petById.get(reminder.petId)?.name ?? "Pet"} · {reminder.repeat === "once" ? "One-time" : `Repeats ${reminder.repeat}`}</Text>
                </View>
                <Text style={[styles.dateText, { color: overdue ? "#C46C5C" : palette.muted }]}>{overdue ? "Overdue" : displayDate(reminder.dueAt)}</Text>
              </View>
              <Text style={[styles.helpText, { color: palette.muted }]}>{reminder.notificationId ? "Device notification scheduled" : "In-app reminder only"}</Text>
              <View style={styles.actionRow}>
                <CareButton title={reminder.repeat === "once" ? "Mark done" : "Done · schedule next"} onPress={() => void completeReminder(reminder)} palette={palette} />
                <CareButton title="Remove" onPress={() => void deleteReminder(reminder)} palette={palette} secondary />
              </View>
            </View>
          );
        })}
      </>
    );
  }

  const tabs: { id: CareTab; label: string }[] = [
    { id: "pets", label: "My pets" },
    { id: "journal", label: "Journal" },
    { id: "reminders", label: "Reminders" },
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
            <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected: tab === item.id }} onPress={() => setTab(item.id)} style={[styles.tab, tab === item.id && { backgroundColor: palette.card }]}>
              <Text style={[styles.tabText, { color: tab === item.id ? palette.primary : palette.muted }]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
        {notice ? (
          <View style={[styles.notice, { backgroundColor: palette.soft }]}>
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
      <Modal visible={photoViewerUri !== null} transparent animationType="fade" onRequestClose={() => setPhotoViewerUri(null)}>
        <View style={styles.photoViewer}>
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
  notice: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, marginBottom: 12 },
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
  button: { minHeight: 39, justifyContent: "center", alignItems: "center", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  buttonText: { fontSize: 9, fontWeight: "800" },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 2 },
  inlineInputs: { flexDirection: "row", gap: 8 },
  timeInput: { width: 100 },
  grow: { flex: 1 },
  cardHeaderRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  detailBackButton: { alignSelf: "flex-start", paddingVertical: 10, paddingHorizontal: 2 },
  petDetailHeader: { flexDirection: "row", alignItems: "center", gap: 13, marginBottom: 5 },
  petDetailAvatar: { width: 82, height: 82, borderRadius: 24 },
  petDetailAvatarPlaceholder: { alignItems: "center", justifyContent: "center" },
  petDetailName: { fontSize: 22, fontWeight: "800" },
  petOpenArrow: { fontSize: 28, fontWeight: "700", paddingHorizontal: 4 },
  petGalleryImageLarge: { width: 92, height: 92, borderRadius: 14 },
  healthHistoryHeading: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginTop: 18, marginBottom: 9 },
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
  photoPickerRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  otherPhotosRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  otherPhotoWrap: { position: "relative" },
  otherPhotoPreview: { width: 65, height: 65, borderRadius: 12 },
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
  textAction: { alignSelf: "flex-start", paddingVertical: 3 },
  sectionTitle: { fontSize: 15, fontWeight: "800", marginTop: 8 },
  disclaimer: { textAlign: "center", fontSize: 8, lineHeight: 14, marginTop: 24, paddingHorizontal: 8 },
});
