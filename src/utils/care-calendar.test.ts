import { describe, expect, it } from "vitest";
import { birthdayDateInMonth, calendarMonthDates } from "./care-calendar";

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
});
