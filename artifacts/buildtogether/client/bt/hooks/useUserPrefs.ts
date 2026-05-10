/**
 * Reads the user's preferences (set by Tilly tools or the YOU tab) and
 * exposes typed accessors for each consumer screen.
 *
 * Pattern: every screen that reacts to a user pref reads from this hook
 * and applies its own scope/key. Tilly's chat mutation invalidates the
 * `/api/user-prefs` query whenever a toolResult of type
 * category_hidden / home_tile_pinned / payment_to_card_aliased /
 * onboarding_field_set fires.
 */
import { useQuery } from "@tanstack/react-query";
import { btApi } from "../api/client";

export function useUserPrefs() {
  const q = useQuery({
    queryKey: ["/api/user-prefs"],
    queryFn: btApi.userPrefs,
    staleTime: 30_000,
  });
  const prefs = q.data?.prefs ?? {};
  return {
    raw: prefs,
    isLoading: q.isLoading,
    /** Categories the user has asked Tilly to hide from the Spend page. */
    hiddenCategories: (Array.isArray(prefs.spend?.hide_categories)
      ? (prefs.spend!.hide_categories as string[])
      : []
    ).map((c) => c.toLowerCase()),
    /** Tiles to render on the Today screen on top of the defaults. */
    pinnedTiles: Array.isArray(prefs.today?.pinned_tiles)
      ? (prefs.today!.pinned_tiles as string[])
      : [],
    /** Onboarding fields Tilly captured via chat. */
    onboarding: (prefs.onboarding ?? {}) as Record<string, string>,
  };
}
