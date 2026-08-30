"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  X,
  HelpCircle,
  Activity,
  LayoutGrid,
  LayoutDashboard,
  UploadCloud,
  AlertTriangle,
  FlaskConical,
  MessageSquare,
  Scale,
  BarChart3,
  Gauge,
  BookOpen,
  Globe,
  GitCompare,
  Radio,
  TrendingUp,
  FlaskRound,
  ShieldCheck,
  ShieldAlert,
  Shield,
  Crosshair,
  Bell,
  History,
  FileCheck2,
  FileText,
  CheckCircle2,
  Code2,
  FileCode2,
  Zap,
  Sliders,
  Users,
  Sun,
  Moon,
  Laptop,
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

interface PaletteItem {
  id: string;
  category: "WORKSPACE" | "RECONCILIATION" | "SECURITY & AUDIT" | "DEVELOPER" | "ACTIONS" | "THEME";
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
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
  const { setTheme } = useTheme();
  const [query, setQuery] = useState<string>("");
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const paletteRef = useRef<HTMLDivElement>(null);

  const items: PaletteItem[] = [
    // Actions
    {
      id: "action_tour",
      category: "ACTIONS",
      title: "Launch Guided Tour",
      icon: HelpCircle,
      badge: "Tour",
      action: () => {
        onClose();
        onOpenTour();
      },
      keywords: "tour guide walkthrough judge quick start walkthrough",
    },
    {
      id: "action_demo",
      category: "ACTIONS",
      title: "Scale Workload & Benchmark Lab",
      icon: Activity,
      badge: "Lab",
      href: "/demo",
      keywords: "master demo run synthetic batch reconcile benchmark workload scale",
    },

    // Theme Actions
    {
      id: "theme_dark",
      category: "THEME",
      title: "Switch to Dark Theme",
      icon: Moon,
      action: () => {
        setTheme("dark");
        onClose();
      },
      keywords: "theme dark mode night black",
    },
    {
      id: "theme_light",
      category: "THEME",
      title: "Switch to Light Theme",
      icon: Sun,
      action: () => {
        setTheme("light");
        onClose();
      },
      keywords: "theme light mode day white",
    },
    {
      id: "theme_system",
      category: "THEME",
      title: "Use System Theme",
      icon: Laptop,
      action: () => {
        setTheme("system");
        onClose();
      },
      keywords: "theme system auto os match",
    },

    // Workspace
    {
      id: "overview",
      category: "WORKSPACE",
      title: "Overview",
      icon: LayoutGrid,
      href: "/",
      keywords: "landing overview home hero landing page",
    },
    {
      id: "dashboard",
      category: "WORKSPACE",
      title: "Dashboard",
      icon: LayoutDashboard,
      href: "/dashboard",
      keywords: "dashboard operations telemetry metrics volume",
    },
    {
      id: "upload",
      category: "WORKSPACE",
      title: "Upload CSV",
      icon: UploadCloud,
      href: "/upload",
      keywords: "upload statement razorpay hdfc csv ingest files",
    },
    {
      id: "exceptions",
      category: "WORKSPACE",
      title: "Exceptions",
      icon: AlertTriangle,
      href: "/exceptions",
      keywords: "exceptions triage queue investigations discrepancies",
    },
    {
      id: "sandbox",
      category: "WORKSPACE",
      title: "Interactive Sandbox",
      icon: FlaskConical,
      href: "/sandbox",
      keywords: "sandbox custom csv upload sample reconciliation testing",
    },
    {
      id: "chat",
      category: "WORKSPACE",
      title: "Finance Q&A",
      icon: MessageSquare,
      href: "/chat",
      keywords: "chat controller finance questions assistant llm",
    },

    // Reconciliation
    {
      id: "judgemode",
      category: "RECONCILIATION",
      title: "Judge Mode",
      icon: Scale,
      href: "/judge-mode",
      keywords: "judge mode executive overview demo track 04 evaluation",
    },
    {
      id: "benchmark",
      category: "RECONCILIATION",
      title: "Benchmark",
      icon: BarChart3,
      href: "/benchmark-comparison",
      keywords: "benchmark comparison baseline speed latency accuracy 806.75",
    },
    {
      id: "calibration",
      category: "RECONCILIATION",
      title: "Confidence",
      icon: Gauge,
      href: "/calibration",
      keywords: "confidence calibration brier score scatter accuracy ece",
    },
    {
      id: "playbooks",
      category: "RECONCILIATION",
      title: "Playbooks",
      icon: BookOpen,
      href: "/playbook",
      keywords: "playbook sop resolution refund fee chargeback dispute",
    },
    {
      id: "multicurrency",
      category: "RECONCILIATION",
      title: "Multi-Currency",
      icon: Globe,
      href: "/multi-currency",
      keywords: "multi currency fx foreign exchange usd eur gst vat fx spread",
    },
    {
      id: "aivsdet",
      category: "RECONCILIATION",
      title: "AI vs Deterministic",
      icon: GitCompare,
      href: "/ai-comparison",
      keywords: "ai vs deterministic comparison hallucination comparison",
    },
    {
      id: "livemonitor",
      category: "RECONCILIATION",
      title: "Live Monitor",
      icon: Radio,
      href: "/live-monitor",
      keywords: "live monitor stream events traffic telemetry",
    },
    {
      id: "businessimpact",
      category: "RECONCILIATION",
      title: "Business Impact",
      icon: TrendingUp,
      href: "/business-impact",
      keywords: "business impact roi cost savings manual hours efficiency",
    },
    {
      id: "scenarios",
      category: "RECONCILIATION",
      title: "Scenario Lab",
      icon: FlaskRound,
      href: "/scenarios",
      keywords: "scenario lab partial refund fee dispute settlement timing",
    },

    // Security & Audit
    {
      id: "verify",
      category: "SECURITY & AUDIT",
      title: "Verification",
      icon: ShieldCheck,
      href: "/verify",
      keywords: "verification hub tests suite runner benchmarks",
    },
    {
      id: "risk",
      category: "SECURITY & AUDIT",
      title: "Risk",
      icon: ShieldAlert,
      href: "/risk-dashboard",
      keywords: "risk exposure dashboard controller score tolerance stacking",
    },
    {
      id: "securitylab",
      category: "SECURITY & AUDIT",
      title: "Security Lab",
      icon: Shield,
      href: "/security-lab",
      keywords: "security lab 10 vector adversarial defense prompt injection",
    },
    {
      id: "redteam",
      category: "SECURITY & AUDIT",
      title: "Red Team",
      icon: Crosshair,
      href: "/red-team",
      keywords: "red team attack prompt injection ssrf exploit security",
    },
    {
      id: "alerts",
      category: "SECURITY & AUDIT",
      title: "Alerts",
      icon: Bell,
      href: "/alerts",
      keywords: "alerts webhooks stream slack pagerduty hmac signed",
    },
    {
      id: "forensics",
      category: "SECURITY & AUDIT",
      title: "Forensics",
      icon: History,
      href: "/forensics",
      keywords: "forensics playback timeline replay steps sqlite audit hash",
    },
    {
      id: "track04",
      category: "SECURITY & AUDIT",
      title: "Compliance",
      icon: FileCheck2,
      href: "/track04-compliance",
      keywords: "compliance matrix razorpay track 04 criteria proof audit",
    },
    {
      id: "audittrail",
      category: "SECURITY & AUDIT",
      title: "Audit Trail",
      icon: FileText,
      href: "/audit-trail",
      keywords: "audit trail merkle dag receipt offline verifier sha256",
    },
    {
      id: "security",
      category: "SECURITY & AUDIT",
      title: "Self-Test",
      icon: CheckCircle2,
      href: "/security",
      keywords: "self test penetration defense security hardening invariants",
    },

    // Developer
    {
      id: "developer",
      category: "DEVELOPER",
      title: "Developer API",
      icon: Code2,
      href: "/developer",
      keywords: "developer api rest curl endpoints openapi tokens",
    },
    {
      id: "apidocs",
      category: "DEVELOPER",
      title: "OpenAPI",
      icon: FileCode2,
      href: "/api-docs",
      keywords: "openapi swagger schema api interactive reference",
    },
    {
      id: "integrationsim",
      category: "DEVELOPER",
      title: "Integration",
      icon: Zap,
      href: "/integration-simulator",
      keywords: "integration simulator rest dispatch webhooks simulated events",
    },
    {
      id: "policyplayground",
      category: "DEVELOPER",
      title: "Policy",
      icon: Sliders,
      href: "/policy-playground",
      keywords: "policy ast engine parameters tolerance rules shadow replay",
    },
    {
      id: "multitenant",
      category: "DEVELOPER",
      title: "Multi-Tenant",
      icon: Users,
      href: "/multi-tenant",
      keywords: "multi tenant partition isolation enterprise organizations",
    },
  ];

