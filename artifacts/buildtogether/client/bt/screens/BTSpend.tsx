/**
 * BTSpend — pattern of the week. Spec §4.3.
 *
 * Not a ledger — a story of where money emotionally went. Paycheck shimmer
 * banner up top, day-bars in the middle, emotional category rows below.
 *
 * When the user hasn't connected a bank, we don't fake a Maya-shaped life.
 * The screen flips to a single connect-bank empty state instead.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Platform, Pressable, ScrollView, Text, View, LayoutAnimation, UIManager } from "react-native";
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Defs, Pattern, Rect, Line } from "react-native-svg";

import { useBT } from "../BTContext";
import { Tilly } from "../Tilly";
import { BT_SHIMMER_DURATION_MS, BTFonts, type BTTheme } from "../theme";
import { BTCard, BTChip, BTLabel, BTNum, BTSerif } from "../atoms";
import { useSpend } from "../hooks/useSpend";
import { useExpenses } from "../hooks/useExpenses";
import { useSubscriptions } from "../hooks/useSubscriptions";
import { useUserPrefs } from "../hooks/useUserPrefs";
import { AddExpenseModal } from "../AddExpenseModal";
import { SplitModal } from "../SplitModal";
import { MemoryInspector } from "../MemoryInspector";
import { useTilly } from "../hooks/useTilly";
import { btApi } from "../api/client";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Linking } from "react-native";
import { format } from "date-fns";
import type {
  DayBar,
  SpendCategory,
  SpendTx,
  SpendHorizon,
  SpendVerdictTone,
  HorizonMonth,
} from "../api/types";

/** Map a server-provided verdict tone to a concrete theme color. We
 * collapse 5 verdict buckets into the theme's 3 status colors so all
 * four themes (dusk/citrus/bloom/neon) stay coherent — the label +
 * score communicate the finer distinctions. */
function verdictColor(tone: SpendVerdictTone, t: BTTheme): string {
  switch (tone) {
    case "good":
      return t.good;
    case "ok":
      return t.good;
    case "warn":
      return t.warn;
    case "edge":
      return t.warn;
    case "bad":
      return t.bad;
  }
}

/** Compact dollar label for tight 12-bar year layouts. */
function compactDollar(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}m`;
  if (abs >= 10_000) return `${sign}$${Math.round(abs / 1_000)}k`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`;
  return `${sign}$${Math.round(abs)}`;
}

function useSplitsList() {
  return useQuery({
    queryKey: ["/api/splits"],
    queryFn: btApi.splits,
    staleTime: 60_000,
  });
}

class BTSpendErrorBoundary extends React.Component<
  { children: React.ReactNode; t: BTTheme },
  { err: Error | null }
> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) {
    return { err };
  }
  componentDidCatch(err: Error) {
    console.error("[BTSpend] render error:", err);
  }
  render() {
    if (this.state.err) {
      const t = this.props.t;
      return (
        <View style={{ flex: 1, backgroundColor: t.bg, padding: 22, paddingTop: 60, gap: 14 }}>
          <BTLabel color={t.inkMute}>Something broke on this view</BTLabel>
          <BTSerif size={22} color={t.ink} weight="500">
            I couldn't draw the spend page just now. Try switching ranges or
            pulling to refresh.
          </BTSerif>
          <Text
            style={{
              color: t.inkMute,
              fontFamily: BTFonts.mono,
              fontSize: 10,
              marginTop: 8,
            }}
            selectable
          >
            {String(this.state.err?.message ?? this.state.err)}
          </Text>
          <Pressable
            onPress={() => this.setState({ err: null })}
            accessibilityRole="button"
            style={{
              alignSelf: "flex-start",
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: t.rule,
            }}
          >
            <Text style={{ color: t.ink, fontFamily: BTFonts.sans, fontWeight: "700", fontSize: 12 }}>
              Try again
            </Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

export function BTSpend() {
  const { t } = useBT();
  return (
    <BTSpendErrorBoundary t={t}>
      <BTSpendBody />
    </BTSpendErrorBoundary>
  );
}

/** Week-view header strip: just the period label + prev/next chevrons.
 * No verdict pill because week intentionally skips the Horizon math
 * (paycheck cadence ≠ weekly). Mirrors HorizonHeader's chevron shape
 * so the two views feel consistent. */
function WeekNavHeader({
  t,
  label,
  onPrev,
  onNext,
  canGoNext,
}: {
  t: BTTheme;
  label: string;
  onPrev: () => void;
  onNext: () => void;
  canGoNext: boolean;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Pressable
        onPress={onPrev}
        accessibilityRole="button"
        accessibilityLabel="Previous week"
        hitSlop={10}
        style={({ pressed }) => ({
          width: 28,
          height: 28,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: t.rule,
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.5 : 1,
        })}
      >
        <Text style={{ color: t.ink, fontSize: 14, fontWeight: "700", marginTop: -2 }}>
          ‹
        </Text>
      </Pressable>
      <Text
        style={{
          fontSize: 11,
          letterSpacing: 1.8,
          color: t.inkMute,
          fontFamily: BTFonts.sans,
          fontWeight: "700",
          textTransform: "uppercase",
          flex: 1,
        }}
      >
        {label}
      </Text>
      <Pressable
        onPress={canGoNext ? onNext : undefined}
        accessibilityRole="button"
        accessibilityLabel="Next week"
        accessibilityState={{ disabled: !canGoNext }}
        hitSlop={10}
        style={({ pressed }) => ({
          width: 28,
          height: 28,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: t.rule,
          alignItems: "center",
          justifyContent: "center",
          opacity: !canGoNext ? 0.25 : pressed ? 0.5 : 1,
        })}
      >
        <Text style={{ color: t.ink, fontSize: 14, fontWeight: "700", marginTop: -2 }}>
          ›
        </Text>
      </Pressable>
    </View>
  );
}

/** Horizon header strip: range label (NOVEMBER / YEAR-TO-DATE) + verdict pill.
 * When onPrev/onNext are supplied, renders chevron arrows on either side
 * of the label for navigating to adjacent periods. Next arrow is hidden
 * when canGoNext = false (i.e., we're at the current period). */
function HorizonHeader({
  t,
  rangeLabel,
  verdict,
  onPrev,
  onNext,
  canGoNext,
}: {
  t: BTTheme;
  rangeLabel: string;
  verdict: SpendHorizon["verdict"];
  onPrev?: () => void;
  onNext?: () => void;
  canGoNext?: boolean;
}) {
  const vc = verdictColor(verdict.tone, t);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      {onPrev ? (
        <Pressable
          onPress={onPrev}
          accessibilityRole="button"
          accessibilityLabel="Previous period"
          hitSlop={10}
          style={({ pressed }) => ({
            width: 28,
            height: 28,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: t.rule,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.5 : 1,
          })}
        >
          <Text style={{ color: t.ink, fontSize: 14, fontWeight: "700", marginTop: -2 }}>
            ‹
          </Text>
        </Pressable>
      ) : null}
      <Text
        style={{
          fontSize: 11,
          letterSpacing: 1.8,
          color: vc,
          fontFamily: BTFonts.sans,
          fontWeight: "700",
          textTransform: "uppercase",
        }}
      >
        {rangeLabel}
      </Text>
      <View
        style={{
          paddingHorizontal: 10,
          paddingVertical: 3,
          backgroundColor: vc,
          borderRadius: 999,
        }}
      >
        <Text
          style={{
            color: t.surface,
            fontSize: 10,
            fontFamily: BTFonts.sans,
            fontWeight: "700",
            letterSpacing: 0.8,
            textTransform: "uppercase",
          }}
        >
          {verdict.label}
        </Text>
      </View>
      {onNext ? (
        <Pressable
          onPress={canGoNext ? onNext : undefined}
          accessibilityRole="button"
          accessibilityLabel="Next period"
          accessibilityState={{ disabled: !canGoNext }}
          hitSlop={10}
          style={({ pressed }) => ({
            width: 28,
            height: 28,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: t.rule,
            alignItems: "center",
            justifyContent: "center",
            opacity: !canGoNext ? 0.25 : pressed ? 0.5 : 1,
            marginLeft: 4,
          })}
        >
          <Text style={{ color: t.ink, fontSize: 14, fontWeight: "700", marginTop: -2 }}>
            ›
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Surplus big number + weather label. Tinted red when underwater. */
function HorizonSurplus({
  t,
  surplus,
  weatherLabel,
}: {
  t: BTTheme;
  surplus: number;
  weatherLabel: string;
}) {
  const underwater = surplus < 0;
  return (
    <View style={{ gap: 4 }}>
      <Text
        style={{
          fontSize: 38,
          color: underwater ? t.bad : t.ink,
          fontFamily: BTFonts.serif,
          fontWeight: "400",
          letterSpacing: -0.5,
          lineHeight: 42,
        }}
      >
        {underwater ? "−" : ""}${Math.abs(surplus).toLocaleString()}{" "}
        <Text style={{ fontSize: 20, color: t.inkSoft, letterSpacing: 0 }}>
          {underwater ? "heavier" : "to spare"}
        </Text>
      </Text>
      <Text
        style={{
          fontSize: 13,
          color: t.inkSoft,
          fontFamily: BTFonts.sans,
        }}
      >
        {weatherLabel}
      </Text>
    </View>
  );
}

/** 10-dot score, filled to score/10 in the verdict color. */
function ScoreDots({
  t,
  score,
  tone,
}: {
  t: BTTheme;
  score: number;
  tone: SpendVerdictTone;
}) {
  const vc = verdictColor(tone, t);
  const clamped = Math.max(0, Math.min(10, score));
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Text
        style={{
          fontSize: 10,
          color: t.inkMute,
          fontFamily: BTFonts.mono,
          letterSpacing: 1,
          marginRight: 2,
        }}
      >
        SCORE
      </Text>
      {Array.from({ length: 10 }).map((_, i) => (
        <View
          key={i}
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: i < clamped ? vc : t.rule,
          }}
        />
      ))}
      <Text
        style={{
          fontSize: 12,
          color: vc,
          fontFamily: BTFonts.sans,
          fontWeight: "700",
          marginLeft: 4,
        }}
      >
        {clamped}/10
      </Text>
    </View>
  );
}

/**
 * The Horizon panel: a 360-tall block with a tinted sky above the income
 * line and category bars hanging from it. When underwater, a hatched
 * band sits below the income line and the bars start beneath it.
 *
 * Bars are tappable — first tap shows an amount tooltip, second clears
 * it. RN has no hover so we lean on tap state instead of the mockup's
 * mouseEnter/Leave. Long categories like "subscriptions" wrap below the
 * bar (we don't try the mockup's `rotate(-90deg)` text trick — it's
 * fragile on RN and reads worse than a horizontal label).
 */
function HorizonPanel({
  t,
  horizon,
  categories,
}: {
  t: BTTheme;
  horizon: SpendHorizon;
  categories: SpendCategory[];
}) {
  const [tappedId, setTappedId] = useState<string | null>(null);
  const vc = verdictColor(horizon.verdict.tone, t);
  const underwater = horizon.surplus < 0;
  const incomeLineY = 0.38; // 38% from top — matches the mockup proportion
  const underwaterBandH = 0.13;
  // Combine discretionary + fixed for the bar set (the Horizon shows
  // EVERYTHING that hung off the income line, not just discretionary).
  // The categories arg is already the merged list — caller takes care.
  const maxAmt = categories.length
    ? Math.max(...categories.map((c) => c.amt))
    : 1;

  // Grow-down animation per category. Each bar's scaleY interpolates
  // 0 → 1 with `transformOrigin: 'top'` so the bar appears to descend
  // from the income line down to its target height. Staggered by 70ms
  // per the design's cubic-bezier curve. Reset whenever the category
  // list identity changes (month-nav, hide-cat tool, etc.).
  const catKey = categories.map((c) => `${c.id}:${c.amt}`).join("|");
  const growAnims = useMemo(
    () => categories.map(() => new Animated.Value(0)),
    [catKey],
  );
  useEffect(() => {
    const animations = growAnims.map((v) =>
      Animated.timing(v, {
        toValue: 1,
        duration: 600,
        easing: Easing.bezier(0.34, 1.2, 0.64, 1),
        useNativeDriver: true,
      }),
    );
    Animated.stagger(70, animations).start();
  }, [growAnims]);

  return (
    <View
      style={{
        position: "relative",
        height: 360,
        borderRadius: 24,
        backgroundColor: t.surface,
        overflow: "hidden",
      }}
    >
      {/* Sky gradient (verdict-tinted) — top 38% */}
      <LinearGradient
        colors={[`${vc}22`, `${vc}66`]}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: `${incomeLineY * 100}%`,
        }}
      />

      {/* Breathing-room callout in the sky (only when not underwater) */}
      {!underwater ? (
        <View
          style={{
            position: "absolute",
            top: 36,
            left: 0,
            right: 0,
            alignItems: "center",
          }}
        >
          <Text
            style={{
              fontSize: 10,
              letterSpacing: 1.6,
              color: vc,
              fontFamily: BTFonts.sans,
              fontWeight: "700",
              marginBottom: 2,
            }}
          >
            BREATHING ROOM · {horizon.savingsRate.toFixed(0)}%
          </Text>
          <Text
            style={{
              fontSize: 26,
              color: vc,
              fontFamily: BTFonts.serif,
              fontWeight: "500",
            }}
          >
            +${horizon.surplus.toLocaleString()}
          </Text>
        </View>
      ) : null}

      {/* Income line — solid black across the panel at incomeLineY */}
      <View
        style={{
          position: "absolute",
          top: `${incomeLineY * 100}%`,
          left: 16,
          right: 16,
          height: 2,
          backgroundColor: t.ink,
          zIndex: 5,
        }}
      />
      <Text
        style={{
          position: "absolute",
          top: `${incomeLineY * 100}%`,
          right: 16,
          marginTop: -22,
          fontSize: 11,
          color: t.ink,
          fontFamily: BTFonts.sans,
          fontWeight: "700",
          letterSpacing: 0.6,
          zIndex: 6,
        }}
      >
        ${horizon.income.toLocaleString()} EARNED
      </Text>

      {/* Underwater hatched band — only when surplus < 0 */}
      {underwater ? (
        <View
          style={{
            position: "absolute",
            top: `${incomeLineY * 100}%`,
            left: 16,
            right: 16,
            height: `${underwaterBandH * 100}%`,
            zIndex: 3,
          }}
        >
          <Svg width="100%" height="100%">
            <Defs>
              <Pattern
                id="uwHatch"
                x="0"
                y="0"
                width="10"
                height="10"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <Rect width="6" height="10" fill={t.bad} fillOpacity={0.32} />
                <Rect x="6" width="4" height="10" fill={t.bad} fillOpacity={0.1} />
              </Pattern>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#uwHatch)" />
          </Svg>
          <View
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View
              style={{
                backgroundColor: t.bg,
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 999,
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  letterSpacing: 1.8,
                  color: t.bad,
                  fontFamily: BTFonts.sans,
                  fontWeight: "700",
                }}
              >
                −${Math.abs(horizon.surplus).toLocaleString()} HEAVIER
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      {/* Category bars — hang from the income line (or from the bottom
          of the underwater band if applicable) down to the panel floor.
          Each bar's height = (amt / maxAmt) * availableHeight. */}
      <View
        style={{
          position: "absolute",
          top: `${(incomeLineY + (underwater ? underwaterBandH : 0)) * 100}%`,
          left: 16,
          right: 16,
          bottom: 16,
          flexDirection: "row",
          gap: 5,
          alignItems: "flex-start",
        }}
      >
        {categories.length === 0 ? (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingTop: 30,
            }}
          >
            <Text
              style={{
                color: t.inkMute,
                fontFamily: BTFonts.sans,
                fontSize: 12,
                fontStyle: "italic",
              }}
            >
              No spend captured this range yet.
            </Text>
          </View>
        ) : (
          categories.map((c, i) => {
            const heightPct = (c.amt / maxAmt) * 100;
            const isTapped = tappedId === c.id;
            const barColor = categoryBarColor(c, t);
            const anim = growAnims[i];
            return (
              <Pressable
                key={c.id}
                onPress={() => setTappedId(isTapped ? null : c.id)}
                accessibilityRole="button"
                accessibilityLabel={`${c.name} ${c.amt} dollars`}
                style={{
                  flex: 1,
                  height: `${heightPct}%`,
                  minHeight: 24,
                }}
              >
                <Animated.View
                  style={{
                    flex: 1,
                    backgroundColor: barColor,
                    borderBottomLeftRadius: 10,
                    borderBottomRightRadius: 10,
                    opacity: tappedId && !isTapped ? 0.55 : 1,
                    transform: [{ scaleY: anim ?? 1 }],
                    transformOrigin: "top",
                  }}
                />
                {isTapped ? (
                  <View
                    style={{
                      position: "absolute",
                      top: -42,
                      left: "50%",
                      transform: [{ translateX: -45 }],
                      backgroundColor: t.ink,
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 8,
                      zIndex: 10,
                      minWidth: 90,
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        color: t.surface,
                        fontFamily: BTFonts.sans,
                        fontSize: 11,
                        fontWeight: "700",
                      }}
                      numberOfLines={1}
                    >
                      {c.name}
                    </Text>
                    <Text
                      style={{
                        color: t.surface,
                        fontFamily: BTFonts.mono,
                        fontSize: 10,
                        opacity: 0.85,
                        marginTop: 1,
                      }}
                    >
                      ${c.amt.toLocaleString()}
                    </Text>
                  </View>
                ) : null}
                <Text
                  numberOfLines={1}
                  style={{
                    position: "absolute",
                    bottom: 6,
                    left: 0,
                    right: 0,
                    textAlign: "center",
                    color: t.surface,
                    fontFamily: BTFonts.sans,
                    fontSize: 9,
                    fontWeight: "600",
                    letterSpacing: 0.3,
                  }}
                >
                  {c.name.length > 7 ? c.name.slice(0, 6) + "…" : c.name}
                </Text>
              </Pressable>
            );
          })
        )}
      </View>
    </View>
  );
}

/** Pick a bar color for a category — uses the existing hue → theme
 * color mapping so subscriptions stay accent2, loans stay accent2,
 * food stays good, etc. Keeps cross-screen consistency. */
function categoryBarColor(c: SpendCategory, t: BTTheme): string {
  switch (c.hue) {
    case "accent":
      return t.accent;
    case "accent2":
      return t.accent2;
    case "good":
      return t.good;
    case "warn":
      return t.warn;
    case "inkSoft":
    default:
      return t.inkSoft;
  }
}

/** vs 6-month average comparator. Centerline = the user's trailing-6 mean
 * savings rate; the colored fill extends left or right from center
 * depending on whether this period beat or missed the mean. */
function SixMonthCompare({
  t,
  savingsRate,
  avg,
  tone,
}: {
  t: BTTheme;
  savingsRate: number;
  avg: number;
  tone: SpendVerdictTone;
}) {
  const delta = savingsRate - avg;
  const beats = delta >= 0;
  const vc = verdictColor(tone, t);
  // Width is capped so a single anomaly doesn't fill the whole bar — 45%
  // of half-width per 100% of delta is a reasonable visual cap.
  const widthPct = Math.min(Math.abs(delta) * 2.5, 45);
  return (
    <View style={{ gap: 8 }}>
      <Text
        style={{
          fontSize: 11,
          letterSpacing: 1.6,
          color: t.inkMute,
          fontFamily: BTFonts.mono,
        }}
      >
        VS YOUR 6-MONTH AVERAGE
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View
          style={{
            flex: 1,
            height: 10,
            backgroundColor: t.rule,
            borderRadius: 5,
            position: "relative",
          }}
        >
          {/* center tick */}
          <View
            style={{
              position: "absolute",
              left: "50%",
              top: -3,
              bottom: -3,
              width: 2,
              backgroundColor: t.inkSoft,
            }}
          />
          {/* delta bar */}
          <View
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: beats ? "50%" : `${50 - widthPct}%`,
              width: `${widthPct}%`,
              backgroundColor: vc,
              borderRadius: 5,
            }}
          />
        </View>
        <Text
          style={{
            fontSize: 13,
            fontFamily: BTFonts.sans,
            fontWeight: "700",
            color: vc,
            minWidth: 50,
            textAlign: "right",
          }}
        >
          {beats ? "↑" : "↓"} {Math.abs(delta).toFixed(0)}%
        </Text>
      </View>
      <Text
        style={{
          fontSize: 12,
          color: t.inkSoft,
          fontFamily: BTFonts.serifItalic,
        }}
      >
        {beats
          ? `You saved ${delta.toFixed(0)}% more than your usual.`
          : `You saved ${Math.abs(delta).toFixed(0)}% less than your usual.`}
      </Text>
    </View>
  );
}

