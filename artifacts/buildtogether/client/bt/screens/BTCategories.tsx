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
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
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
  /** "income"  → real take-home (paychecks)
   *  "adjustment" → transfers / cashback / credit_adjustment
   *  "spend"   → counted toward the spend headline by default
   *              (unless the user has toggled it to money-flow only) */
  kind?: "income" | "adjustment" | "spend";
  monthTotal: number;
  transactionCount: number;
  includeInSpend: boolean;
  isDefaultFixed: boolean;
  hasOverride: boolean;
};

export function BTCategories({ onBack }: Props) {
  const { t } = useBT();
  const qc = useQueryClient();
  const [drillCategory, setDrillCategory] = useState<string | null>(null);

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
  // Three-bucket split matching the server's cash-flow taxonomy:
  //   income      → real take-home
  //   adjustment  → wash transactions (transfers, cashback, credit_adjustment)
  //   spend       → everything else, subject to the include-in-spend toggle
  //                 (only this bucket can be toggled)
  const incomeRows = list.filter((c) => c.kind === "income");
  const adjustmentRows = list.filter((c) => c.kind === "adjustment");
  const spendRows = list.filter((c) => c.kind === "spend" || !c.kind);
  const included = spendRows.filter((c) => c.includeInSpend);
  const excluded = spendRows.filter((c) => !c.includeInSpend);
  const allCategoryNames = useMemo(() => list.map((c) => c.name), [list]);

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
          <BTLabel color={t.inkMute}>You · all synced transactions</BTLabel>
          <BTSerif size={26} color={t.ink} weight="500" style={{ marginTop: 6 }}>
            Categories · cash flow.
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
          Money in, money out, and the wash transactions in between. Tap
          any merchant to reclassify — a stray reimbursement can become
          a transfer, a points-back rebate can become cashback.
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
            {incomeRows.length > 0 ? (
              <Section
                title="Money in"
                caption={`${incomeRows.length} source${incomeRows.length === 1 ? "" : "s"}`}
                rows={incomeRows}
                t={t}
                onToggle={() => {}}
                onDrill={(cat) => setDrillCategory(cat.name)}
                pending={undefined}
                hideToggle
              />
            ) : null}
            {adjustmentRows.length > 0 ? (
              <Section
                title="Wash · adjustments"
                caption={`${adjustmentRows.length} categor${adjustmentRows.length === 1 ? "y" : "ies"} — neither spend nor income`}
                rows={adjustmentRows}
                t={t}
                onToggle={() => {}}
                onDrill={(cat) => setDrillCategory(cat.name)}
                pending={undefined}
                hideToggle
              />
            ) : null}
            <Section
              title="Counted in monthly spend"
              caption={`${included.length} categor${included.length === 1 ? "y" : "ies"}`}
              rows={included}
              t={t}
              onToggle={(cat, next) =>
                toggle.mutate({ category: cat.name, includeInSpend: next })
              }
              onDrill={(cat) => setDrillCategory(cat.name)}
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
              onDrill={(cat) => setDrillCategory(cat.name)}
              pending={toggle.isPending ? toggle.variables?.category : undefined}
            />
          </>
        )}
      </ScrollView>

      <CategoryDrillIn
        category={drillCategory}
        allCategories={allCategoryNames}
        onClose={() => setDrillCategory(null)}
      />
    </View>
  );
}

/**
 * CategoryDrillIn — full-screen modal listing every merchant whose
 * transactions are currently filed under this category, with a "Move
 * to…" picker per row. The picker writes through setMerchantCategory,
 * which retroactively updates every existing tx + linked expense and
 * persists a merchant_rules row so future syncs land in the new home.
 *
 * The picker accepts both existing categories and a custom string —
 * categories aren't a fixed enum server-side, so the user can type
 * "auto insurance" or "kids activities" if the suggested list doesn't
 * fit.
 */
