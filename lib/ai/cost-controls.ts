import type { AIProvider, AiPerfumeProfileInput, AiExplanationInput, AiExplanationResult } from "@/lib/ai/provider";
import { AiUnavailableError } from "@/lib/ai/errors";


function recordBlocked(s: InternalState, storeId: string | undefined, now: number, policy: AiControlPolicy): void {
  s.globalWindow.blocked += 1; s.global = s.globalWindow;
  if (storeId) { const w = storeWindow(s, storeId, now, policy); w.blocked += 1; }
}
export function getAiControlState(): Readonly<AiControlState> {
  const s = state();
  return { global: { ...s.global }, stores: new Map([...s.stores].map(([k, v]) => [k, { ...v }])), circuitState: s.circuitState, consecutiveFailures: s.consecutiveFailures, cooldownUntil: s.cooldownUntil, halfOpenInFlight: s.halfOpenInFlight };
}
export function aiControlStateForTests(): AiCircuitState { return state().circuitState; }

export function createControlledAIProvider(provider: AIProvider, storeId?: string, now: () => number = Date.now): AIProvider {
  const guarded = async <T>(call: () => Promise<T>): Promise<T> => {
    const s = state(); const timestamp = now(); const policy = readAiControlPolicy();
    try {
      prune(s, timestamp, policy);
      if (!canAttempt(s, storeId, timestamp, policy)) { recordBlocked(s, storeId, timestamp, policy); throw new AiUnavailableError("AI usage temporarily unavailable."); }
      return call().then((value) => { recordSuccess(s); return value; }).catch((error) => { recordFailure(s, policy, timestamp); throw error; });
    } catch (error) {
      if (error instanceof AiUnavailableError) throw error;
      return call();
    }
  };
  return {
    id: provider.id,
    isAvailable: () => provider.isAvailable(),
    unavailableReason: () => provider.unavailableReason(),
    generatePerfumeProfile: (input: AiPerfumeProfileInput) => guarded(() => provider.generatePerfumeProfile(input)),
    generateRecommendationExplanation: (input: AiExplanationInput): Promise<AiExplanationResult> => guarded(() => provider.generateRecommendationExplanation(input)),
  };
}

export interface AiControlPolicy {
  globalRequestLimit: number;
  storeRequestLimit: number;
  usageWindowMs: number;
  circuitFailureThreshold: number;
  circuitCooldownMs: number;
}

export const DEFAULT_AI_CONTROL_POLICY: AiControlPolicy = {
  globalRequestLimit: 1000,
  storeRequestLimit: 200,
  usageWindowMs: 60_000,
  circuitFailureThreshold: 5,
  circuitCooldownMs: 60_000,
};

export type AiCircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";
export interface AiUsageCounters { requests: number; successes: number; failures: number; blocked: number; }
export interface AiControlState {
  global: AiUsageCounters;
  stores: Map<string, AiUsageCounters>;
  circuitState: AiCircuitState;
  consecutiveFailures: number;
  cooldownUntil: number;
  halfOpenInFlight: boolean;
}
interface WindowCounters extends AiUsageCounters { resetAt: number; }
interface InternalState extends AiControlState { globalWindow: WindowCounters; storeWindows: Map<string, WindowCounters>; }

const STATE = Symbol.for("fiage.ai-controls.v1");
const MAX_STORES = 1000;
type GlobalWithState = typeof globalThis & { [STATE]?: InternalState };

