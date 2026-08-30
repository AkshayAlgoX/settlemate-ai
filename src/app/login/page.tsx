"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  UserRound,
} from "lucide-react";
import { apiErrorMessage } from "@/lib/api/error-message";
import { BrandMark } from "@/components/layout/sidebar";

type DemoRole = "admin" | "reviewer";

const DEMO_USERS = {
  admin: {
    username: "admin",
    password: "admin123",
    title: "Administrator",
    description: "Full investigation, approval authority & policy promotion",
  },
  reviewer: {
    username: "reviewer",
    password: "review123",
    title: "Reviewer",
    description: "Exception investigation, variance review & escalation",
  },
} as const;

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/dashboard";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [selectedRole, setSelectedRole] = useState<DemoRole | null>("admin");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((response) => {
        if (response.ok) {
          router.replace("/dashboard");
        }
      })
      .catch(() => {});
  }, [router]);

  // Handle Escape key to close confirmation modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && showConfirmModal && !loading) {
        setShowConfirmModal(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showConfirmModal, loading]);

  const signIn = async (credentials: {
    username: string;
    password: string;
  }) => {
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(credentials),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(apiErrorMessage(data, "Unable to authenticate."));
        return;
      }

      router.push(next);
      router.refresh();
    } catch {
      setError("Unable to reach the authentication service.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await signIn({ username, password });
  };

  const handleRoleSelect = (role: DemoRole) => {
    setSelectedRole(role);
    const demo = DEMO_USERS[role];
    setUsername(demo.username);
    setPassword(demo.password);
  };

  const handleConfirmDemoSignIn = async () => {
    if (!selectedRole) return;
    const demo = DEMO_USERS[selectedRole];
    setShowConfirmModal(false);
    await signIn({ username: demo.username, password: demo.password });
  };

  return (
    <div className="min-h-screen w-full bg-background text-foreground font-sans antialiased flex flex-col justify-between items-center relative overflow-hidden">
      {/* Subtle ambient radial background */}
      <div className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center">
        <div className="h-[480px] w-[480px] sm:h-[600px] sm:w-[600px] rounded-full bg-primary/[0.03] dark:bg-primary/[0.05] blur-3xl" />
      </div>

      {/* Minimal Header — Spans matching wide canvas */}
      <header
        className="w-full max-w-[1680px] mx-auto py-5 sm:py-6 flex items-center justify-between border-b border-border/40"
        style={{ paddingInline: "clamp(24px, 4.5vw, 80px)" }}
      >
        <Link href="/" className="flex items-center gap-2.5 group hover:opacity-90 transition cursor-pointer">
          <BrandMark className="h-8 w-8 text-[11px]" />
          <div>
            <div className="text-sm font-semibold tracking-tight text-foreground">
              SettleMate AI
            </div>
            <div className="text-[10px] font-mono text-muted-foreground">
              Finance Control Plane
            </div>
          </div>
        </Link>

        <div className="flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-2.5 py-1 text-[11px] font-mono text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
          <span>Demo Environment</span>
        </div>
      </header>

      {/* Focused Authentication Main */}
      <main className="flex-1 flex items-center justify-center w-full px-4 py-8 sm:py-12">
        <div className="w-full max-w-[440px] sm:max-w-[460px] rounded-xl border border-border bg-card p-6 sm:p-8 space-y-6 shadow-xs transition">
          <div className="space-y-1.5">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
              Sign in
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Access the finance control plane with role credentials or quick demo logins.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground block">
                Username
              </label>
              <div className="relative">
                <UserRound className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin or reviewer"
                  required
                  className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring transition"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground block">
                Password
              </label>
              <div className="relative">
                <LockKeyhole className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  required
                  className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-10 text-xs text-foreground placeholder:text-muted-foreground focus:border-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground transition cursor-pointer"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-10 rounded-lg bg-primary text-primary-foreground font-medium text-xs hover:opacity-90 disabled:opacity-50 transition flex items-center justify-center gap-2 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring outline-none"
            >
              <span>{loading ? "Signing in..." : "Sign in"}</span>
              {!loading && <ArrowRight className="h-3.5 w-3.5" />}
            </button>
          </form>

          {/* Demo Roles Selection & Confirmation */}
          <div className="space-y-3 pt-3.5 border-t border-border">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
              Quick demo access
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {(Object.entries(DEMO_USERS) as [DemoRole, (typeof DEMO_USERS)[DemoRole]][]).map(([role, demo]) => {
                const active = selectedRole === role;

                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => handleRoleSelect(role)}
                    className={`rounded-lg border p-3 text-left transition flex flex-col justify-between gap-1 text-xs cursor-pointer focus-visible:ring-2 focus-visible:ring-ring outline-none ${
                      active
                        ? "border-foreground/40 bg-secondary text-foreground shadow-2xs"
                        : "border-border bg-background hover:bg-secondary/40 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="font-semibold text-foreground">{demo.title}</span>
                      {active ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-foreground" />
                      ) : (
                        <span className="h-3.5 w-3.5 rounded-full border border-border" />
                      )}
                    </div>
                    <span className="text-[11px] text-muted-foreground line-clamp-2">
                      {demo.description}
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              disabled={!selectedRole || loading}
              onClick={() => setShowConfirmModal(true)}
              className="w-full h-9 rounded-lg border border-border bg-secondary hover:bg-secondary/80 text-foreground font-medium text-xs disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center gap-1.5 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring outline-none mt-1.5"
            >
              <span>{loading ? "Signing in..." : `Continue as ${selectedRole ? DEMO_USERS[selectedRole].title : "..."}`}</span>
              {!loading && <ArrowRight className="h-3 w-3" />}
            </button>
          </div>
        </div>
      </main>

      {/* Minimal Footer — Spans matching wide canvas */}
      <footer
        className="w-full max-w-[1680px] mx-auto py-4 sm:py-5 border-t border-border/40 text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground"
        style={{ paddingInline: "clamp(24px, 4.5vw, 80px)" }}
      >
        <span>SettleMate AI &copy; 2026 · Autonomous Financial Control Plane</span>
        <span>Deterministic Reconciliation Engine</span>
      </footer>

      {/* Quick Demo Confirmation Dialog */}
      {showConfirmModal && selectedRole && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="demo-confirm-dialog-title"
          aria-describedby="demo-confirm-dialog-desc"
          data-testid="demo-confirmation-modal"
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in-0 duration-100 font-sans"
        >
          {/* Backdrop click handler */}
          <div
            className="fixed inset-0"
            onClick={() => !loading && setShowConfirmModal(false)}
          />

          {/* Dialog Card */}
          <div className="relative z-50 w-full max-w-sm rounded-xl border border-border bg-popover p-6 shadow-2xl space-y-4 text-popover-foreground">
            <div className="space-y-1.5">
              <h3
                id="demo-confirm-dialog-title"
                className="text-base font-semibold text-foreground tracking-tight"
              >
                Continue as {DEMO_USERS[selectedRole].title}?
              </h3>
              <p
                id="demo-confirm-dialog-desc"
                className="text-xs text-muted-foreground leading-relaxed"
              >
                You&apos;re entering the SettleMate demo environment with {DEMO_USERS[selectedRole].title} permissions.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
              <button
                type="button"
                data-testid="demo-cancel-button"
                onClick={() => setShowConfirmModal(false)}
                disabled={loading}
                className="h-9 rounded-lg border border-border bg-secondary px-3.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 focus-visible:ring-2 focus-visible:ring-ring outline-none transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="demo-continue-button"
                onClick={handleConfirmDemoSignIn}
                disabled={loading}
                className="h-9 rounded-lg bg-primary px-4 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring outline-none transition flex items-center gap-1.5 cursor-pointer"
              >
                <span>{loading ? "Authenticating..." : "Continue"}</span>
                {!loading && <ArrowRight className="h-3 w-3" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}