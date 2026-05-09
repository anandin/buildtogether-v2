/**
 * PendingTransactionsScreen — the Plaid review inbox.
 *
 * Plaid imports transactions in the background; the user decides which to
 * keep as expenses. Each row offers Accept (becomes a tracked expense and
 * disappears) or Ignore (hidden from the inbox forever).
 *
 * Empty state explains the mechanic so users who haven't connected Plaid
 * — or have, but nothing's queued — aren't confused.
 */
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { format } from "date-fns";

import { useBT } from "../../BTContext";
import { BTLabel, BTSerif } from "../../atoms";
import { BTFonts, type BTTheme } from "../../theme";
import { ScreenHeader } from "./_chrome";
import {
  usePlaidPending,
  usePlaidAccept,
  usePlaidIgnore,
  usePlaidSync,
  usePlaidItems,
  usePlaidPendingGrouped,
  usePlaidPendingGroupAccept,
  usePlaidPendingGroupIgnore,
} from "../../hooks/usePlaid";
import { PasskeyStaleBanner } from "./PasskeyStaleBanner";
import { usePasskeyGate } from "@/context/PasskeyGateContext";
import type { PlaidPendingTransaction, PendingGroup } from "../../api/types";

export function PendingTransactionsScreen({ onBack }: { onBack: () => void }) {
  const { t } = useBT();
  const pending = usePlaidPending({ silent: true });
  const grouped = usePlaidPendingGrouped();
  const items = usePlaidItems({ silent: true });
  const accept = usePlaidAccept();
  const ignore = usePlaidIgnore();
  const groupAccept = usePlaidPendingGroupAccept();
  const groupIgnore = usePlaidPendingGroupIgnore();
  const sync = usePlaidSync();
  const passkeyGate = usePasskeyGate();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyGroup, setBusyGroup] = useState<string | null>(null);

  const list = pending.data ?? [];
  const hasItems = (items.data ?? []).some((i) => i.status !== "disconnected");
  // Task #23: split grouped data into "real" multi-item groups (≥2) and
  // singletons. Multi groups render as bulk-accept cards; singletons fall
  // through to the existing per-row PendingRow so single-tap accept still
  // works. Falls back gracefully when the grouped endpoint is unavailable.
  const groups = grouped.data?.groups ?? [];
  const multiGroupSigs = new Set(groups.filter((g) => g.count >= 2).map((g) => g.signature));
  const multiGroups = groups.filter((g) => multiGroupSigs.has(g.signature));
  const singleRows = list.filter((row) => {
    const sig = row.signature;
    return !sig || !multiGroupSigs.has(sig);
  });

  const handleAccept = async (
    txn: PlaidPendingTransaction,
    context?: { note?: string | null; tags?: string[] | null },
  ) => {
    setBusyId(txn.id);
    try {
      if (context && (context.note || (context.tags && context.tags.length > 0))) {
        await accept.mutateAsync({ txnId: txn.id, note: context.note ?? null, tags: context.tags ?? null });
      } else {
        await accept.mutateAsync(txn.id);
      }
    } catch (err: any) {
      Alert.alert("Couldn't accept", err?.message ?? "Try again.");
    } finally {
      setBusyId(null);
    }
  };

  const handleIgnore = async (txn: PlaidPendingTransaction) => {
    setBusyId(txn.id);
    try {
      await ignore.mutateAsync(txn.id);
    } catch (err: any) {
      Alert.alert("Couldn't ignore", err?.message ?? "Try again.");
    } finally {
      setBusyId(null);
    }
  };

  const total = list.reduce((s, x) => s + x.amount, 0);

  const handleGroupAccept = async (
    g: PendingGroup,
    ctx: { category: string | null; tags: string[] | null; note: string | null; applyToFuture: boolean },
  ) => {
    setBusyGroup(g.signature);
    try {
      await groupAccept.mutateAsync({
        signature: g.signature,
        category: ctx.category,
        tags: ctx.tags,
        note: ctx.note,
        applyToFuture: ctx.applyToFuture,
      });
    } catch (err: any) {
      Alert.alert("Couldn't accept group", err?.message ?? "Try again.");
    } finally {
      setBusyGroup(null);
    }
  };

  const handleGroupIgnore = async (g: PendingGroup, applyToFuture: boolean) => {
    setBusyGroup(g.signature);
    try {
      await groupIgnore.mutateAsync({
        signature: g.signature,
        applyToFuture,
      });
    } catch (err: any) {
      Alert.alert("Couldn't ignore group", err?.message ?? "Try again.");
    } finally {
      setBusyGroup(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScreenHeader
        title="Pending"
        onBack={onBack}
        right={
          list.length > 0 ? (
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 999,
                backgroundColor: t.accent,
              }}
            >
              <Text
                style={{
                  color: t.surface,
                  fontFamily: BTFonts.mono,
                  fontSize: 10,
                  fontWeight: "700",
                  letterSpacing: 0.8,
                }}
              >
                {list.length}
              </Text>
            </View>
          ) : null
        }
      />
      <ScrollView
        contentContainerStyle={{ padding: 22, paddingBottom: 120, gap: 18 }}
        refreshControl={
          <RefreshControl
            refreshing={pending.isFetching || sync.isPending}
            onRefresh={() => {
              sync.mutate();
            }}
            tintColor={t.accent}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ gap: 8 }}>
          <BTSerif size={26} color={t.ink} weight="500">
            <Text style={{ fontFamily: BTFonts.serifItalic, color: t.accent }}>
              Review
            </Text>
            {" "}imported transactions
          </BTSerif>
          {list.length > 0 ? (
            <Text
              style={{
                color: t.inkSoft,
                fontFamily: BTFonts.sans,
                fontSize: 13,
                lineHeight: 19,
              }}
            >
              {list.length} waiting · ${total.toFixed(2)} total. Tap{" "}
              <Text style={{ fontWeight: "700", color: t.ink }}>Accept</Text> to
              count it as spend, or{" "}
              <Text style={{ fontWeight: "700", color: t.ink }}>Ignore</Text> for
              noise (transfers, refunds, double-counts). Tap{" "}
              <Text style={{ fontWeight: "700", color: t.ink }}>Add note</Text>{" "}
              to tell Tilly why.
            </Text>
          ) : null}
        </View>

        {/* Face ID re-prompt banner — visible when the user dismissed
            the shared PasskeyGate after a 403 PASSKEY_STALE. */}
        {passkeyGate.staleSinceCancel ? (
          <PasskeyStaleBanner
            t={t}
            label="Verify Face ID to refresh banks"
            onVerify={async () => {
              const ok = await passkeyGate.reverify();
              if (ok) {
                pending.refetch();
                items.refetch();
              }
            }}
          />
        ) : null}

        {/* Empty / error / loading */}
        {pending.isLoading ? (
          <View style={{ alignItems: "center", padding: 36 }}>
            <ActivityIndicator color={t.accent} />
          </View>
        ) : pending.isError ? (
          <ErrorPanel
            t={t}
            message={
              (pending.error as any)?.message ??
              "Couldn't load your pending transactions."
            }
            onRetry={() => pending.refetch()}
            retrying={pending.isFetching}
          />
        ) : list.length === 0 ? (
          <EmptyState t={t} hasItems={hasItems} onSync={() => sync.mutate()} syncing={sync.isPending} />
        ) : (
          <View style={{ gap: 10 }}>
            {/* Multi-item merchant groups first ("Spotify ×4 · $39.96") */}
            {multiGroups.map((g) => (
              <GroupCard
                key={g.signature}
                group={g}
                t={t}
                busy={busyGroup === g.signature}
                onAccept={(ctx) => handleGroupAccept(g, ctx)}
                onIgnore={(applyToFuture) => handleGroupIgnore(g, applyToFuture)}
              />
            ))}
            {/* Then singletons via the existing per-row UI */}
            {singleRows.map((txn) => (
              <PendingRow
                key={txn.id}
                txn={txn}
                t={t}
                busy={busyId === txn.id}
                onAccept={(ctx) => handleAccept(txn, ctx)}
                onIgnore={() => handleIgnore(txn)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function ErrorPanel({
  t,
  message,
  onRetry,
  retrying,
}: {
  t: BTTheme;
  message: string;
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <View
      style={{
        padding: 16,
        borderRadius: 16,
        backgroundColor: t.surface,
        borderWidth: 1,
        borderColor: t.bad,
        gap: 10,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Feather name="alert-circle" size={16} color={t.bad} />
        <Text
          style={{
            color: t.bad,
            fontFamily: BTFonts.sans,
            fontWeight: "700",
            fontSize: 13,
            flex: 1,
          }}
          numberOfLines={3}
        >
          {message}
        </Text>
      </View>
      <Pressable
        onPress={onRetry}
        disabled={retrying}
        accessibilityRole="button"
        accessibilityLabel="Retry"
        style={({ pressed }) => ({
          alignSelf: "flex-start",
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: 999,
          backgroundColor: t.ink,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        {retrying ? (
          <ActivityIndicator size="small" color={t.surface} />
        ) : (
          <Feather name="refresh-cw" size={12} color={t.surface} />
        )}
        <Text
          style={{
            color: t.surface,
            fontFamily: BTFonts.sans,
            fontWeight: "700",
            fontSize: 12,
          }}
        >
          {retrying ? "Retrying…" : "Try again"}
        </Text>
      </Pressable>
    </View>
  );
}

function EmptyState({
  t,
  hasItems,
  onSync,
  syncing,
}: {
  t: BTTheme;
  hasItems: boolean;
  onSync: () => void;
  syncing: boolean;
}) {
  return (
    <View
      style={{
        padding: 22,
        borderRadius: 18,
        borderWidth: 1.5,
        borderStyle: "dashed",
        borderColor: t.rule,
        alignItems: "center",
        gap: 12,
      }}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: t.accentSoft,
        }}
      >
        <Feather name="inbox" size={22} color={t.accent} />
      </View>
      <Text
        style={{
          color: t.ink,
          fontFamily: BTFonts.serifItalic,
          fontSize: 17,
          textAlign: "center",
        }}
      >
        Nothing waiting for you
      </Text>
      <Text
        style={{
          color: t.inkSoft,
          fontFamily: BTFonts.sans,
          fontSize: 12,
          lineHeight: 18,
          textAlign: "center",
          paddingHorizontal: 12,
        }}
      >
        {hasItems
          ? "When new transactions clear at your bank, they'll show up here for you to keep or ignore."
          : "Connect a bank from Settings → Bank connections and we'll start importing transactions automatically."}
      </Text>
      {hasItems ? (
        <Pressable
          onPress={onSync}
          disabled={syncing}
          accessibilityRole="button"
          accessibilityLabel="Sync now"
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 999,
            backgroundColor: t.ink,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          {syncing ? (
            <ActivityIndicator size="small" color={t.surface} />
          ) : (
            <Feather name="refresh-cw" size={12} color={t.surface} />
          )}
          <Text
            style={{
              color: t.surface,
              fontFamily: BTFonts.sans,
              fontWeight: "700",
              fontSize: 12,
            }}
          >
            {syncing ? "Syncing…" : "Sync now"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// Preset tags offered as quick chips. Free-text note covers anything else.
// Kept short so it fits without scrolling; users can still type custom context
// in the note field.
// Task #23 — common expense categories shown as chips on grouped pending
// cards so the user can override Plaid's suggestion before bulk-accepting.
const GROUP_CATEGORIES = [
  "groceries",
  "dining",
  "transport",
  "utilities",
  "entertainment",
  "shopping",
  "health",
  "subscriptions",
  "other",
];

const PRESET_TAGS = [
  "one-off",
  "gift",
  "work",
  "essential",
  "splurge",
  "regret",
  "shared",
  "emergency",
] as const;

function PendingRow({
  txn,
  t,
  busy,
  onAccept,
  onIgnore,
}: {
  txn: PlaidPendingTransaction;
  t: BTTheme;
  busy: boolean;
  onAccept: (context?: { note?: string | null; tags?: string[] | null }) => void;
  onIgnore: () => void;
}) {
  const merchant = txn.merchantName?.trim() || txn.name;
  const [showContext, setShowContext] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [note, setNote] = useState("");

  const toggleTag = (tag: string) => {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag],
    );
  };

  const hasContext = tags.length > 0 || note.trim().length > 0;

  return (
    <View
      style={{
        backgroundColor: t.surface,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: t.rule,
        padding: 14,
        gap: 12,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text
            style={{
              color: t.ink,
              fontFamily: BTFonts.sans,
              fontWeight: "700",
              fontSize: 15,
            }}
            numberOfLines={1}
          >
            {merchant}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text
              style={{
                color: t.inkMute,
                fontFamily: BTFonts.mono,
                fontSize: 10,
                letterSpacing: 0.8,
                textTransform: "uppercase",
              }}
            >
              {format(new Date(txn.date), "MMM d")}
            </Text>
            {txn.ourCategory ? (
              <View
                style={{
                  paddingHorizontal: 7,
                  paddingVertical: 2,
                  borderRadius: 999,
                  backgroundColor: t.chip,
                }}
              >
                <Text
                  style={{
                    color: t.inkSoft,
                    fontFamily: BTFonts.mono,
                    fontSize: 9,
                    letterSpacing: 0.8,
                    textTransform: "uppercase",
                    fontWeight: "600",
                  }}
                >
                  {txn.ourCategory}
                </Text>
              </View>
            ) : null}
            {txn.pending ? (
              <Text
                style={{
                  color: t.warn,
                  fontFamily: BTFonts.mono,
                  fontSize: 9,
                  letterSpacing: 0.8,
                  textTransform: "uppercase",
                  fontWeight: "700",
                }}
              >
                still pending
              </Text>
            ) : null}
          </View>
        </View>
        <Text
          style={{
            color: t.ink,
            fontFamily: BTFonts.serif,
            fontSize: 22,
            fontWeight: "500",
            fontVariant: ["tabular-nums"],
          }}
        >
          ${txn.amount.toFixed(2)}
        </Text>
      </View>

      {/* Add-context expander. Hidden by default so one-tap accept stays fast. */}
      <Pressable
        onPress={() => setShowContext((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={showContext ? "Hide note" : "Add note for Tilly"}
        style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
      >
        <Feather
          name={showContext ? "chevron-up" : "plus"}
          size={12}
          color={t.accent}
        />
        <Text
          style={{
            color: t.accent,
            fontFamily: BTFonts.sans,
            fontWeight: "600",
            fontSize: 12,
          }}
        >
          {showContext
            ? "Hide note"
            : hasContext
              ? "Edit note for Tilly"
              : "Add note for Tilly"}
        </Text>
      </Pressable>

      {showContext ? (
        <View style={{ gap: 10 }}>
          <Text
            style={{
              color: t.inkMute,
              fontFamily: BTFonts.mono,
              fontSize: 9,
              letterSpacing: 0.8,
              textTransform: "uppercase",
              fontWeight: "600",
            }}
          >
            Tag this spend
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {PRESET_TAGS.map((tag) => {
              const on = tags.includes(tag);
              return (
                <Pressable
                  key={tag}
                  onPress={() => toggleTag(tag)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`Tag ${tag}`}
                  style={({ pressed }) => ({
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: on ? t.accent : t.rule,
                    backgroundColor: on ? t.accentSoft : (pressed ? t.chip : "transparent"),
                  })}
                >
                  <Text
                    style={{
                      color: on ? t.accent : t.inkSoft,
                      fontFamily: BTFonts.sans,
                      fontSize: 11,
                      fontWeight: on ? "700" : "500",
                    }}
                  >
                    {tag}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Why this spend? (optional, e.g. 'Mom's birthday')"
            placeholderTextColor={t.inkMute}
            multiline
            maxLength={240}
            style={{
              color: t.ink,
              fontFamily: BTFonts.sans,
              fontSize: 13,
              padding: 10,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: t.rule,
              backgroundColor: t.bg,
              minHeight: 56,
              textAlignVertical: "top",
            }}
          />
        </View>
      ) : null}

      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable
          onPress={onIgnore}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`Ignore ${merchant}`}
          style={({ pressed }) => ({
            flex: 1,
            paddingVertical: 10,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: t.rule,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: pressed ? t.chip : "transparent",
          })}
        >
          <Text
            style={{
              color: t.inkSoft,
              fontFamily: BTFonts.sans,
              fontWeight: "600",
              fontSize: 12,
            }}
          >
            Ignore
          </Text>
        </Pressable>
        <Pressable
          onPress={() =>
            onAccept(
              hasContext
                ? { note: note.trim() || null, tags: tags.length > 0 ? tags : null }
                : undefined,
            )
          }
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`Accept ${merchant}`}
          style={({ pressed }) => ({
            flex: 1,
            paddingVertical: 10,
            borderRadius: 999,
            backgroundColor: t.ink,
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            gap: 6,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          {busy ? (
            <ActivityIndicator size="small" color={t.surface} />
          ) : (
            <Feather name="check" size={13} color={t.surface} />
          )}
          <Text
            style={{
              color: t.surface,
              fontFamily: BTFonts.sans,
              fontWeight: "700",
              fontSize: 12,
            }}
          >
            {hasContext ? "Save & accept" : "Accept"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * GroupCard — Task #23
 *
 * One card representing N pending Plaid txs from the same merchant.
 * The user picks tags/note ONCE, optionally toggles "always do this for
 * <merchant>", and one tap accepts the entire group. Pre-fills from any
 * learned rule on this merchant so a returning user doesn't re-tag.
 */
function GroupCard({
  group,
  t,
  busy,
  onAccept,
  onIgnore,
}: {
  group: PendingGroup;
  t: BTTheme;
  busy: boolean;
  onAccept: (ctx: {
    category: string | null;
    tags: string[] | null;
    note: string | null;
    applyToFuture: boolean;
  }) => void;
  onIgnore: (applyToFuture: boolean) => void;
}) {
  const [showContext, setShowContext] = useState(false);
  const [tags, setTags] = useState<string[]>(group.suggestedTags ?? []);
  const [note, setNote] = useState<string>(group.suggestedNote ?? "");
  const [applyToFuture, setApplyToFuture] = useState<boolean>(false);
  // Task #23 — let the user override the suggested category before
  // bulk-accepting. This drives the "Accept-as-X" requirement: pick a
  // category once and it both writes the expense rows and (with the
  // toggle) teaches the merchant rule to use it next time.
  const [category, setCategory] = useState<string | null>(group.suggestedCategory ?? null);

  const toggleTag = (tag: string) => {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag],
    );
  };

  const dateRange =
    group.firstDate === group.lastDate
      ? format(new Date(group.firstDate), "MMM d")
      : `${format(new Date(group.firstDate), "MMM d")} – ${format(new Date(group.lastDate), "MMM d")}`;

  return (
    <View
      style={{
        backgroundColor: t.surface,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: t.accent,
        padding: 14,
        gap: 12,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text
              style={{
                color: t.ink,
                fontFamily: BTFonts.sans,
                fontWeight: "700",
                fontSize: 15,
              }}
              numberOfLines={1}
            >
              {group.displayName}
            </Text>
            <View
              style={{
                paddingHorizontal: 7,
                paddingVertical: 2,
                borderRadius: 999,
                backgroundColor: t.accent,
              }}
            >
              <Text
                style={{
                  color: t.surface,
                  fontFamily: BTFonts.mono,
                  fontSize: 9,
                  fontWeight: "700",
                  letterSpacing: 0.6,
                }}
              >
                ×{group.count}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text
              style={{
                color: t.inkMute,
                fontFamily: BTFonts.mono,
                fontSize: 10,
                letterSpacing: 0.8,
                textTransform: "uppercase",
              }}
            >
              {dateRange}
            </Text>
            {group.suggestedCategory ? (
              <View
                style={{
                  paddingHorizontal: 7,
                  paddingVertical: 2,
                  borderRadius: 999,
                  backgroundColor: t.chip,
                }}
              >
                <Text
                  style={{
                    color: t.inkSoft,
                    fontFamily: BTFonts.mono,
                    fontSize: 9,
                    letterSpacing: 0.8,
                    textTransform: "uppercase",
                    fontWeight: "600",
                  }}
                >
                  {group.suggestedCategory}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        <Text
          style={{
            color: t.ink,
            fontFamily: BTFonts.serif,
            fontSize: 22,
            fontWeight: "500",
            fontVariant: ["tabular-nums"],
          }}
        >
          ${group.totalAmount.toFixed(2)}
        </Text>
      </View>

      <Pressable
        onPress={() => setShowContext((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={showContext ? "Hide details" : "Add note for Tilly"}
        style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
      >
        <Feather
          name={showContext ? "chevron-up" : "plus"}
          size={12}
          color={t.accent}
        />
        <Text
          style={{
            color: t.accent,
            fontFamily: BTFonts.sans,
            fontWeight: "600",
            fontSize: 12,
          }}
        >
          {showContext ? "Hide details" : "Tag & teach Tilly"}
        </Text>
      </Pressable>

      {showContext ? (
        <View style={{ gap: 10 }}>
          <View style={{ gap: 4 }}>
            <Text
              style={{
                color: t.inkMute,
                fontFamily: BTFonts.mono,
                fontSize: 9,
                letterSpacing: 0.8,
                textTransform: "uppercase",
              }}
            >
              Accept all as
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {GROUP_CATEGORIES.map((cat) => {
                const on = category === cat;
                return (
                  <Pressable
                    key={cat}
                    onPress={() => setCategory(on ? null : cat)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`Category ${cat}`}
                    style={({ pressed }) => ({
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: on ? t.ink : t.rule,
                      backgroundColor: on ? t.ink : (pressed ? t.chip : "transparent"),
                    })}
                  >
                    <Text
                      style={{
                        color: on ? t.surface : t.inkSoft,
                        fontFamily: BTFonts.sans,
                        fontSize: 11,
                        fontWeight: on ? "700" : "500",
                        textTransform: "capitalize",
                      }}
                    >
                      {cat}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {PRESET_TAGS.map((tag) => {
              const on = tags.includes(tag);
              return (
                <Pressable
                  key={tag}
                  onPress={() => toggleTag(tag)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`Tag ${tag}`}
                  style={({ pressed }) => ({
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: on ? t.accent : t.rule,
                    backgroundColor: on ? t.accentSoft : (pressed ? t.chip : "transparent"),
                  })}
                >
                  <Text
                    style={{
                      color: on ? t.accent : t.inkSoft,
                      fontFamily: BTFonts.sans,
                      fontSize: 11,
                      fontWeight: on ? "700" : "500",
                    }}
                  >
                    {tag}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder={`Why this spend? (optional, applies to all ${group.count})`}
            placeholderTextColor={t.inkMute}
            multiline
            maxLength={240}
            style={{
              color: t.ink,
              fontFamily: BTFonts.sans,
              fontSize: 13,
              padding: 10,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: t.rule,
              backgroundColor: t.bg,
              minHeight: 56,
              textAlignVertical: "top",
            }}
          />
          <Pressable
            onPress={() => setApplyToFuture((v) => !v)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: applyToFuture }}
            accessibilityLabel="Always do this for this merchant"
            style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
          >
            <View
              style={{
                width: 18,
                height: 18,
                borderRadius: 4,
                borderWidth: 1.5,
                borderColor: applyToFuture ? t.accent : t.rule,
                backgroundColor: applyToFuture ? t.accent : "transparent",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {applyToFuture ? (
                <Feather name="check" size={12} color={t.surface} />
              ) : null}
            </View>
            <Text
              style={{
                color: t.inkSoft,
                fontFamily: BTFonts.sans,
                fontSize: 12,
                flex: 1,
              }}
            >
              Always do this for {group.displayName} (skip pending next time)
            </Text>
          </Pressable>
        </View>
      ) : null}

      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable
          onPress={() =>
            onAccept({
              category,
              tags: tags.length > 0 ? tags : null,
              note: note.trim() || null,
              applyToFuture,
            })
          }
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`Accept all ${group.count} ${group.displayName}`}
          style={({ pressed }) => ({
            flex: 1,
            paddingVertical: 11,
            borderRadius: 999,
            backgroundColor: t.ink,
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            gap: 6,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          {busy ? (
            <ActivityIndicator size="small" color={t.surface} />
          ) : (
            <Feather name="check" size={13} color={t.surface} />
          )}
          <Text
            style={{
              color: t.surface,
              fontFamily: BTFonts.sans,
              fontWeight: "700",
              fontSize: 12,
            }}
          >
            {busy
              ? "Working…"
              : `Accept all ${group.count} · $${group.totalAmount.toFixed(2)}`}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            Alert.alert(
              `Ignore all ${group.count}?`,
              applyToFuture
                ? `Tilly will silently drop future ${group.displayName} transactions too.`
                : `These ${group.count} pending rows will move to ignored.`,
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Ignore all",
                  style: "destructive",
                  onPress: () => onIgnore(applyToFuture),
                },
              ],
            );
          }}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`Ignore all ${group.count} ${group.displayName}`}
          style={({ pressed }) => ({
            paddingVertical: 11,
            paddingHorizontal: 14,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: t.rule,
            backgroundColor: pressed ? t.chip : "transparent",
            alignItems: "center",
            justifyContent: "center",
          })}
        >
          <Text
            style={{
              color: t.inkSoft,
              fontFamily: BTFonts.sans,
              fontWeight: "600",
              fontSize: 12,
            }}
          >
            Ignore all
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
