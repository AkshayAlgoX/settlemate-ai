"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Shield, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // If already authenticated, skip the login wall.
    fetch("/api/auth/me")
      .then((r) => (r.ok ? router.replace("/") : null))
      .catch(() => {});
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed");
        return;
      }
      router.push(next);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-gray-900 border-gray-800">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center mb-2">
            <Shield className="w-7 h-7 text-white" />
          </div>
          <CardTitle className="text-white text-xl">SettleMate AI — Sign In</CardTitle>
          <p className="text-xs text-gray-400 mt-1">
            Financial reconciliation requires an authenticated user. The actor recorded
            for every action is derived from this session, server-side.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Username</label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                autoComplete="username"
                className="bg-gray-800 border-gray-700 text-gray-200"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Password</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="bg-gray-800 border-gray-700 text-gray-200"
              />
            </div>

            {error && (
              <p className="text-xs text-red-400 bg-red-900/30 border border-red-800/50 rounded p-2">
                {error}
              </p>
            )}

            <Button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700">
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Signing in...</> : "Sign In"}
            </Button>
          </form>

          <div className="mt-4 p-3 bg-gray-800/60 rounded-lg text-xs text-gray-400 space-y-1">
            <p className="font-semibold text-gray-300">Demo credentials</p>
            <p><span className="text-blue-400 font-mono">admin</span> / <span className="font-mono">admin123</span> — full access</p>
            <p><span className="text-purple-400 font-mono">reviewer</span> / <span className="font-mono">review123</span> — reviewer</p>
            <p className="text-gray-500 mt-1">Demo-only. Configure via DEMO_ADMIN_* / DEMO_REVIEWER_* env vars.</p>
          </div>
        </CardContent>
      </Card>
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
