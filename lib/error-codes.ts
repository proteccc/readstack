/**
 * Error codes shared between the worker and the frontend.
 *
 * The worker throws these as Error messages; the frontend matches against
 * them to display appropriate copy. Keep this file in sync with
 * worker/error-codes.ts — they must always contain the same values.
 */

export const ErrorCodes = {
  // Article fetch failures
  FETCH_BAD_URL:   "FETCH_BAD_URL",   // 404 or invalid URL
  FETCH_PAYWALLED: "FETCH_PAYWALLED", // 402 — article behind a paywall
  FETCH_BLOCKED:   "FETCH_BLOCKED",   // 403/429 — site is blocking the request
  FETCH_ERROR:     "FETCH_ERROR",     // any other fetch failure

  // EPUB conversion failure
  CONVERT_ERROR: "CONVERT_ERROR",

  // Email delivery failure
  SMTP_ERROR: "SMTP_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
