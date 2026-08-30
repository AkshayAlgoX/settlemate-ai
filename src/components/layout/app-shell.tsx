"use client";

import React, { useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { GlobalHeader } from "@/components/layout/global-header";
import { CommandPalette } from "@/components/layout/command-palette";
import { GuidedTourModal } from "@/components/layout/guided-tour-modal";
import { QuickActionsFab } from "@/components/layout/quick-actions-fab";
import { ToastProvider } from "@/components/ui/toast";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      if (typeof window !== "undefined") {
        return localStorage.getItem("settlemate-sidebar-collapsed") === "true";
      }
    } catch {
      // Storage unavailable
    }
    return false;
  });
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);

  const toggleSidebarCollapse = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("settlemate-sidebar-collapsed", String(next));
      } catch {
        // Storage unavailable
      }
      return next;
    });
  };

  // Global Keyboard Shortcuts (Ctrl+K / Cmd+K and ?)
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
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

  if (pathname === "/login" || pathname === "/") {
    return (
      <ToastProvider>
        <div className="min-h-screen bg-background text-foreground">
          {children}
        </div>
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <div className="flex h-screen overflow-hidden bg-background text-foreground">
        <Sidebar
          mobileOpen={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
          collapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebarCollapse}
          showLogoutConfirm={logoutModalOpen}
          setShowLogoutConfirm={setLogoutModalOpen}
        />

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <GlobalHeader
            onOpenSidebar={() => setMobileSidebarOpen(true)}
            onOpenCommandPalette={() => setCommandPaletteOpen((prev) => !prev)}
            onOpenTour={() => setTourOpen(true)}
            onOpenLogoutModal={() => setLogoutModalOpen(true)}
          />

          <main className="min-w-0 flex-1 overflow-y-auto bg-background transition-colors">
            <div className="mx-auto w-full max-w-[1680px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-8 xl:px-10">
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

        <QuickActionsFab onOpenTour={() => setTourOpen(true)} />
      </div>
    </ToastProvider>
  );
}