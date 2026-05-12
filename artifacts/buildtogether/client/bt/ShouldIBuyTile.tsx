/**
 * ShouldIBuyTile — Sprint A core thesis surface.
 *
 * Sits at the top of Today, above the week strip. The headline asks
 * the question the app is built to answer ("thinking of buying
 * something?"); the body invites the user to name what they're eyeing
 * BEFORE the impulse fires. Two affordances:
 *
 *   [Save to watchlist]   — passive: just remember it for later. Tilly
 *                           follows up the next morning. Friction-free.
 *   [Run the math]        — active: pre-fills a "can I afford X?" line
 *                           in chat. Existing affordability flow picks
 *                           it up and returns a structured verdict.
 *
 * If the user already has watchlist items, the tile shows the count
 * ("3 things on your watch") + tap-to-expand inline list so the page
 * doesn't grow with an unused empty state.
 *
 * Per the habit-formation memory: this card IS the trained "name your
 * desire before you act" muscle. Don't bury it.
 */
import React, { useState } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";

import { useBT } from "./BTContext";
import { BTCard, BTLabel, BTSerif } from "./atoms";
import { BTFonts } from "./theme";
import {
  useAddToWatchlist,
  useUpdateWatchlistItem,
  useWatchlist,
} from "./hooks/useWatchlist";

type Props = {
  /** Hand a string back to Today's owner so it can prefill the chat
   * composer on the next nav into the Tilly tab. Today is on a
   * different tab from Guardian, so we can't directly mutate the
   * composer — instead the parent wires this through a top-level
   * shared state (or a TanStack cache stash) the next chat-screen
   * mount drains. If undefined, "Run the math" still opens chat via
   * the onOpenChat callback. */
  onOpenChatPrefilled?: (seed: string) => void;
};

