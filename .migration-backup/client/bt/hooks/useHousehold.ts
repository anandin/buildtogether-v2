/**
 * Surfaces the user's household + members (trusted people).
 *
 * Phase 2 wires this to GET /api/household/:id once the route lands. Until
 * then, returns the household id from the auth user and an empty members
 * array so consumers (BTProfile trusted-people section) compile.
 */
import { useUser } from "./useUser";

export function useHousehold() {
  const { user } = useUser();
  return {
    householdId: user?.householdId ?? null,
    members: [] as { id: string; name: string; role: string; scope?: string }[],
    isLoading: !user,
  };
}
