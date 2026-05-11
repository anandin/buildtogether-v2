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
  useInvalidatePlaid,
} from "../../hooks/usePlaid";
import { PlaidConnectButton } from "@/components/PlaidConnectButton";
import { PasskeyStaleBanner } from "./PasskeyStaleBanner";
import { usePasskeyGate } from "@/context/PasskeyGateContext";
import type { PlaidItem } from "../../api/types";

export function BankConnectionsScreen({ onBack }: { onBack: () => void }) {
  const { t } = useBT();
  const status = usePlaidStatus();
  const items = usePlaidItems({ silent: true });
  const sync = usePlaidSync();
  const disconnect = usePlaidDisconnect();
  const refreshPlaid = useInvalidatePlaid();
  const passkeyGate = usePasskeyGate();
  const [busyId, setBusyId] = useState<string | null>(null);

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
            message="Couldn't load your banks. Verify Face ID first, then try again."
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
