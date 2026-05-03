/**
 * Onboarding — spec §8 first-run flow.
 *
 * Five cards, paced one at a time:
 *   1. Welcome              — meet Tilly (breathing mascot, serif headline)
 *   2. Name + school        — POST /api/household/create
 *   3. Connect bank         — PlaidConnectButton (success advances)
 *   4. Name a dream         — POST /api/dreams (Phase 3 wires real persistence;
 *                              for Phase 2 the form just collects name+target
 *                              and calls the dreams endpoint, which returns 501
 *                              gracefully — onboarding still completes)
 *   5. First commitment     — "Utilization stays under 30%." Accept to seed
 *                              the first memory note + complete onboarding.
 *
 * After step 5 → POST /api/household/complete-onboarding → drop into BTApp.
 */
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useBT } from "../BTContext";
import { Tilly } from "../Tilly";
import { BTSerif, BTLabel } from "../atoms";
import { BTFonts } from "../theme";
import { PlaidConnectButton } from "@/components/PlaidConnectButton";
import {
  useCreateHousehold,
  useCompleteOnboarding,
  useOnboardingStatus,
} from "../hooks/useOnboarding";
import { useCreateDream } from "../hooks/useDreams";
import { useUser } from "../hooks/useUser";

type Step = "welcome" | "name" | "bank" | "dream" | "commit";
const STEPS: Step[] = ["welcome", "name", "bank", "dream", "commit"];

type MoneySnapshot = {
  monthlyIncome?: number;
  currentBalance?: number;
  primaryBank?: string;
};

export function Onboarding() {
  const { t } = useBT();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>("welcome");
  // Manual money snapshot collected on the bank step when the user opts
  // out of Plaid. Sent with complete-onboarding so the server can seed
  // tilly_money_snapshot + a memory row, giving Tilly real numbers from
  // turn 1 instead of $0 placeholders.
  const [moneySnapshot, setMoneySnapshot] = useState<MoneySnapshot | null>(null);

  const status = useOnboardingStatus();
  const createHousehold = useCreateHousehold();
  const createDream = useCreateDream();
  const completeOnboarding = useCompleteOnboarding();
  const { user } = useUser();
  const initialName = user?.name?.split(" ")[0] ?? "";

  const advance = (next: Step) => setStep(next);
  const stepIdx = STEPS.indexOf(step);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          padding: 28,
          paddingTop: insets.top + 32,
          paddingBottom: insets.bottom + 32,
          gap: 24,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* 5-dot step indicator — centered, no counter text. Active = accent,
            past = accentSoft, future = rule (low-contrast). */}
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 6 }}>
          {STEPS.map((_, i) => {
            const fill =
              i === stepIdx ? t.accent : i < stepIdx ? t.accentSoft : t.rule;
            return (
              <View
                key={i}
                style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: fill }}
              />
            );
          })}
        </View>

        {step === "welcome" && (
          <WelcomeCard onNext={() => advance("name")} />
        )}
        {step === "name" && (
          <NameCard
            initialName={initialName}
            isPending={createHousehold.isPending}
            onNext={(payload) =>
              createHousehold.mutate(payload, {
                onSuccess: () => advance("bank"),
              })
            }
          />
        )}
        {step === "bank" && (
          <BankCard
            connected={!!status.data?.hasPlaid}
            onNext={(snap) => {
              if (snap) setMoneySnapshot(snap);
              advance("dream");
            }}
          />
        )}
        {step === "dream" && (
          <DreamCard
            isPending={createDream.isPending}
            onNext={(payload) =>
              createDream.mutate(payload, {
                onSettled: () => advance("commit"),
              })
            }
          />
        )}
        {step === "commit" && (
          <CommitCard
            isPending={completeOnboarding.isPending}
            onNext={() =>
              completeOnboarding.mutate(
                moneySnapshot ? { moneySnapshot } : undefined,
              )
            }
          />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Cards ──────────────────────────────────────────────────────────────────

function WelcomeCard({ onNext }: { onNext: () => void }) {
  const { t } = useBT();
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 24 }}>
      <Tilly t={t} size={140} halo />
      <BTLabel color={t.inkMute}>Hi.</BTLabel>
      <BTSerif size={36} color={t.ink} weight="500" style={{ textAlign: "center" }}>
        I'm{" "}
        <Text style={{ color: t.accent, fontFamily: BTFonts.serifItalic }}>
          Tilly
        </Text>
        .
      </BTSerif>
      <Text
        style={{
          color: t.inkSoft,
          fontFamily: BTFonts.serifItalic,
          fontSize: 17,
          lineHeight: 25,
          textAlign: "center",
          maxWidth: 320,
        }}
      >
        Your money's already complicated. I'll do the watching so you don't
        have to.
      </Text>
      <PrimaryButton t={t} label="Begin" onPress={onNext} />
    </View>
  );
}