function CategoryDrillIn({
  category,
  allCategories,
  onClose,
}: {
  category: string | null;
  allCategories: string[];
  onClose: () => void;
}) {
  const { t } = useBT();
  const qc = useQueryClient();
  const [picking, setPicking] = useState<{
    signature: string;
    displayName: string;
  } | null>(null);

  const merchants = useQuery({
    enabled: !!category,
    queryKey: ["/api/tilly/categories/merchants", category],
    queryFn: () => btApi.categoryMerchants(category as string),
    staleTime: 30_000,
  });

  const move = useMutation({
    mutationFn: (vars: {
      merchantSignature: string;
      category: string;
      retroactive: boolean;
    }) => btApi.runTool("setMerchantCategory", vars),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/tilly/categories"] });
      qc.invalidateQueries({ queryKey: ["/api/tilly/categories/merchants"] });
      qc.invalidateQueries({ queryKey: ["/api/tilly/spend-pattern"] });
      qc.invalidateQueries({ queryKey: ["/api/tilly/today"] });
      qc.invalidateQueries({ queryKey: ["/api/expenses"] });
      qc.invalidateQueries({ queryKey: ["/api/plaid/pending"] });
      qc.invalidateQueries({ queryKey: ["/api/plaid/pending-grouped"] });
      setPicking(null);
    },
  });

  const list = merchants.data?.merchants ?? [];

  return (
    <Modal
      visible={!!category}
      animationType="slide"
      onRequestClose={onClose}
      transparent={false}
    >
      <View style={{ flex: 1, backgroundColor: t.bg }}>
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
            <BTLabel color={t.inkMute}>Merchants in</BTLabel>
            <BTSerif size={26} color={t.ink} weight="500" style={{ marginTop: 6, textTransform: "capitalize" }}>
              {category}.
            </BTSerif>
          </View>
          <Pressable
            onPress={onClose}
            style={{
              padding: 8,
              borderRadius: 999,
              backgroundColor: t.surface,
              borderWidth: 1,
              borderColor: t.rule,
            }}
          >
            <Text style={{ color: t.ink, fontSize: 16, fontWeight: "600" }}>×</Text>
          </Pressable>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 22, paddingBottom: 40, gap: 12 }}
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
            Tap any merchant to move their transactions to a different
            category. Past charges get re-categorized too — and future
            charges from the same merchant land in the new home.
          </Text>

          {merchants.isLoading ? (
            <View style={{ alignItems: "center", paddingVertical: 24 }}>
              <ActivityIndicator color={t.accent} />
            </View>
          ) : list.length === 0 ? (
            <Text style={{ color: t.inkSoft, fontFamily: BTFonts.serifItalic, fontSize: 16 }}>
              Nothing in this category in the last 30 days.
            </Text>
          ) : (
            <View
              style={{
                backgroundColor: t.surface,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: t.rule,
                overflow: "hidden",
              }}
            >
              {list.map((m, i) => (
                <React.Fragment key={m.signature}>
                  {i > 0 ? <BTRule color={t.rule} /> : null}
                  <Pressable
                    onPress={() =>
                      setPicking({ signature: m.signature, displayName: m.displayName })
                    }
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      gap: 10,
                      backgroundColor: pressed ? t.chip : "transparent",
                    })}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          color: t.ink,
                          fontFamily: BTFonts.serif,
                          fontSize: 15,
                        }}
                        numberOfLines={1}
                      >
                        {m.displayName}
                      </Text>
                      <Text
                        style={{
                          color: t.inkMute,
                          fontFamily: BTFonts.mono,
                          fontSize: 10,
                          marginTop: 3,
                        }}
                      >
                        ${Math.round(m.monthTotal).toLocaleString()} · {m.count} tx
                      </Text>
                    </View>
                    <Text
                      style={{
                        color: t.accent,
                        fontFamily: BTFonts.sans,
                        fontSize: 11,
                        fontWeight: "700",
                        letterSpacing: 0.4,
                      }}
                    >
                      MOVE →
                    </Text>
                  </Pressable>
                </React.Fragment>
              ))}
            </View>
          )}
        </ScrollView>

        <CategoryPicker
          visible={!!picking}
          merchantDisplay={picking?.displayName ?? ""}
          currentCategory={category ?? ""}
          allCategories={allCategories}
          onCancel={() => setPicking(null)}
          onPick={(toCategory) => {
            if (!picking) return;
            move.mutate({
              merchantSignature: picking.signature,
              category: toCategory,
              retroactive: true,
            });
          }}
          working={move.isPending}
        />
      </View>
    </Modal>
  );
}

