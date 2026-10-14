import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
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
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { SafeAreaView } from "react-native-safe-area-context";
import { csvCell, dateInput, filterExpenseHistory, parseDate, updateExpenseById } from "@/utils/expense-utils";
import { ActionIcon } from "@/components/action-icon";

type ExpensePalette = {
  bg: string;
  card: string;
  text: string;
  muted: string;
  line: string;
  primary: string;
  action: string;
  soft: string;
};
type ExpensePeriod = "week" | "month" | "year";
type ExpenseCategory = "General" | "Vet care" | "Food" | "Medication" | "Grooming" | "Supplies" | "Other";
export const EXPENSE_CURRENCY_OPTIONS = [
  { code: "USD", label: "$ · USD" },
  { code: "EUR", label: "€ · EUR" },
  { code: "GBP", label: "£ · GBP" },
  { code: "CAD", label: "C$ · CAD" },
  { code: "AUD", label: "A$ · AUD" },
  { code: "MYR", label: "RM · MYR" },
  { code: "PHP", label: "₱ · PHP" },
  { code: "SGD", label: "S$ · SGD" },
  { code: "INR", label: "₹ · INR" },
  { code: "JPY", label: "¥ · JPY" },
] as const;
export type ExpenseCurrencyCode = typeof EXPENSE_CURRENCY_OPTIONS[number]["code"];
type Expense = {
  id: string;
  petId: string;
  title: string;
  category: ExpenseCategory;
  amount: number;
  date: string;
  notes: string;
  createdAt: string;
};
type ExpensePet = { id: string; name: string };
type PeriodBucket = { key: string; label: string; total: number };

const EXPENSE_STORAGE_KEY = "petcare-expenses-v1";
const EXPENSE_PETS_KEY = "petcare-personal-pets-v1";
export const EXPENSE_CURRENCY_STORAGE_KEY = "petcare-expense-currency-v1";
const CATEGORIES: ExpenseCategory[] = ["General", "Vet care", "Food", "Medication", "Grooming", "Supplies"];
type ExpenseScreenData = { expenses: Expense[]; pets: ExpensePet[]; currencyCode?: ExpenseCurrencyCode };
const PERIOD_OPTIONS: { id: ExpensePeriod; label: string }[] = [
  { id: "week", label: "Weekly" },
  { id: "month", label: "Monthly" },
  { id: "year", label: "Yearly" },
];

async function loadExpenseScreenData(): Promise<ExpenseScreenData> {
  const [expenseRaw, petsRaw, currencyRaw] = await Promise.all([
    AsyncStorage.getItem(EXPENSE_STORAGE_KEY),
    AsyncStorage.getItem(EXPENSE_PETS_KEY),
    AsyncStorage.getItem(EXPENSE_CURRENCY_STORAGE_KEY),
  ]);
  const storedExpenses: unknown = expenseRaw ? JSON.parse(expenseRaw) : [];
  const storedPets: unknown = petsRaw ? JSON.parse(petsRaw) : [];
  const expenses = Array.isArray(storedExpenses)
    ? storedExpenses.filter((entry): entry is Expense => entry !== null
      && typeof entry === "object"
      && typeof entry.id === "string"
      && typeof entry.petId === "string"
      && typeof entry.title === "string"
      && (CATEGORIES.includes(entry.category) || entry.category === "Other")
      && typeof entry.amount === "number"
      && Number.isFinite(entry.amount)
      && typeof entry.date === "string"
      && typeof entry.notes === "string"
      && typeof entry.createdAt === "string")
      .map((entry) => ({
        ...entry,
        category: (entry.category === "Other" ? "General" : entry.category) as ExpenseCategory,
      }))
    : [];
  const pets = Array.isArray(storedPets)
    ? storedPets.filter((pet): pet is ExpensePet => pet !== null
      && typeof pet === "object"
      && typeof pet.id === "string"
      && typeof pet.name === "string")
    : [];
  return {
    expenses,
    pets,
    currencyCode: EXPENSE_CURRENCY_OPTIONS.some((option) => option.code === currencyRaw)
      ? currencyRaw as ExpenseCurrencyCode
      : undefined,
  };
}