export function ShouldIBuyTile({ onOpenChatPrefilled }: Props) {
  const { t } = useBT();
  const { items } = useWatchlist();
  const add = useAddToWatchlist();
  const update = useUpdateWatchlistItem();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={{ gap: 8 }}>
      <BTCard
        t={t}
        padding={18}
        style={{
          gap: 12,
          borderColor: t.accent,
          backgroundColor: t.accentSoft,
        }}
      >
        <BTLabel color={t.accent}>Thinking of buying?</BTLabel>
        <BTSerif size={22} weight="500" color={t.ink} style={{ lineHeight: 28 }}>
          Name it first.{" "}
          <Text style={{ fontFamily: BTFonts.serifItalic, color: t.accent }}>
            I'll think with you.
          </Text>
        </BTSerif>
        <Text
          style={{
            color: t.inkSoft,
            fontFamily: BTFonts.sans,
            fontSize: 13,
            lineHeight: 19,
          }}
        >
          Save it to your watchlist or run the math right now — whichever
          fits the moment.
        </Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable
            onPress={() => setOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Add something I'm thinking about buying"
            style={({ pressed }) => ({
              flex: 1,
              paddingVertical: 12,
              paddingHorizontal: 14,
              borderRadius: 12,
              backgroundColor: pressed ? t.ink : t.accent,
              alignItems: "center",
            })}
          >
            <Text
              style={{
                color: t.surface,
                fontFamily: BTFonts.sans,
                fontSize: 13,
                fontWeight: "700",
                letterSpacing: 0.3,
              }}
            >
              ADD SOMETHING
            </Text>
          </Pressable>
          {items.length > 0 ? (
            <Pressable
              onPress={() => setExpanded((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={`See your ${items.length} watchlist items`}
              style={({ pressed }) => ({
                paddingVertical: 12,
                paddingHorizontal: 14,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: t.accent,
                backgroundColor: pressed ? t.surface : "transparent",
                alignItems: "center",
                flexDirection: "row",
                gap: 6,
              })}
            >
              <Text
                style={{
                  color: t.accent,
                  fontFamily: BTFonts.sans,
                  fontSize: 13,
                  fontWeight: "700",
                }}
              >
                {items.length} on watch
              </Text>
              <Text
                style={{
                  color: t.accent,
                  fontFamily: BTFonts.mono,
                  fontSize: 12,
                }}
              >
                {expanded ? "−" : "+"}
              </Text>
            </Pressable>
          ) : null}
        </View>

        {expanded && items.length > 0 ? (
          <View style={{ gap: 8, marginTop: 4 }}>
            {items.map((it) => (
              <View
                key={it.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  backgroundColor: t.surface,
                  borderWidth: 1,
                  borderColor: t.rule,
                  gap: 10,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: t.ink,
                      fontFamily: BTFonts.serif,
                      fontSize: 15,
                    }}
                    numberOfLines={1}
                  >
                    {it.name}
                  </Text>
                  {it.estimatedPrice ? (
                    <Text
                      style={{
                        color: t.inkMute,
                        fontFamily: BTFonts.mono,
                        fontSize: 11,
                        marginTop: 2,
                      }}
                    >
                      ≈ ${Math.round(it.estimatedPrice).toLocaleString()}
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  onPress={() => {
                    const seed = it.estimatedPrice
                      ? `Can I afford ${it.name} for $${Math.round(it.estimatedPrice)}?`
                      : `Should I buy ${it.name}?`;
                    onOpenChatPrefilled?.(seed);
                  }}
                  style={({ pressed }) => ({
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    borderRadius: 999,
                    backgroundColor: pressed ? t.accent : t.accentSoft,
                  })}
                >
                  <Text
                    style={{
                      color: t.accent,
                      fontFamily: BTFonts.sans,
                      fontSize: 11,
                      fontWeight: "700",
                    }}
                  >
                    ASK TILLY
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => update.mutate({ id: it.id, status: "dropped" })}
                  hitSlop={8}
                  accessibilityLabel="Drop this from my watchlist"
                >
                  <Text style={{ color: t.inkMute, fontSize: 18 }}>×</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
      </BTCard>

      <AddModal
        visible={open}
        onClose={() => setOpen(false)}
        onSave={(name, price) => {
          add.mutate({ name, estimatedPrice: price });
          setOpen(false);
        }}
        onRunMath={(name, price) => {
          const seed = price
            ? `Can I afford ${name} for $${price}?`
            : `Should I buy ${name}?`;
          // Also save it so the next-day nudge has something to talk
          // about. The user came to Tilly for a verdict; they're
          // thinking about it — that's worth remembering either way.
          add.mutate({ name, estimatedPrice: price });
          setOpen(false);
          onOpenChatPrefilled?.(seed);
        }}
        working={add.isPending}
      />
    </View>
  );
}

function AddModal({
  visible,
  onClose,
  onSave,
  onRunMath,
  working,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (name: string, estimatedPrice?: number) => void;
  onRunMath: (name: string, estimatedPrice?: number) => void;
  working: boolean;
}) {
  const { t } = useBT();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");

  const parsedPrice = (() => {
    const cleaned = price.replace(/[^0-9.]/g, "");
    if (!cleaned) return undefined;
    const n = parseFloat(cleaned);
    return isFinite(n) && n > 0 ? n : undefined;
  })();

  const reset = () => {
    setName("");
    setPrice("");
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }}
      />
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: t.bg,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          paddingTop: 14,
          paddingBottom: 30,
          paddingHorizontal: 22,
          gap: 16,
        }}
      >
        <View style={{ alignItems: "center" }}>
          <View
            style={{
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: t.rule,
            }}
          />
        </View>

        <View>
          <BTLabel color={t.inkMute}>Thinking about</BTLabel>
          <BTSerif size={22} weight="500" color={t.ink} style={{ marginTop: 6 }}>
            What's on your mind?
          </BTSerif>
        </View>

        <View style={{ gap: 10 }}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Switch 2, Aritzia coat, Aura ring"
            placeholderTextColor={t.inkMute}
            autoFocus
            style={{
              borderWidth: 1,
              borderColor: t.rule,
              borderRadius: 12,
              paddingHorizontal: 14,
              paddingVertical: 12,
              fontFamily: BTFonts.serif,
              fontSize: 16,
              color: t.ink,
              backgroundColor: t.surface,
            }}
          />
          <TextInput
            value={price}
            onChangeText={setPrice}
            placeholder="Rough price (optional) — $0"
            placeholderTextColor={t.inkMute}
            keyboardType="decimal-pad"
            style={{
              borderWidth: 1,
              borderColor: t.rule,
              borderRadius: 12,
              paddingHorizontal: 14,
              paddingVertical: 12,
              fontFamily: BTFonts.mono,
              fontSize: 15,
              color: t.ink,
              backgroundColor: t.surface,
            }}
          />
        </View>

        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable
            disabled={!name.trim() || working}
            onPress={() => {
              onSave(name.trim(), parsedPrice);
              reset();
            }}
            style={({ pressed }) => ({
              flex: 1,
              paddingVertical: 14,
              borderRadius: 12,
              alignItems: "center",
              borderWidth: 1,
              borderColor: t.accent,
              backgroundColor: pressed ? t.accentSoft : "transparent",
              opacity: !name.trim() ? 0.5 : 1,
            })}
          >
            <Text
              style={{
                color: t.accent,
                fontFamily: BTFonts.sans,
                fontSize: 12,
                fontWeight: "700",
                letterSpacing: 0.4,
              }}
            >
              SAVE FOR LATER
            </Text>
          </Pressable>
          <Pressable
            disabled={!name.trim() || working}
            onPress={() => {
              onRunMath(name.trim(), parsedPrice);
              reset();
            }}
            style={({ pressed }) => ({
              flex: 1,
              paddingVertical: 14,
              borderRadius: 12,
              alignItems: "center",
              backgroundColor: pressed ? t.ink : t.accent,
              opacity: !name.trim() ? 0.5 : 1,
            })}
          >
            <Text
              style={{
                color: t.surface,
                fontFamily: BTFonts.sans,
                fontSize: 12,
                fontWeight: "700",
                letterSpacing: 0.4,
              }}
            >
              RUN THE MATH
            </Text>
          </Pressable>
        </View>

        <Pressable
          onPress={onClose}
          disabled={working}
          style={{ alignSelf: "center", paddingVertical: 6 }}
        >
          <Text
            style={{
              color: t.inkMute,
              fontFamily: BTFonts.sans,
              fontSize: 13,
            }}
          >
            Cancel
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}
