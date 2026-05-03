/**
 * PasskeySecurityScreen — list, add, and revoke passkeys.
 *
 * Reachable from Profile → Security. Used by the user to manage their
 * phishing-resistant MFA factors.
 */
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";

import { useBT } from "../BTContext";
import { BTLabel } from "../atoms";
import { BTFonts, BTFontsByWeight } from "../theme";
import {
  enrollPasskey,
  hasLocalPasskey,
  isPasskeySupported,
  listServerCredentials,
  deleteServerCredential,
  type ServerCredential,
} from "@/lib/passkey";

interface Props {
  onBack: () => void;
}

export function PasskeySecurityScreen({ onBack }: Props) {
  const { t } = useBT();
  const [creds, setCreds] = useState<ServerCredential[] | null>(null);
  const [supported, setSupported] = useState<boolean>(true);
  const [hasLocal, setHasLocal] = useState<boolean>(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setError(null);
      const [list, sup, local] = await Promise.all([
        listServerCredentials(),
        isPasskeySupported(),
        hasLocalPasskey(),
      ]);
      setCreds(list);
      setSupported(sup);
      setHasLocal(local);
    } catch (e: any) {
      setError(e?.message || "Couldn't load passkeys.");
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const onAdd = async () => {
    setBusy(true);
    setError(null);
    try {
      await enrollPasskey();
      await reload();
    } catch (e: any) {
      setError(e?.message || "Couldn't enroll a new passkey.");
    } finally {
      setBusy(false);
    }
  };

  const onRevoke = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await deleteServerCredential(id);
      await reload();
    } catch (e: any) {
      setError(e?.message || "Couldn't revoke that passkey.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ padding: 18, paddingTop: 24, gap: 18 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back" hitSlop={12}>
          <Feather name="chevron-left" size={22} color={t.ink} />
        </Pressable>
        <Text style={{ color: t.ink, fontFamily: BTFonts.serif, fontSize: 22 }}>
          Security
        </Text>
      </View>

      <View style={{ gap: 6 }}>
        <BTLabel color={t.inkMute}>Passkeys</BTLabel>
        <Text style={{ color: t.inkSoft, fontFamily: BTFonts.serifItalic, fontSize: 15, lineHeight: 22 }}>
          A passkey is a tiny key your phone keeps, gated by Face ID or Touch ID.
          Tilly uses it as a second factor before connecting any bank.
          The key itself never leaves this device — even Tilly can't see it.
        </Text>
      </View>

      {error ? (
        <View style={{ padding: 12, borderRadius: 12, backgroundColor: t.accentSoft, borderWidth: 1, borderColor: t.bad }}>
          <Text style={{ color: t.bad, fontFamily: BTFonts.serifItalic }}>{error}</Text>
        </View>
      ) : null}

      {creds === null ? (
        <ActivityIndicator color={t.accent} />
      ) : creds.length === 0 ? (
        <View
          style={{
            padding: 16,
            borderRadius: 16,
            borderWidth: 1.5,
            borderStyle: "dashed",
            borderColor: t.rule,
            alignItems: "center",
            gap: 4,
          }}
        >
          <Text style={{ color: t.inkSoft, fontFamily: BTFonts.serifItalic, fontSize: 14, textAlign: "center" }}>
            No passkeys yet. Set one up to unlock bank connections.
          </Text>
        </View>
      ) : (
        <View
          style={{
            backgroundColor: t.surface,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: t.rule,
            overflow: "hidden",
          }}
        >
          {creds.map((c, i) => (
            <View key={c.id}>
              <View style={{ padding: 14, gap: 4 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ color: t.ink, fontFamily: BTFontsByWeight.sans700, fontSize: 14 }}>
                    {c.deviceLabel || c.platform || "Passkey"}
                  </Text>
                  <Pressable
                    onPress={() => onRevoke(c.id)}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel={`Revoke ${c.deviceLabel || "passkey"}`}
                    hitSlop={10}
                  >
                    <Text style={{ color: t.bad, fontFamily: BTFontsByWeight.mono700, fontSize: 10, letterSpacing: 1.2 }}>
                      REVOKE
                    </Text>
                  </Pressable>
                </View>
                <Text style={{ color: t.inkMute, fontFamily: BTFonts.mono, fontSize: 11 }}>
                  Added {new Date(c.createdAt).toLocaleDateString()}
                  {c.lastUsedAt ? ` · last used ${new Date(c.lastUsedAt).toLocaleDateString()}` : " · not yet used"}
                </Text>
              </View>
              {i < creds.length - 1 ? (
                <View style={{ height: 1, backgroundColor: t.rule, marginHorizontal: 14 }} />
              ) : null}
            </View>
          ))}
        </View>
      )}

      {supported ? (
        <Pressable
          onPress={onAdd}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Add a new passkey"
          style={{
            paddingVertical: 14,
            paddingHorizontal: 18,
            borderRadius: 14,
            backgroundColor: t.ink,
            alignItems: "center",
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? (
            <ActivityIndicator color={t.surface} />
          ) : (
            <Text style={{ color: t.surface, fontFamily: BTFontsByWeight.sans700, fontSize: 13 }}>
              {hasLocal ? "Add a new passkey" : "Set up Face ID for this device"}
            </Text>
          )}
        </Pressable>
      ) : (
        <Text style={{ color: t.inkSoft, fontFamily: BTFonts.serifItalic, textAlign: "center" }}>
          This device doesn't have biometric hardware enrolled. Open phone Settings to set up
          Face ID, Touch ID, or fingerprint, then come back.
        </Text>
      )}
    </ScrollView>
  );
}
