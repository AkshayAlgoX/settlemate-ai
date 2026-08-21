"use client";

import { Upload, FileText, AlertCircle, CheckCircle2, Database, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

const REQUIRED_FILES = [
  { name: "orders.csv", description: "Order details with amounts and customer info", required: true },
  { name: "payments.csv", description: "Payment captures with fee and tax", required: true },
  { name: "settlements.csv", description: "Razorpay settlement records with UTR", required: true },
  { name: "bank_statement.csv", description: "Bank credits and debits for matching", required: true },
];

const OPTIONAL_FILES = [
  { name: "refunds.csv", description: "Processed refunds", required: false },
  { name: "chargebacks.csv", description: "Chargeback adjustments", required: false },
  { name: "ground_truth.csv", description: "Expected labels for accuracy measurement", required: false },
];

export default function UploadPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Upload className="w-6 h-6 text-blue-400" />
          Upload Financial Data
        </h1>
        <p className="text-gray-400 text-sm mt-1">
          Import your own Razorpay and bank statement data for reconciliation
        </p>
      </div>

      {/* Import status — honest scoping */}
      <Card className="bg-gray-900 border-gray-800">
        <CardContent className="p-8">
          <div className="flex items-start gap-4">
            <Upload className="w-8 h-8 text-blue-400 shrink-0" />
            <div>
              <p className="text-gray-200 font-medium mb-1">
                Bring-your-own-CSV ingestion is a roadmap item
              </p>
              <p className="text-sm text-gray-400">
                The reconciliation engine is fully CSV-ready — the six source
                tables below map directly to the parser. For the demo, use the
                deterministic data generator: it produces the same six files with
                ground-truth labels, so you exercise the identical ingestion and
                reconciliation path.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Required files */}
      <Card className="bg-gray-900 border-gray-800">
        <CardContent className="p-6">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">
            Required Files
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {REQUIRED_FILES.map((file) => (
              <div key={file.name} className="flex items-start gap-3 bg-gray-950 p-3 rounded-lg border border-gray-800">
                <FileText className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-mono text-gray-200">{file.name}</p>
                  <p className="text-xs text-gray-500">{file.description}</p>
                </div>
                <span className="ml-auto text-xs text-blue-400 font-semibold">REQUIRED</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Optional files */}
      <Card className="bg-gray-900 border-gray-800">
        <CardContent className="p-6">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">
            Optional Files
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {OPTIONAL_FILES.map((file) => (
              <div key={file.name} className="flex items-start gap-3 bg-gray-950 p-3 rounded-lg border border-gray-800">
                <FileText className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-mono text-gray-300">{file.name}</p>
                  <p className="text-xs text-gray-500">{file.description}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Demo recommendation */}
      <Card className="bg-gray-900 border-amber-800/50">
        <CardContent className="p-5 flex items-start gap-4">
          <AlertCircle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-amber-300 font-medium mb-1">
              No data files yet?
            </p>
            <p className="text-xs text-gray-400 mb-3">
              Use the demo generator to create synthetic Razorpay-like data with
              ground truth labels, then run the full 3-pass pipeline with adversarial testing.
            </p>
            <Link href="/demo">
              <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white">
                <Database className="w-3.5 h-3.5 mr-1.5" />
                Generate Demo Data
                <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            </Link>
          </div>
          <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
        </CardContent>
      </Card>
    </div>
  );
}