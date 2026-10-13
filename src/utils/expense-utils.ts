export function dateInput(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function parseDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) || dateInput(date) !== value ? null : date;
}

export function csvCell(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export function updateExpenseById<T extends { id: string }>(expenses: T[], updatedExpense: T): T[] {
  return expenses.map((expense) => expense.id === updatedExpense.id ? updatedExpense : expense);
}

export function filterExpenseHistory<T extends { date: string; category: string; petId: string }>(
  expenses: T[],
  start: Date,
  end: Date,
  category: string,
  petId: string,
): T[] {
  return expenses
    .filter((expense) => {
      const expenseDate = parseDate(expense.date);
      return expenseDate !== null
        && expenseDate >= start
        && expenseDate < end
        && (category === "All" || expense.category === category)
        && (!petId || expense.petId === petId);
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}
