/**
 * Onboarding status hook + mutations.
 *
 * BTApp uses `useOnboardingStatus` to decide whether to render the
 * Onboarding flow or the main 6-tab shell. Each step in the onboarding
 * flow uses one of the mutations below to advance.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { btApi, type LifeContextInput } from "../api/client";

export function useLifeContext() {
  return useQuery({
    queryKey: ["/api/profile/life-context"],
    queryFn: btApi.getLifeContext,
    staleTime: 60_000,
  });
}

export function useUpdateLifeContext() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: LifeContextInput) => btApi.updateLifeContext(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/profile/life-context"] });
      qc.invalidateQueries({ queryKey: ["/api/tilly/profile"] });
      qc.invalidateQueries({ queryKey: ["/api/tilly/memory"] });
    },
  });
}

export function useOnboardingStatus() {
  return useQuery({
    queryKey: ["/api/household/onboarding-status"],
    queryFn: btApi.onboardingStatus,
    staleTime: 30_000,
  });
}

export function useCreateHousehold() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: btApi.createHousehold,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/household/onboarding-status"] });
      qc.invalidateQueries({ queryKey: ["/api/tilly/today"] });
      qc.invalidateQueries({ queryKey: ["/api/tilly/profile"] });
    },
  });
}

export function useCompleteOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: btApi.completeOnboarding,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/household/onboarding-status"] });
      // The server seeded a Tilly welcome chat message; refresh chat
      // history so it appears the moment the user lands on the chat tab.
      qc.invalidateQueries({ queryKey: ["/api/guardian/conversations"] });
      qc.invalidateQueries({ queryKey: ["/api/tilly/chat"] });
      qc.invalidateQueries({ queryKey: ["/api/tilly/profile"] });
      qc.invalidateQueries({ queryKey: ["/api/tilly/memory"] });
      qc.invalidateQueries({ queryKey: ["/api/profile/life-context"] });
    },
  });
}
