/**
 * MemoryInspector — spec §5.4 (the trust contract).
 *
 * Triggered from the "memory" pill in BTGuardian. Full-screen modal showing
 * everything Tilly remembers, in her own words, with three controls:
 *   - tap to forget (archive a single memory)
 *   - export as markdown (gives the user a portable bundle)
 *   - footer text stating what Tilly will never do
 *
 * The visual rail mirrors the BTProfile timeline so the surface feels
 * familiar — same dot, same italic serif body, same mono date.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";

import { useBT } from "./BTContext";
import {
  useMemory,
  useForgetMemory,
  useExportMemory,
} from "./hooks/useMemory";
import { useUserPrefs } from "./hooks/useUserPrefs";
import { BTLabel, BTRule, BTSerif } from "./atoms";
import { BT_PULSE_DURATION_MS, BTFonts } from "./theme";

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Called when the user taps "Ask Tilly to undo X" on a settings row.
   * The chat surface should close the modal, prefill the composer with
   * the supplied seed message, and let the user tap Send to fire the
   * inverse tool through the normal chat path. */
  onPrefillCompose?: (seed: string) => void;
  /** Which tab to land on when the modal opens. Defaults to "memories";
   * BTSpend's Hidden-by-Tilly footer opens with "settings". */
  initialTab?: Tab;
};

type Tab = "memories" | "settings";

