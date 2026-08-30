"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  UploadCloud,
  AlertTriangle,
  Activity,
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
  LogOut,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface SessionUser {
  sub: string;
  name: string;
  role: string;
}

export interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  meta?: string;
  badge?: string;
  description?: string;
  hasSubmenu?: boolean;
}

export interface NavFamily {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  badge?: string;
  items: NavItem[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

// ── Canonical Navigation Inventory (Single Source of Truth) ──

export const WORKSPACE_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/sandbox", label: "Interactive Sandbox", icon: FlaskConical, badge: "HITL" },
  { href: "/exceptions", label: "Exceptions", icon: AlertTriangle },
  { href: "/demo", label: "Scale Workload", icon: Activity },
  { href: "/upload", label: "Upload CSV", icon: UploadCloud },
  { href: "/chat", label: "Finance Q&A", icon: MessageSquare },
];

export const PRODUCT_FAMILIES: NavFamily[] = [
  {
    id: "reconciliation",
    label: "Reconciliation",
    icon: Scale,
    description: "Multi-pass solver, benchmarks & calibration",
    badge: "9",
    items: [
      { href: "/judge-mode", label: "Judge Mode", icon: Scale, badge: "CORE" },
      { href: "/benchmark-comparison", label: "Benchmark Comparison", icon: BarChart3 },
      { href: "/calibration", label: "Confidence Calibration", icon: Gauge },
      { href: "/playbook", label: "Reconciliation Playbooks", icon: BookOpen },
      { href: "/multi-currency", label: "Multi-Currency Recon", icon: Globe },
      { href: "/ai-comparison", label: "AI vs Deterministic", icon: GitCompare },
      { href: "/live-monitor", label: "Live Streaming Monitor", icon: Radio },
      { href: "/business-impact", label: "Business Impact & ROI", icon: TrendingUp },
      { href: "/scenarios", label: "Scenario Lab", icon: FlaskRound },
    ],
  },
  {
    id: "security-audit",
    label: "Security & Audit",
    icon: ShieldCheck,
    description: "Cryptographic DAG, risk gates & forensics",
    badge: "10",
    items: [
      { href: "/verify", label: "Verification Hub", icon: ShieldCheck, badge: "PROOFS" },
      { href: "/risk-dashboard", label: "Risk Dashboard", icon: ShieldAlert },
      { href: "/security-lab", label: "Security Lab (10 Vectors)", icon: Shield },
      { href: "/red-team", label: "Red Team Defense", icon: Crosshair },
      { href: "/alerts", label: "Smart Alerts", icon: Bell },
      { href: "/forensics", label: "Forensics & Playback", icon: History },
      { href: "/track04-compliance", label: "Compliance Binder", icon: FileCheck2 },
      { href: "/audit-trail", label: "General Ledger & DAG", icon: FileText },
      { href: "/security", label: "Self-Test & Hardening", icon: CheckCircle2 },
      { href: "/audit", label: "System Audit Logs", icon: History },
    ],
  },
  {
    id: "developer",
    label: "Developer Tools",
    icon: Code2,
    description: "API, OpenAPI schemas & integration",
    badge: "5",
    items: [
      { href: "/developer", label: "Developer Portal & API", icon: Code2, badge: "v1" },
      { href: "/api-docs", label: "OpenAPI & Swagger Docs", icon: FileCode2 },
      { href: "/integration-simulator", label: "Integration Simulator", icon: Zap },
      { href: "/policy-playground", label: "Policy Playground", icon: Sliders },
      { href: "/multi-tenant", label: "Multi-Tenant Partitions", icon: Users },
    ],
  },
];

// Flat group mapping preserved for test compatibility
export const navGroups: NavGroup[] = [
  { label: "WORKSPACE", items: WORKSPACE_ITEMS },
  ...PRODUCT_FAMILIES.map((f) => ({ label: f.label.toUpperCase(), items: f.items })),
];

// Spotlight featured demos for 1-click discovery
const SPOTLIGHT_ITEMS: NavItem[] = [
  { href: "/judge-mode", label: "Judge Mode", icon: Scale, badge: "CORE" },
  { href: "/verify", label: "Verification Hub", icon: ShieldCheck, badge: "PROOFS" },
  { href: "/risk-dashboard", label: "Risk Dashboard", icon: ShieldAlert },
];

export function BrandMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-secondary font-mono font-bold text-xs text-foreground shrink-0 select-none shadow-2xs",
        className
      )}
    >
      SM
    </div>
  );
}

