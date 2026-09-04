/**
 * PaydayAllocationCard — the product in one card (PRD §5, F1).
 *
 * Renders inside Home at the moment that already exists — a paycheque
 * landed, the pulse already pushed, the week strip already shows the
 * payday. This card gives that moment its choice:
 *
 *   $6,745 landed Thu. $4,100 is spoken for through Aug 20.
 *   $2,645 is yours to point somewhere.
 *     → Japan trip   +$275/payday   done in 15 paydays
 *     → Leave it liquid
 *
 * Why it's shaped this way: the autonomy effect comes from prospective
 * choice among LIVE options — so every row is a real fork with a real
 * consequence, "leave it liquid" is first-class, and nothing is
 * pre-selected. One tap terminates in a standing commitment (P4).
 *
 * Honesty: a commitment produces earmarks, not transfers. The verb on
 * this card is "point", never "move" or "save".
 *
 * Renders nothing when there's no recent paycheque, when income is
 * unverified (the income review card owns that state), or when there is
 * nothing to choose.
 */
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useBT } from "./BTContext";
import { BTCard, BTLabel } from "./atoms";
import { BTFonts } from "./theme";
import { btApi } from "./api/client";
import type { AllocationOption, SweepCommitment } from "./api/types";

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const shortDate = (iso: string) => {
  const [, m, d] = iso.split("-").map((n) => parseInt(n, 10));
  const months = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
  return m && d ? `${months[m - 1]} ${d}` : iso;
};
const weekday = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { weekday: "short" });
};

export function usePaydayAllocation() {
  return useQuery({
    queryKey: ["/api/tilly/payday-allocation"],
    queryFn: btApi.paydayAllocation,
    staleTime: 5 * 60_000,
  });
}

export function PaydayAllocationCard() {
  const { t } = useBT();
  const qc = useQueryClient();
  const q = usePaydayAllocation();
  const [chosenLiquid, setChosenLiquid] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/tilly/payday-allocation"] });
    qc.invalidateQueries({ queryKey: ["/api/dreams"] });
    qc.invalidateQueries({ queryKey: ["/api/tilly/today"] });
  };
  const create = useMutation({
    mutationFn: (vars: { goalId: string; amount: number }) =>
      btApi.createCommitment({ ...vars, consentFrame: "payday_allocation" }),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: (vars: { id: string; status: "active" | "paused" | "ended" }) =>
      btApi.updateCommitment(vars.id, { status: vars.status }),
    onSuccess: invalidate,
  });

  const data = q.data;
  if (!data || !data.active || data.incomeBlocked) return null;

  const { allocation, commitments } = data;
  const active = commitments.filter((c) => c.status === "active" || c.status === "paused");
  const goalOptions = allocation.options.filter((o): o is Extract<AllocationOption, { kind: "goal" }> => o.kind === "goal");

  // Standing state: the user has already pointed money somewhere.
  if (active.length > 0) {
    return (
      <BTCard t={t} alt padding={16} style={{ gap: 10 }}>
        <BTLabel color={t.inkMute} size={10}>
          Every payday
        </BTLabel>
        {active.map((c) => (
          <StandingRow
            key={c.id}
            c={c}
            name={goalOptions.find((o) => o.goalId === c.goalId)?.name ?? "your dream"}
            busy={update.isPending}
            onToggle={() => update.mutate({ id: c.id, status: c.status === "paused" ? "active" : "paused" })}
          />
        ))}
        <Text style={{ color: t.inkMute, fontFamily: BTFonts.sans, fontSize: 11, lineHeight: 16 }}>
          Set aside in Tilly's ledger each paycheque — nothing leaves your account until you move it.
        </Text>
      </BTCard>
    );
  }

  if (goalOptions.length === 0 || chosenLiquid) return null;

  const spokenFor = allocation.billsTotal + allocation.expectedVariable;
  const through = allocation.nextPaydayDate ? shortDate(allocation.nextPaydayDate) : `${allocation.cycleDays} days`;

  return (
    <BTCard t={t} alt padding={16} style={{ gap: 12 }}>
      <BTLabel color={t.inkMute} size={10}>
        Payday · {weekday(allocation.paydayDate)}
      </BTLabel>

      <Text style={{ color: t.ink, fontFamily: BTFonts.sans, fontSize: 13, lineHeight: 19 }}>
        {money(allocation.paycheckAmount)} landed. About {money(spokenFor)} is spoken for through {through}
        {allocation.billsDue[0] ? ` — ${allocation.billsDue[0].merchant} is the big one` : ""}.
      </Text>

      <Text style={{ color: t.ink, fontFamily: BTFonts.serif, fontSize: 22, lineHeight: 28 }}>
        {money(allocation.trulyFree)}
        <Text style={{ color: t.inkMute, fontFamily: BTFonts.sans, fontSize: 14 }}> is yours to point somewhere.</Text>
      </Text>

      <View style={{ gap: 8 }}>
        {goalOptions.map((o) => (
          <OptionRow
            key={o.goalId}
            title={o.name}
            amountLabel={`+${money(o.amount)} / payday`}
            consequence={
              o.paydaysSooner > 0
                ? `arrives ${o.paydaysSooner} payday${o.paydaysSooner === 1 ? "" : "s"} sooner`
                : `done in ${o.paydaysToTarget} payday${o.paydaysToTarget === 1 ? "" : "s"}`
            }
            busy={create.isPending}
            onPress={() => create.mutate({ goalId: o.goalId, amount: o.amount })}
          />
        ))}
        <OptionRow
          title="Leave it liquid"
          consequence="nothing changes — that's a fine answer"
          busy={create.isPending}
          onPress={() => setChosenLiquid(true)}
          quiet
        />
      </View>

      <Text style={{ color: t.inkMute, fontFamily: BTFonts.sans, fontSize: 11, lineHeight: 16 }}>
        Whatever you pick, I'll set it aside every payday until you tell me otherwise. Pausing is one tap.
      </Text>

      {create.isError ? (
        <Text style={{ color: t.inkMute, fontFamily: BTFonts.sans, fontSize: 11 }}>
          That didn't save — mind trying again?
        </Text>
      ) : null}
    </BTCard>
  );
}

