import { NextRequest, NextResponse } from "next/server";
import { PolicyManager, DEFAULT_RULES_V1 } from "@/lib/policy/manager";

// Persistent in-memory manager instance for runtime session
const globalPolicyManager = new PolicyManager();

export async function GET() {
  try {
    const activePolicy = globalPolicyManager.getActivePolicy();
    const allPolicies = globalPolicyManager.getAllPolicies();

    return NextResponse.json({
      success: true,
      activePolicy,
      policies: allPolicies,
      activeVersion: activePolicy.version,
    });
  } catch (error) {
    console.error("Policy GET error:", error);
    return NextResponse.json({ error: "Failed to fetch policies" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    if (!action) {
      return NextResponse.json({ error: "Action required" }, { status: 400 });
    }

    if (action === "create_draft") {
      const { version, rules, createdBy, description } = body;
      if (!version) {
        return NextResponse.json({ error: "Version string required" }, { status: 400 });
      }

      const draft = globalPolicyManager.createDraftPolicy({
        version,
        rules: rules || DEFAULT_RULES_V1,
        createdBy: createdBy || "CONTROLLER_ADMIN",
        description: description || "Draft Policy " + version,
      });

      return NextResponse.json({ success: true, policy: draft });
    }

    if (action === "run_shadow_replay") {
      const { version, sampleSize } = body;
      if (!version) {
        return NextResponse.json({ error: "Version required for shadow replay" }, { status: 400 });
      }

      const count = Number(sampleSize) || 10000;

      // Move to SHADOW first if in DRAFT
      const policy = globalPolicyManager.getPolicy(version);
      if (policy && policy.status === "DRAFT") {
        globalPolicyManager.transitionStatus(version, "SHADOW");
      }

      const report = globalPolicyManager.runShadowReplay(version, count);
      return NextResponse.json({ success: true, report });
    }

    if (action === "approve") {
      const { version, actorId } = body;
      if (!version || !actorId) {
        return NextResponse.json({ error: "Version and actorId required for approval" }, { status: 400 });
      }

      const approved = globalPolicyManager.transitionStatus(version, "APPROVED", actorId);
      return NextResponse.json({ success: true, policy: approved });
    }

    if (action === "activate") {
      const { version } = body;
      if (!version) {
        return NextResponse.json({ error: "Version required for activation" }, { status: 400 });
      }

      const activated = globalPolicyManager.transitionStatus(version, "ACTIVE");
      return NextResponse.json({ success: true, policy: activated });
    }

    if (action === "rollback") {
      const { targetVersion, actorId } = body;
      if (!targetVersion || !actorId) {
        return NextResponse.json({ error: "targetVersion and actorId required for rollback" }, { status: 400 });
      }

      const rolledBack = globalPolicyManager.rollbackToVersion(targetVersion, actorId);
      return NextResponse.json({ success: true, policy: rolledBack });
    }

    return NextResponse.json({ error: "Unrecognized action: " + action }, { status: 400 });
  } catch (error) {
    console.error("Policy POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Policy action failed" },
      { status: 400 }
    );
  }
}
