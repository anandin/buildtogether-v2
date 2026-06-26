import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  ArrowRight,
  ArrowUpRight,
  Sparkles,
  Plus,
  Quote,
  CalendarClock,
  MapPin,
  Heart,
  Sprout,
  Lock,
  Users,
  ShieldCheck,
} from "lucide-react";
import tillyStudy from "@/assets/tilly-study.png";
import tillyRamen from "@/assets/tilly-ramen.png";
import tillyGrad from "@/assets/tilly-grad.png";
import tillyReceipt from "@/assets/tilly-receipt.png";
import { EXPO_GO_FALLBACK_URL, handleDownloadClick } from "@/lib/download";

export default function Home() {
  const appUrl = EXPO_GO_FALLBACK_URL;

  const faqs = [
    {
      q: "Is it really free?",
      a: "Yes. The free tier covers everything a student actually needs — bank connections, the chat, and goal tracking. Premium adds custom themes, deeper memory, and household sharing, but your basic financial safety is never behind a paywall.",
    },
    {
      q: "Is it safe to connect my bank?",
      a: "Yes. Connections run through Plaid — the same service behind Venmo, Robinhood, and Chime — so we never see or store your bank password. Tilly's access is read-only: she can see transactions to help you, but can't move a cent. Everything's encrypted, never sold, and you can disconnect or delete it all anytime.",
    },
    {
      q: "Can I connect my student bank account?",
      a: "Almost certainly. We use Plaid, which supports over 12,000 institutions in the US and Canada — local credit unions, student accounts, and the big banks alike.",
    },
    {
      q: "What if my income is irregular?",
      a: "That's the whole reason Tilly exists. Budgets break the moment you're living off part-time shifts, the occasional $200 from a parent, or a semester stipend. Tilly works from your real cash flow, not an imaginary steady paycheck.",
    },
    {
      q: "Does Tilly judge my spending?",
      a: "Never. Tilly doesn't have opinions about your lattes. She shows you the trade-off — what a purchase moves, and by how long — and lets you decide. Your call, every time.",
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <Navigation />

      <main>
        {/* ───────────── HERO ───────────── */}
        <section className="relative overflow-hidden">
          {/* warm ambient wash */}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-40 -right-32 h-[42rem] w-[42rem] rounded-full bg-primary/20 blur-3xl float-slower"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute top-40 -left-40 h-[34rem] w-[34rem] rounded-full bg-accent/25 blur-3xl float-slow"
          />

          <div className="relative mx-auto flex max-w-7xl flex-col items-center gap-16 px-6 pb-24 pt-36 sm:px-12 lg:flex-row lg:items-center lg:justify-between lg:pt-44">
            <div className="max-w-2xl flex-1 animate-in fade-in slide-in-from-bottom-6 duration-700">
              <span className="inline-flex items-center gap-2 rounded-full bg-foreground/5 px-4 py-1.5 text-sm font-medium text-foreground/70 ring-1 ring-foreground/10">
                <Sparkles className="h-4 w-4 text-primary" />
                A money app that gets your twenties
              </span>

              <h1 className="mt-7 font-serif text-[clamp(2.75rem,7vw,4.75rem)] leading-[1.04] text-foreground">
                Like a sibling who's{" "}
                <span className="text-primary">really good with money.</span>
              </h1>

              <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
                The trip, the apartment, the year off — Tilly quietly moves your money toward what
                you actually want, and tells you when to spend, when to wait, and when the thing
                you've been eyeing is about to get cheaper.
              </p>

              <div className="mt-9 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                <Button
                  asChild
                  size="lg"
                  className="h-14 rounded-full bg-foreground px-8 text-lg text-background hover:bg-foreground/90"
                >
                  <a href={appUrl} onClick={handleDownloadClick} rel="noopener">
                    Start free <ArrowRight className="ml-2 h-5 w-5" />
                  </a>
                </Button>
                <p className="text-sm text-muted-foreground">
                  Two minutes. Bank-level encryption · read-only · never sold.
                </p>
              </div>
            </div>

            {/* Portrait + floating proof */}
            <div className="relative w-full max-w-md flex-1 animate-in fade-in slide-in-from-right-6 duration-1000">
              <div
                aria-hidden
                className="absolute inset-6 rounded-full bg-gradient-to-br from-primary/25 to-accent/25 blur-2xl"
              />
              <img
                src={tillyStudy}
                alt="Tilly, a warm owl, studying her finances under a lamp"
                className="relative z-10 mx-auto w-full drop-shadow-2xl float-slow"
                width={520}
                height={520}
              />
              <div className="absolute -bottom-2 -left-2 z-20 max-w-[15rem] rounded-2xl bg-card p-4 shadow-xl ring-1 ring-card-border sm:bottom-8 sm:-left-10 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-500">
                <Quote className="h-4 w-4 text-accent" />
                <p className="mt-1.5 text-sm font-medium leading-snug text-foreground">
                  "Skip the latte today and Tokyo is fully funded by June 12th."
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ───────────── CREDIBILITY BAND (trust, surfaced early) ───────────── */}
        <section className="border-y border-border/60 bg-card/50">
          <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 px-6 py-6 text-center sm:px-12">
            <p className="text-sm text-muted-foreground sm:text-base">
              Bank connections secured by{" "}
              <span className="font-semibold text-foreground">Plaid</span> — the same technology
              behind Venmo, Robinhood &amp; Chime.
            </p>
            <ul className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-foreground/55">
              <li>12,000+ banks</li>
              <li aria-hidden>·</li>
              <li>Read-only access</li>
              <li aria-hidden>·</li>
              <li>Bank-level encryption</li>
              <li aria-hidden>·</li>
              <li>Your data is never sold</li>
            </ul>
          </div>
        </section>

        {/* ───────────── PARADIGM (editorial, no card boxes) ───────────── */}
        <section id="how-it-works" className="bg-card text-card-foreground">
          <div className="mx-auto max-w-7xl px-6 py-24 sm:px-12 sm:py-32">
            <div className="max-w-3xl reveal">
              <h2 className="font-serif text-[clamp(2.25rem,5vw,3.5rem)] leading-[1.08] text-foreground">
                A budget tells you no.
                <br />
                <span className="text-primary">Tilly remembers what you said yes to.</span>
              </h2>
              <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
                Other apps optimize a budget for an imaginary, perfectly-disciplined person. Tilly
                optimizes for the future <em>you</em> actually want — the graduation trip, the
                deposit on an apartment with a kitchen window, the tattoo, the year off.
              </p>
            </div>

            <div className="mt-16 grid grid-cols-1 gap-x-12 gap-y-12 md:grid-cols-3">
              {[
                {
                  icon: Heart,
                  title: "Protects your dreams",
                  body: "Her whole job is keeping your goals alive while real life happens. Your dreams aren't line items — they're the destination.",
                },
                {
                  icon: Sprout,
                  title: "Understands trade-offs",
                  body: "Instead of shouting that you're over budget, she shows the math gently: “This dinner moves Tokyo from June to July.”",
                },
                {
                  icon: CalendarClock,
                  title: "Travels with you",
                  body: "She checks in when life shifts — a new semester, an internship, a breakup — and quietly adjusts the plan. No nagging.",
                },
              ].map((f, i) => (
                <div
                  key={f.title}
                  className="reveal border-t border-foreground/10 pt-6"
                  style={{ animationDelay: `${i * 90}ms` }}
                >
                  <f.icon className="h-7 w-7 text-primary" strokeWidth={1.75} />
                  <h3 className="mt-4 font-serif text-2xl text-foreground">{f.title}</h3>
                  <p className="mt-3 leading-relaxed text-muted-foreground">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ───────────── MEMORY (image left) ───────────── */}
        <section className="mx-auto max-w-7xl px-6 py-24 sm:px-12 sm:py-28">
          <div className="flex flex-col items-center gap-14 md:flex-row md:gap-20">
            <div className="relative w-full flex-1 reveal-soft">
              <div
                aria-hidden
                className="absolute -inset-3 -z-10 rotate-3 rounded-[2rem] bg-secondary"
              />
              <img
                src={tillyRamen}
                alt="Tilly sharing a bowl of ramen on a sacred Friday night"
                className="w-full rounded-2xl shadow-lg ring-1 ring-border/60"
                loading="lazy"
              />
            </div>
            <div className="flex-1 reveal">
              <h2 className="font-serif text-[clamp(2rem,4.5vw,3.25rem)] leading-[1.1] text-foreground">
                She learns you, not just your transactions.
              </h2>
              <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
                The more you talk, the more Tilly sounds like you. She remembers what matters — your
                roommate Jordan, the Friday ramen night that is absolutely sacred, the parent who
                chips in $200 sometimes. A memory of your life, not just a ledger.
              </p>

              <div className="mt-8 space-y-4">
                <div className="rounded-2xl bg-card p-5 ring-1 ring-card-border">
                  <p className="font-medium text-foreground">Context-aware from day one</p>
                  <p className="mt-1 text-muted-foreground">
                    A grad student in Boston on a $2,400 stipend gets completely different guidance
                    than a freelancer in Austin.
                  </p>
                </div>
                <div className="rounded-2xl bg-card p-5 ring-1 ring-card-border">
                  <p className="font-medium text-foreground">Notices the subtle patterns</p>
                  <p className="mt-1 italic text-muted-foreground">
                    "You always overspend the week after a midterm. Want me to hold a $50 buffer for
                    next time?"
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ───────────── SCOUT (image right, warm coral band) ───────────── */}
        <section className="bg-accent/12">
          <div className="mx-auto max-w-7xl px-6 py-24 sm:px-12 sm:py-28">
            <div className="flex flex-col-reverse items-center gap-14 md:flex-row md:gap-20">
              <div className="flex-1 reveal">
                <h2 className="font-serif text-[clamp(2rem,4.5vw,3.25rem)] leading-[1.1] text-foreground">
                  “Are you sure? It goes on sale next week.”
                </h2>
                <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
                  Before a real purchase, Tilly quietly checks two things: is this about to hit a
                  known sale window like Black Friday or Boxing Week, and is someone nearby already
                  selling the same thing secondhand? You hear about it before you click buy — not
                  after.
                </p>

                <div className="mt-8 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl bg-background p-5 ring-1 ring-border/70">
                    <CalendarClock className="h-6 w-6 text-primary" strokeWidth={1.75} />
                    <p className="mt-3 font-medium text-foreground">Knows the sale calendar</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      "Hold off until Nov 28 — Levi's has run 40% off every Black Friday for four
                      years."
                    </p>
                  </div>
                  <div className="rounded-2xl bg-background p-5 ring-1 ring-border/70">
                    <MapPin className="h-6 w-6 text-accent" strokeWidth={1.75} />
                    <p className="mt-3 font-medium text-foreground">Finds it cheaper, locally</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      "Three of these are listed on Marketplace within 5km. Want the closest one?"
                    </p>
                  </div>
                </div>
              </div>

              <div className="relative w-full flex-1 reveal-soft">
                <div
                  aria-hidden
                  className="absolute -inset-3 -z-10 -rotate-3 rounded-[2rem] bg-primary/15"
                />
                <img
                  src={tillyStudy}
                  alt="Tilly comparing prices before a purchase"
                  className="w-full rounded-2xl shadow-lg ring-1 ring-border/60"
                  loading="lazy"
                />
              </div>
            </div>
          </div>
        </section>

        {/* ───────────── BEHAVIORAL SCIENCE (drenched) ───────────── */}
        {/* Deeper than --primary so cream body copy clears 4.5:1. */}
        <section className="relative overflow-hidden bg-[hsl(263_60%_48%)] text-primary-foreground">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-40 -top-40 h-[44rem] w-[44rem] rounded-full bg-white/10 blur-3xl"
          />
          <div className="relative mx-auto max-w-7xl px-6 py-24 sm:px-12 sm:py-32">
            <div className="flex flex-col items-center gap-16 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-xl flex-1 reveal">
                <h2 className="font-serif text-[clamp(2.25rem,5vw,3.5rem)] leading-[1.08]">
                  Behavioral science, not willpower.
                </h2>
                <p className="mt-5 text-lg leading-relaxed text-primary-foreground/90">
                  Willpower runs out when you're tired, stressed, or three days into finals. So Tilly
                  doesn't rely on it. She uses what actually works to make the right move the easy
                  one.
                </p>

                <dl className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2">
                  {[
                    ["Fresh starts", "“It's the 1st — clean slate. Lock in $40 toward Tokyo before the month gets loud?”"],
                    ["Loss aversion, flipped", "“This isn't $30 gone. It's $30 of Barcelona, protected.”"],
                    ["A beat of friction", "“Quick gut-check before you tap buy — still want it tomorrow, or just tonight?”"],
                    ["Commitment devices", "“You said future-you comes first. Want me to tuck this away so tired-you can't touch it?”"],
                  ].map(([title, body], i) => (
                    <div key={title} className="reveal" style={{ animationDelay: `${i * 80}ms` }}>
                      <dt className="font-serif text-xl text-primary-foreground">{title}</dt>
                      <dd className="mt-2 leading-relaxed text-primary-foreground/90">{body}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div className="w-full max-w-xs flex-shrink-0 reveal-soft lg:pt-6">
                <img
                  src={tillyGrad}
                  alt="Tilly in a graduation cap, dreams funded"
                  className="mx-auto w-full rounded-full shadow-2xl ring-8 ring-white/15 float-slow"
                  loading="lazy"
                />
              </div>
            </div>
          </div>
        </section>

        {/* ───────────── UNIQUELY YOURS (deep ground) ───────────── */}
        <section className="bg-foreground text-background">
          <div className="mx-auto max-w-3xl px-6 py-24 text-center sm:px-12 sm:py-28">
            <h2 className="reveal font-serif text-[clamp(2rem,4.5vw,3.25rem)] leading-[1.1] text-background">
              After a month, it's not software. It's <span className="text-primary">your</span> Tilly.
            </h2>
            <p className="reveal mx-auto mt-5 max-w-xl text-lg leading-relaxed text-background/75">
              Choose your theme, dial her tone from gentle to blunt, and let her learn the rhythm of
              your life. The longer you're together, the more she sounds like you.
            </p>

            <div className="reveal mt-10 flex flex-wrap justify-center gap-3">
              {[
                ["Bloom", "#F6E8E6"],
                ["Dusk", "#1A1A24"],
                ["Citrus", "#FEF3C7"],
                ["Neon", "#E0E7FF"],
              ].map(([name, hex]) => (
                <span
                  key={name}
                  className="inline-flex items-center gap-2.5 rounded-full bg-background/10 px-5 py-2.5 text-sm font-medium text-background ring-1 ring-background/15"
                >
                  <span
                    className="h-4 w-4 rounded-full ring-1 ring-background/30"
                    style={{ backgroundColor: hex }}
                  />
                  {name}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ───────────── TRUST STRIP (links to /security) ───────────── */}
        <section className="border-b border-border bg-background">
          <div className="mx-auto max-w-6xl px-6 py-16 sm:px-12">
            <div className="grid gap-10 md:grid-cols-3">
              <div className="reveal">
                <Lock className="h-7 w-7 text-foreground/70" strokeWidth={1.75} />
                <h3 className="mt-4 font-sans text-lg font-semibold text-foreground">
                  Read-only by design
                </h3>
                <p className="mt-1.5 text-muted-foreground">
                  Connected through Plaid. Tilly can see your transactions to help — she can never
                  move your money.
                </p>
              </div>
              <div className="reveal" style={{ animationDelay: "90ms" }}>
                <Users className="h-7 w-7 text-foreground/70" strokeWidth={1.75} />
                <h3 className="mt-4 font-sans text-lg font-semibold text-foreground">
                  Share without the weirdness
                </h3>
                <p className="mt-1.5 text-muted-foreground">
                  Split bills with a roommate or partner — no passive-aggressive Venmo requests
                  required.
                </p>
              </div>
              <div className="reveal" style={{ animationDelay: "180ms" }}>
                <ShieldCheck className="h-7 w-7 text-foreground/70" strokeWidth={1.75} />
                <h3 className="mt-4 font-sans text-lg font-semibold text-foreground">
                  Your data stays yours
                </h3>
                <p className="mt-1.5 text-muted-foreground">
                  Encrypted, never sold, and yours to delete anytime.{" "}
                  <Link href="/security" className="font-medium text-primary hover:underline">
                    See how we protect it →
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </section>

        {/*
          ───────────── SOCIAL PROOF — enable once you have REAL quotes ─────────────
          Do NOT ship invented testimonials on a financial site (it's an FTC
          problem and it reads as fake). When you have 2-3 genuine quotes,
          replace the placeholders below with real {name, line, context} and
          delete the surrounding comment markers to render this section.

        <section className="bg-card">
          <div className="mx-auto max-w-6xl px-6 py-24 sm:px-12">
            <h2 className="text-center font-serif text-[clamp(1.875rem,4vw,2.75rem)] text-foreground">
              What early users say
            </h2>
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {[
                { line: "REAL QUOTE HERE.", name: "First name", context: "School / city" },
                { line: "REAL QUOTE HERE.", name: "First name", context: "School / city" },
                { line: "REAL QUOTE HERE.", name: "First name", context: "School / city" },
              ].map((t, i) => (
                <figure key={i} className="rounded-2xl bg-background p-6 ring-1 ring-border/60">
                  <blockquote className="text-foreground">“{t.line}”</blockquote>
                  <figcaption className="mt-4 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{t.name}</span> · {t.context}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
        */}

        {/* ───────────── FAQ ───────────── */}
        <section className="mx-auto max-w-3xl px-6 py-24 sm:px-12">
          <h2 className="reveal text-center font-serif text-[clamp(1.875rem,4vw,2.75rem)] text-foreground">
            Questions students actually ask
          </h2>
          <div className="reveal mt-12 divide-y divide-border border-y border-border">
            {faqs.map(({ q, a }) => (
              <details key={q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 font-serif text-lg text-foreground marker:hidden">
                  {q}
                  <Plus className="h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-300 group-open:rotate-45" />
                </summary>
                <p className="mt-3 leading-relaxed text-muted-foreground">{a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ───────────── CLOSING CTA (drenched deep) ───────────── */}
        <section className="relative overflow-hidden bg-foreground text-background">
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-0 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/3 rounded-full bg-primary/30 blur-3xl"
          />
          <div className="relative mx-auto max-w-2xl px-6 py-28 text-center sm:px-12 sm:py-36">
            <img
              src={tillyReceipt}
              alt="Tilly, ready to help"
              className="mx-auto mb-8 h-28 w-28 rounded-full ring-4 ring-background/10 float-slow"
              loading="lazy"
            />
            <h2 className="font-serif text-[clamp(2.25rem,5.5vw,4rem)] leading-[1.05] text-background">
              Tilly does the worrying, so you don't have to.
            </h2>
            <p className="mt-5 text-xl text-background/75">Ready to protect your dreams?</p>
            <div className="mt-9">
              <Button
                asChild
                size="lg"
                className="h-16 rounded-full bg-background px-10 text-lg text-foreground hover:bg-background/90"
              >
                <a href={appUrl} onClick={handleDownloadClick} rel="noopener">
                  Start free <ArrowUpRight className="ml-2 h-5 w-5" />
                </a>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
