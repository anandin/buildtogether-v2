/**
 * Money habits — check in, see the streak, accept a suggestion from Tilly.
 */
import React, { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { useBT } from "../BTContext";
import { BTCard, BTLabel, BTSerif } from "../atoms";
import { BTFonts } from "../theme";
import {
  useAcceptHabitSuggestion,
  useArchiveHabit,
  useCheckInHabit,
  useCreateHabit,
  useHabits,
} from "../hooks/useHabits";

const STARTERS: Array<{ kind: string; title: string; cadence: "daily" | "weekly" }> = [
  { kind: "no_spend_day", title: "No-spend day", cadence: "daily" },
  { kind: "save_amount", title: "Save $25", cadence: "weekly" },
  { kind: "review_pending", title: "Review pending", cadence: "weekly" },
  { kind: "gratitude_spend", title: "Log a gratitude spend", cadence: "weekly" },
  { kind: "weekly_checkin", title: "Weekly money check-in", cadence: "weekly" },
];

export function BTHabits({ onBack }: { onBack: () => void }) {
  const { t } = useBT();
  const habits = useHabits();
  const checkIn = useCheckInHabit();
  const archive = useArchiveHabit();
  const create = useCreateHabit();
  const accept = useAcceptHabitSuggestion();
  const [custom, setCustom] = useState("");

  const list = habits.data?.habits ?? [];
  const suggestions = habits.data?.suggestions ?? [];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ padding: 22, paddingBottom: 120, gap: 18 }}
    >
      <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back to Today">
        <Text style={{ color: t.inkMute, fontFamily: BTFonts.sans, fontSize: 13 }}>← Today</Text>
      </Pressable>
      <View style={{ gap: 6 }}>
        <BTLabel color={t.accent}>Habits</BTLabel>
        <BTSerif size={32} color={t.ink} weight="500">
          Practices that hold.
        </BTSerif>
        <Text style={{ color: t.inkSoft, fontFamily: BTFonts.sans, fontSize: 14, lineHeight: 20 }}>
          Check in when you do the thing. Tilly keeps the streak and nudges when it slips.
        </Text>
      </View>

      {list.length === 0 ? (
        <BTCard t={t} padding={16}>
          <Text style={{ color: t.ink, fontFamily: BTFonts.serifItalic, fontSize: 16 }}>
            No habits yet. Pick one below — a single practice is enough.
          </Text>
        </BTCard>
      ) : (
        list.map((h) => {
          const rate = Math.round(h.weeklyCompletionRate * 100);
          return (
            <BTCard key={h.id} t={t} padding={16} style={{ gap: 10 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ color: t.ink, fontFamily: BTFonts.serif, fontSize: 18 }}>{h.title}</Text>
                  <Text style={{ color: t.inkMute, fontFamily: BTFonts.mono, fontSize: 11, letterSpacing: 0.6 }}>
                    {h.cadence.toUpperCase()} · STREAK {h.currentStreak} · WEEK {rate}%
                  </Text>
                </View>
                <Text style={{ color: h.due ? t.accent : t.inkMute, fontFamily: BTFonts.sans, fontSize: 12 }}>
                  {h.checkedInPeriod ? "Done" : "Open"}
                </Text>
              </View>
              {h.reason ? (
                <Text style={{ color: t.inkSoft, fontFamily: BTFonts.sans, fontSize: 13, lineHeight: 18 }}>
                  {h.reason}
                </Text>
              ) : null}
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable
                  onPress={() => checkIn.mutate(h.id)}
                  disabled={checkIn.isPending || h.checkedInPeriod}
                  accessibilityRole="button"
                  accessibilityLabel={`Check in ${h.title}`}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 999,
                    backgroundColor: t.ink,
                    opacity: h.checkedInPeriod ? 0.4 : 1,
                  }}
                >
                  <Text style={{ color: t.surface, fontFamily: BTFonts.sans, fontSize: 12, fontWeight: "700" }}>
                    {h.checkedInPeriod ? "Checked in" : "Check in"}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => archive.mutate(h.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Archive ${h.title}`}
                  style={{ paddingHorizontal: 12, paddingVertical: 8 }}
                >
                  <Text style={{ color: t.inkMute, fontFamily: BTFonts.sans, fontSize: 12 }}>Archive</Text>
                </Pressable>
              </View>
            </BTCard>
          );
        })
      )}

      {suggestions.length > 0 ? (
        <View style={{ gap: 10 }}>
          <BTLabel color={t.inkMute}>Tilly noticed</BTLabel>
          {suggestions.map((s) => (
            <BTCard key={s.kind} t={t} alt padding={14} style={{ gap: 8 }}>
              <Text style={{ color: t.ink, fontFamily: BTFonts.serif, fontSize: 16 }}>{s.title}</Text>
              <Text style={{ color: t.inkSoft, fontFamily: BTFonts.sans, fontSize: 13, lineHeight: 18 }}>{s.reason}</Text>
              <Pressable
                onPress={() => accept.mutate(s)}
                disabled={accept.isPending}
                accessibilityRole="button"
                accessibilityLabel={`Start ${s.title}`}
                style={{ alignSelf: "flex-start", paddingVertical: 6 }}
              >
                <Text style={{ color: t.accent, fontFamily: BTFonts.sans, fontSize: 13, fontWeight: "700" }}>
                  Start this
                </Text>
              </Pressable>
            </BTCard>
          ))}
        </View>
      ) : null}

      <View style={{ gap: 10 }}>
        <BTLabel color={t.inkMute}>Start one</BTLabel>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {STARTERS.map((s) => (
            <Pressable
              key={s.kind}
              onPress={() =>
                create.mutate({
                  title: s.title,
                  kind: s.kind,
                  cadence: s.cadence,
                  targetAmount: s.kind === "save_amount" ? 25 : null,
                  source: "user",
                })
              }
              accessibilityRole="button"
              accessibilityLabel={`Add ${s.title}`}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: t.rule,
                backgroundColor: t.surface,
              }}
            >
              <Text style={{ color: t.ink, fontFamily: BTFonts.sans, fontSize: 12 }}>{s.title}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <TextInput
            value={custom}
            onChangeText={setCustom}
            placeholder="Or name your own"
            placeholderTextColor={t.inkMute}
            accessibilityLabel="Custom habit name"
            style={{
              flex: 1,
              color: t.ink,
              fontFamily: BTFonts.sans,
              fontSize: 14,
              borderWidth: 1,
              borderColor: t.rule,
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 10,
              backgroundColor: t.surface,
            }}
          />
          <Pressable
            onPress={() => {
              const title = custom.trim();
              if (!title) return;
              create.mutate({ title, kind: "custom", cadence: "daily", source: "user" });
              setCustom("");
            }}
            accessibilityRole="button"
            accessibilityLabel="Add custom habit"
            style={{
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 999,
              backgroundColor: t.ink,
            }}
          >
            <Text style={{ color: t.surface, fontFamily: BTFonts.sans, fontSize: 12, fontWeight: "700" }}>Add</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}
