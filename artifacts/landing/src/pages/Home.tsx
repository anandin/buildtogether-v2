import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, Brain, Lock, Users, Calendar, Target, MoveUpRight, ArrowUpRight, Plus } from "lucide-react";
import tillyStudy from "@/assets/tilly-study.png";
import tillyRamen from "@/assets/tilly-ramen.png";
import tillyGrad from "@/assets/tilly-grad.png";
import tillyReceipt from "@/assets/tilly-receipt.png";

export default function Home() {
  const appUrl = import.meta.env.VITE_APP_URL ? `https://${import.meta.env.VITE_APP_URL}` : "#download";

  const faqs = [
    {
      q: "Is it really free?",
      a: "Tilly has a generous free tier that covers everything a student needs—bank connections, the chat, and goal tracking. We have a premium version for people who want custom themes, advanced AI memory, and household sharing, but we'll never lock your basic financial safety behind a paywall.",
    },
    {
      q: "Can I connect my specific student bank account?",
      a: "Yes. We use Plaid, which supports over 12,000 financial institutions in the US, including local credit unions, student accounts, and major banks.",
    },
    {
      q: "What if I have an irregular income?",
      a: "That's exactly why Tilly exists. Traditional budgets fail when you're living off part-time jobs, occasional parental help, or semester stipends. Tilly adapts to your actual cash flow, not an imaginary steady paycheck.",
    },
    {
      q: "Does Tilly judge my spending?",
      a: "Never. Tilly doesn't scold you about lattes. She just helps you see the trade-offs. If buying a coffee every day makes you happy, Tilly will help you make room for it while still working toward your big goals.",
    },
  ];

  return (
    <div className="min-h-screen bg-background selection:bg-primary/20 selection:text-primary">
      <Navigation />
      
      <main>
        {/* HERO */}
        <section className="pt-40 pb-20 px-6 sm:px-12 max-w-7xl mx-auto flex flex-col lg:flex-row items-center justify-between gap-16">
          <div className="flex-1 space-y-8 max-w-2xl animate-in fade-in slide-in-from-bottom-8 duration-1000">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
              <Sparkles className="w-4 h-4" />
              <span>A different kind of money app</span>
            </div>
            
            <h1 className="text-5xl sm:text-7xl font-serif text-foreground leading-[1.1]">
              Like a sibling who's <span className="text-primary italic">really good with money.</span>
            </h1>
            
            <p className="text-xl sm:text-2xl text-muted-foreground leading-relaxed">
              Tilly keeps an eye on your money and quietly helps you save for your dreams. She'll tell you when you can spend, when to hold off, and when something you want is about to get cheaper.
            </p>
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 pt-4">
              <Button asChild size="lg" className="rounded-full px-8 text-lg h-14 bg-foreground text-background hover:bg-foreground/90">
                <a href={appUrl}>
                  Start free <ArrowRight className="ml-2 w-5 h-5" />
                </a>
              </Button>
              <p className="text-sm text-muted-foreground">Takes 2 minutes. Secure, read-only bank sync.</p>
            </div>
          </div>
          
          <div className="flex-1 w-full max-w-lg relative animate-in fade-in slide-in-from-right-8 duration-1000 delay-300">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/20 rounded-full blur-3xl opacity-50" />
            <img src={tillyStudy} alt="Tilly the owl studying under a warm lamp" className="w-full h-auto relative z-10 drop-shadow-2xl" />
            
            {/* Floating UI element */}
            <div className="absolute -bottom-6 -left-6 sm:bottom-10 sm:-left-12 bg-card p-4 rounded-2xl shadow-xl border border-border/50 max-w-[240px] z-20 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-700">
              <p className="text-sm font-medium text-foreground">"If we skip the latte today, Tokyo is fully funded by June 12th."</p>
            </div>
          </div>
        </section>

        {/* PARADIGM SHIFT */}
        <section id="how-it-works" className="py-24 px-6 sm:px-12 bg-card">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <h2 className="text-4xl sm:text-5xl font-serif text-foreground">
              A budget tells you no. <br/>
              Tilly remembers what you said yes to.
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Other apps optimize a budget for an imaginary perfect person. Tilly optimizes for the future you actually want—the graduation trip, the deposit for an apartment with a kitchen window, the tattoo, the year off.
            </p>
          </div>
          
          <div className="mt-20 max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-background p-8 rounded-3xl border border-border">
              <Target className="w-10 h-10 text-primary mb-6" />
              <h3 className="text-xl font-serif mb-3">Protects your dreams</h3>
              <p className="text-muted-foreground leading-relaxed">
                Tilly's whole job is to keep your goals alive while real life happens. Your dreams aren't line items; they are the destination.
              </p>
            </div>
            <div className="bg-background p-8 rounded-3xl border border-border relative overflow-hidden">
              <Brain className="w-10 h-10 text-accent mb-6" />
              <h3 className="text-xl font-serif mb-3">Understands trade-offs</h3>
              <p className="text-muted-foreground leading-relaxed">
                Instead of shouting that you're over budget, Tilly gently shows you the math: "This dinner moves Tokyo from June to July."
              </p>
            </div>
            <div className="bg-background p-8 rounded-3xl border border-border">
              <Calendar className="w-10 h-10 text-primary mb-6" />
              <h3 className="text-xl font-serif mb-3">A journey companion</h3>
              <p className="text-muted-foreground leading-relaxed">
                Tilly checks in when life shifts—a new semester, an internship, a breakup—and quietly adjusts the plan. No nagging.
              </p>
            </div>
          </div>
        </section>

        {/* FEATURE: MEMORY & AI */}
        <section className="py-24 px-6 sm:px-12 max-w-7xl mx-auto flex flex-col md:flex-row items-center gap-16">
          <div className="flex-1 relative">
             <div className="absolute -inset-4 bg-secondary rounded-3xl -z-10 rotate-3" />
             <img src={tillyRamen} alt="Tilly with ramen" className="w-full rounded-2xl shadow-lg border border-border/50" />
          </div>
          <div className="flex-1 space-y-6">
            <h2 className="text-4xl font-serif text-foreground">She learns you, not just your transactions.</h2>
            <p className="text-lg text-muted-foreground">
              The more you use it, the more Tilly sounds like you. She remembers what matters—your roommate Jordan, the Friday ramen night that is absolutely sacred, the parent who chips in $200 sometimes. She builds a memory of your life, not just a ledger.
            </p>
            <ul className="space-y-4 mt-8">
              <li className="flex items-start gap-3">
                <div className="mt-1 w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                </div>
                <p className="text-foreground font-medium">Context-aware from day one <span className="block text-muted-foreground font-normal mt-1">A grad student in Boston with a $2,400 stipend gets completely different guidance than a freelancer in Austin.</span></p>
              </li>
              <li className="flex items-start gap-3">
                <div className="mt-1 w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
                  <div className="w-2 h-2 rounded-full bg-accent" />
                </div>
                <p className="text-foreground font-medium">Notices the subtle patterns <span className="block text-muted-foreground font-normal mt-1">"You always overspend the week after a midterm. Want me to hold a $50 buffer for next time?"</span></p>
              </li>
            </ul>
          </div>
        </section>

        {/* FEATURE: SCOUT (wait-for-sale / cheaper alternatives) */}
        <section className="py-24 px-6 sm:px-12 max-w-7xl mx-auto flex flex-col md:flex-row-reverse items-center gap-16">
          <div className="flex-1 relative">
            <div className="absolute -inset-4 bg-accent/30 rounded-3xl -z-10 -rotate-3" />
            <img src={tillyStudy} alt="Tilly checking prices" className="w-full rounded-2xl shadow-lg border border-border/50" />
          </div>
          <div className="flex-1 space-y-6">
            <h2 className="text-4xl font-serif text-foreground">Are you sure? It goes on sale next week.</h2>
            <p className="text-lg text-muted-foreground">
              Before a real purchase, Tilly quietly checks two things: is this item about to hit a known sale window like Black Friday or Boxing Week, and is someone nearby already selling the same thing on Facebook Marketplace, Kijiji, or a refurb site? You hear about it before you click buy, not after.
            </p>
            <ul className="space-y-4 mt-8">
              <li className="flex items-start gap-3">
                <div className="mt-1 w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                </div>
                <p className="text-foreground font-medium">Knows the sale calendar <span className="block text-muted-foreground font-normal mt-1">"Hold off until Nov 28 — Levi's has run 40% off every Black Friday for four years."</span></p>
              </li>
              <li className="flex items-start gap-3">
                <div className="mt-1 w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
                  <div className="w-2 h-2 rounded-full bg-accent" />
                </div>
                <p className="text-foreground font-medium">Finds it cheaper, locally <span className="block text-muted-foreground font-normal mt-1">"Three of these are listed on Facebook Marketplace within 5km. Want the closest one?"</span></p>
              </li>
            </ul>
          </div>
        </section>

        {/* BEHAVIORAL SCIENCE */}
        <section className="py-24 px-6 sm:px-12 bg-primary text-primary-foreground relative overflow-hidden">
          <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />
          
          <div className="max-w-6xl mx-auto flex flex-col-reverse md:flex-row items-center gap-16 relative z-10">
            <div className="flex-1 space-y-6">
              <h2 className="text-4xl font-serif">Behavioral science, not willpower.</h2>
              <p className="text-lg text-primary-foreground/80 leading-relaxed">
                Willpower runs out when you're tired, stressed, or studying for finals. Tilly uses behavioral science to make doing the right thing effortless.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-8">
                <div className="bg-black/10 p-5 rounded-2xl">
                  <h4 className="font-serif text-lg mb-2">Fresh Starts</h4>
                  <p className="text-sm text-primary-foreground/70">Mondays and the 1st of the month are psychologically proven times to reset. Tilly celebrates them.</p>
                </div>
                <div className="bg-black/10 p-5 rounded-2xl">
                  <h4 className="font-serif text-lg mb-2">Loss Aversion Reframed</h4>
                  <p className="text-sm text-primary-foreground/70">Saving isn't losing money today; it's fiercely protecting your future self.</p>
                </div>
                <div className="bg-black/10 p-5 rounded-2xl">
                  <h4 className="font-serif text-lg mb-2">Opt-in Friction</h4>
                  <p className="text-sm text-primary-foreground/70">Tiny pauses before big purchases to ensure it's what you truly want, not just what's easy.</p>
                </div>
                <div className="bg-black/10 p-5 rounded-2xl">
                  <h4 className="font-serif text-lg mb-2">Commitment Devices</h4>
                  <p className="text-sm text-primary-foreground/70">Lock in your intentions when you're feeling motivated, so your tired self doesn't have to choose.</p>
                </div>
              </div>
            </div>
            
            <div className="flex-1 flex justify-center">
              <img src={tillyGrad} alt="Tilly on graduation cap" className="w-full max-w-sm rounded-full shadow-2xl ring-8 ring-white/10" />
            </div>
          </div>
        </section>

        {/* UNIQUELY YOURS */}
        <section className="py-24 px-6 sm:px-12 bg-card text-card-foreground text-center">
          <div className="max-w-3xl mx-auto space-y-8">
            <h2 className="text-4xl font-serif">Becomes uniquely yours.</h2>
            <p className="text-lg text-muted-foreground">
              After a month, it's not generic software. It's your Tilly. Choose your theme, adjust her tone (from gentle to blunt), and let her get to know the rhythm of your life.
            </p>
            
            <div className="flex flex-wrap justify-center gap-4 mt-8">
              <div className="px-6 py-3 rounded-full bg-background border border-border flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-[#F6E8E6] border border-border" /> Bloom
              </div>
              <div className="px-6 py-3 rounded-full bg-background border border-border flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-[#1A1A24] border border-border" /> Dusk
              </div>
              <div className="px-6 py-3 rounded-full bg-background border border-border flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-[#FEF3C7] border border-border" /> Citrus
              </div>
              <div className="px-6 py-3 rounded-full bg-background border border-border flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-[#E0E7FF] border border-border" /> Neon
              </div>
            </div>
          </div>
        </section>

        {/* SECURITY & TRUST */}
        <section className="py-20 px-6 sm:px-12 border-y border-border bg-background">
          <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 text-center sm:text-left">
            <div className="space-y-3">
              <Lock className="w-8 h-8 text-muted-foreground mx-auto sm:mx-0" />
              <h4 className="font-medium text-foreground">Read-only connection</h4>
              <p className="text-sm text-muted-foreground">Powered by Plaid. Tilly can see your transactions to help you, but can never move your money.</p>
            </div>
            <div className="space-y-3">
              <Users className="w-8 h-8 text-muted-foreground mx-auto sm:mx-0" />
              <h4 className="font-medium text-foreground">Family & partner sharing</h4>
              <p className="text-sm text-muted-foreground">Split bills with your roommate or partner without the weirdness or passive-aggressive Venmos.</p>
            </div>
            <div className="space-y-3">
              <div className="w-8 h-8 flex items-center justify-center text-muted-foreground mx-auto sm:mx-0 font-serif text-2xl italic">&</div>
              <h4 className="font-medium text-foreground">Your data is yours</h4>
              <p className="text-sm text-muted-foreground">We never sell your data to credit card companies or advertisers. Ever. That's a promise.</p>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-24 px-6 sm:px-12 max-w-3xl mx-auto">
          <div className="text-center space-y-4 mb-12">
            <h2 className="text-3xl font-serif">Curious?</h2>
            <p className="text-muted-foreground">The most common questions we get from students.</p>
          </div>
          
          <div className="w-full divide-y divide-border border-y border-border">
            {faqs.map(({ q, a }) => (
              <details key={q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-left font-serif text-lg">
                  {q}
                  <Plus className="h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-300 group-open:rotate-45" />
                </summary>
                <p className="mt-3 text-muted-foreground leading-relaxed">{a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* BOTTOM CTA */}
        <section className="py-32 px-6 sm:px-12 bg-foreground text-background text-center relative overflow-hidden">
           <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/30 via-foreground to-foreground opacity-50" />
           <div className="max-w-2xl mx-auto relative z-10 space-y-8">
             <div className="flex justify-center mb-6">
                <img src={tillyReceipt} alt="Tilly" className="w-32 h-32 rounded-full border-4 border-background/10 bg-background/5" />
             </div>
             <h2 className="text-5xl font-serif">Tilly does the worrying so you don't have to.</h2>
             <p className="text-xl text-muted">Ready to protect your dreams?</p>
             <div className="pt-4">
               <Button asChild size="lg" className="rounded-full px-10 text-lg h-16 bg-background text-foreground hover:bg-background/90">
                 <a href={appUrl}>
                   Meet your Tilly <ArrowUpRight className="ml-2 w-5 h-5" />
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
