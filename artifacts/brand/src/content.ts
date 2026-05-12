export const fieldNotes: { text: string; tag: string; date: string; color: string }[] = [
  {
    text: "Adoption is not a feature problem. It is a permission problem. People copy what they have permission to want.",
    tag: "behavior",
    date: "Mar · 24",
    color: "coral",
  },
  {
    text: "Every powerful tool starts as a toy. If your serious product never goes through a silly phase, you skipped the learning.",
    tag: "creativity",
    date: "Feb · 11",
    color: "mustard",
  },
  {
    text: "We blame users for friction we designed. The S-curve is just empathy graphed.",
    tag: "adoption",
    date: "Feb · 02",
    color: "sage",
  },
  {
    text: "Constraints don't kill creativity, they audition for it. A blank canvas is a job interview no one wants.",
    tag: "creativity",
    date: "Jan · 28",
    color: "cobalt",
  },
  {
    text: "When a new technology arrives, the first generation imitates the old one. The second one finally remembers what they actually wanted.",
    tag: "adoption",
    date: "Jan · 14",
    color: "terracotta",
  },
  {
    text: "Trust compounds in milliseconds and evaporates in headlines.",
    tag: "behavior",
    date: "Dec · 30",
    color: "coral",
  },
  {
    text: "Taste is just paying attention for longer than is socially acceptable.",
    tag: "creativity",
    date: "Dec · 12",
    color: "mustard",
  },
  {
    text: "The most under-priced skill in tech right now is the ability to describe a feeling precisely.",
    tag: "behavior",
    date: "Nov · 21",
    color: "sage",
  },
  {
    text: "Habits move slower than software ships. Plan accordingly.",
    tag: "adoption",
    date: "Nov · 03",
    color: "cobalt",
  },
];

export const projects: {
  title: string;
  kind: string;
  year: string;
  summary: string;
  status: "live" | "prototype" | "essay" | "research";
  accent: "terracotta" | "cobalt" | "mustard" | "sage";
}[] = [
  {
    title: "The Permission Engine",
    kind: "Essay series",
    year: "2026",
    summary:
      "A six-part exploration of why social permission—not utility—decides which technologies cross the chasm.",
    status: "essay",
    accent: "terracotta",
  },
  {
    title: "Tilly",
    kind: "Behavioral product",
    year: "2025—",
    summary:
      "An AI agent that protects your dreams instead of policing your budget. Tested across 1,400 students.",
    status: "live",
    accent: "cobalt",
  },
  {
    title: "Slow Software Manifesto",
    kind: "Talk + zine",
    year: "2025",
    summary:
      "Why the next decade rewards craft over velocity. Delivered at Config, On Deck, and a barn outside Marfa.",
    status: "essay",
    accent: "mustard",
  },
  {
    title: "Field Lab: Adoption Curves",
    kind: "Open research",
    year: "2024",
    summary:
      "Mapping 80 consumer technology launches against Rogers' five attributes. Findings are surprising.",
    status: "research",
    accent: "sage",
  },
  {
    title: "Studio: Generative Rituals",
    kind: "Prototype",
    year: "2024",
    summary:
      "A small tool that helps creative teams design weekly rituals as if they were features. Used internally.",
    status: "prototype",
    accent: "terracotta",
  },
  {
    title: "Quiet UI",
    kind: "Design system",
    year: "2023",
    summary:
      "An interface library for apps that respect attention. Open-sourced; ~1.2k stars; still my favorite work.",
    status: "live",
    accent: "cobalt",
  },
];

export const talks: {
  title: string;
  venue: string;
  year: string;
  format: "talk" | "podcast" | "interview";
  href?: string;
}[] = [
  { title: "On the etiquette of new technology", venue: "On Deck · Founder Salon", year: "2026", format: "talk" },
  { title: "Why software should be embarrassing first", venue: "The Studio Notes Podcast", year: "2025", format: "podcast" },
  { title: "Designing for the second generation", venue: "Config by Figma", year: "2025", format: "talk" },
  { title: "Behavior is a moving target", venue: "Lenny's Podcast", year: "2025", format: "podcast" },
  { title: "The middle act of an idea", venue: "Reboot Magazine", year: "2024", format: "interview" },
  { title: "Creativity as a long game", venue: "South by Southwest", year: "2024", format: "talk" },
  { title: "What the chasm misses", venue: "a16z Pod", year: "2023", format: "podcast" },
];

export const manifesto = [
  "I work where three rivers meet:",
  "the slow current of human behavior,",
  "the fast current of new technology,",
  "and the strange current of creativity.",
  "Most teams build for the second.",
  "The interesting work is in the eddies between them.",
];
