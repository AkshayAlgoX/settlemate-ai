"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  BarChart3,
  CheckCircle,
  AlertTriangle,
  Clock,
  Zap,
  Shield,
  DollarSign,
  TrendingUp,
  Brain,
  Target,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";

const COLORS = [
  "#22c55e", "#eab308", "#ef4444", "#f97316", "#dc2626",
  "#a855f7", "#f59e0b", "#e11d48", "#3b82f6", "#6b7280",
];

interface DashboardBatch {
  id: string;
  size: number;
  status: string;
  totalRecords: number;
  autoMatched: number;
  exceptionsFound: number;
  accuracy: number;
  throughputRps: number;
  unresolvedCount: number;
  amountAtRisk: number;
  processingTimeMs: number;
}

interface DashboardException {
  exceptionType: string;
  amount: number;
}

interface DashboardPass {
  passNumber: number;
  name: string;
  accuracy: number;
  exceptions: number;
  autoMatched: number;
  durationMs: number;
}

interface DashboardCalibration {
  range: string;
  accuracy: number;
  total: number;
}

interface DashboardAdversarialTest {
  testName: string;
  detected: boolean;
}

interface DashboardAdversarial {
  detected: number;
  totalTests: number;
  detectionRate: number;
  tests?: DashboardAdversarialTest[];
}

interface DashboardMultiPass {
  passes?: DashboardPass[];
  calibration?: DashboardCalibration[];
  adversarial?: DashboardAdversarial;
}

interface DashboardData {
  batch?: DashboardBatch;
  exceptions?: DashboardException[];
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const batchId = searchParams.get("batchId");
  const [data, setData] = useState<DashboardData | null>(null);
  const [multiPass, setMultiPass] = useState<DashboardMultiPass | null>(null);
  const [loading, setLoading] = useState(true);

  const loadDashboard = useCallback(async (id: string) => {
    try {
      const [resultsRes, multiPassRes] = await Promise.all([
        fetch(`/api/reconcile/${id}/results`),
        fetch(`/api/reconcile/${id}/multi-pass`, { method: "POST" }),
      ]);
      const resultsData = await resultsRes.json();
      const multiPassData = await multiPassRes.json();
      setData(resultsData);
      setMultiPass(multiPassData);
    } catch (error) {
      console.error("Dashboard load error:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const run = async () => {
      try {
        if (!batchId) {
          // Fetch latest batch
          const r = await fetch("/api/batches");
          const d = await r.json();
          if (d.batches?.length > 0) {
            await loadDashboard(d.batches[0].id);
          } else {
            setLoading(false);
          }
        } else {
          await loadDashboard(batchId);
        }
      } catch {
        setLoading(false);
      }
    };
    void run();
  }, [batchId, loadDashboard]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Zap className="w-8 h-8 text-blue-400 animate-pulse mx-auto mb-2" />
          <p className="text-gray-400">Running multi-pass reconciliation...</p>
        </div>
      </div>
    );
  }

  if (!data?.batch) {
    return (
      <div className="text-center py-20">
        <AlertTriangle className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
        <h2 className="text-xl text-white mb-2">No Batch Found</h2>
        <p className="text-gray-400 mb-4">Generate demo data first.</p>
        <a href="/demo">
          <Button>Go to Demo Data</Button>
        </a>
      </div>
    );
  }

  const batch = data.batch;
  const exceptions = data.exceptions || [];

  // Chart data
  const exceptionTypeCounts: Record<string, number> = {};
  exceptions.forEach((e) => {
    exceptionTypeCounts[e.exceptionType] = (exceptionTypeCounts[e.exceptionType] || 0) + 1;
  });

  const pieData = Object.entries(exceptionTypeCounts).map(([name, value]) => ({
    name: name.replace(/_/g, " "),
    value,
  }));

  const amountByType: Record<string, number> = {};
  exceptions.forEach((e) => {
    amountByType[e.exceptionType] = (amountByType[e.exceptionType] || 0) + e.amount;
  });

  const barData = Object.entries(amountByType)
    .map(([name, value]) => ({
      name: name.replace(/_/g, " ").slice(0, 12),
      amount: value / 100,
    }))
    .sort((a, b) => b.amount - a.amount);

  const passData = multiPass?.passes?.map((p) => ({
    name: `Pass ${p.passNumber}`,
    accuracy: p.accuracy,
    exceptions: p.exceptions,
    autoMatched: p.autoMatched,
  })) || [];

  const calibrationData = multiPass?.calibration?.map((c) => ({
    range: c.range,
    accuracy: c.accuracy,
    total: c.total,
  })) || [];

