import { describe, expect, it } from "vitest";
import { csvCell, dateInput, filterExpenseHistory, parseDate, updateExpenseById } from "./expense-utils";

describe("expense utilities", () => {
  it("parses only real YYYY-MM-DD calendar dates", () => {
    expect(parseDate("2024-02-29")).not.toBeNull();
    expect(parseDate("2025-02-29")).toBeNull();
    expect(parseDate("2025-2-09")).toBeNull();
  });

  it("formats dates using local calendar fields", () => {
    expect(dateInput(new Date(2025, 0, 9, 12))).toBe("2025-01-09");
  });

  it("escapes CSV quotes and preserves commas in quoted fields", () => {
    expect(csvCell('Vet, "North"')).toBe('"Vet, ""North"""');
  });

  it("filters history by period, category, and pet, excluding the end date", () => {
    const expenses = [
      { id: "1", date: "2025-01-02", category: "Food", petId: "cat" },
      { id: "2", date: "2025-01-03", category: "Vet care", petId: "cat" },
      { id: "3", date: "2025-01-04", category: "Food", petId: "dog" },
      { id: "4", date: "2025-02-01", category: "Food", petId: "cat" },
    ];
    const result = filterExpenseHistory(expenses, new Date(2025, 0, 1), new Date(2025, 1, 1), "Food", "cat");
    expect(result.map(({ id }) => id)).toEqual(["1"]);
  });

  it("supports all-category and all-pet selections", () => {
    const expenses = [
      { id: "1", date: "2025-01-02", category: "Food", petId: "cat" },
      { id: "2", date: "2025-01-03", category: "Vet care", petId: "dog" },
    ];
    expect(filterExpenseHistory(expenses, new Date(2025, 0, 1), new Date(2025, 1, 1), "All", "").map(({ id }) => id)).toEqual(["2", "1"]);
  });

  it("updates one expense in place without duplicating it", () => {
    const original = [
      { id: "first", title: "Food" },
      { id: "second", title: "Vet visit" },
    ];
    const updated = updateExpenseById(original, { id: "second", title: "Annual vet visit" });
    expect(updated).toEqual([
      { id: "first", title: "Food" },
      { id: "second", title: "Annual vet visit" },
    ]);
    expect(updated).toHaveLength(2);
    expect(original[1].title).toBe("Vet visit");
  });
});