/**
 * Category picker bottom sheet. Shows existing categories as one-tap
 * options and a free-text input so the user can introduce a new
 * category on the spot ("auto insurance", "kids activities"). The
 * server doesn't enforce a fixed enum — categories are just strings on
 * plaid_transactions.our_category.
 */
function CategoryPicker({
  visible,
  merchantDisplay,
  currentCategory,
  allCategories,
  onCancel,
  onPick,
  working,
}: {
  visible: boolean;
  merchantDisplay: string;
  currentCategory: string;
  allCategories: string[];
  onCancel: () => void;
  onPick: (category: string) => void;
  working: boolean;
}) {
  const { t } = useBT();
  const [custom, setCustom] = useState("");

  const options = useMemo(() => {
    // Include the standard set so even an empty deployment offers them.
    // `income` + the three adjustment kinds (transfers, cashback,
    // credit_adjustment) are always present so the user can reclassify
    // a deposit out of income without having to type the category name
    // by hand. The server doesn't enforce an enum — these become first-
    // class ourCategory values once the user picks them.
    const defaults = [
      "income",
      "transfers",
      "cashback",
      "credit_adjustment",
      "groceries",
      "restaurants",
      "transport",
      "entertainment",
      "utilities",
      "subscriptions",
      "shopping",
      "health",
      "personal",
      "education",
      "kids",
      "travel",
      "loans",
      "insurance",
      "fees",
      "taxes",
      "other",
    ];
    const set = new Set<string>([...defaults, ...allCategories.map((c) => c.toLowerCase())]);
    set.delete(currentCategory.toLowerCase());
    return Array.from(set).sort();
  }, [allCategories, currentCategory]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable onPress={onCancel} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }} />
      <View
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: t.bg,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          paddingTop: 14,
          paddingBottom: 30,
          paddingHorizontal: 22,
          gap: 16,
          maxHeight: "80%",
        }}
      >
        <View style={{ alignItems: "center" }}>
          <View
            style={{
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: t.rule,
            }}
          />
        </View>
        <View>
          <BTLabel color={t.inkMute}>Move to</BTLabel>
          <BTSerif size={20} color={t.ink} weight="500" style={{ marginTop: 6 }}>
            {merchantDisplay}
          </BTSerif>
        </View>

        <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {options.map((opt) => (
              <Pressable
                key={opt}
                disabled={working}
                onPress={() => onPick(opt)}
                style={({ pressed }) => ({
                  paddingVertical: 8,
                  paddingHorizontal: 14,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: t.rule,
                  backgroundColor: pressed ? t.accentSoft : t.surface,
                })}
              >
                <Text
                  style={{
                    color: t.ink,
                    fontFamily: BTFonts.sans,
                    fontSize: 12,
                    fontWeight: "600",
                    textTransform: "capitalize",
                  }}
                >
                  {opt}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        <View style={{ gap: 8 }}>
          <BTLabel color={t.inkMute}>Or type a new one</BTLabel>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TextInput
              value={custom}
              onChangeText={setCustom}
              placeholder="e.g. auto insurance"
              placeholderTextColor={t.inkMute}
              autoCapitalize="none"
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: t.rule,
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 10,
                fontFamily: BTFonts.sans,
                fontSize: 14,
                color: t.ink,
                backgroundColor: t.surface,
              }}
            />
            <Pressable
              disabled={!custom.trim() || working}
              onPress={() => onPick(custom.trim().toLowerCase())}
              style={({ pressed }) => ({
                paddingVertical: 10,
                paddingHorizontal: 18,
                borderRadius: 12,
                backgroundColor: !custom.trim() ? t.rule : pressed ? t.accentSoft : t.accent,
                justifyContent: "center",
              })}
            >
              <Text
                style={{
                  color: !custom.trim() ? t.inkMute : t.surface,
                  fontFamily: BTFonts.sans,
                  fontSize: 12,
                  fontWeight: "700",
                  letterSpacing: 0.4,
                }}
              >
                MOVE
              </Text>
            </Pressable>
          </View>
        </View>

        <Pressable
          onPress={onCancel}
          disabled={working}
          style={{ alignSelf: "center", paddingVertical: 8 }}
        >
          <Text style={{ color: t.inkMute, fontFamily: BTFonts.sans, fontSize: 13 }}>
            Cancel
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}

