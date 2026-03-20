export class IntakeError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "IntakeError";
  }
}

export class RepoResolutionError extends IntakeError {
  constructor(message: string) {
    super("REPO_RESOLUTION_FAILED", message);
    this.name = "RepoResolutionError";
  }
}

export class BoundaryPolicyError extends IntakeError {
  constructor(message: string) {
    super("BOUNDARY_POLICY_VIOLATION", message);
    this.name = "BoundaryPolicyError";
  }
}

export class PersistenceError extends IntakeError {
  constructor(message: string) {
    super("PERSISTENCE_FAILED", message);
    this.name = "PersistenceError";
  }
}

export function extractErrorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    return String((error as { code: unknown }).code);
  }
  return undefined;
}

export function hasErrorCode(error: unknown, code: string): boolean {
  return extractErrorCode(error) === code;
}
