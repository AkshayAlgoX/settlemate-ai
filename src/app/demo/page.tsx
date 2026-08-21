"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Database, Play, CheckCircle, Loader2, XCircle, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const SIZES = [50, 100, 250, 500];

const DISTRIBUTION = [
  { label: "Perfect Match", pct: 35, color: "bg-green-500" },
  { label: "Pending Settlement", pct: 10, color: "bg-yellow-500" },
  { label: "Missing Bank Credit", pct: 8, color: "bg-red-500" },
  { label: "Amount Mismatch", pct: 8, color: "bg-orange-500" },
  { label: "Duplicate Settlement", pct: 5, color: "bg-red-600" },
  { label: "Orphan Bank Credit", pct: 5, color: "bg-purple-500" },
  { label: "Refund Mismatch", pct: 7, color: "bg-amber-500" },
  { label: "Chargeback Adj.", pct: 5, color: "bg-rose-500" },
  { label: "Delayed Credit", pct: 7, color: "bg-blue-500" },
  { label: "Manual Review", pct: 10, color: "bg-gray-500" },
];

type StepStatus = "pending" | "running" | "done" | "error" | "skipped";

interface ProgressStep {
  label: string;
  status: StepStatus;
  detail: string;
}

interface MultiPassPass {
  passNumber: number;
  name: string;
  accuracy: number;
  aiCallsMade: number;
  durationMs: number;
}

interface MultiPassResponse {
  success: boolean;
  passes: MultiPassPass[];
  adversarial: {
    detected: number;
    totalTests: number;
    detectionRate: number;
  };
  aiStatus: {
    totalCalls: number;
    maxCalls: number;
    circuitTripped: boolean;
  };
  totalDurationMs: number;
  error?: string;
}

