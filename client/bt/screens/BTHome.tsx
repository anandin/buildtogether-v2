/**
 * BTHome — "Today" — spec §4.1.
 *
 * The morning briefing / night check-in. One huge serif headline; the number
 * that matters is *breathing room*, not balance.
 *
 * When the user hasn't connected a bank yet, the hero card flips to a
 * "connect to light this up" state instead of showing fake breathing-room
 * numbers. Same shape, honest content.
 */
import React from "react";
import { ScrollView, View, Pressable } from "react-native";
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
import { BTFonts } from "../theme";
import { useToday } from "../hooks/useToday";
import { useDreams } from "../hooks/useDreams";
import { useUser } from "../hooks/useUser";
import { Text } from "react-native";

type Props = { onNav?: (route: BTRoute) => void };
export type BTRoute = "home" | "guardian" | "spend" | "credit" | "dreams" | "profile";

export function BTHome({ onNav }: Props) {
  const { t, tone, time } = useBT();
  const today = useToday();
  const dreams = useDreams();
  const { user } = useUser();

  // The /api/tilly/today endpoint returns ready:true once a household exists,
  // but the numeric fields stay zero until Plaid is connected. We use that
  // distinction: server greeting/invite always render, but the hero card
  // only flips to the real numbers state when afterRent > 0.
  const today_ = today.data && today.data.ready === true ? today.data : null;
  const hasMoneyData = !!today_ && (today_.afterRent ?? 0) > 0;
  const userName = user?.name?.split(" ")[0] || "there";

  const dayLabel = today_?.dayLabel ?? defaultDayLabel(time);
  const greeting = today_?.greeting ?? tone.greeting(userName);
  const invite = today_?.tillyInvite ?? "Anything you want to think through?";

  // Pick the user's first real dream for the home tile (no Barcelona fakes).
  const firstDream =
    dreams.data && dreams.data.ready === true && dreams.data.dreams.length > 0
      ? dreams.data.dreams[0]
      : null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ padding: 22, paddingTop: 36, paddingBottom: 120, gap: 22 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Time stamp + greeting block */}
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <View style={{ flex: 1, gap: 10, paddingRight: 64 }}>
          <BTLabel color={t.inkMute}>{dayLabel}</BTLabel>
          <BTSerif size={44} color={t.ink} weight="500">
            {greeting}
          </BTSerif>
          {hasMoneyData ? (
            <BTSerif size={22} color={t.inkSoft} weight="400" style={{ maxWidth: "92%" }}>
              You have{" "}
              <Text style={{ color: t.accent, fontFamily: BTFonts.serifItalic }}>
                ${today_!.breathing}
              </Text>{" "}
              of breathing room this week.
            </BTSerif>
          ) : (
            <BTSerif size={20} color={t.inkSoft} weight="400" style={{ maxWidth: "92%" }}>
              I'm{" "}
              <Text style={{ color: t.accent, fontFamily: BTFonts.serifItalic }}>
                getting ready
              </Text>{" "}
              to watch your money.
            </BTSerif>
          )}
        </View>
        <Tilly t={t} size={84} halo />
      </View>

      {/* Hero card — real numbers when ready, connect-bank empty state otherwise */}
      {hasMoneyData ? (
        <BTCard t={t} inverted padding={22} radius={22}>
          <BTStripes color="#fff" opacity={0.07} />
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <BTLabel color="rgba(255,255,255,0.55)">After rent</BTLabel>
          </View>
          <View style={{ marginTop: 14 }}>
            <BTCurrency amount={today_!.afterRent} size={68} color="#FFFCF6" />
          </View>
          <Text
            style={{
              color: "rgba(255,252,246,0.6)",
              fontFamily: BTFonts.sans,
              fontSize: 13,
              marginTop: 10,
            }}
          >
            {today_!.paycheckCopy}
          </Text>
        </BTCard>
      ) : (
        <ConnectBankCard t={t} />
      )}

      {/* Two-tile row — only render real dream tile if the user has dreams.
          The CitiBike subscription tile was always BT_DATA mock; subscriptions
          live on the Spend tab once Plaid is wired. */}
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
                height: 6,
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

      {/* Tilly invite pill */}
      <Pressable
        onPress={() => onNav?.("guardian")}
        accessibilityRole="button"
        accessibilityLabel="Talk to Tilly"
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          padding: 14,
          borderRadius: 999,
          backgroundColor: t.surface,
          borderWidth: 1,
          borderColor: t.rule,
        }}
      >
        <Tilly t={t} size={36} breathing={false} />
        <Text
          style={{
            flex: 1,
            color: t.inkSoft,
            fontFamily: BTFonts.serifItalic,
            fontSize: 16,
          }}
        >
          {invite}
        </Text>
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: t.accentSoft,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: t.accent, fontSize: 14, fontWeight: "700" }}>→</Text>
        </View>
      </Pressable>
    </ScrollView>
  );
}

function defaultDayLabel(time: "morning" | "evening") {
  const d = new Date();
  const day = d.toLocaleDateString(undefined, { weekday: "long" });
  if (time === "morning") return `${day} morning`;
  const hh = d.getHours();
  const mm = String(d.getMinutes()).padStart(2, "0");
  const h12 = ((hh + 11) % 12) + 1;
  const ampm = hh >= 12 ? "pm" : "am";
  return `${day} · ${h12}:${mm} ${ampm}`;
}

function ConnectBankCard({ t }: { t: ReturnType<typeof useBT>["t"] }) {
  return (
    <BTCard t={t} inverted padding={22} radius={22}>
      <BTStripes color="#fff" opacity={0.07} />
      <BTLabel color="rgba(255,255,255,0.55)">Step one</BTLabel>
      <BTSerif size={28} color="#FFFCF6" weight="500" style={{ marginTop: 10, lineHeight: 34 }}>
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
        Until then I'm running on what you've told me. One minute through Plaid
        and your real numbers light up here.
      </Text>
    </BTCard>
  );
}
