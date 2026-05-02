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

export function Onboarding() {
  const { t } = useBT();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>("welcome");

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
            onNext={() => advance("dream")}
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
            onNext={() => completeOnboarding.mutate()}
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

function BankCard({ connected, onNext }: { connected: boolean; onNext: () => void }) {
  const { t } = useBT();
  return (
    <View style={{ gap: 18 }}>
      <BTLabel color={t.inkMute}>The hard part — done in one minute</BTLabel>
      <BTSerif size={28} color={t.ink} weight="500">
        Connect your bank so I can{" "}
        <Text style={{ color: t.accent, fontFamily: BTFonts.serifItalic }}>
          watch
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
        I never see your password. I never share your data. I'll only flag
        what's worth flagging.
      </Text>
      <PlaidConnectButton variant="hero" onConnected={onNext} />
      <Pressable onPress={onNext} style={{ alignItems: "center", paddingVertical: 12 }}>
        <Text
          style={{
            color: t.inkMute,
            fontFamily: BTFonts.mono,
            fontSize: 11,
            letterSpacing: 1.2,
            textTransform: "uppercase",
          }}
        >
          {connected ? "continue" : "skip for now"}
        </Text>
      </Pressable>
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
