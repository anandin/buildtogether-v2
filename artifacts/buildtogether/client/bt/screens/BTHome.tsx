/**
 * BTHome — "Today" — spec §4.1 / design/screens.jsx BTHome.
 *
 * The morning briefing / night check-in. Built around a full-bleed sky
 * portrait at the top — gradient + drifting clouds + breathing 220px Tilly
 * — that sets the editorial-fintech tone before any numbers appear.
 *
 * Below the sky:
 *   "TILLY SAYS" → big serif greeting → Inter body line about the day
 *   Hero balance card (real numbers when ready, connect-bank empty state)
 *   Subscription + dream tiles when wired (real subscription = TODO Phase 5)
 *   Tilly invite pill
 *
 * The week strip and "Tilly Learned" card from the design land in a later
 * pass — both depend on real Plaid data we don't surface yet for empty
 * users, and showing them with mock content would re-introduce Maya's
 * hardcoded life. They're placeholders behind the connected-bank gate.
 */
import React, { useEffect, useRef, useState } from "react";
import { Alert, Animated, Easing, Pressable, ScrollView, TextInput, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { useBT } from "../BTContext";
import { Tilly } from "../Tilly";
import {
  BTSerif,
  BTLabel,
  BTCard,
  BTCurrency,
  BTStripes,
} from "../atoms";
import { BTFonts, BT_BREATHE_DURATION_MS, type BTTheme } from "../theme";
import { useToday } from "../hooks/useToday";
import {
  useTillyQuestions,
  useAnswerTillyQuestion,
  useDismissTillyQuestion,
} from "../hooks/useTillyQuestions";
import type { TillyQuestion } from "../api/types";
import { useDreams } from "../hooks/useDreams";
import { useUser } from "../hooks/useUser";
import { useExpenses } from "../hooks/useExpenses";
import { useSpend } from "../hooks/useSpend";
import { btApi } from "../api/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Text } from "react-native";
import { ShouldIBuyTile } from "../ShouldIBuyTile";
import { useTilly } from "../hooks/useTilly";

type Props = { onNav?: (route: BTRoute) => void };
export type BTRoute = "home" | "guardian" | "spend" | "credit" | "dreams" | "profile";

export function BTHome({ onNav }: Props) {
  const { t, tone } = useBT();
  const today = useToday();
  const dreams = useDreams();
  const { user } = useUser();
  const expenses = useExpenses();
  const spend = useSpend();
  // Sprint A — the "Should I buy this?" tile needs to be able to send
  // a prefilled question through chat and switch to the Tilly tab in
  // one move. Pulling useTilly() up here lets us call send() then nav,
  // so the user lands on Guardian to see Tilly's reply for the item
  // they just named.
  const tilly = useTilly();
  const openChatWithSeed = (seed: string) => {
    tilly.send(seed);
    onNav?.("guardian");
  };

  const today_ = today.data && today.data.ready === true ? today.data : null;
  // Three states matter on Home:
  //   - loading  : queries haven't resolved yet → show skeleton, never empty
  //   - hasMoneyData : real numbers landed → show hero numbers
  //   - else     : queries resolved but no data → show connect-bank empty
  // Conflating "loading" with "empty" caused a 6-10s flash where the user
  // saw "I'm getting ready" before their real numbers came in. Now any
  // query in flight on first mount blocks the empty branch.
  const isFirstLoad =
    today.isLoading || dreams.isLoading || spend.isLoading || expenses.isLoading;
  // hasMoneyData = "show the hero card, not the connect-your-bank
  // empty state." The server now returns bankConnected explicitly so
  // we don't infer it from a \$ amount being > 0 — that fell over
  // when monthly surplus clamped to \$0 (no detected income yet),
  // making the user think their bank had disconnected when it hadn't.
  // Falls back to the legacy heuristic when bankConnected is absent
  // (older API response).
  const hasMoneyData =
    !!today_ &&
    (today_.bankConnected === true ||
      (today_.afterRent ?? 0) > 0 ||
      (today_.breathing ?? 0) > 0 ||
      (today_.paycheckCopy ?? "").includes("this week") ||
      (today_.paycheckCopy ?? "").includes("earned"));
  const userName = user?.name?.split(" ")[0] || "there";

  const greeting = today_?.greeting ?? tone.greeting(userName);
  const invite = today_?.tillyInvite ?? "Anything you want to think through?";

  const firstDream =
    dreams.data && dreams.data.ready === true && dreams.data.dreams.length > 0
      ? dreams.data.dreams[0]
      : null;

  const spendLive = spend.data && spend.data.ready === true ? spend.data : null;

  // Tilly Learned actions: remind / dismiss. Both invalidate the memory
  // query so the observation either disappears (dismiss) or persists
  // with a new preference memory anchored to it (remind).
  const qc = useQueryClient();
  const learnedRemind = useMutation({
    mutationFn: btApi.remindLearned,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/tilly/memory"] }),
  });
  const learnedDismiss = useMutation({
    mutationFn: btApi.dismissLearned,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/tilly/memory"] }),
  });
  const learnedActed = learnedRemind.isSuccess || learnedDismiss.isSuccess;
  const recentExpenses = expenses.data?.expenses ?? [];
  const expenseTotalThisWeek = recentExpenses
    .filter((e) => {
      const d = new Date(e.date);
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      return d >= weekAgo;
    })
    .reduce((s, e) => s + e.amount, 0);

  // Days-of-the-week ahead with their meaning. The week-strip shows today
  // + the next 4 days. Pulls in scheduled reminders so a "remind me
  // Wednesday afternoon" turns into a labeled chip on that day's card —
  // before this, the strip was hardcoded and Wednesday looked empty even
  // when Tilly had clearly committed to a ping.
  const remindersAll = useQuery({
    queryKey: ["/api/tilly/reminders"],
    queryFn: btApi.reminders,
  });
  const forecast = today_?.forecast ?? [];
  const weekDays = nextFiveDays(remindersAll.data?.reminders ?? [], forecast);
  const monthly = today_?.monthly ?? null;
  const forwardLook = today_?.forwardLook ?? null;
  const monthName = (() => {
    const m = new Date().getMonth();
    return ["January","February","March","April","May","June","July","August","September","October","November","December"][m];
  })();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
    >
      <SkyPortrait t={t} />

      <View style={{ padding: 22, gap: 22 }}>
        <View style={{ gap: 8 }}>
          <BTLabel color={t.accent}>Tilly says</BTLabel>
          <BTSerif size={32} color={t.ink} weight="500" style={{ lineHeight: 38 }}>
            {greeting}{" "}
            {isFirstLoad ? (
              <Text style={{ color: t.inkMute }}>One sec — pulling your numbers…</Text>
            ) : hasMoneyData ? (
              <>
                This week is shaping up{" "}
                <Text style={{ color: t.accent, fontFamily: BTFonts.serifItalic }}>
                  gentle
                </Text>
                .
              </>
            ) : (
              <>
                I'm{" "}
                <Text style={{ color: t.accent, fontFamily: BTFonts.serifItalic }}>
                  getting ready
                </Text>{" "}
                to watch your money.
              </>
            )}
          </BTSerif>
          {!isFirstLoad ? (
            <Text
              style={{
                color: t.inkSoft,
                fontFamily: BTFonts.sans,
                fontSize: 14,
                lineHeight: 21,
                marginTop: 4,
              }}
            >
              {hasMoneyData
                ? // Forward-looking sub-line. Old "$X of breathing room.
                  // $Y earned · $Z spent · $W committed" was the
                  // doom-summary the user explicitly hated. The hero
                  // card below carries the numbers; this line just sets
                  // a quiet temporal anchor.
                  forwardLook
                  ? `Day ${forwardLook.daysIntoMonth} of ${forwardLook.daysInMonth}. Tilly's been watching.`
                  : (today_!.paycheckCopy ?? "")
                : "Connect your bank when you're ready and your real numbers light up here. Until then, ask me anything."}
            </Text>
          ) : null}
        </View>

        {isFirstLoad ? (
          <SkeletonHeroCard t={t} />
        ) : hasMoneyData ? (
          // Forecast-led hero. Old version led with a giant SURPLUS YTD
          // number that doom-summarized the month and then shamed with
          // "$X earned · $Y spent · $Z committed" — a budget-app
          // scoreboard. New version leads with where the month is
          // HEADING (projected close), shows the calm decomposition
          // underneath, and surfaces one specific actionable thing.
          <BTCard t={t} inverted padding={22} radius={18}>
            <BTStripes color={t.invertedFg} opacity={0.07} />
            {forwardLook ? (
              <>
                <Text
                  style={{
                    color: t.invertedFgMute,
                    fontFamily: BTFonts.mono,
                    fontSize: 11,
                    letterSpacing: 0.8,
                    textTransform: "uppercase",
                  }}
                >
                  {monthName.toUpperCase()} · {forwardLook.daysInMonth - forwardLook.daysIntoMonth} DAYS TO PAYDAY
                </Text>
                <View style={{ marginTop: 14 }}>
                  <BTCurrency
                    amount={forwardLook.projectedClose}
                    size={56}
                    color={
                      forwardLook.projectedClose >= 0 ? t.invertedFg : t.invertedFg
                    }
                  />
                </View>
                <Text
                  style={{
                    color: t.invertedFgMute,
                    fontFamily: BTFonts.serif,
                    fontSize: 13,
                    fontStyle: "italic",
                    marginTop: 4,
                  }}
                >
                  projected close · if pace holds
                </Text>

                <View style={{ marginTop: 18, gap: 8 }}>
                  {/* fixedSoFar = loans + taxes + fees + insurance +
                      subscriptions actually debited this month from
                      Plaid. The subscriptions table powers
                      recurringBaseLoad as a parallel signal (cadence
                      detection from Plaid's recurring endpoint) but
                      adding both double-counts the same subs charge.
                      Show actual debits. */}
                  <DecompRow
                    t={t}
                    label="recurring · already hit"
                    amount={forwardLook.fixedSoFar}
                    note={
                      forwardLook.fixedSoFar > 0
                        ? "subs, loans, taxes, insurance"
                        : "nothing fixed this month yet"
                    }
                  />
                  <DecompRow
                    t={t}
                    label="variable so far"
                    amount={forwardLook.variableSoFar}
                    note={
                      forwardLook.dailyPace > 0
                        ? `~$${forwardLook.dailyPace}/day discretionary`
                        : "nothing variable yet"
                    }
                  />
                  {monthly && monthly.committedRest > 0 ? (
                    <DecompRow
                      t={t}
                      label="ahead this month"
                      amount={monthly.committedRest}
                      note="known upcoming subs"
                    />
                  ) : null}
                </View>

                {forwardLook.leverageInsight ? (
                  <View
                    style={{
                      marginTop: 16,
                      paddingTop: 14,
                      borderTopWidth: 1,
                      borderTopColor: `${t.invertedFg}22`,
                      flexDirection: "row",
                      alignItems: "flex-start",
                      gap: 10,
                    }}
                  >
                    <Text
                      style={{
                        color: t.accent,
                        fontFamily: BTFonts.serif,
                        fontSize: 18,
                      }}
                    >
                      ↗
                    </Text>
                    <Text
                      style={{
                        color: t.invertedFg,
                        fontFamily: BTFonts.sans,
                        fontSize: 13,
                        lineHeight: 19,
                        flex: 1,
                      }}
                    >
                      {forwardLook.leverageInsight.text}
                    </Text>
                  </View>
                ) : null}
              </>
            ) : (
              // Older API response without forwardLook — render the
              // legacy "Available now" line so nothing breaks during
              // the rollout window.
              <>
                <BTLabel color={t.invertedFgMute}>Available now</BTLabel>
                <View style={{ marginTop: 14 }}>
                  <BTCurrency
                    amount={today_!.afterRent}
                    size={64}
                    color={t.invertedFg}
                  />
                </View>
                <Text
                  style={{
                    color: t.invertedFgMute,
                    fontFamily: BTFonts.sans,
                    fontSize: 12,
                    lineHeight: 17,
                    marginTop: 12,
                  }}
                >
                  {today_!.paycheckCopy}
                </Text>
              </>
            )}
          </BTCard>
        ) : (
          <BTCard t={t} inverted padding={22} radius={18}>
            <BTStripes color={t.invertedFg} opacity={0.07} />
            <BTLabel color={t.invertedFgMute}>Step one</BTLabel>
            <BTSerif size={26} color={t.invertedFg} weight="500" style={{ marginTop: 10, lineHeight: 32 }}>
              Connect your bank so I can{" "}
              <Text style={{ color: t.accent2, fontFamily: BTFonts.serifItalic }}>
                actually watch
              </Text>
              .
            </BTSerif>
            <Text
              style={{
                color: t.invertedFgMute,
                fontFamily: BTFonts.sans,
                fontSize: 13,
                marginTop: 12,
                lineHeight: 19,
              }}
            >
              One minute through Plaid and your real numbers light up here.
            </Text>
          </BTCard>
        )}

        {/* Sprint A — habit hook. Lives above the week strip, just
            below the hero/breathing-room card, because this is the
            single most important affordance for the core thesis: name
            what you're thinking about buying BEFORE the impulse fires.
            Hidden when both data states are loading so it doesn't
            flash in front of the skeleton. */}
        {!isFirstLoad ? (
          <ShouldIBuyTile onOpenChatPrefilled={openChatWithSeed} />
        ) : null}

        {/* Week strip — 5 horizontally scrolling day cards per design.
            Anchored to today; shows the next 4 days with whatever signal we
            have (paycheck date from today brief, manual expense rollups,
            etc). When we have no data, we render a calmer "this week is
            quiet so far" placeholder strip rather than absence. */}
        <View style={{ marginHorizontal: -22 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 22, gap: 8 }}
          >
            {weekDays.map((d, i) => (
              <DayCard key={i} t={t} day={d} />
            ))}
          </ScrollView>
        </View>

        {/* Tilly Learned card — surfaces the strongest soft-spot pattern
            once we have spend pattern data. Hidden during loading + when
            there's nothing to say. */}
        {!isFirstLoad && spendLive && spendLive.italicSpan ? (
          <BTCard t={t} padding={18} style={{ gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: t.accent,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>✦</Text>
              </View>
              <BTLabel color={t.accent}>Tilly learned</BTLabel>
              <View style={{ flex: 1 }} />
              <Text
                style={{
                  color: t.inkMute,
                  fontFamily: BTFonts.mono,
                  fontSize: 11,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                }}
              >
                this week
              </Text>
            </View>
            <BTSerif size={20} color={t.ink} weight="500" style={{ lineHeight: 26 }}>
              {spendLive.italicSpan} are still your{" "}
              <Text style={{ color: t.accent, fontFamily: BTFonts.serifItalic }}>
                soft spot
              </Text>
              .
            </BTSerif>
            <Text
              style={{
                color: t.inkSoft,
                fontFamily: BTFonts.sans,
                fontSize: 13,
                lineHeight: 20,
              }}
            >
              Want me to nudge you the night before?
            </Text>
            {learnedActed ? (
              <Text
                style={{
                  color: t.accent,
                  fontFamily: BTFonts.serifItalic,
                  fontSize: 14,
                  lineHeight: 20,
                }}
              >
                {learnedRemind.isSuccess
                  ? "Got it. I'll nudge you Tuesday night."
                  : "Okay, I'll let it ride."}
              </Text>
            ) : (
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable
                  onPress={() => learnedRemind.mutate()}
                  disabled={learnedRemind.isPending || learnedDismiss.isPending}
                  accessibilityRole="button"
                  accessibilityLabel="Yes, remind me"
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 999,
                    backgroundColor: t.ink,
                    opacity: learnedRemind.isPending ? 0.6 : 1,
                  }}
                >
                  <Text style={{ color: t.surface, fontFamily: BTFonts.sans, fontSize: 12, fontWeight: "600" }}>
                    {learnedRemind.isPending ? "Saving…" : "Yes, remind me"}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => learnedDismiss.mutate()}
                  disabled={learnedRemind.isPending || learnedDismiss.isPending}
                  accessibilityRole="button"
                  accessibilityLabel="Don't worry about it"
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: t.rule,
                    opacity: learnedDismiss.isPending ? 0.6 : 1,
                  }}
                >
                  <Text style={{ color: t.ink, fontFamily: BTFonts.sans, fontSize: 12, fontWeight: "600" }}>
                    {learnedDismiss.isPending ? "Hiding…" : "Don't worry about it"}
                  </Text>
                </Pressable>
              </View>
            )}
          </BTCard>
        ) : null}

        {/* Up Next — today's reminders Tilly is holding for the user.
            Replaces the old chat-thread "TILLY WILL PING YOU" strip
            (cluttered the conversation, didn't actually ping anyone).
            Hides when there's nothing scheduled today so it never
            adds empty-state noise. */}
        <UpNextCard onNav={onNav} />

        {!isFirstLoad && firstDream ? (
          <Pressable onPress={() => onNav?.("dreams")}>
            <BTCard t={t} alt padding={16}>
              <BTLabel color={t.inkMute} size={10}>
                {firstDream.name}
              </BTLabel>
              <BTSerif size={20} color={t.ink} style={{ marginTop: 8 }}>
                ${firstDream.saved.toLocaleString()} of ${firstDream.target.toLocaleString()}
              </BTSerif>
              <Text
                style={{
                  color: t.inkSoft,
                  fontFamily: BTFonts.sans,
                  fontSize: 12,
                  marginTop: 4,
                }}
              >
                {firstDream.weekly > 0
                  ? `+$${firstDream.weekly}/wk auto`
                  : "Tap to set up auto-save"}
              </Text>
              <View
                style={{
                  marginTop: 14,
                  height: 4,
                  backgroundColor: t.rule,
                  borderRadius: 999,
                  overflow: "hidden",
                }}
              >
                <LinearGradient
                  colors={[t.accent, t.accent2]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{
                    width: `${Math.min(100, Math.round((firstDream.saved / Math.max(1, firstDream.target)) * 100))}%`,
                    height: "100%",
                  }}
                />
              </View>
            </BTCard>
          </Pressable>
        ) : null}

        {/* Task #23: Tilly's open questions strip — only renders when the
            sync has surfaced something worth asking about. Tapping a chip
            opens the chat so the user can answer in conversation. */}
        <TillyQuestionsStrip t={t} onOpenChat={() => onNav?.("guardian")} />

        <Pressable
          onPress={() => onNav?.("guardian")}
          accessibilityRole="button"
          accessibilityLabel="Talk to Tilly"
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            padding: 12,
            borderRadius: 999,
            backgroundColor: t.surface,
            borderWidth: 1,
            borderColor: t.rule,
          }}
        >
          <Tilly t={t} size={28} breathing={false} />
          <Text
            style={{
              flex: 1,
              color: t.inkSoft,
              fontFamily: BTFonts.serifItalic,
              fontSize: 14,
            }}
          >
            "{invite}"
          </Text>
          <Text style={{ color: t.accent, fontSize: 18, fontFamily: BTFonts.serif }}>→</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

