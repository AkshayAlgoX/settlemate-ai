/*
 * SettleMate AI — Logout Confirmation & UI Consistency Tests
 */

import { ok } from "node:assert";
import fs from "node:fs";
import path from "node:path";

async function runLogoutAndUiConsistencyTests() {
  console.log("\n=========================================================================");
  console.log(" 🧪 SETTLEMATE AI — LOGOUT MODAL & UI CONSISTENCY TESTS");
  console.log("=========================================================================\n");

  const repoRoot = path.resolve(__dirname, "..");

  // 1. Test Sidebar has Logout Confirmation Modal
  {
    console.log(" [1/4] Testing Sidebar logout confirmation modal markup...");
    const sidebarPath = path.join(repoRoot, "src", "components", "layout", "sidebar.tsx");
    ok(fs.existsSync(sidebarPath), "Sidebar component must exist");
    const content = fs.readFileSync(sidebarPath, "utf-8");

    ok(
      content.includes("showLogoutConfirm") && content.includes("setShowLogoutConfirm"),
      "Sidebar must manage showLogoutConfirm modal state"
    );
    ok(
      content.includes("Are you sure you want to log out?"),
      "Sidebar must show 'Are you sure you want to log out?' confirmation message"
    );
    ok(
      content.includes("data-testid=\"logout-trigger-button\"") || content.includes("logout-trigger-button"),
      "Sidebar must have logout trigger button"
    );
    ok(
      content.includes("data-testid=\"logout-cancel-button\"") || content.includes("Cancel"),
      "Sidebar must have Cancel button for logout confirmation"
    );
    ok(
      content.includes("data-testid=\"logout-confirm-button\"") || content.includes("Log out"),
      "Sidebar must have Log out confirm button"
    );
    console.log("   ✓ Sidebar correctly implements logout confirmation modal flow");
  }

  // 2. Test Dropdown UI component exists and provides standard contract
  {
    console.log(" [2/4] Testing shared Dropdown component...");
    const dropdownPath = path.join(repoRoot, "src", "components", "ui", "dropdown.tsx");
    ok(fs.existsSync(dropdownPath), "src/components/ui/dropdown.tsx must exist");
    const content = fs.readFileSync(dropdownPath, "utf-8");

    ok(content.includes("data-testid="), "Dropdown must support data-testid");
    ok(content.includes("SelectTrigger") && content.includes("SelectContent"), "Dropdown must utilize Select primitives");
    console.log("   ✓ Shared Dropdown component exports accessible dark-themed Select");
  }

  // 3. Test UI consistency across the 6 refactored pages
  {
    console.log(" [3/4] Testing UI theme consistency across all 6 target pages...");
    const pages = [
      { name: "Confidence Calibration", file: "src/app/calibration/page.tsx", dropdownId: "calibration-sample-dropdown" },
      { name: "Reconciliation Playbooks", file: "src/app/playbook/page.tsx", dropdownId: "playbook-dropdown" },
      { name: "Multi-Currency Recon", file: "src/app/multi-currency/page.tsx", dropdownId: "multi-currency-currency-dropdown" },
      { name: "AI vs Deterministic", file: "src/app/ai-comparison/page.tsx", dropdownId: "ai-comparison-scenario-dropdown" },
      { name: "Live Monitor", file: "src/app/live-monitor/page.tsx", dropdownId: "live-monitor-speed-dropdown" },
      { name: "Business Impact", file: "src/app/business-impact/page.tsx", dropdownId: "business-impact-currency-dropdown" },
    ];

    for (const page of pages) {
      const filePath = path.join(repoRoot, page.file);
      ok(fs.existsSync(filePath), `Page file ${page.file} must exist`);
      const fileContent = fs.readFileSync(filePath, "utf-8");

      // Verify no out-of-theme raw bg-slate-950 top wrappers
      ok(!fileContent.includes("bg-slate-950 text-slate-100 flex flex-col"), `${page.name} should use main theme tokens, not bg-slate-950 wrapper`);

      // Verify shared Dropdown import and usage
      ok(fileContent.includes("Dropdown"), `${page.name} must import and use the shared Dropdown component`);
      ok(fileContent.includes(page.dropdownId), `${page.name} must include ${page.dropdownId}`);

      console.log(`   ✓ ${page.name} (${page.file}) passes UI consistency and Dropdown checks`);
    }
  }

  // 4. Test Sandbox page error alert rendering
  {
    console.log(" [4/5] Testing Sandbox page error alert formatting...");
    const sandboxPath = path.join(repoRoot, "src", "app", "sandbox", "page.tsx");
    ok(fs.existsSync(sandboxPath), "Sandbox page must exist");
    const content = fs.readFileSync(sandboxPath, "utf-8");

    ok(content.includes("sandbox-error-alert"), "Sandbox page must have designated sandbox-error-alert test id or class");
    ok(content.includes("errorCode"), "Sandbox page captures and renders specific error code");
    console.log("   ✓ Sandbox page renders structured reconciliation error alert");
  }

  // 5. Test Login Quick Demo Role Selection & Confirmation Modal Flow
  {
    console.log(" [5/5] Testing Login Quick Demo Role Selection & Confirmation Modal Flow...");
    const loginPath = path.join(repoRoot, "src", "app", "login", "page.tsx");
    ok(fs.existsSync(loginPath), "Login page must exist");
    const content = fs.readFileSync(loginPath, "utf-8");

    ok(content.includes("showConfirmModal"), "Login page must track confirmation modal state");
    ok(content.includes("role=\"dialog\""), "Login page modal must have role='dialog'");
    ok(content.includes("aria-modal=\"true\""), "Login page modal must have aria-modal='true'");
    ok(content.includes("demo-confirmation-modal"), "Login page must have demo-confirmation-modal data-testid");
    ok(content.includes("demo-cancel-button"), "Login page must have demo-cancel-button");
    ok(content.includes("demo-continue-button"), "Login page must have demo-continue-button");
    ok(content.includes("Continue as"), "Login page must have Continue as [Role] button");
    ok(content.includes("Escape"), "Login page must support Escape key to close modal");
    console.log("   ✓ Login page correctly implements Quick Demo role selection and confirmation dialog");
  }

  // 6. Test Search Command Palette & Global Header Keycap Consistency
  {
    console.log(" [6/6] Testing Search Command Palette & Keycap UX Consistency...");
    const headerPath = path.join(repoRoot, "src", "components", "layout", "global-header.tsx");
    ok(fs.existsSync(headerPath), "Global header component must exist");
    const headerContent = fs.readFileSync(headerPath, "utf-8");

    ok(
      headerContent.includes("⌘ K") || headerContent.includes("⌘K"),
      "Global header must render command keycap"
    );
    ok(
      headerContent.includes("border") && headerContent.includes("bg-secondary"),
      "Keycap must have dedicated border and background styling"
    );

    const palettePath = path.join(repoRoot, "src", "components", "layout", "command-palette.tsx");
    ok(fs.existsSync(palettePath), "Command palette component must exist");
    const paletteContent = fs.readFileSync(palettePath, "utf-8");

    ok(
      paletteContent.includes("paletteRef") && paletteContent.includes("contains"),
      "Command palette must track element ref and handle outside pointerdown"
    );
    ok(
      paletteContent.includes("Escape"),
      "Command palette must support Escape key dismissal"
    );
    ok(
      paletteContent.includes("stopPropagation"),
      "Clicking inside command palette must not trigger backdrop close"
    );

    console.log("   ✓ Command palette and search trigger meet all UX and micro-fix requirements");
  }

  // 7. Test Root Route Architecture & Landing Page Composition
  {
    console.log(" [7/7] Testing Root Route Architecture & Landing Page Composition...");
    const proxyPath = path.join(repoRoot, "src", "proxy.ts");
    ok(fs.existsSync(proxyPath), "src/proxy.ts must exist");
    const proxyContent = fs.readFileSync(proxyPath, "utf-8");

    ok(
      proxyContent.includes('pathname === "/"') && proxyContent.includes('redirect(new URL("/dashboard"'),
      "proxy.ts must redirect authenticated users on root '/' to '/dashboard'"
    );

    const landingPath = path.join(repoRoot, "src", "app", "page.tsx");
    ok(fs.existsSync(landingPath), "src/app/page.tsx must exist");
    const landingContent = fs.readFileSync(landingPath, "utf-8");

    ok(
      landingContent.includes("Deterministic reconciliation.") && landingContent.includes("Safe AI where it matters."),
      "Landing page must communicate deterministic reconciliation and safe AI"
    );
    ok(
      landingContent.includes("Watch Guided Demo") && landingContent.includes("Executive Judge Mode"),
      "Landing page must provide primary CTA actions"
    );
    ok(
      landingContent.includes("COMPACT_METRICS") && landingContent.includes("CORE_DIFFERENTIATORS"),
      "Landing page must display verified metrics and architectural pillars"
    );
    ok(
      landingContent.includes("BrandMark") && landingContent.includes("min-h-"),
      "Landing page must include header brand and vertical hero centering"
    );

    console.log("   ✓ Root route architecture and landing page composition meet all requirements");
  }

  console.log("\n=========================================================================");
  console.log(" ✅ ALL 7 LOGOUT, UI & ROUTING CONSISTENCY TESTS PASSED");
  console.log("=========================================================================\n");
}

runLogoutAndUiConsistencyTests().catch((err) => {
  console.error("UI consistency test failure:", err);
  process.exit(1);
});
