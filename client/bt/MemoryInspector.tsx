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
import React, { useEffect, useRef } from "react";
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
import { BTLabel, BTRule, BTSerif } from "./atoms";
import { BT_PULSE_DURATION_MS, BTFonts } from "./theme";

type Props = { visible: boolean; onClose: () => void };

export function MemoryInspector({ visible, onClose }: Props) {
  const { t } = useBT();
  const memory = useMemory();
  const forget = useForgetMemory();
  const exportMem = useExportMemory();

  const list = memory.data?.memory ?? [];

  const handleExport = async () => {
    const result = await exportMem.mutateAsync();
    await Clipboard.setStringAsync(result.markdown);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
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
            <BTLabel color={t.inkMute}>What Tilly remembers</BTLabel>
            <BTSerif size={26} color={t.ink} weight="500" style={{ marginTop: 6 }}>
              In her{" "}
              <Text style={{ color: t.accent, fontStyle: "italic", fontFamily: BTFonts.serif }}>
                own words
              </Text>
              .
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

        {/* Body */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 22, paddingBottom: 40, gap: 18 }}
          showsVerticalScrollIndicator={false}
        >
          {memory.isLoading ? (
            <Text style={{ color: t.inkMute, fontFamily: BTFonts.sans, fontSize: 13 }}>
              Loading memories…
            </Text>
          ) : list.length === 0 ? (
            <Text
              style={{
                color: t.inkSoft,
                fontFamily: BTFonts.serif,
                fontStyle: "italic",
                fontSize: 16,
                lineHeight: 24,
              }}
            >
              Tilly hasn't written anything yet. As you talk, she'll start
              keeping notes — only what's worth remembering.
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

          <BTRule color={t.rule} />

          {/* Export */}
          <Pressable
            onPress={handleExport}
            disabled={exportMem.isPending}
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

          {/* Trust contract footer */}
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
                fontFamily: BTFonts.serif,
                fontSize: 14,
                lineHeight: 22,
                fontStyle: "italic",
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
                      fontSize: 9,
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
                  fontFamily: BTFonts.serif,
                  fontSize: 16,
                  lineHeight: 22,
                  fontStyle: "italic",
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
