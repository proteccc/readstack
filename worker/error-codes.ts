/**
 * Error codes thrown by the worker and matched against by the frontend.
 *
 * Keep this file in sync with lib/error-codes.ts — they must always
 * contain the same values.
 */

export const ErrorCodes = {
  // Article fetch failures
  FETCH_BAD_URL:      "FETCH_BAD_URL",      // 404 or invalid URL
  FETCH_PAYWALLED:    "FETCH_PAYWALLED",    // 402 — article behind a paywall
  FETCH_BLOCKED:      "FETCH_BLOCKED",      // 403/429 — site is blocking the request
  FETCH_UNSUPPORTED:  "FETCH_UNSUPPORTED",  // domain known to not work (e.g. X/Twitter)
  FETCH_ERROR:        "FETCH_ERROR",        // any other fetch failure

  // EPUB conversion failure
  CONVERT_ERROR: "CONVERT_ERROR",

  // Email delivery failure
  SMTP_ERROR: "SMTP_ERROR",
} as const;
