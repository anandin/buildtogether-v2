/**
 * Tilly — the bird mascot. Spec §3 ("Tilly's visual identity").
 *
 * SVG owl-blob built from primitive shapes per the design's `tilly.jsx`. The
 * silhouette has owl-like tufts at the crown, big white eye discs with
 * pupils + corner highlights, a diamond beak, wing-tip ovals on the sides,
 * and small oval feet. States: `idle`, `think`, `cheer`. Breathing wraps
 * her in a subtle ~2% scale loop, the single most important moment of life
 * in the UI.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Svg, { Circle, Ellipse, Path, G } from "react-native-svg";

import { BT_BREATHE_DURATION_MS, type BTTheme } from "./theme";

export type TillyState = "idle" | "think" | "cheer";

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

  // Soft, randomly-timed blink. Skipped while thinking/cheering so the state
  // change reads cleanly. ~2.2–4.6s between blinks; ~130ms eyelid-down.
  const [blink, setBlink] = useState(false);
  useEffect(() => {
    if (state !== "idle") {
      setBlink(false);
      return;
    }
    let t1: ReturnType<typeof setTimeout>;
    let t2: ReturnType<typeof setTimeout>;
    const loop = () => {
      const wait = 2200 + Math.random() * 2400;
      t1 = setTimeout(() => {
        setBlink(true);
        t2 = setTimeout(() => {
          setBlink(false);
          loop();
        }, 130);
      }, wait);
    };
    loop();
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [state]);

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

  // Subtle 2% scale + 2px lift — the design's `.tilly-breath` rule.
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.02] });
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
        <TillySvg t={t} size={size} state={state} blink={blink} />
      </Animated.View>
    </View>
  );
}

function TillySvg({
  t,
  size,
  state,
  blink,
}: {
  t: BTTheme;
  size: number;
  state: TillyState;
  blink: boolean;
}) {
  const { body, belly, beak } = t.tilly;
  // Eye whites are an off-white tied to the lighter palette tone so they
  // adapt cleanly across themes (Bloom cream vs Dusk dark interior). On dark
  // themes the belly token is dark, so we fall back to a true white when the
  // belly luminance would make the eye discs disappear.
  const eyeWhite = isDark(belly) ? "#F2EBDD" : "#FFFFFF";

  const eyeBaseY = 44;
  const thinkOffset = state === "think" ? 1 : 0;
  const pupilY = eyeBaseY + thinkOffset;
  const pupilRy = blink ? 0.6 : 4;
  const showHighlights = !blink && state !== "cheer";

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {/* Owl-ear tufts at the crown — what gives Tilly her observant
          silhouette. Without these she reads "round bird," not "calm owl." */}
      <Ellipse cx={32} cy={22} rx={6} ry={9} fill={body} transform="rotate(-18 32 22)" />
      <Ellipse cx={68} cy={22} rx={6} ry={9} fill={body} transform="rotate(18 68 22)" />

      {/* Body — full ellipse 34x36 per spec, NOT the tall narrow egg the old
          implementation used. */}
      <Ellipse cx={50} cy={56} rx={34} ry={36} fill={body} />

      {/* Belly — wide cream oval centered on the lower torso */}
      <Ellipse cx={50} cy={64} rx={22} ry={22} fill={belly} />

      {/* Eye discs — big, expressive (r=11), much larger than the prior r=3
          dots. This is the single biggest visual change. */}
      <Circle cx={38} cy={eyeBaseY} r={11} fill={eyeWhite} />
      <Circle cx={62} cy={eyeBaseY} r={11} fill={eyeWhite} />

      {/* Pupils + corner highlights, or arc smiles for the cheer state */}
      {state === "cheer" ? (
        <G>
          <Path
            d="M32 44 Q38 40 44 44"
            stroke={body}
            strokeWidth={2.4}
            fill="none"
            strokeLinecap="round"
          />
          <Path
            d="M56 44 Q62 40 68 44"
            stroke={body}
            strokeWidth={2.4}
            fill="none"
            strokeLinecap="round"
          />
        </G>
      ) : (
        <G>
          <Ellipse cx={38} cy={pupilY} rx={4} ry={pupilRy} fill={body} />
          <Ellipse cx={62} cy={pupilY} rx={4} ry={pupilRy} fill={body} />
          {showHighlights ? (
            <G>
              <Circle cx={39.5} cy={42.5} r={1.4} fill={eyeWhite} />
              <Circle cx={63.5} cy={42.5} r={1.4} fill={eyeWhite} />
            </G>
          ) : null}
        </G>
      )}

      {/* Beak — small diamond, NOT a triangle. The diamond gives her a
          deliberate, calm read; a downward triangle reads beaky/aggressive. */}
      <Path d="M50 52 L46 56 L50 60 L54 56 Z" fill={beak} />

      {/* Wing-tip ovals on each side — give her a body silhouette rather
          than a featureless egg. */}
      <Ellipse cx={20} cy={60} rx={5} ry={11} fill={body} />
      <Ellipse cx={80} cy={60} rx={5} ry={11} fill={body} />

      {/* Feet — small ovals at the bottom, beak-colored. */}
      <Ellipse cx={42} cy={92} rx={4} ry={2} fill={beak} />
      <Ellipse cx={58} cy={92} rx={4} ry={2} fill={beak} />
    </Svg>
  );
}

/** Cheap luminance check — used to flip the eye-white token for dark themes. */
function isDark(hex: string): boolean {
  if (!hex.startsWith("#") || hex.length < 7) return false;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // Quick perceived luminance — Rec. 601.
  const L = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return L < 0.5;
}