export function MemoryInspector({
  visible,
  onClose,
  onPrefillCompose,
  initialTab = "memories",
}: Props) {
  const { t } = useBT();
  const memory = useMemory();
  const forget = useForgetMemory();
  const exportMem = useExportMemory();
  const { raw: prefs } = useUserPrefs();
  const [tab, setTab] = useState<Tab>(initialTab);

  // Reset to the requested tab whenever the modal re-opens; without this,
  // tapping the Spend footer right after closing on the Memories tab
  // would leave the user looking at memories instead of settings.
  useEffect(() => {
    if (visible) setTab(initialTab);
  }, [visible, initialTab]);

  const list = memory.data?.memory ?? [];

  const handleExport = async () => {
    const result = await exportMem.mutateAsync();
    await Clipboard.setStringAsync(result.markdown);
  };

  // Flatten user_preferences into a list of human-readable rows with
  // their corresponding "ask Tilly to undo" seed message. The mapping is
  // intentionally explicit per (scope, key) — tools that don't have a
  // surfaceable string here just don't show, which keeps the panel
  // honest about what the user can actually reverse.
  const settingsRows = buildSettingsRows(prefs);

  const headerTitle =
    tab === "memories" ? (
      <BTSerif size={26} color={t.ink} weight="500" style={{ marginTop: 6 }}>
        In her{" "}
        <Text style={{ color: t.accent, fontFamily: BTFonts.serifItalic }}>
          own words
        </Text>
        .
      </BTSerif>
    ) : (
      <BTSerif size={26} color={t.ink} weight="500" style={{ marginTop: 6 }}>
        What Tilly{" "}
        <Text style={{ color: t.accent, fontFamily: BTFonts.serifItalic }}>
          changed
        </Text>
        .
      </BTSerif>
    );
  const headerLabel = tab === "memories" ? "What Tilly remembers" : "Reversible by chat";

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        {/* Header */}
        <View
          style={{
            paddingTop: 56,
            paddingHorizontal: 22,
            paddingBottom: 14,
            borderBottomWidth: 1,
            borderBottomColor: t.rule,
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <View style={{ flex: 1 }}>
            <BTLabel color={t.inkMute}>{headerLabel}</BTLabel>
            {headerTitle}
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

        {/* Tab strip */}
        <View
          style={{
            flexDirection: "row",
            paddingHorizontal: 22,
            paddingTop: 12,
            paddingBottom: 4,
            gap: 8,
            borderBottomWidth: 1,
            borderBottomColor: t.rule,
          }}
        >
          <TabPill
            label="Memories"
            count={list.length}
            active={tab === "memories"}
            onPress={() => setTab("memories")}
          />
          <TabPill
            label="Settings"
            count={settingsRows.length}
            active={tab === "settings"}
            onPress={() => setTab("settings")}
          />
        </View>

        {/* Body */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 22, paddingBottom: 40, gap: 18 }}
          showsVerticalScrollIndicator={false}
        >
          {tab === "memories" ? (
            <>
              {memory.isLoading ? (
                <Text style={{ color: t.inkMute, fontFamily: BTFonts.sans, fontSize: 13 }}>
                  Loading memories…
                </Text>
              ) : list.length === 0 ? (
                <Text
                  style={{
                    color: t.inkSoft,
                    fontFamily: BTFonts.serifItalic,
                    fontSize: 16,
                    lineHeight: 24,
                  }}
                >
                  Nothing here yet. Once we've talked a bit, I'll start writing
                  down what matters — only the real things.
                </Text>
              ) : (
                <Timeline
                  items={list}
                  onForget={(id) => forget.mutate(id)}
                  forgettingId={
                    forget.isPending ? (forget.variables as string | undefined) : undefined
                  }
                />
              )}

              {/* Export — only render once Tilly has actually written something. */}
              {list.length > 0 ? <BTRule color={t.rule} /> : null}

              {list.length > 0 ? (
                <Pressable
                  onPress={handleExport}
                  disabled={exportMem.isPending}
                  accessibilityRole="button"
                  accessibilityLabel="Export memories as markdown"
                  style={{
                    padding: 14,
                    borderRadius: 14,
                    backgroundColor: t.surface,
                    borderWidth: 1,
                    borderColor: t.rule,
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      color: t.ink,
                      fontFamily: BTFonts.sans,
                      fontWeight: "600",
                      fontSize: 13,
                    }}
                  >
                    {exportMem.isPending
                      ? "Exporting…"
                      : exportMem.isSuccess
                      ? "Copied to clipboard"
                      : "Export as markdown"}
                  </Text>
                </Pressable>
              ) : null}
            </>
          ) : (
            <SettingsList
              rows={settingsRows}
              onUndo={(seed) => {
                onPrefillCompose?.(seed);
              }}
            />
          )}

          {/* Trust contract footer — present on both tabs */}
          <View
            style={{
              padding: 16,
              borderRadius: 14,
              backgroundColor: t.accentSoft,
            }}
          >
            <BTLabel color={t.accent}>What Tilly will never do</BTLabel>
            <Text
              style={{
                color: t.ink,
                fontFamily: BTFonts.serifItalic,
                fontSize: 14,
                lineHeight: 22,
                marginTop: 8,
              }}
            >
              Sell or share this with banks or brands. Show ads based on what
              you spend. Train other models on your conversations. Save
              anything you ask her to forget.
            </Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function TabPill({
  label,
  count,
  active,
  onPress,
}: {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  const { t } = useBT();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={{
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 999,
        backgroundColor: active ? t.accentSoft : "transparent",
        borderWidth: 1,
        borderColor: active ? t.accent : t.rule,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
      }}
    >
      <Text
        style={{
          color: active ? t.accent : t.inkMute,
          fontFamily: BTFonts.sans,
          fontSize: 12,
          fontWeight: "700",
          letterSpacing: 0.4,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          color: active ? t.accent : t.inkMute,
          fontFamily: BTFonts.mono,
          fontSize: 10,
          fontWeight: "700",
        }}
      >
        {count}
      </Text>
    </Pressable>
  );
}

type SettingsRow = {
  id: string;
  glyph: string;
  label: string;
  value: string;
  undoSeed: string;
};

const TILE_LABEL: Record<string, string> = {
  subscriptions_overview: "Subscriptions overview",
  credit_health: "Credit health",
  spending_vs_avg: "Spending vs your average",
  upcoming_bills: "Upcoming bills",
  debt_breakdown: "Debt breakdown",
};

const ONBOARDING_LABEL: Record<string, string> = {
  employmentType: "Employment",
  ageBand: "Age band",
  city: "City",
  dependents: "Supports",
  supportNote: "Support note",
  schoolName: "School",
};

const ONBOARDING_UNDO: Record<string, string> = {
  employmentType: "Forget my employment type.",
  ageBand: "Forget my age band.",
  city: "Forget my city.",
  dependents: "Forget how many people I support.",
  supportNote: "Forget my support note.",
  schoolName: "Forget my school.",
};

/**
 * Flatten the user_preferences object into a flat list of human-readable
 * rows. Each row carries its own undo seed — the chat message that, when
 * sent, fires the matching inverse tool. Keys with no friendly mapping
 * are skipped on purpose: the panel is "what the user can reverse",
 * not "every kv pair we've ever written".
 */
function buildSettingsRows(
  prefs: Record<string, Record<string, unknown>>,
): SettingsRow[] {
  const rows: SettingsRow[] = [];

  // 1. Hidden Spend categories — one row per category in the array.
  const hidden = Array.isArray(prefs.spend?.hide_categories)
    ? (prefs.spend!.hide_categories as unknown[]).filter(
        (x): x is string => typeof x === "string",
      )
    : [];
  for (const cat of hidden) {
    rows.push({
      id: `spend.hide_categories.${cat}`,
      glyph: "🙈",
      label: "Hidden from Spend",
      value: cat,
      undoSeed: `Bring ${cat} back to my Spend page.`,
    });
  }

  // 2. Pinned Today tiles.
  const pinned = Array.isArray(prefs.today?.pinned_tiles)
    ? (prefs.today!.pinned_tiles as unknown[]).filter(
        (x): x is string => typeof x === "string",
      )
    : [];
  for (const tile of pinned) {
    const friendly = TILE_LABEL[tile] ?? tile;
    rows.push({
      id: `today.pinned_tiles.${tile}`,
      glyph: "📌",
      label: "Pinned to Today",
      value: friendly,
      undoSeed: `Unpin ${tile} from Today.`,
    });
  }

  // 3. Plaid card aliases — dedupe by cardName so multiple merchant
  // signatures pointing at the same card render as ONE row. The undo
  // tool already operates on cardName (fuzzy keyword match) and removes
  // every signature aliased to that card in one shot.
  const plaid = (prefs.plaid ?? {}) as Record<string, unknown>;
  const seenCards = new Set<string>();
  for (const key of Object.keys(plaid)) {
    if (!key.startsWith("alias_payment_to_card:")) continue;
    const v = plaid[key] as { cardName?: string } | null;
    const cardName = (v && typeof v.cardName === "string" && v.cardName) ||
      key.replace("alias_payment_to_card:", "");
    const dedupeKey = cardName.toLowerCase();
    if (seenCards.has(dedupeKey)) continue;
    seenCards.add(dedupeKey);
    rows.push({
      id: `plaid.alias_payment_to_card.${dedupeKey}`,
      glyph: "💳",
      label: "Treated as card payment",
      value: cardName,
      undoSeed: `Stop treating ${cardName} as a credit-card payment.`,
    });
  }

  // 4. Onboarding facts.
  const onb = (prefs.onboarding ?? {}) as Record<string, unknown>;
  for (const key of Object.keys(onb)) {
    const v = onb[key];
    if (v == null || (typeof v !== "string" && typeof v !== "number")) continue;
    const display = key === "dependents" ? `${v} people` : String(v);
    rows.push({
      id: `onboarding.${key}`,
      glyph: "🪪",
      label: ONBOARDING_LABEL[key] ?? key,
      value: display,
      undoSeed: ONBOARDING_UNDO[key] ?? `Forget my ${key}.`,
    });
  }

  return rows;
}

function SettingsList({
  rows,
  onUndo,
}: {
  rows: SettingsRow[];
  onUndo: (seed: string) => void;
}) {
  const { t } = useBT();

  if (rows.length === 0) {
    return (
      <Text
        style={{
          color: t.inkSoft,
          fontFamily: BTFonts.serifItalic,
          fontSize: 16,
          lineHeight: 24,
        }}
      >
        Tilly hasn't changed anything yet. Anything she changes through chat —
        a hidden category, a pinned tile, a card aliased as a payment — will
        show up here with a one-tap undo.
      </Text>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      <Text
        style={{
          color: t.inkSoft,
          fontFamily: BTFonts.serifItalic,
          fontSize: 14,
          lineHeight: 21,
          marginBottom: 4,
        }}
      >
        Anything Tilly's changed about how this app shows up. Tap "ask Tilly to
        undo" and she'll reverse it.
      </Text>
      {rows.map((row) => (
        <View
          key={row.id}
          style={{
            padding: 14,
            borderRadius: 14,
            backgroundColor: t.surface,
            borderWidth: 1,
            borderColor: t.rule,
            gap: 10,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text style={{ fontSize: 18 }}>{row.glyph}</Text>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: t.inkMute,
                  fontFamily: BTFonts.mono,
                  fontSize: 10,
                  letterSpacing: 1.1,
                  textTransform: "uppercase",
                  fontWeight: "700",
                }}
              >
                {row.label}
              </Text>
              <Text
                style={{
                  color: t.ink,
                  fontFamily: BTFonts.serif,
                  fontSize: 16,
                  marginTop: 2,
                }}
              >
                {row.value}
              </Text>
            </View>
          </View>
          <Pressable
            onPress={() => onUndo(row.undoSeed)}
            accessibilityRole="button"
            accessibilityLabel={`Ask Tilly to undo: ${row.label} ${row.value}`}
            style={{
              alignSelf: "flex-start",
              paddingVertical: 6,
              paddingHorizontal: 12,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: t.accent,
              backgroundColor: t.accentSoft,
            }}
          >
            <Text
              style={{
                color: t.accent,
                fontFamily: BTFonts.sans,
                fontSize: 11,
                fontWeight: "700",
                letterSpacing: 0.4,
              }}
            >
              ASK TILLY TO UNDO
            </Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

function Timeline({
  items,
  onForget,
  forgettingId,
}: {
  items: { id: string; dateLabel: string; body: string; isMostRecent: boolean }[];
  onForget: (id: string) => void;
  forgettingId?: string;
}) {
  const { t } = useBT();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: BT_PULSE_DURATION_MS / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: BT_PULSE_DURATION_MS / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View>
      {items.map((m, i) => {
        const last = i === items.length - 1;
        const isForgetting = forgettingId === m.id;
        return (
          <View key={m.id} style={{ flexDirection: "row", gap: 14, opacity: isForgetting ? 0.4 : 1 }}>
            {/* Rail */}
            <View style={{ width: 24, alignItems: "center" }}>
              <View
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  backgroundColor: m.isMostRecent ? t.accent : t.surface,
                  borderWidth: 2,
                  borderColor: m.isMostRecent ? t.accent : t.rule,
                  marginTop: 4,
                }}
              />
              {m.isMostRecent ? (
                <Animated.View
                  style={{
                    position: "absolute",
                    top: -2,
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor: t.accent,
                    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.85] }),
                  }}
                />
              ) : null}
              {!last ? (
                <View style={{ flex: 1, width: 1.5, backgroundColor: t.rule, marginTop: 4 }} />
              ) : null}
            </View>
            {/* Body */}
            <View style={{ flex: 1, paddingBottom: last ? 0 : 18, gap: 6 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text
                  style={{
                    color: m.isMostRecent ? t.accent : t.inkMute,
                    fontFamily: BTFonts.mono,
                    fontSize: 10,
                    letterSpacing: 1.3,
                    textTransform: "uppercase",
                    fontWeight: "700",
                  }}
                >
                  {m.dateLabel}
                </Text>
                <Pressable onPress={() => onForget(m.id)} disabled={isForgetting}>
                  <Text
                    style={{
                      color: t.inkMute,
                      fontFamily: BTFonts.mono,
                      fontSize: 11,
                      letterSpacing: 1.1,
                      textTransform: "uppercase",
                    }}
                  >
                    forget
                  </Text>
                </Pressable>
              </View>
              <Text
                style={{
                  color: t.ink,
                  fontFamily: BTFonts.serifItalic,
                  fontSize: 16,
                  lineHeight: 22,
                }}
              >
                "{m.body}"
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
