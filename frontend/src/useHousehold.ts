import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { HouseholdDetail } from "./types";

const POLL_MS = 15000;

/** Household details (members + lists) for the selected household, refreshed in the background. */
export function useHousehold(hid: string) {
  const [detail, setDetail] = useState<HouseholdDetail | null>(null);
  const hidRef = useRef(hid);
  hidRef.current = hid;

  const refresh = useCallback(async () => {
    const requested = hid;
    try {
      const next = await api.household(hid);
      if (hidRef.current === requested) setDetail(next);
      return next;
    } catch {
      return null; // transient errors are surfaced by the item list's own banner
    }
  }, [hid]);

  useEffect(() => {
    setDetail(null);
    void refresh();
    const timer = setInterval(() => document.visibilityState === "visible" && void refresh(), POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  return { detail, refresh, setDetail };
}
