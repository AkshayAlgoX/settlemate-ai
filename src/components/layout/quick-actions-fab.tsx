"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  X,
  ShieldCheck,
  Scale,
  FlaskConical,
  ShieldAlert,
  Code2,
  HelpCircle,
} from "lucide-react";

export function QuickActionsFab({ onOpenTour }: { onOpenTour: () => void }) {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
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
        setIsOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const quickLinks = [
    {
      title: "Guided Tour",
      icon: HelpCircle,
      badge: "?",
      action: () => {
        setIsOpen(false);
        onOpenTour();
      },
    },
    {
      title: "Verification Hub",
      icon: ShieldCheck,
      badge: "Suite",
      href: "/verify",
    },
    {
      title: "Judge Mode",
      icon: Scale,
      badge: "Executive",
      href: "/judge-mode",
    },
    {
      title: "Interactive Sandbox",
      icon: FlaskConical,
      badge: "CSV",
      href: "/sandbox",
    },
    {
      title: "Risk Dashboard",
      icon: ShieldAlert,
      badge: "Risk",
      href: "/risk-dashboard",
    },
    {
      title: "Developer API",
      icon: Code2,
      badge: "REST",
      href: "/developer",
    },
  ];

  return (
    <div ref={menuRef} className="fixed bottom-6 right-6 z-40 flex flex-col items-end">
      {/* Expanded Popover */}
      {isOpen && (
        <div className="mb-2.5 w-64 rounded-xl border border-border bg-popover text-popover-foreground p-1 shadow-2xl animate-in fade-in-0 slide-in-from-bottom-2 duration-150 font-sans">
          <div className="flex items-center justify-between border-b border-border px-2.5 py-1.5 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Quick Actions</span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-secondary transition cursor-pointer"
              aria-label="Close quick actions"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="py-1 space-y-0.5">
            {quickLinks.map((item) => {
              const Icon = item.icon;
              if (item.action) {
                return (
                  <button
                    key={item.title}
                    type="button"
                    onClick={item.action}
                    className="w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-left hover:bg-accent hover:text-accent-foreground transition text-xs text-foreground cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="truncate">{item.title}</span>
                    </div>
                    <span className="font-mono text-[10px] text-muted-foreground border border-border bg-card px-1 py-0.2 rounded">
                      {item.badge}
                    </span>
                  </button>
                );
              }

              return (
                <Link
                  key={item.title}
                  href={item.href!}
                  onClick={() => setIsOpen(false)}
                  className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-left hover:bg-accent hover:text-accent-foreground transition text-xs text-foreground"
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="truncate">{item.title}</span>
                  </div>
                  <span className="font-mono text-[10px] text-muted-foreground border border-border bg-card px-1 py-0.2 rounded">
                    {item.badge}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-muted-foreground hover:border-foreground/30 hover:text-foreground hover:bg-accent shadow-md transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-ring outline-none"
        aria-label="Toggle Quick Actions"
      >
        <span>Actions</span>
      </button>
    </div>
  );
}
