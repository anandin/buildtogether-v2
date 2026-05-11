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

/**
 * Honey-owl palette — applied ONLY when the user is on the dusk
 * theme. Dusk's warm dark background needs Tilly to read as a
 * grounded honey owl with a defined face mask, beak shadow, and
 * cheek blush; the theme-tinted variant was reading as uncanny
 * there specifically. Other themes keep the original t.tilly tints
 * (with the dark-socket / sleepy-lid tweaks for the rest of the
 * dark themes).
 */
const TILLY_DUSK = {
  body: "#E5C896",          // honey/oat main fill
  bodyHighlight: "#F0DCB4", // brighter band along the upper body
  bodyShadow: "#B8966A",    // rim shadow along the lower body
  mask: "#2A1E18",          // warm-espresso face mask around the eyes
  beak: "#D89048",          // amber beak
  beakShadow: "#B87038",    // beak underside shadow for depth
  blush: "#E89878",         // peach cheek blush
  eye: "#FFF4DC",           // cream eye disc (NOT pure white)
  pupil: "#1F1612",         // near-black-warm pupil
} as const;

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
  if (t.name === "dusk") {
    return <TillyHoneyOwl size={size} state={state} blink={blink} />;
  }
  return <TillyThemedOwl t={t} size={size} state={state} blink={blink} />;
}

/** Dusk-only variant — honey palette applied to the SAME shape as
 * the other themes. Earlier dusk experiment added a face mask + cheek
 * blush + beak shadow + highlight bands, which changed the silhouette
 * away from the canonical Tilly. User flagged it — back to the
 * standard primitives, just recoloured to honey/cream/amber. */
function TillyHoneyOwl({
  size,
  state,
  blink,
}: {
  size: number;
  state: TillyState;
  blink: boolean;
}) {
  const eyeBaseY = 44;
  const thinkOffset = state === "think" ? 1 : 0;
  const pupilY = eyeBaseY + thinkOffset;
  const pupilRy = blink ? 0.6 : 4;
  const showHighlights = !blink && state !== "cheer";
  const T = TILLY_DUSK;

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Ellipse cx={32} cy={22} rx={6} ry={9} fill={T.body} transform="rotate(-18 32 22)" />
      <Ellipse cx={68} cy={22} rx={6} ry={9} fill={T.body} transform="rotate(18 68 22)" />

      <Ellipse cx={50} cy={56} rx={34} ry={36} fill={T.body} />
      {/* Belly — using the warm-espresso "mask" token as a lower-body
          accent the same way other themes use t.tilly.belly. Wider
          oval positioned low so it doesn't reach the eyes — no face
          mask, no shape change. */}
      <Ellipse cx={50} cy={64} rx={22} ry={22} fill={T.mask} />

      <Circle cx={38} cy={eyeBaseY} r={11} fill={T.eye} />
      <Circle cx={62} cy={eyeBaseY} r={11} fill={T.eye} />

      {state === "cheer" ? (
        <G>
          <Path d="M32 44 Q38 40 44 44" stroke={T.pupil} strokeWidth={2.4} fill="none" strokeLinecap="round" />
          <Path d="M56 44 Q62 40 68 44" stroke={T.pupil} strokeWidth={2.4} fill="none" strokeLinecap="round" />
        </G>
      ) : (
        <G>
          <Ellipse cx={38} cy={pupilY} rx={4} ry={pupilRy} fill={T.pupil} />
          <Ellipse cx={62} cy={pupilY} rx={4} ry={pupilRy} fill={T.pupil} />
          {showHighlights ? (
            <G>
              <Circle cx={39.5} cy={42.5} r={1.4} fill={T.eye} />
              <Circle cx={63.5} cy={42.5} r={1.4} fill={T.eye} />
            </G>
          ) : null}
        </G>
      )}

      <Path d="M50 52 L46 56 L50 60 L54 56 Z" fill={T.beak} />

      <Ellipse cx={20} cy={60} rx={5} ry={11} fill={T.body} />
      <Ellipse cx={80} cy={60} rx={5} ry={11} fill={T.body} />

      <Ellipse cx={42} cy={92} rx={4} ry={2} fill={T.beak} />
      <Ellipse cx={58} cy={92} rx={4} ry={2} fill={T.beak} />
    </Svg>
  );
}

/** Original theme-tinted owl — used for bloom, citrus, neon. Keeps the
 * dark-socket + sleepy-lid fixes for dark themes (currently just neon
 * since dusk has the honey variant). */
function TillyThemedOwl({
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
  const isDarkTheme = isDark(t.bg);

  const eyeDiscFill = isDarkTheme
    ? belly
    : isDark(belly) ? "#F2EBDD" : "#FFFFFF";
  const pupilFill = body;
  const highlightFill = isDarkTheme ? body : (isDark(belly) ? "#F2EBDD" : "#FFFFFF");

  const eyeR = isDarkTheme ? 9 : 11;
  const defaultPupilRy = isDarkTheme ? 2.5 : 4;

  const eyeBaseY = 44;
  const thinkOffset = state === "think" ? 1 : 0;
  const pupilY = eyeBaseY + thinkOffset;
  const pupilRy = blink ? 0.6 : defaultPupilRy;
  const showHighlights = !blink && state !== "cheer";

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Ellipse cx={32} cy={22} rx={6} ry={9} fill={body} transform="rotate(-18 32 22)" />
      <Ellipse cx={68} cy={22} rx={6} ry={9} fill={body} transform="rotate(18 68 22)" />

      <Ellipse cx={50} cy={56} rx={34} ry={36} fill={body} />
      <Ellipse cx={50} cy={64} rx={22} ry={22} fill={belly} />

      <Circle cx={38} cy={eyeBaseY} r={eyeR} fill={eyeDiscFill} />
      <Circle cx={62} cy={eyeBaseY} r={eyeR} fill={eyeDiscFill} />

      {state === "cheer" ? (
        <G>
          <Path d="M32 44 Q38 40 44 44" stroke={pupilFill} strokeWidth={2.4} fill="none" strokeLinecap="round" />
          <Path d="M56 44 Q62 40 68 44" stroke={pupilFill} strokeWidth={2.4} fill="none" strokeLinecap="round" />
        </G>
      ) : (
        <G>
          <Ellipse cx={38} cy={pupilY} rx={4} ry={pupilRy} fill={pupilFill} />
          <Ellipse cx={62} cy={pupilY} rx={4} ry={pupilRy} fill={pupilFill} />
          {showHighlights ? (
            <G>
              <Circle cx={39.5} cy={42.5} r={1.4} fill={highlightFill} />
              <Circle cx={63.5} cy={42.5} r={1.4} fill={highlightFill} />
            </G>
          ) : null}
        </G>
      )}

      <Path d="M50 52 L46 56 L50 60 L54 56 Z" fill={beak} />

      <Ellipse cx={20} cy={60} rx={5} ry={11} fill={body} />
      <Ellipse cx={80} cy={60} rx={5} ry={11} fill={body} />

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
