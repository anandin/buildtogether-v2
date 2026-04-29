/**
 * Curated dictionary of merchant → cancel/manage URL.
 *
 * The lookup is fuzzy on the merchant name (case-insensitive substring)
 * because Plaid's recurring stream names are noisy ("CITIBIKE *MEMBERSHIP",
 * "Apple TV Plus", etc.). When we don't recognize a merchant, the UI
 * falls back to opening a Google search for "<merchant> cancel
 * subscription" — a calm, predictable last resort.
 */
type CancelLink = {
  url: string;
  /** What we render as the action verb. "cancel" / "manage" / "review". */
  verb: "cancel" | "manage" | "review";
  /** Where the user lands. "{merchant}'s subscriptions page" etc. */
  surface: string;
};

const ENTRIES: { match: RegExp; link: CancelLink }[] = [
  // Streaming
  {
    match: /netflix/i,
    link: { url: "https://www.netflix.com/cancelplan", verb: "cancel", surface: "Netflix's cancel page" },
  },
  {
    match: /spotify/i,
    link: { url: "https://www.spotify.com/account/subscription/", verb: "manage", surface: "your Spotify subscription page" },
  },
  {
    match: /apple\s*(tv|music|one|arcade|fitness|news\+?)|itunes|app\s*store/i,
    link: { url: "https://apps.apple.com/account/subscriptions", verb: "manage", surface: "Apple's subscriptions page" },
  },
  {
    match: /hulu/i,
    link: { url: "https://www.hulu.com/account", verb: "manage", surface: "Hulu account settings" },
  },
  {
    match: /disney\+?|disneyplus/i,
    link: { url: "https://www.disneyplus.com/account/subscription", verb: "cancel", surface: "Disney+ subscription page" },
  },
  {
    match: /youtube\s*(premium|tv)?/i,
    link: { url: "https://www.youtube.com/paid_memberships", verb: "manage", surface: "YouTube paid memberships" },
  },
  {
    match: /amazon\s*prime|prime\s*video/i,
    link: {
      url: "https://www.amazon.com/gp/your-account/order-history?filter=prime",
      verb: "manage",
      surface: "Amazon Prime membership page",
    },
  },
  {
    match: /max\b|hbomax|hbo\s*max/i,
    link: { url: "https://www.max.com/account", verb: "manage", surface: "Max account settings" },
  },
  {
    match: /paramount\+?|paramountplus/i,
    link: { url: "https://www.paramountplus.com/account/", verb: "manage", surface: "Paramount+ account" },
  },
  {
    match: /peacock/i,
    link: { url: "https://www.peacocktv.com/account/plans", verb: "manage", surface: "Peacock plans" },
  },
  // Transit / micromobility
  {
    match: /citi\s*bike|citibike/i,
    link: { url: "https://account.citibikenyc.com/profile/manage-membership", verb: "manage", surface: "Citi Bike membership page" },
  },
  {
    match: /lime|bird/i,
    link: { url: "https://www.li.me/account", verb: "manage", surface: "Lime account" },
  },
  // Productivity / cloud
  {
    match: /icloud|apple\s*one\b/i,
    link: { url: "https://apps.apple.com/account/subscriptions", verb: "manage", surface: "Apple's subscriptions page" },
  },
  {
    match: /google\s*one|google\s*storage/i,
    link: { url: "https://one.google.com/storage", verb: "manage", surface: "Google One" },
  },
  {
    match: /dropbox/i,
    link: { url: "https://www.dropbox.com/account/plan", verb: "manage", surface: "your Dropbox plan" },
  },
  {
    match: /notion/i,
    link: { url: "https://www.notion.so/my-account", verb: "manage", surface: "Notion account" },
  },
  // News / fitness
  {
    match: /nyt|new\s*york\s*times/i,
    link: { url: "https://myaccount.nytimes.com/seg/subscription", verb: "manage", surface: "NYT subscription" },
  },
  {
    match: /strava/i,
    link: { url: "https://www.strava.com/settings/billing", verb: "manage", surface: "Strava billing" },
  },
  {
    match: /peloton/i,
    link: { url: "https://members.onepeloton.com/preferences/membership", verb: "manage", surface: "Peloton membership" },
  },
];

export function findCancelLink(merchant: string): CancelLink {
  for (const e of ENTRIES) {
    if (e.match.test(merchant)) return e.link;
  }
  // Last-resort: search. We render this as "review" so the copy reads
  // honest: "Review on Google →" rather than promising a real cancel page.
  return {
    url: `https://www.google.com/search?q=${encodeURIComponent(`${merchant} cancel subscription`)}`,
    verb: "review",
    surface: "Google for cancel steps",
  };
}
