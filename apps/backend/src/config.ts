/**
 * Boot-time configuration validation (issue #45, covered by issue #47).
 *
 * JWT_SECRET is REQUIRED at runtime — there is no default fallback anymore
 * because a server running with a public secret would forge any token.
 *
 * This module is intentionally pure: no dotenv import and no process.exit.
 * Loading dotenv and terminating the process on failure are the caller's
 * responsibilities (see src/index.ts), which keeps this function testable
 * by stubbing process.env directly.
 */
export function validateConfig(): void {
  if (!process.env.JWT_SECRET) {
    throw new Error(
      "[auth] JWT_SECRET is not set. Refusing to start. Configure it in .env (see .env.example).",
    );
  }
}
