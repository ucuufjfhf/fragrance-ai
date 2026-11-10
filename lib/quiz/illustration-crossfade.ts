/**
 * The question illustration crossfade, as a pure state machine.
 *
 * Two properties matter enough to be provable without a browser: the outgoing
 * scene is kept until the incoming artwork has actually loaded (so there is no
 * blank flash), and the stage can never stack more than two layers however fast
 * the shopper clicks next/back. The 600ms motion and the stacking order live in
 * CSS; this module only decides which question ids may be painted, and when the
 * one-shot fade is allowed to start.
 */

/** The crossfade's duration, mirrored by `.quiz-illustration-layer--swap`. */
export const ILLUSTRATION_CROSSFADE_MS = 600;

export interface IllustrationStage {
  /** The question whose artwork is on top — the incoming scene while fading. */
  current: string;
  /** The id whose artwork has finished loading (the painted one), if any. */
  loaded: string | null;
  /** The scene kept underneath while the incoming one fades in. */
  outgoing: string | null;
  /** True only while the incoming scene plays its one-shot fade. */
  fading: boolean;
}

export interface MotionPreference {
  reducedMotion: boolean;
}

/** A fresh mount: one scene, nothing underneath, nothing animating. */
export function initialIllustrationStage(current: string): IllustrationStage {
  return { current, loaded: null, outgoing: null, fading: false };
}

/** The ids to paint, bottom layer first. Never more than two. */
export function illustrationLayers(stage: IllustrationStage): string[] {
  return stage.outgoing !== null && stage.outgoing !== stage.current
    ? [stage.outgoing, stage.current]
    : [stage.current];
}

/**
 * Move to another question. The scene that is actually painted becomes the
 * outgoing layer; the incoming one starts invisible and only fades in once its
 * own artwork has loaded.
 *
 * With reduced motion — or with nothing painted yet, which is the first mount
 * and any screen that has no artwork — the swap is immediate and single-layered:
 * no stack, no scale, no fade.
 */
export function navigateIllustration(
  stage: IllustrationStage,
  nextId: string,
  motion: MotionPreference,
): IllustrationStage {
  if (nextId === stage.current) {
    return stage;
  }

  const painted = stage.loaded ?? stage.outgoing;
  if (motion.reducedMotion || painted === null || painted === nextId) {
    return { current: nextId, loaded: null, outgoing: null, fading: false };
  }

  return { current: nextId, loaded: null, outgoing: painted, fading: false };
}

/**
 * The incoming artwork's load event — the gate. Only now may the fade start, and
 * it starts only because there is something underneath to fade over. A load from
 * a layer that is no longer current is stale and ignored.
 */
export function loadedIllustration(
  stage: IllustrationStage,
  id: string,
  motion: MotionPreference,
): IllustrationStage {
  if (id !== stage.current) {
    return stage;
  }

  if (motion.reducedMotion || stage.outgoing === null || stage.outgoing === id) {
    return { current: stage.current, loaded: id, outgoing: null, fading: false };
  }

  return {
    current: stage.current,
    loaded: id,
    outgoing: stage.outgoing,
    fading: true,
  };
}

/** The fade finished: the outgoing scene can go. */
export function settledIllustration(
  stage: IllustrationStage,
  id: string,
): IllustrationStage {
  if (id !== stage.current || !stage.fading) {
    return stage;
  }

  return {
    current: stage.current,
    loaded: stage.loaded,
    outgoing: null,
    fading: false,
  };
}

/**
 * A failed decode must not pin an older scene on screen forever: the stale layer
 * is dropped and the current question is left on its own.
 */
export function failedIllustration(
  stage: IllustrationStage,
  id: string,
): IllustrationStage {
  if (id !== stage.current) {
    return stage;
  }

  return { current: stage.current, loaded: id, outgoing: null, fading: false };
}
