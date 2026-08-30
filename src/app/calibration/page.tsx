"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  RefreshCw,
  Sliders,
  ExternalLink,
} from "lucide-react";
import {
  BENCHMARK_CALIBRATION_DATA,
  type LiveCalibrationResult,
} from "@/lib/calibration/calibration-types";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ScatterChart,
  Scatter,
  ZAxis,
  Cell,
  ReferenceLine,
} from "recharts";
import { Dropdown } from "@/components/ui/dropdown";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";

const SAMPLE_SIZE_OPTIONS = [
  { value: "25", label: "25 records" },
  { value: "50", label: "50 records (Standard)" },
  { value: "100", label: "100 records (Deep)" },
  { value: "250", label: "250 records (Full Benchmark)" },
];

export default function CalibrationPage() {
  const [mounted, setMounted] = useState(false);
  const [seed, setSeed] = useState<number>(20260825);
  const [sampleSize, setSampleSize] = useState<number>(50);
  const [isRunningLive, setIsRunningLive] = useState(false);
  const [liveResult, setLiveResult] = useState<LiveCalibrationResult | null>(null);
  const [activeTab, setActiveTab] = useState<"benchmark" | "live">("benchmark");
  const [selectedPoint, setSelectedPoint] = useState<LiveCalibrationResult["points"][0] | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/calibration/live?seed=20260825&sampleSize=50")
      .then((res) => res.json())
      .then((data) => {
        if (active && data?.liveTest) {
          setLiveResult(data.liveTest);
          setMounted(true);
        }
      })
      .catch(() => {
        if (active) setMounted(true);
      });

    return () => {
      active = false;
    };
  }, []);

  const handleRunLiveTest = async () => {
    setIsRunningLive(true);
    try {
      const res = await fetch(`/api/calibration/live?seed=${seed}&sampleSize=${sampleSize}`);
      const data = await res.json();
      if (data?.liveTest) {
        setLiveResult(data.liveTest);
        setActiveTab("live");
      }
    } finally {
      setIsRunningLive(false);
    }
  };

  // Prepare chart data for benchmark
  const benchmarkChartData = BENCHMARK_CALIBRATION_DATA.map((b) => ({
    bucket: `${b.range}%`,
    range: b.range,
    actualAccuracy: b.accuracy,
    expectedConfidence: b.expectedConfidence,
    sampleCount: b.total,
    correct: b.correct,
  }));

  // Prepare chart data for live test
  const liveChartData = liveResult
    ? liveResult.buckets.map((b) => ({
        bucket: `${b.range}%`,
        range: b.range,
        actualAccuracy: b.accuracy,
        expectedConfidence: b.expectedConfidence,
        sampleCount: b.total,
        correct: b.correct,
      }))
    : [];

  const displayedChartData = activeTab === "benchmark" ? benchmarkChartData : liveChartData;

  return (
    <div className="space-y-10 pb-12">
      {/* Header */}
      <PageHeader
        tag="Explainability & Reliability"
        title="Confidence calibration"
        description="Empirical evaluation of predicted AI uncertainty versus ground-truth accuracy. SettleMate ensures confidence scores reflect true correctness."
        badge={<Badge variant="outline">Calibration</Badge>}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={handleRunLiveTest}
              disabled={isRunningLive}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3.5 text-xs font-medium text-primary-foreground hover:bg-[#ffffff] disabled:opacity-50 transition"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRunningLive ? "animate-spin" : ""}`} />
              <span>{isRunningLive ? "Running live test..." : "Run live calibration test"}</span>
            </button>

            <Link
              href="/playbook"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-accent transition"
            >
              <span>Playbooks</span>
              <ExternalLink className="h-3 w-3 text-muted-foreground" />
            </Link>
          </div>
        }
      />

      {/* 4 Summary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-lg border border-border bg-card p-5 space-y-1">
          <div className="text-2xl sm:text-3xl font-semibold font-mono text-foreground">
            98.1%
          </div>
          <div className="text-xs font-medium text-foreground">
            Overall benchmark accuracy
          </div>
          <div className="text-[11px] text-muted-foreground/70">
            245 / 250 records verified correct
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5 space-y-1">
          <div className="text-2xl sm:text-3xl font-semibold font-mono text-foreground">
            100.0%
          </div>
          <div className="text-xs font-medium text-foreground">
            High confidence accuracy (81-100%)
          </div>
          <div className="text-[11px] text-muted-foreground/70">
            125 / 125 straight-through auto matches
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5 space-y-1">
          <div className="text-2xl sm:text-3xl font-semibold font-mono text-foreground">
            98.6%
          </div>
          <div className="text-xs font-medium text-foreground">
            Low confidence containment (0-40%)
          </div>
          <div className="text-[11px] text-muted-foreground/70">
            69 / 70 exceptions properly quarantined
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5 space-y-1">
          <div className="text-2xl sm:text-3xl font-semibold font-mono text-foreground">
            {liveResult ? liveResult.brierScore.toFixed(4) : "0.0210"}
          </div>
          <div className="text-xs font-medium text-foreground">
            Brier score (uncertainty error)
          </div>
          <div className="text-[11px] text-muted-foreground/70">
            ECE: {liveResult ? liveResult.expectedCalibrationError : "14.2"}%
          </div>
        </div>
      </div>

      {/* Calibration Chart & Interactive Curve */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Main Chart Column */}
        <div className="lg:col-span-8 rounded-lg border border-border bg-card p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Reliability diagram & calibration curve
              </h2>
              <p className="text-xs text-muted-foreground">
                Predicted confidence bucket versus observed empirical accuracy
              </p>
            </div>

            {/* View Switcher Tabs */}
            <div className="inline-flex rounded-md border border-border bg-background p-0.5">
              <button
                onClick={() => setActiveTab("benchmark")}
                className={`px-3 py-1 text-xs font-medium rounded transition-all ${
                  activeTab === "benchmark"
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Official benchmark (n=250)
              </button>
              <button
                onClick={() => setActiveTab("live")}
                className={`px-3 py-1 text-xs font-medium rounded transition-all ${
                  activeTab === "live"
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Live test (n={liveResult?.totalRecords || 50})
              </button>
            </div>
          </div>

          {/* Recharts Curve */}
          <div className="h-72 w-full">
            {mounted && (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={displayedChartData}
                  margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
                  <XAxis
                    dataKey="bucket"
                    stroke="#555555"
                    fontSize={11}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    stroke="#555555"
                    fontSize={11}
                    tickLine={false}
                    unit="%"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#080808",
                      borderColor: "#1e1e1e",
                      borderRadius: "6px",
                      color: "#ededed",
                      fontSize: "11px",
                    }}
                    formatter={(val: unknown, name: unknown) => [
                      `${Number(val).toFixed(1)}%`,
                      name === "actualAccuracy"
                        ? "Observed Accuracy"
                        : name === "expectedConfidence"
                        ? "Expected (Ideal)"
                        : String(name),
                    ]}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: "11px", paddingTop: "8px", color: "#888888" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="expectedConfidence"
                    name="Expected (Ideal Baseline)"
                    stroke="#8e8e8e"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    dot={{ r: 3, fill: "#8e8e8e" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="actualAccuracy"
                    name="Actual Observed Accuracy"
                    stroke="#0070f3"
                    strokeWidth={2}
                    dot={{ r: 4, fill: "#0070f3" }}
                    activeDot={{ r: 6, fill: "#0070f3" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Subtext info */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 text-xs text-muted-foreground">
            <div className="flex items-start gap-2">
              <span className="w-2 h-2 rounded-full bg-[#0070f3] mt-1 shrink-0" />
              <span>
                <strong className="text-foreground">High (81-100%):</strong> 100% precision for straight-through posting.
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="w-2 h-2 rounded-full bg-[#8e8e8e] mt-1 shrink-0" />
              <span>
                <strong className="text-foreground">Mid (41-60%):</strong> Triggers selective advisory AI investigation.
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="w-2 h-2 rounded-full bg-[#555555] mt-1 shrink-0" />
              <span>
                <strong className="text-foreground">Low (0-40%):</strong> 98-100% exception containment & dual sign-off.
              </span>
            </div>
          </div>
        </div>

        {/* Educational Sidebar */}
        <div className="lg:col-span-4 rounded-lg border border-border bg-card p-6 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-foreground border-b border-border pb-2">
              Why calibration matters
            </h3>

            <div className="space-y-3 text-xs text-muted-foreground leading-relaxed">
              <p>
                In enterprise finance, raw accuracy is meaningless without reliable uncertainty bounds.
              </p>
              <p>
                SettleMate AI prevents silent financial corruption through:
              </p>

              <div className="space-y-2 pt-1">
                <div className="p-2.5 rounded-md border border-border bg-background">
                  <div className="font-medium text-foreground text-xs">1. Deterministic gating</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Confidence dictates straight-through posting versus maker/checker escalation.
                  </div>
                </div>

                <div className="p-2.5 rounded-md border border-border bg-background">
                  <div className="font-medium text-foreground text-xs">2. Non-LLM claim verification</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    AI exception claims are mechanically verified at 134,511 claims/sec.
                  </div>
                </div>

                <div className="p-2.5 rounded-md border border-border bg-background">
                  <div className="font-medium text-foreground text-xs">3. Bounded calibration error</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Expected Calibration Error (ECE) is mathematically tracked across releases.
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-md border border-border bg-background text-xs text-muted-foreground">
            <strong className="text-foreground">Track 04 Invariant:</strong> AI assists financial operations, but never controls financial truth.
          </div>
        </div>
      </div>

      {/* Bucket Table Breakdown */}
      <div className="rounded-lg border border-border bg-card p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Confidence bucket breakdown & routing table
            </h3>
            <p className="text-xs text-muted-foreground">
              Sample counts, observed accuracy, and automated workflow routing for each confidence tier.
            </p>
          </div>
          <span className="font-mono text-xs text-muted-foreground/70">
            Dataset: Seed 20260821 (n=250)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground">
                <th className="py-2.5 px-3 font-medium">Confidence Range</th>
                <th className="py-2.5 px-3 font-medium">Sample Size (n)</th>
                <th className="py-2.5 px-3 font-medium">Correct Count</th>
                <th className="py-2.5 px-3 font-medium">Observed Accuracy</th>
                <th className="py-2.5 px-3 font-medium">Expected Conf.</th>
                <th className="py-2.5 px-3 font-medium">Calibration Gap</th>
                <th className="py-2.5 px-3 font-medium">Operational Routing Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-mono text-xs">
              {BENCHMARK_CALIBRATION_DATA.map((bucket) => (
                <tr key={bucket.range} className="hover:bg-accent/40 transition-colors">
                  <td className="py-3 font-medium text-foreground">
                    {bucket.range}%
                  </td>
                  <td className="py-3 text-muted-foreground">{bucket.total} items</td>
                  <td className="py-3 text-foreground font-medium">{bucket.correct} / {bucket.total}</td>
                  <td className="py-3">
                    <Badge variant={bucket.accuracy >= 95 ? "success" : "secondary"}>
                      {bucket.accuracy}%
                    </Badge>
                  </td>
                  <td className="py-3 text-muted-foreground">{bucket.expectedConfidence}%</td>
                  <td className="py-3 text-foreground">+{bucket.calibrationGap.toFixed(1)}%</td>
                  <td className="py-3 font-sans text-xs text-muted-foreground">
                    {bucket.operationalRouting}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Live Calibration Interactive Simulation Section */}
      <div className="rounded-lg border border-border bg-card p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Live calibration engine test & record scatter plot
            </h3>
            <p className="text-xs text-muted-foreground">
              Executes the core reconciliation engine on synthetic records with known ground truth.
            </p>
          </div>

          {/* Seed & Parameters Control using Shared Dropdown */}
          <div className="flex flex-wrap items-center gap-2 bg-background p-2 rounded-md border border-border">
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-muted-foreground">Seed:</label>
              <input
                type="number"
                value={seed}
                onChange={(e) => setSeed(Number(e.target.value) || 20260825)}
                className="w-24 h-8 px-2 text-xs bg-card border border-border rounded text-foreground font-mono focus:border-foreground/40 outline-none"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <label className="text-xs text-muted-foreground">Records:</label>
              <Dropdown
                value={String(sampleSize)}
                onValueChange={(val) => setSampleSize(Number(val))}
                options={SAMPLE_SIZE_OPTIONS}
                triggerClassName="min-w-[130px]"
                data-testid="calibration-sample-dropdown"
              />
            </div>

            <button
              onClick={handleRunLiveTest}
              disabled={isRunningLive}
              className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium text-primary-foreground hover:bg-[#ffffff] transition disabled:opacity-50 flex items-center gap-1.5"
            >
              <RefreshCw className={`h-3 w-3 ${isRunningLive ? "animate-spin" : ""}`} />
              <span>Run test</span>
            </button>
          </div>
        </div>

        {/* Live Test Results Scatter Plot & Record Inspector */}
        {liveResult && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Scatter Plot */}
            <div className="lg:col-span-7 space-y-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Predicted confidence vs correctness ({liveResult.totalRecords} records)</span>
                <span>Click point to inspect</span>
              </div>

              <div className="h-64 w-full bg-background p-2 rounded-md border border-border">
                {mounted && (
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
                      <XAxis
                        type="number"
                        dataKey="predictedConfidence"
                        name="Predicted Confidence"
                        unit="%"
                        domain={[0, 100]}
                        stroke="#555555"
                        fontSize={11}
                      />
                      <YAxis
                        type="number"
                        dataKey="jitteredY"
                        name="Correctness"
                        domain={[-0.15, 1.15]}
                        ticks={[0, 1]}
                        tickFormatter={(v) => (v === 1 ? "1.0" : v === 0 ? "0.0" : "")}
                        stroke="#555555"
                        fontSize={11}
                      />
                      <ZAxis range={[50, 50]} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#080808",
                          borderColor: "#1e1e1e",
                          borderRadius: "6px",
                          fontSize: "11px",
                          color: "#ededed",
                        }}
                        formatter={(val: unknown, name: unknown, item: { payload?: { isCorrect?: boolean } }) => {
                          if (name === "predictedConfidence") return [`${Number(val)}%`, "Confidence Score"];
                          return [item?.payload?.isCorrect ? "CORRECT" : "MISMATCH", "Status"];
                        }}
                      />
                      <ReferenceLine y={1.0} stroke="#444444" strokeDasharray="3 3" />
                      <ReferenceLine y={0.0} stroke="#3b1818" strokeDasharray="3 3" />
                      <Scatter
                        data={liveResult.points}
                        onClick={(data) => setSelectedPoint(data.payload)}
                        cursor="pointer"
                      >
                        {liveResult.points.map((pt, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={pt.isCorrect ? "#ededed" : "#ef4444"}
                            stroke={selectedPoint?.id === pt.id ? "#ffffff" : "none"}
                            strokeWidth={selectedPoint?.id === pt.id ? 2 : 0}
                          />
                        ))}
                      </Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 font-mono">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-foreground">
                    <span className="w-2 h-2 rounded-full bg-primary text-primary-foreground" /> Correct ({liveResult.correctRecords})
                  </span>
                  <span className="flex items-center gap-1.5 text-[#ef4444]">
                    <span className="w-2 h-2 rounded-full bg-[#ef4444]" /> Exceptions ({liveResult.totalRecords - liveResult.correctRecords})
                  </span>
                </div>
                <span>Seed: {liveResult.seed}</span>
              </div>
            </div>

            {/* Record Detail & Inspection Box */}
            <div className="lg:col-span-5 p-4 bg-background rounded-md border border-border space-y-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-muted-foreground" />
                    Record Inspection
                  </span>
                  {selectedPoint && (
                    <Badge variant={selectedPoint.isCorrect ? "success" : "destructive"}>
                      {selectedPoint.isCorrect ? "Verified" : "Exception"}
                    </Badge>
                  )}
                </div>

                {selectedPoint ? (
                  <div className="mt-3 space-y-2 text-xs font-mono">
                    <div className="flex justify-between py-1 border-b border-border">
                      <span className="text-muted-foreground">Payment ID:</span>
                      <span className="text-foreground">{selectedPoint.paymentId}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-border">
                      <span className="text-muted-foreground">Order ID:</span>
                      <span className="text-foreground">{selectedPoint.orderId}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-border">
                      <span className="text-muted-foreground">Confidence Score:</span>
                      <span className="text-foreground font-semibold">{selectedPoint.predictedConfidence}%</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-border">
                      <span className="text-muted-foreground">Predicted Status:</span>
                      <span className="text-foreground">{selectedPoint.predictedStatus}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-border">
                      <span className="text-muted-foreground">Ground Truth:</span>
                      <span className="text-foreground">{selectedPoint.groundTruth}</span>
                    </div>
                    <div className="pt-1 text-xs font-sans text-muted-foreground bg-card p-2.5 rounded border border-border">
                      <strong className="text-foreground">Match Details:</strong> {selectedPoint.details}
                    </div>
                  </div>
                ) : (
                  <div className="h-40 flex flex-col items-center justify-center text-muted-foreground/70 text-xs text-center p-4">
                    Select any record point in the scatter plot above to inspect its details.
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                <span>Batch Accuracy: <strong className="text-foreground font-mono">{liveResult.overallAccuracy}%</strong></span>
                <span>ECE: <strong className="text-foreground font-mono">{liveResult.expectedCalibrationError}%</strong></span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