/**
 * SkeletonHeroCard — same shape as the real hero card, but with
 * shimmering placeholders instead of real numbers. Renders during the
 * first paint after sign-in / mount until queries settle, so the user
 * never sees a confident "Connect your bank" empty state when their
 * data is actually about to arrive.
 */
// One row of the forecast hero's decomposition. Three of these stack:
// recurring base, variable so far, ahead this month. Flat numbers, no
// bars or progress meters — this is a calm read, not a competition.
function DecompRow({
  t,
  label,
  amount,
  note,
}: {
  t: BTTheme;
  label: string;
  amount: number;
  note?: string;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10 }}>
      <Text
        style={{
          color: t.invertedFgMute,
          fontFamily: BTFonts.mono,
          fontSize: 10,
          letterSpacing: 0.7,
          textTransform: "uppercase",
          flex: 1,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          color: t.invertedFg,
          fontFamily: BTFonts.serif,
          fontSize: 17,
        }}
      >
        ${amount.toLocaleString()}
      </Text>
      {note ? (
        <Text
          style={{
            color: t.invertedFgMute,
            fontFamily: BTFonts.sans,
            fontSize: 11,
            fontStyle: "italic",
            width: 130,
            textAlign: "right",
          }}
          numberOfLines={1}
        >
          {note}
        </Text>
      ) : null}
    </View>
  );
}

