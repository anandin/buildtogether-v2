/**
 * BT-shaped view of the authenticated user, sitting on top of `useAuth()`.
 *
 * `householdId` is the user's `coupleId` field renamed for the BT mental
 * model. (Phase 1c migrates the underlying column name.)
 */
import { useAuth } from "@/context/AuthContext";

export function useUser() {
  const { user, isLoading, isAuthenticated, signOut } = useAuth();
  return {
    user: user
      ? {
          id: user.id,
          email: user.email,
          name: user.name,
          householdId: user.coupleId, // legacy column, BT semantics
          role: user.partnerRole,
        }
      : null,
    isLoading,
    isAuthenticated,
    signOut,
  };
}
