"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Database,
  Upload,
  AlertTriangle,
  MessageSquare,
  ShieldCheck,
  ShieldAlert,
  Zap,
  Award,
  Target,
  FlaskConical,
  LogOut,
  PlugZap,
  Code2,
  BarChart3,
  Settings2,
  Building2,
  History,
  Scale,
  Activity,
  TrendingUp,
  Gauge,
  BookOpen,
  Globe,
  Swords,
  BellRing,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SessionUser {
  sub: string;
  name: string;
  role: string;
}

const navItems = [
  { href: "/judge-mode", label: "Judge Mode", meta: "⭐ 00", icon: Award },
  { href: "/benchmark-comparison", label: "Benchmark Comparison", meta: "📊 00J", icon: BarChart3 },
  { href: "/calibration", label: "Confidence Calibration", meta: "📈 00Q", icon: Gauge },
  { href: "/playbook", label: "Reconciliation Playbooks", meta: "📚 00R", icon: BookOpen },
  { href: "/multi-currency", label: "Multi-Currency Recon", meta: "🌍 00S", icon: Globe },
  { href: "/ai-comparison", label: "AI vs Deterministic", meta: "⚖️ 00N", icon: Scale },
  { href: "/live-monitor", label: "Live Monitor", meta: "📡 00O", icon: Activity },
  { href: "/business-impact", label: "Business Impact", meta: "💼 00P", icon: TrendingUp },
  { href: "/risk-dashboard", label: "Risk Dashboard", meta: "🚨 00T", icon: AlertTriangle },
  { href: "/red-team", label: "Red Team", meta: "⚔️ 00U", icon: Swords },
  { href: "/alerts", label: "Alerting Simulator", meta: "🔔 00V", icon: BellRing },
  { href: "/forensics", label: "Forensics Playback", meta: "🔍 00W", icon: History },
  { href: "/track04-compliance", label: "Track 04 Compliance", meta: "🎯 00F", icon: Target },
  { href: "/sandbox", label: "Interactive Sandbox", meta: "🧪 00B", icon: FlaskConical },
  { href: "/verify", label: "Verification Hub", meta: "🛡️ 00C", icon: ShieldCheck },
  { href: "/scenarios", label: "Scenario Lab", meta: "🧪 00D", icon: FlaskConical },
  { href: "/security-lab", label: "Security Lab", meta: "🛡️ 00E", icon: ShieldAlert },
  { href: "/integration-simulator", label: "Integration Simulator", meta: "🔌 00H", icon: PlugZap },
  { href: "/developer", label: "Developer API", meta: "💻 00I", icon: Code2 },
  { href: "/policy-playground", label: "Policy Playground", meta: "⚙️ 00K", icon: Settings2 },
  { href: "/multi-tenant", label: "Multi-Tenant Sim", meta: "🏢 00L", icon: Building2 },
  { href: "/audit-trail", label: "Audit Trail Explorer", meta: "📜 00M", icon: History },
  { href: "/", label: "Overview", meta: "01", icon: LayoutDashboard },
  { href: "/demo", label: "Demo Data", meta: "02", icon: Database },
  { href: "/upload", label: "Upload CSV", meta: "03", icon: Upload },
  { href: "/dashboard", label: "Dashboard", meta: "04", icon: Zap },
  { href: "/exceptions", label: "Exceptions", meta: "05", icon: AlertTriangle },
  { href: "/chat", label: "Finance Q&A", meta: "06", icon: MessageSquare },
  { href: "/security", label: "Self-Test", meta: "08", icon: ShieldCheck },
];

function BrandMark() {
  return (
    <div className="relative flex h-10 w-10 items-center justify-center border border-[#424738] bg-[#11140f]">
      <div className="absolute inset-[6px] border border-[#6f775b]" />
      <span className="relative text-[11px] font-semibold tracking-[-0.08em] text-[#eeeade]">
        SM
      </span>
    </div>
  );
}

