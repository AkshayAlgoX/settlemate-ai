"use client";

import React, { useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { GlobalHeader } from "@/components/layout/global-header";
import { CommandPalette } from "@/components/layout/command-palette";
import { GuidedTourModal } from "@/components/layout/guided-tour-modal";
import { ToastProvider } from "@/components/ui/toast";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);

  // Global Keyboard Shortcuts (Ctrl+K / Cmd+K and ?)
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Check if target is an input or textarea
    const target = e.target as HTMLElement | null;
    const isInput = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      setCommandPaletteOpen((prev) => !prev);
    } else if (e.key === "?" && !isInput && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      setTourOpen(true);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  if (pathname === "/login") {
    return (
      <ToastProvider>
        <div className="min-h-screen bg-[#080a09] text-[#e9e7df]">
          {children}
        </div>
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <div className="flex h-screen overflow-hidden bg-[#080a09] text-[#e9e7df]">
        <Sidebar
          mobileOpen={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
        />

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <GlobalHeader
            onOpenSidebar={() => setMobileSidebarOpen(true)}
            onOpenCommandPalette={() => setCommandPaletteOpen(true)}
            onOpenTour={() => setTourOpen(true)}
          />

          <main className="min-w-0 flex-1 overflow-y-auto bg-[#080a09]">
            <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 sm:py-7 lg:px-9 lg:py-8">
              {children}
            </div>
          </main>
        </div>

        {/* Global Modals */}
        <CommandPalette
          isOpen={commandPaletteOpen}
          onClose={() => setCommandPaletteOpen(false)}
          onOpenTour={() => setTourOpen(true)}
        />

        <GuidedTourModal
          isOpen={tourOpen}
          onClose={() => setTourOpen(false)}
        />
      </div>
    </ToastProvider>
  );
}