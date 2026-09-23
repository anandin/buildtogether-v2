/**
 * Cash position for Today. Prefers a fresh Plaid balance read (cached
 * 12h on `cash_positions`), then the user's self-reported snapshot.
 * Aggregates only — checking/savings available, credit owed.
 */
import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { cashPositions, plaidItems, tillyMoneySnapshot } from "../../shared/schema";
import { decryptSecret } from "../security/crypto-fields";
import { getPlaidClient, isPlaidConfigured } from "../plaid";

export type CashSnapshot = {
  liquid: number | null;
  creditOwed: number | null;
  source: "plaid" | "self_report" | "none";
  asOf: string | null;
  accountCount: number;
};

const FRESH_MS = 12 * 60 * 60 * 1000;

async function selfReport(householdId: string): Promise<CashSnapshot | null> {
  const [row] = await db
    .select()
    .from(tillyMoneySnapshot)
    .where(eq(tillyMoneySnapshot.householdId, householdId))
    .orderBy(desc(tillyMoneySnapshot.createdAt))
    .limit(1);
  if (!row || row.currentBalance == null) return null;
  return {
    liquid: row.currentBalance,
    creditOwed: null,
    source: "self_report",
    asOf: row.createdAt.toISOString(),
    accountCount: 0,
  };
}

async function readStored(householdId: string): Promise<(CashSnapshot & { asOfMs: number }) | null> {
  const [row] = await db
    .select()
    .from(cashPositions)
    .where(eq(cashPositions.householdId, householdId))
    .limit(1);
  if (!row) return null;
  return {
    liquid: row.liquid,
    creditOwed: row.creditOwed,
    source: row.source === "plaid" || row.source === "self_report" ? row.source : "none",
    asOf: row.asOf.toISOString(),
    accountCount: row.accountCount,
    asOfMs: row.asOf.getTime(),
  };
}

async function refreshFromPlaid(householdId: string): Promise<CashSnapshot | null> {
  if (!isPlaidConfigured()) return null;
  const plaid = getPlaidClient();
  if (!plaid) return null;
  const items = await db.select().from(plaidItems).where(eq(plaidItems.coupleId, householdId));
  if (items.length === 0) return null;

  let liquid = 0;
  let creditOwed = 0;
  let accounts = 0;
  let sawDepository = false;
  let sawCredit = false;

  for (const item of items) {
    const resp = await plaid.accountsGet({
      access_token: decryptSecret(item.accessToken),
    });
    for (const acct of resp.data.accounts) {
      const current = acct.balances.current;
      const available = acct.balances.available;
      if (acct.type === "depository") {
        const value = available ?? current;
        if (typeof value === "number") {
          liquid += value;
          sawDepository = true;
          accounts += 1;
        }
      } else if (acct.type === "credit") {
        const owed = current ?? available;
        if (typeof owed === "number") {
          creditOwed += Math.abs(owed);
          sawCredit = true;
          accounts += 1;
        }
      }
    }
  }

  if (!sawDepository && !sawCredit) return null;
  const snapshot: CashSnapshot = {
    liquid: sawDepository ? Math.round(liquid * 100) / 100 : null,
    creditOwed: sawCredit ? Math.round(creditOwed * 100) / 100 : null,
    source: "plaid",
    asOf: new Date().toISOString(),
    accountCount: accounts,
  };
  await db
    .insert(cashPositions)
    .values({
      householdId,
      liquid: snapshot.liquid,
      creditOwed: snapshot.creditOwed,
      source: "plaid",
      accountCount: accounts,
      asOf: new Date(),
    })
    .onConflictDoUpdate({
      target: cashPositions.householdId,
      set: {
        liquid: snapshot.liquid,
        creditOwed: snapshot.creditOwed,
        source: "plaid",
        accountCount: accounts,
        asOf: new Date(),
      },
    });
  return snapshot;
}

export async function readCashPosition(householdId: string): Promise<CashSnapshot> {
  const empty: CashSnapshot = {
    liquid: null,
    creditOwed: null,
    source: "none",
    asOf: null,
    accountCount: 0,
  };
  try {
    const stored = await readStored(householdId);
    const fresh = stored && Date.now() - stored.asOfMs < FRESH_MS;
    if (fresh && stored.source === "plaid") {
      return stored;
    }
    try {
      const live = await refreshFromPlaid(householdId);
      if (live) return live;
    } catch (err) {
      console.warn("[cash-position] plaid refresh failed:", err);
      if (stored && stored.source === "plaid") return stored;
    }
    if (stored && stored.liquid != null) return stored;
    const reported = await selfReport(householdId);
    return reported ?? empty;
  } catch (err) {
    console.warn("[cash-position] read failed:", err);
    return empty;
  }
}