interface SidebarProps {
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export function Sidebar({ mobileOpen = false, onCloseMobile }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const [user, setUser] = useState<SessionUser | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let mounted = true;

    fetch("/api/auth/me")
      .then((response) => (response.ok ? response.json() : null))
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

  const handleLogout = async () => {
    if (loggingOut) return;

    setLoggingOut(true);

    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm lg:hidden animate-in fade-in"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-screen w-[276px] shrink-0 flex-col border-r border-[#242820] bg-[#090b09] transition-transform duration-200 lg:static lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Brand */}
        <div className="flex items-center justify-between border-b border-[#242820] px-6 py-5">
          <Link href="/" onClick={onCloseMobile} className="flex items-center gap-3">
            <BrandMark />

            <div>
              <div className="text-[15px] font-semibold tracking-[-0.02em] text-[#f0eee5]">
                SettleMate AI
              </div>

              <div className="mt-0.5 text-[9px] font-medium uppercase tracking-[0.28em] text-[#82877b]">
                Finance Control Plane
              </div>
            </div>
          </Link>

          {onCloseMobile && (
            <button
              type="button"
              onClick={onCloseMobile}
              className="p-1 text-[#82877b] hover:text-[#f0eee5] lg:hidden"
              aria-label="Close menu"
            >
              <LogOut className="h-4 w-4 rotate-180" />
            </button>
          )}
        </div>

      {/* Workspace */}
      <div className="px-6 pb-3 pt-6">
        <div className="text-[8px] font-semibold uppercase tracking-[0.24em] text-[#62695d]">
          Workspace
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 overflow-y-auto">
        <div className="space-y-1">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href));

            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group relative flex h-11 items-center gap-3 border px-3.5 transition-all",
                  isActive
                    ? "border-[#505a42] bg-[#151a12] text-[#f0eee6]"
                    : "border-transparent text-[#8b9187] hover:border-[#30362e] hover:bg-[#10130f] hover:text-[#d0d0c8]",
                )}
              >
                {isActive && (
                  <span className="absolute bottom-0 left-0 top-0 w-[2px] bg-[#aab98b]" />
                )}

                <Icon
                  className={cn(
                    "h-[15px] w-[15px] shrink-0",
                    isActive
                      ? "text-[#b2c094]"
                      : "text-[#747c70] group-hover:text-[#a5ab9e]",
                  )}
                  strokeWidth={1.8}
                />

                <span
                  className={cn(
                    "flex-1 text-[12px]",
                    isActive ? "font-medium" : "font-normal",
                  )}
                >
                  {item.label}
                </span>

                <span
                  className={cn(
                    "font-mono text-[8px]",
                    isActive ? "text-[#778264]" : "text-[#555b52]",
                  )}
                >
                  {item.meta}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* User */}
      <div className="border-t border-[#242820]">
        {user && (
          <div className="px-5 py-5">
            <div className="mb-4 text-[8px] font-semibold uppercase tracking-[0.23em] text-[#62695d]">
              Signed in
            </div>

            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center border border-[#3a4035] bg-[#11140f]">
                <span className="text-[11px] font-semibold text-[#d0d0c7]">
                  {user.name?.slice(0, 1).toUpperCase() || "U"}
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-semibold text-[#dddcd4]">
                  {user.name}
                </p>

                <p className="mt-1 text-[8px] font-medium uppercase tracking-[0.16em] text-[#a4b17f]">
                  {user.role}
                </p>
              </div>

              <button
                onClick={handleLogout}
                disabled={loggingOut}
                title="Sign out"
                className="flex h-8 w-8 items-center justify-center border border-[#30362e] text-[#777e71] transition hover:border-[#60433d] hover:bg-[#17100e] hover:text-[#cb8b7d] disabled:opacity-40"
              >
                {loggingOut ? (
                  <span className="h-3 w-3 animate-spin rounded-full border border-[#8b9286] border-t-transparent" />
                ) : (
                  <LogOut className="h-3.5 w-3.5" strokeWidth={1.8} />
                )}
              </button>
            </div>
          </div>
        )}

        <div className="border-t border-[#1d211c] px-5 py-4">
          <div className="flex items-center justify-between">
            <span className="text-[8px] font-medium uppercase tracking-[0.18em] text-[#565d51]">
              SettleMate / Control
            </span>

            <span className="h-1.5 w-1.5 rounded-full bg-[#a5b47f]" />
          </div>

          <div className="mt-2 text-[8px] uppercase tracking-[0.14em] text-[#444a41]">
            Deterministic · Grounded · Auditable
          </div>
        </div>
      </div>
    </aside>
    </>
  );
}