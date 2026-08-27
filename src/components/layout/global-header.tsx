"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu,
  Search,
  Sparkles,
} from "lucide-react";

export function GlobalHeader({
  onOpenSidebar,
  onOpenCommandPalette,
  onOpenTour,
}: {
  onOpenSidebar: () => void;
  onOpenCommandPalette: () => void;
  onOpenTour: () => void;
}) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b border-[#242820] bg-[#090b09]/95 px-4 backdrop-blur-md sm:px-6 lg:px-8">
      {/* Left: Mobile Toggle & Brand/Path context */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenSidebar}
          className="p-1.5 border border-[#252a24] bg-[#0d100d] text-[#8c9288] hover:text-[#e3e1d8] lg:hidden"
          aria-label="Open Navigation Menu"
        >
          <Menu className="h-4 w-4" />
        </button>

        {/* Global Quick Search Button */}
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="flex items-center gap-2 border border-[#252a24] bg-[#0d100d] hover:border-[#384234] hover:bg-[#121611] px-3 py-1.5 text-xs text-[#8c9288] transition-all"
        >
          <Search className="h-3.5 w-3.5 text-[#a4b58a]" />
          <span className="hidden sm:inline font-mono text-[11px]">Search pages or type &apos;tour&apos;...</span>
          <span className="inline sm:hidden font-mono text-[11px]">Search...</span>
          <kbd className="hidden sm:inline-block border border-[#252a24] bg-[#060806] px-1.5 py-0.2 text-[9px] font-mono text-[#687063]">
            Ctrl+K
          </kbd>
        </button>
      </div>

      {/* Center / Right: Quick Judge Action Pills & Tour Button */}
      <div className="flex items-center gap-2">
        {/* Judge Guided Tour Button */}
        <button
          type="button"
          onClick={onOpenTour}
          className="flex items-center gap-1.5 border border-[#5d6e46] bg-[#172012] hover:bg-[#1f2c18] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#c7d5a5] shadow-[0_0_15px_rgba(164,186,128,0.15)] transition-all"
        >
          <Sparkles className="h-3.5 w-3.5 text-[#a4b58a]" />
          <span className="hidden sm:inline">⚡ Judge Quick Tour</span>
          <span className="inline sm:hidden">⚡ Tour</span>
        </button>

        {/* Quick Link Pills (Hidden on very small screens) */}
        <div className="hidden md:flex items-center gap-1.5">
          <Link
            href="/track04-compliance"
            className={`px-2.5 py-1 text-[9px] font-mono font-bold uppercase tracking-wider border transition-all ${
              pathname === "/track04-compliance"
                ? "border-[#3e5532] bg-[#142211] text-[#a4b58a]"
                : "border-[#252a24] bg-[#0d100d] text-[#8c9288] hover:border-[#384234] hover:text-[#e3e1d8]"
            }`}
          >
            🎯 Track 04
          </Link>

          <Link
            href="/red-team"
            className={`px-2.5 py-1 text-[9px] font-mono font-bold uppercase tracking-wider border transition-all ${
              pathname === "/red-team"
                ? "border-[#3e5532] bg-[#142211] text-[#a4b58a]"
                : "border-[#252a24] bg-[#0d100d] text-[#8c9288] hover:border-[#384234] hover:text-[#e3e1d8]"
            }`}
          >
            ⚔️ Red Team
          </Link>

          <Link
            href="/forensics"
            className={`px-2.5 py-1 text-[9px] font-mono font-bold uppercase tracking-wider border transition-all ${
              pathname === "/forensics"
                ? "border-[#3e5532] bg-[#142211] text-[#a4b58a]"
                : "border-[#252a24] bg-[#0d100d] text-[#8c9288] hover:border-[#384234] hover:text-[#e3e1d8]"
            }`}
          >
            🔍 Forensics
          </Link>

          <Link
            href="/alerts"
            className={`px-2.5 py-1 text-[9px] font-mono font-bold uppercase tracking-wider border transition-all ${
              pathname === "/alerts"
                ? "border-[#3e5532] bg-[#142211] text-[#a4b58a]"
                : "border-[#252a24] bg-[#0d100d] text-[#8c9288] hover:border-[#384234] hover:text-[#e3e1d8]"
            }`}
          >
            🔔 Alerts
          </Link>
        </div>

        {/* Live Operational Status Pill */}
        <div className="hidden xl:flex items-center gap-2 border border-[#252a24] bg-[#090b09] px-2.5 py-1 font-mono text-[9px] text-[#8c9288]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#a4b58a]" />
          <span>98.1% ACCURACY · WAL ACTIVE</span>
        </div>
      </div>
    </header>
  );
}
