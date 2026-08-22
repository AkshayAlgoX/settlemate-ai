import assert from "node:assert/strict";
import {
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  verifySessionToken,
} from "./session";

let passed = 0;
let failed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name} — ${(err as Error).message}`);
  }
}

const savedNodeEnv = process.env.NODE_ENV;
const savedSecret = process.env.AUTH_SECRET;

// NODE_ENV is typed read-only; cast so tests can drive it.
function setNodeEnv(v: string | undefined) {
  const env = process.env as { NODE_ENV?: string };
  if (v === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = v;
}

// Node coerces `process.env.X = undefined` to the string "undefined"; delete the
// key instead so the secret is genuinely absent.
function unsetSecret() {
  delete (process.env as { AUTH_SECRET?: string }).AUTH_SECRET;
}

function demoUser() {
  return {
    sub: "admin",
    name: "Admin",
    role: "ADMIN" as const,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  };
}

async function run() {
  console.log("\nAuth Session — fail-closed AUTH_SECRET tests");

  await check("configured AUTH_SECRET mints and verifies a session", async () => {
    process.env.AUTH_SECRET = "test-secret-abc-123";
    const token = createSessionToken(demoUser());
    const verified = verifySessionToken(token);
    assert.ok(verified, "token verifies");
    assert.equal(verified.sub, "admin");
    assert.equal(verified.role, "ADMIN");
  });

  await check("production with no AUTH_SECRET cannot mint (fails closed)", async () => {
    unsetSecret();
    setNodeEnv("production");
    assert.throws(() => createSessionToken(demoUser()), /AUTH_SECRET/);
  });

  await check("production with no AUTH_SECRET cannot verify (no fallback)", async () => {
    unsetSecret();
    setNodeEnv("production");
    assert.throws(() => verifySessionToken("abc.def"), /AUTH_SECRET/);
  });

  await check("dev fallback secret is never accepted in production", async () => {
    // Forge a token using the dev-only fallback secret.
    process.env.AUTH_SECRET = "settlemate-dev-secret-change-me";
    setNodeEnv("development");
    const forged = createSessionToken(demoUser());
    // In production with no AUTH_SECRET set, that dev-signed token must not
    // verify — the process fails closed rather than accepting the default.
    unsetSecret();
    setNodeEnv("production");
    assert.throws(() => verifySessionToken(forged), /AUTH_SECRET/);
  });

  await check("configured secret still verifies in production", async () => {
    process.env.AUTH_SECRET = "prod-secret-xyz";
    setNodeEnv("production");
    const token = createSessionToken(demoUser());
    assert.equal(verifySessionToken(token)?.role, "ADMIN");
  });

  console.log(`\nsession: ${passed} passed, ${failed} failed`);
}

async function cleanup() {
  setNodeEnv(savedNodeEnv);
  if (savedSecret === undefined) unsetSecret();
  else process.env.AUTH_SECRET = savedSecret;
}

run()
  .then(cleanup)
  .then(() => {
    process.exitCode = failed > 0 ? 1 : 0;
    console.log(`\nsession: final ${failed > 0 ? "FAILURE" : "ALL PASSED"}`);
  })
  .catch(async (err) => {
    console.error("Session test harness crashed:", err);
    await cleanup();
    process.exitCode = 1;
  });
