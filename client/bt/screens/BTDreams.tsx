/**
 * BTDreams — goal portraits. Spec §4.5.
 *
 * Each dream is a portrait card with its own gradient sky and oversized
 * glyph. A goal isn't a progress bar — it's a place. The portrait makes
 * saving feel like collecting postcards, not data entry.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { useBT } from "../BTContext";
import { Tilly } from "../Tilly";
import { BTCard, BTChip, BTLabel, BTSerif } from "../atoms";
import { BT_PULSE_DURATION_MS, BT_SHIMMER_DURATION_MS, BTFonts, type BTTheme } from "../theme";
import {
  useDreams,
  useCreateDream,
  useContributeDream,
} from "../hooks/useDreams";
import type { Dream as BTDream } from "../api/types";

const MILESTONES = [0, 25, 50, 75, 100];

export function BTDreams() {
  const { t } = useBT();
  const dreams = useDreams();
  const [newOpen, setNewOpen] = useState(false);
  const [contributeFor, setContributeFor] = useState<BTDream | null>(null);

  const live = dreams.data && dreams.data.ready === true ? dreams.data : null;
  const dreamsList: BTDream[] = live ? live.dreams : [];
  const yearSaved = live?.yearSaved ?? 0;
  const perDay = live?.perDay ?? 0;
  const hasAnyContributions = yearSaved > 0;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ padding: 22, paddingTop: 36, paddingBottom: 120, gap: 22 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ gap: 8 }}>
        <BTLabel color={t.inkMute}>What you're building</BTLabel>
        {hasAnyContributions ? (
          <BTSerif size={28} color={t.ink} weight="500">
            <Text style={{ color: t.accent, fontFamily: BTFonts.serifItalic }}>
              ${yearSaved.toLocaleString()}
            </Text>{" "}
            set aside this year. About ${perDay.toFixed(2)} a day.
          </BTSerif>
        ) : (
          <BTSerif size={26} color={t.ink} weight="500">
            {dreamsList.length === 0 ? (
              <>
                Nothing{" "}
                <Text style={{ color: t.accent, fontFamily: BTFonts.serifItalic }}>
                  named
                </Text>{" "}
                yet — name something below.
              </>
            ) : (
              <>
                Just{" "}
                <Text style={{ color: t.accent, fontFamily: BTFonts.serifItalic }}>
                  starting
                </Text>
                . First contribution lights up the year-total.
              </>
            )}
          </BTSerif>
        )}
        <Text
          style={{
            color: t.inkSoft,
            fontFamily: BTFonts.sans,
            fontSize: 13,
            lineHeight: 19,
          }}
        >
          Tilly auto-moves it after every paycheck — you don't have to remember.
        </Text>
      </View>

      {dreamsList.map((d) => (
        <DreamPortrait
          key={d.id}
          d={d}
          t={t}
          onContribute={() => setContributeFor(d)}
        />
      ))}

      {/* + Name a new dream */}
      <Pressable
        onPress={() => setNewOpen(true)}
        style={{
          padding: 22,
          borderRadius: 18,
          borderWidth: 1.5,
          borderStyle: "dashed",
          borderColor: t.rule,
          alignItems: "center",
          gap: 4,
        }}
      >
        <Text style={{ color: t.inkMute, fontSize: 22 }}>+</Text>
        <Text style={{ color: t.inkSoft, fontFamily: BTFonts.serifItalic, fontSize: 16 }}>
          Name a new dream
        </Text>
      </Pressable>

      <NewDreamModal visible={newOpen} onClose={() => setNewOpen(false)} />
      <ContributeModal
        dream={contributeFor}
        onClose={() => setContributeFor(null)}
      />
    </ScrollView>
  );
}

// ─── Modals ─────────────────────────────────────────────────────────────────

function NewDreamModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useBT();
  const create = useCreateDream();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [glyph, setGlyph] = useState("✺");

  const submit = () => {
    if (!name.trim() || !target.trim()) return;
    create.mutate(
      {
        name: name.trim(),
        target: Number(target.replace(/[^0-9.]/g, "")) || 0,
        glyph,
        gradient: ["#E94B3C", "#F59E0B"],
        weeklyAuto: 40,
      },
      {
        onSuccess: () => {
          setName("");
          setTarget("");
          setGlyph("✺");
          onClose();
        },
      },
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
      <Pressable
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}
        onPress={onClose}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: t.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: 24,
            paddingBottom: 40,
            gap: 14,
          }}
        >
          <BTLabel color={t.inkMute}>New dream</BTLabel>
          <BTSerif size={26} color={t.ink} weight="500">
            What are you saving toward?
          </BTSerif>
          <SimpleField t={t} label="Dream name" value={name} onChangeText={setName} placeholder="Barcelona spring" />
          <SimpleField t={t} label="Target ($)" value={target} onChangeText={setTarget} placeholder="2400" keyboardType="numeric" />
          <View style={{ flexDirection: "row", gap: 8 }}>
            {["✺", "◇", "◉", "✿", "❋"].map((g) => (
              <Pressable
                key={g}
                onPress={() => setGlyph(g)}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: glyph === g ? t.accent : t.surfaceAlt,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: glyph === g ? "#fff" : t.ink, fontSize: 22 }}>{g}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            onPress={submit}
            disabled={create.isPending || !name.trim() || !target.trim()}
            style={{
              backgroundColor: create.isPending || !name.trim() || !target.trim() ? t.surfaceAlt : t.ink,
              borderRadius: 14,
              paddingVertical: 14,
              alignItems: "center",
              marginTop: 4,
            }}
          >
            <Text style={{ color: t.surface, fontFamily: BTFonts.sans, fontWeight: "700", fontSize: 14 }}>
              {create.isPending ? "Saving…" : "Add to your dreams"}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ContributeModal({
  dream,
  onClose,
}: {
  dream: BTDream | null;
  onClose: () => void;
}) {
  const { t } = useBT();
  const contribute = useContributeDream();
  const [amount, setAmount] = useState("");

  const visible = !!dream;
  const submit = () => {
    if (!dream || !amount.trim()) return;
    const value = Number(amount.replace(/[^0-9.]/g, ""));
    if (!value) return;
    contribute.mutate(
      { id: dream.id, amount: value },
      {
        onSuccess: () => {
          setAmount("");
          onClose();
        },
      },
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
      <Pressable
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}
        onPress={onClose}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: t.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: 24,
            paddingBottom: 40,
            gap: 14,
          }}
        >
          {dream ? (
            <>
              <BTLabel color={t.inkMute}>Add to {dream.name}</BTLabel>
              <BTSerif size={26} color={t.ink} weight="500">
                How much can you{" "}
                <Text style={{ color: t.accent, fontFamily: BTFonts.serifItalic }}>
                  set aside
                </Text>
                ?
              </BTSerif>
              <SimpleField t={t} label="Amount ($)" value={amount} onChangeText={setAmount} placeholder="40" keyboardType="numeric" />
              <Pressable
                onPress={submit}
                disabled={contribute.isPending || !amount.trim()}
                style={{
                  backgroundColor: contribute.isPending || !amount.trim() ? t.surfaceAlt : t.ink,
                  borderRadius: 14,
                  paddingVertical: 14,
                  alignItems: "center",
                  marginTop: 4,
                }}
              >
                <Text style={{ color: t.surface, fontFamily: BTFonts.sans, fontWeight: "700", fontSize: 14 }}>
                  {contribute.isPending ? "Moving…" : `Move to ${dream.name}`}
                </Text>
              </Pressable>
            </>
          ) : null}
        </Pressable>
      </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function SimpleField({
  t,
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
}: {
  t: BTTheme;
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "numeric";
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <BTLabel color={focused ? t.accent : t.inkMute} size={10}>
        {label}
      </BTLabel>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        placeholderTextColor={t.inkMute}
        keyboardType={keyboardType}
        style={
          {
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 12,
            backgroundColor: t.surfaceAlt,
            borderWidth: 1.5,
            borderColor: focused ? t.accent : "transparent",
            color: t.ink,
            fontFamily: BTFonts.sans,
            fontSize: 15,
            outlineStyle: "none",
          } as any
        }
      />
    </View>
  );
}

function DreamPortrait({
  d,
  t,
  onContribute,
}: {
  d: BTDream;
  t: BTTheme;
  onContribute?: () => void;
}) {
  const pct = Math.round((d.saved / d.target) * 100);
  const justCrossed = MILESTONES.find((m) => m > 0 && Math.abs(pct - m) <= 8) ?? null;
  const shimmerOn = justCrossed !== null;

  const slide = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (shimmerOn) {
      const loop = Animated.loop(
        Animated.timing(slide, {
          toValue: 1,
          duration: BT_SHIMMER_DURATION_MS,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      );
      loop.start();
      return () => loop.stop();
    }
  }, [shimmerOn, slide]);

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

  const tx = slide.interpolate({ inputRange: [0, 1], outputRange: [-160, 360] });

  return (
    <View style={{ borderRadius: 22, overflow: "hidden", backgroundColor: t.surface, borderWidth: 1, borderColor: t.rule }}>
      {/* Gradient header */}
      <View style={{ height: 132, position: "relative", overflow: "hidden" }}>
        <LinearGradient
          colors={d.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ ...StyleSheetAbsoluteFill }}
        />
        {/* Diagonal stripes (subtle) */}
        <DiagonalLines />
        {/* Big glyph */}
        <Text
          style={{
            position: "absolute",
            right: 14,
            bottom: -36,
            fontSize: 160,
            color: "#fff",
            opacity: 0.18,
            fontFamily: BTFonts.serif,
            fontWeight: "300",
          }}
        >
          {d.glyph}
        </Text>
        {/* Loc + name */}
        <View style={{ padding: 18, justifyContent: "flex-end", flex: 1 }}>
          <Text
            style={{
              color: "rgba(255,255,255,0.85)",
              fontFamily: BTFonts.mono,
              fontSize: 9,
              letterSpacing: 1.4,
              textTransform: "uppercase",
            }}
          >
            {d.loc}
          </Text>
          <Text
            style={{
              color: "#fff",
              fontFamily: BTFonts.serif,
              fontSize: 26,
              fontWeight: "500",
              marginTop: 4,
            }}
          >
            {d.name}
          </Text>
        </View>
        {shimmerOn ? (
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              width: 80,
              backgroundColor: "rgba(255,255,255,0.22)",
              transform: [{ translateX: tx }, { skewX: "-22deg" }],
            }}
          />
        ) : null}
      </View>

      {/* Body */}
      <View style={{ padding: 18, gap: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
          {d.saved === 0 && d.target > 0 ? (
            // Just-started empty state — shouldn't read "$0 of $X" because that
            // looks like a bug. Spec §8 calls for a pre-first-dream empty
            // moment; this is the per-dream version of that.
            <Text style={{ color: t.ink, fontFamily: BTFonts.serifItalic, fontSize: 18 }}>
              Just started.{" "}
              <Text style={{ color: t.inkMute, fontFamily: BTFonts.sans, fontSize: 14, fontStyle: "normal" }}>
                Goal ${d.target.toLocaleString()}
              </Text>
            </Text>
          ) : (
            <Text style={{ color: t.ink, fontFamily: BTFonts.serif, fontSize: 22 }}>
              ${d.saved.toLocaleString()}
              <Text style={{ color: t.inkMute, fontSize: 16 }}> of ${d.target.toLocaleString()}</Text>
            </Text>
          )}
          <BTChip
            bg={justCrossed ? t.accent : t.chip}
            fg={justCrossed ? "#fff" : t.inkSoft}
          >
            {pct}%
          </BTChip>
        </View>

        {/* Milestone track */}
        <View style={{ position: "relative", height: 18, justifyContent: "center" }}>
          <View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              height: 4,
              borderRadius: 2,
              backgroundColor: t.rule,
            }}
          />
          <LinearGradient
            colors={[t.accent, t.accent2]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{
              position: "absolute",
              left: 0,
              height: 4,
              borderRadius: 2,
              width: `${pct}%`,
            }}
          />
          <View style={{ position: "absolute", left: 0, right: 0, flexDirection: "row", justifyContent: "space-between" }}>
            {MILESTONES.map((m) => {
              const reached = pct >= m;
              const active = justCrossed === m;
              return (
                <View
                  key={m}
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 6,
                    backgroundColor: reached ? t.accent : t.surface,
                    borderWidth: 2,
                    borderColor: reached ? t.accent : t.rule,
                  }}
                >
                  {active ? (
                    <Animated.View
                      style={{
                        position: "absolute",
                        left: -6,
                        top: -6,
                        width: 24,
                        height: 24,
                        borderRadius: 12,
                        borderWidth: 2,
                        borderColor: t.accent,
                        opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.9] }),
                      }}
                    />
                  ) : null}
                </View>
              );
            })}
          </View>
        </View>

        {/* Footer */}
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ color: t.inkSoft, fontFamily: BTFonts.sans, fontSize: 12 }}>
            +${d.weekly}/wk auto
          </Text>
          <Text
            style={{
              color: t.inkMute,
              fontFamily: BTFonts.mono,
              fontSize: 9,
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            due · {d.due}
          </Text>
        </View>

        {/* Tilly nudge */}
        <View
          style={{
            flexDirection: "row",
            gap: 10,
            padding: 12,
            borderRadius: 14,
            backgroundColor: t.surfaceAlt,
          }}
        >
          <Tilly t={t} size={28} breathing={false} />
          <Text
            style={{
              flex: 1,
              color: t.ink,
              fontFamily: BTFonts.serifItalic,
              fontSize: 14,
              lineHeight: 20,
            }}
          >
            {d.nudge}
          </Text>
        </View>

        {/* Contribute now */}
        {onContribute ? (
          <Pressable
            onPress={onContribute}
            style={{
              borderRadius: 14,
              paddingVertical: 12,
              alignItems: "center",
              backgroundColor: t.ink,
            }}
          >
            <Text
              style={{
                color: t.surface,
                fontFamily: BTFonts.sans,
                fontWeight: "700",
                fontSize: 13,
              }}
            >
              + Move money to {d.name.length > 18 ? d.name.slice(0, 18) + "…" : d.name}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const StyleSheetAbsoluteFill = { position: "absolute" as const, top: 0, left: 0, right: 0, bottom: 0 };

function DiagonalLines() {
  const lines = [];
  for (let i = 0; i < 12; i++) {
    lines.push(
      <View
        key={i}
        style={{
          position: "absolute",
          width: 600,
          height: 2,
          left: -200,
          top: i * 24 - 60,
          backgroundColor: "#fff",
          opacity: 0.08,
          transform: [{ rotate: "-22deg" }],
        }}
      />,
    );
  }
  return (
    <View pointerEvents="none" style={{ ...StyleSheetAbsoluteFill, overflow: "hidden" }}>
      {lines}
    </View>
  );
}