  const formatRupees = (paise: number) => {
    const r = paise / 100;
    if (r >= 100000) return `₹${(r / 100000).toFixed(1)}L`;
    if (r >= 1000) return `₹${(r / 1000).toFixed(1)}K`;
    return `₹${r.toFixed(0)}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-blue-400" />
            Reconciliation Dashboard
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Batch {batch.id?.slice(0, 12)}... · {batch.size} records ·{" "}
            {batch.status}
          </p>
        </div>
        <Badge variant="outline" className="border-green-500/50 text-green-400">
          3-Pass + Adversarial Complete
        </Badge>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {[
          { label: "Records", value: batch.totalRecords, icon: BarChart3, color: "text-white" },
          { label: "Auto-Matched", value: batch.autoMatched, icon: CheckCircle, color: "text-green-400" },
          { label: "Exceptions", value: batch.exceptionsFound, icon: AlertTriangle, color: "text-orange-400" },
          { label: "Accuracy", value: `${batch.accuracy}%`, icon: Target, color: "text-blue-400" },
          { label: "Throughput", value: `${batch.throughputRps}/s`, icon: Zap, color: "text-purple-400" },
          { label: "Manual Review", value: batch.unresolvedCount, icon: Clock, color: "text-yellow-400" },
        ].map((m) => {
          const Icon = m.icon;
          return (
            <Card key={m.label} className="bg-gray-900 border-gray-800">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <Icon className={`w-4 h-4 ${m.color}`} />
                </div>
                <p className={`text-xl font-bold ${m.color}`}>{m.value}</p>
                <p className="text-xs text-gray-500">{m.label}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Multi-Pass Comparison — UNIQUE DIFFERENTIATOR */}
      {passData.length > 0 && (
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Brain className="w-5 h-5 text-purple-400" />
              Multi-Pass Accuracy Improvement
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              {multiPass?.passes?.map((p) => (
                <div key={p.passNumber} className="bg-gray-800 rounded-lg p-4">
                  <p className="text-sm text-gray-400">Pass {p.passNumber}: {p.name}</p>
                  <p className="text-2xl font-bold text-white">{p.accuracy}%</p>
                  <p className="text-xs text-gray-500">
                    {p.autoMatched} matched · {p.exceptions} exceptions · {p.durationMs}ms
                  </p>
                </div>
              ))}
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={passData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="name" stroke="#9ca3af" />
                <YAxis domain={[95, 100]} stroke="#9ca3af" />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151" }}
                />
                <Line
                  type="monotone"
                  dataKey="accuracy"
                  stroke="#3b82f6"
                  strokeWidth={3}
                  dot={{ fill: "#3b82f6", r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Exceptions Pie */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white text-base">Exceptions by Type</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-gray-500 text-center py-8">No exceptions</p>
            )}
          </CardContent>
        </Card>

        {/* Amount at Risk Bar */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white text-base flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-red-400" />
              Amount at Risk (₹)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {barData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={barData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis type="number" stroke="#9ca3af" />
                  <YAxis type="category" dataKey="name" stroke="#9ca3af" width={100} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151" }}
                    formatter={(value) => [`₹${Number(value ?? 0).toLocaleString("en-IN")}`, "Amount"]}
                  />
                  <Bar dataKey="amount" fill="#ef4444" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-gray-500 text-center py-8">No risk data</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Calibration + Adversarial Row — UNIQUE DIFFERENTIATORS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Calibration Curve */}
        {calibrationData.length > 0 && (
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white text-base flex items-center gap-2">
                <Target className="w-4 h-4 text-blue-400" />
                Confidence Calibration
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={calibrationData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="range" stroke="#9ca3af" />
                  <YAxis domain={[0, 100]} stroke="#9ca3af" />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151" }}
                  />
                  <Bar dataKey="accuracy" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <p className="text-xs text-gray-500 mt-2">
                When the system says 81-100% confident, it is{" "}
                {calibrationData.find((c) => c.range === "81-100")?.accuracy || 0}% correct.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Adversarial Self-Test */}
        {multiPass?.adversarial && (
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white text-base flex items-center gap-2">
                <Shield className="w-4 h-4 text-red-400" />
                Adversarial Self-Test
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-3 flex items-center gap-3">
                <span className="text-3xl font-bold text-white">
                  {multiPass.adversarial.detected}/{multiPass.adversarial.totalTests}
                </span>
                <span className="text-sm text-gray-400">
                  errors detected ({multiPass.adversarial.detectionRate}%)
                </span>
              </div>
              <div className="space-y-1.5">
                {multiPass.adversarial.tests?.map((t, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    {t.detected ? (
                      <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                    )}
                    <span className={t.detected ? "text-gray-300" : "text-red-300"}>
                      {t.testName}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Financial Impact — UNIQUE */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-green-400" />
            Financial Impact
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-800 rounded-lg p-4">
              <p className="text-sm text-gray-400">Amount at Risk</p>
              <p className="text-xl font-bold text-red-400">
                {formatRupees(batch.amountAtRisk || 0)}
              </p>
            </div>
            <div className="bg-gray-800 rounded-lg p-4">
              <p className="text-sm text-gray-400">Processing Time</p>
              <p className="text-xl font-bold text-blue-400">
                {batch.processingTimeMs}ms
              </p>
            </div>
            <div className="bg-gray-800 rounded-lg p-4">
              <p className="text-sm text-gray-400">Analyst Hours Saved</p>
              <p className="text-xl font-bold text-green-400">
                ~{((batch.totalRecords || 0) * 0.018).toFixed(1)}h
              </p>
            </div>
            <div className="bg-gray-800 rounded-lg p-4">
              <p className="text-sm text-gray-400">AI Cost (est.)</p>
              <p className="text-xl font-bold text-purple-400">
                ₹{(((batch.exceptionsFound || 0) * 0.1).toFixed(2))}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="text-gray-400 p-8">Loading...</div>}>
      <DashboardContent />
    </Suspense>
  );
}