/** 12-month horizons list — one row per month with a spend bar that
 * stops at the income line, plus a hatched overflow band when spend
 * exceeded income. Future months render dimmed with no data. */
function HorizonYearList({
  t,
  months,
}: {
  t: BTTheme;
  months: HorizonMonth[];
}) {
  // "No data" = a past (or current) month where Plaid didn't surface any
  // income rows. Could be a Plaid item that wasn't connected yet, an
  // employer paying via cheque, or just a gap. We can't classify these
  // as over/under so we dim them and pull them out of the summary
  // counts. The user-visible difference: their Jan shows "—" instead of
  // a misleading "$0" in green.
  const hasData = (m: HorizonMonth) => !m.isFuture && m.income > 0;
  const overCount = months.filter((m) => hasData(m) && m.spend > m.income).length;
  const underCount = months.filter((m) => hasData(m) && m.spend <= m.income).length;
  const noDataCount = months.filter(
    (m) => !m.isFuture && m.income === 0,
  ).length;

  // One Animated.Value per row. Drives the spend-fill scaleX from 0 → 1
  // with stagger. Recreated whenever the months array identity shifts
  // (range toggle, month change) so the animation re-plays.
  const monthsKey = months.map((m) => `${m.m}:${m.spend}:${m.income}`).join("|");
  const fillAnims = useMemo(
    () => months.map(() => new Animated.Value(0)),
    [monthsKey],
  );
  useEffect(() => {
    const animations = fillAnims.map((v) =>
      Animated.timing(v, {
        toValue: 1,
        duration: 700,
        easing: Easing.bezier(0.34, 1.05, 0.64, 1),
        useNativeDriver: true,
      }),
    );
    Animated.stagger(60, animations).start();
  }, [fillAnims]);
  return (
    <BTCard t={t} padding={18}>
      <View style={{ alignItems: "center", marginBottom: 4 }}>
        <Text
          style={{
            fontSize: 11,
            letterSpacing: 1.6,
            color: t.inkMute,
            fontFamily: BTFonts.mono,
          }}
        >
          12 HORIZONS
        </Text>
      </View>
      <View style={{ alignItems: "center", marginBottom: 14 }}>
        <Text
          style={{
            fontSize: 13,
            color: t.inkSoft,
            fontFamily: BTFonts.serifItalic,
          }}
        >
          {underCount} with room · {overCount} heavier
          {noDataCount > 0 ? ` · ${noDataCount} still settling` : ""}
        </Text>
      </View>
      {months.map((m, i) => {
        const noData = !m.isFuture && m.income === 0;
        const isOver = !m.isFuture && m.income > 0 && m.spend > m.income;
        const ratio = m.isFuture || m.income === 0 ? 0 : m.spend / m.income;
        const fillPct = Math.min(ratio * 100, 100);
        const monthSurplus = m.income - m.spend;
        const dimmed = m.isFuture || noData;
        // Per-row scaleX animation — fills left → right with stagger.
        // useNativeDriver works for scale + opacity. transformOrigin
        // requires RN 0.74+ (we're on 0.81).
        const fill = fillAnims[i];
        return (
          <View
            key={`${m.m}-${i}`}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              marginBottom: 10,
              opacity: dimmed ? 0.3 : 1,
            }}
          >
            <Text
              style={{
                width: 14,
                fontSize: 11,
                fontFamily: BTFonts.sans,
                color: t.inkMute,
                fontWeight: "600",
              }}
            >
              {m.m}
            </Text>
            <View
              style={{
                flex: 1,
                height: 22,
                backgroundColor: m.isFuture || noData ? t.rule : `${t.good}1f`,
                borderRadius: 5,
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* spend fill — scaleX-animated from the left edge. We
                  render the View at 100% of fillPct and scale it from
                  0 to 1 with native driver. */}
              {!m.isFuture && m.income > 0 ? (
                <Animated.View
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    bottom: 0,
                    width: `${fillPct}%`,
                    backgroundColor: isOver ? t.bad : t.inkSoft,
                    borderRadius: 5,
                    transform: [{ scaleX: fill ?? 1 }],
                    transformOrigin: "left",
                  }}
                />
              ) : null}
              {/* income horizon line — solid black tick at the right
                  edge of the bar container, rendered ABOVE the fill so
                  it stays visible even when the fill goes full-width. */}
              <View
                style={{
                  position: "absolute",
                  top: -3,
                  bottom: -3,
                  right: 0,
                  width: 2,
                  backgroundColor: t.ink,
                  zIndex: 4,
                }}
              />
            </View>
            <View
              style={{
                width: 72,
                flexDirection: "row",
                justifyContent: "flex-end",
                alignItems: "baseline",
                gap: 3,
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontFamily: BTFonts.sans,
                  fontWeight: "700",
                  color: dimmed ? t.inkMute : isOver ? t.bad : t.good,
                }}
              >
                {dimmed
                  ? "—"
                  : compactDollar(monthSurplus < 0 ? -Math.abs(monthSurplus) : monthSurplus)}
              </Text>
              {isOver ? (
                <Text
                  style={{
                    fontSize: 10,
                    fontFamily: BTFonts.sans,
                    color: t.inkSoft,
                    fontWeight: "500",
                    letterSpacing: 0.4,
                    fontStyle: "italic",
                  }}
                >
                  heavier
                </Text>
              ) : !m.isFuture && !noData && m.income > 0 && monthSurplus > 0 ? (
                <Text
                  style={{
                    fontSize: 10,
                    fontFamily: BTFonts.sans,
                    color: t.inkSoft,
                    fontWeight: "500",
                    letterSpacing: 0.4,
                    fontStyle: "italic",
                  }}
                >
                  to spare
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
      <View
        style={{
          marginTop: 14,
          paddingTop: 14,
          borderTopWidth: 1,
          borderTopColor: t.rule,
          alignItems: "center",
        }}
      >
        <Text
          style={{
            fontSize: 13,
            color: t.inkSoft,
            fontFamily: BTFonts.serifItalic,
            textAlign: "center",
          }}
        >
          {overCount === 0 && underCount > 0
            ? "Steady year so far."
            : overCount === 0 && underCount === 0
              ? noDataCount > 0
                ? "Not enough income synced yet to draw the year."
                : "Nothing landed yet this year."
              : overCount <= 2 && underCount >= overCount
                ? `Mostly steady. ${overCount} month${overCount === 1 ? "" : "s"} ran heavier — worth a closer look together?`
                : `${overCount} heavier month${overCount === 1 ? "" : "s"} so far. Want to look at where the weight came from?`}
        </Text>
      </View>
    </BTCard>
  );
}

function BTSpendBody() {
  const { t } = useBT();
  const [range, setRange] = useState<"week" | "month" | "year">("week");
  // Offset = how many periods back from the current one. 0 = current.
  // Negative goes backwards. Reset to 0 whenever the range tab changes
  // — otherwise switching week→month after navigating to April would
  // land on a weird "5 weeks ago" with no clear UX.
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    setOffset(0);
  }, [range]);
  const spend = useSpend(range, offset);
  const expenses = useExpenses();
  const [addOpen, setAddOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [splitPrefill, setSplitPrefill] = useState<{ amount?: number; label?: string }>({});
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [undoToast, setUndoToast] = useState<string | null>(null);
  const tilly = useTilly();
  const live = spend.data && spend.data.ready === true ? spend.data : null;
  const recent = expenses.data?.expenses ?? [];

  const openSplit = (e?: { amount?: number; merchant?: string | null; description?: string }) => {
    setSplitPrefill({
      amount: e?.amount,
      label: e?.merchant || e?.description || "Split",
    });
    setSplitOpen(true);
  };

  const qc = useQueryClient();
  const seed = useMutation({
    mutationFn: btApi.seedDemo,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/expenses"] });
      qc.invalidateQueries({ queryKey: ["/api/tilly/spend-pattern"] });
      qc.invalidateQueries({ queryKey: ["/api/tilly/today"] });
      qc.invalidateQueries({ queryKey: ["/api/subscriptions"] });
      qc.invalidateQueries({ queryKey: ["/api/protections"] });
    },
  });
  const splitsList = useSplitsList();
  const settle = useMutation({
    mutationFn: btApi.settleSplit,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/splits"] }),
  });
  const pendingSplits = (splitsList.data?.splits ?? []).filter(
    (s) => !(s.metadata?.settled ?? false),
  );

  const subs = useSubscriptions();
  const activeSubs = (subs.data && subs.data.ready === true ? subs.data.subscriptions : [])
    .filter((s) => s.status === "active")
    .slice(0, 4);

  // useUserPrefs MUST be called before any early return — Rules of Hooks.
  // The previous structure ran it only when `live` was non-null, so when
  // the query refetched and `live` flipped back to null between renders,
  // React saw a different number of hooks and threw "Rendered fewer hooks
  // than expected." The error boundary surfaces this now that the screen
  // is wrapped, but the bug pre-existed the wrap.
  const { hiddenCategories } = useUserPrefs();

  if (!live) {
    // No spend pattern computed yet — but the user may still have logged
    // manual expenses. Show those + a connect/log prompt so the screen
    // never reads empty for a user who's been actively typing in spends.
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 22, paddingTop: 36, paddingBottom: 180, gap: 22 }}
        >
          <View style={{ gap: 8 }}>
            <BTLabel color={t.inkMute}>This week's pattern</BTLabel>
            <BTSerif size={28} color={t.ink} weight="500">
              {recent.length > 0 ? (
                <>
                  ${Math.round(recent.reduce((s, r) => s + r.amount, 0))} so far.{" "}
                  <Text style={{ color: t.accent, fontFamily: BTFonts.serifItalic }}>
                    Patterns light up
                  </Text>{" "}
                  after a few weeks.
                </>
              ) : (
                <>
                  Nothing to{" "}
                  <Text style={{ color: t.accent, fontFamily: BTFonts.serifItalic }}>
                    show yet
                  </Text>
                  .
                </>
              )}
            </BTSerif>
          </View>
          <BTCard t={t} padding={20} style={{ gap: 14 }}>
            <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
              <Tilly t={t} size={42} breathing />
              <View style={{ flex: 1, gap: 8 }}>
                <Text
                  style={{
                    color: t.ink,
                    fontFamily: BTFonts.serifItalic,
                    fontSize: 16,
                    lineHeight: 23,
                  }}
                >
                  {recent.length > 0
                    ? "I'll keep noticing. Patterns get sharper after a few weeks of data."
                    : "Connect a bank, or just tell me what you spend — voice, photo of a receipt, or type it. I'll figure out the rest."}
                </Text>
              </View>
            </View>
          </BTCard>

          {recent.length === 0 ? (
            <Pressable
              onPress={() => seed.mutate()}
              disabled={seed.isPending}
              accessibilityRole="button"
              accessibilityLabel="Try with demo data"
              style={{
                alignSelf: "center",
                paddingVertical: 8,
                paddingHorizontal: 14,
              }}
            >
              <Text
                style={{
                  color: t.inkMute,
                  fontFamily: BTFonts.mono,
                  fontSize: 10,
                  letterSpacing: 1.2,
                  textTransform: "uppercase",
                  fontWeight: "700",
                }}
              >
                {seed.isPending ? "Seeding…" : "✦ try with demo data"}
              </Text>
            </Pressable>
          ) : null}

          {recent.length > 0 ? (
            <View style={{ gap: 10 }}>
              <BTLabel color={t.inkMute}>Recent</BTLabel>
              <BTCard t={t} alt padding={14} style={{ gap: 10 }}>
                {recent.slice(0, 6).map((r) => (
                  <View
                    key={r.id}
                    style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: t.ink, fontFamily: BTFonts.sans, fontWeight: "600", fontSize: 13 }}>
                        {r.merchant ?? r.description}
                      </Text>
                      <Text
                        style={{
                          color: t.inkMute,
                          fontFamily: BTFonts.mono,
                          fontSize: 10,
                          letterSpacing: 1,
                          textTransform: "uppercase",
                          marginTop: 2,
                        }}
                      >
                        {r.category} · {r.date}
                      </Text>
                    </View>
                    <Text style={{ fontFamily: BTFonts.serif, fontSize: 18, color: t.ink }}>
                      −${r.amount.toFixed(2)}
                    </Text>
                  </View>
                ))}
              </BTCard>
            </View>
          ) : null}
        </ScrollView>
        <FAB onPress={() => setAddOpen(true)} t={t} onSplit={() => openSplit()} />
        <AddExpenseModal visible={addOpen} onClose={() => setAddOpen(false)} />
        <SplitModal
          visible={splitOpen}
          onClose={() => setSplitOpen(false)}
          prefillAmount={splitPrefill.amount}
          prefillLabel={splitPrefill.label}
        />
      </View>
    );
  }

  const { spent, italicSpan, bars, categories } = live;
  const safeCategories: SpendCategory[] = Array.isArray(categories) ? categories : [];
  const safeBars: DayBar[] = Array.isArray(bars) ? bars : [];
  const fixedObligations =
    "fixedObligations" in live && Array.isArray(live.fixedObligations)
      ? live.fixedObligations
      : [];
  const todayLedger =
    "today" in live && Array.isArray(live.today) ? live.today : [];
  const paycheck = "paycheck" in live ? live.paycheck ?? null : null;
  const horizon = "horizon" in live ? live.horizon ?? null : null;
  const incomeSources =
    "incomeSources" in live && Array.isArray(live.incomeSources)
      ? (live.incomeSources as SpendCategory[])
      : [];
  // hiddenCategories was read at the top of the component (Rules of
  // Hooks). Tilly-driven category filter — chat sends a
  // hideCategoryFromSpend tool, server writes the pref, this screen
  // reads it and filters.
  const hidden = Array.isArray(hiddenCategories) ? hiddenCategories : [];
  const visibleDiscretionary = safeCategories.filter(
    (c) => !hidden.includes(c.name.toLowerCase()),
  );
  const visibleFixed = fixedObligations.filter(
    (c) => !hidden.includes(c.name.toLowerCase()),
  );
  // Horizon shows real outflow categories hanging from the line —
  // discretionary + fixed obligations EXCEPT transfers. Transfers
  // (money moved between own accounts) net to zero against the wallet
  // and don't belong in the "did the line hold?" visual. They still
  // appear in the "Money flow · fixed" section below as info.
  const horizonCategories: SpendCategory[] = [
    ...visibleDiscretionary,
    ...visibleFixed.filter((c) => c.name.toLowerCase() !== "transfers"),
  ]
    .sort((a, b) => b.amt - a.amt)
    .slice(0, 8);
  const showHorizon = horizon && range !== "week";
  // Prefer the server's periodLabel ("May 2026" / "2025") so navigating
  // backwards shows the right month name. Falls back to the current
  // month / "year-to-date" while the first response hasn't loaded yet.
  const periodLabel =
    "periodLabel" in live && typeof live.periodLabel === "string"
      ? live.periodLabel
      : null;
  const rangeLabel = periodLabel
    ? periodLabel.toUpperCase()
    : range === "year"
      ? "YEAR-TO-DATE"
      : new Date().toLocaleString("en-US", { month: "long" }).toUpperCase();
  const goPrev = () => setOffset((o) => Math.max(o - 1, -23));
  const goNext = () => setOffset((o) => Math.min(o + 1, 0));
  const canGoNext = offset < 0;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 22, paddingTop: 36, paddingBottom: 120, gap: 22 }}
        showsVerticalScrollIndicator={false}
      >
        {paycheck ? <PaycheckBanner t={t} paycheck={paycheck} /> : null}

        {/* Range segmented control — week / month / year. */}
        <View
          style={{
            flexDirection: "row",
            backgroundColor: t.surface,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: t.rule,
            padding: 4,
            alignSelf: "flex-start",
          }}
        >
          {(["week", "month", "year"] as const).map((r) => {
            const active = r === range;
            return (
              <Pressable
                key={r}
                onPress={() => setRange(r)}
                accessibilityRole="button"
                accessibilityLabel={`Show ${r}`}
                style={{
                  paddingVertical: 6,
                  paddingHorizontal: 14,
                  borderRadius: 999,
                  backgroundColor: active ? t.accent : "transparent",
                }}
              >
                <Text
                  style={{
                    color: active ? t.surface : t.ink,
                    fontFamily: BTFonts.sans,
                    fontSize: 12,
                    fontWeight: "700",
                    letterSpacing: 0.3,
                    textTransform: "capitalize",
                  }}
                >
                  {r}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {showHorizon && horizon ? (
          <>
            <HorizonHeader
              t={t}
              rangeLabel={rangeLabel}
              verdict={horizon.verdict}
              onPrev={goPrev}
              onNext={goNext}
              canGoNext={canGoNext}
            />
            <HorizonSurplus
              t={t}
              surplus={horizon.surplus}
              weatherLabel={horizon.verdict.weatherLabel}
            />
            {/* Score dots only on the month view. The year view used to
                render a 0/10 next to the verdict pill which read as
                public shaming — exactly what Tilly's supposed to avoid.
                The year now leads with the trend + the corrected real
                burn instead. */}
            {range === "month" ? (
              <ScoreDots t={t} score={horizon.verdict.score} tone={horizon.verdict.tone} />
            ) : null}
            {range === "month" ? (
              <HorizonPanel t={t} horizon={horizon} categories={horizonCategories} />
            ) : null}
            {range === "year" && horizon.monthlyHistory ? (
              <HorizonYearList t={t} months={horizon.monthlyHistory} />
            ) : null}
            {range === "month" && horizon.sixMonthAvgSavingsRate !== undefined ? (
              <SixMonthCompare
                t={t}
                savingsRate={horizon.savingsRate}
                avg={horizon.sixMonthAvgSavingsRate}
                tone={horizon.verdict.tone}
              />
            ) : null}
            <Text
              style={{
                color: t.inkSoft,
                fontFamily: BTFonts.serifItalic,
                fontSize: 15,
                lineHeight: 23,
              }}
            >
              {horizon.verdict.closingLine}
            </Text>
          </>
        ) : (
          <>
            <WeekNavHeader
              t={t}
              label={periodLabel ?? "This week's pattern"}
              onPrev={goPrev}
              onNext={goNext}
              canGoNext={canGoNext}
            />
            <View style={{ gap: 8 }}>
              {/* Lead with today's actual state when viewing the current
                  week — yesterday's transactions often post overnight, so
                  a bare "$57 spent" headline read as "you spent $57 right
                  now" when nothing had actually been bought today. The
                  split makes the temporal context explicit: today is its
                  own number, the week is its own number. The soft-spot
                  clause is appended as a quieter pattern note, not the
                  lead. */}
              {(() => {
                const todayAmt = safeBars.find((b) => b.today)?.amt ?? 0;
                const isCurrent = offset === 0;
                // Fresh Sunday-rollover edge case: current week with no
                // spend at all. Showing "Nothing today. $0 this week."
                // double-anchors on zero in a way that reads broken;
                // collapse to a single quiet line.
                if (isCurrent && spent === 0 && todayAmt === 0) {
                  return (
                    <BTSerif size={30} color={t.ink} weight="500">
                      Nothing yet this week.
                    </BTSerif>
                  );
                }
                const todayClause = isCurrent
                  ? todayAmt === 0
                    ? "Nothing today"
                    : `$${todayAmt.toLocaleString()} today`
                  : null;
                const weekClause = isCurrent
                  ? `$${spent.toLocaleString()} this week`
                  : `$${spent.toLocaleString()} that week`;
                return (
                  <BTSerif size={30} color={t.ink} weight="500">
                    {todayClause ? `${todayClause}. ` : ""}
                    {weekClause}.
                    {italicSpan ? (
                      <>
                        {" "}
                        <Text style={{ color: t.accent, fontFamily: BTFonts.serifItalic }}>
                          {italicSpan}
                        </Text>{" "}
                        {isCurrent ? "take the most." : "took the most."}
                      </>
                    ) : null}
                  </BTSerif>
                );
              })()}
            </View>

            <BTCard t={t} padding={20}>
              <DayBars t={t} bars={safeBars} />
            </BTCard>
          </>
        )}

        {/* Income breakdown — "Where it comes from". Lives ABOVE
            spend so the flow reads top-to-bottom: money in → money out.
            Hidden when there's no recognised income in the period. */}
        {incomeSources.length > 0 ? (
          <View style={{ gap: 10 }}>
            <BTLabel color={t.inkMute}>
              Where it comes from{" "}
              {range === "week" ? "this week" : range === "month" ? "this month" : "this year"}
            </BTLabel>
            {incomeSources.map((c) => (
              <CategoryRow key={`income-${c.id}`} c={c} t={t} variant="income" />
            ))}
          </View>
        ) : null}

        {/* Category breakdown — always rendered, regardless of range.
            On month/year the Horizon panel shows TRUNCATED bar labels
            ("subsc…", "restau…"), so users need this drill-into list
            below to answer "where did the money actually go?" The
            "Where it goes" + "Money flow · fixed" split is the same
            for all ranges — labels just shift with range. */}
        <View style={{ gap: 10 }}>
          <BTLabel color={t.inkMute}>Where it goes</BTLabel>
          {visibleDiscretionary.length > 0 ? (
            visibleDiscretionary.map((c) => (
              <CategoryRow key={c.id} c={c} t={t} />
            ))
          ) : (
            <Text
              style={{
                color: t.inkMute,
                fontFamily: BTFonts.sans,
                fontSize: 12,
                fontStyle: "italic",
              }}
            >
              No discretionary spend{" "}
              {range === "week" ? "this week." : range === "month" ? "this month." : "this year."}
            </Text>
          )}
        </View>

        {visibleFixed.length > 0 ? (
          <View style={{ gap: 10 }}>
            <BTLabel color={t.inkMute}>
              Money flow · fixed{" "}
              {range === "week" ? "this week" : range === "month" ? "this month" : "this year"}
            </BTLabel>
            {visibleFixed.map((c) => (
              <CategoryRow key={`fixed-${c.id}`} c={c} t={t} />
            ))}
            <Text
              style={{
                color: t.inkMute,
                fontFamily: BTFonts.sans,
                fontSize: 11,
                fontStyle: "italic",
              }}
            >
              These don't count toward your spend total above — they're
              debt service, taxes, fees, and money moved between your own
              accounts.
            </Text>
          </View>
        ) : null}

        {hiddenCategories.length > 0 ? (
          <Pressable
            onPress={() => setMemoryOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Open Memory to see and undo Tilly's changes"
            style={{ marginTop: -4 }}
          >
            <Text
              style={{
                color: t.inkMute,
                fontFamily: BTFonts.sans,
                fontSize: 11,
                fontStyle: "italic",
              }}
            >
              Hidden by Tilly: {hiddenCategories.join(", ")}.{" "}
              <Text style={{ color: t.accent, fontWeight: "700" }}>
                Tap to undo →
              </Text>
            </Text>
          </Pressable>
        ) : null}

        {activeSubs.length > 0 ? (
          <View style={{ gap: 10 }}>
            <BTLabel color={t.inkMute}>Subscriptions</BTLabel>
            <BTCard t={t} alt padding={14} style={{ gap: 12 }}>
              {activeSubs.map((s) => (
                <View key={s.id} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: t.ink, fontFamily: BTFonts.sans, fontWeight: "600", fontSize: 13 }}>
                      {s.merchant}
                    </Text>
                    <Text
                      style={{
                        color: t.inkMute,
                        fontFamily: BTFonts.mono,
                        fontSize: 10,
                        letterSpacing: 1,
                        textTransform: "uppercase",
                        marginTop: 2,
                      }}
                    >
                      ${s.amount.toFixed(2)} · {s.cadence}
                      {s.usageNote ? ` · ${s.usageNote}` : ""}
                    </Text>
                  </View>
                  {s.cancelLink ? (
                    <Pressable
                      onPress={() => Linking.openURL(s.cancelLink!.url).catch(() => {})}
                      accessibilityRole="button"
                      accessibilityLabel={`${s.cancelLink.verb} ${s.merchant}`}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: t.rule,
                      }}
                    >
                      <Text style={{ color: t.ink, fontFamily: BTFonts.sans, fontSize: 11, fontWeight: "600", textTransform: "capitalize" }}>
                        {s.cancelLink.verb} →
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </BTCard>
          </View>
        ) : null}

        {pendingSplits.length > 0 ? (
          <View style={{ gap: 10 }}>
            <BTLabel color={t.inkMute}>Pending splits</BTLabel>
            <BTCard t={t} alt padding={14} style={{ gap: 12 }}>
              {pendingSplits.slice(0, 3).map((s) => (
                <View key={s.id} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: t.ink, fontFamily: BTFonts.sans, fontWeight: "600", fontSize: 13 }}>
                      {s.summary}
                    </Text>
                    <Text
                      style={{
                        color: t.inkMute,
                        fontFamily: BTFonts.mono,
                        fontSize: 10,
                        letterSpacing: 1,
                        textTransform: "uppercase",
                        marginTop: 2,
                      }}
                    >
                      {s.metadata?.region === "CA" ? "interac" : "venmo"} ·{" "}
                      {new Date(s.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => settle.mutate(s.id)}
                    disabled={settle.isPending}
                    accessibilityRole="button"
                    accessibilityLabel="Mark settled"
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: t.rule,
                    }}
                  >
                    <Text style={{ color: t.ink, fontFamily: BTFonts.sans, fontSize: 11, fontWeight: "600" }}>
                      Mark paid
                    </Text>
                  </Pressable>
                </View>
              ))}
            </BTCard>
          </View>
        ) : null}

        {todayLedger.length > 0 ? (
          <View style={{ gap: 10 }}>
            <BTLabel color={t.inkMute}>Today</BTLabel>
            <BTCard t={t} alt padding={14} style={{ gap: 10 }}>
              {todayLedger.slice(0, 3).map((r) => (
                <View
                  key={r.id}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: t.ink, fontFamily: BTFonts.sans, fontWeight: "600", fontSize: 13 }}>
                      {r.who}
                    </Text>
                    <Text
                      style={{
                        color: t.inkMute,
                        fontFamily: BTFonts.mono,
                        fontSize: 10,
                        letterSpacing: 1,
                        textTransform: "uppercase",
                        marginTop: 2,
                      }}
                    >
                      {r.cat} · {r.time}
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontFamily: BTFonts.serif,
                      fontSize: 18,
                      color: t.ink,
                    }}
                  >
                    −${r.amt.toFixed(2)}
                  </Text>
                </View>
              ))}
            </BTCard>
          </View>
        ) : null}
      </ScrollView>
      <FAB onPress={() => setAddOpen(true)} t={t} onSplit={() => openSplit()} />
      <AddExpenseModal visible={addOpen} onClose={() => setAddOpen(false)} />
      <SplitModal
        visible={splitOpen}
        onClose={() => setSplitOpen(false)}
        prefillAmount={splitPrefill.amount}
        prefillLabel={splitPrefill.label}
      />
      <MemoryInspector
        visible={memoryOpen}
        onClose={() => setMemoryOpen(false)}
        initialTab="settings"
        onPrefillCompose={(seed) => {
          // Spend lives on a different tab from Tilly's chat composer,
          // so we can't stage the seed in a visible composer the way
          // BTGuardian does. Send it directly through the chat path —
          // the inverse tool fires, /api/user-prefs invalidates, and
          // the Spend page rerenders without the user. Toast confirms.
          setMemoryOpen(false);
          tilly.send(seed);
          setUndoToast("Asked Tilly to undo. Watch the Spend page update.");
          setTimeout(() => setUndoToast(null), 3500);
        }}
      />
      {undoToast ? (
        <View
          style={{
            position: "absolute",
            bottom: 90,
            left: 22,
            right: 22,
            backgroundColor: t.ink,
            borderRadius: 14,
            padding: 14,
          }}
          pointerEvents="none"
        >
          <Text
            style={{
              color: t.bg,
              fontFamily: BTFonts.sans,
              fontSize: 13,
              fontWeight: "600",
              textAlign: "center",
            }}
          >
            {undoToast}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// ── CategoryRow ─────────────────────────────────────────────────────────────
// Tappable row that collapses by default and expands to show each transaction
// inside the category. Solves the "other: $369 — but what is it??" problem.

function CategoryRow({
  c,
  t,
  variant,
}: {
  c: SpendCategory;
  t: BTTheme;
  /** "income" tints the card a mild green to match the horizon green
   * tone (signals inflow at a glance) and flips the amount sign to a
   * "+" prefix. Defaults to "spend" otherwise. */
  variant?: "spend" | "income";
}) {
  const [open, setOpen] = useState(false);
  const hueColor =
    c.hue === "accent"
      ? t.accent
      : c.hue === "accent2"
      ? t.accent2
      : c.hue === "good"
      ? t.good
      : c.hue === "warn"
      ? t.warn
      : t.inkSoft;

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((v) => !v);
  };
  const isIncome = variant === "income";
  // Background tint for income rows — mild green at low alpha to match
  // the horizon sky tone without competing for attention against the
  // spend cards. `1f` (12%) was the lowest value that still reads as
  // distinct on the bloom + dusk themes.
  const bg = isIncome
    ? `${t.good}1f`
    : c.softSpot
      ? t.accentSoft
      : t.surface;

  return (
    <Pressable
      onPress={toggle}
      accessibilityRole="button"
      accessibilityLabel={`${c.name} — $${c.amt}. Tap to ${open ? "collapse" : "expand"}`}
      style={({ pressed }) => ({
        backgroundColor: bg,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: t.rule,
        overflow: "hidden",
        opacity: pressed ? 0.9 : 1,
      })}
    >
      {/* ── Summary row ── */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14 }}>
        <View style={{ width: 8, height: 40, borderRadius: 4, backgroundColor: hueColor }} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ color: t.ink, fontFamily: BTFonts.sans, fontWeight: "700", fontSize: 14 }}>
              {c.name}
            </Text>
            {c.softSpot ? (
              <BTChip bg={t.accentSoft} fg={t.accent}>soft spot</BTChip>
            ) : null}
          </View>
          {c.context ? (
            <Text
              style={{ color: t.inkSoft, fontFamily: BTFonts.sans, fontSize: 11, marginTop: 3 }}
              numberOfLines={1}
            >
              {c.context}
            </Text>
          ) : null}
        </View>
        <View style={{ alignItems: "flex-end", gap: 2 }}>
          <BTNum size={24} color={isIncome ? t.good : t.ink}>
            {isIncome ? "+" : ""}${c.amt}
          </BTNum>
          <Text style={{ color: t.inkMute, fontFamily: BTFonts.mono, fontSize: 9 }}>
            {open ? "▲ less" : "▼ detail"}
          </Text>
        </View>
      </View>

      {/* ── Expanded drill-down ── */}
      {open && (c.transactions ?? []).length > 0 ? (
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: t.rule,
            paddingHorizontal: 14,
            paddingVertical: 10,
            gap: 10,
          }}
        >
          {(c.transactions ?? []).map((tx) => (
            <TxLine key={tx.id} tx={tx} t={t} />
          ))}
        </View>
      ) : null}

      {open && (c.transactions ?? []).length === 0 ? (
        <View style={{ borderTopWidth: 1, borderTopColor: t.rule, padding: 14 }}>
          <Text style={{ color: t.inkMute, fontFamily: BTFonts.sans, fontSize: 12 }}>
            No transaction details available from your bank for this category.
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function TxLine({ tx, t }: { tx: SpendTx; t: BTTheme }) {
  let dateLabel = tx.date;
  try {
    dateLabel = format(new Date(tx.date + "T12:00:00"), "MMM d");
  } catch {}
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <View style={{ flex: 1 }}>
        <Text
          style={{ color: t.ink, fontFamily: BTFonts.sans, fontWeight: "600", fontSize: 13 }}
          numberOfLines={1}
        >
          {tx.name}
        </Text>
        <Text
          style={{
            color: t.inkMute,
            fontFamily: BTFonts.mono,
            fontSize: 11,
            letterSpacing: 0.8,
            textTransform: "uppercase",
            marginTop: 2,
          }}
        >
          {dateLabel}
        </Text>
      </View>
      <Text style={{ color: t.ink, fontFamily: BTFonts.serif, fontSize: 16 }}>
        −${tx.amt.toFixed(2)}
      </Text>
    </View>
  );
}

function FAB({
  onPress,
  onSplit,
  t,
}: {
  onPress: () => void;
  onSplit?: () => void;
  t: BTTheme;
}) {
  return (
    <View
      style={{
        position: "absolute",
        bottom: 18,
        right: 22,
        flexDirection: "row",
        gap: 10,
        alignItems: "center",
      }}
    >
      {onSplit ? (
        <Pressable
          onPress={onSplit}
          accessibilityRole="button"
          accessibilityLabel="Split a purchase"
          style={[
            {
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: t.surface,
              borderWidth: 1,
              borderColor: t.rule,
              alignItems: "center",
              justifyContent: "center",
            },
            Platform.select({
              web: { boxShadow: `0 4px 12px ${t.ink}22` } as any,
              default: {
                shadowColor: t.ink,
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.18,
                shadowRadius: 8,
              },
            }) as any,
          ]}
        >
          <Text style={{ color: t.ink, fontFamily: BTFonts.serif, fontSize: 18 }}>÷</Text>
        </Pressable>
      ) : null}
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Log a purchase"
        style={[
          {
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: t.accent,
            alignItems: "center",
            justifyContent: "center",
            elevation: 6,
          },
          Platform.select({
            web: { boxShadow: `0 4px 12px ${t.accent}66` } as any,
            default: {
              shadowColor: t.accent,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.4,
              shadowRadius: 12,
            },
          }) as any,
        ]}
      >
        <Text style={{ color: "#fff", fontSize: 28, lineHeight: 28, fontWeight: "300" }}>+</Text>
      </Pressable>
    </View>
  );
}


function DayBars({ t, bars }: { t: BTTheme; bars: DayBar[] }) {
  const max = Math.max(1, ...bars.map((b) => b.amt));
  // 12 bars (year) need tighter font + the abbreviated format. 4-7 bars
  // (month/week) have room for plain dollars.
  const useCompact = bars.length > 7;
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", height: 140 }}>
      {bars.map((b, i) => {
        const h = Math.max(4, (b.amt / max) * 100);
        const fill = b.today ? t.accent : b.soft ? t.accent2 : t.inkSoft;
        return (
          <View key={i} style={{ alignItems: "center", gap: 6, flex: 1 }}>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{
                color: t.inkMute,
                fontFamily: BTFonts.mono,
                fontSize: useCompact ? 9 : 11,
                letterSpacing: useCompact ? 0 : 1,
              }}
            >
              {useCompact ? compactDollar(b.amt) : `$${b.amt}`}
            </Text>
            <View style={{ width: 22, height: h, alignItems: "center", justifyContent: "flex-end" }}>
              <View
                style={{
                  width: 14,
                  height: h,
                  borderRadius: 7,
                  backgroundColor: fill,
                  opacity: b.today ? 1 : b.soft ? 0.85 : 0.55,
                }}
              />
              {b.today ? (
                <Animated.View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    bottom: -4,
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    borderWidth: 2,
                    borderColor: t.accent,
                    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.9] }),
                  }}
                />
              ) : null}
            </View>
            <Text
              style={{
                fontFamily: BTFonts.serif,
                fontSize: 13,
                color: b.today ? t.accent : t.inkSoft,
                fontWeight: b.today ? "700" : "400",
              }}
            >
              {b.d}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function PaycheckBanner({
  t,
  paycheck,
}: {
  t: BTTheme;
  paycheck: { amount: number; source: string; day: string; daysUntil: number };
}) {
  const slide = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(slide, {
        toValue: 1,
        duration: BT_SHIMMER_DURATION_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [slide]);

  const tx = slide.interpolate({ inputRange: [0, 1], outputRange: [-200, 400] });

  return (
    <View style={{ borderRadius: 18, overflow: "hidden", minHeight: 72 }}>
      <LinearGradient
        colors={[t.accent, t.accent2]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ padding: 16, flexDirection: "row", alignItems: "center", gap: 12 }}
      >
        <Text style={{ fontSize: 22, color: "#fff", opacity: 0.95 }}>✦</Text>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: "rgba(255,255,255,0.85)",
              fontFamily: BTFonts.mono,
              fontSize: 11,
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            {paycheck.day} lands
          </Text>
          <Text
            style={{
              color: "#fff",
              fontFamily: BTFonts.serif,
              fontSize: 18,
              fontWeight: "500",
            }}
          >
            {paycheck.source} +${paycheck.amount}
            {paycheck.daysUntil > 0 ? ` · in ${paycheck.daysUntil} day${paycheck.daysUntil === 1 ? "" : "s"}` : ""}
          </Text>
        </View>
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            width: 80,
            backgroundColor: "rgba(255,255,255,0.18)",
            transform: [{ translateX: tx }, { skewX: "-22deg" }],
          }}
        />
      </LinearGradient>
    </View>
  );
}

