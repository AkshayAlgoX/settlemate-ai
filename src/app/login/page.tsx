"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Fingerprint,
  LockKeyhole,
  UserRound,
} from "lucide-react";

type DemoRole = "admin" | "reviewer";

const DEMO_USERS = {
  admin: {
    username: "admin",
    password: "admin123",
    title: "Administrator",
    description: "Investigation + approval authority",
  },
  reviewer: {
    username: "reviewer",
    password: "review123",
    title: "Reviewer",
    description: "Investigation + escalation authority",
  },
} as const;

function SettleMateMark({ small = false }: { small?: boolean }) {
  return (
    <div
      className={`relative flex items-center justify-center border border-[#b7a97a]/30 bg-[#b7a97a]/[0.06] ${
        small ? "h-9 w-9" : "h-10 w-10"
      }`}
    >
      <div className="relative h-[18px] w-[18px]">
        <span className="absolute left-[2px] top-0 h-[18px] w-[4px] bg-[#c8bd98]" />
        <span className="absolute left-[7px] top-0 h-[8px] w-[9px] border-t-[4px] border-r-[4px] border-[#c8bd98]" />
        <span className="absolute bottom-0 right-[2px] h-[18px] w-[4px] bg-[#c8bd98]" />
        <span className="absolute bottom-0 right-[7px] h-[8px] w-[9px] border-b-[4px] border-l-[4px] border-[#c8bd98]" />
      </div>
    </div>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [selectedRole, setSelectedRole] = useState<DemoRole>("admin");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((response) => {
        if (response.ok) {
          router.replace("/");
        }
      })
      .catch(() => {});
  }, [router]);

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
        setError(data.error || "Unable to authenticate.");
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

    await signIn({
      username,
      password,
    });
  };

  const handleDemoAccess = async (role: DemoRole) => {
    const demo = DEMO_USERS[role];

    setSelectedRole(role);
    setUsername(demo.username);
    setPassword(demo.password);

    await signIn({
      username: demo.username,
      password: demo.password,
    });
  };

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-[#090a09] text-[#f1efe7]">
      {/* Restrained grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "52px 52px",
        }}
      />

      {/* Very subtle ambient depth */}
      <div className="pointer-events-none absolute left-[18%] top-[28%] h-[300px] w-[300px] rounded-full bg-[#496044]/[0.07] blur-[120px]" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-[1440px] flex-col px-6 py-5 sm:px-9 lg:px-12">
        {/* HEADER */}
        <header className="flex items-center justify-between border-b border-white/[0.075] pb-5">
          <div className="flex items-center gap-3">
            <SettleMateMark small />

            <div>
              <div className="text-[14px] font-semibold tracking-[-0.01em]">
                SettleMate AI
              </div>

              <div className="mt-0.5 text-[9px] font-medium uppercase tracking-[0.24em] text-white/35">
                Finance Control Plane
              </div>
            </div>
          </div>

          <div className="hidden items-center gap-2 sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-[#9caf83]" />

            <span className="text-[9px] font-medium uppercase tracking-[0.22em] text-white/35">
              Secure demo environment
            </span>
          </div>
        </header>

        {/* MAIN */}
        <main className="grid flex-1 items-center gap-12 py-10 lg:grid-cols-[minmax(0,1fr)_440px] lg:gap-20 xl:gap-28">
          {/* LEFT */}
          <section className="max-w-[650px]">
            <div className="mb-6 inline-flex items-center gap-2 border border-white/[0.09] bg-white/[0.018] px-3 py-2">
              <Fingerprint className="h-3.5 w-3.5 text-[#a9a47b]" />

              <span className="text-[9px] font-medium uppercase tracking-[0.19em] text-white/45">
                Financial reconciliation control plane
              </span>
            </div>

            <h1 className="max-w-[620px] text-[clamp(2.9rem,5vw,4.65rem)] font-semibold leading-[0.98] tracking-[-0.055em]">
              Financial reconciliation
              <span className="mt-1.5 block text-white/38">
                you can trust.
              </span>
            </h1>

            <p className="mt-7 max-w-[580px] text-[15px] leading-7 text-white/48">
              Deterministic payment matching, controlled AI investigation,
              human approval, and complete audit provenance — in one
              financial control plane.
            </p>

            {/* PRINCIPLES */}
            <div className="mt-8 grid max-w-[570px] grid-cols-1 gap-x-8 gap-y-3.5 sm:grid-cols-2">
              {[
                "Deterministic financial matching",
                "Grounded AI explanations",
                "Human approval for decisions",
                "Complete audit provenance",
              ].map((item) => (
                <div key={item} className="flex items-center gap-2.5">
                  <div className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-[#879c70]/30 bg-[#879c70]/[0.06]">
                    <Check className="h-2.5 w-2.5 text-[#9caf83]" />
                  </div>

                  <span className="text-[12px] text-white/58">{item}</span>
                </div>
              ))}
            </div>

            {/* CONTROL STRIP */}
            <div className="mt-10 max-w-[620px] border-y border-white/[0.075]">
              <div className="grid grid-cols-4">
                {[
                  ["01", "Deterministic"],
                  ["02", "Grounded AI"],
                  ["03", "Human control"],
                  ["04", "Auditable"],
                ].map(([number, label], index) => (
                  <div
                    key={number}
                    className={`py-4 ${
                      index > 0
                        ? "border-l border-white/[0.075] pl-4"
                        : ""
                    }`}
                  >
                    <div className="text-[8px] tracking-[0.18em] text-white/20">
                      {number}
                    </div>

                    <div className="mt-1.5 text-[9px] font-medium uppercase tracking-[0.11em] text-white/38">
                      {label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* LOGIN */}
          <section className="w-full max-w-[440px]">
            <div className="border border-white/[0.10] bg-[#10130f]/95 shadow-[0_25px_80px_rgba(0,0,0,0.42)]">
              {/* LOGIN HEADER */}
              <div className="border-b border-white/[0.075] px-6 py-6 sm:px-7">
                <div className="flex items-center justify-between">
                  <SettleMateMark />

                  <span className="border border-white/[0.09] px-2.5 py-1 text-[8px] font-medium uppercase tracking-[0.18em] text-white/30">
                    Secure access
                  </span>
                </div>

                <h2 className="mt-6 text-[21px] font-semibold tracking-[-0.025em]">
                  Access control plane
                </h2>

                <p className="mt-2 max-w-[350px] text-[12px] leading-5 text-white/38">
                  Authenticate to investigate reconciliation exceptions and
                  perform authorized financial actions.
                </p>
              </div>

              <div className="px-6 py-6 sm:px-7">
                <form onSubmit={handleSubmit} className="space-y-4.5">
                  {/* USERNAME */}
                  <div>
                    <label className="mb-2 block text-[10px] font-medium uppercase tracking-[0.16em] text-white/45">
                      Username
                    </label>

                    <div className="relative">
                      <UserRound className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/20" />

                      <input
                        value={username}
                        onChange={(event) => setUsername(event.target.value)}
                        autoComplete="username"
                        placeholder="Enter username"
                        className="h-12 w-full border border-white/[0.11] bg-[#0b0d0b] pl-10 pr-4 text-[13px] text-white outline-none transition placeholder:text-white/22 focus:border-[#a3ab7a]/55 focus:ring-1 focus:ring-[#a3ab7a]/10"
                      />
                    </div>
                  </div>

                  {/* PASSWORD */}
                  <div>
                    <label className="mb-2 block text-[10px] font-medium uppercase tracking-[0.16em] text-white/45">
                      Password
                    </label>

                    <div className="relative">
                      <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/20" />

                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        autoComplete="current-password"
                        placeholder="Enter password"
                        className="h-12 w-full border border-white/[0.11] bg-[#0b0d0b] pl-10 pr-10 text-[13px] text-white outline-none transition placeholder:text-white/22 focus:border-[#a3ab7a]/55 focus:ring-1 focus:ring-[#a3ab7a]/10"
                      />

                      <button
                        type="button"
                        onClick={() => setShowPassword((value) => !value)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/20 transition hover:text-white/55"
                        aria-label={
                          showPassword ? "Hide password" : "Show password"
                        }
                      >
                        {showPassword ? (
                          <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <div className="border border-red-400/20 bg-red-400/[0.05] px-3.5 py-2.5 text-[11px] leading-5 text-red-300">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="group flex h-11 w-full items-center justify-center gap-2 bg-[#d7d2bf] text-[12px] font-semibold text-[#11120f] transition hover:bg-[#e5dfcb] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loading ? "Authenticating..." : "Sign in"}

                    {!loading && (
                      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    )}
                  </button>
                </form>

                {/* DEMO ACCESS */}
                <div className="my-6 flex items-center gap-3">
                  <div className="h-px flex-1 bg-white/[0.07]" />

                  <span className="text-[8px] uppercase tracking-[0.19em] text-white/22">
                    Demo access
                  </span>

                  <div className="h-px flex-1 bg-white/[0.07]" />
                </div>

                <div className="space-y-2">
                  {(
                    Object.entries(DEMO_USERS) as [
                      DemoRole,
                      (typeof DEMO_USERS)[DemoRole],
                    ][]
                  ).map(([role, demo]) => {
                    const active = selectedRole === role;

                    return (
                      <button
                        key={role}
                        type="button"
                        disabled={loading}
                        onClick={() => handleDemoAccess(role)}
                        className={`group flex w-full items-center justify-between border px-4 py-4 text-left transition ${
                          active
                            ? "border-[#8d9d70]/35 bg-[#8d9d70]/[0.055]"
                            : "border-white/[0.075] bg-white/[0.012] hover:border-white/[0.14] hover:bg-white/[0.025]"
                        } disabled:opacity-50`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-8 w-8 items-center justify-center border ${
                              active
                                ? "border-[#8d9d70]/25 bg-[#8d9d70]/[0.06]"
                                : "border-white/[0.07] bg-black/20"
                            }`}
                          >
                            <UserRound
                              className={`h-3.5 w-3.5 ${
                                active
                                  ? "text-[#a7b789]"
                                  : "text-white/25"
                              }`}
                            />
                          </div>

                          <div>
                            <div className="text-[13px] font-medium text-[#d8d6ce]">
                              {demo.title}
                            </div>

                            <div className="mt-0.5 text-[9px] text-white/42">
                              {demo.description}
                            </div>
                          </div>
                        </div>

                        {active ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-[#a7b789]" />
                        ) : (
                          <ArrowRight className="h-3.5 w-3.5 text-white/15 transition-transform group-hover:translate-x-0.5 group-hover:text-white/40" />
                        )}
                      </button>
                    );
                  })}
                </div>

                <p className="mt-4 text-center text-[9px] leading-4 text-white/22">
                  Demo access is configured server-side.
                </p>
              </div>
            </div>
          </section>
        </main>

        <div className="h-4" />
      </div>
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