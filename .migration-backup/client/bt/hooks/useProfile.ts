/**
 * Drives BTProfile — spec §4.6.
 *
 * Returns the user's name, days-with-Tilly count, school/role, current tone,
 * and trusted-people list — everything the profile screen needs to stop
 * reading like Maya's hardcoded life.
 */
import { useQuery } from "@tanstack/react-query";
import { btApi } from "../api/client";

export function useProfile() {
  return useQuery({
    queryKey: ["/api/tilly/profile"],
    queryFn: btApi.profile,
    staleTime: 60_000,
  });
}
