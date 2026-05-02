/**
 * Seed realistic 60-day demo data for a test couple so the Guardian has real
 * patterns to coach on. Runs directly against the Supabase DB via the API
 * layer (so auth + coupleId are honored).
 *
 * Usage:
 *   PROD_URL=https://buildtogether-v2.vercel.app \
 *   EMAIL=alex@v2-test.app PASS=Test12345! \
 *   npx tsx scripts/seed-demo-data.ts
 */

const PROD_URL = process.env.PROD_URL || "https://buildtogether-v2.vercel.app";
const EMAIL = process.env.EMAIL || "alex@v2-test.app";
const PASS = process.env.PASS || "Test12345!";

// ---- realistic merchant + category patterns by frequency ---------------------
type Pattern = {
  merchant: string;
  category: string;
  baseAmount: number;   // typical dollars
  variance: number;     // +/- range
  dailyChance?: number; // e.g. 0.3 = 30% of days
  weeklyChance?: number;
  biweekly?: boolean;
  monthly?: boolean;
};

const PATTERNS: Pattern[] = [
  // Daily-ish
  { merchant: "Starbucks", category: "restaurants", baseAmount: 6.5, variance: 1.5, dailyChance: 0.55 },
  { merchant: "Subway", category: "restaurants", baseAmount: 11, variance: 3, dailyChance: 0.12 },
  // Groceries — weekly
  { merchant: "Trader Joe's", category: "groceries", baseAmount: 95, variance: 25, weeklyChance: 0.85 },
  { merchant: "Whole Foods", category: "groceries", baseAmount: 140, variance: 40, weeklyChance: 0.35 },
  // Weekend dining
  { merchant: "Olive Garden", category: "restaurants", baseAmount: 68, variance: 20, weeklyChance: 0.4 },
  { merchant: "Shake Shack", category: "restaurants", baseAmount: 24, variance: 8, weeklyChance: 0.5 },
  // Transport
  { merchant: "Uber", category: "transport", baseAmount: 18, variance: 8, dailyChance: 0.2 },
  { merchant: "NJ Transit", category: "transport", baseAmount: 14.5, variance: 0, dailyChance: 0.35 },
  // Shopping — less frequent
  { merchant: "Target", category: "shopping", baseAmount: 65, variance: 40, weeklyChance: 0.4 },
  { merchant: "Amazon", category: "shopping", baseAmount: 42, variance: 30, weeklyChance: 0.8 },
  { merchant: "Costco", category: "groceries", baseAmount: 180, variance: 50, biweekly: true },
  // Entertainment
  { merchant: "AMC Theatres", category: "entertainment", baseAmount: 32, variance: 5, weeklyChance: 0.15 },
  { merchant: "Spotify", category: "subscriptions", baseAmount: 11.99, variance: 0, monthly: true },
  { merchant: "Netflix", category: "subscriptions", baseAmount: 15.49, variance: 0, monthly: true },
  // Bills
  { merchant: "Con Edison", category: "utilities", baseAmount: 145, variance: 30, monthly: true },
  { merchant: "Verizon", category: "utilities", baseAmount: 110, variance: 0, monthly: true },
  { merchant: "Spectrum", category: "utilities", baseAmount: 85, variance: 0, monthly: true },
  // Health
  { merchant: "CVS Pharmacy", category: "health", baseAmount: 28, variance: 15, weeklyChance: 0.3 },
  // Gifts — rare
  { merchant: "Etsy", category: "gifts", baseAmount: 45, variance: 20, weeklyChance: 0.08 },
];

const DREAMS = [
  { name: "Hawaii Vacation", emoji: "🌴", color: "#10B981", targetAmount: 5000, monthsOfSaving: 10 },
  { name: "Emergency Fund", emoji: "🛡️", color: "#6366F1", targetAmount: 10000, monthsOfSaving: 18 },
  { name: "New Couch", emoji: "🛋️", color: "#F59E0B", targetAmount: 1500, monthsOfSaving: 6 },
];

// ---- helpers ----------------------------------------------------------------

function jitter(base: number, variance: number): number {
  const v = (Math.random() - 0.5) * 2 * variance;
  return Math.round((base + v) * 100) / 100;
}

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function apiFetch(path: string, token: string, opts: RequestInit = {}) {
  const res = await fetch(`${PROD_URL}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText} on ${path}: ${text}`);
  }
  return res.json();
}

// ---- main -------------------------------------------------------------------

