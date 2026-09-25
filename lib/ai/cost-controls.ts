import type { AIProvider, AiPerfumeProfileInput, AiExplanationInput, AiExplanationResult } from "@/lib/ai/provider";
import { AiUnavailableError } from "@/lib/ai/errors";
import { checkRateLimit } from "@/lib/rate-limit";

export interface AiControlPolicy { globalRequestLimit: number; storeRequestLimit: number; usageWindowMs: number; circuitFailureThreshold: number; circuitCooldownMs: number; }
export const DEFAULT_AI_CONTROL_POLICY: AiControlPolicy = { globalRequestLimit: 1000, storeRequestLimit: 200, usageWindowMs: 60_000, circuitFailureThreshold: 5, circuitCooldownMs: 60_000 };
export type AiCircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";
export interface AiUsageCounters { requests: number; successes: number; failures: number; blocked: number; }
export interface AiControlState { global: AiUsageCounters; stores: Map<string, AiUsageCounters>; circuitState: AiCircuitState; consecutiveFailures: number; cooldownUntil: number; halfOpenInFlight: boolean; }
interface Circuit { state: AiCircuitState; failures: number; cooldownUntil: number; trialInFlight: boolean; }
const CIRCUIT = Symbol.for("fiage.ai-circuit.v1");
type G = typeof globalThis & { [CIRCUIT]?: Circuit };
const counters = (): AiUsageCounters => ({ requests: 0, successes: 0, failures: 0, blocked: 0 });
function circuit(): Circuit { const g=globalThis as G; return g[CIRCUIT] ??= { state:"CLOSED", failures:0, cooldownUntil:0, trialInFlight:false }; }
export function readAiControlPolicy(env: Record<string,string|undefined> = process.env): AiControlPolicy { const n=(x:string|undefined,d:number)=>{const v=Number(x);return Number.isInteger(v)&&v>0?v:d}; return { globalRequestLimit:n(env.AI_GLOBAL_REQUEST_LIMIT_PER_WINDOW,1000), storeRequestLimit:n(env.AI_STORE_REQUEST_LIMIT_PER_WINDOW,200), usageWindowMs:n(env.AI_USAGE_WINDOW_MS,60000), circuitFailureThreshold:n(env.AI_CIRCUIT_FAILURE_THRESHOLD,5), circuitCooldownMs:n(env.AI_CIRCUIT_COOLDOWN_MS,60000) }; }
export function resetAiControlsForTests(_now=Date.now()): void { const g=globalThis as G; g[CIRCUIT]={state:"CLOSED",failures:0,cooldownUntil:0,trialInFlight:false}; }
export function getAiControlState(): Readonly<AiControlState> { const c=circuit(); return { global:counters(), stores:new Map(), circuitState:c.state, consecutiveFailures:c.failures, cooldownUntil:c.cooldownUntil, halfOpenInFlight:c.trialInFlight }; }
export function createControlledAIProvider(provider: AIProvider, storeId?: string, now=()=>Date.now()): AIProvider {
 const guarded=async<T>(call:()=>Promise<T>):Promise<T>=>{ const c=circuit(), p=readAiControlPolicy(), t=now(); if(c.trialInFlight) throw new AiUnavailableError("AI circuit trial in progress."); if(c.state==="OPEN"){if(t<c.cooldownUntil) throw new AiUnavailableError("AI circuit open."); c.state="HALF_OPEN";c.trialInFlight=true;} const global=await checkRateLimit("ai:global",{limit:p.globalRequestLimit,windowMs:p.usageWindowMs},t); const scoped=storeId?await checkRateLimit(`ai:store:${storeId}`,{limit:p.storeRequestLimit,windowMs:p.usageWindowMs},t):{allowed:true,retryAfterSeconds:0}; if(!global.allowed||!scoped.allowed){ if(c.state==="HALF_OPEN"){c.state="OPEN";c.cooldownUntil=t+p.circuitCooldownMs;c.trialInFlight=false;} throw new AiUnavailableError("AI usage temporarily unavailable."); } try { const v=await call(); c.failures=0; if(c.state==="HALF_OPEN"){c.state="CLOSED";c.trialInFlight=false;} return v; } catch(e){c.failures++; if(c.state==="HALF_OPEN"||c.failures>=p.circuitFailureThreshold){c.state="OPEN";c.cooldownUntil=t+p.circuitCooldownMs;c.trialInFlight=false;} throw e; } };
 return { id:provider.id, isAvailable:()=>provider.isAvailable(), unavailableReason:()=>provider.unavailableReason(), generatePerfumeProfile:(i:AiPerfumeProfileInput)=>guarded(()=>provider.generatePerfumeProfile(i)), generateRecommendationExplanation:(i:AiExplanationInput):Promise<AiExplanationResult>=>guarded(()=>provider.generateRecommendationExplanation(i)) };
}
