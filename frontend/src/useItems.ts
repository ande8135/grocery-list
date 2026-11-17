import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { Item } from "./types";

const POLL_MS = 5000;

export type Status = "loading" | "ready" | "error";

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function capitalize(name: string): string {
  return name.charAt(0).toLocaleUpperCase() + name.slice(1);
}

/**
 * Items state with optimistic updates and light polling so everyone in the
 * family sees changes within a few seconds. Polling is paused while a write is
 * in flight so a stale response can't overwrite an optimistic change.
 */
export function useItems() {
  const [items, setItems] = useState<Item[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const inflight = useRef(0);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const refresh = useCallback(async () => {
    if (inflight.current > 0) return;
    try {
      const next = await api.list();
      if (inflight.current > 0) return;
      setItems(next);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [refresh]);

  const mutate = useCallback(
    async (optimistic: (prev: Item[]) => Item[], request: () => Promise<unknown>) => {
      inflight.current++;
      setItems(optimistic);
      try {
        await request();
      } catch {
        setStatus("error");
      } finally {
        inflight.current--;
        // Reconcile with the server (this also rolls back a failed write).
        if (inflight.current === 0) void refresh();
      }
    },
    [refresh],
  );

  const setChecked = useCallback(
    (id: string, checked: boolean) => {
      const now = new Date().toISOString();
      return mutate(
        (prev) => prev.map((i) => (i.id === id ? { ...i, checked, updatedAt: now } : i)),
        () => api.setChecked(id, checked),
      );
    },
    [mutate],
  );

  const add = useCallback(
    (rawName: string) => {
      const name = capitalize(rawName.replace(/\s+/g, " ").trim());
      if (!name) return;
      const existing = itemsRef.current.find((i) => i.name.toLowerCase() === name.toLowerCase());
      if (existing) {
        // Already on the list: no duplicate. If it was in the cart, put it back on the list.
        if (existing.checked) void setChecked(existing.id, false);
        return;
      }
      const id = newId();
      const now = new Date().toISOString();
      void mutate(
        (prev) => [...prev, { id, name, checked: false, createdAt: now, updatedAt: now }],
        () => api.add(id, name),
      );
    },
    [mutate, setChecked],
  );

  const toggle = useCallback(
    (id: string) => {
      const item = itemsRef.current.find((i) => i.id === id);
      if (item) void setChecked(id, !item.checked);
    },
    [setChecked],
  );

  const remove = useCallback(
    (id: string) =>
      void mutate(
        (prev) => prev.filter((i) => i.id !== id),
        () => api.remove(id),
      ),
    [mutate],
  );

  const clearChecked = useCallback(
    () =>
      void mutate(
        (prev) => prev.filter((i) => !i.checked),
        () => api.clearChecked(),
      ),
    [mutate],
  );

  return { items, status, add, toggle, remove, clearChecked };
}
