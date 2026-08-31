"use client";

import React, { useState, useEffect } from "react";
import { Menu, Search, HelpCircle } from "lucide-react";

import { AccountMenu } from "@/components/layout/account-menu";
import { OperationsCenter } from "@/components/layout/operations-center";
import type { SessionUser } from "@/components/layout/sidebar";
import { safeFetch } from "@/lib/api/safe-fetch";

interface GlobalHeaderProps {
  onOpenSidebar: () => void;
  onOpenCommandPalette: () => void;
  onOpenTour: () => void;
  onOpenLogoutModal: () => void;
}

export function GlobalHeader({
  onOpenSidebar,
  onOpenCommandPalette,
  onOpenTour,
  onOpenLogoutModal,
}: GlobalHeaderProps) {
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    let mounted = true;
    safeFetch<{ authenticated?: boolean; user?: SessionUser }>("/api/auth/me")
      .then((res) => {
        if (mounted && res.ok && res.data?.authenticated && res.data.user) {
          setUser(res.data.user);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-14 sm:h-16 w-full items-center justify-between border-b border-border bg-background/80 px-4 sm:px-6 backdrop-blur-md transition-colors">
      {/* Left: Mobile Toggle & Command Search */}
      <div className="flex items-center gap-2.5 sm:gap-3">
        {/* Mobile Sidebar Toggle (screens < lg) */}
        <button
          type="button"
          onClick={onOpenSidebar}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground lg:hidden"
          aria-label="Open navigation menu"
        >
          <Menu className="h-4 w-4" />
        </button>

        {/* Global Search / Command Menu Trigger */}
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="flex h-9.5 sm:h-10 items-center gap-2.5 sm:gap-3 rounded-lg border border-border bg-card px-3.5 text-sm text-muted-foreground hover:border-foreground/30 hover:bg-accent/40 hover:text-foreground transition-colors min-w-[200px] sm:min-w-[320px] lg:min-w-[360px] justify-between cursor-pointer focus-visible:ring-2 focus-visible:ring-ring outline-none shadow-2xs"
          data-testid="search-command-trigger"
          aria-label="Search and command palette"
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="hidden sm:inline font-sans truncate text-xs sm:text-sm">Search commands, pages, proofs...</span>
            <span className="inline sm:hidden font-sans text-xs">Search...</span>
          </div>
          <kbd className="hidden sm:inline-flex items-center rounded-md border border-border/90 bg-secondary px-2 py-0.5 text-xs font-mono font-medium text-foreground/80 shadow-2xs ml-2.5 sm:ml-3 shrink-0 select-none">
            ⌘ K
          </kbd>
        </button>
      </div>

      {/* Right: Operations Center, Tour button, System status & Account */}
      <div className="flex items-center gap-2 sm:gap-2.5">
        <OperationsCenter />

        <button
          type="button"
          onClick={onOpenTour}
          className="flex h-9 sm:h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 sm:px-3.5 text-sm font-medium text-foreground hover:bg-accent hover:border-foreground/30 transition-colors cursor-pointer"
        >
          <HelpCircle className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="hidden sm:inline">Guided Tour</span>
          <kbd className="hidden sm:inline-block rounded border border-border bg-muted px-1.5 py-0.5 text-xs font-mono text-muted-foreground">
            ?
          </kbd>
        </button>


        <div className="hidden md:flex items-center gap-2.5 rounded-lg border border-border bg-card/60 px-3 py-1.5 text-xs font-mono text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
          <span>98.1% accuracy · WAL Active</span>
        </div>

        {/* Account Menu with Theme Selector */}
        <AccountMenu
          user={user}
          onOpenLogoutModal={onOpenLogoutModal}
        />
      </div>
    </header>
  );
}

