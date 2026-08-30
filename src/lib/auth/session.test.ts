import assert from "node:assert/strict";
import {
  SESSION_MAX_AGE_SECONDS,
  authenticateUser,
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
  console.log("\nAuth Session — constant-time credential verification");

  // authenticateUser compares credentials with timingSafeEqual over fixed-length
  // HMAC digests, in an exhaustive loop that never short-circuits. These cases
  // pin the behaviour that rewrite has to preserve.

  await check("valid admin credentials authenticate with the ADMIN role", async () => {
    const user = authenticateUser("admin", "admin123");
    assert.ok(user, "admin authenticates");
    assert.equal(user.sub, "admin");
    assert.equal(user.role, "ADMIN");
    assert.ok(user.exp > Math.floor(Date.now() / 1000), "session has a future expiry");
  });

  await check("valid reviewer credentials authenticate with the REVIEWER role", async () => {
    const user = authenticateUser("reviewer", "review123");
    assert.ok(user, "reviewer authenticates");
    assert.equal(user.role, "REVIEWER");
  });

  await check("credentials crossed between two accounts are rejected", async () => {
    // The loop keeps a mutable `match`; a bug that assigned on username-only or
    // leaked state across iterations would accept these. Direct regression guard.
    assert.equal(authenticateUser("admin", "review123"), null);
    assert.equal(authenticateUser("reviewer", "admin123"), null);
  });

  await check("wrong password, unknown user, and empty input are all rejected", async () => {
    assert.equal(authenticateUser("admin", "wrong-password"), null);
    assert.equal(authenticateUser("nosuchuser", "admin123"), null);
    assert.equal(authenticateUser("", ""), null);
    assert.equal(authenticateUser("admin", ""), null);
  });

  await check("digest comparison rejects prefixes, suffixes and case variants", async () => {
    // Hashing before comparison means no partial credit for a partly-correct
    // secret, and no length-based early exit.
    assert.equal(authenticateUser("admin", "admin12"), null, "prefix rejected");
    assert.equal(authenticateUser("admin", "admin1234"), null, "suffix rejected");
    assert.equal(authenticateUser("Admin", "admin123"), null, "username is case-sensitive");
    assert.equal(authenticateUser("admin", "ADMIN123"), null, "password is case-sensitive");
  });

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
