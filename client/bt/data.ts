/**
 * BT_DATA — fictional student dataset matched 1:1 to `screens.jsx` source.
 *
 * Maya, NYU junior. Every screen pulls from this. Numbers + copy are
 * verbatim from the design source (rentDue 740, monthBudget 1280,
 * yearSaved $2,462 about $4.20/day, utilization 38% target 30%, etc).
 */
export type BTRecent = {
  id: number;
  who: string;
  cat: string;
  amt: number;
  time: string;
  tag?: "today" | "sub";
  flag?: boolean;
  incoming?: boolean;
};

export type BTDream = {
  id: "abroad" | "laptop" | "safety";
  name: string;
  emoji: string;
  target: number;
  saved: number;
  due: string;
};

export const BT_DATA = {
  user: {
    name: "Maya",
    school: "NYU · Junior",
    school_short: "NYU",
    balance: 412.58,
  },
  monthBudget: 1280,
  monthSpent: 868.42,
  rentDue: { amount: 740, day: "Thu", daysLeft: 2 },
  paycheck: { amount: 612, source: "Library job", day: "Fri" },
  recent: [
    { id: 1, who: "Joe Coffee", cat: "coffee", amt: 5.4, time: "7:18 AM", tag: "today" as const },
    { id: 2, who: "CitiBike monthly", cat: "transit", amt: 19.95, time: "yesterday", tag: "sub" as const },
    { id: 3, who: "Trader Joe's", cat: "groceries", amt: 38.12, time: "yesterday" },
    { id: 4, who: "DoorDash · Halal Guys", cat: "eatout", amt: 22.4, time: "Mon", flag: true },
    { id: 5, who: "Venmo · Priya (rent)", cat: "rent", amt: -370.0, time: "Mon", incoming: true },
    { id: 6, who: "Pearson eText", cat: "school", amt: 89.99, time: "Sun" },
  ] as BTRecent[],
  dreams: [
    { id: "abroad", name: "Barcelona spring", emoji: "✺", target: 2400, saved: 870, due: "Mar 2027" },
    { id: "laptop", name: "New laptop", emoji: "◇", target: 1450, saved: 1180, due: "Aug 2026" },
    { id: "safety", name: "Emergency cushion", emoji: "◉", target: 1000, saved: 412, due: "ongoing" },
  ] as BTDream[],
};

/** Home week strip (5 cards, Tue–Sat). */
export type BTDayCard = {
  d: string;
  n: string;
  label: string;
  amt: string;
  mood: "now" | "watch" | "big" | "good" | "maybe";
};

export const BT_HOME_WEEK: BTDayCard[] = [
  { d: "Tue", n: "27", label: "today", amt: "$13", mood: "now" },
  { d: "Wed", n: "28", label: "CitiBike renews", amt: "$19.95", mood: "watch" },
  { d: "Thu", n: "29", label: "Rent posts", amt: "−$370", mood: "big" },
  { d: "Fri", n: "30", label: "Paycheck", amt: "+$612", mood: "good" },
  { d: "Sat", n: "01", label: "Concert?", amt: "$90", mood: "maybe" },
];

/** Spend screen — 7-day bar chart. `today` = Sun (last col). */
export type BTSpendBar = { d: string; amt: number; mood: "normal" | "low" | "soft" | "today" };
export const BT_SPEND_DAYS: BTSpendBar[] = [
  { d: "M", amt: 24, mood: "normal" },
  { d: "T", amt: 8, mood: "low" },
  { d: "W", amt: 41, mood: "soft" },
  { d: "T", amt: 6, mood: "low" },
  { d: "F", amt: 38, mood: "soft" },
  { d: "S", amt: 18, mood: "normal" },
  { d: "S", amt: 13, mood: "today" },
];

export type BTSpendCategory = {
  name: string;
  amt: number;
  soft: boolean;
  hue: "accent" | "accent2" | "good" | "warn" | "inkSoft";
  note: string;
};
export const BT_SPEND_CATEGORIES: BTSpendCategory[] = [
  { name: "Coffee", amt: 32, soft: true, hue: "accent", note: "Wednesdays especially" },
  { name: "Late food", amt: 41, soft: true, hue: "accent2", note: "Always after 9pm" },
  { name: "Groceries", amt: 28, soft: false, hue: "good", note: "Trader Joe haul Sunday" },
  { name: "Transit", amt: 24, soft: false, hue: "inkSoft", note: "Subway + that one Uber" },
  { name: "School", amt: 23, soft: false, hue: "warn", note: "Pearson eText" },
];

/** Credit screen — utilization + score + levers. */
export const BT_CREDIT = {
  used: 190,
  limit: 500,
  utilPct: 38,
  targetPct: 30,
  score: 704,
  delta: 12,
  since: "March",
  levers: [
    { f: "Payment history", v: "100%", tone: "good" as const, note: "Never late. Keep autopay on." },
    { f: "Account age", v: "14mo", tone: "neutral" as const, note: "Don't close your sophomore card." },
    { f: "Hard inquiries", v: "1", tone: "neutral" as const, note: "Drops off in 23 months." },
  ],
  protectedNote:
    "Blocked one phishing text pretending to be Chase. Flagged a free trial converting in 4 days.",
};

/** Dream visual identity — gradients + glyph + sublabel. Source: BTDreams `visuals`. */
export const BT_DREAM_VISUALS: Record<BTDream["id"], { grad: [string, string]; glyph: string; loc: string; label: string }> = {
  abroad: { grad: ["#E94B3C", "#F59E0B"], glyph: "✺", loc: "Spain · 14 days", label: "Barcelona spring" },
  laptop: { grad: ["#6B5BD2", "#3F4DB8"], glyph: "◇", loc: "M4 Pro · 14\"", label: "New laptop" },
  safety: { grad: ["#2D7A5F", "#4FB283"], glyph: "◉", loc: "3 months rent", label: "Emergency cushion" },
};

/** Profile — Tilly's notes timeline. Source: `memories` array. */
export const BT_MEMORIES = [
  { when: "Today", text: "You skipped DoorDash twice this week. I noticed — that's real." },
  { when: "Apr 18", text: "You were anxious about rent on the 14th. We made it." },
  { when: "Mar 02", text: 'You named "Barcelona" a dream. I started moving $40 every Friday.' },
  { when: "Feb 11", text: "First credit card. We agreed: utilization stays under 30%." },
  { when: "Aug 2025", text: "You said money makes you anxious. I said okay, slow." },
];

/** Profile — trusted people. Hue maps to theme tokens at render time. */
export const BT_TRUSTED = [
  { name: "Mom", role: "sees credit + dreams", hue: "accent" as const },
  { name: "Priya", role: "splits — groceries, rent", hue: "accent2" as const },
  { name: "Jordan", role: "splits — concerts, gas", hue: "warn" as const },
];

/** Profile — quiet settings. */
export const BT_QUIET_SETTINGS: [string, string][] = [
  ["Quiet hours", "11pm — 7am"],
  ["Big-purchase alert", "> $25"],
  ["Subscription scan", "weekly"],
  ["Phishing watch", "on"],
  ["Memory", "forever — your choice"],
];

export const BT_SUGGESTED_PROMPTS = [
  "split groceries with priya",
  "what's killing my budget?",
  "is this $90 ticket okay?",
  "help me think about my first credit card",
];
