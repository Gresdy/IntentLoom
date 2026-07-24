/** Error kinds matching the Rust `AppError` enum. */
export const ERROR_KINDS = [
  "database",
  "io",
  "network",
  "git",
  "not_found",
  "invalid_input",
  "cancelled",
  "internal",
] as const;

export type ErrorKind = (typeof ERROR_KINDS)[number];

/** Structured error returned by Tauri commands. */
export interface AppError {
  kind: ErrorKind;
  message: string;
}

const validKinds: ReadonlySet<string> = new Set(ERROR_KINDS);

/** Type-guard: check if an unknown error is a structured `AppError`. */
export function isAppError(error: unknown): error is AppError {
  if (
    typeof error !== "object" ||
    error === null ||
    typeof (error as AppError).message !== "string"
  ) {
    return false;
  }
  return validKinds.has((error as AppError).kind);
}

/**
 * Extract a human-readable message from any error shape.
 * Handles structured `AppError`, plain strings, and `Error` instances.
 */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (isAppError(error)) return error.message;
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return fallback;
}

/** Extract the error kind (or `undefined` for non-structured errors). */
export function getErrorKind(error: unknown): ErrorKind | undefined {
  if (isAppError(error)) return error.kind;
  return undefined;
}
