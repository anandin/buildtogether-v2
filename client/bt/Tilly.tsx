/**
 * Tilly — the bird mascot. Spec §3 ("Tilly's visual identity").
 *
 * A simple SVG bird drawn with three theme colors (body, belly, beak).
 * States: `idle` (default, gentle eyes) and `think` (looking up, used while
 * the chat is processing). Breathing wraps her in a subtle ~4% scale +
 * 2px translateY pulse, the single most important moment of life in the UI.
 */
import React, { useEffect, useRef } from "react";
import { Animated, Easing, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle, Ellipse, Path, G } from "react-native-svg";

import { BT_BREATHE_DURATION_MS, type BTTheme } from "./theme";

export type TillyState = "idle" | "think";

type TillyProps = {
  t: BTTheme;
  size?: number;
  state?: TillyState;
  /** When false, the breathing animation is paused (use for tab icons). */
  breathing?: boolean;
  /** Show a soft accent halo behind her — used on Home hero + Profile pair. */
  halo?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Tilly({
  t,
  size = 96,
  state = "idle",
  breathing = true,
  halo = false,
  style,
}: TillyProps) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!breathing) {
      pulse.setValue(0);
      return;
    }
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
  }, [breathing, pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });
  const translateY = pulse.interpolate({ inputRange: [0, 1], outputRange: [0, -2] });

  return (
    <View style={[{ width: size, height: size, alignItems: "center", justifyContent: "center" }, style]}>
      {halo ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            width: size * 1.8,
            height: size * 1.8,
            borderRadius: size,
            backgroundColor: t.accentSoft,
            opacity: 0.6,
            transform: [{ scale }],
          }}
        />
      ) : null}
      <Animated.View style={{ transform: [{ scale }, { translateY }] }}>
        <TillySvg t={t} size={size} state={state} />
      </Animated.View>
    </View>
  );
}

function TillySvg({ t, size, state }: { t: BTTheme; size: number; state: TillyState }) {
  const { body, belly, beak } = t.tilly;
  // Eye y-coordinate shifts up when "thinking" so she's looking up.
  // Eyes are intentionally small + close together — leans calm/observant
  // rather than wide-eyed cartoon.
  const eyeY = state === "think" ? 40 : 46;
  const pupilY = state === "think" ? 38.5 : 46;
  const eyeR = 3;
  const pupilR = 1.5;

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {/* Body — taller egg shape (35 high vs 28 wide) for a leaner, more
          deliberate silhouette. The 32×30 round previously read as
          "preschool round bird"; this reads "considered, calm." */}
      <Ellipse cx={50} cy={56} rx={28} ry={35} fill={body} />
      {/* Belly — narrower oval, sits lower */}
      <Ellipse cx={50} cy={70} rx={18} ry={22} fill={belly} />
      {/* Wing fold — a longer, softer curve down the side */}
      <Path
        d="M72 50 Q 78 70 68 84"
        stroke={beak}
        strokeOpacity={0.15}
        strokeWidth={1.6}
        fill="none"
        strokeLinecap="round"
      />
      {/* Subtle tuft — a single feather flick rather than the previous
          rounded crest. Reads like an idle thought rather than a kid's drawing. */}
      <Path
        d="M50 22 Q 53 14 55 20"
        stroke={beak}
        strokeOpacity={0.5}
        strokeWidth={1.8}
        fill="none"
        strokeLinecap="round"
      />
      {/* Eyes — small, close-set, expressive */}
      <G>
        <Circle cx={43} cy={eyeY} r={eyeR} fill="#FFFFFF" />
        <Circle cx={57} cy={eyeY} r={eyeR} fill="#FFFFFF" />
        <Circle cx={43} cy={pupilY} r={pupilR} fill={beak} />
        <Circle cx={57} cy={pupilY} r={pupilR} fill={beak} />
      </G>
      {/* Beak — leaner, longer triangle */}
      <Path d="M47 52 L 53 52 L 50 60 Z" fill={beak} />
      {/* Feet — a touch lower + thinner */}
      <Path d="M44 90 L 44 95 M 41 95 L 47 95" stroke={beak} strokeWidth={1.6} strokeLinecap="round" />
      <Path d="M56 90 L 56 95 M 53 95 L 59 95" stroke={beak} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}
