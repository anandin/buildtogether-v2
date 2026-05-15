/**
 * BankConnectionsScreen — manage Plaid items.
 *
 * - Lists every connected institution (active / error / disconnected).
 * - "Connect a bank" button (uses the existing PlaidConnectButton which
 *   handles web + native + the privacy disclosure modal).
 * - Per-item: a manual "Sync now", a "Reconnect" affordance for items in
 *   error, and a destructive "Disconnect" that revokes the access token
 *   with Plaid before tombstoning the row.
 *
 * Pure presentation over the hooks in `client/bt/hooks/usePlaid.ts`.
 */
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { format, formatDistanceToNow } from "date-fns";

import { useBT } from "../../BTContext";
import { BTLabel, BTRule, BTSerif } from "../../atoms";
import { BTFonts, type BTTheme } from "../../theme";
import { ScreenHeader } from "./_chrome";
import {
  usePlaidItems,
  usePlaidStatus,
  usePlaidSync,
  usePlaidDisconnect,
  usePlaidResetTransactions,
  useInvalidatePlaid,
} from "../../hooks/usePlaid";
import { PlaidConnectButton } from "@/components/PlaidConnectButton";
import { PasskeyStaleBanner } from "./PasskeyStaleBanner";
import { usePasskeyGate } from "@/context/PasskeyGateContext";
import type { PlaidItem } from "../../api/types";

