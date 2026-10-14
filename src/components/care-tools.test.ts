import { describe, expect, it } from "vitest";

import { CARE_TAB_ITEMS } from "./care-tabs";

describe("care tabs", () => {
  it("keeps a single Reminders tab and removes the separate Calendar tab", () => {
    const ids = CARE_TAB_ITEMS.map((tab) => tab.id);

    expect(ids).toEqual(["pets", "journal", "reminders"]);
    expect(ids).not.toContain("calendar");
    expect(CARE_TAB_ITEMS.find((tab) => tab.label === "Reminders")?.id).toBe("reminders");
  });
});
