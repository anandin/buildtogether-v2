/**
 * Onboarding status hook + mutations.
 *
 * BTApp uses `useOnboardingStatus` to decide whether to render the
 * Onboarding flow or the main 6-tab shell. Each step in the onboarding
 * flow uses one of the mutations below to advance.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { btApi } from "../api/client";

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
    },
  });
}
