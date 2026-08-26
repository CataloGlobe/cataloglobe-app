import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// Guardrail anti-drift: CUSTOMER_JWT_SECRET has exactly one legitimate reader
// (getSigningKey() in customerJwt.ts). Any other file under supabase/functions
// that touches JWT_SECRET is either duplicating sign/verify logic by hand
// (drift risk: divergent secret, divergent claim validation) or referencing
// SUPABASE_JWT_SECRET directly, which is not how this project sources the key.

const FUNCTIONS_ROOT = path.resolve(__dirname, "..");
const ALLOWED_FILE = path.join(__dirname, "customerJwt.ts");

// Explicit allowlist of the lines expected inside customerJwt.ts itself.
// Any JWT_SECRET-matching line in that file NOT in this list fails the test —
// this pins the known-good content instead of just counting occurrences.
const ALLOWED_LINES = new Set([
  "// JWTs are signed with CUSTOMER_JWT_SECRET so PostgREST accepts them",
  "//   - CUSTOMER_JWT_SECRET  → HMAC key for HS256 sign/verify. Must hold",
  '    const secret = Deno.env.get("CUSTOMER_JWT_SECRET");',
  '        throw new Error("CUSTOMER_JWT_SECRET environment variable is not set");',
  " * CUSTOMER_JWT_SECRET; the `role: \"anon\"` claim activates the"
]);

const JWT_SECRET_PATTERN = /JWT_SECRET/;

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listTsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

describe("customer JWT secret centralization", () => {
  it("customerJwt.ts only contains the allowlisted JWT_SECRET lines", () => {
    const lines = fs.readFileSync(ALLOWED_FILE, "utf-8").split("\n");
    const unexpected = lines.filter((line) => JWT_SECRET_PATTERN.test(line) && !ALLOWED_LINES.has(line));
    expect(unexpected, `Unexpected JWT_SECRET line(s) in customerJwt.ts:\n${unexpected.join("\n")}`).toEqual([]);
  });

  it("no other file under supabase/functions references JWT_SECRET", () => {
    const offenders: string[] = [];
    for (const file of listTsFiles(FUNCTIONS_ROOT)) {
      if (file === ALLOWED_FILE) continue;
      const content = fs.readFileSync(file, "utf-8");
      if (JWT_SECRET_PATTERN.test(content)) {
        offenders.push(path.relative(FUNCTIONS_ROOT, file));
      }
    }
    expect(
      offenders,
      `Found JWT_SECRET reference outside customerJwt.ts: ${offenders.join(", ")}. ` +
        "Usa signCustomerJwt/verifyCustomerJwt, non leggere il secret a mano."
    ).toEqual([]);
  });
});
