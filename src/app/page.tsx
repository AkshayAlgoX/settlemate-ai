"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Shield,
  Zap,
  Brain,
  Database,
  BarChart3,
  MessageSquare,
  ScrollText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface BatchMetrics {
  totalRecords: number;
  autoMatched: number;
  exceptionsFound: number;
  accuracy: number;
  throughputRps: number;
  unresolvedCount: number;
  adversarialScore: number;
}

export default function LandingPage() {
  const [metrics, setMetrics] = useState<BatchMetrics | null>(null);
  const [latestBatchId, setLatestBatchId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/batches")
      .then((r) => r.json())
      .then((data: { batches?: { id: string; totalRecords?: number; autoMatched?: number; exceptionsFound?: number; accuracy?: number; throughputRps?: number; unresolvedCount?: number; adversarialScore?: number }[] }) => {
        if (data.batches && data.batches.length > 0) {
          const latest = data.batches[0];
          setLatestBatchId(latest.id);
          setMetrics({
            totalRecords: latest.totalRecords || 0,
            autoMatched: latest.autoMatched || 0,
            exceptionsFound: latest.exceptionsFound || 0,
            accuracy: latest.accuracy || 0,
            throughputRps: latest.throughputRps || 0,
            unresolvedCount: latest.unresolvedCount || 0,
            adversarialScore: latest.adversarialScore || 0,
          });
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-900/40 via-gray-900 to-purple-900/30 border border-gray-800 p-8 md:p-12">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="relative z-10">
          <Badge variant="outline" className="mb-4 border-blue-500/50 text-blue-400">
            Razorpay AI Buildathon — Track 4: AI Finance Controller
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            SettleMate AI Agent
          </h1>
          <p className="text-xl text-gray-300 mb-2 max-w-2xl">
            Self-healing multi-agent finance controller for payment reconciliation.
          </p>
          <p className="text-gray-400 mb-8 max-w-2xl">
            {metrics
              ? `${metrics.accuracy}% accuracy. ${metrics.adversarialScore}% threat detection. ${metrics.throughputRps} records/sec.`
              : "Deterministic matching + AI anomaly detection + adversarial self-testing."}
          </p>
          <div className="flex gap-4">
            <Link href="/demo">
              <Button size="lg" className="bg-blue-600 hover:bg-blue-700">
                <Database className="w-4 h-4 mr-2" />
                Generate Demo Data
              </Button>
            </Link>
            {latestBatchId && (
              <Link href={`/dashboard?batchId=${latestBatchId}`}>
                <Button size="lg" variant="outline">
                  <BarChart3 className="w-4 h-4 mr-2" />
                  View Dashboard
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>

      {metrics && metrics.totalRecords > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-300 mb-4">
            Latest Batch Metrics
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {[
              { label: "Records", value: metrics.totalRecords, color: "text-white" },
              { label: "Auto-Matched", value: metrics.autoMatched, color: "text-green-400" },
              { label: "Exceptions", value: metrics.exceptionsFound, color: "text-orange-400" },
              { label: "Accuracy", value: `${metrics.accuracy}%`, color: "text-blue-400" },
              { label: "Throughput", value: `${metrics.throughputRps}/s`, color: "text-purple-400" },
              { label: "Manual Review", value: metrics.unresolvedCount, color: "text-yellow-400" },
              { label: "Adversarial", value: `${metrics.adversarialScore}%`, color: "text-red-400" },
            ].map((m) => (
              <Card key={m.label} className="bg-gray-900 border-gray-800">
                <CardContent className="p-4 text-center">
                  <p className={`text-2xl font-bold ${m.color}`}>{m.value}</p>
                  <p className="text-xs text-gray-500 mt-1">{m.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold text-gray-300 mb-4">How It Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              icon: Database,
              title: "1. Ingest",
              desc: "Generate synthetic data or upload CSVs. 6 sources: orders, payments, settlements, bank, refunds, chargebacks.",
              color: "text-blue-400",
            },
            {
              icon: Zap,
              title: "2. Reconcile (3 Passes)",
              desc: "Pass 1: Deterministic rules. Pass 2: AI Anomaly Agent. Pass 3: AI Resolver Agent. Accuracy improves each pass.",
              color: "text-yellow-400",
            },
            {
              icon: Shield,
              title: "3. Self-Test",
              desc: "Adversarial engine injects 10 known errors. System must detect them. 90% detection rate proves robustness.",
              color: "text-red-400",
            },
            {
              icon: Brain,
              title: "4. AI Explain",
              desc: "Every exception gets a structured AI explanation with evidence, risk level, and recommended action.",
              color: "text-purple-400",
            },
            {
              icon: MessageSquare,
              title: "5. Q&A Agent",
              desc: "Ask finance questions in natural language. Tool-calling agent queries database and returns grounded answers.",
              color: "text-green-400",
            },
            {
              icon: ScrollText,
              title: "6. Audit Trail",
              desc: "Every system decision, AI call, and user action is logged. Complete traceability for compliance.",
              color: "text-orange-400",
            },
          ].map((step) => {
            const Icon = step.icon;
            return (
              <Card key={step.title} className="bg-gray-900 border-gray-800">
                <CardHeader className="pb-2">
                  <Icon className={`w-6 h-6 ${step.color}`} />
                  <CardTitle className="text-white text-base">{step.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-400">{step.desc}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <Card className="bg-gray-900 border-gray-800">
        <CardContent className="p-6">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm text-gray-500 mr-2">Built with:</span>
            {["Next.js", "TypeScript", "Prisma", "SQLite", "Gemini 2.0 Flash", "Recharts", "shadcn/ui", "Tailwind CSS"].map(
              (tech) => (
                <Badge key={tech} variant="secondary" className="bg-gray-800 text-gray-300">
                  {tech}
                </Badge>
              )
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}