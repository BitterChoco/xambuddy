import { describe, expect, it } from "vitest";
import { nextRecurringDueDate } from "./care-reminders";

describe("nextRecurringDueDate", () => {
  it("advances daily and weekly reminders beyond now", () => {
    const now = new Date(2025, 0, 10, 10);
    expect(nextRecurringDueDate(new Date(2025, 0, 8, 9).toISOString(), "daily", now).toISOString())
      .toBe(new Date(2025, 0, 11, 9).toISOString());
    expect(nextRecurringDueDate(new Date(2025, 0, 1, 9).toISOString(), "weekly", now).toISOString())
      .toBe(new Date(2025, 0, 15, 9).toISOString());
  });

  it("clamps month-end recurrence without permanently shifting its anchor day", () => {
    const original = new Date(2025, 0, 31, 9);
    expect(nextRecurringDueDate(original.toISOString(), "monthly", new Date(2025, 1, 28, 10)).toISOString())
      .toBe(new Date(2025, 2, 31, 9).toISOString());
  });

  it("handles leap-day yearly reminders", () => {
    const original = new Date(2024, 1, 29, 9);
    expect(nextRecurringDueDate(original.toISOString(), "yearly", new Date(2025, 2, 1, 9)).toISOString())
      .toBe(new Date(2026, 1, 28, 9).toISOString());
  });

  it("does not alter one-time reminders", () => {
    const original = new Date(2025, 0, 1, 9);
    expect(nextRecurringDueDate(original.toISOString(), "once", new Date(2025, 0, 2))).toEqual(original);
  });

  it("rejects invalid due dates", () => {
    expect(() => nextRecurringDueDate("invalid", "daily", new Date())).toThrow("Invalid reminder due date");
  });
});
