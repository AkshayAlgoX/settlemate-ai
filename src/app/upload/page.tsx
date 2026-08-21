"use client";

import { useState } from "react";
import { Upload, FileText, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function UploadPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white flex items-center gap-2">
        <Upload className="w-6 h-6 text-blue-400" />
        Upload CSV Files
      </h1>

      <Card className="bg-gray-900 border-gray-800">
        <CardContent className="p-12">
          <div className="border-2 border-dashed border-gray-700 rounded-xl p-12 text-center">
            <FileText className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 mb-2">
              Drag and drop CSV files here, or click to browse
            </p>
            <p className="text-sm text-gray-600">
              Required: orders.csv, payments.csv, settlements.csv, bank_statement.csv
            </p>
            <p className="text-sm text-gray-600">
              Optional: refunds.csv, chargebacks.csv, ground_truth.csv
            </p>
            <Button className="mt-4" variant="outline">
              Select Files
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gray-900 border-yellow-800/50">
        <CardContent className="p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-400 mt-0.5" />
          <div>
            <p className="text-sm text-yellow-300 font-medium">
              Demo mode recommended
            </p>
            <p className="text-xs text-gray-400">
              For the best experience, use the Demo Data page to generate synthetic
              Razorpay-like data with ground truth labels for accuracy measurement.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}