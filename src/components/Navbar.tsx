import { Monitor } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

export default function Navbar() {
  const { pathname } = useLocation();

  const linkClass = (path: string) =>
    `flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-pill transition-colors duration-200 ${
      pathname === path
        ? "bg-primary text-primary-foreground"
        : "text-card-foreground hover:bg-secondary"
    }`;

  return (
    <nav className="sticky top-0 z-50 h-16 frosted-glass border-b border-border">
      <div className="h-full flex items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-3" data-testid="link-home-logo">
          <img src="/assets/logo-icon.svg" alt="" className="h-10 w-10 object-contain bg-transparent" data-testid="img-logo-mark" />
          <span className="text-xl font-bold tracking-tight text-card-foreground" data-testid="text-logo-name">ClarIT</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link to="/" className={linkClass("/")}> 
            <Monitor className="w-4 h-4" />
            <span className="hidden sm:inline">Chat</span>
          </Link>
        </div>
      </div>
    </nav>
  );
}
