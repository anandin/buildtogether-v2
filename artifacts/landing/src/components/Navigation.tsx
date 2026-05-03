import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export function Navigation() {
  const appUrl = import.meta.env.VITE_APP_URL ? `https://${import.meta.env.VITE_APP_URL}` : "#download"; // TODO: fallback if no URL
  
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 bg-background/80 backdrop-blur-md border-b border-border/50">
      <div className="flex items-center gap-2">
        <Link href="/" className="font-serif text-2xl font-bold tracking-tight text-foreground">Tilly</Link>
      </div>
      <div className="flex items-center gap-4">
        <a href="#how-it-works" className="hidden sm:inline-block text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
          How it works
        </a>
        <Button asChild className="rounded-full font-medium" size="sm">
          <a href={appUrl}>Start free</a>
        </Button>
      </div>
    </nav>
  );
}
