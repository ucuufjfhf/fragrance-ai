/**
 * Personality dimensions measured by the Phase 1 quiz.
 *
 * These are product-personalisation dimensions, NOT a psychological test.
 * Every dimension is normalised to a 0–100 range.
 */
export const PERSONALITY_DIMENSIONS = [
  "social",
  "adventurous",
  "expressive",
  "mysterious",
  "fresh",
  "warm",
  "experimental",
  "elegant",
  "bold",
] as const;

export type PersonalityDimension = (typeof PERSONALITY_DIMENSIONS)[number];

/** Normalised user vector: every dimension is between 0 and 100. */
export type PersonalityVector = Record<PersonalityDimension, number>;

/** Raw, deterministic per-answer scoring vector (unsigned deltas). */
export type AnswerScoringVector = Partial<Record<PersonalityDimension, number>>;

export type ArchetypeId =
  | "mysterious-explorer"
  | "clean-minimalist"
  | "charismatic"
  | "elegant-classic"
  | "free-spirit"
  | "romantic"
  | "bold-one"
  | "sophisticated";

/** Raw, un-normalised personality sums. Values may be negative. */
export type PersonalityScores = Record<PersonalityDimension, number>;

/** Achievable raw range of every dimension, derived from the quiz options. */
export type PersonalityBounds = Record<
  PersonalityDimension,
  { min: number; max: number }
>;

/** Internal archetype definition with its Persian user-facing wording. */
export interface Archetype {
  id: ArchetypeId;
  /** Internal English name (used in code/logging). */
  name: string;
  /** Persian user-facing name, e.g. «کاشف مرموز». */
  label: string;
  /** Short Persian description shown on the result screen. */
  description: string;
  /** Persian hint about the fragrance direction that fits this archetype. */
  fragranceHint: string;
  /** Single emoji used as the archetype badge. */
  emoji: string;
  /**
   * Canonical 0–100 profile this archetype stands for. Used only to label the
   * user's profile (nearest match) — never as a substitute for the full vector.
   */
  centroid: PersonalityVector;
}

export interface QuizAnswer {
  questionId: string;
  optionId: string;
}

/** One option of a quiz question, with its deterministic scoring vector. */
export interface QuizOption {
  id: string;
  label: string;
  vector: AnswerScoringVector;
}

export interface QuizQuestion {
  id: string;
  /** 1-based order used for the «سؤال ۳ از ۱۰» progress label. */
  order: number;
  prompt: string;
  options: QuizOption[];
}

/** Deterministic output of the personality scoring engine. */
export interface QuizResult {
  /** The answers that produced this profile, in question order. */
  answers: QuizAnswer[];
  /** Un-normalised sums — kept for tuning and debugging. */
  raw: PersonalityScores;
  /** Normalised 0–100 profile: the canonical user vector. */
  vector: PersonalityVector;
  archetype: Archetype;
}

/** `POST /api/quiz/submit` success payload. */
export interface QuizSubmitResponse {
  result: QuizResult;
}

/** `POST /api/quiz/submit` error payload (developer-facing reasons). */
export interface QuizSubmitErrorResponse {
  error: "INVALID_JSON" | "INVALID_ANSWERS";
  reason: string;
}