function SkeletonHeroCard({ t }: { t: BTTheme }) {
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);
  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.7] });
  const Bar = ({ w, h = 14 }: { w: number | string; h?: number }) => (
    <Animated.View
      style={{
        width: w as any,
        height: h,
        borderRadius: h / 2,
        backgroundColor: t.invertedFgMute,
        opacity,
      }}
    />
  );
  return (
    <BTCard t={t} inverted padding={22} radius={18}>
      <BTStripes color={t.invertedFg} opacity={0.07} />
      <View style={{ gap: 14 }}>
        <Bar w={90} h={11} />
        <Bar w={"55%"} h={42} />
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Bar w={"60%"} h={12} />
          <Animated.View
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              backgroundColor: t.invertedFgMute,
              opacity,
            }}
          />
        </View>
      </View>
    </BTCard>
  );
}

type WeekDay = {
  d: string;
  n: string;
  label: string;
  amt?: string;
  mood: "today" | "watch" | "good" | "maybe" | "payday";
};

type ReminderRow = {
  id: string;
  label: string;
  kind: string;
  fireAt: string;
  status: "scheduled" | "fired" | "cancelled";
};

function nextFiveDays(
  reminders: ReminderRow[],
  forecast: Array<{ date: string; expected: number; reasons: string[]; paycheckIn?: number }>,
): WeekDay[] {
  const out: WeekDay[] = [];
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const now = new Date();
  const byDay = new Map<string, ReminderRow[]>();
  for (const r of reminders) {
    if (r.status !== "scheduled") continue;
    const fire = new Date(r.fireAt);
    if (isNaN(fire.getTime())) continue;
    const key = `${fire.getFullYear()}-${fire.getMonth()}-${fire.getDate()}`;
    const list = byDay.get(key) ?? [];
    list.push(r);
    byDay.set(key, list);
  }
  // Forecast keyed by YYYY-MM-DD. Forward day cards prefer forecast data
  // (real expected $ + a 1-line reason) over the previous hardcoded
  // "Look ahead" / "Paycheck +$612" placeholders.
  const forecastByDate = new Map<
    string,
    { expected: number; reasons: string[]; paycheckIn?: number }
  >();
  for (const f of forecast) {
    forecastByDate.set(f.date, {
      expected: f.expected,
      reasons: f.reasons,
      paycheckIn: f.paycheckIn,
    });
  }
  for (let i = 0; i < 5; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    const dow = d.getDay();
    const isToday = i === 0;
    const reminderKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const forecastKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const dayReminders = byDay.get(reminderKey) ?? [];
    const fc = forecastByDate.get(forecastKey);
    let mood: WeekDay["mood"] = "maybe";
    let label = "";
    let amt = "";
    if (isToday) {
      mood = "today";
      label = dayReminders.length > 0 ? dayReminders[0].label : "today";
      if (dayReminders.length > 1) {
        amt = `+${dayReminders.length - 1}`;
      }
    } else if (fc && fc.paycheckIn && fc.paycheckIn > 0) {
      // Payday wins over reminders + spend forecast — it's the one
      // forward-looking event worth knowing about. Show inflow as +$X.
      mood = "payday";
      label = "paycheck";
      amt = `+$${Math.round(fc.paycheckIn).toLocaleString()}`;
    } else if (dayReminders.length > 0) {
      mood = "watch";
      label = dayReminders[0].label;
      if (dayReminders.length > 1) amt = `+${dayReminders.length - 1}`;
    } else if (fc && fc.expected > 0) {
      mood =
        fc.reasons.some((r) => /typical/.test(r))
          ? "maybe"
          : fc.reasons.length > 0
            ? "watch"
            : "maybe";
      label = fc.reasons[0] ?? "look ahead";
      amt = `~$${fc.expected}`;
    } else if (i === 1) {
      mood = "maybe";
      label = "look ahead";
    }
    out.push({
      d: days[dow],
      n: String(d.getDate()).padStart(2, "0"),
      label,
      amt,
      mood,
    });
  }
  return out;
}