interface SidebarProps {
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  showLogoutConfirm?: boolean;
  setShowLogoutConfirm?: (show: boolean) => void;
}

export function Sidebar({
  mobileOpen = false,
  onCloseMobile,
  collapsed = false,
  onToggleCollapse,
  showLogoutConfirm: externalShowLogout,
  setShowLogoutConfirm: externalSetShowLogout,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const [user, setUser] = useState<SessionUser | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [internalShowLogout, setInternalShowLogout] = useState(false);

  const showLogoutConfirm = externalShowLogout !== undefined ? externalShowLogout : internalShowLogout;
  const setShowLogoutConfirm = externalSetShowLogout || setInternalShowLogout;

  const isRouteActive = React.useCallback((href: string) => {
    if (href === "/") return pathname === "/";
    if (pathname === href) return true;
    if (href === "/exceptions" && (pathname.startsWith("/exceptions") || pathname.startsWith("/exception-analysis") || pathname.startsWith("/provenance"))) return true;
    if (href === "/developer") return pathname === "/developer";
    if (href === "/api-docs") return pathname === "/api-docs";
    return pathname.startsWith(href + "/");
  }, [pathname]);

  // Find family owning current path
  const currentFamily = useMemo(() => {
    return PRODUCT_FAMILIES.find((f) =>
      f.items.some((item) => isRouteActive(item.href))
    );
  }, [isRouteActive]);

  // URL-authoritative contextual suite state: synchronize whenever route changes
  const [activeFamilyId, setActiveFamilyId] = useState<string | null>(() => currentFamily?.id ?? null);
  const [trackedPath, setTrackedPath] = useState(pathname);

  if (trackedPath !== pathname) {
    setTrackedPath(pathname);
    setActiveFamilyId(currentFamily?.id ?? null);
  }

  useEffect(() => {
    let mounted = true;
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((result) => {
        if (mounted && result?.authenticated) {
          setUser(result.user);
        }
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && showLogoutConfirm) {
        setShowLogoutConfirm(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showLogoutConfirm, setShowLogoutConfirm]);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setShowLogoutConfirm(false);
      router.push("/login");
      router.refresh();
    }
  };

  const activeFamily = PRODUCT_FAMILIES.find((f) => f.id === activeFamilyId);

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/80 backdrop-blur-xs lg:hidden animate-in fade-in-0 duration-150"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-screen shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground transition-[width,transform] duration-200 ease-in-out lg:static lg:translate-x-0",
          collapsed ? "w-[70px]" : "w-[276px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Brand Header */}
        <div
          className={cn(
            "flex h-14 items-center border-b border-border transition-[padding] duration-200 ease-in-out",
            collapsed ? "justify-center px-2" : "justify-between px-3.5"
          )}
        >
          {collapsed ? (
            /* Collapsed Mode: Centered 36x36px Brand Mark with Expand Trigger */
            <button
              type="button"
              onClick={onToggleCollapse}
              className="group relative flex h-10 w-10 items-center justify-center rounded-lg hover:bg-sidebar-accent transition focus-visible:ring-2 focus-visible:ring-ring outline-none"
              title="Expand sidebar"
              aria-label="Expand sidebar"
            >
              <BrandMark className="group-hover:scale-95 transition-transform" />
              <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-sidebar-accent opacity-0 group-hover:opacity-100 transition-opacity">
                <PanelLeftOpen className="h-4 w-4 text-foreground" />
              </div>
            </button>
          ) : (
            /* Expanded Mode: Brand Identity + Single Desktop Collapse Control */
            <>
              <Link
                href="/dashboard"
                onClick={onCloseMobile}
                className="flex items-center gap-2.5 hover:opacity-85 transition min-w-0"
                title="SettleMate AI — Finance Control Plane"
              >
                <BrandMark />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold tracking-tight text-foreground truncate">
                    SettleMate AI
                  </div>
                  <div className="text-[10px] font-mono text-muted-foreground truncate leading-tight">
                    Finance Control Plane
                  </div>
                </div>
              </Link>

              <div className="flex items-center gap-1 shrink-0">
                {/* Single Canonical Desktop Collapse Toggle */}
                {onToggleCollapse && (
                  <button
                    type="button"
                    onClick={onToggleCollapse}
                    className="hidden lg:flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition focus-visible:ring-2 focus-visible:ring-ring outline-none"
                    title="Collapse sidebar"
                    aria-label="Collapse sidebar"
                  >
                    <PanelLeftClose className="h-4 w-4" />
                  </button>
                )}

                {/* Mobile Close Button */}
                {onCloseMobile && (
                  <button
                    type="button"
                    onClick={onCloseMobile}
                    className="p-1.5 text-muted-foreground hover:text-foreground lg:hidden rounded-md hover:bg-sidebar-accent"
                    aria-label="Close menu"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Navigation Body */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-3 space-y-4 font-sans">
          {collapsed ? (
            /* ───────────────────────────────────────────────────────────
               COLLAPSED MODE: Clean Monochrome Icons with Native Tooltips
               ─────────────────────────────────────────────────────────── */
            <div className="flex flex-col items-center space-y-1">
              {/* Top Workspace Items */}
              {WORKSPACE_ITEMS.slice(0, 4).map((item) => {
                const Icon = item.icon;
                const active = isRouteActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.label}
                    aria-label={item.label}
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold shadow-2xs"
                        : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
                    )}
                  >
                    <Icon className={cn("h-4 w-4", active ? "text-foreground" : "text-muted-foreground")} />
                  </Link>
                );
              })}

              <div className="h-px w-6 bg-border/60 my-1" />

              {/* Product Suite Icons */}
              {PRODUCT_FAMILIES.map((family) => {
                const Icon = family.icon;
                const isFamilyActive = family.items.some((it) => isRouteActive(it.href));
                const firstRoute = family.items[0].href;

                return (
                  <Link
                    key={family.id}
                    href={firstRoute}
                    title={`${family.label} (${family.items.length} tools)`}
                    aria-label={family.label}
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-lg transition-colors relative",
                      isFamilyActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold shadow-2xs"
                        : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
                    )}
                  >
                    <Icon className={cn("h-4 w-4", isFamilyActive ? "text-foreground" : "text-muted-foreground")} />
                    {isFamilyActive && (
                      <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-primary" />
                    )}
                  </Link>
                );
              })}
            </div>
          ) : activeFamily ? (
            /* ───────────────────────────────────────────────────────────
               CONTEXTUAL SECONDARY DRILL-DOWN VIEW
               ─────────────────────────────────────────────────────────── */
            <div className="space-y-3 animate-in fade-in-50 slide-in-from-left-2 duration-150">
              {/* Back to Top-Level Button */}
              <button
                type="button"
                onClick={() => setActiveFamilyId(null)}
                className="group flex w-full items-center gap-2 rounded-lg border border-border/80 bg-sidebar-accent/40 px-2.5 py-2 text-xs font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition"
              >
                <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition" />
                <span className="truncate">Back to All Suites</span>
              </button>

              {/* Suite Header Info */}
              <div className="px-2 pt-1 pb-1 border-b border-border/50">
                <div className="flex items-center gap-2">
                  {React.createElement(activeFamily.icon, {
                    className: "h-4 w-4 text-foreground shrink-0",
                  })}
                  <span className="text-xs font-semibold text-foreground tracking-tight truncate">
                    {activeFamily.label}
                  </span>
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                    {activeFamily.items.length} tools
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground/80 mt-0.5 truncate">
                  {activeFamily.description}
                </p>
              </div>

              {/* Suite Child Items */}
              <div className="space-y-0.5 pt-1">
                {activeFamily.items.map((item) => {
                  const Icon = item.icon;
                  const active = isRouteActive(item.href);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onCloseMobile}
                      className={cn(
                        "group flex h-9.5 items-center justify-between rounded-lg px-3 text-sm transition-colors",
                        active
                          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground shadow-2xs"
                          : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Icon
                          className={cn(
                            "h-4 w-4 shrink-0 transition-colors",
                            active ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                          )}
                        />
                        <span className="truncate text-sm font-medium">{item.label}</span>
                      </div>

                      {item.badge && (
                        <span
                          className={cn(
                            "font-mono text-[10px] px-1.5 py-0.5 rounded border leading-none font-semibold",
                            active
                              ? "bg-primary/20 text-primary border-primary/30"
                              : "bg-secondary text-muted-foreground border-border"
                          )}
                        >
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ) : (
            /* ───────────────────────────────────────────────────────────
               EXPANDED TOP-LEVEL NAVIGATION VIEW
               ─────────────────────────────────────────────────────────── */
            <div className="space-y-6">
              {/* Workspace Direct Links */}
              <div className="space-y-1.5">
                <div className="px-3 pb-1 text-xs font-semibold tracking-wider text-muted-foreground/75 uppercase">
                  Workspace
                </div>
                <div className="space-y-0.5">
                  {WORKSPACE_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const active = isRouteActive(item.href);

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onCloseMobile}
                        className={cn(
                          "group flex h-9.5 items-center justify-between rounded-lg px-3 text-sm transition-colors",
                          active
                            ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground shadow-2xs"
                            : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Icon
                            className={cn(
                              "h-4 w-4 shrink-0 transition-colors",
                              active ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                            )}
                          />
                          <span className="truncate text-sm font-medium">{item.label}</span>
                        </div>

                        {item.badge && (
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-border bg-secondary text-muted-foreground leading-none font-semibold">
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>

              {/* Product Suites with Real Child Navigation */}
              <div className="space-y-1.5">
                <div className="px-3 pb-1 text-xs font-semibold tracking-wider text-muted-foreground/75 uppercase">
                  Product Suites
                </div>
                <div className="space-y-1.5">
                  {PRODUCT_FAMILIES.map((family) => {
                    const Icon = family.icon;
                    const isFamilyActive = family.items.some((it) => isRouteActive(it.href));

                    return (
                      <button
                        key={family.id}
                        type="button"
                        onClick={() => setActiveFamilyId(family.id)}
                        className={cn(
                          "group flex w-full h-11 items-center justify-between rounded-lg px-3 text-sm text-left transition border cursor-pointer",
                          isFamilyActive
                            ? "border-border bg-sidebar-accent/90 text-foreground font-medium shadow-2xs"
                            : "border-transparent text-muted-foreground hover:border-border/60 hover:bg-sidebar-accent/60 hover:text-foreground"
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Icon
                            className={cn(
                              "h-4.5 w-4.5 shrink-0 transition-colors",
                              isFamilyActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                            )}
                          />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-foreground">
                              {family.label}
                            </div>
                            <div className="text-[11px] font-mono text-muted-foreground truncate">
                              {family.items.length} tools
                            </div>
                          </div>
                        </div>

                        <ChevronRight className="h-4 w-4 text-muted-foreground/60 group-hover:text-foreground transition shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Spotlight Direct Shortcuts */}
              <div className="space-y-1.5 pt-1 border-t border-border/60">
                <div className="px-3 pb-1 text-xs font-semibold tracking-wider text-muted-foreground/75 uppercase">
                  Featured Demos
                </div>
                <div className="space-y-0.5">
                  {SPOTLIGHT_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const active = isRouteActive(item.href);

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onCloseMobile}
                        className={cn(
                          "group flex h-9.5 items-center justify-between rounded-lg px-3 text-sm transition-colors",
                          active
                            ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground shadow-2xs"
                            : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Icon
                            className={cn(
                              "h-4 w-4 shrink-0 transition-colors",
                              active ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                            )}
                          />
                          <span className="truncate text-sm font-medium">{item.label}</span>
                        </div>

                        {item.badge && (
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-border bg-secondary text-muted-foreground leading-none font-semibold">
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </nav>

        {/* User Footer */}
        <div className="border-t border-border p-2.5 bg-sidebar/50 font-sans">
          {user ? (
            <div
              className={cn(
                "flex items-center rounded-lg border border-border bg-sidebar-primary/80 transition",
                collapsed ? "justify-center p-1.5" : "justify-between p-2"
              )}
            >
              {collapsed ? (
                /* Collapsed Footer: Centered Initial Avatar with Logout Trigger */
                <button
                  type="button"
                  onClick={() => setShowLogoutConfirm(true)}
                  title={`${user.name} (${user.role}) — Click to sign out`}
                  data-testid="logout-trigger-button"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-xs font-mono font-semibold text-foreground hover:border-destructive/40 hover:text-destructive transition cursor-pointer"
                >
                  {user.name?.slice(0, 1).toUpperCase() || "A"}
                </button>
              ) : (
                /* Expanded Footer: User Details + Logout Button */
                <>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-xs font-mono font-medium text-foreground">
                      {user.name?.slice(0, 1).toUpperCase() || "A"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-foreground leading-tight">
                        {user.name}
                      </p>
                      <p className="truncate text-[10px] font-mono text-muted-foreground">
                        {user.role}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowLogoutConfirm(true)}
                    disabled={loggingOut}
                    title="Sign out"
                    data-testid="logout-trigger-button"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-transparent text-muted-foreground hover:border-border hover:bg-secondary hover:text-foreground disabled:opacity-40 transition cursor-pointer"
                  >
                    {loggingOut ? (
                      <span className="h-3 w-3 animate-spin rounded-full border border-muted-foreground border-t-transparent" />
                    ) : (
                      <LogOut className="h-3.5 w-3.5" />
                    )}
                  </button>
                </>
              )}
            </div>
          ) : (
            <div
              className={cn(
                "flex items-center text-xs font-mono text-muted-foreground",
                collapsed ? "justify-center" : "justify-between px-1.5"
              )}
            >
              {!collapsed && <span>SettleMate / Control</span>}
              <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" title="System operational" />
            </div>
          )}
        </div>
      </aside>

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="logout-dialog-title"
          data-testid="logout-confirmation-modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in-0 duration-100 font-sans"
        >
          {/* Backdrop click handler */}
          <div
            className="fixed inset-0"
            onClick={() => setShowLogoutConfirm(false)}
          />

          {/* Dialog Card */}
          <div className="relative z-50 w-full max-w-sm rounded-xl border border-border bg-popover p-6 shadow-2xl space-y-5 text-popover-foreground">
            <div className="space-y-1.5">
              <h3
                id="logout-dialog-title"
                className="text-base font-semibold text-foreground tracking-tight"
              >
                Log out
              </h3>
              <p className="text-sm text-muted-foreground">
                Are you sure you want to log out?
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
              <button
                type="button"
                data-testid="logout-cancel-button"
                onClick={() => setShowLogoutConfirm(false)}
                disabled={loggingOut}
                className="h-9 rounded-lg border border-border bg-secondary px-4 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="logout-confirm-button"
                onClick={handleLogout}
                disabled={loggingOut}
                className="h-9 rounded-lg border border-destructive/30 bg-destructive/10 px-4 text-sm font-medium text-destructive hover:bg-destructive/20 transition flex items-center gap-2 cursor-pointer"
              >
                {loggingOut ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border border-destructive border-t-transparent" />
                    <span>Logging out...</span>
                  </>
                ) : (
                  <span>Log out</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}