function expenseId() {
  return `expense-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function currency(amount: number, currencyCode: ExpenseCurrencyCode) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: currencyCode }).format(amount);
}

function periodBounds(period: ExpensePeriod, offset: number) {
  const now = new Date();
  if (period === "week") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekdayFromMonday = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - weekdayFromMonday + offset * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start, end };
  }
  if (period === "month") {
    const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    return { start, end: new Date(start.getFullYear(), start.getMonth() + 1, 1) };
  }
  const start = new Date(now.getFullYear() + offset, 0, 1);
  return { start, end: new Date(start.getFullYear() + 1, 0, 1) };
}

function periodOffsetForDate(period: ExpensePeriod, selectedDate: Date) {
  const current = periodBounds(period, 0).start;
  if (period === "week") {
    const selected = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
    selected.setDate(selected.getDate() - (selected.getDay() + 6) % 7);
    return Math.round((selected.getTime() - current.getTime()) / (7 * 86_400_000));
  }
  if (period === "month") {
    return (selectedDate.getFullYear() - current.getFullYear()) * 12 + selectedDate.getMonth() - current.getMonth();
  }
  return selectedDate.getFullYear() - current.getFullYear();
}

function makeBuckets(period: ExpensePeriod, start: Date, expenses: Expense[]): PeriodBucket[] {
  const buckets: PeriodBucket[] = [];
  if (period === "week") {
    for (let index = 0; index < 7; index += 1) {
      const day = new Date(start);
      day.setDate(day.getDate() + index);
      buckets.push({
        key: dateInput(day),
        label: day.toLocaleDateString(undefined, { weekday: "short" }),
        total: 0,
      });
    }
  } else if (period === "month") {
    for (let index = 0; index < 5; index += 1) {
      buckets.push({ key: `week-${index}`, label: `W${index + 1}`, total: 0 });
    }
  } else {
    for (let index = 0; index < 12; index += 1) {
      const month = new Date(start.getFullYear(), index, 1);
      buckets.push({ key: `month-${index}`, label: month.toLocaleDateString(undefined, { month: "short" }), total: 0 });
    }
  }

  for (const expense of expenses) {
    const date = parseDate(expense.date);
    if (!date) continue;
    let bucketIndex = 0;
    if (period === "week") {
      bucketIndex = Math.round((date.getTime() - start.getTime()) / 86_400_000);
    } else if (period === "month") {
      bucketIndex = Math.min(Math.floor((date.getDate() - 1) / 7), 4);
    } else {
      bucketIndex = date.getMonth();
    }
    const bucket = buckets[bucketIndex];
    if (bucket) bucket.total += expense.amount;
  }
  return buckets;
}

function ExpenseDatePicker({ value, onChange, palette, error, maxDate = new Date() }: { value: string; onChange: (value: string) => void; palette: ExpensePalette; error: boolean; maxDate?: Date }) {
  const [visible, setVisible] = useState(false);
  const [draftDate, setDraftDate] = useState(() => parseDate(value) ?? new Date());
  const selectedDate = parseDate(value) ?? new Date();

  function handleValueChange(_event: unknown, date: Date) {
    if (Platform.OS === "android") setVisible(false);
    if (!date) return;
    if (Platform.OS === "ios") {
      setDraftDate(date);
      return;
    }
    onChange(dateInput(date));
  }

  if (Platform.OS === "web") {
    return React.createElement("input", {
      type: "date",
      value,
      max: dateInput(maxDate),
      "aria-label": "Expense date",
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChange(event.currentTarget.value),
      style: {
        boxSizing: "border-box",
        minHeight: 43,
        width: "100%",
        border: `1px solid ${error ? "#C64040" : palette.line}`,
        borderRadius: 10,
        padding: "9px 11px",
        fontSize: 12,
        color: palette.text,
        backgroundColor: palette.bg,
      },
    });
  }

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Expense date: ${selectedDate.toLocaleDateString()}. Choose date`}
        onPress={() => { setDraftDate(selectedDate); setVisible(true); }}
        style={[styles.datePickerButton, { backgroundColor: palette.bg, borderColor: error ? "#C64040" : palette.line }]}
      >
        <Text style={{ color: palette.text, fontSize: 11, fontWeight: "600" }}>{selectedDate.toLocaleDateString()}</Text>
        <Text style={{ color: palette.primary, fontSize: 17 }}>▦</Text>
      </Pressable>
      {visible && Platform.OS === "android" ? (
        <DateTimePicker value={selectedDate} mode="date" display="calendar" maximumDate={maxDate} onValueChange={handleValueChange} onDismiss={() => setVisible(false)} />
      ) : null}
      {Platform.OS === "ios" ? (
        <Modal visible={visible} transparent animationType="none" onRequestClose={() => setVisible(false)}>
          <View style={styles.modalScrim}>
            <View style={[styles.dateModal, { backgroundColor: palette.card }]}>
              <View style={styles.modalHeader}>
                <Pressable onPress={() => setVisible(false)}><Text style={{ color: palette.muted, fontWeight: "700" }}>Cancel</Text></Pressable>
                <Text style={{ color: palette.text, fontWeight: "800" }}>Choose date</Text>
                <Pressable onPress={() => { onChange(dateInput(draftDate)); setVisible(false); }}><Text style={{ color: palette.primary, fontWeight: "800" }}>Done</Text></Pressable>
              </View>
              <DateTimePicker value={draftDate} mode="date" display="inline" onValueChange={handleValueChange} onDismiss={() => setVisible(false)} />
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

function ExpensePeriodPicker({ period, value, onChange, palette }: { period: ExpensePeriod; value: Date; onChange: (date: Date) => void; palette: ExpensePalette }) {
  const [visible, setVisible] = useState(false);
  const [draftYear, setDraftYear] = useState(value.getFullYear());

  if (period === "week") {
    const weeks = Array.from({ length: 25 }, (_, index) => {
      const start = new Date(value);
      start.setDate(start.getDate() - index * 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      return { start, end, offset: -index };
    });
    const selectedWeek = `${value.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${new Date(value.getFullYear(), value.getMonth(), value.getDate() + 6).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
    return (
      <View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Selected week ${selectedWeek}. Choose week`}
          onPress={() => setVisible(true)}
          style={[styles.datePickerButton, { backgroundColor: palette.bg, borderColor: palette.line }]}
        >
          <Text style={{ color: palette.text, fontSize: 10, fontWeight: "600" }}>{selectedWeek}</Text>
          <Text style={{ color: palette.primary, fontSize: 17 }}>▦</Text>
        </Pressable>
        <Modal visible={visible} transparent animationType="none" onRequestClose={() => setVisible(false)}>
          <View style={styles.modalScrim}>
            <View style={[styles.dateModal, styles.weekPickerModal, { backgroundColor: palette.card }]}>
              <View style={styles.modalHeader}>
                <Text style={{ color: palette.text, fontWeight: "800" }}>Choose a week</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Close week picker" onPress={() => setVisible(false)}>
                  <Text style={{ color: palette.primary, fontSize: 20, fontWeight: "700" }}>×</Text>
                </Pressable>
              </View>
              <ScrollView style={styles.weekPickerList}>
                {weeks.map(({ start, end, offset }) => {
                  const selected = offset === 0;
                  const label = `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
                  const context = selected ? "Current week" : offset === -1 ? "Previous week" : `${Math.abs(offset)} weeks ago`;
                  return (
                    <Pressable
                      key={dateInput(start)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`${context}: ${label}`}
                      onPress={() => { onChange(start); setVisible(false); }}
                      style={[styles.weekPickerOption, { backgroundColor: selected ? palette.soft : palette.card, borderBottomColor: palette.line }]}
                    >
                      <View>
                        <Text style={{ color: selected ? palette.primary : palette.text, fontSize: 10, fontWeight: "700" }}>{label}</Text>
                        <Text style={{ color: palette.muted, fontSize: 8, marginTop: 3 }}>{context}</Text>
                      </View>
                      {selected ? <Text style={{ color: palette.primary, fontWeight: "900" }}>✓</Text> : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  const today = new Date();
  const currentYear = today.getFullYear();
  if (Platform.OS === "web") {
    return React.createElement("input", {
      type: period === "month" ? "month" : "number",
      value: period === "month" ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}` : String(value.getFullYear()),
      min: period === "year" ? 1900 : undefined,
      max: period === "month" ? `${currentYear}-${String(today.getMonth() + 1).padStart(2, "0")}` : String(currentYear),
      "aria-label": period === "month" ? "Choose month" : "Choose year",
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
        if (period === "month") {
          const [yearValue, monthValue] = event.currentTarget.value.split("-").map(Number);
          if (yearValue && monthValue && (yearValue < currentYear || (yearValue === currentYear && monthValue <= today.getMonth() + 1))) onChange(new Date(yearValue, monthValue - 1, 1));
        } else {
          const yearValue = Number(event.currentTarget.value);
          if (Number.isInteger(yearValue) && yearValue >= 1900 && yearValue <= currentYear) onChange(new Date(yearValue, 0, 1));
        }
      },
      style: {
        boxSizing: "border-box",
        minHeight: 43,
        width: "100%",
        border: `1px solid ${palette.line}`,
        borderRadius: 10,
        padding: "9px 11px",
        fontSize: 12,
        color: palette.text,
        backgroundColor: palette.bg,
      },
    });
  }

  const monthName = value.toLocaleDateString(undefined, { month: "long" });
  const months = Array.from({ length: 12 }, (_, index) => new Date(draftYear, index, 1));
  const firstYear = Math.floor(draftYear / 12) * 12;
  const years = Array.from({ length: 12 }, (_, index) => firstYear + index).filter((year) => year <= currentYear);

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={period === "month" ? `Selected month ${monthName} ${value.getFullYear()}. Choose month` : `Selected year ${value.getFullYear()}. Choose year`}
        onPress={() => { setDraftYear(value.getFullYear()); setVisible(true); }}
        style={[styles.datePickerButton, { backgroundColor: palette.bg, borderColor: palette.line }]}
      >
        <Text style={{ color: palette.text, fontSize: 11, fontWeight: "600" }}>{period === "month" ? `${monthName} ${value.getFullYear()}` : String(value.getFullYear())}</Text>
        <Text style={{ color: palette.primary, fontSize: 17 }}>{period === "month" ? "▦" : "▤"}</Text>
      </Pressable>
      <Modal visible={visible} transparent animationType="none" onRequestClose={() => setVisible(false)}>
        <View style={styles.modalScrim}>
          <View style={[styles.dateModal, { backgroundColor: palette.card }]}>
            <View style={styles.modalHeader}>
              <Pressable accessibilityRole="button" accessibilityLabel={period === "month" ? "Previous year" : "Previous 12 years"} onPress={() => setDraftYear((year) => year - (period === "month" ? 1 : 12))} style={styles.periodYearArrow}><Text style={{ color: palette.primary }}>‹</Text></Pressable>
              <Text style={{ color: palette.text, fontWeight: "800" }}>{period === "month" ? String(draftYear) : `${firstYear}–${firstYear + 11}`}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={period === "month" ? "Next year" : "Next 12 years"} disabled={period === "month" ? draftYear >= currentYear : firstYear + 12 > currentYear} onPress={() => setDraftYear((year) => Math.min(year + (period === "month" ? 1 : 12), currentYear))} style={[styles.periodYearArrow, { opacity: (period === "month" ? draftYear >= currentYear : firstYear + 12 > currentYear) ? 0.35 : 1 }]}><Text style={{ color: palette.primary }}>›</Text></Pressable>
            </View>
            <View style={styles.periodPickerGrid}>
              {period === "month" ? months.map((month) => {
                const selected = month.getMonth() === value.getMonth() && draftYear === value.getFullYear();
                const disabled = draftYear > currentYear || (draftYear === currentYear && month.getMonth() > today.getMonth());
                return (
                  <Pressable key={month.getMonth()} accessibilityRole="button" accessibilityState={{ selected, disabled }} disabled={disabled} onPress={() => { onChange(month); setVisible(false); }} style={[styles.periodPickerOption, { backgroundColor: selected ? palette.action : palette.soft, opacity: disabled ? 0.35 : 1 }]}>
                    <Text style={{ color: selected ? "#FFFFFF" : palette.text, fontSize: 9, fontWeight: "700" }}>{month.toLocaleDateString(undefined, { month: "short" })}</Text>
                  </Pressable>
                );
              }) : years.map((year) => {
                const selected = year === value.getFullYear();
                return (
                  <Pressable key={year} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => { onChange(new Date(year, 0, 1)); setVisible(false); }} style={[styles.periodPickerOption, { backgroundColor: selected ? palette.action : palette.soft }]}>
                    <Text style={{ color: selected ? "#FFFFFF" : palette.text, fontSize: 9, fontWeight: "700" }}>{year}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable onPress={() => setVisible(false)} style={styles.periodPickerCancel}><Text style={{ color: palette.muted, fontWeight: "700" }}>Cancel</Text></Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ExpenseButton({
  title,
  onPress,
  palette,
  secondary = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  palette: ExpensePalette;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, { backgroundColor: secondary ? palette.soft : palette.action, opacity: disabled ? 0.5 : pressed ? 0.76 : 1 }]}
    >
      <Text style={[styles.buttonText, { color: secondary ? palette.primary : "#FFFFFF" }]}>{title}</Text>
    </Pressable>
  );
}

export function ExpensesScreen({ palette, onBack }: { palette: ExpensePalette; onBack: () => void }) {
  const { width } = useWindowDimensions();
  const compact = width < 560;
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [pets, setPets] = useState<ExpensePet[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<ExpensePeriod>("month");
  const [periodOffset, setPeriodOffset] = useState(0);
  const [historyCategory, setHistoryCategory] = useState<ExpenseCategory | "All">("All");
  const [historyPetId, setHistoryPetId] = useState("");
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [expenseFormOpen, setExpenseFormOpen] = useState(false);
  const [petId, setPetId] = useState("");
  const [currencyCode, setCurrencyCode] = useState<ExpenseCurrencyCode>("USD");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("General");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => dateInput(new Date()));
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [leaveEditConfirmationVisible, setLeaveEditConfirmationVisible] = useState(false);
  const expenseScrollRef = React.useRef<ScrollView>(null);

  useEffect(() => {
    let active = true;
    loadExpenseScreenData()
      .then((data) => {
        if (!active) return;
        setExpenses(data.expenses);
        setPets(data.pets);
        if (data.currencyCode) setCurrencyCode(data.currencyCode);
      })
      .catch(() => {
        if (active) setNotice("Saved expense data could not be loaded from this device.");
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => { active = false; };
  }, []);

  async function refreshExpenseData() {
    if (refreshing || expenseFormOpen) return;
    setNotice("");
    setRefreshing(true);
    try {
      const data = await loadExpenseScreenData();
      setExpenses(data.expenses);
      setPets(data.pets);
      if (data.currencyCode) setCurrencyCode(data.currencyCode);
    } catch {
      // Keep the current view unchanged when local refresh fails.
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(EXPENSE_STORAGE_KEY, JSON.stringify(expenses))
      .catch(() => setNotice("Expense changes are available now but could not be saved on this device."));
  }, [expenses, loaded]);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(EXPENSE_CURRENCY_STORAGE_KEY, currencyCode)
      .catch(() => setNotice("Currency selection could not be saved on this device."));
  }, [currencyCode, loaded]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      requestExpenseScreenBack();
      return true;
    });
    return () => subscription.remove();
  }, [amount, category, date, editingExpenseId, expenses, notes, onBack, petId, title]);

  const bounds = useMemo(() => periodBounds(period, periodOffset), [period, periodOffset]);
  const periodExpenses = useMemo(() => expenses
    .filter((expense) => {
      const expenseDate = parseDate(expense.date);
      return expenseDate !== null && expenseDate >= bounds.start && expenseDate < bounds.end;
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)), [bounds.end, bounds.start, expenses]);
  const historyExpenses = useMemo(() => filterExpenseHistory(periodExpenses, bounds.start, bounds.end, historyCategory, historyPetId), [bounds.end, bounds.start, historyCategory, historyPetId, periodExpenses]);
  const buckets = useMemo(() => makeBuckets(period, bounds.start, periodExpenses), [bounds.start, period, periodExpenses]);
  const total = periodExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const maxBucket = Math.max(...buckets.map((bucket) => bucket.total), 0);
  const categoryTotals = CATEGORIES.map((item) => ({
    category: item,
    total: periodExpenses.filter((expense) => expense.category === item).reduce((sum, expense) => sum + expense.amount, 0),
  })).filter((item) => item.total > 0).sort((a, b) => b.total - a.total);
  const canMoveForward = periodOffset < 0;
  function periodTitle() {
    if (periodOffset === 0) return period === "week" ? "This week" : period === "month" ? "This month" : "This year";
    if (period === "week") {
      const lastDay = new Date(bounds.end);
      lastDay.setDate(lastDay.getDate() - 1);
      return `${bounds.start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${lastDay.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
    }
    if (period === "month") return bounds.start.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    return String(bounds.start.getFullYear());
  }

  function resetExpenseForm() {
    setEditingExpenseId(null);
    setPetId("");
    setTitle("");
    setCategory("General");
    setAmount("");
    setDate(dateInput(new Date()));
    setNotes("");
    setFormError("");
    setExpenseFormOpen(false);
  }

  function beginAddExpense() {
    resetExpenseForm();
    setExpenseFormOpen(true);
  }

  function hasUnsavedExpenseChanges() {
    const original = expenses.find((expense) => expense.id === editingExpenseId);
    if (!original) {
      return Boolean(title.trim() || amount.trim() || notes.trim() || petId || category !== "General");
    }
    const parsedAmount = Number(amount.trim().replace(/,/g, ""));
    return title.trim() !== original.title
      || petId !== original.petId
      || category !== original.category
      || !Number.isFinite(parsedAmount)
      || parsedAmount !== original.amount
      || date !== original.date
      || notes.trim() !== original.notes;
  }

  function requestExpenseScreenBack() {
    if (!expenseFormOpen) {
      onBack();
      return;
    }
    if (hasUnsavedExpenseChanges()) {
      setLeaveEditConfirmationVisible(true);
      return;
    }
    resetExpenseForm();
  }

  function discardEditAndLeave() {
    setLeaveEditConfirmationVisible(false);
    resetExpenseForm();
  }

  function beginEditExpense(expense: Expense) {
    setEditingExpenseId(expense.id);
    setPetId(expense.petId);
    setTitle(expense.title);
    setCategory(expense.category);
    setAmount(String(expense.amount));
    setDate(expense.date);
    setNotes(expense.notes);
    setFormError("");
    setExpenseFormOpen(true);
    setTimeout(() => expenseScrollRef.current?.scrollTo({ y: 0, animated: true }), 0);
  }

  async function saveExpense() {
    const parsedAmount = Number(amount.trim().replace(/,/g, ""));
    const expenseDate = parseDate(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (!title.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0 || !expenseDate || expenseDate > today) {
      setFormError("Enter a description, a valid amount greater than zero, and a date no later than today.");
      return;
    }
    const existingExpense = expenses.find((item) => item.id === editingExpenseId);
    const expense: Expense = {
      id: existingExpense?.id ?? expenseId(),
      petId,
      title: title.trim(),
      category,
      amount: parsedAmount,
      date,
      notes: notes.trim(),
      createdAt: existingExpense?.createdAt ?? new Date().toISOString(),
    };
    setExpenses((current) => existingExpense
      ? updateExpenseById(current, expense)
      : [expense, ...current]);
    resetExpenseForm();
    setNotice(existingExpense ? "Expense updated on this device." : "Expense saved on this device.");
  }

  async function removeExpense(expense: Expense) {
    Alert.alert("Remove expense?", `Remove “${expense.title}” from your expense history?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => {
        setExpenses((current) => current.filter((item) => item.id !== expense.id));
        if (editingExpenseId === expense.id) resetExpenseForm();
      } },
    ]);
  }

  function createExpenseCsv() {
    const header = ["Expense Date", "Pet", "Category", "Description", "Amount", "Currency label", "Notes"];
    const dataRows = [...historyExpenses]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((expense) => [
          expense.date,
          pets.find((pet) => pet.id === expense.petId)?.name ?? "General",
          expense.category,
          expense.title,
          expense.amount.toFixed(2),
          currencyCode,
          expense.notes,
        ]);
    return `${header.join(",")}\r\n${dataRows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  }

  async function ensureExpensesExist() {
    if (historyExpenses.length === 0) {
      setNotice("There are no expenses in the selected period and filters to export.");
      return false;
    }
    return true;
  }

  function downloadExpenseCsvOnWeb(csv: string) {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `pet-expenses-${dateInput(new Date())}.csv`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function saveExpenseCsvOffline() {
    if (!(await ensureExpensesExist())) return;
    const csv = createExpenseCsv();
    const fileName = `pet-expenses-${dateInput(new Date())}.csv`;
    try {
      if (Platform.OS === "web" && typeof document !== "undefined") {
        downloadExpenseCsvOnWeb(csv);
        setNotice("CSV downloaded to your device.");
      } else if (Platform.OS === "android") {
        const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!permission.granted) {
          setNotice("Choose a folder to save the CSV offline.");
          return;
        }
        const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(permission.directoryUri, fileName.replace(/\.csv$/i, ""), "text/csv");
        await FileSystem.StorageAccessFramework.writeAsStringAsync(fileUri, csv, { encoding: FileSystem.EncodingType.UTF8 });
        setNotice("CSV saved offline in the selected folder.");
      } else {
        if (!FileSystem.documentDirectory) {
          setNotice("Offline file storage is not available on this device.");
          return;
        }
        const fileUri = `${FileSystem.documentDirectory}${fileName}`;
        await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: FileSystem.EncodingType.UTF8 });
        setNotice("CSV saved offline in PetCareCompanion app storage.");
      }
    } catch {
      setNotice("Could not save the CSV offline. Please try again.");
    }
  }

  async function shareExpenseCsv() {
    if (!(await ensureExpensesExist())) return;
    const csv = createExpenseCsv();
    try {
      if (Platform.OS === "web" && typeof document !== "undefined") {
        downloadExpenseCsvOnWeb(csv);
        setNotice("CSV downloaded to your device.");
      } else {
        if (!FileSystem.cacheDirectory || !(await Sharing.isAvailableAsync())) {
          setNotice("File sharing is not available on this device.");
          return;
        }
        const fileUri = `${FileSystem.cacheDirectory}pet-expenses-${dateInput(new Date())}.csv`;
        await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: FileSystem.EncodingType.UTF8 });
        await Sharing.shareAsync(fileUri, { mimeType: "text/csv", dialogTitle: "Export pet expenses" });
        setNotice("CSV file ready to share.");
      }
    } catch {
      setNotice("Could not export expense data. Try again.");
    }
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.bg }]}>
      <ScrollView
        ref={expenseScrollRef}
        contentContainerStyle={[styles.content, compact && styles.compactContent]}
        keyboardShouldPersistTaps="handled"
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refreshExpenseData()}
            tintColor={palette.primary}
            colors={[palette.primary]}
            progressBackgroundColor={palette.card}
          />
        )}
      >
        <View style={[styles.header, { borderBottomColor: palette.line }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to home" onPress={requestExpenseScreenBack} style={[styles.backButton, { backgroundColor: palette.soft }]}>
            <Text style={[styles.backGlyph, { color: palette.primary }]}>‹</Text>
          </Pressable>
          <View style={styles.grow}>
            <Text style={[styles.eyebrow, { color: palette.primary }]}>YOUR PET BUDGET</Text>
            <Text style={[styles.headerTitle, { color: palette.text }]}>Expenses</Text>
          </View>
          <View style={styles.headerExportActions}>
            <Pressable accessibilityRole="button" accessibilityLabel="Save the displayed expense results as CSV" onPress={() => void saveExpenseCsvOffline()} style={[styles.exportButton, { backgroundColor: palette.soft }]}>
              <Text style={[styles.exportButtonText, { color: palette.primary }]}>Save filtered CSV</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Share the displayed expense results as CSV" onPress={() => void shareExpenseCsv()} style={[styles.exportButton, { backgroundColor: palette.action }]}>
              <Text style={[styles.exportButtonText, { color: "#FFFFFF" }]}>Share filtered CSV</Text>
            </Pressable>
          </View>
        </View>

        {notice ? (
          <View style={[styles.notice, { backgroundColor: palette.soft, borderColor: palette.primary }]}>
            <Text style={[styles.noticeText, { color: palette.primary }]}>{notice}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Dismiss message" onPress={() => setNotice("")}><Text style={{ color: palette.primary }}>×</Text></Pressable>
          </View>
        ) : null}

        <View style={styles.addExpenseAction}>
          <ExpenseButton title="＋  Add expense" onPress={beginAddExpense} palette={palette} />
        </View>

        <View style={styles.sectionHeading}>
          <View>
            <Text style={[styles.eyebrow, { color: palette.primary }]}>SPENDING OVERVIEW</Text>
            <Text style={[styles.sectionTitle, { color: palette.text }]}>Your expenses</Text>
          </View>
          <Text style={[styles.resultCount, { color: palette.muted }]}>{periodExpenses.length} items</Text>
        </View>
        <View style={[styles.periodBar, { backgroundColor: palette.soft }]}>
          {PERIOD_OPTIONS.map((option) => (
            <Pressable key={option.id} accessibilityRole="tab" accessibilityState={{ selected: period === option.id }} onPress={() => { setPeriod(option.id); setPeriodOffset(0); }} style={[styles.periodButton, period === option.id && { backgroundColor: palette.card }]}>
              <Text style={[styles.periodText, { color: period === option.id ? palette.primary : palette.muted }]}>{option.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={[styles.summaryCard, { backgroundColor: palette.card, borderColor: palette.line }]}>
          <View style={styles.summaryHeader}>
            <View>
              <Text style={[styles.summaryCaption, { color: palette.muted }]}>{periodTitle()}</Text>
              <Text style={[styles.totalText, { color: palette.text }]}>{currency(total, currencyCode)}</Text>
            </View>
            <View style={styles.periodNavigation}>
              <Pressable accessibilityRole="button" accessibilityLabel="Previous period" onPress={() => setPeriodOffset((value) => value - 1)} style={[styles.periodArrow, { backgroundColor: palette.soft }]}><Text style={{ color: palette.primary }}>‹</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Next period" disabled={!canMoveForward} onPress={() => setPeriodOffset((value) => value + 1)} style={[styles.periodArrow, { backgroundColor: palette.soft, opacity: canMoveForward ? 1 : 0.4 }]}><Text style={{ color: palette.primary }}>›</Text></Pressable>
            </View>
          </View>
          <View style={styles.jumpToDateRow}>
            <Text style={[styles.chartFootnote, { color: palette.muted }]}>Jump to date</Text>
            <View style={styles.jumpToDatePicker}>
              <ExpensePeriodPicker
                period={period}
                value={bounds.start}
                onChange={(selectedDate) => setPeriodOffset(periodOffsetForDate(period, selectedDate))}
                palette={palette}
              />
            </View>
          </View>
          <View style={styles.chart}>
            {buckets.map((bucket) => {
              const barHeight = maxBucket > 0 ? Math.max((bucket.total / maxBucket) * 112, bucket.total > 0 ? 6 : 3) : 3;
              return (
                <View key={bucket.key} style={styles.chartColumn}>
                  <View style={styles.chartBarArea}>
                    {bucket.total > 0 ? <Text numberOfLines={1} style={[styles.barValue, { color: palette.muted }]}>{bucket.total >= 1000 ? `${(bucket.total / 1000).toFixed(1)}k` : bucket.total.toFixed(0)}</Text> : null}
                    <View style={[styles.chartBar, { height: barHeight, backgroundColor: palette.primary, opacity: bucket.total > 0 ? 1 : 0.2 }]} />
                  </View>
                  <Text style={[styles.chartLabel, { color: palette.muted }]}>{bucket.label}</Text>
                </View>
              );
            })}
          </View>
          <Text style={[styles.chartFootnote, { color: palette.muted }]}>Spending by {period === "week" ? "day" : period === "month" ? "week" : "month"} · {currencyCode} display</Text>
        </View>

        {categoryTotals.length > 0 ? (
          <View style={[styles.categoryCard, { backgroundColor: palette.card, borderColor: palette.line }]}>
            <Text style={[styles.cardTitle, { color: palette.text }]}>By category</Text>
            {categoryTotals.map((item) => {
              const share = total > 0 ? item.total / total : 0;
              return (
                <View key={item.category} style={styles.categorySummaryRow}>
                  <View style={styles.categorySummaryLabels}>
                    <Text style={[styles.categoryName, { color: palette.text }]}>{item.category}</Text>
                    <Text style={[styles.categoryAmount, { color: palette.muted }]}>{currency(item.total, currencyCode)}</Text>
                  </View>
                  <View style={[styles.progressTrack, { backgroundColor: palette.soft }]}>
                    <View style={[styles.progressFill, { width: `${Math.round(share * 100)}%`, backgroundColor: palette.primary }]} />
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}

        <View style={styles.sectionHeading}>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>Expense history</Text>
          <Text style={[styles.resultCount, { color: palette.muted }]}>{historyExpenses.length} items</Text>
        </View>
        <Text style={[styles.fieldLabel, { color: palette.muted }]}>FILTER BY CATEGORY</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {["All", ...CATEGORIES].map((item) => {
            const selected = historyCategory === item;
            return (
                  <Pressable key={item} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={`${item === "All" ? "All categories" : item} expenses`} onPress={() => setHistoryCategory(item as ExpenseCategory | "All")} style={[styles.chip, { backgroundColor: selected ? palette.action : palette.bg, borderColor: selected ? palette.action : palette.line }]}>
                <Text style={[styles.chipText, { color: selected ? "#FFFFFF" : palette.text }]}>{item}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Text style={[styles.fieldLabel, { color: palette.muted }]}>FILTER BY PET</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {[{ id: "", name: "All pets" }, ...pets].map((pet) => {
            const selected = historyPetId === pet.id;
            return (
              <Pressable key={pet.id || "all-pets"} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={`${pet.name} expense history`} onPress={() => setHistoryPetId(pet.id)} style={[styles.chip, { backgroundColor: selected ? palette.action : palette.bg, borderColor: selected ? palette.action : palette.line }]}>
                <Text style={[styles.chipText, { color: selected ? "#FFFFFF" : palette.text }]}>{pet.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {!loaded ? <Text style={[styles.emptyText, { color: palette.muted }]}>Loading saved expenses…</Text> : historyExpenses.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: palette.card, borderColor: palette.line }]}>
            <Text style={[styles.emptyTitle, { color: palette.text }]}>Nothing recorded for {periodTitle().toLocaleLowerCase()}</Text>
            <Text style={[styles.emptyText, { color: palette.muted }]}>Add an expense above to start tracking pet-care costs.</Text>
          </View>
        ) : historyExpenses.map((expense) => (
          <View key={expense.id} style={[styles.expenseRow, { backgroundColor: palette.card, borderColor: palette.line }]}>
            <View style={styles.expenseCopy}>
              <Text style={[styles.expenseTitle, { color: palette.text }]}>{expense.title}</Text>
              <Text style={[styles.expenseMeta, { color: palette.muted }]}>{pets.find((pet) => pet.id === expense.petId)?.name ?? "General"} · {expense.category} · {new Date(`${expense.date}T00:00:00`).toLocaleDateString()}</Text>
              {expense.notes ? <Text style={[styles.expenseNotes, { color: palette.muted }]}>{expense.notes}</Text> : null}
            </View>
            <View style={styles.expenseAmountWrap}>
              <Text style={[styles.expenseAmount, { color: palette.primary }]}>{currency(expense.amount, currencyCode)}</Text>
              <View style={styles.expenseActions}>
                <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${expense.title}`} onPress={() => beginEditExpense(expense)} style={[styles.iconActionButton, { backgroundColor: palette.soft }]}><ActionIcon name="edit" color={palette.primary} cutout={palette.soft} size={18} /></Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${expense.title}`} onPress={() => void removeExpense(expense)} style={[styles.iconActionButton, { backgroundColor: palette.soft }]}><ActionIcon name="remove" color={palette.primary} cutout={palette.soft} size={18} /></Pressable>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>
      <Modal
        visible={expenseFormOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={requestExpenseScreenBack}
      >
        <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.bg }]}>
          <ScrollView contentContainerStyle={[styles.content, compact && styles.compactContent]} keyboardShouldPersistTaps="handled">
            <View style={[styles.header, { borderBottomColor: palette.line }]}>
              <Pressable accessibilityRole="button" accessibilityLabel="Back to expense history" onPress={requestExpenseScreenBack} style={[styles.backButton, { backgroundColor: palette.soft }]}>
                <Text style={[styles.backGlyph, { color: palette.primary }]}>‹</Text>
              </Pressable>
              <View style={styles.grow}>
                <Text style={[styles.eyebrow, { color: palette.primary }]}>YOUR PET BUDGET</Text>
                <Text style={[styles.headerTitle, { color: palette.text }]}>{editingExpenseId ? "Edit expense" : "Add an expense"}</Text>
              </View>
            </View>
            <View style={[styles.formCard, { backgroundColor: palette.card, borderColor: palette.line }]}>
              <View style={styles.inputRow}>
                <TextInput value={title} onChangeText={setTitle} placeholder="Description (e.g. annual checkup)" placeholderTextColor={palette.muted} style={[styles.input, styles.descriptionInput, { backgroundColor: palette.bg, color: palette.text, borderColor: formError && !title.trim() ? "#C64040" : palette.line }]} />
                <TextInput value={amount} onChangeText={setAmount} placeholder={`Amount (${currencyCode})`} placeholderTextColor={palette.muted} keyboardType="decimal-pad" style={[styles.input, styles.amountInput, { backgroundColor: palette.bg, color: palette.text, borderColor: formError && (!Number.isFinite(Number(amount)) || Number(amount) <= 0) ? "#C64040" : palette.line }]} />
              </View>
              <Text style={[styles.fieldLabel, { color: palette.muted }]}>PET · OPTIONAL</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {[{ id: "", name: "General" }, ...pets].map((pet) => (
                  <Pressable key={pet.id || "general"} accessibilityRole="radio" accessibilityState={{ selected: petId === pet.id }} onPress={() => setPetId(pet.id)} style={[styles.chip, { backgroundColor: petId === pet.id ? palette.action : palette.bg, borderColor: petId === pet.id ? palette.action : palette.line }]}>
                    <Text style={[styles.chipText, { color: petId === pet.id ? "#FFFFFF" : palette.text }]}>{pet.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Text style={[styles.fieldLabel, { color: palette.muted }]}>CATEGORY</Text>
              <View style={styles.categoryRow}>
                {CATEGORIES.map((item) => (
                  <Pressable key={item} accessibilityRole="radio" accessibilityState={{ selected: category === item }} onPress={() => setCategory(item)} style={[styles.chip, { backgroundColor: category === item ? palette.action : palette.bg, borderColor: category === item ? palette.action : palette.line }]}>
                    <Text style={[styles.chipText, { color: category === item ? "#FFFFFF" : palette.text }]}>{item}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={[styles.fieldLabel, { color: palette.muted }]}>DATE</Text>
              <ExpenseDatePicker value={date} onChange={setDate} palette={palette} error={Boolean(formError && (!parseDate(date) || (parseDate(date)?.getTime() ?? 0) > new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime()))} />
              <TextInput value={notes} onChangeText={setNotes} placeholder="Notes (optional)" placeholderTextColor={palette.muted} multiline style={[styles.input, styles.notesInput, { backgroundColor: palette.bg, color: palette.text, borderColor: palette.line }]} />
              {formError ? <Text style={styles.errorText}>{formError}</Text> : null}
              <View style={styles.formActions}>
                <ExpenseButton title={editingExpenseId ? "Update expense" : "Save expense"} onPress={() => void saveExpense()} palette={palette} />
                <ExpenseButton title="Cancel" onPress={requestExpenseScreenBack} palette={palette} secondary />
              </View>
            </View>
            <Text style={[styles.currencyInfo, { color: palette.muted }]}>Currency can be changed in Settings. Changing currency does not convert expense amounts.</Text>
          </ScrollView>
        </SafeAreaView>
      </Modal>
      <Modal
        visible={leaveEditConfirmationVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLeaveEditConfirmationVisible(false)}
      >
        <View style={styles.modalScrim}>
          <View style={[styles.confirmationCard, { backgroundColor: palette.card, borderColor: palette.line }]}>
            <Text style={[styles.cardTitle, { color: palette.text }]}>Discard unsaved changes?</Text>
            <Text style={[styles.emptyText, { color: palette.muted }]}>Your edits to this expense have not been saved.</Text>
            <View style={styles.formActions}>
              <ExpenseButton title="Keep editing" onPress={() => setLeaveEditConfirmationVisible(false)} palette={palette} secondary />
              <ExpenseButton title="Discard and leave" onPress={discardEditAndLeave} palette={palette} />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { width: "100%", maxWidth: 900, alignSelf: "center", paddingHorizontal: 24, paddingBottom: 42 },
  compactContent: { paddingHorizontal: 16 },
  header: { minHeight: 82, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", gap: 13 },
  headerExportActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  backButton: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  backGlyph: { fontSize: 26, lineHeight: 30 },
  grow: { flex: 1 },
  eyebrow: { fontSize: 8, fontWeight: "800", letterSpacing: 1.5, marginBottom: 4 },
  headerTitle: { fontSize: 23, fontWeight: "700" },
  exportButton: { borderRadius: 11, paddingHorizontal: 10, paddingVertical: 9 },
  exportButtonText: { fontSize: 8, fontWeight: "800" },
  notice: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, marginTop: 12 },
  noticeText: { flex: 1, fontSize: 9, fontWeight: "700" },
  formCard: { borderWidth: 1, borderRadius: 15, padding: 14, gap: 10, marginTop: 16 },
  currencyInfo: { fontSize: 8, lineHeight: 13, marginTop: 8, paddingHorizontal: 2 },
  cardTitle: { fontSize: 13, fontWeight: "800" },
  inputRow: { flexDirection: "row", gap: 8 },
  input: { minHeight: 43, borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9, fontSize: 11 },
  descriptionInput: { flex: 1 },
  amountInput: { width: 124 },
  notesInput: { minHeight: 60, textAlignVertical: "top" },
  fieldLabel: { fontSize: 8, fontWeight: "800", letterSpacing: 1, marginTop: 2 },
  chipRow: { flexDirection: "row", gap: 7, paddingVertical: 2 },
  categoryRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 8 },
  chipText: { fontSize: 8, fontWeight: "700" },
  errorText: { color: "#C64040", fontSize: 9, fontWeight: "700" },
  formActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  datePickerButton: { minHeight: 43, borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalScrim: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#00000066", padding: 18 },
  confirmationCard: { width: "100%", maxWidth: 420, borderWidth: 1, borderRadius: 18, padding: 18, gap: 12 },
  dateModal: { width: "100%", maxWidth: 400, borderRadius: 18, padding: 14 },
  weekPickerModal: { maxHeight: "78%" },
  weekPickerList: { maxHeight: 460, marginTop: 5 },
  weekPickerOption: { minHeight: 51, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, paddingHorizontal: 7 },
  modalHeader: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  periodYearArrow: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "#EEF1EA" },
  periodPickerGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center", paddingVertical: 13 },
  periodPickerOption: { width: "22%", minHeight: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  periodPickerCancel: { alignSelf: "flex-end", paddingHorizontal: 8, paddingVertical: 7 },
  button: { minHeight: 40, borderRadius: 10, paddingHorizontal: 15, alignItems: "center", justifyContent: "center" },
  addExpenseAction: { marginTop: 8 },
  buttonText: { fontSize: 9, fontWeight: "800" },
  sectionHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: 10, marginTop: 24, marginBottom: 10 },
  sectionTitle: { fontSize: 17, fontWeight: "800" },
  resultCount: { fontSize: 8, fontWeight: "700" },
  periodBar: { flexDirection: "row", borderRadius: 12, padding: 4, gap: 3 },
  periodButton: { flex: 1, minHeight: 36, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  periodText: { fontSize: 9, fontWeight: "800" },
  summaryCard: { borderWidth: 1, borderRadius: 15, padding: 14, marginTop: 11 },
  summaryHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  summaryCaption: { fontSize: 9, fontWeight: "700" },
  totalText: { fontSize: 25, fontWeight: "800", marginTop: 3 },
  periodNavigation: { flexDirection: "row", gap: 7 },
  periodArrow: { width: 33, height: 33, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  jumpToDateRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 10 },
  jumpToDatePicker: { width: 154 },
  chart: { height: 154, flexDirection: "row", alignItems: "stretch", gap: 5, marginTop: 15 },
  chartColumn: { flex: 1, alignItems: "center" },
  chartBarArea: { flex: 1, width: "100%", alignItems: "center", justifyContent: "flex-end", gap: 4 },
  chartBar: { width: "58%", maxWidth: 32, minHeight: 3, borderTopLeftRadius: 6, borderTopRightRadius: 6 },
  barValue: { fontSize: 6, fontWeight: "700" },
  chartLabel: { fontSize: 7, fontWeight: "700", marginTop: 5 },
  chartFootnote: { textAlign: "right", fontSize: 7, marginTop: 7 },
  categoryCard: { borderWidth: 1, borderRadius: 15, padding: 14, gap: 12, marginTop: 10 },
  categorySummaryRow: { gap: 6 },
  categorySummaryLabels: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  categoryName: { fontSize: 9, fontWeight: "700" },
  categoryAmount: { fontSize: 8, fontWeight: "700" },
  progressTrack: { height: 6, borderRadius: 4, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 4 },
  emptyCard: { borderWidth: 1, borderRadius: 15, padding: 16, gap: 6, marginTop: 14 },
  emptyTitle: { fontSize: 12, fontWeight: "800" },
  emptyText: { fontSize: 9, lineHeight: 14 },
  expenseRow: { borderWidth: 1, borderRadius: 13, padding: 12, marginTop: 8, flexDirection: "row", alignItems: "flex-start", gap: 10 },
  expenseCopy: { flex: 1, gap: 4 },
  expenseTitle: { fontSize: 10, fontWeight: "800" },
  expenseMeta: { fontSize: 8, lineHeight: 12 },
  expenseNotes: { fontSize: 8, lineHeight: 12 },
  expenseAmountWrap: { alignItems: "flex-end", gap: 7 },
  expenseActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  expenseAmount: { fontSize: 10, fontWeight: "800" },
  iconActionButton: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 10 },
});
