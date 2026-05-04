import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { EXPO_GO_FALLBACK_URL, handleDownloadClick } from "@/lib/download";

export function Navigation() {
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
          <a
            href={EXPO_GO_FALLBACK_URL}
            onClick={handleDownloadClick}
            rel="noopener"
          >
            Start free
          </a>
        </Button>
      </div>
    </nav>
  );
}