function NameCard({
  onNext,
  isPending,
  initialName,
}: {
  onNext: (p: { name: string; schoolName?: string; studentRole?: string }) => void;
  isPending: boolean;
  initialName?: string;
}) {
  const { t } = useBT();
  const [name, setName] = useState(initialName ?? "");
  const [school, setSchool] = useState("");

  // The most common case: user signed up with their name, so we prefill it
  // and lead with confirmation copy instead of asking a fresh question.
  const isPrefilled = !!initialName;

  return (
    <View style={{ gap: 18 }}>
      <BTLabel color={t.inkMute}>
        {isPrefilled ? "Quick check" : "What should I call you?"}
      </BTLabel>
      <BTSerif size={28} color={t.ink} weight="500">
        {isPrefilled
          ? "I should call you " + (name || initialName) + ", right?"
          : "Let's start with your name."}
      </BTSerif>
      <Field t={t} label="Your name" value={name} onChangeText={setName} placeholder="Maya" />
      <Field
        t={t}
        label="Where do you study? (optional)"
        value={school}
        onChangeText={setSchool}
        placeholder="NYU"
      />
      <PrimaryButton
        t={t}
        label={isPending ? "Saving…" : "Next"}
        disabled={!name.trim() || isPending}
        onPress={() =>
          onNext({
            name: name.trim(),
            schoolName: school.trim() || undefined,
          })
        }
      />
    </View>
  );
}

/**
 * Step 3 — two equally-weighted paths:
 *
 *   A) "Connect your bank"      → Plaid Link, advances on success
 *   B) "I'll tell you myself"   → reveals 3 fields (income, balance, bank
 *                                 name) and persists them as a manual
 *                                 money snapshot the server uses to seed
 *                                 a tilly_money_snapshot row + memory.
 *
 * Both options live in mirrored cards so neither feels like the
 * "consolation prize". Beta users without prod Plaid still get a Tilly
 * who knows roughly how much money they make and have on hand.
 */
