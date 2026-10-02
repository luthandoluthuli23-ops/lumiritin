import { spawn } from "node:child_process";
import path from "node:path";

export type VerifierOutcome = "VERIFIED" | "NOT_FOUND" | "BLOCKED" | "PORTAL_ERROR";

export interface VerifiedRecord {
  licence_number: string;
  holder_name: string | null;
  licence_type: string | null;
  status: string | null;
  issued: string | null;
  expires: string | null;
  ratings: { name: string; category: string | null; expires: string | null }[];
  medical: { medical_class: number | null; expires: string | null } | null;
  unmapped: Record<string, string>;
}

export interface VerifierResult {
  outcome: VerifierOutcome;
  record: VerifiedRecord | null;
  error: string | null;
  html_sha256: string | null;
}

/** Runs the Python verifier CLI and returns its JSON result. */
export function runVerifier(licenceNumber: string): Promise<VerifierResult> {
  const [cmd, ...baseArgs] = (process.env.VERIFIER_CMD ?? "python -m lumiritin_verifier").split(" ");
  const cwd = path.resolve(process.cwd(), process.env.VERIFIER_CWD ?? "../verifier");

  return new Promise((resolve) => {
    const child = spawn(cmd, [...baseArgs, licenceNumber], { cwd, env: process.env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (err) =>
      resolve({ outcome: "PORTAL_ERROR", record: null, error: err.message, html_sha256: null }),
    );
    child.on("close", () => {
      try {
        resolve(JSON.parse(stdout) as VerifierResult);
      } catch {
        resolve({
          outcome: "PORTAL_ERROR",
          record: null,
          error: `verifier produced no JSON: ${stderr.trim().slice(0, 500)}`,
          html_sha256: null,
        });
      }
    });
  });
}