async function main() {
  console.log(`→ Seeding demo data for ${EMAIL} on ${PROD_URL}`);

  // 1. Login
  const login = await fetch(`${PROD_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASS }),
  }).then(r => r.json());

  if (!login.token) throw new Error(`Login failed: ${JSON.stringify(login)}`);
  const token = login.token;
  const coupleId = login.user.coupleId;
  console.log(`  ✓ Logged in. coupleId=${coupleId}`);

  // 2. Set family profile (adjusts benchmarks and tone)
  await apiFetch(`/api/family/${coupleId}`, token, {
    method: "PUT",
    body: JSON.stringify({
      numAdults: 2,
      numKidsUnder5: 0,
      numKids5to12: 0,
      numTeens: 0,
      city: "New York",
      country: "US",
    }),
  }).catch(e => console.log(`  ! family profile: ${e.message}`));
  console.log(`  ✓ Family profile: 2 adults, New York`);

  // 3. Generate budgets if not already there (API generates sensible defaults)
  await apiFetch(`/api/budgets/${coupleId}/generate`, token, {
    method: "POST",
    body: JSON.stringify({
      city: "New York",
      numAdults: 2,
      numKidsUnder5: 0,
      numKids5to12: 0,
      numTeens: 0,
    }),
  }).catch(e => console.log(`  ! budget generate: ${e.message}`));
  console.log(`  ✓ Budgets generated`);

  // 4. Create dreams with historical contributions
  const existingGoals = await apiFetch(`/api/goals/${coupleId}`, token).catch(() => []);
  if ((existingGoals as any[]).length < DREAMS.length) {
    for (const dream of DREAMS) {
      try {
        const created = await apiFetch(`/api/goals/${coupleId}`, token, {
          method: "POST",
          body: JSON.stringify({
            name: dream.name,
            emoji: dream.emoji,
            color: dream.color,
            targetAmount: dream.targetAmount,
          }),
        });
        // Add a realistic saved amount over past months
        const progressRatio = 0.15 + Math.random() * 0.5; // 15-65% progress
        const numContributions = Math.floor(dream.monthsOfSaving * progressRatio);
        for (let i = 0; i < numContributions; i++) {
          const amount = Math.round((dream.targetAmount / dream.monthsOfSaving) * (0.7 + Math.random() * 0.6));
          const daysAgo = Math.floor((dream.monthsOfSaving - i) * 30);
          const date = new Date();
          date.setDate(date.getDate() - daysAgo);
          await apiFetch(`/api/goals/${coupleId}/${(created as any).id}/contribute`, token, {
            method: "POST",
            body: JSON.stringify({
              amount,
              date: date.toISOString().split("T")[0],
              contributor: Math.random() > 0.5 ? "partner1" : "joint",
            }),
          }).catch(() => {});
        }
        console.log(`  ✓ Dream: ${dream.emoji} ${dream.name} (${numContributions} contributions)`);
      } catch (e: any) {
        console.log(`  ! dream ${dream.name}: ${e.message}`);
      }
    }
  } else {
    console.log(`  · Dreams already exist (${(existingGoals as any[]).length}), skipping`);
  }

  // 5. Generate 60 days of expenses matching the patterns
  console.log(`  → Generating 60 days of expenses…`);
  let count = 0;
  const today = new Date();
  for (let dayOffset = 60; dayOffset >= 0; dayOffset--) {
    const date = new Date(today);
    date.setDate(date.getDate() - dayOffset);
    const dateStr = date.toISOString().split("T")[0];
    const dow = date.getDay(); // 0=Sun
    const dayOfMonth = date.getDate();

    for (const p of PATTERNS) {
      let fire = false;
      if (p.dailyChance && Math.random() < p.dailyChance) fire = true;
      if (p.weeklyChance) {
        const isWeekend = dow === 0 || dow === 6;
        if (isWeekend && Math.random() < p.weeklyChance) fire = true;
        if (!isWeekend && Math.random() < p.weeklyChance * 0.3) fire = true;
      }
      if (p.biweekly && dayOffset % 14 === 3) fire = true;
      if (p.monthly && dayOfMonth === 5) fire = true;

      if (!fire) continue;

      const amount = jitter(p.baseAmount, p.variance);
      if (amount <= 0) continue;

      try {
        await apiFetch(`/api/expenses/${coupleId}`, token, {
          method: "POST",
          body: JSON.stringify({
            amount,
            description: p.merchant.toLowerCase().replace("'", "").split(" ")[0],
            merchant: p.merchant,
            category: p.category,
            date: dateStr,
            paidBy: Math.random() > 0.5 ? "partner1" : "joint",
            splitMethod: "joint",
          }),
        });
        count++;
      } catch (e: any) {
        // ignore individual failures
      }
    }
  }
  console.log(`  ✓ Created ${count} expenses across 60 days`);

  // 6. Final sync summary
  const sync = await apiFetch(`/api/sync/${coupleId}`, token);
  console.log(`\n✅ Done!`);
  console.log(`  Total expenses: ${(sync as any).expenses?.length}`);
  console.log(`  Total dreams:   ${(sync as any).goals?.length}`);
  console.log(`  Total saved:    $${((sync as any).goals || []).reduce((s: number, g: any) => s + g.savedAmount, 0).toFixed(0)}`);
  console.log(`\n→ Try it: ${PROD_URL}/app`);
}

main().catch(err => {
  console.error("Seed failed:", err);
  process.exit(1);
});