function BankCard({
  connected,
  onNext,
}: {
  connected: boolean;
  onNext: (snap?: MoneySnapshot) => void;
}) {
  const { t } = useBT();
  const [mode, setMode] = useState<"choose" | "manual">("choose");
  const [income, setIncome] = useState("");
  const [balance, setBalance] = useState("");
  const [bank, setBank] = useState("");

  const parseNum = (s: string): number | undefined => {
    const n = Number(s.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };

  const submitManual = () => {
    const snap: MoneySnapshot = {
      monthlyIncome: parseNum(income),
      currentBalance: parseNum(balance),
      primaryBank: bank.trim() || undefined,
    };
    // If the user filled nothing, treat it as a true "skip" — no snapshot.
    const anything =
      snap.monthlyIncome !== undefined ||
      snap.currentBalance !== undefined ||
      !!snap.primaryBank;
    onNext(anything ? snap : undefined);
  };

  return (
    <View style={{ gap: 18 }}>
      <BTLabel color={t.inkMute}>So I can actually be useful</BTLabel>
      <BTSerif size={28} color={t.ink} weight="500">
        Two ways to{" "}
        <Text style={{ color: t.accent, fontFamily: BTFonts.serifItalic }}>
          start
        </Text>
        . Either is fine.
      </BTSerif>

      {mode === "choose" && (
        <>
          {/* Option A — Connect bank */}
          <View
            style={{
              borderWidth: 1,
              borderColor: t.rule,
              borderRadius: 16,
              padding: 18,
              gap: 12,
              backgroundColor: t.surface,
            }}
          >
            <BTLabel color={t.accent} size={10}>
              Option a — connect a bank
            </BTLabel>
            <Text
              style={{
                color: t.inkSoft,
                fontFamily: BTFonts.serifItalic,
                fontSize: 15,
                lineHeight: 22,
              }}
            >
              One minute through Plaid. I never see your password. Real
              numbers light up everywhere from day one.
            </Text>
            <PlaidConnectButton variant="hero" onConnected={() => onNext()} />
          </View>

          {/* OR divider */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: t.rule }} />
            <Text
              style={{
                color: t.inkMute,
                fontFamily: BTFonts.mono,
                fontSize: 10,
                letterSpacing: 1.5,
              }}
            >
              OR
            </Text>
            <View style={{ flex: 1, height: 1, backgroundColor: t.rule }} />
          </View>

          {/* Option B — Manual */}
          <View
            style={{
              borderWidth: 1,
              borderColor: t.rule,
              borderRadius: 16,
              padding: 18,
              gap: 12,
              backgroundColor: t.surface,
            }}
          >
            <BTLabel color={t.accent} size={10}>
              Option b — tell me yourself
            </BTLabel>
            <Text
              style={{
                color: t.inkSoft,
                fontFamily: BTFonts.serifItalic,
                fontSize: 15,
                lineHeight: 22,
              }}
            >
              Share your income and balance once and we can talk about
              real money — no bank link needed. You can connect later.
            </Text>
            <Pressable
              onPress={() => setMode("manual")}
              style={{
                alignSelf: "stretch",
                backgroundColor: t.ink,
                borderRadius: 14,
                paddingVertical: 14,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  color: t.surface,
                  fontFamily: BTFonts.sans,
                  fontSize: 14,
                  fontWeight: "700",
                }}
              >
                I'll tell you myself
              </Text>
            </Pressable>
          </View>

          {connected && (
            <Pressable
              onPress={() => onNext()}
              style={{ alignItems: "center", paddingVertical: 12 }}
            >
              <Text
                style={{
                  color: t.inkMute,
                  fontFamily: BTFonts.mono,
                  fontSize: 11,
                  letterSpacing: 1.2,
                  textTransform: "uppercase",
                }}
              >
                continue
              </Text>
            </Pressable>
          )}
        </>
      )}

      {mode === "manual" && (
        <View style={{ gap: 14 }}>
          <Text
            style={{
              color: t.inkSoft,
              fontFamily: BTFonts.serifItalic,
              fontSize: 15,
              lineHeight: 22,
            }}
          >
            Rough numbers are perfect. I'll remember what you say and we
            can update anytime in chat — "actually it's $2,800 now."
          </Text>
          <Field
            t={t}
            label="Monthly income (after tax)"
            value={income}
            onChangeText={setIncome}
            placeholder="2400"
            keyboardType="numeric"
          />
          <Field
            t={t}
            label="Roughly in checking right now"
            value={balance}
            onChangeText={setBalance}
            placeholder="612"
            keyboardType="numeric"
          />
          <Field
            t={t}
            label="Bank name (optional)"
            value={bank}
            onChangeText={setBank}
            placeholder="Chase"
          />
          <PrimaryButton t={t} label="Save & continue" onPress={submitManual} />
          <Pressable
            onPress={() => setMode("choose")}
            style={{ alignItems: "center", paddingVertical: 8 }}
          >
            <Text
              style={{
                color: t.inkMute,
                fontFamily: BTFonts.mono,
                fontSize: 11,
                letterSpacing: 1.2,
                textTransform: "uppercase",
              }}
            >
              back
            </Text>
          </Pressable>
          <Pressable
            onPress={() => onNext()}
            style={{ alignItems: "center", paddingVertical: 4 }}
          >
            <Text
              style={{
                color: t.inkMute,
                fontFamily: BTFonts.serifItalic,
                fontSize: 13,
              }}
            >
              skip — I'll tell you in chat later
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function DreamCard({
  onNext,
  isPending,
}: {
  onNext: (p: {
    name: string;
    target: number;
    glyph: string;
    gradient: [string, string];
    weeklyAuto?: number;
  }) => void;
  isPending: boolean;
}) {
  const { t } = useBT();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");

  return (
    <View style={{ gap: 18 }}>
      <BTLabel color={t.inkMute}>What are you saving toward?</BTLabel>
      <BTSerif size={28} color={t.ink} weight="500">
        Name something you{" "}
        <Text style={{ color: t.accent, fontFamily: BTFonts.serifItalic }}>
          dream
        </Text>{" "}
        about.
      </BTSerif>
      <Field
        t={t}
        label="Dream name"
        value={name}
        onChangeText={setName}
        placeholder="Barcelona spring"
      />
      <Field
        t={t}
        label="Target ($)"
        value={target}
        onChangeText={setTarget}
        placeholder="2400"
        keyboardType="numeric"
      />
      <PrimaryButton
        t={t}
        label={isPending ? "Saving…" : "Next"}
        disabled={!name.trim() || !target.trim() || isPending}
        onPress={() =>
          onNext({
            name: name.trim(),
            target: Number(target.replace(/[^0-9.]/g, "")) || 0,
            glyph: "✺",
            gradient: ["#E94B3C", "#F59E0B"], // sunset orange — Phase 5 lets the user pick
            weeklyAuto: 40,
          })
        }
      />
    </View>
  );
}

function CommitCard({ onNext, isPending }: { onNext: () => void; isPending: boolean }) {
  const { t } = useBT();
  return (
    <View style={{ gap: 18 }}>
      <BTLabel color={t.inkMute}>One rule we'll keep together</BTLabel>
      <BTSerif size={28} color={t.ink} weight="500">
        Utilization stays{" "}
        <Text style={{ color: t.accent, fontFamily: BTFonts.serifItalic }}>
          under 30%
        </Text>
        .
      </BTSerif>
      <Text
        style={{
          color: t.inkSoft,
          fontFamily: BTFonts.serifItalic,
          fontSize: 16,
          lineHeight: 23,
        }}
      >
        It's the credit-score lever lenders care about most. I'll watch it.
        If you're approaching 30%, I'll tell you what to pay to drop back
        below — never how much you "should" be spending.
      </Text>
      <PrimaryButton
        t={t}
        label={isPending ? "Setting up…" : "I agree. Let's go."}
        onPress={onNext}
        disabled={isPending}
      />
    </View>
  );
}

// ─── Atoms ──────────────────────────────────────────────────────────────────

function PrimaryButton({
  t,
  label,
  onPress,
  disabled,
}: {
  t: ReturnType<typeof useBT>["t"];
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        // alignSelf:stretch forces the button to fill the parent's cross
        // axis even when the parent uses alignItems:"center" (the welcome
        // card centers all its content, which would otherwise shrink the
        // button to just the width of its label text).
        alignSelf: "stretch",
        backgroundColor: disabled ? t.surfaceAlt : t.ink,
        borderRadius: 14,
        paddingVertical: 16,
        alignItems: "center",
      }}
    >
      <Text
        style={{
          color: disabled ? t.inkMute : t.surface,
          fontFamily: BTFonts.sans,
          fontSize: 14,
          fontWeight: "700",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Field({
  t,
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
}: {
  t: ReturnType<typeof useBT>["t"];
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "numeric";
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 8 }}>
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
        autoCapitalize={keyboardType === "numeric" ? "none" : "words"}
        style={
          {
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderRadius: 14,
            backgroundColor: t.surface,
            borderWidth: 1,
            borderColor: focused ? t.accent : t.rule,
            color: t.ink,
            fontFamily: BTFonts.sans,
            fontSize: 15,
            // Suppresses the browser's default focus ring so our borderColor
            // swap is the single focus signal. Web-only RN-web prop.
            outlineStyle: "none",
          } as any
        }
      />
    </View>
  );
}
