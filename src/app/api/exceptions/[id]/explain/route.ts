import { NextRequest, NextResponse } from "next/server";
import { explainException } from "@/lib/ai/explainer";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = await explainException(id);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Explain error:", error);
    return NextResponse.json(
      { error: "Failed to generate explanation", details: String(error) },
      { status: 500 }
    );
  }
}