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
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import Svg, { Path, Rect } from "react-native-svg";

import { useBT } from "./BTContext";
import { Tilly } from "./Tilly";
import { BTFonts } from "./theme";
import { BTLabel, BTSerif } from "./atoms";

// Inline mic icon — matches the line-art style of the rest of the BT theme
// (Tilly, hero glyphs). Stroke colour is themed via `color` prop so the
// icon flips with light/dark surfaces.
function MicIcon({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="9" y="3" width="6" height="11" rx="3" stroke={color} strokeWidth="1.6" />
      <Path
        d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// Tiny pencil — used on the voice transcript "edit" affordance so users
// can correct STT mishears (e.g. STT writes "a dollar lunch" when they
// said "$8 lunch").
function PencilIcon({ color, size = 14 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 20h4l10-10-4-4L4 16v4z M14 6l4 4"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
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
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
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

          <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {tab === "text" ? <TextEntry onSaved={onClose} /> : null}
            {tab === "voice" ? <VoiceEntry onSaved={onClose} /> : null}
            {tab === "photo" ? <PhotoEntry onSaved={onClose} /> : null}
          </ScrollView>
        </Pressable>
      </Pressable>
      </KeyboardAvoidingView>
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
  const [editing, setEditing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
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
    setErrorMsg(null);
    voice.mutate(trimmed, {
      onSuccess: (resp: any) => {
        // Server returns needsAmount when STT didn't include a clear $.
        // Keep the modal open so the user can switch to the text tab and
        // type the corrected amount instead of silently saving $0.
        if (resp?.needsAmount) {
          setErrorMsg(
            "I logged it but couldn't tell the amount. Tap the row in Spend to set it.",
          );
          // Still close after 2s so a stuck user isn't trapped.
          setTimeout(() => {
            setTranscript("");
            setErrorMsg(null);
            onSaved();
          }, 2200);
          return;
        }
        setTranscript("");
        onSaved();
      },
      onError: (err: any) => {
        const msg =
          err?.response?.data?.error ||
          err?.message ||
          "Couldn't save that. Try again, or use text.";
        setErrorMsg(typeof msg === "string" ? msg : "Couldn't save that.");
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

  // Transcript area: read-only bubble by default, but tapping it (or the
  // "edit" affordance) flips it to a TextInput so STT mishears are
  // correctable before save. Speech-to-text on cafeteria-noisy mics often
  // turns "$8" into "a dollar" — without an edit path the only fix is
  // re-recording, which is brittle.
  return (
    <View style={{ gap: 14 }}>
      <Pressable
        onPress={() => transcript && setEditing(true)}
        accessibilityRole={transcript ? "button" : "none"}
        accessibilityLabel={transcript ? "Edit transcript" : undefined}
        style={{
          padding: 18,
          borderRadius: 14,
          backgroundColor: t.surfaceAlt,
          minHeight: 80,
          gap: 8,
        }}
      >
        {editing ? (
          <TextInput
            value={transcript}
            onChangeText={setTranscript}
            multiline
            autoFocus
            onBlur={() => setEditing(false)}
            placeholder="$8 lunch at the cafeteria"
            placeholderTextColor={t.inkMute}
            style={
              {
                color: t.ink,
                fontFamily: BTFonts.sans,
                fontSize: 15,
                lineHeight: 22,
                minHeight: 44,
                outlineStyle: "none",
                padding: 0,
              } as any
            }
          />
        ) : (
          <Text
            style={{
              color: transcript ? t.ink : t.inkMute,
              fontFamily: transcript ? BTFonts.sans : BTFonts.serifItalic,
              fontSize: 15,
              lineHeight: 22,
            }}
          >
            {transcript || "Tap the mic, then say something like \"$8 lunch at the cafeteria\"."}
          </Text>
        )}
        {transcript && !editing ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <PencilIcon color={t.inkMute} size={12} />
            <Text
              style={{
                color: t.inkMute,
                fontFamily: BTFonts.mono,
                fontSize: 10,
                letterSpacing: 1,
                textTransform: "uppercase",
              }}
            >
              tap to edit
            </Text>
          </View>
        ) : null}
      </Pressable>
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
            flexDirection: "row",
            justifyContent: "center",
            gap: 8,
          }}
        >
          {recording ? (
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: "#fff",
              }}
            />
          ) : (
            <MicIcon color="#fff" size={16} />
          )}
          <Text style={{ color: "#fff", fontFamily: BTFonts.sans, fontWeight: "700", fontSize: 14 }}>
            {recording ? "Recording — tap to stop" : "Hold to talk"}
          </Text>
        </Pressable>
      </View>
      {errorMsg ? (
        <Text
          style={{
            color: t.bad,
            fontFamily: BTFonts.serifItalic,
            fontSize: 13,
            lineHeight: 19,
          }}
        >
          {errorMsg}
        </Text>
      ) : null}
      <PrimaryButton
        label={voice.isPending ? "Tilly's thinking…" : "Save what I said"}
        onPress={submit}
        disabled={!transcript.trim() || voice.isPending}
      />
    </View>
  );
}

// Camera / gallery icons — line-art to match MicIcon + Tilly's style.
function CameraIcon({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"
        stroke={color}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <Path d="M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" stroke={color} strokeWidth="1.6" />
    </Svg>
  );
}
function ImageIcon({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="4" width="18" height="16" rx="2" stroke={color} strokeWidth="1.6" />
      <Path d="M3 17l5-5 4 4 3-3 6 6" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
      <Path d="M9 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" stroke={color} strokeWidth="1.6" />
    </Svg>
  );
}

function PhotoEntry({ onSaved }: { onSaved: () => void }) {
  const { t } = useBT();
  const photo = usePhotoExpense();
  const [preview, setPreview] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const cameraInputRef = useRef<any>(null);
  const libraryInputRef = useRef<any>(null);

  // Web file picker. `capture="environment"` on the camera input asks
  // mobile browsers to open the camera; the library input omits capture
  // so it opens the photo roll. Both share the same FileReader → dataURL
  // path so `submit()` doesn't care which was used.
  const ensureWebInput = (mode: "camera" | "library") => {
    const ref = mode === "camera" ? cameraInputRef : libraryInputRef;
    if (!ref.current) {
      const el = document.createElement("input");
      el.type = "file";
      el.accept = "image/*";
      if (mode === "camera") (el as any).capture = "environment";
      el.onchange = () => {
        const f = el.files?.[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = () => setPreview(r.result as string);
        r.readAsDataURL(f);
        // reset so picking the same file twice still fires onchange
        el.value = "";
      };
      ref.current = el;
    }
    return ref.current;
  };

  const pickFromCamera = async () => {
    if (Platform.OS === "web") {
      ensureWebInput("camera").click();
      return;
    }
    try {
      const ImagePicker = await import("expo-image-picker");
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return;
      const result = await ImagePicker.launchCameraAsync({
        base64: true,
        quality: 0.6,
        allowsEditing: false,
      });
      if (!result.canceled && result.assets?.[0]?.base64) {
        setPreview(`data:image/jpeg;base64,${result.assets[0].base64}`);
      }
    } catch (err) {
      console.warn("camera error:", err);
    }
  };

  const pickFromLibrary = async () => {
    if (Platform.OS === "web") {
      ensureWebInput("library").click();
      return;
    }
    try {
      const ImagePicker = await import("expo-image-picker");
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
      const result = await ImagePicker.launchImageLibraryAsync({
        base64: true,
        quality: 0.6,
        allowsEditing: false,
      });
      if (!result.canceled && result.assets?.[0]?.base64) {
        setPreview(`data:image/jpeg;base64,${result.assets[0].base64}`);
      }
    } catch (err) {
      console.warn("library error:", err);
    }
  };

  const submit = () => {
    if (!preview) return;
    setErrorMsg(null);
    photo.mutate(preview, {
      onSuccess: (resp: any) => {
        if (resp?.needsAmount) {
          setErrorMsg(
            "I logged the receipt but couldn't read the total. Tap the row in Spend to set it.",
          );
          setTimeout(() => {
            setPreview(null);
            setErrorMsg(null);
            onSaved();
          }, 2400);
          return;
        }
        setPreview(null);
        onSaved();
      },
      onError: (err: any) => {
        const msg =
          err?.response?.data?.error ||
          err?.message ||
          "Couldn't read that receipt. Try a clearer photo or use text.";
        setErrorMsg(typeof msg === "string" ? msg : "Couldn't save the receipt.");
      },
    });
  };

  return (
    <View style={{ gap: 14 }}>
      {preview ? (
        <View style={{ borderRadius: 14, overflow: "hidden" }}>
          {Platform.OS === "web" ? (
            // @ts-ignore — img is fine on RN-web
            <img
              src={preview}
              style={{ width: "100%", maxHeight: 240, objectFit: "cover", display: "block" }}
            />
          ) : (
            <NativeImagePreview uri={preview} />
          )}
        </View>
      ) : (
        <View style={{ flexDirection: "row", gap: 10 }}>
          <PhotoSourceTile
            label="Take a photo"
            onPress={pickFromCamera}
            icon={<CameraIcon color={t.accent} size={26} />}
          />
          <PhotoSourceTile
            label="Upload from photos"
            onPress={pickFromLibrary}
            icon={<ImageIcon color={t.accent} size={26} />}
          />
        </View>
      )}
      {preview ? (
        <View style={{ flexDirection: "row", gap: 16, justifyContent: "center" }}>
          <Pressable onPress={pickFromCamera} style={{ paddingVertical: 6 }}>
            <Text
              style={{
                color: t.inkMute,
                fontFamily: BTFonts.mono,
                fontSize: 10,
                letterSpacing: 1,
                textTransform: "uppercase",
              }}
            >
              retake
            </Text>
          </Pressable>
          <Pressable onPress={pickFromLibrary} style={{ paddingVertical: 6 }}>
            <Text
              style={{
                color: t.inkMute,
                fontFamily: BTFonts.mono,
                fontSize: 10,
                letterSpacing: 1,
                textTransform: "uppercase",
              }}
            >
              choose another
            </Text>
          </Pressable>
        </View>
      ) : null}
      {errorMsg ? (
        <Text
          style={{
            color: t.bad,
            fontFamily: BTFonts.serifItalic,
            fontSize: 13,
            lineHeight: 19,
          }}
        >
          {errorMsg}
        </Text>
      ) : null}
      <PrimaryButton
        label={photo.isPending ? "Tilly's reading the receipt…" : "Save from receipt"}
        onPress={submit}
        disabled={!preview || photo.isPending}
      />
    </View>
  );
}

function PhotoSourceTile({
  label,
  onPress,
  icon,
}: {
  label: string;
  onPress: () => void;
  icon: React.ReactNode;
}) {
  const { t } = useBT();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        flex: 1,
        paddingVertical: 24,
        paddingHorizontal: 12,
        borderRadius: 14,
        borderWidth: 1.5,
        borderStyle: "dashed",
        borderColor: t.rule,
        alignItems: "center",
        gap: 10,
      }}
    >
      {icon}
      <Text
        style={{
          color: t.inkSoft,
          fontFamily: BTFonts.serifItalic,
          fontSize: 14,
          textAlign: "center",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function NativeImagePreview({ uri }: { uri: string }) {
  // Avoid pulling RN Image at the top level so web bundles don't bloat.
  const { Image } = require("react-native") as { Image: any };
  return <Image source={{ uri }} style={{ width: "100%", height: 240 }} resizeMode="cover" />;
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
