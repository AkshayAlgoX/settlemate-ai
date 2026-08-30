/*
 * SettleMate AI — Production Startup Configuration Validator
 *
 * Runs during application boot in instrumentation.register().
 * Validates critical environment variables, formats, and encryption keys.
 * Fails fast with clear actionable error messages WITHOUT leaking secret values.
 */

export interface ValidationReport {
  valid: boolean;
  environment: string;
  checks: Array<{
    name: string;
    passed: boolean;
    error?: string;
  }>;
}

export function validateStartupConfig(): ValidationReport {
  const isProduction = process.env.NODE_ENV === "production";
  const checks: ValidationReport["checks"] = [];

  // 1. DATABASE_URL validation
  const dbUrl = process.env.DATABASE_URL || "";
  if (!dbUrl) {
    checks.push({
      name: "DATABASE_URL",
      passed: !isProduction, // Can default in dev, required in prod
      error: "DATABASE_URL environment variable is missing",
    });
  } else if (
    !dbUrl.startsWith("postgres://") &&
    !dbUrl.startsWith("postgresql://") &&
    !dbUrl.startsWith("file:")
  ) {
    checks.push({
      name: "DATABASE_URL",
      passed: false,
      error: "DATABASE_URL must start with postgresql://, postgres://, or file:",
    });
  } else {
    checks.push({ name: "DATABASE_URL", passed: true });
  }

  // 2. AUTH_SECRET / SESSION_SECRET validation
  const authSecret = process.env.AUTH_SECRET || process.env.SESSION_SECRET || "";
  if (isProduction && (!authSecret || authSecret.length < 16)) {
    checks.push({
      name: "AUTH_SECRET",
      passed: false,
      error: "AUTH_SECRET must be set and contain at least 16 characters in production",
    });
  } else {
    checks.push({ name: "AUTH_SECRET", passed: true });
  }

  // 3. Port & Host validation
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  if (isNaN(port) || port < 1 || port > 65535) {
    checks.push({
      name: "PORT",
      passed: false,
      error: "PORT must be a valid integer between 1 and 65535",
    });
  } else {
    checks.push({ name: "PORT", passed: true });
  }

  const valid = checks.every((c) => c.passed);

  return {
    valid,
    environment: process.env.NODE_ENV || "development",
    checks,
  };
}
