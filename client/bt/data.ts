/**
 * BT_DATA — mock data shape per spec §7 ("Mock data shape").
 *
 * The screens are designed around a single fictional student (Maya, NYU
 * junior). The values match the screens described in §4 so the UI feels
 * authored, not generic.
 */
export type BTRecent = {
  id: string;
  who: string;
  cat: string;
  amt: number;
  time: string;
  tag?: string;
  incoming?: boolean;
  flag?: "soft-spot" | "subscription" | "phishing";
};

export type BTDream = {
  id: string;
  name: string;
  glyph: string;
  loc: string;
  target: number;
  saved: number;
  weekly: number;
  due: string;
  gradient: [string, string];
  nudge: string;
};

export type BTMemoryNote = {
  id: string;
  date: string;
  body: string;
  recent?: boolean;
};

export type BTTrustedPerson = {
  id: string;
  name: string;
  rel: string;
  scope: string;
  hue: "accent" | "accent2" | "warn";
};

export type BTSpendCategory = {
  id: string;
  name: string;
  hue: "accent" | "accent2" | "good" | "warn" | "inkSoft";
  context: string;
  amt: number;
  softSpot?: boolean;
};

export type BTDayBar = { d: string; amt: number; soft?: boolean; today?: boolean };

export const BT_DATA = {
  user: { name: "Maya", school: "NYU", school_short: "NYU", balance: 412.58 },
  monthBudget: 1200,
  rentDue: { amount: 950, day: "Thursday", daysLeft: 2 },
  paycheck: { amount: 612, source: "Campus job", day: "Friday" },

  hero: {
    breathing: 312,
    afterRent: 412.58,
    paycheckCopy: "After Thursday rent · Friday paycheck +$612",
  },

  homeTiles: [
    {
      id: "subs",
      kind: "subscription" as const,
      title: "CitiBike renews tomorrow",
      sub: "Used twice in 30 days",
      cta: "Pause $19.95",
    },
    {
      id: "dream",
      kind: "dream" as const,
      title: "Barcelona fund",
      sub: "+$40 moves Friday",
      saved: 870,
      target: 2400,
    },
  ],

  week: {
    spent: 148,
    headline: "Wednesdays are still your soft spot.",
    bars: [
      { d: "M", amt: 12 },
      { d: "T", amt: 18 },
      { d: "W", amt: 41, soft: true },
      { d: "T", amt: 14 },
      { d: "F", amt: 28, soft: true },
      { d: "S", amt: 19 },
      { d: "S", amt: 16, today: true },
    ] as BTDayBar[],
  },

  spendCategories: [
    {
      id: "coffee",
      name: "Coffee",
      hue: "accent",
      context: "Wednesdays especially",
      amt: 32,
      softSpot: true,
    },
    {
      id: "late",
      name: "Late food",
      hue: "good",
      context: "Always after 9pm",
      amt: 41,
      softSpot: true,
    },
    {
      id: "groc",
      name: "Groceries",
      hue: "accent2",
      context: "Trader Joe haul Sunday",
      amt: 28,
    },
    {
      id: "tx",
      name: "Transit",
      hue: "inkSoft",
      context: "Subway + that one Uber",
      amt: 24,
    },
    {
      id: "school",
      name: "School",
      hue: "warn",
      context: "Pearson eText",
      amt: 23,
    },
  ] as BTSpendCategory[],

  recent: [
    { id: "r1", who: "Stumptown", cat: "Coffee", amt: 5.5, time: "today · 8:14 am" },
    { id: "r2", who: "DoorDash", cat: "Late food", amt: 22.4, time: "yesterday · 10:42 pm", tag: "soft spot" },
    { id: "r3", who: "Trader Joe's", cat: "Groceries", amt: 28.0, time: "Sun · 5:10 pm" },
    { id: "r4", who: "Campus job", cat: "Income", amt: 612, time: "Fri · 9:00 am", incoming: true },
  ] as BTRecent[],

  credit: {
    used: 190,
    limit: 500,
    pct: 38,
    target: 30,
    score: 704,
    delta: 12,
    since: "March",
    payment: { ratio: "100%", state: "good", note: "Never late. Keep autopay on." },
    age: { value: "14mo", state: "neutral", note: "Don't close your sophomore card." },
    inquiries: { value: "1", state: "neutral", note: "Drops off in 23 months." },
    protected: [
      "Blocked one phishing text pretending to be Chase.",
      "Flagged a free trial converting in 4 days.",
    ],
  },

  dreams: [
    {
      id: "d1",
      name: "Barcelona spring",
      loc: "Spring break · Mar 12",
      glyph: "✺",
      target: 2400,
      saved: 870,
      weekly: 40,
      due: "Mar 5",
      gradient: ["#E94B3C", "#F59E0B"],
      nudge: "Skip two takeout meals a week and Barcelona arrives Feb 18 instead of March 5.",
    },
    {
      id: "d2",
      name: "New laptop",
      loc: "Senior year",
      glyph: "◇",
      target: 1400,
      saved: 720,
      weekly: 25,
      due: "Aug 28",
      gradient: ["#6B5BD2", "#3F4DB8"],
      nudge: "You're 51% there. Two paychecks puts you over half.",
    },
    {
      id: "d3",
      name: "Emergency cushion",
      loc: "Just-in-case",
      glyph: "◉",
      target: 1000,
      saved: 480,
      weekly: 30,
      due: "Year-round",
      gradient: ["#2D7A5F", "#4FB283"],
      nudge: "Almost halfway. I'll keep moving $30 quietly each Friday.",
    },
  ] as BTDream[],

  yearSaved: 2462,
  perDay: 4.2,

  memory: [
    { id: "m1", date: "Today", body: "You skipped DoorDash twice this week. I noticed — that's real.", recent: true },
    { id: "m2", date: "Apr 18", body: "You were anxious about rent on the 14th. We made it." },
    { id: "m3", date: "Mar 02", body: "You named 'Barcelona' a dream. I started moving $40 every Friday." },
    { id: "m4", date: "Feb 11", body: "First credit card. We agreed: utilization stays under 30%." },
    { id: "m5", date: "Aug 2025", body: "You said money makes you anxious. I said okay, slow." },
  ] as BTMemoryNote[],

  trusted: [
    { id: "t1", name: "Mom", rel: "family", scope: "sees credit + dreams", hue: "accent" },
    { id: "t2", name: "Priya", rel: "roommate", scope: "splits — groceries, rent", hue: "accent2" },
    { id: "t3", name: "Jordan", rel: "friend", scope: "splits — concerts, gas", hue: "warn" },
  ] as BTTrustedPerson[],

  quietSettings: [
    { id: "q1", label: "Quiet hours", value: "11pm — 7am" },
    { id: "q2", label: "Big-purchase alert", value: "> $25" },
    { id: "q3", label: "Subscription scan", value: "weekly" },
    { id: "q4", label: "Phishing watch", value: "on" },
    { id: "q5", label: "Memory", value: "forever — your choice", emphasize: true as const },
  ],

  daysWithTilly: 247,
  studentRole: "NYU Junior",
};

export const BT_SUGGESTED_PROMPTS = [
  "split groceries with priya",
  "what's killing my budget?",
  "is this $90 ticket okay?",
  "help me think about my first credit card",
];

/**
 * Canned chat. Spec §4.2 — affordability quick-math card.
 * The first user prompt seeds the conversation; the analysis card breaks
 * down the ledger and Tilly's call.
 */
export const BT_CHAT_SEED = [
  {
    id: "c1",
    role: "user" as const,
    kind: "text" as const,
    body: "is this $90 concert ticket okay this weekend?",
  },
  {
    id: "c2",
    role: "tilly" as const,
    kind: "analysis" as const,
    title: "Quick math",
    rows: [
      { label: "Available Fri after rent", amt: 412.58, sign: "+" as const },
      { label: "Concert ticket", amt: -90.0, sign: "-" as const },
      { label: "Buffer left", amt: 322.58, sign: "=" as const },
    ],
    note:
      "Honestly? Yes — but only because you skipped takeout twice this week. Want me to move it from your spending money, not from Barcelona?",
  },
];