function DayCard({ t, day }: { t: BTTheme; day: WeekDay }) {
  const colors = {
    today: { bg: t.ink, fg: t.surface, accent: t.accent },
    watch: { bg: t.surface, fg: t.ink, accent: t.warn },
    good: { bg: t.accentSoft, fg: t.ink, accent: t.good },
    maybe: { bg: t.surface, fg: t.ink, accent: t.inkMute },
    // Payday: a tinted-good background so the inflow visually stands
    // apart from outflow days without screaming. Accent stays t.good
    // so the "+$X" reads as a positive event.
    payday: { bg: `${t.good}22`, fg: t.ink, accent: t.good },
  }[day.mood];
  return (
    <View
      style={{
        width: 110,
        padding: 12,
        borderRadius: 14,
        backgroundColor: colors.bg,
        borderWidth: 1,
        borderColor: t.rule,
        gap: 6,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
        <Text
          style={{
            color: colors.fg,
            opacity: 0.6,
            fontFamily: BTFonts.mono,
            fontSize: 10,
            letterSpacing: 1.2,
            textTransform: "uppercase",
            fontWeight: "700",
          }}
        >
          {day.d}
        </Text>
        <Text style={{ color: colors.fg, fontFamily: BTFonts.serif, fontSize: 18 }}>
          {day.n}
        </Text>
      </View>
      <Text
        style={{
          color: colors.fg,
          opacity: 0.78,
          fontFamily: BTFonts.sans,
          fontSize: 11,
          lineHeight: 15,
          minHeight: 30,
        }}
      >
        {day.label}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <View style={{ width: 5, height: 5, borderRadius: 999, backgroundColor: colors.accent }} />
        <Text style={{ color: colors.fg, fontFamily: BTFonts.sans, fontSize: 12, fontWeight: "600" }}>
          {day.amt || ""}
        </Text>
      </View>
    </View>
  );
}

/**
 * Sky portrait — full-bleed gradient hero per design/screens.jsx. Drifting
 * cloud blobs animate horizontally; a 220px Tilly anchored bottom-center
 * bleeds slightly into the next section for the "she's emerging" feel.
 */
function SkyPortrait({ t }: { t: BTTheme }) {
  const drift1 = useRef(new Animated.Value(0)).current;
  const drift2 = useRef(new Animated.Value(0)).current;
  const drift3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loops = [
      { v: drift1, dur: 22000, delay: 0 },
      { v: drift2, dur: 26000, delay: -3000 },
      { v: drift3, dur: 30000, delay: -6000 },
    ].map(({ v, dur, delay }) => {
      const loop = Animated.loop(
        Animated.timing(v, {
          toValue: 1,
          duration: dur,
          delay,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      );
      loop.start();
      return loop;
    });
    return () => loops.forEach((l) => l.stop());
  }, [drift1, drift2, drift3]);

  return (
    <View style={{ height: 280, position: "relative", overflow: "hidden" }}>
      <LinearGradient
        colors={[t.accent, t.accent2 ?? t.accent, t.surfaceAlt]}
        locations={[0, 0.55, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.7, y: 1 }}
        style={{ ...StyleSheetAbsoluteFill }}
      />

      {/* Sun/moon halo top-right */}
      <View
        style={{
          position: "absolute",
          top: 36,
          right: 36,
          width: 80,
          height: 80,
          borderRadius: 40,
          backgroundColor: t.bg,
          opacity: 0.45,
        }}
      />

      {/* Drifting clouds — three blurred ovals at staggered y positions */}
      {[
        { v: drift1, top: "20%", w: 220, h: 80 },
        { v: drift2, top: "44%", w: 260, h: 90 },
        { v: drift3, top: "62%", w: 200, h: 70 },
      ].map((c, i) => (
        <Animated.View
          key={i}
          pointerEvents="none"
          style={{
            position: "absolute",
            top: c.top as any,
            left: -120,
            width: c.w,
            height: c.h,
            borderRadius: c.h / 2,
            backgroundColor: t.bg,
            opacity: 0.18,
            transform: [
              {
                translateX: c.v.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-40, 480],
                }),
              },
            ],
          }}
        />
      ))}

      {/* Tilly anchor — bottom-center, breathing */}
      <View
        style={{
          position: "absolute",
          bottom: -20,
          left: 0,
          right: 0,
          alignItems: "center",
        }}
      >
        <BreathingTilly t={t} size={180} />
      </View>
    </View>
  );
}

