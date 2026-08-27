"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Target,
  Swords,
  History,
  BellRing,
  AlertTriangle,
  Award,
  BarChart3,
  Globe,
  Gauge,
  BookOpen,
  Scale,
  ShieldCheck,
  ShieldAlert,
  FlaskConical,
  PlugZap,
  Code2,
  Sparkles,
  X,
  Play,
} from "lucide-react";

interface PaletteItem {
  id: string;
  category: "JUDGE HIGHLIGHTS" | "CORE MODULES" | "OPERATIONS & SECURITY" | "QUICK ACTIONS";
  title: string;
  badge: string;
  icon: React.ElementType;
  href?: string;
  action?: () => void;
  keywords: string;
}

export function CommandPalette({
  isOpen,
  onClose,
  onOpenTour,
}: {
  isOpen: boolean;
  onClose: () => void;
  onOpenTour: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState<string>("");
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const items: PaletteItem[] = [
    // Judge Highlights
    {
      id: "track04",
      category: "JUDGE HIGHLIGHTS",
      title: "Track 04 Compliance Matrix",
      badge: "🎯 00F",
      icon: Target,
      href: "/track04-compliance",
      keywords: "compliance matrix razorpay track 04 criteria proof",
    },
    {
      id: "redteam",
      category: "JUDGE HIGHLIGHTS",
      title: "Live Judge Red-Teaming Console",
      badge: "⚔️ 00U",
      icon: Swords,
      href: "/red-team",
      keywords: "red team attack prompt injection ssrf exploit security",
    },
    {
      id: "forensics",
      category: "JUDGE HIGHLIGHTS",
      title: "Reconciliation Forensics & Playback",
      badge: "🔍 00W",
      icon: History,
      href: "/forensics",
      keywords: "forensics playback timeline replay steps sqlite",
    },
    {
      id: "alerts",
      category: "JUDGE HIGHLIGHTS",
      title: "Smart Alerting Simulator & Webhooks",
      badge: "🔔 00V",
      icon: BellRing,
      href: "/alerts",
      keywords: "alerts webhooks stream slack pagerduty hmac",
    },
    {
      id: "risk",
      category: "JUDGE HIGHLIGHTS",
      title: "Risk & Exposure Command Center",
      badge: "🚨 00T",
      icon: AlertTriangle,
      href: "/risk-dashboard",
      keywords: "risk exposure dashboard controller score tolerance stacking",
    },
    {
      id: "judgemode",
      category: "JUDGE HIGHLIGHTS",
      title: "Executive Judge Mode Cockpit",
      badge: "⭐ 00",
      icon: Award,
      href: "/judge-mode",
      keywords: "judge mode executive overview demo",
    },

    // Core Modules
    {
      id: "multicurrency",
      category: "CORE MODULES",
      title: "Multi-Currency Recon & FX Isolation",
      badge: "🌍 00S",
      icon: Globe,
      href: "/multi-currency",
      keywords: "multi currency fx foreign exchange usd eur gst vat",
    },
    {
      id: "calibration",
      category: "CORE MODULES",
      title: "Confidence Calibration & Brier Score",
      badge: "📈 00Q",
      icon: Gauge,
      href: "/calibration",
      keywords: "confidence calibration brier score scatter accuracy",
    },
    {
      id: "playbooks",
      category: "CORE MODULES",
      title: "Reconciliation Resolution Playbooks",
      badge: "📚 00R",
      icon: BookOpen,
      href: "/playbook",
      keywords: "playbook sop resolution refund fee chargeback",
    },
    {
      id: "benchmark",
      category: "CORE MODULES",
      title: "Benchmark Comparison vs Baselines",
      badge: "📊 00J",
      icon: BarChart3,
      href: "/benchmark-comparison",
      keywords: "benchmark comparison baseline speed latency",
    },
    {
      id: "aivsdet",
      category: "CORE MODULES",
      title: "AI vs Deterministic Comparison",
      badge: "⚖️ 00N",
      icon: Scale,
      href: "/ai-comparison",
      keywords: "ai vs deterministic comparison hallucination",
    },
    {
      id: "sandbox",
      category: "CORE MODULES",
      title: "Interactive Reconciliation Sandbox",
      badge: "🧪 00B",
      icon: FlaskConical,
      href: "/sandbox",
      keywords: "sandbox custom csv upload sample reconciliation",
    },

    // Operations & Security
    {
      id: "verify",
      category: "OPERATIONS & SECURITY",
      title: "Verification Hub & Test Runner",
      badge: "🛡️ 00C",
      icon: ShieldCheck,
      href: "/verify",
      keywords: "verification hub tests suite runner benchmarks",
    },
    {
      id: "securitylab",
      category: "OPERATIONS & SECURITY",
      title: "Adversarial Security Lab",
      badge: "🛡️ 00E",
      icon: ShieldAlert,
      href: "/security-lab",
      keywords: "security lab exploits tampering attacks",
    },
    {
      id: "developer",
      category: "OPERATIONS & SECURITY",
      title: "Developer API & OpenAPI Console",
      badge: "💻 00I",
      icon: Code2,
      href: "/developer",
      keywords: "developer api rest curl endpoints openapi",
    },
    {
      id: "simulator",
      category: "OPERATIONS & SECURITY",
      title: "Integration & Batch Simulator",
      badge: "🔌 00H",
      icon: PlugZap,
      href: "/integration-simulator",
      keywords: "integration simulator erp webhooks batch generate",
    },
    {
      id: "audittrail",
      category: "OPERATIONS & SECURITY",
      title: "Audit Trail & Offline Receipt Verifier",
      badge: "📜 00M",
      icon: History,
      href: "/audit-trail",
      keywords: "audit trail merkle dag receipt offline verifier",
    },

    // Quick Actions
    {
      id: "action_tour",
      category: "QUICK ACTIONS",
      title: "Launch 5-Step Judge Guided Tour",
      badge: "⚡ TOUR",
      icon: Sparkles,
      action: () => {
        onClose();
        onOpenTour();
      },
      keywords: "tour guide walkthrough judge quick start",
    },
    {
      id: "action_demo",
      category: "QUICK ACTIONS",
      title: "Run Master Live Demo",
      badge: "▶ DEMO",
      icon: Play,
      href: "/demo",
      keywords: "master demo run synthetic batch reconcile",
    },
  ];

  const filteredItems = items.filter((item) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      item.title.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      item.badge.toLowerCase().includes(q) ||
      item.keywords.includes(q)
    );
  });

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % (filteredItems.length || 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % (filteredItems.length || 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const selected = filteredItems[selectedIndex];
      if (selected) {
        if (selected.action) {
          selected.action();
        } else if (selected.href) {
          onClose();
          router.push(selected.href);
        }
      }
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-100">
      <div
        className="relative w-full max-w-2xl border border-[#3e5532] bg-[#090c09] shadow-2xl overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 border-b border-[#252a24] bg-[#0d100d] px-4 py-3.5">
          <Search className="h-4 w-4 text-[#a4b58a]" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Search pages, killer judge demos, or type 'tour' / 'red team'..."
            className="w-full bg-transparent text-sm text-[#e3e1d8] placeholder-[#687063] focus:outline-none font-mono"
          />
          <div className="flex items-center gap-1.5 text-[9px] font-mono text-[#687063] uppercase border border-[#252a24] px-1.5 py-0.5 bg-[#060806]">
            <span>ESC</span> to close
          </div>
          <button type="button" onClick={onClose} className="text-[#687063] hover:text-[#e3e1d8]">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-[380px] overflow-y-auto p-2 space-y-1">
          {filteredItems.length === 0 ? (
            <div className="p-8 text-center text-xs font-mono text-[#687063]">
              No matching modules or actions found for &quot;{query}&quot;
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              const Icon = item.icon;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (item.action) {
                      item.action();
                    } else if (item.href) {
                      onClose();
                      router.push(item.href);
                    }
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full flex items-center justify-between p-3 text-left transition-all border ${
                    isSelected
                      ? "border-[#3e5532] bg-[#142211] text-[#f0eee6]"
                      : "border-transparent text-[#a4ab9e] hover:bg-[#0d100d]"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`p-1.5 border shrink-0 ${
                        isSelected
                          ? "border-[#3e5532] bg-[#1a2b16] text-[#a4b58a]"
                          : "border-[#252a24] bg-[#060806] text-[#687063]"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="truncate">
                      <div className="text-xs font-bold text-[#e3e1d8] flex items-center gap-2">
                        <span>{item.title}</span>
                        <span className="text-[8px] font-mono text-[#687063] uppercase opacity-75">
                          {item.category}
                        </span>
                      </div>
                    </div>
                  </div>

                  <span
                    className={`font-mono text-[9px] font-bold px-2 py-0.5 border shrink-0 ${
                      isSelected
                        ? "border-[#3e5532] bg-[#1a2b16] text-[#a4b58a]"
                        : "border-[#252a24] bg-[#0d100d] text-[#687063]"
                    }`}
                  >
                    {item.badge}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="flex items-center justify-between border-t border-[#252a24] bg-[#0d100d] px-4 py-2 text-[9px] font-mono text-[#687063]">
          <div className="flex items-center gap-3">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>ESC Dismiss</span>
          </div>
          <div className="text-[#a4b58a]">SettleMate AI · 25+ Verified Modules</div>
        </div>
      </div>
    </div>
  );
}
