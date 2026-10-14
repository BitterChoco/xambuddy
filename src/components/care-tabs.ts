export type CareTab = "pets" | "journal" | "reminders";

export const CARE_TAB_ITEMS: { id: CareTab; label: string }[] = [
  { id: "pets", label: "My pets" },
  { id: "journal", label: "Journal" },
  { id: "reminders", label: "Reminders" },
];