function OptionRow({
  title,
  amountLabel,
  consequence,
  onPress,
  busy,
  quiet,
}: {
  title: string;
  amountLabel?: string;
  consequence: string;
  onPress: () => void;
  busy?: boolean;
  quiet?: boolean;
}) {
  const { t } = useBT();
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={`${title}${amountLabel ? `, ${amountLabel}` : ""}, ${consequence}`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: quiet ? t.rule : t.inkMute,
        opacity: busy ? 0.5 : 1,
      }}
    >
      <Text style={{ color: t.inkMute, fontFamily: BTFonts.sans, fontSize: 14 }}>→</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.ink, fontFamily: BTFonts.sans, fontSize: 13, fontWeight: "600" }} numberOfLines={1}>
          {title}
        </Text>
        <Text style={{ color: t.inkMute, fontFamily: BTFonts.sans, fontSize: 11 }}>{consequence}</Text>
      </View>
      {amountLabel ? (
        <Text style={{ color: t.ink, fontFamily: BTFonts.mono, fontSize: 12 }}>{amountLabel}</Text>
      ) : null}
    </Pressable>
  );
}

function StandingRow({
  c,
  name,
  busy,
  onToggle,
}: {
  c: SweepCommitment;
  name: string;
  busy?: boolean;
  onToggle: () => void;
}) {
  const { t } = useBT();
  const paused = c.status === "paused";
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: paused ? t.inkMute : t.ink, fontFamily: BTFonts.sans, fontSize: 13, fontWeight: "600" }}>
          {money(c.amount)} → {name}
        </Text>
        <Text style={{ color: t.inkMute, fontFamily: BTFonts.sans, fontSize: 11 }}>
          {paused ? "paused — picks back up when you say" : "set aside each paycheque"}
        </Text>
      </View>
      <Pressable
        onPress={onToggle}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={paused ? "Resume" : "Pause"}
        style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: t.inkMute, opacity: busy ? 0.5 : 1 }}
      >
        <Text style={{ color: t.ink, fontFamily: BTFonts.sans, fontSize: 12, fontWeight: "600" }}>
          {paused ? "Resume" : "Pause"}
        </Text>
      </Pressable>
    </View>
  );
}
