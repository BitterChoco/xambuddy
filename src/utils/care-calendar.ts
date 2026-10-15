export type CalendarReminderRepeat = "once" | "daily" | "weekly" | "monthly" | "yearly";
export const REMINDER_REPEAT_COLORS: Record<CalendarReminderRepeat, string> = {
  once: "#F59E0B",
  daily: "#8B5CF6",
  weekly: "#10B981",
  monthly: "#3B82F6",
  yearly: "#EC4899",
};

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateOnlyUtc(date: Date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

export function reminderDatesInMonth(dueAt: string, repeat: CalendarReminderRepeat, year: number, month: number): string[] {
  const anchor = new Date(dueAt);
  if (Number.isNaN(anchor.getTime())) return [];

  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 1);
  const anchorDate = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  if (anchorDate >= monthEnd) return [];

  if (repeat === "once") return anchorDate >= monthStart ? [dateKey(anchorDate)] : [];

  if (repeat === "daily" || repeat === "weekly") {
    const interval = repeat === "daily" ? 1 : 7;
    const elapsedDays = Math.floor((dateOnlyUtc(monthStart) - dateOnlyUtc(anchorDate)) / 86_400_000);
    const skippedIntervals = Math.max(0, Math.ceil(elapsedDays / interval));
    const occurrence = new Date(anchorDate);
    occurrence.setDate(occurrence.getDate() + skippedIntervals * interval);
    const dates: string[] = [];
    while (occurrence < monthEnd) {
      dates.push(dateKey(occurrence));
      occurrence.setDate(occurrence.getDate() + interval);
    }
    return dates;
  }

  const anchorMonthIndex = anchor.getFullYear() * 12 + anchor.getMonth();
  const targetMonthIndex = year * 12 + month;
  const intervalMonths = repeat === "monthly" ? 1 : 12;
  const elapsedMonths = targetMonthIndex - anchorMonthIndex;
  const skippedIntervals = Math.max(0, Math.ceil(elapsedMonths / intervalMonths));
  const firstOccurrenceMonth = anchorMonthIndex + skippedIntervals * intervalMonths;
  if (firstOccurrenceMonth > targetMonthIndex) return [];

  const occurrenceMonth = firstOccurrenceMonth % 12;
  const occurrenceYear = Math.floor(firstOccurrenceMonth / 12);
  const occurrenceDay = Math.min(anchor.getDate(), daysInMonth(occurrenceYear, occurrenceMonth));
  return [dateKey(new Date(occurrenceYear, occurrenceMonth, occurrenceDay))];
}

export function birthdayDateInMonth(birthDate: string, year: number, month: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null;
  const [birthYear, birthMonth, birthDay] = birthDate.split("-").map(Number);
  const source = new Date(birthYear, birthMonth - 1, birthDay);
  if (source.getFullYear() !== birthYear || source.getMonth() !== birthMonth - 1 || source.getDate() !== birthDay) return null;
  if (source.getMonth() !== month) return null;
  const day = Math.min(source.getDate(), new Date(year, month + 1, 0).getDate());
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function calendarMonthDates(year: number, month: number): (string | null)[] {
  const firstWeekday = new Date(year, month, 1).getDay();
  const dayCount = new Date(year, month + 1, 0).getDate();
  const cellCount = Math.ceil((firstWeekday + dayCount) / 7) * 7;
  return Array.from({ length: cellCount }, (_, index) => {
    const day = index - firstWeekday + 1;
    if (day < 1 || day > dayCount) return null;
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  });
}
