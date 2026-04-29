/**
 * BTHome — "Today" — spec §4.1 / design/screens.jsx BTHome.
 *
 * The morning briefing / night check-in. Built around a full-bleed sky
 * portrait at the top — gradient + drifting clouds + breathing 220px Tilly
 * — that sets the editorial-fintech tone before any numbers appear.
 *
 * Below the sky:
 *   "TILLY SAYS" → big serif greeting → Inter body line about the day
 *   Hero balance card (real numbers when ready, connect-bank empty state)
 *   Subscription + dream tiles when wired (real subscription = TODO Phase 5)
 *   Tilly invite pill
 *
 * The week strip and "Tilly Learned" card from the design land in a later
 * pass — both depend on real Plaid data we don't surface yet for empty
 * users, and showing them with mock content would re-introduce Maya's
 * hardcoded life. They're placeholders behind the connected-bank gate.
 */
import React, { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, ScrollView, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { useBT } from "../BTContext";
import { Tilly } from "../Tilly";
import {
  BTSerif,
  BTLabel,
  BTCard,
  BTCurrency,
  BTStripes,
} from "../atoms";
import { BTFonts, BT_BREATHE_DURATION_MS, type BTTheme } from "../theme";
import { useToday } from "../hooks/useToday";
import { useDreams } from "../hooks/useDreams";
import { useUser } from "../hooks/useUser";
import { Text } from "react-native";

type Props = { onNav?: (route: BTRoute) => void };
export type BTRoute = "home" | "guardian" | "spend" | "credit" | "dreams" | "profile";

export function BTHome({ onNav }: Props) {
  const { t, tone } = useBT();
  const today = useToday();
  const dreams = useDreams();
  const { user } = useUser();

  const today_ = today.data && today.data.ready === true ? today.data : null;
  const hasMoneyData = !!today_ && (today_.afterRent ?? 0) > 0;
  const userName = user?.name?.split(" ")[0] || "there";

  const greeting = today_?.greeting ?? tone.greeting(userName);
  const invite = today_?.tillyInvite ?? "Anything you want to think through?";

  const firstDream =
    dreams.data && dreams.data.ready === true && dreams.data.dreams.length > 0
      ? dreams.data.dreams[0]
      : null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
    >
      <SkyPortrait t={t} />

      <View style={{ padding: 22, gap: 22 }}>
        <View style={{ gap: 8 }}>
          <BTLabel color={t.accent}>Tilly says</BTLabel>
          <BTSerif size={32} color={t.ink} weight="500" style={{ lineHeight: 38 }}>
            {greeting}{" "}
            {hasMoneyData ? (
              <>
                This week is shaping up{" "}
                <Text style={{ color: t.accent, fontFamily: BTFonts.serifItalic }}>
                  gentle
                </Text>
                .
              </>
            ) : (
              <>
                I'm{" "}
                <Text style={{ color: t.accent, fontFamily: BTFonts.serifItalic }}>
                  getting ready
                </Text>{" "}
                to watch your money.
              </>
            )}
          </BTSerif>
          <Text
            style={{
              color: t.inkSoft,
              fontFamily: BTFonts.sans,
              fontSize: 14,
              lineHeight: 21,
              marginTop: 4,
            }}
          >
            {hasMoneyData
              ? `$${today_!.breathing} of breathing room. ${today_!.paycheckCopy}`
              : "Connect your bank when you're ready and your real numbers light up here. Until then, ask me anything."}
          </Text>
        </View>

        {hasMoneyData ? (
          <BTCard t={t} inverted padding={22} radius={18}>
            <BTStripes color="#fff" opacity={0.07} />
            <BTLabel color="rgba(255,255,255,0.55)">Available now</BTLabel>
            <View style={{ marginTop: 14 }}>
              <BTCurrency amount={today_!.afterRent} size={64} color="#FFFCF6" />
            </View>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "flex-end",
                marginTop: 14,
              }}
            >
              <Text
                style={{
                  color: "rgba(255,252,246,0.7)",
                  fontFamily: BTFonts.sans,
                  fontSize: 12,
                  lineHeight: 17,
                  flex: 1,
                  paddingRight: 12,
                }}
              >
                {today_!.paycheckCopy}
              </Text>
              <View
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 21,
                  backgroundColor: t.accent,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontSize: 20, color: t.ink, fontFamily: BTFonts.serif }}>↗</Text>
              </View>
            </View>
          </BTCard>
        ) : (
          <BTCard t={t} inverted padding={22} radius={18}>
            <BTStripes color="#fff" opacity={0.07} />
            <BTLabel color="rgba(255,255,255,0.55)">Step one</BTLabel>
            <BTSerif size={26} color="#FFFCF6" weight="500" style={{ marginTop: 10, lineHeight: 32 }}>
              Connect your bank so I can{" "}
              <Text style={{ color: t.accent2, fontFamily: BTFonts.serifItalic }}>
                actually watch
              </Text>
              .
            </BTSerif>
            <Text
              style={{
                color: "rgba(255,252,246,0.7)",
                fontFamily: BTFonts.sans,
                fontSize: 13,
                marginTop: 12,
                lineHeight: 19,
              }}
            >
              One minute through Plaid and your real numbers light up here.
            </Text>
          </BTCard>
        )}

        {firstDream ? (
          <Pressable onPress={() => onNav?.("dreams")}>
            <BTCard t={t} alt padding={16}>
              <BTLabel color={t.inkMute} size={10}>
                {firstDream.name}
              </BTLabel>
              <BTSerif size={20} color={t.ink} style={{ marginTop: 8 }}>
                ${firstDream.saved.toLocaleString()} of ${firstDream.target.toLocaleString()}
              </BTSerif>
              <Text
                style={{
                  color: t.inkSoft,
                  fontFamily: BTFonts.sans,
                  fontSize: 12,
                  marginTop: 4,
                }}
              >
                {firstDream.weekly > 0
                  ? `+$${firstDream.weekly}/wk auto`
                  : "Tap to set up auto-save"}
              </Text>
              <View
                style={{
                  marginTop: 14,
                  height: 4,
                  backgroundColor: t.rule,
                  borderRadius: 999,
                  overflow: "hidden",
                }}
              >
                <LinearGradient
                  colors={[t.accent, t.accent2]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{
                    width: `${Math.min(100, Math.round((firstDream.saved / Math.max(1, firstDream.target)) * 100))}%`,
                    height: "100%",
                  }}
                />
              </View>
            </BTCard>
          </Pressable>
        ) : null}

        <Pressable
          onPress={() => onNav?.("guardian")}
          accessibilityRole="button"
          accessibilityLabel="Talk to Tilly"
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            padding: 12,
            borderRadius: 999,
            backgroundColor: t.surface,
            borderWidth: 1,
            borderColor: t.rule,
          }}
        >
          <Tilly t={t} size={28} breathing={false} />
          <Text
            style={{
              flex: 1,
              color: t.inkSoft,
              fontFamily: BTFonts.serifItalic,
              fontSize: 14,
            }}
          >
            "{invite}"
          </Text>
          <Text style={{ color: t.accent, fontSize: 18, fontFamily: BTFonts.serif }}>→</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