function BreathingTilly({ t, size }: { t: BTTheme; size: number }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: BT_BREATHE_DURATION_MS / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: BT_BREATHE_DURATION_MS / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] });
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Tilly t={t} size={size} breathing={false} />
    </Animated.View>
  );
}

const StyleSheetAbsoluteFill = {
  position: "absolute" as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
};

/**
 * UpNextCard — today's reminders, compact. Shows up to 3; if more,
 * shows "+N more" pill that taps through to the full list on the You
 * tab. Each row supports tap-to-mark-done and a small × to dismiss
 * (cancel). Hides itself when there's nothing scheduled today so
 * Today never has an empty "no reminders" placeholder.
 *
 * Replaces the old chat-thread RemindersStrip — that strip lied
 * about pinging, took huge screen space, and surfaced duplicates.
 */
function UpNextCard({ onNav }: { onNav?: (r: BTRoute) => void }) {
  const { t } = useBT();
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["/api/tilly/reminders/today"],
    queryFn: btApi.remindersToday,
    staleTime: 60_000,
  });
  const done = useMutation({
    mutationFn: btApi.doneReminder,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/tilly/reminders/today"] });
      qc.invalidateQueries({ queryKey: ["/api/tilly/reminders"] });
    },
  });
  const snooze = useMutation({
    mutationFn: (id: string) => btApi.snoozeReminder(id, 60),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/tilly/reminders/today"] });
      qc.invalidateQueries({ queryKey: ["/api/tilly/reminders"] });
    },
  });
  const cancel = useMutation({
    mutationFn: btApi.cancelReminder,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/tilly/reminders/today"] });
      qc.invalidateQueries({ queryKey: ["/api/tilly/reminders"] });
    },
  });
  const reminders = list.data?.reminders ?? [];
  if (reminders.length === 0) return null;
  const visible = reminders.slice(0, 3);
  const overflow = reminders.length - visible.length;
  const fmt = (iso: string) => {
    const d = new Date(iso);
    const now = Date.now();
    const diffMs = d.getTime() - now;
    if (diffMs < 0) return "now";
    if (diffMs < 60 * 60 * 1000)
      return `in ${Math.max(1, Math.round(diffMs / 60000))} min`;
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  };
  return (
    <BTCard t={t} alt padding={16} style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <BTLabel color={t.inkMute} size={10}>
          Up next today
        </BTLabel>
        <View style={{ flex: 1 }} />
        {overflow > 0 ? (
          <Pressable
            onPress={() => onNav?.("profile")}
            accessibilityRole="button"
            accessibilityLabel={`${overflow} more reminders`}
          >
            <Text
              style={{
                color: t.accent,
                fontFamily: BTFonts.sans,
                fontSize: 11,
                fontWeight: "600",
              }}
            >
              +{overflow} more
            </Text>
          </Pressable>
        ) : null}
      </View>
      <View style={{ gap: 6 }}>
        {visible.map((r) => (
          <View
            key={r.id}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              padding: 10,
              borderRadius: 10,
              backgroundColor: t.surface,
            }}
          >
            <Pressable
              onPress={() => done.mutate(r.id)}
              disabled={done.isPending}
              accessibilityRole="button"
              accessibilityLabel={`Mark "${r.label}" done`}
              style={{
                width: 22,
                height: 22,
                borderRadius: 11,
                borderWidth: 1.5,
                borderColor: t.rule,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <View />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: t.ink,
                  fontFamily: BTFonts.serifItalic,
                  fontSize: 14,
                  lineHeight: 18,
                }}
                numberOfLines={2}
              >
                {r.label}
              </Text>
              <Text
                style={{
                  color: t.inkMute,
                  fontFamily: BTFonts.mono,
                  fontSize: 11,
                  letterSpacing: 0.6,
                  textTransform: "uppercase",
                  marginTop: 2,
                }}
              >
                {fmt(r.fireAt)}
              </Text>
            </View>
            <Pressable
              onPress={() => snooze.mutate(r.id)}
              disabled={snooze.isPending}
              accessibilityRole="button"
              accessibilityLabel={`Snooze "${r.label}" 1 hour`}
              style={{ paddingHorizontal: 6, paddingVertical: 4 }}
            >
              <Text style={{ color: t.inkMute, fontSize: 11, fontWeight: "600" }}>
                +1h
              </Text>
            </Pressable>
            <Pressable
              onPress={() => cancel.mutate(r.id)}
              disabled={cancel.isPending}
              accessibilityRole="button"
              accessibilityLabel={`Dismiss "${r.label}"`}
              style={{ paddingHorizontal: 4, paddingVertical: 4 }}
            >
              <Text style={{ color: t.inkMute, fontSize: 16 }}>×</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </BTCard>
  );
}

