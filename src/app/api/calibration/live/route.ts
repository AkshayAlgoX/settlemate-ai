/*
 * SettleMate AI — Live Calibration Test API
 */

import { NextRequest, NextResponse } from "next/server";
import { runLiveCalibrationTest, BENCHMARK_CALIBRATION_DATA } from "@/lib/calibration/calibration-utils";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const seed = searchParams.get("seed") ? Number(searchParams.get("seed")) : 20260825;
    const sampleSize = searchParams.get("sampleSize") ? Number(searchParams.get("sampleSize")) : 50;

    const result = await runLiveCalibrationTest({ seed, sampleSize });

    return NextResponse.json({
      success: true,
      benchmark: BENCHMARK_CALIBRATION_DATA,
      liveTest: result,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "Live Calibration Test Failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const seed = body.seed !== undefined ? Number(body.seed) : 20260825;
    const sampleSize = body.sampleSize !== undefined ? Number(body.sampleSize) : 50;

    const result = await runLiveCalibrationTest({ seed, sampleSize });

    return NextResponse.json({
      success: true,
      benchmark: BENCHMARK_CALIBRATION_DATA,
      liveTest: result,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "Live Calibration Test Failed" },
      { status: 500 }
    );
  }
}
