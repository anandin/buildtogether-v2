import { useMemo, useState } from "react";
import { ArrowUpRight, Mic, Headphones, BookOpen, Sparkles, MoveRight } from "lucide-react";
import { Marquee } from "@/components/Marquee";
import {
  Squiggle,
  Burst,
  Dots,
  Zigzag,
  HalfCircle,
  Triangle,
  CrossPlus,
  ArrowHand,
  Spiral,
} from "@/components/Shapes";
import { fieldNotes, projects, talks, manifesto } from "@/content";

const FILTERS = ["all", "behavior", "adoption", "creativity"] as const;
type Filter = (typeof FILTERS)[number];

const accentToHex: Record<string, string> = {
  terracotta: "var(--color-terracotta)",
  cobalt: "var(--color-cobalt)",
  mustard: "var(--color-mustard)",
  sage: "var(--color-sage)",
  coral: "var(--color-coral)",
};

export default function Home() {
  const [filter, setFilter] = useState<Filter>("all");
  const visibleNotes = useMemo(
    () => (filter === "all" ? fieldNotes : fieldNotes.filter((n) => n.tag === filter)),
    [filter],
  );

  return (
    <div className="paper-grain min-h-screen bg-paper text-ink">
      {/* ──────────────────────────────────────────────────────────────
          NAV
      ─────────────────────────────────────────────────────────────── */}
      <header className="relative z-40 flex items-center justify-between px-6 py-5 sm:px-12">
        <a href="#top" className="group flex items-center gap-3">
          <div className="relative h-9 w-9 rotate-6 border-2 border-ink bg-terracotta brutal-shadow-sm transition-transform group-hover:rotate-12">
            <div className="absolute inset-1 border border-ink/40" />
          </div>
          <div className="font-display text-lg font-bold leading-none tracking-tight">
            Your Name<span className="text-terracotta">.</span>
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
              field notes · est. now
            </div>
          </div>
        </a>

        <nav className="hidden items-center gap-2 md:flex">
          <a className="chip-outline transition-transform hover:rotate-[-2deg] hover:bg-cream" href="#notes">
            field notes
          </a>
          <a className="chip-outline transition-transform hover:rotate-[2deg] hover:bg-cream" href="#projects">
            explorations
          </a>
          <a className="chip-outline transition-transform hover:rotate-[-2deg] hover:bg-cream" href="#talks">
            talks
          </a>
          <a
            className="ml-2 inline-flex items-center gap-1.5 rounded-full border-2 border-ink bg-ink px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-cream brutal-shadow-sm transition-transform hover:-translate-y-0.5 hover:-rotate-1"
            href="#say-hi"
          >
            say hi <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </nav>
      </header>

      <main id="top">
        {/* ──────────────────────────────────────────────────────────────
            HERO
        ─────────────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden px-6 pt-10 pb-32 sm:px-12 sm:pt-16">
          {/* scattered shapes */}
          <Burst className="float-a absolute top-10 right-[14%] hidden h-24 w-24 text-mustard md:block" />
          <Dots className="absolute top-[42%] left-6 hidden h-20 w-20 text-cobalt md:block" />
          <Spiral className="float-b absolute right-8 bottom-32 hidden h-24 w-24 text-terracotta md:block" />
          <Triangle className="absolute top-44 right-2 hidden h-14 w-14 rotate-12 text-sage md:block" />
          <CrossPlus className="absolute top-24 left-[42%] hidden h-7 w-7 text-cobalt md:block" />
          <CrossPlus className="absolute right-1/3 bottom-44 hidden h-5 w-5 text-terracotta md:block" />
          <Zigzag className="absolute bottom-12 left-1/3 hidden h-6 w-32 text-cobalt md:block" />

          <div className="relative z-10 mx-auto max-w-6xl">
            <div className="mb-8 flex flex-wrap items-center gap-3">
              <span className="sticker bg-mustard">
                <Sparkles className="h-3.5 w-3.5" />
                issue №01
              </span>
              <span className="sticker bg-coral">winter — twenty twenty six</span>
              <span className="hidden font-mono text-xs uppercase tracking-[0.2em] text-ink-soft sm:inline">
                a personal zine
              </span>
            </div>

            <h1 className="font-serif text-[14vw] leading-[0.88] tracking-[-0.03em] sm:text-[10vw] lg:text-[8.6rem]">
              <span className="block">Field notes</span>
              <span className="block">
                from the{" "}
                <em className="not-italic">
                  <span className="squiggle-underline">intersection</span>
                </em>
              </span>
            </h1>

            <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-10">
              <p className="font-serif text-xl leading-relaxed text-ink-soft sm:text-2xl lg:col-span-7">
                A working archive of essays, prototypes, and half-finished thoughts on{" "}
                <span className="squiggle-underline-cobalt">human behavior</span>, the messy reality of{" "}
                <span className="squiggle-underline">technology adoption</span>, and the long game of{" "}
                <span className="squiggle-underline-cobalt">creativity</span>. Updated whenever the
                idea is finally ready, and sometimes a little before.
              </p>

              <div className="relative lg:col-span-5">
                {/* polaroid */}
                <div className="polaroid rot-3 relative mx-auto max-w-sm">
                  <span className="tape rot--6 -top-3 left-10" />
                  <div className="relative aspect-[4/5] overflow-hidden bg-paper-deep">
                    {/* abstract "portrait" composition */}
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,#e8b341_0,transparent_55%),radial-gradient(circle_at_70%_70%,#d9542b_0,transparent_55%),radial-gradient(circle_at_50%_50%,#2640c4_0,transparent_70%)] opacity-90" />
                    <div className="absolute inset-0 bg-dots opacity-30" />
                    <div className="absolute inset-x-0 bottom-0 flex flex-col items-center pb-6">
                      <div className="h-20 w-20 rounded-full border-[3px] border-ink bg-cream" />
                      <div className="-mt-2 h-24 w-32 rounded-t-[6rem] border-[3px] border-ink bg-cream" />
                    </div>
                  </div>
                  <div className="mt-3 flex items-baseline justify-between font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft">
                    <span>self · in three currents</span>
                    <span>'26</span>
                  </div>
                </div>

                {/* floating quote sticky */}
                <div className="rot--4 absolute -right-4 -bottom-10 hidden w-56 border-2 border-ink bg-cream p-3 text-sm shadow-[6px_6px_0_0_var(--color-cobalt)] md:block">
                  <p className="font-serif italic leading-snug">
                    "Adoption is not a feature problem, it's a permission problem."
                  </p>
                  <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-ink-soft">
                    — note to self
                  </p>
                </div>

                <ArrowHand className="absolute -top-10 -left-6 hidden h-12 w-28 -rotate-[20deg] text-cobalt md:block" />
              </div>
            </div>
          </div>
        </section>

        {/* ──────────────────────────────────────────────────────────────
            MARQUEE strip
        ─────────────────────────────────────────────────────────────── */}
        <section className="relative border-y-2 border-ink bg-ink text-cream">
          <Marquee className="py-4">
            {[
              "Human Behavior",
              "Technology Adoption",
              "Creativity",
              "Long Games",
              "Quiet Tools",
              "Beginner's Mind",
              "Field Research",
              "Slow Software",
            ].map((label, i) => (
              <span
                key={`${label}-${i}`}
                className="mx-6 inline-flex items-center gap-6 font-display text-3xl tracking-tight whitespace-nowrap"
              >
                {label}
                <span className="inline-block h-2 w-2 rotate-45 bg-mustard" />
              </span>
            ))}
          </Marquee>
        </section>

        {/* ──────────────────────────────────────────────────────────────
            TRIPLE HELIX — three currents
        ─────────────────────────────────────────────────────────────── */}
        <section className="relative px-6 py-28 sm:px-12">
          <div className="mx-auto max-w-6xl">
            <div className="mb-14 flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.28em] text-ink-soft">§ 01 — the three currents</p>
                <h2 className="mt-3 font-serif text-5xl leading-[0.95] tracking-tight sm:text-6xl">
                  I work where <span className="squiggle-underline">three rivers</span> meet.
                </h2>
              </div>
              <p className="max-w-sm font-serif text-lg text-ink-soft">
                Each pulls at a different pace. Their interference patterns are where the interesting work hides.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
              {[
                {
                  num: "01",
                  title: "Human Behavior",
                  body: "How we actually decide, copy, hesitate, and hope — not the rational caricature the brief assumes.",
                  bg: "bg-coral",
                  shadow: "brutal-shadow",
                  rot: "rot--2",
                  Shape: HalfCircle,
                },
                {
                  num: "02",
                  title: "Technology Adoption",
                  body: "Why some inventions cross the chasm in months and others wait a generation for the world to make room for them.",
                  bg: "bg-mustard",
                  shadow: "brutal-shadow-cobalt",
                  rot: "rot-2",
                  Shape: Triangle,
                },
                {
                  num: "03",
                  title: "Creativity",
                  body: "The discipline of staying interested. Constraints, rituals, taste, and the courage to be embarrassing for a while.",
                  bg: "bg-cobalt text-cream",
                  shadow: "brutal-shadow-terracotta",
                  rot: "rot--2",
                  Shape: Burst,
                },
              ].map(({ num, title, body, bg, shadow, rot, Shape }) => (
                <article
                  key={num}
                  className={`relative ${bg} ${shadow} ${rot} border-2 border-ink p-7 transition-transform hover:rotate-0 hover:translate-x-[-2px] hover:translate-y-[-2px]`}
                >
                  <div className="flex items-start justify-between">
                    <span className="font-mono text-[11px] uppercase tracking-[0.24em]">§ {num}</span>
                    <Shape className="h-10 w-10 opacity-90" />
                  </div>
                  <h3 className="mt-12 font-serif text-3xl leading-[0.95]">{title}</h3>
                  <p className="mt-4 font-serif text-base leading-relaxed">{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ──────────────────────────────────────────────────────────────
            MANIFESTO — typographic statement
        ─────────────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden border-y-2 border-ink bg-paper-deep px-6 py-28 sm:px-12">
          <Dots className="absolute top-8 left-8 hidden h-16 w-16 text-terracotta md:block" />
          <CrossPlus className="absolute top-12 right-1/4 hidden h-8 w-8 text-cobalt md:block" />
          <Burst className="absolute right-8 bottom-8 hidden h-20 w-20 text-mustard md:block" />
          <Zigzag className="absolute bottom-16 left-1/4 hidden h-6 w-32 text-cobalt md:block" />

          <div className="relative mx-auto max-w-5xl">
            <p className="mb-8 font-mono text-xs uppercase tracking-[0.28em] text-ink-soft">
              § 02 — a working manifesto
            </p>
            <div className="space-y-3 font-serif text-4xl leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
              {manifesto.map((line, i) => {
                const rots = ["rot--2", "rot-2", "rot--2", "rot-2", "rot--2", "rot-2"];
                const isAccent = i === 0 || i === 4 || i === 5;
                return (
                  <p
                    key={i}
                    className={`origin-left ${rots[i % rots.length]} inline-block ${
                      isAccent ? "text-ink" : "text-ink-soft"
                    }`}
                  >
                    {i === 1 && (
                      <span className="mr-3 inline-block h-3 w-3 -translate-y-1.5 rotate-45 bg-terracotta" />
                    )}
                    {i === 2 && (
                      <span className="mr-3 inline-block h-3 w-3 -translate-y-1.5 rotate-45 bg-cobalt" />
                    )}
                    {i === 3 && (
                      <span className="mr-3 inline-block h-3 w-3 -translate-y-1.5 rotate-45 bg-mustard" />
                    )}
                    {line}
                  </p>
                );
              })}
            </div>
          </div>
        </section>

        {/* ──────────────────────────────────────────────────────────────
            FIELD NOTES — sticky wall
        ─────────────────────────────────────────────────────────────── */}
        <section id="notes" className="relative px-6 py-28 sm:px-12">
          <div className="mx-auto max-w-6xl">
            <div className="mb-10 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.28em] text-ink-soft">
                  § 03 — the wall of field notes
                </p>
                <h2 className="mt-3 font-serif text-5xl leading-[0.95] tracking-tight sm:text-6xl">
                  Small <span className="squiggle-underline-cobalt">observations</span>,
                  <br /> pinned in public.
                </h2>
              </div>
              <p className="max-w-md font-serif text-lg text-ink-soft">
                Half-thoughts, micro-essays, and the kind of sentences I wish someone had said to me earlier.
              </p>
            </div>

            {/* filters */}
            <div className="mb-8 flex flex-wrap items-center gap-2">
              <span className="mr-1 font-mono text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                filter ↓
              </span>
              {FILTERS.map((f) => {
                const active = filter === f;
                return (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`chip-outline transition-transform ${
                      active
                        ? "rotate-[-2deg] border-ink bg-ink text-cream"
                        : "hover:rotate-[2deg] hover:bg-cream"
                    }`}
                  >
                    {f}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {visibleNotes.map((note, i) => {
                const rotations = ["rot--2", "rot-2", "rot--4", "rot-3", "rot-2", "rot--2", "rot-4", "rot--2", "rot-2"];
                const swatch = accentToHex[note.color];
                return (
                  <article
                    key={`${note.text}-${i}`}
                    className={`index-card relative ${rotations[i % rotations.length]} p-6 transition-transform duration-200 hover:rotate-0 hover:-translate-y-1`}
                    style={{ borderTop: `8px solid ${swatch}` }}
                  >
                    <span className="tape rot--4 -top-3 left-5 w-16" />
                    <p className="font-serif text-lg leading-snug">"{note.text}"</p>
                    <div className="mt-6 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                      <span style={{ color: swatch }}>#{note.tag}</span>
                      <span>{note.date}</span>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* ──────────────────────────────────────────────────────────────
            PROJECTS / EXPLORATIONS
        ─────────────────────────────────────────────────────────────── */}
        <section id="projects" className="relative border-t-2 border-ink bg-cream px-6 py-28 sm:px-12">
          <Spiral className="absolute top-12 right-12 hidden h-20 w-20 text-cobalt md:block" />
          <Squiggle className="absolute bottom-10 left-10 hidden h-6 w-40 text-terracotta md:block" />

          <div className="relative mx-auto max-w-6xl">
            <div className="mb-12 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.28em] text-ink-soft">
                  § 04 — explorations & explorations-in-progress
                </p>
                <h2 className="mt-3 font-serif text-5xl leading-[0.95] tracking-tight sm:text-6xl">
                  Things I'm <span className="squiggle-underline">building</span>,
                  <br /> writing, and wondering about.
                </h2>
              </div>
              <a
                href="#say-hi"
                className="self-start inline-flex items-center gap-2 border-2 border-ink bg-mustard px-5 py-3 font-mono text-[11px] uppercase tracking-[0.22em] brutal-shadow-sm transition-transform hover:-rotate-2"
              >
                collaborate <MoveRight className="h-4 w-4" />
              </a>
            </div>

            <div className="grid grid-cols-1 gap-7 md:grid-cols-2 lg:grid-cols-3">
              {projects.map((p, i) => {
                const rots = ["rot--2", "rot-2", "rot--4", "rot-3", "rot--2", "rot-2"];
                const swatch = accentToHex[p.accent];
                return (
                  <article
                    key={p.title}
                    className={`polaroid relative ${rots[i % rots.length]} flex flex-col transition-transform duration-200 hover:rotate-0 hover:-translate-y-1`}
                  >
                    <span
                      className="tape rot--6 -top-3 left-6"
                      style={{ background: swatch, opacity: 0.7 }}
                    />
                    <div
                      className="relative mb-4 aspect-[5/3] w-full overflow-hidden border-2 border-ink"
                      style={{ background: swatch }}
                    >
                      <div className="absolute inset-0 bg-dots opacity-25" />
                      <div className="absolute inset-0 flex items-center justify-center px-6 text-center font-display text-2xl font-bold leading-tight text-ink mix-blend-multiply">
                        {p.title}
                      </div>
                      <span className="absolute top-2 left-2 inline-flex items-center gap-1 border-[1.5px] border-ink bg-cream px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em]">
                        {p.status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
                      <span>{p.kind}</span>
                      <span>{p.year}</span>
                    </div>
                    <h3 className="mt-3 font-serif text-2xl leading-tight">{p.title}</h3>
                    <p className="mt-2 grow font-serif text-base leading-relaxed text-ink-soft">{p.summary}</p>
                    <div className="mt-5 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.22em]">
                      read more <ArrowUpRight className="h-3.5 w-3.5" />
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* ──────────────────────────────────────────────────────────────
            TALKS & APPEARANCES
        ─────────────────────────────────────────────────────────────── */}
        <section id="talks" className="relative px-6 py-28 sm:px-12">
          <div className="mx-auto max-w-5xl">
            <div className="mb-10">
              <p className="font-mono text-xs uppercase tracking-[0.28em] text-ink-soft">
                § 05 — talks, podcasts, interviews
              </p>
              <h2 className="mt-3 font-serif text-5xl leading-[0.95] tracking-tight sm:text-6xl">
                Said out loud, on <span className="squiggle-underline-cobalt">someone else's</span> stage.
              </h2>
            </div>

            <ul className="border-y-2 border-ink">
              {talks.map((t, i) => {
                const Icon = t.format === "talk" ? Mic : t.format === "podcast" ? Headphones : BookOpen;
                return (
                  <li
                    key={t.title}
                    className={`group flex flex-col gap-3 border-ink py-6 transition-colors sm:flex-row sm:items-center sm:gap-8 ${
                      i !== talks.length - 1 ? "border-b-2" : ""
                    } hover:bg-cream`}
                  >
                    <div className="flex shrink-0 items-center gap-4 sm:w-44">
                      <span className="font-mono text-xs uppercase tracking-[0.22em] text-ink-soft">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="inline-flex items-center gap-1.5 border-[1.5px] border-ink bg-paper px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em]">
                        <Icon className="h-3 w-3" />
                        {t.format}
                      </span>
                    </div>
                    <div className="grow">
                      <h3 className="font-serif text-2xl leading-tight transition-transform group-hover:translate-x-1">
                        {t.title}
                      </h3>
                      <p className="font-mono text-xs uppercase tracking-[0.18em] text-ink-soft">{t.venue}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 font-mono text-xs uppercase tracking-[0.22em] text-ink-soft">
                      <span>{t.year}</span>
                      <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* ──────────────────────────────────────────────────────────────
            CONTACT / SIGNATURE
        ─────────────────────────────────────────────────────────────── */}
        <section
          id="say-hi"
          className="relative overflow-hidden border-t-2 border-ink bg-terracotta px-6 py-32 text-cream sm:px-12"
        >
          <Burst className="absolute top-10 left-10 hidden h-32 w-32 text-mustard md:block" />
          <Dots className="absolute right-10 bottom-10 hidden h-24 w-24 text-cream md:block" />
          <CrossPlus className="absolute top-1/2 right-1/4 hidden h-10 w-10 text-cream md:block" />
          <Spiral className="absolute bottom-20 left-1/3 hidden h-20 w-20 text-cobalt md:block" />

          <div className="relative mx-auto max-w-4xl text-center">
            <p className="font-mono text-xs uppercase tracking-[0.28em] text-cream/80">
              § 06 — say hi, send something strange
            </p>
            <h2 className="mt-6 font-serif text-6xl leading-[0.92] tracking-tight sm:text-7xl lg:text-8xl">
              Working on something at the <em className="not-italic underline decoration-mustard decoration-[6px] underline-offset-[10px]">intersection</em>?
              <br /> I want to hear about it.
            </h2>

            <p className="mx-auto mt-8 max-w-2xl font-serif text-xl leading-relaxed text-cream/90">
              I take a small number of advisory engagements and collaborations each year, plus the
              occasional talk. Lopsided ideas welcome.
            </p>

            <div className="mt-12 flex flex-wrap items-center justify-center gap-4">
              <a
                href="mailto:hello@yourname.xyz"
                className="inline-flex items-center gap-2 border-2 border-ink bg-cream px-7 py-4 font-display text-lg font-bold text-ink brutal-shadow transition-transform hover:-translate-y-1 hover:-rotate-2"
              >
                hello@yourname.xyz <ArrowUpRight className="h-5 w-5" />
              </a>
              <a
                href="#"
                className="inline-flex items-center gap-2 border-2 border-cream bg-transparent px-7 py-4 font-display text-lg font-bold text-cream transition-transform hover:rotate-2"
              >
                /newsletter
              </a>
            </div>

            <div className="mt-16 flex flex-wrap items-center justify-center gap-3">
              {["twitter / x", "substack", "github", "are.na", "linkedin"].map((label, i) => {
                const rots = ["rot--2", "rot-2", "rot--4", "rot-3", "rot--2"];
                return (
                  <a
                    key={label}
                    href="#"
                    className={`chip-outline ${rots[i]} border-cream bg-transparent text-cream transition-transform hover:rotate-0 hover:bg-cream hover:text-ink`}
                  >
                    {label}
                  </a>
                );
              })}
            </div>
          </div>
        </section>

        {/* ──────────────────────────────────────────────────────────────
            COLOPHON / FOOTER
        ─────────────────────────────────────────────────────────────── */}
        <footer className="relative border-t-2 border-ink bg-paper px-6 py-12 sm:px-12">
          <div className="mx-auto flex max-w-6xl flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-display text-2xl font-bold leading-none">
                Your Name<span className="text-terracotta">.</span>
              </p>
              <p className="mt-2 max-w-md font-serif text-sm leading-relaxed text-ink-soft">
                A working zine. Set in Fraunces &amp; Bricolage Grotesque on a paper-grain canvas.
                Hand-rotated, deliberately uneven. Built with care, then printed digitally.
              </p>
            </div>
            <div className="flex flex-col gap-2 font-mono text-[11px] uppercase tracking-[0.22em] text-ink-soft sm:items-end">
              <span>© {new Date().getFullYear()} — Your Name</span>
              <span>colophon · issue №01</span>
            </div>
          </div>
          <div className="dashed-divider mt-10" />
        </footer>
      </main>
    </div>
  );
}
