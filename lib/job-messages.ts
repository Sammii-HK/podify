// No provider text, stack, request headers or source content belongs in this DTO.
export type JobStage = "scripting" | "audio" | "assembly" | "complete" | null;
export type FailureCode = "GENERATION_FAILED" | "PROGRESS_WRITE_FAILED" | "ERROR_WRITE_FAILED" | "WEBHOOK_FAILED" | "REQUEST_FAILED";
export interface JobDiagnostic {
  code: FailureCode;
  errorType: "Error" | "TypeError" | "RangeError" | "SyntaxError" | "AbortError" | "TimeoutError" | "Unknown";
  stage: JobStage;
}
const errorTypes = new Set(["Error", "TypeError", "RangeError", "SyntaxError", "AbortError", "TimeoutError"]);
const stages = new Set(["scripting", "audio", "assembly", "complete"]);
const failureCodes = new Set(["GENERATION_FAILED", "PROGRESS_WRITE_FAILED", "ERROR_WRITE_FAILED", "WEBHOOK_FAILED", "REQUEST_FAILED"]);
export function safeStage(value: unknown): JobStage {
  return typeof value === "string" && stages.has(value) ? value as JobStage : null;
}
export function operatorDiagnostic(value: unknown): JobDiagnostic | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.code !== "string" || !failureCodes.has(candidate.code)) return undefined;
  return { code: candidate.code as FailureCode, errorType: typeof candidate.errorType === "string" && errorTypes.has(candidate.errorType) ? candidate.errorType as JobDiagnostic["errorType"] : "Unknown", stage: safeStage(candidate.stage) };
}
export function safeDiagnostic(error: unknown, code: FailureCode, stage: JobStage = null): JobDiagnostic {
  let name: unknown;
  try { name = error && typeof error === "object" && "name" in error ? error.name : undefined; } catch { /* Untrusted exception property. */ }
  return { code, errorType: typeof name === "string" && errorTypes.has(name) ? name as JobDiagnostic["errorType"] : "Unknown", stage: safeStage(stage) };
}
export function logJobFailure(error: unknown, code: FailureCode, jobId?: string, stage: JobStage = null) {
  // The job ID is server-created or validated by requireJob, never a credential.
  console.error("[podify] Job operation failed", { ...(jobId ? { jobId } : {}), ...safeDiagnostic(error, code, stage) });
}
export function safeJobMessage(status: string, stage: JobStage): string {
  if (status === "error") return "Generation failed. Check the job reference before starting again.";
  if (status === "complete") return "Episode complete!";
  if (status === "pending") return "Queued";
  switch (stage) {
    case "scripting": return "Generating script...";
    case "audio": return "Generating audio clips...";
    case "assembly": return "Assembling podcast...";
    default: return "Processing episode...";
  }
}
export const GENERATION_ERROR = "Generation failed";
