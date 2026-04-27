/**
 * Tilly — Guardian AI mascot. Soft owl-blob built from primitive shapes only.
 * Translated from `tilly.jsx` (design source) into React Native + react-native-svg.
 *
 * Critical features (matched 1:1 to source):
 *   - Two ear-tufts (asymmetric ellipses at 32,22 and 68,22, rotated -18° / +18°)
 *   - Body: ellipse cx=50 cy=56 rx=34 ry=36
 *   - Belly: cx=50 cy=64 rx=22 ry=22 (a circle, larger than body inner)
 *   - Eye discs: r=11 white discs
 *   - Pupils: r=4 ellipses with white catchlight at (39.5, 42.5) and (63.5, 42.5)
 *   - Beak: diamond M50 52 L46 56 L50 60 L54 56 Z
 *   - Wing tips: side ellipses cx=20/80 cy=60 rx=5 ry=11
 *   - Feet: small ellipses cx=42/58 cy=92 rx=4 ry=2 (in beak color)
 *   - States: idle / blink / think / cheer (smile-curve eyes)
 *   - Random blink loop: 130ms blink every 2200–4600ms
 *   - Think state: looks up + 3 floating dots upper-right (staggered 0.18s)
 *   - Breathing: scale 1→1.04, translateY 0→-2px, 4s ease-in-out
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
  /** When false, the breathing animation is paused (used for tab icons / static). */
  breathing?: boolean;
  /** Show a soft accent halo behind her — used on Home hero + Profile pair. */
  halo?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Tilly({
  t,
  size = 56,
  state = "idle",
  breathing = false,
  halo = false,
  style,
}: TillyProps) {
  const pulse = useRef(new Animated.Value(0)).current;
  const [blink, setBlink] = useState(false);

  // Breathing — only run when explicitly requested. The source applies it via
  // a `.tilly-breath` class on the wrapper, never on the tab icon.
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

  // Random blink loop — paused while thinking or cheering (source matches).
  useEffect(() => {
    if (state === "think" || state === "cheer") return;
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

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });
  const translateY = pulse.interpolate({ inputRange: [0, 1], outputRange: [0, -2] });

  return (
    <View
      style={[
        { width: size, height: size, alignItems: "center", justifyContent: "center" },
        style,
      ]}
    >
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
      {state === "think" ? <ThinkDots t={t} size={size} /> : null}
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
  const eyeWhite = belly; // matches source — eyeWhite = belly tone

  // Eye Y shifts down 1px when "thinking" (looking up via vertical stretch is
  // approximated by pupil offset, per source). We keep cx fixed at (38, 62).
  const pupilCY = 44 + (state === "think" ? 1 : 0);
  // Blink collapses the pupil to a tiny slit (ry → 0.5).
  const pupilRY = blink ? 0.5 : 4;
  const pupilRX = 4;

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {/* Two ear-tufts — rotated ovals (asymmetric, owl-coded) */}
      <Ellipse cx={32} cy={22} rx={6} ry={9} fill={body} transform="rotate(-18 32 22)" />
      <Ellipse cx={68} cy={22} rx={6} ry={9} fill={body} transform="rotate(18 68 22)" />

      {/* Body */}
      <Ellipse cx={50} cy={56} rx={34} ry={36} fill={body} />

      {/* Belly */}
      <Ellipse cx={50} cy={64} rx={22} ry={22} fill={belly} />

      {/* Eye discs (whites) */}
      <Circle cx={38} cy={44} r={11} fill={eyeWhite} />
      <Circle cx={62} cy={44} r={11} fill={eyeWhite} />

      {/* Pupils + catchlight (cheer state replaces them with smile-curves) */}
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
          <Ellipse cx={38} cy={pupilCY} rx={pupilRX} ry={pupilRY} fill={body} />
          <Ellipse cx={62} cy={pupilCY} rx={pupilRX} ry={pupilRY} fill={body} />
          {!blink ? (
            <G>
              <Circle cx={39.5} cy={42.5} r={1.4} fill={eyeWhite} />
              <Circle cx={63.5} cy={42.5} r={1.4} fill={eyeWhite} />
            </G>
          ) : null}
        </G>
      )}

      {/* Beak — small diamond */}
      <Path d="M50 52 L46 56 L50 60 L54 56 Z" fill={beak} />

      {/* Wing tips — side ovals */}
      <Ellipse cx={20} cy={60} rx={5} ry={11} fill={body} />
      <Ellipse cx={80} cy={60} rx={5} ry={11} fill={body} />

      {/* Feet — small flat ellipses in beak color */}
      <Ellipse cx={42} cy={92} rx={4} ry={2} fill={beak} />
      <Ellipse cx={58} cy={92} rx={4} ry={2} fill={beak} />
    </Svg>
  );
}

function ThinkDots({ t, size }: { t: BTTheme; size: number }) {
  const dots = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];

  useEffect(() => {
    const animations = dots.map((d, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 180),
          Animated.timing(d, {
            toValue: 1,
            duration: 360,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(d, {
            toValue: 0,
            duration: 360,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.delay(360),
        ]),
      ),
    );
    animations.forEach((a) => a.start());
    return () => animations.forEach((a) => a.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dotSize = Math.max(3, size / 18);
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: -size * 0.08,
        right: -size * 0.1,
        flexDirection: "row",
        gap: 2,
      }}
    >
      {dots.map((d, i) => (
        <Animated.View
          key={i}
          style={{
            width: dotSize,
            height: dotSize,
            borderRadius: dotSize,
            backgroundColor: t.tilly.body,
            opacity: d.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] }),
            transform: [{ translateY: d.interpolate({ inputRange: [0, 1], outputRange: [0, -2] }) }],
          }}
        />
      ))}
    </View>
  );
}
