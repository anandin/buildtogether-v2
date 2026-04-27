/**
 * BTContext — holds the three Tweaks values from spec §6:
 *   - visual theme (dusk / citrus / bloom / neon) — Bloom default
 *   - Tilly's tone (sibling / coach / protective) — sibling default
 *   - time of day (morning / evening) — evening default (matches source)
 *
 * Persisted to AsyncStorage so a chosen theme survives reloads.
 */
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  BT_DEFAULT_THEME,
  BT_THEMES,
  type BTTheme,
  type BTThemeKey,
} from "./theme";
import {
  BT_DEFAULT_TIME,
  BT_DEFAULT_TONE,
  BT_TONES,
  type BTTimeOfDay,
  type BTTone,
  type BTToneKey,
} from "./tones";

type BTState = {
  themeKey: BTThemeKey;
  toneKey: BTToneKey;
  time: BTTimeOfDay;
  t: BTTheme;
  tone: BTTone;
  setTheme: (k: BTThemeKey) => void;
  setTone: (k: BTToneKey) => void;
  setTime: (k: BTTimeOfDay) => void;
};

const KEY = "bt.tweaks.v2"; // bumped — tone "quiet" → "protective", themes changed

const BTContext = createContext<BTState | null>(null);

export function BTProvider({ children }: { children: React.ReactNode }) {
  const [themeKey, setThemeKey] = useState<BTThemeKey>(BT_DEFAULT_THEME);
  const [toneKey, setToneKey] = useState<BTToneKey>(BT_DEFAULT_TONE);
  const [time, setTimeState] = useState<BTTimeOfDay>(BT_DEFAULT_TIME);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((raw) => {
      if (!raw) return;
      try {
        const v = JSON.parse(raw) as Partial<BTState>;
        if (v.themeKey && v.themeKey in BT_THEMES) setThemeKey(v.themeKey);
        if (v.toneKey && v.toneKey in BT_TONES) setToneKey(v.toneKey);
        if (v.time === "morning" || v.time === "evening") setTimeState(v.time);
      } catch {}
    });
  }, []);

  const persist = (next: Partial<BTState>) => {
    const merged = {
      themeKey: next.themeKey ?? themeKey,
      toneKey: next.toneKey ?? toneKey,
      time: next.time ?? time,
    };
    AsyncStorage.setItem(KEY, JSON.stringify(merged)).catch(() => {});
  };

  const value = useMemo<BTState>(
    () => ({
      themeKey,
      toneKey,
      time,
      t: BT_THEMES[themeKey],
      tone: BT_TONES[toneKey],
      setTheme: (k) => {
        setThemeKey(k);
        persist({ themeKey: k });
      },
      setTone: (k) => {
        setToneKey(k);
        persist({ toneKey: k });
      },
      setTime: (k) => {
        setTimeState(k);
        persist({ time: k });
      },
    }),
    // persist captures themeKey/toneKey/time via closure each render; that's fine
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [themeKey, toneKey, time],
  );

  return <BTContext.Provider value={value}>{children}</BTContext.Provider>;
}

export function useBT(): BTState {
  const v = useContext(BTContext);
  if (!v) throw new Error("useBT must be used within <BTProvider>");
  return v;
}