function Section({
  title,
  caption,
  rows,
  t,
  onToggle,
  onDrill,
  pending,
  hideToggle,
}: {
  title: string;
  caption: string;
  rows: CategoryRow[];
  t: any;
  onToggle: (cat: CategoryRow, next: boolean) => void;
  onDrill: (cat: CategoryRow) => void;
  pending?: string;
  /** Income + adjustment rows have no meaningful "include in spend"
   * toggle (they're never spend) — hide the Switch in those sections. */
  hideToggle?: boolean;
}) {
  if (rows.length === 0) return null;
  // Income gets a mild green tint matching the Spend "Where it comes
  // from" section so the same money is colour-coded the same way
  // everywhere.
  const sectionBg =
    title === "Money in"
      ? `${t.good}1a`
      : t.surface;
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
          backgroundColor: sectionBg,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: t.rule,
          overflow: "hidden",
        }}
      >
        {rows.map((row, i) => (
          <React.Fragment key={row.name}>
            {i > 0 ? <BTRule color={t.rule} /> : null}
            <Row
              row={row}
              t={t}
              onToggle={onToggle}
              onDrill={onDrill}
              pending={pending === row.name}
              hideToggle={hideToggle}
            />
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
  onDrill,
  pending,
  hideToggle,
}: {
  row: CategoryRow;
  t: any;
  onToggle: (cat: CategoryRow, next: boolean) => void;
  onDrill: (cat: CategoryRow) => void;
  pending: boolean;
  hideToggle?: boolean;
}) {
  const isIncome = row.kind === "income";
  return (
    <Pressable
      onPress={() => onDrill(row)}
      accessibilityRole="button"
      accessibilityLabel={`Open ${row.name} merchants`}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 14,
        paddingVertical: 12,
        gap: 10,
        backgroundColor: pressed ? t.chip : "transparent",
      })}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.ink, fontFamily: BTFonts.serif, fontSize: 16, textTransform: "capitalize" }}>
          {row.name.replace(/_/g, " ")}
        </Text>
        <Text
          style={{
            color: isIncome ? t.good : t.inkMute,
            fontFamily: BTFonts.mono,
            fontSize: 10,
            marginTop: 3,
          }}
        >
          {isIncome ? "+" : ""}${Math.round(row.monthTotal).toLocaleString()} · {row.transactionCount} tx
          {row.hasOverride ? " · custom" : row.isDefaultFixed && !isIncome ? " · default money-flow" : ""}
        </Text>
      </View>
      {hideToggle ? null : (
        <Switch
          value={row.includeInSpend}
          onValueChange={(next) => onToggle(row, next)}
          disabled={pending}
          trackColor={{ false: t.rule, true: t.accent }}
          thumbColor={row.includeInSpend ? t.surface : t.surface}
        />
      )}
      <Text
        style={{
          color: t.inkMute,
          fontFamily: BTFonts.sans,
          fontSize: 18,
          marginLeft: 4,
        }}
      >
        ›
      </Text>
    </Pressable>
  );
}
