/**
 * BTSpend — pattern of the week. Spec §4.3.
 *
 * Not a ledger — a story of where money emotionally went. Paycheck shimmer
 * banner up top, day-bars in the middle, emotional category rows below.
 *
 * When the user hasn't connected a bank, we don't fake a Maya-shaped life.
 * The screen flips to a single connect-bank empty state instead.
 */
import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { useBT } from "../BTContext";
import { Tilly } from "../Tilly";
import { BT_SHIMMER_DURATION_MS, BTFonts, type BTTheme } from "../theme";
import { BTCard, BTChip, BTLabel, BTNum, BTSerif } from "../atoms";
import { useSpend } from "../hooks/useSpend";
import { useExpenses } from "../hooks/useExpenses";
import { AddExpenseModal } from "../AddExpenseModal";
import type { DayBar } from "../api/types";

export function BTSpend() {
  const { t } = useBT();
  const spend = useSpend();
  const expenses = useExpenses();
  const [addOpen, setAddOpen] = useState(false);
  const live = spend.data && spend.data.ready === true ? spend.data : null;
  const recent = expenses.data?.expenses ?? [];

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
        <FAB onPress={() => setAddOpen(true)} t={t} />
        <AddExpenseModal visible={addOpen} onClose={() => setAddOpen(false)} />
      </View>
    );
  }

  const { spent, italicSpan, bars, categories } = live;
  const headlineSpan = italicSpan ?? "this week";
  const todayLedger = "today" in live ? live.today : [];
  const paycheck = "paycheck" in live ? live.paycheck : null;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 22, paddingTop: 36, paddingBottom: 120, gap: 22 }}
        showsVerticalScrollIndicator={false}
      >
        {paycheck ? <PaycheckBanner t={t} paycheck={paycheck} /> : null}

        <View style={{ gap: 8 }}>
          <BTLabel color={t.inkMute}>This week's pattern</BTLabel>
          <BTSerif size={30} color={t.ink} weight="500">
            ${spent} spent.{" "}
            <Text style={{ color: t.accent, fontFamily: BTFonts.serifItalic }}>
              {headlineSpan}
            </Text>{" "}
            are still your soft spot.
          </BTSerif>
        </View>

        <BTCard t={t} padding={20}>
          <DayBars t={t} bars={bars} />
        </BTCard>

        <View style={{ gap: 10 }}>
          <BTLabel color={t.inkMute}>Where it goes</BTLabel>
          {categories.map((c) => {
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
            return (
              <View
                key={c.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  padding: 14,
                  borderRadius: 16,
                  backgroundColor: c.softSpot ? t.accentSoft : t.surface,
                  borderWidth: 1,
                  borderColor: t.rule,
                  overflow: "hidden",
                }}
              >
                <View style={{ width: 8, height: 40, borderRadius: 4, backgroundColor: hueColor }} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={{ color: t.ink, fontFamily: BTFonts.sans, fontWeight: "700", fontSize: 14 }}>
                      {c.name}
                    </Text>
                    {c.softSpot ? (
                      <BTChip bg={t.accentSoft} fg={t.accent}>
                        soft spot
                      </BTChip>
                    ) : null}
                  </View>
                  <Text
                    style={{
                      color: t.inkSoft,
                      fontFamily: BTFonts.sans,
                      fontSize: 12,
                      marginTop: 4,
                    }}
                  >
                    {c.context}
                  </Text>
                </View>
                <BTNum size={24} color={t.ink}>
                  ${c.amt}
                </BTNum>
              </View>
            );
          })}
        </View>

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
      <FAB onPress={() => setAddOpen(true)} t={t} />
      <AddExpenseModal visible={addOpen} onClose={() => setAddOpen(false)} />
    </View>
  );
}

function FAB({ onPress, t }: { onPress: () => void; t: BTTheme }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Log a purchase"
      style={[
        {
          position: "absolute",
          bottom: 18,
          right: 22,
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
  );
}

function DayBars({ t, bars }: { t: BTTheme; bars: DayBar[] }) {
  const max = Math.max(1, ...bars.map((b) => b.amt));
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
              style={{
                color: t.inkMute,
                fontFamily: BTFonts.mono,
                fontSize: 9,
                letterSpacing: 1,
              }}
            >
              ${b.amt}
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
              fontSize: 9,
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