export function BankConnectionsScreen({ onBack }: { onBack: () => void }) {
  const { t } = useBT();
  const status = usePlaidStatus();
  // Non-silent: this screen is where the user comes to look at their
  // banks, so a stale-passkey 403 SHOULD pop Face ID rather than
  // silently render an empty list. Silent fetches are for ambient
  // surfaces (badge counts, home tiles).
  const items = usePlaidItems();
  const sync = usePlaidSync();
  const disconnect = usePlaidDisconnect();
  const resetTx = usePlaidResetTransactions();
  const refreshPlaid = useInvalidatePlaid();
  const passkeyGate = usePasskeyGate();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<string | null>(null);

  const handleResetTransactions = () => {
    if (resetTx.isPending) return;
    Alert.alert(
      "Reset all transactions?",
      "I'll delete every bank transaction we have on file and re-pull the last ~3 months fresh from your connected banks.\n\nWHAT GETS WIPED:\n• All Plaid transactions + the expenses we created from them\n• Spend totals, categories, forecasts (they re-compute from the fresh pull)\n\nWHAT STAYS:\n• Your dreams, watchlist, subscriptions\n• Tilly's memory of you and our chat history\n• Your preferences (hidden categories, pinned items, etc.)\n• Manual expenses you typed in by voice/photo/text\n\nI'll also log this reset in Tilly's memory so she knows the ledger changed.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            try {
              const r = await resetTx.mutateAsync();
              const inst =
                r.resync.perItem
                  .map((p) => `${p.institution ?? "bank"}: ${p.added}`)
                  .join(", ") || "no banks";
              setResetResult(
                `Cleared ${r.deleted.plaidTransactions} transactions + ${r.deleted.expenses} expenses. Re-pulled ${r.resync.totalAdded} from ${r.resync.resynced} bank${r.resync.resynced === 1 ? "" : "s"} (${inst}).`,
              );
            } catch (err: any) {
              Alert.alert(
                "Reset failed",
                err?.message ?? "Try again in a minute.",
              );
            }
          },
        },
      ],
    );
  };

  const handleSync = async () => {
    if (sync.isPending) return;
    try {
      await sync.mutateAsync();
    } catch (err: any) {
      Alert.alert("Sync failed", err?.message ?? "Try again in a minute.");
    }
  };

  const handleDisconnect = (item: PlaidItem) => {
    Alert.alert(
      `Disconnect ${item.institutionName}?`,
      "We'll stop syncing transactions and revoke access with Plaid. Existing accepted transactions stay.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            setBusyId(item.id);
            try {
              await disconnect.mutateAsync(item.id);
            } catch (err: any) {
              Alert.alert("Couldn't disconnect", err?.message ?? "Try again.");
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
  };

  const list = items.data ?? [];
  // Hide tombstoned rows; users disconnect to declutter, not to keep audit logs.
  const visible = list.filter((i) => i.status !== "disconnected");

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScreenHeader title="Bank connections" onBack={onBack} />
      <ScrollView
        contentContainerStyle={{ padding: 22, paddingBottom: 120, gap: 22 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            // Pull-to-refresh on Bank Connections IS the sync trigger.
            // This is the intuitive home for it: 'refresh banks' lives
            // where banks live. Pending screen no longer fires a sync
            // — it only refetches the local pending list.
            refreshing={sync.isPending || items.isFetching}
            onRefresh={() => {
              handleSync().catch(() => {});
            }}
            tintColor={t.accent}
          />
        }
      >
        {/* Header copy */}
        <View style={{ gap: 8 }}>
          <BTSerif size={26} color={t.ink} weight="500">
            <Text style={{ fontFamily: BTFonts.serifItalic, color: t.accent }}>
              Your banks,
            </Text>
            {" "}quietly synced
          </BTSerif>
          <Text
            style={{
              color: t.inkSoft,
              fontFamily: BTFonts.sans,
              fontSize: 13,
              lineHeight: 19,
            }}
          >
            Connect once, then expenses appear here for you to accept. Plaid
            never sees your password — you sign in with your bank directly.
          </Text>
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
                items.refetch();
                refreshPlaid();
              }
            }}
          />
        ) : null}

        {/* Status / configured? */}
        {status.data && !status.data.configured ? (
          <View
            style={{
              padding: 14,
              backgroundColor: t.surfaceAlt,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: t.rule,
              gap: 6,
            }}
          >
            <BTLabel color={t.warn}>Bank sync — coming soon</BTLabel>
            <Text
              style={{
                color: t.inkSoft,
                fontFamily: BTFonts.sans,
                fontSize: 12,
                lineHeight: 18,
              }}
            >
              This deployment doesn't have Plaid configured yet. Manual entry
              still works from the Spend tab.
            </Text>
          </View>
        ) : null}

        {/* List */}
        {items.isLoading ? (
          <View style={{ alignItems: "center", padding: 24 }}>
            <ActivityIndicator color={t.accent} />
          </View>
        ) : items.isError ? (
          <ErrorPanel
            t={t}
            message="Couldn't load your banks. Check your connection and try again."
            onRetry={() => items.refetch()}
            retrying={items.isFetching}
          />
        ) : visible.length === 0 ? (
          <View
            style={{
              padding: 18,
              borderRadius: 16,
              borderWidth: 1.5,
              borderStyle: "dashed",
              borderColor: t.rule,
              alignItems: "center",
              gap: 6,
            }}
          >
            <Feather name="link-2" size={22} color={t.inkMute} />
            <Text
              style={{
                color: t.inkSoft,
                fontFamily: BTFonts.serifItalic,
                fontSize: 14,
                textAlign: "center",
              }}
            >
              No banks connected yet.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {visible.map((item) => (
              <BankRow
                key={item.id}
                item={item}
                t={t}
                busy={busyId === item.id}
                onDisconnect={() => handleDisconnect(item)}
                onConnected={refreshPlaid}
              />
            ))}
          </View>
        )}

        {/* Actions */}
        {status.data?.configured !== false ? (
          <View style={{ gap: 10 }}>
            <PlaidConnectButton variant="hero" onConnected={refreshPlaid} />
            {visible.length > 0 ? (
              <Pressable
                onPress={handleSync}
                disabled={sync.isPending}
                accessibilityRole="button"
                accessibilityLabel="Sync transactions now"
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  paddingVertical: 12,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: t.rule,
                  backgroundColor: t.surface,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                {sync.isPending ? (
                  <ActivityIndicator size="small" color={t.ink} />
                ) : (
                  <Feather name="refresh-cw" size={14} color={t.ink} />
                )}
                <Text
                  style={{
                    color: t.ink,
                    fontFamily: BTFonts.sans,
                    fontWeight: "600",
                    fontSize: 13,
                  }}
                >
                  {sync.isPending ? "Syncing…" : "Sync transactions now"}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* Reset all transactions — destructive admin action. Lives
            here (not buried in Settings) so the user finds it the same
            place they'd think about their banks. */}
        {status.data?.configured !== false && visible.length > 0 ? (
          <View
            style={{
              marginTop: 24,
              padding: 16,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: t.bad,
              backgroundColor: t.surface,
              gap: 12,
            }}
          >
            <BTLabel color={t.bad}>Danger zone</BTLabel>
            <Text
              style={{
                color: t.ink,
                fontFamily: BTFonts.sans,
                fontWeight: "700",
                fontSize: 14,
              }}
            >
              Reset all transactions
            </Text>
            <Text
              style={{
                color: t.inkSoft,
                fontFamily: BTFonts.sans,
                fontSize: 12,
                lineHeight: 18,
              }}
            >
              Wipes every bank transaction we have on file and re-pulls the
              last ~3 months from your banks. Your memory, dreams, chat, and
              preferences stay. I'll write this reset into Tilly's memory so
              she knows the ledger changed.
            </Text>
            <Pressable
              onPress={handleResetTransactions}
              disabled={resetTx.isPending}
              accessibilityRole="button"
              accessibilityLabel="Reset all transactions"
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                paddingVertical: 12,
                borderRadius: 14,
                backgroundColor: t.bad,
                opacity: pressed || resetTx.isPending ? 0.7 : 1,
              })}
            >
              {resetTx.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Feather name="trash-2" size={14} color="#fff" />
              )}
              <Text
                style={{
                  color: "#fff",
                  fontFamily: BTFonts.sans,
                  fontWeight: "700",
                  fontSize: 13,
                }}
              >
                {resetTx.isPending ? "Resetting…" : "Reset all transactions"}
              </Text>
            </Pressable>
            {resetResult ? (
              <View
                style={{
                  padding: 12,
                  borderRadius: 10,
                  backgroundColor: t.surfaceAlt,
                  borderWidth: 1,
                  borderColor: t.rule,
                }}
              >
                <Text
                  style={{
                    color: t.ink,
                    fontFamily: BTFonts.mono,
                    fontSize: 11,
                    lineHeight: 16,
                  }}
                  selectable
                >
                  {resetResult}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Footer note */}
        <Text
          style={{
            color: t.inkMute,
            fontFamily: BTFonts.serifItalic,
            fontSize: 12,
            lineHeight: 18,
            textAlign: "center",
            paddingHorizontal: 12,
          }}
        >
          Disconnecting a bank revokes Plaid's access immediately.
          Transactions you've already accepted remain in your history.
        </Text>
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

function BankRow({
  item,
  t,
  busy,
  onDisconnect,
  onConnected,
}: {
  item: PlaidItem;
  t: BTTheme;
  busy: boolean;
  onDisconnect: () => void;
  onConnected: () => void;
}) {
  const isError = item.status === "error";
  const dot = isError ? t.bad : t.good;
  const lastSync = item.lastSyncAt
    ? `Synced ${formatDistanceToNow(new Date(item.lastSyncAt), { addSuffix: true })}`
    : "Not synced yet";

  return (
    <View
      style={{
        backgroundColor: t.surface,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: isError ? t.bad : t.rule,
        padding: 14,
        gap: 10,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: t.accentSoft,
          }}
        >
          <Feather name="credit-card" size={18} color={t.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: t.ink,
              fontFamily: BTFonts.sans,
              fontWeight: "700",
              fontSize: 15,
            }}
          >
            {item.institutionName}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: dot,
              }}
            />
            <Text
              style={{
                color: t.inkSoft,
                fontFamily: BTFonts.mono,
                fontSize: 10,
                letterSpacing: 0.8,
                textTransform: "uppercase",
              }}
            >
              {isError ? "Needs reconnect" : lastSync}
            </Text>
          </View>
        </View>
      </View>

      {isError && item.lastError ? (
        <Text
          style={{
            color: t.bad,
            fontFamily: BTFonts.sans,
            fontSize: 12,
            lineHeight: 17,
          }}
        >
          {item.lastError}
        </Text>
      ) : null}

      <BTRule color={t.rule} />

      <View style={{ flexDirection: "row", gap: 10 }}>
        {isError ? (
          // Reconnect: launches the Plaid Link flow again. The backend
          // exchange endpoint will create a fresh active item; the
          // user can disconnect the broken one once it's syncing again.
          <View style={{ flex: 1 }}>
            <PlaidConnectButton variant="inline" onConnected={onConnected} />
          </View>
        ) : null}
        <Pressable
          onPress={onDisconnect}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`Disconnect ${item.institutionName}`}
          style={({ pressed }) => ({
            flex: isError ? 0 : 1,
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: t.rule,
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "center",
            gap: 6,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          {busy ? (
            <ActivityIndicator size="small" color={t.bad} />
          ) : (
            <Feather name="x-circle" size={13} color={t.bad} />
          )}
          <Text
            style={{
              color: t.bad,
              fontFamily: BTFonts.sans,
              fontSize: 12,
              fontWeight: "600",
            }}
          >
            Disconnect
          </Text>
        </Pressable>
      </View>

      <Text
        style={{
          color: t.inkMute,
          fontFamily: BTFonts.mono,
          fontSize: 11,
          letterSpacing: 0.8,
          textTransform: "uppercase",
        }}
      >
        Connected {format(new Date(item.createdAt), "MMM d, yyyy")}
      </Text>
    </View>
  );
}
