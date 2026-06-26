import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  ShieldCheck,
  Lock,
  EyeOff,
  KeyRound,
  Trash2,
  Ban,
  ServerCog,
  ScrollText,
  FileCheck2,
  ArrowRight,
} from "lucide-react";
import { EXPO_GO_FALLBACK_URL, handleDownloadClick } from "@/lib/download";

// Plain-language promises (the four things a nervous first-time user
// actually wants to hear). Each one maps to a real control we ship.
const promises = [
  {
    icon: EyeOff,
    title: "Your bank login never touches us",
    body: "You connect your bank through Plaid — the same secure service behind apps like Venmo and Robinhood. We never see, store, or handle your banking password. Ever.",
  },
  {
    icon: Ban,
    title: "We can't move your money",
    body: "Tilly's view of your bank is read-only by design. She can see what's happening so she can help — but she has no ability to transfer, withdraw, or pay anyone. Not now, not ever.",
  },
  {
    icon: Lock,
    title: "Everything is encrypted",
    body: "Your data is encrypted in transit and at rest. The sensitive keys that connect to your bank are encrypted with AES-256 — the same standard banks use — so they're unreadable even in our own database.",
  },
  {
    icon: Trash2,
    title: "You can erase it all",
    body: "Delete your account whenever you want and we permanently remove your data — bank connections, transactions, and everything Tilly ever learned about you. No exit interview.",
  },
];

// Deeper, for the security-minded (and for buyers who read the fine print).
const controls = [
  {
    icon: KeyRound,
    title: "Encryption",
    points: [
      "TLS for every connection between your device and Tilly.",
      "Bank access tokens encrypted at rest with AES-256-GCM (authenticated encryption), decrypted only in-memory at the moment we talk to your bank.",
      "Secrets and keys are never written to logs.",
    ],
  },
  {
    icon: ServerCog,
    title: "Access & infrastructure",
    points: [
      "Least-privilege access: every request is scoped to your account, so one person's data can never surface in another's.",
      "Hosted on Vercel and a managed Postgres provider with encryption-at-rest at the storage layer.",
      "No debug or back-door endpoints on the production system.",
    ],
  },
  {
    icon: ScrollText,
    title: "Monitoring & accountability",
    points: [
      "A tamper-resistant audit log records sign-ins, bank connections, and account deletions.",
      "Every change to Tilly is code-reviewed and version-controlled before it ships.",
      "Sensitive actions are rate-limited to slow down abuse.",
    ],
  },
  {
    icon: FileCheck2,
    title: "Your data rights",
    points: [
      "Connect and disconnect banks anytime — disconnecting revokes our access at Plaid.",
      "Request deletion and we erase your records across every system.",
      "We don't sell your data. Tilly makes money from happy users, not from your transactions.",
    ],
  },
];

export default function Security() {
  const appUrl = EXPO_GO_FALLBACK_URL;

  return (
    <div className="min-h-screen bg-background selection:bg-primary/20 selection:text-primary">
      <Navigation />

      <main>
        {/* HERO */}
        <section className="pt-40 pb-16 px-6 sm:px-12 max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
            <ShieldCheck className="w-4 h-4" />
            <span>Security &amp; Trust</span>
          </div>
          <h1 className="mt-6 text-4xl sm:text-6xl font-serif text-foreground leading-[1.1]">
            Your money is yours. <span className="text-primary italic">We just keep watch.</span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-muted-foreground leading-relaxed max-w-2xl mx-auto">
            Tilly only works if you trust her with the most sensitive thing you have — your money.
            We treat that the way a bank would, and we built the whole thing read-only so the worst
            case is never very bad.
          </p>
        </section>

        {/* THE FOUR PROMISES */}
        <section className="pb-12 px-6 sm:px-12 max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
          {promises.map((p) => (
            <div
              key={p.title}
              className="bg-card rounded-3xl border border-border/50 shadow-sm p-8 flex flex-col gap-4"
            >
              <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                <p.icon className="w-6 h-6" />
              </div>
              <h3 className="font-serif text-2xl text-foreground">{p.title}</h3>
              <p className="text-muted-foreground leading-relaxed">{p.body}</p>
            </div>
          ))}
        </section>

        {/* UNDER THE HOOD */}
        <section className="py-16 px-6 sm:px-12 max-w-6xl mx-auto">
          <div className="max-w-2xl">
            <h2 className="text-3xl sm:text-4xl font-serif text-foreground">
              Under the hood
            </h2>
            <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
              For the security-minded — and the procurement teams. Here's how we actually protect
              your data, in detail.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6">
            {controls.map((c) => (
              <div
                key={c.title}
                className="bg-card rounded-3xl border border-border/50 shadow-sm p-8"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center">
                    <c.icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-serif text-xl text-foreground">{c.title}</h3>
                </div>
                <ul className="mt-5 space-y-3">
                  {c.points.map((pt, i) => (
                    <li key={i} className="flex gap-3 text-muted-foreground leading-relaxed">
                      <span className="mt-2 w-1.5 h-1.5 rounded-full bg-primary/50 shrink-0" />
                      <span>{pt}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* COMPLIANCE / SOC 2 — honest framing */}
        <section className="pb-16 px-6 sm:px-12 max-w-6xl mx-auto">
          <div className="bg-foreground text-background rounded-3xl p-10 sm:p-14">
            <h2 className="text-3xl sm:text-4xl font-serif text-card">
              Built to the standards auditors look for
            </h2>
            <p className="mt-5 text-lg text-muted leading-relaxed max-w-3xl">
              We engineer Tilly against the SOC&nbsp;2 security criteria — encryption, access
              control, audit logging, and secure development — the same controls an enterprise
              security review evaluates. We're pursuing formal SOC&nbsp;2 certification as we grow.
              If your team needs our security documentation for a review, we're happy to share it.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-4">
              <Button
                asChild
                size="lg"
                className="rounded-full px-8 h-13 bg-card text-foreground hover:bg-card/90"
              >
                <a href="mailto:security@tilly.app">Request our security details</a>
              </Button>
            </div>
            <p className="mt-6 text-sm text-muted">
              Found a vulnerability? Email{" "}
              <a href="mailto:security@tilly.app" className="underline hover:text-card">
                security@tilly.app
              </a>{" "}
              — we read every report and we won't take legal action against good-faith research.
            </p>
          </div>
        </section>

        {/* CTA */}
        <section className="pb-24 px-6 sm:px-12 max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-serif text-foreground">
            Ready when you are.
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Connecting your bank takes two minutes, it's read-only, and you can disconnect anytime.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              asChild
              size="lg"
              className="rounded-full px-8 text-lg h-14 bg-foreground text-background hover:bg-foreground/90"
            >
              <a href={appUrl} onClick={handleDownloadClick} rel="noopener">
                Start free <ArrowRight className="ml-2 w-5 h-5" />
              </a>
            </Button>
            <Link
              href="/"
              className="text-muted-foreground hover:text-foreground transition-colors font-medium"
            >
              Back to home
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
