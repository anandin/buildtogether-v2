/**
 * AddExpenseModal — Spend FAB target. Three entry tabs:
 *   Text  — type "$5 coffee at stumptown" → LLM parses → expense saved
 *   Voice — browser SpeechRecognition (web) / native voice (RN) → same parser
 *   Photo — pick a receipt image → vision LLM → expense saved
 *
 * For users without Plaid, this is THE way money flows into the spend
 * pattern engine. Voice and photo skip Plaid entirely — Tilly still
 * notices patterns from manual data, just slower.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { useBT } from "./BTContext";
import { Tilly } from "./Tilly";
import { BTFonts } from "./theme";
import { BTLabel, BTSerif } from "./atoms";
import {
  useCreateExpense,
  useVoiceExpense,
  usePhotoExpense,
} from "./hooks/useExpenses";

type Tab = "text" | "voice" | "photo";

export function AddExpenseModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { t } = useBT();
  const [tab, setTab] = useState<Tab>("text");

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}
        onPress={onClose}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: t.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: 22,
            paddingBottom: 36,
            gap: 16,
            maxHeight: "90%",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Tilly t={t} size={28} breathing={false} />
            <BTLabel color={t.inkMute}>Log a purchase</BTLabel>
            <View style={{ flex: 1 }} />
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={{ padding: 4 }}
            >
              <Text style={{ color: t.inkSoft, fontSize: 20 }}>×</Text>
            </Pressable>
          </View>
          <BTSerif size={26} color={t.ink} weight="500">
            What did you{" "}
            <Text style={{ color: t.accent, fontFamily: BTFonts.serifItalic }}>
              just spend
            </Text>
            ?
          </BTSerif>

          {/* Tab strip */}
          <View
            style={{
              flexDirection: "row",
              backgroundColor: t.surfaceAlt,
              borderRadius: 999,
              padding: 4,
            }}
          >
            {(["text", "voice", "photo"] as Tab[]).map((k) => {
              const active = tab === k;
              return (
                <Pressable
                  key={k}
                  onPress={() => setTab(k)}
                  accessibilityRole="button"
                  accessibilityLabel={`Use ${k} input`}
                  style={{
                    flex: 1,
                    paddingVertical: 8,
                    borderRadius: 999,
                    backgroundColor: active ? t.ink : "transparent",
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      color: active ? t.surface : t.inkSoft,
                      fontFamily: BTFonts.sans,
                      fontWeight: "700",
                      fontSize: 12,
                      textTransform: "uppercase",
                      letterSpacing: 1,
                    }}
                  >
                    {k}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
            {tab === "text" ? <TextEntry onSaved={onClose} /> : null}
            {tab === "voice" ? <VoiceEntry onSaved={onClose} /> : null}
            {tab === "photo" ? <PhotoEntry onSaved={onClose} /> : null}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function TextEntry({ onSaved }: { onSaved: () => void }) {
  const { t } = useBT();
  const [raw, setRaw] = useState("");
  const create = useCreateExpense();
  const submit = () => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    create.mutate(
      { raw: trimmed, source: "manual_text" },
      {
        onSuccess: () => {
          setRaw("");
          onSaved();
        },
      },
    );
  };
  return (
    <View style={{ gap: 12 }}>
      <BTLabel color={t.inkMute}>Just say it plainly</BTLabel>
      <TextInput
        value={raw}
        onChangeText={setRaw}
        placeholder="$5 coffee at stumptown"
        placeholderTextColor={t.inkMute}
        autoFocus
        onSubmitEditing={submit}
        style={
          {
            paddingHorizontal: 14,
            paddingVertical: 14,
            borderRadius: 14,
            backgroundColor: t.surfaceAlt,
            color: t.ink,
            fontFamily: BTFonts.sans,
            fontSize: 16,
            outlineStyle: "none",
          } as any
        }
      />
      <Text
        style={{
          color: t.inkMute,
          fontFamily: BTFonts.sans,
          fontSize: 11,
          lineHeight: 16,
        }}
      >
        I'll figure out the merchant + category. Try "$22 doordash halal guys"
        or "trader joes $38 groceries".
      </Text>
      <PrimaryButton
        label={create.isPending ? "Saving…" : "Log it"}
        onPress={submit}
        disabled={!raw.trim() || create.isPending}
      />
    </View>
  );
}

function VoiceEntry({ onSaved }: { onSaved: () => void }) {
  const { t } = useBT();
  const [transcript, setTranscript] = useState("");
  const [recording, setRecording] = useState(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  const recRef = useRef<any>(null);
  const voice = useVoiceExpense();

  useEffect(() => {
    if (Platform.OS !== "web") {
      setSupported(false);
      return;
    }
    const SR =
      (typeof window !== "undefined" &&
        ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)) ||
      null;
    setSupported(!!SR);
  }, []);

  const start = () => {
    if (Platform.OS !== "web") return;
    const SR =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e: any) => {
      let txt = "";
      for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript;
      setTranscript(txt);
    };
    rec.onend = () => setRecording(false);
    rec.onerror = () => setRecording(false);
    rec.start();
    recRef.current = rec;
    setRecording(true);
  };

  const stop = () => {
    recRef.current?.stop();
    setRecording(false);
  };

  const submit = () => {
    const trimmed = transcript.trim();
    if (!trimmed) return;
    voice.mutate(trimmed, {
      onSuccess: () => {
        setTranscript("");
        onSaved();
      },
    });
  };

  if (supported === false) {
    return (
      <View style={{ gap: 10 }}>
        <Text
          style={{
            color: t.inkSoft,
            fontFamily: BTFonts.serifItalic,
            fontSize: 15,
            lineHeight: 22,
          }}
        >
          Voice capture works in the mobile build (and Chrome/Edge on the web).
          Try the text tab for now.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 14 }}>
      <View
        style={{
          padding: 18,
          borderRadius: 14,
          backgroundColor: t.surfaceAlt,
          minHeight: 80,
        }}
      >
        <Text
          style={{
            color: transcript ? t.ink : t.inkMute,
            fontFamily: transcript ? BTFonts.sans : BTFonts.serifItalic,
            fontSize: 15,
            lineHeight: 22,
          }}
        >
          {transcript || "Tap mic, then say something like \"$8 lunch at the bodega\"."}
        </Text>
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Pressable
          onPress={recording ? stop : start}
          accessibilityRole="button"
          accessibilityLabel={recording ? "Stop recording" : "Start recording"}
          style={{
            flex: 1,
            paddingVertical: 14,
            borderRadius: 14,
            backgroundColor: recording ? t.bad : t.accent,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#fff", fontFamily: BTFonts.sans, fontWeight: "700", fontSize: 14 }}>
            {recording ? "● Recording — tap to stop" : "🎙  Hold to talk"}
          </Text>
        </Pressable>
      </View>
      <PrimaryButton
        label={voice.isPending ? "Tilly's thinking…" : "Save what I said"}
        onPress={submit}
        disabled={!transcript.trim() || voice.isPending}
      />
    </View>
  );
}

function PhotoEntry({ onSaved }: { onSaved: () => void }) {
  const { t } = useBT();
  const photo = usePhotoExpense();
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Web-only: file picker. On native, this would route through Expo
  // ImagePicker; we'll wire that in the EAS build pass.
  const pickFile = () => {
    if (Platform.OS !== "web") return;
    if (!fileInputRef.current) {
      const el = document.createElement("input");
      el.type = "file";
      el.accept = "image/*";
      el.capture = "environment" as any;
      el.onchange = () => {
        const f = el.files?.[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = () => setPreview(r.result as string);
        r.readAsDataURL(f);
      };
      fileInputRef.current = el;
    }
    fileInputRef.current.click();
  };

  const submit = () => {
    if (!preview) return;
    photo.mutate(preview, {
      onSuccess: () => {
        setPreview(null);
        onSaved();
      },
    });
  };

  if (Platform.OS !== "web") {
    return (
      <Text
        style={{
          color: t.inkSoft,
          fontFamily: BTFonts.serifItalic,
          fontSize: 15,
          lineHeight: 22,
        }}
      >
        Receipt scanning lights up in the mobile build. For now, log via text.
      </Text>
    );
  }

  return (
    <View style={{ gap: 14 }}>
      {preview ? (
        <View style={{ borderRadius: 14, overflow: "hidden" }}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          {/* @ts-ignore — img is fine on RN-web */}
          <img
            src={preview}
            style={{ width: "100%", maxHeight: 240, objectFit: "cover", display: "block" }}
          />
        </View>
      ) : (
        <Pressable
          onPress={pickFile}
          accessibilityRole="button"
          accessibilityLabel="Pick a receipt"
          style={{
            paddingVertical: 32,
            borderRadius: 14,
            borderWidth: 1.5,
            borderStyle: "dashed",
            borderColor: t.rule,
            alignItems: "center",
            gap: 8,
          }}
        >
          <Text style={{ color: t.accent, fontSize: 28 }}>📷</Text>
          <Text style={{ color: t.inkSoft, fontFamily: BTFonts.serifItalic, fontSize: 15 }}>
            Tap to pick a receipt
          </Text>
        </Pressable>
      )}
      {preview ? (
        <Pressable onPress={pickFile} style={{ alignSelf: "center", paddingVertical: 6 }}>
          <Text
            style={{
              color: t.inkMute,
              fontFamily: BTFonts.mono,
              fontSize: 10,
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            change photo
          </Text>
        </Pressable>
      ) : null}
      <PrimaryButton
        label={photo.isPending ? "Tilly's reading the receipt…" : "Save from receipt"}
        onPress={submit}
        disabled={!preview || photo.isPending}
      />
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { t } = useBT();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        backgroundColor: disabled ? t.surfaceAlt : t.ink,
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
      }}
    >
      <Text
        style={{
          color: disabled ? t.inkMute : t.surface,
          fontFamily: BTFonts.sans,
          fontWeight: "700",
          fontSize: 14,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