/**
 * Sky portrait — full-bleed gradient hero per design/screens.jsx. Drifting
 * cloud blobs animate horizontally; a 220px Tilly anchored bottom-center
 * bleeds slightly into the next section for the "she's emerging" feel.
 */
function SkyPortrait({ t }: { t: BTTheme }) {
  const drift1 = useRef(new Animated.Value(0)).current;
  const drift2 = useRef(new Animated.Value(0)).current;
  const drift3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loops = [
      { v: drift1, dur: 22000, delay: 0 },
      { v: drift2, dur: 26000, delay: -3000 },
      { v: drift3, dur: 30000, delay: -6000 },
    ].map(({ v, dur, delay }) => {
      const loop = Animated.loop(
        Animated.timing(v, {
          toValue: 1,
          duration: dur,
          delay,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      );
      loop.start();
      return loop;
    });
    return () => loops.forEach((l) => l.stop());
  }, [drift1, drift2, drift3]);

  return (
    <View style={{ height: 280, position: "relative", overflow: "hidden" }}>
      <LinearGradient
        colors={[t.accent, t.accent2 ?? t.accent, t.surfaceAlt]}
        locations={[0, 0.55, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.7, y: 1 }}
        style={{ ...StyleSheetAbsoluteFill }}
      />

      {/* Sun/moon halo top-right */}
      <View
        style={{
          position: "absolute",
          top: 36,
          right: 36,
          width: 80,
          height: 80,
          borderRadius: 40,
          backgroundColor: t.bg,
          opacity: 0.45,
        }}
      />

      {/* Drifting clouds — three blurred ovals at staggered y positions */}
      {[
        { v: drift1, top: "20%", w: 220, h: 80 },
        { v: drift2, top: "44%", w: 260, h: 90 },
        { v: drift3, top: "62%", w: 200, h: 70 },
      ].map((c, i) => (
        <Animated.View
          key={i}
          pointerEvents="none"
          style={{
            position: "absolute",
            top: c.top as any,
            left: -120,
            width: c.w,
            height: c.h,
            borderRadius: c.h / 2,
            backgroundColor: t.bg,
            opacity: 0.18,
            transform: [
              {
                translateX: c.v.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-40, 480],
                }),
              },
            ],
          }}
        />
      ))}

      {/* Tilly anchor — bottom-center, breathing */}
      <View
        style={{
          position: "absolute",
          bottom: -20,
          left: 0,
          right: 0,
          alignItems: "center",
        }}
      >
        <BreathingTilly t={t} size={180} />
      </View>
    </View>
  );
}

function BreathingTilly({ t, size }: { t: BTTheme; size: number }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: BT_BREATHE_DURATION_MS / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: BT_BREATHE_DURATION_MS / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] });
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Tilly t={t} size={size} breathing={false} />
    </Animated.View>
  );
}

const StyleSheetAbsoluteFill = {
  position: "absolute" as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
};
