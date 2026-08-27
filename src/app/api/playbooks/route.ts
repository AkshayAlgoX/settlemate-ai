/*
 * SettleMate AI — Reconciliation Playbooks API
 */

import { NextRequest, NextResponse } from "next/server";
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
    return NextResponse.json(
      { error: (err as Error).message || "Playbooks API Failed" },
      { status: 500 }
    );
  }
}
