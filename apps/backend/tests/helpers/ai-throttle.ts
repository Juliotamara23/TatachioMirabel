/**
 * Token-bucket throttle for external AI API calls in integration tests.
 *
 * Google Gemini free tier blocks after ~15 requests per minute.
 * This helper tracks calls and pauses when approaching the limit,
 * avoiding false alarms from external rate limiting.
 */

const MAX_CALLS_PER_WINDOW = 12; // buffer below 15
const WINDOW_MS = 60_000; // 1 minute
const GRACE_MS = 2_000; // extra breathing room after pause

interface ThrottleState {
  calls: number;
  windowStart: number;
}

const state: ThrottleState = {
  calls: 0,
  windowStart: 0,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Call BEFORE each AI request in integration tests.
 * Pauses the test if we're approaching the rate limit.
 */
export async function throttleAiCall(): Promise<void> {
  const now = Date.now();

  // Reset window if expired
  if (now - state.windowStart >= WINDOW_MS) {
    state.calls = 0;
    state.windowStart = now;
  }

  state.calls++;

  if (state.calls >= MAX_CALLS_PER_WINDOW) {
    const remaining = WINDOW_MS - (now - state.windowStart) + GRACE_MS;
    console.log(
      `[ai-throttle] ${state.calls} calls in window, pausing ${(remaining / 1000).toFixed(1)}s...`
    );
    await sleep(remaining);
    state.calls = 0;
    state.windowStart = Date.now();
  }
}

/**
 * Reset throttle state between test files.
 */
export function resetThrottle(): void {
  state.calls = 0;
  state.windowStart = 0;
}
