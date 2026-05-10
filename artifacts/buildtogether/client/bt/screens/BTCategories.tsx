/**
 * BTCategories — YOU tab → Categories.
 *
 * Lists every category that's seen activity in the last 30 days with
 * its month total and a per-category "include in monthly spend" toggle.
 * Defaults: loans / taxes / transfers / fees are EXCLUDED (treated as
 * money flow); everything else is INCLUDED. Toggling fires the
 * setCategoryInclusion tool through the same dispatcher chat uses, so
 * the screen and chat stay consistent.
 *
 * The Lincoln car-loan use case lives here: tap loans → toggle ON →
 * Spend headline now includes Lincoln + interest charges. No chat
 * round-trip needed.
 */
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useBT } from "../BTContext";
import { btApi } from "../api/client";
import { BTLabel, BTRule, BTSerif } from "../atoms";
import { BTFonts } from "../theme";

type Props = { onBack: () => void };

type CategoryRow = {
  name: string;
  monthTotal: number;
  transactionCount: number;
  includeInSpend: boolean;
  isDefaultFixed: boolean;
  hasOverride: boolean;
};

export function BTCategories({ onBack }: Props) {
  const { t } = useBT();
  const qc = useQueryClient();

  const cats = useQuery({
    queryKey: ["/api/tilly/categories"],
    queryFn: btApi.categories,
    staleTime: 30_000,
  });

  const toggle = useMutation({
    mutationFn: (vars: { category: string; includeInSpend: boolean }) =>
      btApi.runTool("setCategoryInclusion", vars),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/tilly/categories"] });
      qc.invalidateQueries({ queryKey: ["/api/tilly/spend-pattern"] });
      qc.invalidateQueries({ queryKey: ["/api/tilly/today"] });
      qc.invalidateQueries({ queryKey: ["/api/user-prefs"] });
    },
  });

  const list = (cats.data?.categories ?? []) as CategoryRow[];
  const included = list.filter((c) => c.includeInSpend);
  const excluded = list.filter((c) => !c.includeInSpend);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      {/* Header */}
      <View
        style={{
          paddingTop: 56,
          paddingHorizontal: 22,
          paddingBottom: 18,
          borderBottomWidth: 1,
          borderBottomColor: t.rule,
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 12,
        }}
      >
        <View style={{ flex: 1 }}>
          <BTLabel color={t.inkMute}>You · last 30 days</BTLabel>
          <BTSerif size={26} color={t.ink} weight="500" style={{ marginTop: 6 }}>
            Categories.
          </BTSerif>
        </View>
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={{
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderRadius: 999,
            backgroundColor: t.surface,
            borderWidth: 1,
            borderColor: t.rule,
          }}
        >
          <Text style={{ color: t.ink, fontFamily: BTFonts.sans, fontSize: 12, fontWeight: "700" }}>
            Done
          </Text>
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 22, paddingBottom: 40, gap: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <Text
          style={{
            color: t.inkSoft,
            fontFamily: BTFonts.serifItalic,
            fontSize: 14,
            lineHeight: 21,
          }}
        >
          What counts toward your monthly spend total. Loans, taxes,
          transfers, and fees default to "money flow only" — but you can
          toggle anything in or out below.
        </Text>

        {cats.isLoading ? (
          <View style={{ alignItems: "center", paddingVertical: 24 }}>
            <ActivityIndicator color={t.accent} />
          </View>
        ) : list.length === 0 ? (
          <Text
            style={{
              color: t.inkSoft,
              fontFamily: BTFonts.serifItalic,
              fontSize: 16,
            }}
          >
            No categories yet. Once your synced transactions land, every
            category that's seen activity in the last 30 days will show
            up here.
          </Text>
        ) : (
          <>
            <Section
              title="Counted in monthly spend"
              caption={`${included.length} categor${included.length === 1 ? "y" : "ies"}`}
              rows={included}
              t={t}
              onToggle={(cat, next) =>
                toggle.mutate({ category: cat.name, includeInSpend: next })
              }
              pending={toggle.isPending ? toggle.variables?.category : undefined}
            />
            <Section
              title="Money flow only"
              caption={`${excluded.length} categor${excluded.length === 1 ? "y" : "ies"}`}
              rows={excluded}
              t={t}
              onToggle={(cat, next) =>
                toggle.mutate({ category: cat.name, includeInSpend: next })
              }
              pending={toggle.isPending ? toggle.variables?.category : undefined}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Section({
  title,
  caption,
  rows,
  t,
  onToggle,
  pending,
}: {
  title: string;
  caption: string;
  rows: CategoryRow[];
  t: any;
  onToggle: (cat: CategoryRow, next: boolean) => void;
  pending?: string;
}) {
  if (rows.length === 0) return null;
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
        <BTLabel color={t.inkMute}>{title}</BTLabel>
        <Text style={{ color: t.inkMute, fontFamily: BTFonts.mono, fontSize: 10 }}>
          {caption}
        </Text>
      </View>
      <View
        style={{
          backgroundColor: t.surface,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: t.rule,
          overflow: "hidden",
        }}
      >
        {rows.map((row, i) => (
          <React.Fragment key={row.name}>
            {i > 0 ? <BTRule color={t.rule} /> : null}
            <Row row={row} t={t} onToggle={onToggle} pending={pending === row.name} />
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

function Row({
  row,
  t,
  onToggle,
  pending,
}: {
  row: CategoryRow;
  t: any;
  onToggle: (cat: CategoryRow, next: boolean) => void;
  pending: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 14,
        paddingVertical: 12,
        gap: 10,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.ink, fontFamily: BTFonts.serif, fontSize: 16, textTransform: "capitalize" }}>
          {row.name}
        </Text>
        <Text
          style={{
            color: t.inkMute,
            fontFamily: BTFonts.mono,
            fontSize: 10,
            marginTop: 3,
          }}
        >
          ${Math.round(row.monthTotal).toLocaleString()} · {row.transactionCount} tx
          {row.hasOverride ? " · custom" : row.isDefaultFixed ? " · default money-flow" : ""}
        </Text>
      </View>
      <Switch
        value={row.includeInSpend}
        onValueChange={(next) => onToggle(row, next)}
        disabled={pending}
        trackColor={{ false: t.rule, true: t.accent }}
        thumbColor={row.includeInSpend ? t.surface : t.surface}
      />
    </View>
  );
}
