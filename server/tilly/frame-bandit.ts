/**
 * S5 — Frame bandit. Picks which behavioral-econ frame to use for the
 * next nudge to a given user, based on the outcome history in
 * tilly_nudges + a cold-start prior from the Ideas42 / Common Cents Lab
 * literature on under-25 financial nudges.
 *
 * Model: Beta-Bernoulli per (user, frame) with informed prior.
 *   alpha = priorAlpha + count(outcome='accepted')
 *   beta  = priorBeta  + count(outcome IN ('dismissed','ignored'))
 *   expected_accept = alpha / (alpha + beta)
 *
 * Selection: Thompson Sampling — sample from Beta(alpha, beta) for each
 * candidate frame, pick the argmax. This naturally trades exploration
 * for exploitation: high-variance frames get sampled higher sometimes.
 *
 * No separate state table — derived from tilly_nudges. Two queries per
 * pickFrame call, both indexed. At ~hundreds of nudges per user the
 * cost is negligible; if it ever isn't we materialize a state table.
 */
import { eq, and, sql, inArray } from "drizzle-orm";

import { db } from "../db";
import { tillyNudges } from "../../shared/schema";
import { FRAMES, type Frame } from "./nudge-log";

/**
 * Cold-start prior. Pseudo-counts to inject into Beta(alpha, beta) at
 * first call. Numbers are rough averages from Ideas42 "Nudging for
 * Financial Health" (2020) and Common Cents Lab annual reports for the
 * 18-25 cohort. Total prior weight = priorAlpha + priorBeta = 5 (light
 * — gets washed out within ~5 real observations per frame).
 */
const PRIOR: Record<Frame, { alpha: number; beta: number }> = {
  // Strong frames in the under-25 segment
  loss_aversion:           { alpha: 3.0, beta: 2.0 },
  implementation_intention:{ alpha: 3.0, beta: 2.0 },
  goal_gradient:           { alpha: 2.7, beta: 2.3 },
  fresh_start:             { alpha: 2.6, beta: 2.4 },
  pre_commitment:          { alpha: 2.5, beta: 2.5 },
  // Mid-strength
  default_taken:           { alpha: 2.4, beta: 2.6 },
  social_proof:            { alpha: 2.4, beta: 2.6 },
  mental_accounting:       { alpha: 2.3, beta: 2.7 },
  habit_loop:              { alpha: 2.3, beta: 2.7 },
  streak:                  { alpha: 2.2, beta: 2.8 },
  // Weaker / situational
  anchor:                  { alpha: 2.0, beta: 3.0 },
  endowment:               { alpha: 2.0, beta: 3.0 },
  sdt_autonomy:            { alpha: 2.2, beta: 2.8 },
  sdt_competence:          { alpha: 2.2, beta: 2.8 },
  present_bias:            { alpha: 1.8, beta: 3.2 }, // describing != countering
};

// ─── Beta sampling ─────────────────────────────────────────────────────────

/**
 * Sample from Gamma(shape, 1). Marsaglia & Tsang method (2000) for
 * shape >= 1; for shape < 1 use Johnk's algorithm. Both are exact in
 * the limit and good enough for bandit sampling.
 */
function sampleGamma(shape: number): number {
  if (shape < 1) {
    // Johnk: Gamma(s) for s<1 from Gamma(s+1) * U^(1/s)
    return sampleGamma(shape + 1) * Math.pow(Math.random(), 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  while (true) {
    let x: number;
    let v: number;
    do {
      // Standard normal via Box-Muller
      const u1 = Math.random();
      const u2 = Math.random();
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

function sampleBeta(alpha: number, beta: number): number {
  const x = sampleGamma(alpha);
  const y = sampleGamma(beta);
  return x / (x + y);
}

// ─── Stats ─────────────────────────────────────────────────────────────────

export interface FrameStats {
  frame: Frame;
  accepted: number;
  notAccepted: number; // dismissed + ignored
  pending: number;
  alpha: number;
  beta: number;
  expectedAccept: number;
}

/**
 * Read the per-frame outcome counts for a user, fold in the prior,
 * and return Beta(alpha, beta) parameters and posterior mean per frame.
 */
export async function getFrameStats(
  userId: string,
  candidateFrames: readonly Frame[] = FRAMES,
): Promise<FrameStats[]> {
  const rows = await db
    .select({
      frame: tillyNudges.frame,
      outcome: tillyNudges.outcome,
      count: sql<number>`count(*)::int`,
    })
    .from(tillyNudges)
    .where(
      and(
        eq(tillyNudges.userId, userId),
        inArray(tillyNudges.frame, candidateFrames as unknown as string[]),
      ),
    )
    .groupBy(tillyNudges.frame, tillyNudges.outcome);

  const stats = new Map<Frame, FrameStats>();
  for (const f of candidateFrames) {
    const p = PRIOR[f];
    stats.set(f, {
      frame: f,
      accepted: 0,
      notAccepted: 0,
      pending: 0,
      alpha: p.alpha,
      beta: p.beta,
      expectedAccept: p.alpha / (p.alpha + p.beta),
    });
  }
  for (const r of rows) {
    const s = stats.get(r.frame as Frame);
    if (!s) continue;
    if (r.outcome === "accepted") {
      s.accepted += r.count;
      s.alpha += r.count;
    } else if (r.outcome === "dismissed" || r.outcome === "ignored") {
      s.notAccepted += r.count;
      s.beta += r.count;
    } else {
      s.pending += r.count;
    }
  }
  // recompute expected after applying counts
  for (const s of stats.values()) {
    s.expectedAccept = s.alpha / (s.alpha + s.beta);
  }
  return Array.from(stats.values());
}

// ─── Picker ────────────────────────────────────────────────────────────────

export interface PickFrameOptions {
  /** Candidate frames to choose from. Defaults to all FRAMES. */
  candidates?: readonly Frame[];
  /** Force greedy (always pick max-expected). Default false (Thompson). */
  greedy?: boolean;
}

export interface PickFrameResult {
  frame: Frame;
  expectedAccept: number;
  /** Posterior samples by frame at decision time (for telemetry/debug). */
  samples?: Record<string, number>;
}

/**
 * Choose the frame for the next nudge to this user. Thompson Sampling
 * by default — naturally explores. Returns the picked frame and the
 * posterior samples that drove the choice (for the admin inspector).
 */
export async function pickFrame(
  userId: string,
  options: PickFrameOptions = {},
): Promise<PickFrameResult> {
  const candidates = (options.candidates ?? FRAMES) as readonly Frame[];
  const stats = await getFrameStats(userId, candidates);

  if (options.greedy) {
    let best = stats[0];
    for (const s of stats) {
      if (s.expectedAccept > best.expectedAccept) best = s;
    }
    return {
      frame: best.frame,
      expectedAccept: best.expectedAccept,
    };
  }

  // Thompson sample
  const samples: Record<string, number> = {};
  let best: { frame: Frame; sample: number; expected: number } | null = null;
  for (const s of stats) {
    const sample = sampleBeta(s.alpha, s.beta);
    samples[s.frame] = sample;
    if (!best || sample > best.sample) {
      best = { frame: s.frame, sample, expected: s.expectedAccept };
    }
  }
  return {
    frame: best!.frame,
    expectedAccept: best!.expected,
    samples,
  };
}
