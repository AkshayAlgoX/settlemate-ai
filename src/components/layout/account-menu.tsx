"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  Sun,
  Moon,
  Laptop,
  BookOpen,
  LogOut,
  ChevronRight,
} from "lucide-react";
import { useTheme, type Theme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

interface SessionUser {
  sub: string;
  name: string;
  role: string;
}

interface AccountMenuProps {
  user: SessionUser | null;
  onOpenLogoutModal: () => void;
}

export function AccountMenu({ user, onOpenLogoutModal }: AccountMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [themeSubmenuOpen, setThemeSubmenuOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setThemeSubmenuOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        if (themeSubmenuOpen) {
          setThemeSubmenuOpen(false);
        } else {
          setIsOpen(false);
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, themeSubmenuOpen]);

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((p) => p[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "SM";

  const themeOptions: { value: Theme; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { value: "dark", label: "Dark", icon: Moon },
    { value: "light", label: "Light", icon: Sun },
    { value: "system", label: "System", icon: Laptop },
  ];

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-secondary text-xs font-mono font-medium text-foreground hover:border-foreground/30 hover:opacity-90 transition focus-visible:ring-2 focus-visible:ring-ring outline-none"
        title="Account & preferences"
      >
        {initials}
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-60 rounded-xl border border-border bg-popover text-popover-foreground p-1 shadow-2xl z-50 animate-in fade-in-0 zoom-in-95 duration-100 font-sans"
        >
          {/* User Header */}
          <div className="px-3 py-2.5 border-b border-border/80">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary text-xs font-mono font-semibold text-foreground">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-foreground">
                  {user?.name || "Local Controller"}
                </p>
                <p className="truncate text-[11px] font-mono text-muted-foreground">
                  {user?.role || "Institutional Role"}
                </p>
              </div>
            </div>
          </div>

          <div className="py-1 space-y-0.5 text-xs">
            {/* Theme Trigger & Submenu */}
            <div className="relative">
              <button
                type="button"
                role="menuitem"
                onClick={() => setThemeSubmenuOpen((prev) => !prev)}
                className="w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-left hover:bg-accent hover:text-accent-foreground text-foreground transition"
              >
                <div className="flex items-center gap-2">
                  {theme === "light" ? (
                    <Sun className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : theme === "system" ? (
                    <Laptop className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <Moon className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span>Theme</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-mono text-[11px] text-muted-foreground capitalize">
                    {theme}
                  </span>
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                </div>
              </button>

              {/* Theme Submenu */}
              {themeSubmenuOpen && (
                <div className="my-1 mx-1 rounded-lg border border-border bg-secondary/60 p-1 space-y-0.5">
                  {themeOptions.map((opt) => {
                    const Icon = opt.icon;
                    const isSelected = theme === opt.value;

                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setTheme(opt.value);
                          setThemeSubmenuOpen(false);
                        }}
                        className={cn(
                          "w-full flex items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs transition",
                          isSelected
                            ? "bg-primary text-primary-foreground font-medium"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <Icon className="h-3.5 w-3.5" />
                          <span>{opt.label}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Documentation link */}
            <Link
              href="/api-docs"
              role="menuitem"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-foreground hover:bg-accent hover:text-accent-foreground transition"
            >
              <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Documentation & API</span>
            </Link>
          </div>

          {/* Logout Section */}
          <div className="border-t border-border/80 pt-1 mt-1">
            <button
              type="button"
              role="menuitem"
              data-testid="header-logout-trigger"
              onClick={() => {
                setIsOpen(false);
                onOpenLogoutModal();
              }}
              className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-destructive hover:bg-destructive/10 transition"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Log out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
