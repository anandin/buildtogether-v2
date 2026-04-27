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
  const eyeY = state === "think" ? 38 : 44;
  const pupilY = state === "think" ? 36 : 44;
  const eyeR = 5;
  const pupilR = 2.4;

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {/* Body — rounded oval */}
      <Ellipse cx={50} cy={58} rx={32} ry={30} fill={body} />
      {/* Belly */}
      <Ellipse cx={50} cy={66} rx={20} ry={18} fill={belly} />
      {/* Wing fold — subtle inner curve */}
      <Path
        d="M70 56 Q 78 64 70 76"
        stroke={beak}
        strokeOpacity={0.18}
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
      />
      {/* Tuft */}
      <Path
        d="M44 26 Q 50 18 56 26 Q 50 24 44 26 Z"
        fill={body}
      />
      {/* Eyes */}
      <G>
        <Circle cx={40} cy={eyeY} r={eyeR} fill="#FFFFFF" />
        <Circle cx={60} cy={eyeY} r={eyeR} fill="#FFFFFF" />
        <Circle cx={40.5} cy={pupilY} r={pupilR} fill={beak} />
        <Circle cx={60.5} cy={pupilY} r={pupilR} fill={beak} />
      </G>
      {/* Beak — small triangle */}
      <Path d="M46 52 L 54 52 L 50 58 Z" fill={beak} />
      {/* Feet */}
      <Path d="M42 88 L 42 94 M 38 94 L 46 94" stroke={beak} strokeWidth={2.2} strokeLinecap="round" />
      <Path d="M58 88 L 58 94 M 54 94 L 62 94" stroke={beak} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  );
}