export default function DemoPage() {
  const [size, setSize] = useState(250);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    batchId: string;
    stats: Record<string, number>;
  } | null>(null);
  const [steps, setSteps] = useState<ProgressStep[]>([]);
  const router = useRouter();

  const handleGenerate = async () => {
    setLoading(true);
    setResult(null);
    setSteps([]);
    try {
      const res = await fetch("/api/batches/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ size }),
      });
      const data = await res.json();
      setResult(data);
    } catch (error) {
      console.error("Generation failed:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleReconcile = async () => {
    if (!result?.batchId) return;
    setLoading(true);

    setSteps([
      { label: "Pass 1: Deterministic Rules", status: "running", detail: "UTR + ID + fuzzy matching..." },
      { label: "Pass 2: Anomaly Agent", status: "pending", detail: "" },
      { label: "Pass 3: Resolver Agent", status: "pending", detail: "" },
      { label: "Adversarial Self-Test", status: "pending", detail: "" },
      { label: "Calibration & Metrics", status: "pending", detail: "" },
    ]);

    try {
      const res = await fetch(`/api/reconcile/${result.batchId}/multi-pass`, {
        method: "POST",
      });
      const data: MultiPassResponse = await res.json();

      if (data.success) {
        // Update steps with actual results
        const newSteps: ProgressStep[] = data.passes.map((p) => ({
          label: `Pass ${p.passNumber}: ${p.name}`,
          status: "done" as StepStatus,
          detail: `${p.accuracy}% accuracy · ${p.aiCallsMade} AI calls · ${p.durationMs}ms`,
        }));

        newSteps.push({
          label: "Adversarial Self-Test",
          status: "done",
          detail: `${data.adversarial.detected}/${data.adversarial.totalTests} detected (${data.adversarial.detectionRate}%)`,
        });

        newSteps.push({
          label: "Calibration & Metrics",
          status: "done",
          detail: `Total: ${data.totalDurationMs}ms · AI: ${data.aiStatus.totalCalls}/${data.aiStatus.maxCalls} calls${data.aiStatus.circuitTripped ? " ⚠️ circuit tripped" : ""}`,
        });

        setSteps(newSteps);

        // Auto-redirect after 2 seconds
        setTimeout(() => {
          router.push(`/dashboard?batchId=${result.batchId}`);
        }, 2000);
      } else {
        setSteps((prev) =>
          prev.map((s) => (s.status === "running" ? { ...s, status: "error", detail: data.error ?? "Reconciliation failed" } : s))
        );
      }
    } catch (error) {
      setSteps((prev) =>
        prev.map((s) =>
          s.status === "running" || s.status === "pending"
            ? { ...s, status: "error", detail: String(error) }
            : s
        )
      );
    } finally {
      setLoading(false);
    }
  };

  const stepIcon = (status: StepStatus) => {
    switch (status) {
      case "done": return <CheckCircle className="w-4 h-4 text-green-400" />;
      case "running": return <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />;
      case "error": return <XCircle className="w-4 h-4 text-red-400" />;
      case "skipped": return <XCircle className="w-4 h-4 text-yellow-400" />;
      default: return <div className="w-4 h-4 rounded-full border border-gray-600" />;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Database className="w-6 h-6 text-blue-400" />
          Generate Demo Data
        </h1>
        <p className="text-gray-400 mt-1">
          Create synthetic Razorpay-like financial data with 10 exception scenarios
        </p>
      </div>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white">Batch Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <label className="text-sm text-gray-400 mb-2 block">Batch Size</label>
            <div className="flex gap-2">
              {SIZES.map((s) => (
                <Button
                  key={s}
                  variant={size === s ? "default" : "outline"}
                  onClick={() => setSize(s)}
                  className={size === s ? "bg-blue-600 hover:bg-blue-700" : "border-gray-700 text-gray-300"}
                >
                  {s} records
                </Button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm text-gray-400 mb-2 block">Scenario Distribution</label>
            <div className="space-y-2">
              {DISTRIBUTION.map((d) => (
                <div key={d.label} className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-40">{d.label}</span>
                  <div className="flex-1 h-4 bg-gray-800 rounded-full overflow-hidden">
                    <div className={`h-full ${d.color} rounded-full`} style={{ width: `${d.pct}%` }} />
                  </div>
                  <span className="text-xs text-gray-500 w-16 text-right">
                    {d.pct}% ({Math.round(size * d.pct / 100)})
                  </span>
                </div>
              ))}
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={loading}
            size="lg"
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...</>
            ) : (
              <><Play className="w-4 h-4 mr-2" /> Generate {size} Records</>
            )}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card className="bg-gray-900 border-green-800/50">
          <CardHeader>
            <CardTitle className="text-green-400 flex items-center gap-2">
              <CheckCircle className="w-5 h-5" />
              Batch Generated: {result.batchId.slice(0, 12)}...
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(result.stats).map(([key, value]) => (
                <div key={key} className="bg-gray-800 rounded-lg p-3">
                  <p className="text-lg font-bold text-white">{value}</p>
                  <p className="text-xs text-gray-500 capitalize">{key.replace(/([A-Z])/g, " $1")}</p>
                </div>
              ))}
            </div>

            <Button
              onClick={handleReconcile}
              disabled={loading}
              size="lg"
              className="w-full bg-green-600 hover:bg-green-700"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Running Pipeline...</>
              ) : (
                <><Play className="w-4 h-4 mr-2" /> Run 3-Pass Reconciliation</>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Progress Steps */}
      {steps.length > 0 && (
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Brain className="w-5 h-5 text-purple-400" />
              Pipeline Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {steps.map((step, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="mt-0.5">{stepIcon(step.status)}</div>
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${
                      step.status === "done" ? "text-green-300" :
                      step.status === "running" ? "text-blue-300" :
                      step.status === "error" ? "text-red-300" :
                      "text-gray-500"
                    }`}>
                      {step.label}
                    </p>
                    {step.detail && (
                      <p className="text-xs text-gray-500 mt-0.5">{step.detail}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {steps.every((s) => s.status === "done") && (
              <div className="mt-4 p-3 bg-green-900/30 border border-green-800/50 rounded-lg">
                <p className="text-sm text-green-300 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  Pipeline complete. Redirecting to dashboard...
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}