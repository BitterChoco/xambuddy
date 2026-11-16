import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { PlayerInventory } from "@/constants/player-inventory";

const SEEN_ITEMS_STORAGE_KEY = "wild-paw.seen-items";

export type ItemKind = "hero" | "skin" | "orb" | "buddy" | "picture" | "border";

export const itemKey = (kind: ItemKind, id: string) => `${kind}:${id}`;

// Shared so the menu badge updates after items are checked on another screen.
let seenCache: Set<string> | null = null;
const seenListeners = new Set<(seen: Set<string>) => void>();

function setSeenCache(next: Set<string>) {
  seenCache = next;
  for (const listener of seenListeners) listener(next);
}

function getOwnedKeys(inventory: PlayerInventory) {
  return [
    ...inventory.heroes.map((id) => itemKey("hero", id)),
    ...inventory.skins.map((id) => itemKey("skin", id)),
    ...inventory.orbSkins.map((id) => itemKey("orb", id)),
    ...inventory.buddies.map((id) => itemKey("buddy", id)),
    ...inventory.profilePictures.map((id) => itemKey("picture", id)),
    ...inventory.borders.map((id) => itemKey("border", id)),
  ];
}

// The first load treats everything already owned as seen.
export function useNewItems(inventory: PlayerInventory, enabled: boolean) {
  const [seen, setSeen] = useState<Set<string> | null>(seenCache);

  useEffect(() => {
    seenListeners.add(setSeen);
    return () => {
      seenListeners.delete(setSeen);
    };
  }, []);

  useEffect(() => {
    if (!enabled || seen) return;
    let isMounted = true;
    void AsyncStorage.getItem(SEEN_ITEMS_STORAGE_KEY)
      .then((stored) => {
        if (!isMounted || seenCache) return;
        let parsed: string[] | null = null;
        try {
          const value = stored ? (JSON.parse(stored) as unknown) : null;
          if (Array.isArray(value)) {
            parsed = value.filter((id): id is string => typeof id === "string");
          }
        } catch {
          parsed = null;
        }
        const initial = new Set(parsed ?? getOwnedKeys(inventory));
        if (!parsed) {
          void AsyncStorage.setItem(
            SEEN_ITEMS_STORAGE_KEY,
            JSON.stringify([...initial]),
          );
        }
        setSeenCache(initial);
      })
      .catch(() => undefined);
    return () => {
      isMounted = false;
    };
  }, [enabled, inventory, seen]);

  const isNew = useCallback(
    (kind: ItemKind, id: string) => !!seen && !seen.has(itemKey(kind, id)),
    [seen],
  );

  const markSeen = useCallback((kind: ItemKind, id: string) => {
    const key = itemKey(kind, id);
    if (!seenCache || seenCache.has(key)) return;
    const next = new Set(seenCache).add(key);
    void AsyncStorage.setItem(
      SEEN_ITEMS_STORAGE_KEY,
      JSON.stringify([...next]),
    );
    setSeenCache(next);
  }, []);

  const hasNew = useMemo(
    () => ({
      hero: inventory.heroes.some((id) => isNew("hero", id)),
      skin: inventory.skins.some((id) => isNew("skin", id)),
      orb: inventory.orbSkins.some((id) => isNew("orb", id)),
      buddy: inventory.buddies.some((id) => isNew("buddy", id)),
      picture: inventory.profilePictures.some((id) => isNew("picture", id)),
      border: inventory.borders.some((id) => isNew("border", id)),
    }),
    [inventory, isNew],
  );

  return { isNew, markSeen, hasNew };
}