function emptyCounters(resetAt: number): WindowCounters {
  return { requests: 0, successes: 0, failures: 0, blocked: 0, resetAt };
}
function freshState(now: number, policy: AiControlPolicy): InternalState {
  return { global: emptyCounters(now + policy.usageWindowMs), globalWindow: emptyCounters(now + policy.usageWindowMs), stores: new Map(), storeWindows: new Map(), circuitState: "CLOSED", consecutiveFailures: 0, cooldownUntil: 0, halfOpenInFlight: false };
}
function state(now = Date.now()): InternalState {
  const target = globalThis as GlobalWithState;
  target[STATE] ??= freshState(now, readAiControlPolicy());
  return target[STATE];
}
function positive(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
export function readAiControlPolicy(env: Record<string, string | undefined> = process.env): AiControlPolicy {
  return {
    globalRequestLimit: positive(env.AI_GLOBAL_REQUEST_LIMIT_PER_WINDOW, DEFAULT_AI_CONTROL_POLICY.globalRequestLimit),
    storeRequestLimit: positive(env.AI_STORE_REQUEST_LIMIT_PER_WINDOW, DEFAULT_AI_CONTROL_POLICY.storeRequestLimit),
    usageWindowMs: positive(env.AI_USAGE_WINDOW_MS, DEFAULT_AI_CONTROL_POLICY.usageWindowMs),
    circuitFailureThreshold: positive(env.AI_CIRCUIT_FAILURE_THRESHOLD, DEFAULT_AI_CONTROL_POLICY.circuitFailureThreshold),
    circuitCooldownMs: positive(env.AI_CIRCUIT_COOLDOWN_MS, DEFAULT_AI_CONTROL_POLICY.circuitCooldownMs),
  };
}
export function resetAiControlsForTests(now = Date.now()): void {
  (globalThis as GlobalWithState)[STATE] = freshState(now, readAiControlPolicy());
}
function prune(s: InternalState, now: number, policy: AiControlPolicy): void {
  if (s.globalWindow.resetAt <= now) { s.globalWindow = emptyCounters(now + policy.usageWindowMs); s.global = s.globalWindow; }
  for (const [key, value] of s.storeWindows) if (value.resetAt <= now) s.storeWindows.delete(key);
  if (s.stores.size > MAX_STORES) {
    const keys = [...s.storeWindows.keys()].sort((a, b) => (s.storeWindows.get(b)?.resetAt ?? 0) - (s.storeWindows.get(a)?.resetAt ?? 0));
    for (const key of keys.slice(MAX_STORES)) { s.storeWindows.delete(key); s.stores.delete(key); }
  }
}
function storeWindow(s: InternalState, key: string, now: number, policy: AiControlPolicy): WindowCounters {
  let value = s.storeWindows.get(key);
  if (!value) { value = emptyCounters(now + policy.usageWindowMs); s.storeWindows.set(key, value); }
  s.stores.set(key, value);
  return value;
}
function canAttempt(s: InternalState, storeId: string | undefined, now: number, policy: AiControlPolicy): boolean {
  if (s.halfOpenInFlight) return false;
  if (s.circuitState === "OPEN") {
    if (now < s.cooldownUntil) return false;
    s.circuitState = "HALF_OPEN"; s.halfOpenInFlight = true; return true;
  }
  if (s.globalWindow.requests >= policy.globalRequestLimit) return false;
  if (storeId && storeWindow(s, storeId, now, policy).requests >= policy.storeRequestLimit) return false;
  s.globalWindow.requests += 1;
  if (storeId) storeWindow(s, storeId, now, policy).requests += 1;
  s.global = s.globalWindow;
  return true;
}
function recordSuccess(s: InternalState): void {
  s.globalWindow.successes += 1; s.global = s.globalWindow; s.consecutiveFailures = 0;
  if (s.circuitState === "HALF_OPEN") { s.circuitState = "CLOSED"; s.halfOpenInFlight = false; }
}
function recordFailure(s: InternalState, policy: AiControlPolicy, now: number): void {
  s.globalWindow.failures += 1; s.global = s.globalWindow; s.consecutiveFailures += 1;
  if (s.circuitState === "HALF_OPEN" || s.consecutiveFailures >= policy.circuitFailureThreshold) { s.circuitState = "OPEN"; s.cooldownUntil = now + policy.circuitCooldownMs; s.halfOpenInFlight = false; }
}
