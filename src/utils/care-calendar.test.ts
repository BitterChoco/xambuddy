import { describe, expect, it } from "vitest";
import { birthdayDateInMonth, calendarMonthDates, reminderDatesInMonth } from "./care-calendar";

describe("care calendar utilities", () => {
  it("clamps leap-day birthdays to the last day of February in non-leap years", () => {
    expect(birthdayDateInMonth("2024-02-29", 2025, 1)).toBe("2025-02-28");
    expect(birthdayDateInMonth("2024-02-29", 2028, 1)).toBe("2028-02-29");
  });

  it("returns a complete Sunday-first month grid with empty leading cells", () => {
    const dates = calendarMonthDates(2025, 0);
    expect(dates).toHaveLength(35);
    expect(dates.slice(0, 3)).toEqual([null, null, null]);
    expect(dates[3]).toBe("2025-01-01");
    expect(dates[33]).toBe("2025-01-31");
    expect(dates[34]).toBeNull();
  });

  it("rejects malformed birthday dates and returns null for other months", () => {
    expect(birthdayDateInMonth("2025-02-30", 2025, 1)).toBeNull();
    expect(birthdayDateInMonth("2025-03-01", 2025, 1)).toBeNull();
  });

  it("expands daily and weekly reminders across the requested month", () => {
    expect(reminderDatesInMonth("2025-01-30T09:00:00", "daily", 2025, 1)).toEqual([
      "2025-02-01", "2025-02-02", "2025-02-03", "2025-02-04", "2025-02-05", "2025-02-06", "2025-02-07",
      "2025-02-08", "2025-02-09", "2025-02-10", "2025-02-11", "2025-02-12", "2025-02-13", "2025-02-14",
      "2025-02-15", "2025-02-16", "2025-02-17", "2025-02-18", "2025-02-19", "2025-02-20", "2025-02-21",
      "2025-02-22", "2025-02-23", "2025-02-24", "2025-02-25", "2025-02-26", "2025-02-27", "2025-02-28",
    ]);
    expect(reminderDatesInMonth("2025-01-29T09:00:00", "weekly", 2025, 1)).toEqual([
      "2025-02-05", "2025-02-12", "2025-02-19", "2025-02-26",
    ]);
  });

  it("keeps monthly and yearly occurrences anchored to their due day", () => {
    expect(reminderDatesInMonth("2025-01-31T09:00:00", "monthly", 2025, 1)).toEqual(["2025-02-28"]);
    expect(reminderDatesInMonth("2024-02-29T09:00:00", "yearly", 2025, 1)).toEqual(["2025-02-28"]);
  });

  it("only includes one-time reminders on their exact due date and skips future anchors", () => {
    expect(reminderDatesInMonth("2025-02-14T09:00:00", "once", 2025, 1)).toEqual(["2025-02-14"]);
    expect(reminderDatesInMonth("2025-03-01T09:00:00", "daily", 2025, 1)).toEqual([]);
  });
});
