const PROD_URL = "https://dream-finance.replit.app";

async function seedProduction() {
  console.log("=== Seeding Production Database ===\n");

  // Step 1: Register the test user
  console.log("1. Registering alex@test.com...");
  const registerRes = await fetch(`${PROD_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "alex@test.com",
      password: "Test123!",
      name: "Alex",
    }),
  });

  if (!registerRes.ok) {
    const err = await registerRes.json();
    if (err.error?.includes("already exists")) {
      console.log("   User already exists, trying to log in...");
      const loginRes = await fetch(`${PROD_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "alex@test.com", password: "Test123!" }),
      });
      if (!loginRes.ok) {
        console.error("   Failed to log in:", await loginRes.text());
        return;
      }
      var { token, user } = await loginRes.json();
      console.log(`   Logged in. CoupleId: ${user.coupleId}`);
    } else {
      console.error("   Registration failed:", err);
      return;
    }
  } else {
    var { token, user } = await registerRes.json();
    console.log(`   Registered! CoupleId: ${user.coupleId}`);
  }

  const coupleId = user.coupleId;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  // Step 2: Update couple info
  console.log("\n2. Updating couple profile...");
  await fetch(`${PROD_URL}/api/couple/${coupleId}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      partner1Name: "Alex",
      partner2Name: "Jordan",
      partner1Color: "#FF9AA2",
      partner2Color: "#C7CEEA",
      hasCompletedOnboarding: true,
    }),
  });

  await fetch(`${PROD_URL}/api/family/${coupleId}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      numAdults: 2,
      numKidsUnder5: 0,
      numKids5to12: 0,
      numTeens: 0,
      city: "San Francisco",
      country: "US",
    }),
  });
  console.log("   Done!");

  // Step 3: Create budgets
  console.log("\n3. Creating budgets...");
  const budgets = [
    { category: "groceries", monthlyLimit: 1200, budgetType: "recurring", alertThreshold: 80 },
    { category: "restaurants", monthlyLimit: 400, budgetType: "recurring", alertThreshold: 75 },
    { category: "entertainment", monthlyLimit: 200, budgetType: "recurring", alertThreshold: 80 },
    { category: "shopping", monthlyLimit: 300, budgetType: "rollover", alertThreshold: 80 },
    { category: "transport", monthlyLimit: 250, budgetType: "recurring", alertThreshold: 90 },
    { category: "utilities", monthlyLimit: 350, budgetType: "recurring", alertThreshold: 95 },
    { category: "health", monthlyLimit: 150, budgetType: "recurring", alertThreshold: 80 },
    { category: "personal", monthlyLimit: 200, budgetType: "recurring", alertThreshold: 75 },
  ];

  for (const b of budgets) {
    await fetch(`${PROD_URL}/api/budgets/${coupleId}`, {
      method: "POST",
      headers,
      body: JSON.stringify(b),
    });
  }
  console.log(`   Created ${budgets.length} budgets`);

  // Step 4: Create goals/dreams
  console.log("\n4. Creating dreams...");
  const goals = [
    { name: "Hawaii Vacation", targetAmount: 5000, emoji: "🏝️", color: "#4ECDC4", targetDate: "2026-08-01", whyItMatters: "Our first big trip together" },
    { name: "Emergency Fund", targetAmount: 10000, emoji: "🛡️", color: "#FFB347", whyItMatters: "Peace of mind for our future" },
    { name: "New Couch", targetAmount: 1500, emoji: "🛋️", color: "#C7CEEA", targetDate: "2026-06-01", whyItMatters: "Our living room deserves an upgrade" },
  ];

  const goalIds: string[] = [];
  for (const g of goals) {
    const res = await fetch(`${PROD_URL}/api/goals/${coupleId}`, {
      method: "POST",
      headers,
      body: JSON.stringify(g),
    });
    const created = await res.json();
    goalIds.push(created.id);
    console.log(`   Created: ${g.name} (${created.id})`);
  }

  // Step 5: Add goal contributions
  console.log("\n5. Adding goal contributions...");
  const contributions = [
    // Hawaii Vacation contributions
    { goalId: goalIds[0], amount: 200, date: "2025-08-01", contributor: "Alex" },
    { goalId: goalIds[0], amount: 150, date: "2025-08-15", contributor: "Jordan" },
    { goalId: goalIds[0], amount: 300, date: "2025-09-01", contributor: "Alex" },
    { goalId: goalIds[0], amount: 200, date: "2025-09-15", contributor: "Jordan" },
    { goalId: goalIds[0], amount: 250, date: "2025-10-01", contributor: "Alex" },
    { goalId: goalIds[0], amount: 300, date: "2025-10-15", contributor: "Jordan" },
    { goalId: goalIds[0], amount: 200, date: "2025-11-01", contributor: "Alex" },
    { goalId: goalIds[0], amount: 250, date: "2025-11-15", contributor: "Jordan" },
    { goalId: goalIds[0], amount: 316, date: "2025-12-01", contributor: "Alex" },
    { goalId: goalIds[0], amount: 200, date: "2026-01-01", contributor: "Jordan" },
    { goalId: goalIds[0], amount: 300, date: "2026-01-15", contributor: "Alex" },
    { goalId: goalIds[0], amount: 200, date: "2026-02-01", contributor: "Jordan" },
    // Emergency Fund contributions
    { goalId: goalIds[1], amount: 500, date: "2025-08-01", contributor: "Alex" },
    { goalId: goalIds[1], amount: 500, date: "2025-09-01", contributor: "Jordan" },
    { goalId: goalIds[1], amount: 400, date: "2025-10-01", contributor: "Alex" },
    { goalId: goalIds[1], amount: 500, date: "2025-11-01", contributor: "Jordan" },
    { goalId: goalIds[1], amount: 500, date: "2025-12-01", contributor: "Alex" },
    { goalId: goalIds[1], amount: 515, date: "2026-01-01", contributor: "Jordan" },
    { goalId: goalIds[1], amount: 500, date: "2026-01-15", contributor: "Alex" },
    { goalId: goalIds[1], amount: 500, date: "2026-02-01", contributor: "Alex" },
    { goalId: goalIds[1], amount: 500, date: "2026-02-10", contributor: "Jordan" },
    // Couch contributions
    { goalId: goalIds[2], amount: 150, date: "2025-09-15", contributor: "Alex" },
    { goalId: goalIds[2], amount: 200, date: "2025-10-15", contributor: "Jordan" },
    { goalId: goalIds[2], amount: 150, date: "2025-11-15", contributor: "Alex" },
    { goalId: goalIds[2], amount: 200, date: "2025-12-15", contributor: "Jordan" },
    { goalId: goalIds[2], amount: 100, date: "2026-01-15", contributor: "Alex" },
    { goalId: goalIds[2], amount: 90, date: "2026-02-05", contributor: "Jordan" },
  ];

  for (const c of contributions) {
    await fetch(`${PROD_URL}/api/goals/${coupleId}/${c.goalId}/contribute`, {
      method: "POST",
      headers,
      body: JSON.stringify({ amount: c.amount, date: c.date, contributor: c.contributor }),
    });
  }
  console.log(`   Added ${contributions.length} contributions`);

  // Step 6: Add expenses (lots of realistic ones)
  console.log("\n6. Adding expenses...");
  const expenses = [
    // December 2025
    { amount: 95.00, description: "Weekly groceries", merchant: "Trader Joes", category: "groceries", date: "2025-12-01", paidBy: "Alex" },
    { amount: 45.00, description: "Gas fill up", merchant: "Shell", category: "transport", date: "2025-12-01", paidBy: "Alex" },
    { amount: 62.00, description: "Dinner date", merchant: "Olive Garden", category: "restaurants", date: "2025-12-02", paidBy: "Jordan" },
    { amount: 8.50, description: "Morning coffee", merchant: "Starbucks", category: "restaurants", date: "2025-12-03", paidBy: "Alex" },
    { amount: 156.00, description: "Electric bill", merchant: "City Power", category: "utilities", date: "2025-12-04", paidBy: "Alex" },
    { amount: 65.00, description: "Internet bill", merchant: "Comcast", category: "utilities", date: "2025-12-04", paidBy: "Alex" },
    { amount: 120.00, description: "Groceries for the week", merchant: "Whole Foods", category: "groceries", date: "2025-12-06", paidBy: "Jordan" },
    { amount: 35.00, description: "Movie tickets", merchant: "AMC", category: "entertainment", date: "2025-12-07", paidBy: "Alex" },
    { amount: 8.50, description: "Latte", merchant: "Starbucks", category: "restaurants", date: "2025-12-08", paidBy: "Alex" },
    { amount: 42.00, description: "Uber ride", merchant: "Uber", category: "transport", date: "2025-12-09", paidBy: "Jordan" },
    { amount: 88.00, description: "Groceries", merchant: "Trader Joes", category: "groceries", date: "2025-12-10", paidBy: "Alex" },
    { amount: 55.00, description: "New book set", merchant: "Barnes Noble", category: "personal", date: "2025-12-11", paidBy: "Jordan" },
    { amount: 8.50, description: "Coffee", merchant: "Starbucks", category: "restaurants", date: "2025-12-12", paidBy: "Alex" },
    { amount: 75.00, description: "Concert tickets", merchant: "Ticketmaster", category: "entertainment", date: "2025-12-13", paidBy: "Alex" },
    { amount: 110.00, description: "Weekly groceries", merchant: "Costco", category: "groceries", date: "2025-12-14", paidBy: "Jordan" },
    { amount: 45.00, description: "Gas", merchant: "Chevron", category: "transport", date: "2025-12-15", paidBy: "Alex" },
    { amount: 8.50, description: "Morning latte", merchant: "Starbucks", category: "restaurants", date: "2025-12-16", paidBy: "Alex" },
    { amount: 85.00, description: "Holiday dinner", merchant: "Red Lobster", category: "restaurants", date: "2025-12-17", paidBy: "Jordan" },
    { amount: 150.00, description: "Christmas gifts", merchant: "Target", category: "shopping", date: "2025-12-18", paidBy: "Alex" },
    { amount: 89.00, description: "More gifts", merchant: "Amazon", category: "shopping", date: "2025-12-19", paidBy: "Jordan" },
    { amount: 8.50, description: "Coffee", merchant: "Starbucks", category: "restaurants", date: "2025-12-20", paidBy: "Alex" },
    { amount: 130.00, description: "Holiday groceries", merchant: "Whole Foods", category: "groceries", date: "2025-12-22", paidBy: "Alex" },
    { amount: 25.00, description: "Wrapping supplies", merchant: "Dollar Tree", category: "shopping", date: "2025-12-23", paidBy: "Jordan" },
    { amount: 35.00, description: "Christmas Eve dinner", merchant: "Chipotle", category: "restaurants", date: "2025-12-24", paidBy: "Alex" },
    { amount: 200.00, description: "Christmas brunch", merchant: "The Cheesecake Factory", category: "restaurants", date: "2025-12-25", paidBy: "Jordan" },
    { amount: 45.00, description: "Post-holiday gas", merchant: "Shell", category: "transport", date: "2025-12-27", paidBy: "Alex" },
    { amount: 8.50, description: "Coffee", merchant: "Starbucks", category: "restaurants", date: "2025-12-29", paidBy: "Alex" },
    { amount: 95.00, description: "Groceries", merchant: "Trader Joes", category: "groceries", date: "2025-12-30", paidBy: "Jordan" },
    // January 2026
    { amount: 12.99, description: "Spotify Premium", merchant: "Spotify", category: "entertainment", date: "2026-01-01", paidBy: "Jordan" },
    { amount: 15.99, description: "Netflix", merchant: "Netflix", category: "entertainment", date: "2026-01-01", paidBy: "Alex" },
    { amount: 45.00, description: "Gym membership", merchant: "LA Fitness", category: "health", date: "2026-01-01", paidBy: "Alex" },
    { amount: 105.00, description: "New year groceries", merchant: "Whole Foods", category: "groceries", date: "2026-01-02", paidBy: "Alex" },
    { amount: 8.50, description: "Coffee", merchant: "Starbucks", category: "restaurants", date: "2026-01-03", paidBy: "Alex" },
    { amount: 55.00, description: "New Year dinner", merchant: "PF Changs", category: "restaurants", date: "2026-01-03", paidBy: "Jordan" },
    { amount: 156.00, description: "Electric bill", merchant: "City Power", category: "utilities", date: "2026-01-05", paidBy: "Alex" },
    { amount: 65.00, description: "Internet bill", merchant: "Comcast", category: "utilities", date: "2026-01-05", paidBy: "Alex" },
    { amount: 38.00, description: "Gas", merchant: "Shell", category: "transport", date: "2026-01-06", paidBy: "Alex" },
    { amount: 92.00, description: "Weekly groceries", merchant: "Trader Joes", category: "groceries", date: "2026-01-07", paidBy: "Jordan" },
    { amount: 8.50, description: "Morning latte", merchant: "Starbucks", category: "restaurants", date: "2026-01-08", paidBy: "Alex" },
    { amount: 35.00, description: "Yoga class pack", merchant: "CorePower Yoga", category: "health", date: "2026-01-08", paidBy: "Jordan" },
    { amount: 25.00, description: "Amazon order", merchant: "Amazon", category: "shopping", date: "2026-01-09", paidBy: "Alex" },
    { amount: 48.00, description: "Lunch date", merchant: "Panera Bread", category: "restaurants", date: "2026-01-10", paidBy: "Jordan" },
    { amount: 88.00, description: "Groceries", merchant: "Trader Joes", category: "groceries", date: "2026-01-12", paidBy: "Alex" },
    { amount: 8.50, description: "Coffee", merchant: "Starbucks", category: "restaurants", date: "2026-01-13", paidBy: "Alex" },
    { amount: 22.00, description: "Movie night", merchant: "AMC", category: "entertainment", date: "2026-01-14", paidBy: "Alex" },
    { amount: 42.00, description: "Gas fill up", merchant: "Chevron", category: "transport", date: "2026-01-15", paidBy: "Jordan" },
    { amount: 115.00, description: "Weekly groceries", merchant: "Costco", category: "groceries", date: "2026-01-16", paidBy: "Alex" },
    { amount: 8.50, description: "Latte", merchant: "Starbucks", category: "restaurants", date: "2026-01-17", paidBy: "Alex" },
    { amount: 65.00, description: "New workout gear", merchant: "Nike", category: "shopping", date: "2026-01-18", paidBy: "Jordan" },
    { amount: 55.00, description: "Date night dinner", merchant: "Olive Garden", category: "restaurants", date: "2026-01-18", paidBy: "Alex" },
    { amount: 30.00, description: "Uber ride", merchant: "Uber", category: "transport", date: "2026-01-19", paidBy: "Jordan" },
    { amount: 98.00, description: "Groceries", merchant: "Whole Foods", category: "groceries", date: "2026-01-20", paidBy: "Jordan" },
    { amount: 8.50, description: "Coffee", merchant: "Starbucks", category: "restaurants", date: "2026-01-21", paidBy: "Alex" },
    { amount: 19.99, description: "Kindle book", merchant: "Amazon", category: "personal", date: "2026-01-22", paidBy: "Jordan" },
    { amount: 75.00, description: "Phone bill", merchant: "T-Mobile", category: "utilities", date: "2026-01-23", paidBy: "Alex" },
    { amount: 90.00, description: "Groceries", merchant: "Trader Joes", category: "groceries", date: "2026-01-25", paidBy: "Alex" },
    { amount: 8.50, description: "Morning coffee", merchant: "Starbucks", category: "restaurants", date: "2026-01-26", paidBy: "Alex" },
    { amount: 42.00, description: "Brunch", merchant: "The Breakfast Club", category: "restaurants", date: "2026-01-27", paidBy: "Jordan" },
    { amount: 15.00, description: "Amazon order", merchant: "Amazon", category: "shopping", date: "2026-01-28", paidBy: "Alex" },
    { amount: 38.00, description: "Gas", merchant: "Shell", category: "transport", date: "2026-01-29", paidBy: "Alex" },
    { amount: 105.00, description: "Weekly groceries", merchant: "Costco", category: "groceries", date: "2026-01-30", paidBy: "Jordan" },
    // February 2026
    { amount: 12.99, description: "Spotify Premium", merchant: "Spotify", category: "entertainment", date: "2026-02-01", paidBy: "Jordan" },
    { amount: 15.99, description: "Netflix", merchant: "Netflix", category: "entertainment", date: "2026-02-01", paidBy: "Alex" },
    { amount: 45.00, description: "Gym membership", merchant: "LA Fitness", category: "health", date: "2026-02-01", paidBy: "Alex" },
    { amount: 89.50, description: "Weekly groceries", merchant: "Trader Joes", category: "groceries", date: "2026-02-02", paidBy: "Alex" },
    { amount: 45.00, description: "Gas fill up", merchant: "Shell Station", category: "transport", date: "2026-02-03", paidBy: "Alex" },
    { amount: 28.75, description: "Lunch together", merchant: "Panera Bread", category: "restaurants", date: "2026-02-03", paidBy: "Jordan" },
    { amount: 156.00, description: "Electric bill", merchant: "City Power", category: "utilities", date: "2026-02-04", paidBy: "Alex" },
    { amount: 8.50, description: "Morning coffee", merchant: "Starbucks", category: "restaurants", date: "2026-02-04", paidBy: "Alex" },
    { amount: 67.30, description: "New running shoes sale", merchant: "Nike Outlet", category: "shopping", date: "2026-02-05", paidBy: "Jordan" },
    { amount: 22.00, description: "Movie night", merchant: "AMC Theaters", category: "entertainment", date: "2026-02-05", paidBy: "Alex" },
    { amount: 115.40, description: "Groceries for the week", merchant: "Whole Foods", category: "groceries", date: "2026-02-06", paidBy: "Jordan" },
    { amount: 35.00, description: "Yoga class pack", merchant: "CorePower Yoga", category: "health", date: "2026-02-06", paidBy: "Jordan" },
    { amount: 52.80, description: "Dinner out", merchant: "Olive Garden", category: "restaurants", date: "2026-02-07", paidBy: "Alex" },
    { amount: 42.00, description: "Saturday brunch", merchant: "The Breakfast Club", category: "restaurants", date: "2026-02-08", paidBy: "Jordan" },
    { amount: 78.50, description: "Home supplies", merchant: "Target", category: "shopping", date: "2026-02-08", paidBy: "Alex" },
    { amount: 95.00, description: "Weekly groceries", merchant: "Trader Joes", category: "groceries", date: "2026-02-09", paidBy: "Alex" },
    { amount: 29.99, description: "New book", merchant: "Barnes Noble", category: "personal", date: "2026-02-09", paidBy: "Jordan" },
    { amount: 65.00, description: "Internet bill", merchant: "Comcast", category: "utilities", date: "2026-02-10", paidBy: "Alex" },
    { amount: 8.50, description: "Coffee run", merchant: "Starbucks", category: "restaurants", date: "2026-02-10", paidBy: "Alex" },
    { amount: 38.00, description: "Uber ride", merchant: "Uber", category: "transport", date: "2026-02-10", paidBy: "Jordan" },
    { amount: 125.00, description: "Valentines dinner deposit", merchant: "The French Laundry", category: "restaurants", date: "2026-02-11", paidBy: "Alex" },
    { amount: 8.50, description: "Morning latte", merchant: "Starbucks", category: "restaurants", date: "2026-02-12", paidBy: "Alex" },
    { amount: 34.50, description: "Gas", merchant: "Chevron", category: "transport", date: "2026-02-12", paidBy: "Jordan" },
    { amount: 19.99, description: "Phone case", merchant: "Amazon", category: "shopping", date: "2026-02-12", paidBy: "Alex" },
    { amount: 110.00, description: "Weekly groceries", merchant: "Costco", category: "groceries", date: "2026-02-13", paidBy: "Alex" },
    { amount: 55.00, description: "Flowers for Valentine", merchant: "Local Florist", category: "personal", date: "2026-02-13", paidBy: "Alex" },
    { amount: 8.50, description: "Coffee", merchant: "Starbucks", category: "restaurants", date: "2026-02-13", paidBy: "Alex" },
    { amount: 185.00, description: "Valentines dinner", merchant: "The French Laundry", category: "restaurants", date: "2026-02-14", paidBy: "Alex" },
    { amount: 42.00, description: "Valentines chocolates", merchant: "Godiva", category: "personal", date: "2026-02-14", paidBy: "Jordan" },
    { amount: 25.00, description: "Uber to restaurant", merchant: "Uber", category: "transport", date: "2026-02-14", paidBy: "Alex" },
    { amount: 8.50, description: "Morning coffee", merchant: "Starbucks", category: "restaurants", date: "2026-02-15", paidBy: "Alex" },
    { amount: 92.00, description: "Groceries", merchant: "Trader Joes", category: "groceries", date: "2026-02-15", paidBy: "Jordan" },
    { amount: 15.00, description: "Parking", merchant: "City Parking", category: "transport", date: "2026-02-15", paidBy: "Alex" },
  ];

  let expCount = 0;
  for (const e of expenses) {
    const res = await fetch(`${PROD_URL}/api/expenses/${coupleId}`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        ...e,
        splitMethod: "equal",
        splitRatio: 0.5,
        isRecurring: false,
      }),
    });
    if (res.ok) expCount++;
    else {
      const err = await res.text();
      console.error(`   Failed expense: ${e.description} - ${err}`);
    }
  }
  console.log(`   Added ${expCount}/${expenses.length} expenses`);

  console.log("\n=== Production Seed Complete! ===");
  console.log(`\nLogin credentials:`);
  console.log(`  Email: alex@test.com`);
  console.log(`  Password: Test123!`);
  console.log(`  CoupleId: ${coupleId}`);
}

seedProduction().catch(console.error);