/**
 * Task #23 — TillyQuestionsStrip
 *
 * Renders up to 3 question chips when Tilly has open questions queued
 * from a recent sync. The chips are tap-to-dismiss; tapping the strip
 * opens chat so the user can answer in conversation. Renders nothing
 * when there are no open questions.
 */
function TillyQuestionsStrip({
  t,
  onOpenChat,
}: {
  t: BTTheme;
  onOpenChat: () => void;
}) {
  const q = useTillyQuestions();
  const dismiss = useDismissTillyQuestion();
  const answer = useAnswerTillyQuestion();
  const list: TillyQuestion[] = q.data?.questions ?? [];
  // Inline answer composer state: which question is open + the draft.
  // Tap a question to expand → type → submit fires the answer endpoint
  // and the question disappears from the strip on next refetch.
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>("");

  if (!list.length) return null;

  const submit = async (qq: TillyQuestion) => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    try {
      await answer.mutateAsync({ id: qq.id, answer: trimmed });
      setOpenId(null);
      setDraft("");
    } catch (err: any) {
      Alert.alert("Couldn't save your answer", err?.message ?? "Try again.");
    }
  };

  return (
    <View
      style={{
        backgroundColor: t.surface,
        borderWidth: 1,
        borderColor: t.rule,
        borderRadius: 16,
        padding: 14,
        gap: 10,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text
          style={{
            color: t.inkMute,
            fontFamily: BTFonts.mono,
            fontSize: 11,
            letterSpacing: 0.8,
            textTransform: "uppercase",
            fontWeight: "700",
            flex: 1,
          }}
        >
          Tilly has {list.length === 1 ? "a question" : `${list.length} questions`}
        </Text>
        <Pressable
          onPress={onOpenChat}
          accessibilityRole="button"
          accessibilityLabel="Open chat to answer"
          hitSlop={6}
        >
          <Text
            style={{
              color: t.accent,
              fontFamily: BTFonts.sans,
              fontSize: 11,
              fontWeight: "600",
            }}
          >
            Chat
          </Text>
        </Pressable>
      </View>
      <View style={{ gap: 6 }}>
        {list.map((qq) => {
          const expanded = openId === qq.id;
          return (
            <View key={qq.id} style={{ gap: 6 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: 8,
                }}
              >
                <Pressable
                  onPress={() => {
                    setDraft("");
                    setOpenId(expanded ? null : qq.id);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ expanded }}
                  accessibilityLabel={`Answer: ${qq.body}`}
                  style={({ pressed }) => ({
                    flex: 1,
                    paddingVertical: 9,
                    paddingHorizontal: 12,
                    borderRadius: 12,
                    backgroundColor: pressed ? t.chip : t.bg,
                    borderWidth: 1,
                    borderColor: expanded ? t.accent : t.rule,
                  })}
                >
                  <Text
                    style={{
                      color: t.ink,
                      fontFamily: BTFonts.serifItalic,
                      fontSize: 13.5,
                      lineHeight: 19,
                    }}
                  >
                    {qq.body}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => dismiss.mutate(qq.id)}
                  disabled={dismiss.isPending}
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss question"
                  hitSlop={8}
                  style={{ paddingVertical: 9, paddingHorizontal: 6 }}
                >
                  <Text style={{ color: t.inkMute, fontSize: 16 }}>×</Text>
                </Pressable>
              </View>
              {expanded ? (
                <View style={{ flexDirection: "row", gap: 6, alignItems: "flex-end" }}>
                  <TextInput
                    value={draft}
                    onChangeText={setDraft}
                    placeholder="Type a quick answer…"
                    placeholderTextColor={t.inkMute}
                    multiline
                    maxLength={500}
                    autoFocus
                    style={{
                      flex: 1,
                      color: t.ink,
                      fontFamily: BTFonts.sans,
                      fontSize: 13,
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: t.rule,
                      backgroundColor: t.bg,
                      minHeight: 40,
                      textAlignVertical: "top",
                    }}
                  />
                  <Pressable
                    onPress={() => submit(qq)}
                    disabled={!draft.trim() || answer.isPending}
                    accessibilityRole="button"
                    accessibilityLabel="Save answer"
                    style={({ pressed }) => ({
                      paddingVertical: 10,
                      paddingHorizontal: 14,
                      borderRadius: 999,
                      backgroundColor: t.ink,
                      opacity: !draft.trim() || answer.isPending ? 0.5 : pressed ? 0.85 : 1,
                    })}
                  >
                    <Text
                      style={{
                        color: t.surface,
                        fontFamily: BTFonts.sans,
                        fontSize: 12,
                        fontWeight: "700",
                      }}
                    >
                      {answer.isPending ? "Saving…" : "Save"}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}
