/**
 * IncomeReviewCard — Phase 0 of the commitment layer.
 *
 * Every "you have room" number on Home is only as true as the income
 * side. The gap detector has always known which deposits look like
 * unclaimed income; until now the only way to act on one was to happen
 * to raise it in chat, so the live account sat misclassified for months
 * and every surplus figure downstream was wrong by half.
 *
 * Tone rules this card is bound by (PRD §3):
 *   - Never blame. A misclassified paycheque is the app's mistake, not
 *     the user's — the copy says so.
 *   - Carry information, not reassurance. Show the amount and where it
 *     currently sits so the question is answerable at a glance.
 *   - Terminate in an action. Two taps, both one-shot, no free text.
 *   - Every row must have an exit. A card that keeps asking after being
 *     answered is what gets an app closed.
 */
import React from "react";
import { Pressable, Text, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useBT } from "./BTContext";
import { BTCard, BTLabel } from "./atoms";
import { BTFonts } from "./theme";
import { btApi } from "./api/client";
import type { IncomeReview, IncomeDecisionAction } from "./api/types";

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

/** "credit_adjustment" → "credit adjustment" */
const prettyCategory = (c: string) => c.replace(/_/g, " ");

const shortDate = (iso: string) => {
  const [, m, d] = iso.split("-").map((n) => parseInt(n, 10));
  if (!m || !d) return iso;
  const months = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
  return `${months[m - 1]} ${d}`;
};

export function IncomeReviewCard({ review }: { review?: IncomeReview | null }) {
  const { t } = useBT();
  const qc = useQueryClient();

  const decide = useMutation({
    mutationFn: (vars: {
      action: IncomeDecisionAction;
      sourceName: string;
      date?: string;
      amount?: number;
    }) => btApi.decideIncome(vars),
    onSuccess: () => {
      // Income feeds the hero, the month math, the projection and the
      // spend taxonomy — invalidate all of it rather than patching the
      // one card, so the screen re-renders from server truth.
      qc.invalidateQueries({ queryKey: ["/api/tilly/today"] });
      qc.invalidateQueries({ queryKey: ["/api/tilly/income-review"] });
      qc.invalidateQueries({ queryKey: ["/api/tilly/monthly-summary"] });
      qc.invalidateQueries({ queryKey: ["/api/tilly/spend-pattern"] });
      qc.invalidateQueries({ queryKey: ["/api/tilly/categories"] });
    },
  });

  if (!review || review.clean) return null;

  const { candidates, quarantinedDeposits, confidence } = review;
  const pending = decide.isPending;

  return (
    <BTCard t={t} alt padding={16} style={{ gap: 12 }}>
      <BTLabel color={t.inkMute} size={10}>
        Income check
      </BTLabel>

      <Text
        style={{
          color: t.ink,
          fontFamily: BTFonts.sans,
          fontSize: 13,
          lineHeight: 19,
        }}
      >
        {candidates.length > 0
          ? "Some money coming in isn't counted as income yet, so I'm holding off on telling you what's spare. Two taps and I'll have it right."
          : "One deposit is big enough that I've left it out of the total. Is it income?"}
      </Text>

      {confidence.blocksSurplusClaims && confidence.reasons.length > 0 ? (
        <Text
          style={{
            color: t.inkMute,
            fontFamily: BTFonts.sans,
            fontSize: 11,
            lineHeight: 16,
          }}
        >
          {confidence.reasons[0]}
        </Text>
      ) : null}

      {candidates.map((c) => (
        <DecisionRow
          key={`cand-${c.merchant}`}
          title={c.merchant}
          detail={`${money(c.estMonthly)}/mo · now filed as ${prettyCategory(c.currentCategory)}`}
          disabled={pending}
          yesLabel="It's income"
          noLabel="Not income"
          onYes={() => decide.mutate({ action: "confirm_income", sourceName: c.merchant })}
          onNo={() => decide.mutate({ action: "not_income", sourceName: c.merchant })}
        />
      ))}

      {quarantinedDeposits.map((d) => (
        <DecisionRow
          key={`dep-${d.date}-${d.amount}`}
          title={d.merchant ?? "Large deposit"}
          detail={`${money(d.amount)} on ${shortDate(d.date)} · held out of the total`}
          disabled={pending}
          yesLabel="It's income"
          noLabel="It's a transfer"
          onYes={() =>
            decide.mutate({
              action: "confirm_deposit",
              sourceName: d.merchant ?? "large deposit",
              date: d.date,
              amount: d.amount,
            })
          }
          onNo={() =>
            decide.mutate({
              action: "deposit_is_transfer",
              sourceName: d.merchant ?? "large deposit",
            })
          }
        />
      ))}

      {decide.isError ? (
        <Text
          style={{
            color: t.inkMute,
            fontFamily: BTFonts.sans,
            fontSize: 11,
          }}
        >
          That didn't save — mind trying again?
        </Text>
      ) : null}
    </BTCard>
  );
}

function DecisionRow({
  title,
  detail,
  yesLabel,
  noLabel,
  onYes,
  onNo,
  disabled,
}: {
  title: string;
  detail: string;
  yesLabel: string;
  noLabel: string;
  onYes: () => void;
  onNo: () => void;
  disabled?: boolean;
}) {
  const { t } = useBT();
  return (
    <View style={{ gap: 8 }}>
      <View style={{ gap: 2 }}>
        <Text
          style={{
            color: t.ink,
            fontFamily: BTFonts.sans,
            fontSize: 13,
            fontWeight: "600",
          }}
          numberOfLines={1}
        >
          {title}
        </Text>
        <Text style={{ color: t.inkMute, fontFamily: BTFonts.sans, fontSize: 11 }}>
          {detail}
        </Text>
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <ChoiceButton label={yesLabel} onPress={onYes} disabled={disabled} primary />
        <ChoiceButton label={noLabel} onPress={onNo} disabled={disabled} />
      </View>
    </View>
  );
}

function ChoiceButton({
  label,
  onPress,
  disabled,
  primary,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  const { t } = useBT();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={{
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 999,
        opacity: disabled ? 0.4 : 1,
        backgroundColor: primary ? t.ink : "transparent",
        borderWidth: primary ? 0 : 1,
        borderColor: t.inkMute,
      }}
    >
      <Text
        style={{
          color: primary ? t.surface : t.ink,
          fontFamily: BTFonts.sans,
          fontSize: 12,
          fontWeight: "600",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
