import type { MouseEvent } from "react";

export const EXPO_GO_IOS_URL = "https://apps.apple.com/app/expo-go/id982107779";
export const EXPO_GO_ANDROID_URL =
  "https://play.google.com/store/apps/details?id=host.exp.exponent";
export const EXPO_GO_FALLBACK_URL = "https://expo.dev/go";

export function getDownloadUrl(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return EXPO_GO_IOS_URL;
  if (/android/.test(ua)) return EXPO_GO_ANDROID_URL;
  return EXPO_GO_FALLBACK_URL;
}

export function handleDownloadClick(
  e: MouseEvent<HTMLAnchorElement>,
): void {
  if (typeof window === "undefined") return;
  if (e.defaultPrevented) return;
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
  const target = getDownloadUrl(window.navigator.userAgent);
  if (target === e.currentTarget.href) return;
  e.preventDefault();
  window.location.href = target;
}
