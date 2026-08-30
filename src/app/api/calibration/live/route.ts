/*
 * SettleMate AI — Live Calibration Test API
 */

import { NextRequest, NextResponse } from "next/server";
import { safeErrorResponse } from "@/lib/security/api-security";
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
    // safeErrorResponse masks 5xx detail; the raw message leaked calibration
    // internals to the caller.
    return safeErrorResponse(err, 500, "CALIBRATION_ERROR");
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
    // safeErrorResponse masks 5xx detail; the raw message leaked calibration
    // internals to the caller.
    return safeErrorResponse(err, 500, "CALIBRATION_ERROR");
  }
}
