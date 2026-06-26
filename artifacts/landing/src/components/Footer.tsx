import { Link } from "wouter";
import { EXPO_GO_FALLBACK_URL, handleDownloadClick } from "@/lib/download";

export function Footer() {
  const appUrl = EXPO_GO_FALLBACK_URL;

  return (
    <footer className="bg-foreground text-background py-20 px-6 sm:px-12 mt-20">
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-12">
        <div className="md:col-span-2 space-y-6">
          <Link href="/" className="font-serif text-3xl font-bold text-card">Tilly</Link>
          <p className="text-muted text-lg max-w-sm">
            Your personal money & dreams agent. No scolding. No red bars. Just your future, gently protected.
          </p>
        </div>
        
        <div className="space-y-4">
          <h4 className="font-serif text-lg text-card">Company</h4>
          <ul className="space-y-3">
            <li><a href={appUrl} onClick={handleDownloadClick} rel="noopener" className="text-muted hover:text-card transition-colors">Download</a></li>
            <li><a href="#" className="text-muted hover:text-card transition-colors">About us</a></li>
            <li><a href="#" className="text-muted hover:text-card transition-colors">Careers</a></li>
            <li><a href="#" className="text-muted hover:text-card transition-colors">Contact</a></li>
          </ul>
        </div>
        
        <div className="space-y-4">
          <h4 className="font-serif text-lg text-card">Legal &amp; Trust</h4>
          <ul className="space-y-3">
            <li><Link href="/security" className="text-muted hover:text-card transition-colors">Security</Link></li>
            <li><a href="#" className="text-muted hover:text-card transition-colors">Privacy Policy</a></li>
            <li><a href="#" className="text-muted hover:text-card transition-colors">Terms of Service</a></li>
          </ul>
        </div>
      </div>
      
      <div className="max-w-6xl mx-auto mt-20 pt-8 border-t border-muted/20 text-muted flex flex-col md:flex-row justify-between items-center gap-4 text-sm">
        <p>© {new Date().getFullYear()} Tilly Inc. All rights reserved.</p>
        <p>Built with warmth.</p>
      </div>
    </footer>
  );
}