  const filteredItems = items.filter((item) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      item.title.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      (item.badge && item.badge.toLowerCase().includes(q)) ||
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

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (paletteRef.current && !paletteRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    window.addEventListener("keydown", handleGlobalKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, [isOpen, onClose]);

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
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="command-search-input"
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 sm:pt-24 p-4 bg-black/80 backdrop-blur-xs animate-in fade-in-0 duration-100"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={paletteRef}
        className="relative w-full max-w-2xl rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl overflow-hidden font-sans"
        onKeyDown={handleKeyDown}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3.5 bg-card/60">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            id="command-search-input"
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Type a command or search..."
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close command palette"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-96 overflow-y-auto p-2 space-y-1">
          {filteredItems.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No results found for &ldquo;{query}&rdquo;
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const Icon = item.icon;
              const isSelected = idx === selectedIndex;

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
                  className={cn(
                    "w-full flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors",
                    isSelected
                      ? "bg-accent text-accent-foreground font-medium"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon className={cn("h-4 w-4 shrink-0", isSelected ? "text-foreground" : "text-muted-foreground")} />
                    <span className="truncate text-xs sm:text-sm font-medium">{item.title}</span>
                    <span className="text-[10px] font-mono text-muted-foreground/70">
                      {item.category}
                    </span>
                  </div>

                  {item.badge && (
                    <span className="font-mono text-[10px] text-muted-foreground border border-border bg-card px-1.5 py-0.5 rounded shrink-0">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border bg-card/40 px-4 py-2.5 text-xs font-mono text-muted-foreground">
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5">
              <kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 text-[10px]">↑↓</kbd>
              <span>Navigate</span>
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 text-[10px]">↵</kbd>
              <span>Select</span>
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 text-[10px]">ESC</kbd>
              <span>Close</span>
            </span>
          </div>
          <span className="text-xs">SettleMate AI</span>
        </div>
      </div>
    </div>
  );
}
