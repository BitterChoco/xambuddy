export type ReminderRepeat = "once" | "daily" | "weekly" | "monthly" | "yearly";

export function nextRecurringDueDate(dueAt: string, repeat: ReminderRepeat, now: Date): Date {
  const original = new Date(dueAt);
  if (Number.isNaN(original.getTime())) throw new Error("Invalid reminder due date");
  if (repeat === "once") return original;

  let occurrence = 1;
  let nextDue = new Date(original);
  while (nextDue <= now) {
    nextDue = new Date(original);
    if (repeat === "daily") nextDue.setDate(original.getDate() + occurrence);
    else if (repeat === "weekly") nextDue.setDate(original.getDate() + occurrence * 7);
    else if (repeat === "monthly") {
      const targetMonth = original.getMonth() + occurrence;
      const year = original.getFullYear() + Math.floor(targetMonth / 12);
      const month = targetMonth % 12;
      const finalDay = new Date(year, month + 1, 0).getDate();
      nextDue.setFullYear(year, month, Math.min(original.getDate(), finalDay));
    } else {
      const year = original.getFullYear() + occurrence;
      const finalDay = new Date(year, original.getMonth() + 1, 0).getDate();
      nextDue.setFullYear(year, original.getMonth(), Math.min(original.getDate(), finalDay));
    }
    occurrence += 1;
  }
  return nextDue;
}
