// Seed the skill library with skills derived from this week's actual
// trajectories. These prove the loop end-to-end for User #2 right now:
// when a new user says "those are CC payments", the dismissAsNotIncome
// skill kicks in without anyone having to re-learn it.
//
// Run: VERCEL_TOKEN=... node scripts/seed-skills.mjs
// (server already deployed; this hits the admin endpoint.)
const BASE = process.env.E2E_BASE_URL ?? "https://buildtogether-v2.vercel.app";
const SECRET = process.env.E2E_SECRET;
if (!SECRET) { console.error("E2E_SECRET required"); process.exit(1); }

const sess = await fetch(`${BASE}/api/_e2e/issue-session`, {
  method: "POST",
  headers: { "x-e2e-secret": SECRET },
}).then((r) => r.json());

// Seeds derived from real successful trajectories this week. Each one
// generalizes from one user's case to anyone hitting the same pattern.
const SEEDS = [
  {
    name: "cc-payment-wash-dismiss",
    description:
      "When a recurring inflow is actually a credit-card payment wash (user pays card from checking → both accounts show the transaction), dismiss it from income suggestions instead of flagging it.",
    triggerPhrases: [
      "those are credit card payments",
      "that's me paying my visa",
      "stop flagging this as income",
      "dismiss the income suggestions",
      "those aren't real income",
      "credit card wash transactions",
    ],
    instructions: `When the user identifies a flagged recurring inflow as a credit-card payment wash (they pay their CC from a linked account, so the same transaction shows as both inflow and outflow):

1. Fire dismissAsNotIncome with the user's described source (or "all" if they're dismissing multiple at once).
2. Read the tool result: if dismissedCount > 0, confirm with the specific count and merchant. If dismissedCount = 0, explain honestly that the merchants weren't surfaced as candidates (they may already be correctly classified as transfers).
3. Briefly explain why: "wash transactions aren't new income — the money is just moving between your own accounts."
4. Do NOT use markPaymentToOwnCard for these — that tool targets outflows in 'loans' specifically. dismissAsNotIncome is the right surgical fix for the income-suggestion side.`,
    confidence: 0.85,
    status: "active",
  },
  {
    name: "monthly-cc-cadence-override",
    description:
      "When the annual_bill_upcoming detector misclassifies a monthly CC payment as semiannual/annual (common with sparse 13mo history), override the cadence to monthly so it stops surfacing as an upcoming surprise.",
    triggerPhrases: [
      "this hits every month",
      "that's a monthly payment not semiannual",
      "the visa preauth is monthly",
      "this is a monthly bill",
      "stop flagging this as upcoming",
      "fix the cadence on this",
    ],
    instructions: `When the user corrects a bill's detected cadence:

1. Fire setMerchantCadence with sourceName=<merchant they named> and cadence=<their correction>. Most commonly cadence='monthly' to silence a misclassified semiannual alert; cadence='never' is also valid if they want the bill to stop surfacing entirely.
2. Read the result. The override is keyed by merchant signature so it applies to all future occurrences from the same merchant automatically.
3. Confirm the change without bragging — "Got it. <merchant> is set to <cadence>; the upcoming-bills alert will stop firing for it." NEVER claim the change retroactively edits anything; it only affects future detection runs.`,
    confidence: 0.8,
    status: "active",
  },
  {
    name: "income-misclassified-as-transfer",
    description:
      "When the income_classification_gap detector finds recurring inflows tagged as transfer/credit_adjustment but the user confirms they're real income (paycheck variant, regular gift, side gig), reclassify retroactively.",
    triggerPhrases: [
      "<source> is my paycheck",
      "that deposit is my salary",
      "the inflow is real income",
      "yes that's income",
      "treat those as paychecks",
      "that's actual pay",
    ],
    instructions: `When the user confirms a flagged inflow is real income:

1. Fire flagAsIncome with sourceName=<the merchant they named>. The tool fuzzy-matches against plaid_transactions and retroactively flips ourCategory='income' for all matching rows.
2. Read the result. If reclassifiedCount > 0, confirm with the specific count + $ amount + how it changes their take-home. If 0, ask them for a more specific merchant name from their Spend page.
3. Note the projection swing: their projectedClose may have shifted significantly (often $5-15k) once the missing income is recognized. Surface that.`,
    confidence: 0.85,
    status: "active",
  },
  {
    name: "taxes-not-recurring",
    description:
      "When the user notices taxes are bucketed as 'recurring' on the home (default RECURRING_CATS includes 'taxes' historically), move them to 'one_off' so the decomposition doesn't lie about tax instalments being a monthly pattern.",
    triggerPhrases: [
      "taxes aren't recurring",
      "move taxes out of recurring",
      "taxes are one-off",
      "stop saying taxes are monthly",
      "tax instalment isn't a monthly pattern",
    ],
    instructions: `When the user disputes the home's recurring/one-off classification of a category:

1. Fire setCategoryBucket with the category they named (lowercased) and the bucket they want ('one_off' for taxes/fees, 'recurring' for loans/mortgage if their case warrants, etc.).
2. Read the result. The home's decomposition recomputes on next /api/tilly/today call; the user can pull-to-refresh to see the change.
3. Confirm explicitly: "Moved <category> to <new bucket>. The home will show it under '<new label>' on next refresh."`,
    confidence: 0.8,
    status: "active",
  },
  {
    name: "verify-screen-state-before-explaining",
    description:
      "Whenever the user asks about something on a screen ('why does my home show X', 'the spend page is wrong'), read the screenContext snapshot in the system context first — never apologize for not seeing the screen when the snapshot is right there.",
    triggerPhrases: [
      "why does my home say",
      "the spend page shows",
      "what's on my home",
      "the today screen",
      "this number is wrong",
      "what is this showing",
    ],
    instructions: `When the user asks a screen-specific question:

1. Look at the "What the user is looking at RIGHT NOW" block in your system context — it carries the current home monthly + forwardLook + heroNarrative + spend headline + category names + observations array.
2. Reference the actual rendered values, not generic explanations. If a number looks miscategorized in the snapshot, name what would fix it (setCategoryBucket, flagAsIncome, dismissAsNotIncome, setMerchantCadence) and offer to fire it.
3. NEVER say "I can't see your home screen" or "I don't have a live view" — the snapshot is right there. Saying you can't see it is a trust violation, even if the LLM defaults to it as a hedge.`,
    confidence: 0.9,
    status: "active",
  },
];

console.log(`Seeding ${SEEDS.length} skills via admin endpoint...`);

// Use the admin endpoint indirectly via a temporary internal route.
// Since seedSkills() needs embeddings + DB access, we hit a dedicated
// e2e seed endpoint (gated by secret).
const r = await fetch(`${BASE}/api/_e2e/seed-skills`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-e2e-secret": SECRET,
  },
  body: JSON.stringify({ seeds: SEEDS }),
});
const body = await r.text();
console.log("status:", r.status);
try {
  console.log(JSON.stringify(JSON.parse(body), null, 2));
} catch {
  console.log(body.slice(0, 1000));
}
