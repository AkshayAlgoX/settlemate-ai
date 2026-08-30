/*
 * SettleMate AI — Reconciliation Playbooks API
 */

import { NextRequest, NextResponse } from "next/server";
import { safeErrorResponse } from "@/lib/security/api-security";
import {
  getAllPlaybooks,
  generatePlaybook,
  PLAYBOOK_SCENARIO_IDS,
  type PlaybookScenarioId,
} from "@/lib/playbooks/generator";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const playbookId = searchParams.get("id");

    if (playbookId && PLAYBOOK_SCENARIO_IDS.includes(playbookId as PlaybookScenarioId)) {
      const playbook = generatePlaybook(playbookId as PlaybookScenarioId);
      return NextResponse.json({
        success: true,
        playbook,
      });
    }

    const playbooks = getAllPlaybooks();
    return NextResponse.json({
      success: true,
      count: playbooks.length,
      playbooks,
    });
  } catch (err) {
    // safeErrorResponse masks 5xx detail; the raw message leaked generator
    // internals to the caller.
    return safeErrorResponse(err, 500, "PLAYBOOKS_ERROR");
  }
}
