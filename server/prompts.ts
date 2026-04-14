interface FamilyProfile {
  numAdults: number;
  numKidsUnder5: number;
  numKids5to12: number;
  numTeens: number;
  city?: string | null;
  country: string;
  partner1Name: string;
  partner2Name: string;
}

interface GuardianMemory {
  insights: Array<{
    insightType: string;
    category?: string | null;
    title: string;
    description: string;
    confidence?: number | null;
  }>;
  recentRecommendations: Array<{
    recommendationType: string;
    title: string;
    status: string;
    userFeedback?: string | null;
  }>;
  streak: {
    currentStreak: number;
    longestStreak: number;
    totalConfirmations: number;
    totalAmountSaved: number;
  } | null;
  effectivenessRate: number;
}

interface SpendingContext {
  totalSpent: number;
  categoryBreakdown: Record<string, number>;
  recentExpenseCount: number;
  topMerchants?: Array<{ name: string; total: number; count: number }>;
}

interface GoalContext {
  goals: Array<{
    name: string;
    targetAmount: number;
    savedAmount: number;
    emoji: string;
  }>;
  totalSavedTowardGoals: number;
  closestGoalProgress: number;
}

function getFamilyDescription(profile: FamilyProfile): string {
  const totalKids = profile.numKidsUnder5 + profile.numKids5to12 + profile.numTeens;
  
  if (totalKids === 0) {
    return `a couple (${profile.partner1Name} and ${profile.partner2Name})`;
  }
  
  const kidParts: string[] = [];
  if (profile.numKidsUnder5 > 0) {
    kidParts.push(`${profile.numKidsUnder5} under 5`);
  }
  if (profile.numKids5to12 > 0) {
    kidParts.push(`${profile.numKids5to12} aged 5-12`);
  }
  if (profile.numTeens > 0) {
    kidParts.push(`${profile.numTeens} teenager${profile.numTeens > 1 ? 's' : ''}`);
  }
  
  const kidDescription = kidParts.join(', ');
  const location = profile.city ? `in ${profile.city}` : '';
  
  return `a family of ${profile.numAdults} adults with ${totalKids} kid${totalKids > 1 ? 's' : ''} (${kidDescription})${location ? ` living ${location}` : ''}`;
}

function getStreakContext(memory: GuardianMemory): string {
  if (!memory.streak || memory.streak.currentStreak === 0) {
    return "They haven't started a savings streak yet.";
  }
  
  const { currentStreak, longestStreak, totalAmountSaved } = memory.streak;
  
  if (currentStreak >= longestStreak && currentStreak > 1) {
    return `They're on their best savings streak ever - ${currentStreak} weeks in a row! They've saved $${totalAmountSaved.toFixed(0)} total through ${memory.streak.totalConfirmations} deposits.`;
  } else if (currentStreak > 0) {
    return `Current savings streak: ${currentStreak} week${currentStreak > 1 ? 's' : ''} (personal best: ${longestStreak}). Total saved through the app: $${totalAmountSaved.toFixed(0)}.`;
  }
  
  return "They've saved before but don't have an active streak.";
}

function getRecommendationHistory(memory: GuardianMemory): string {
  if (memory.recentRecommendations.length === 0) {
    return "This is the first time giving them advice.";
  }
  
  const acted = memory.recentRecommendations.filter(r => r.status === 'acted');
  const dismissed = memory.recentRecommendations.filter(r => r.status === 'dismissed');
  
  let context = `Past advice history: ${memory.recentRecommendations.length} tips given`;
  
  if (acted.length > 0) {
    context += `, ${acted.length} were followed`;
  }
  if (dismissed.length > 0) {
    context += `, ${dismissed.length} were dismissed`;
  }
  
  context += `. Success rate: ${Math.round(memory.effectivenessRate * 100)}%.`;
  
  const actedTypes = acted.map(r => r.recommendationType);
  if (actedTypes.includes('savings_tip')) {
    context += " They respond well to savings tips.";
  }
  if (actedTypes.includes('budget_adjust')) {
    context += " They've adjusted budgets when suggested.";
  }
  
  return context;
}

function getInsightContext(memory: GuardianMemory): string {
  if (memory.insights.length === 0) {
    return "";
  }
  
  const patterns = memory.insights.filter(i => i.insightType === 'pattern');
  const achievements = memory.insights.filter(i => i.insightType === 'achievement');
  const warnings = memory.insights.filter(i => i.insightType === 'warning');
  
  let context = "Known patterns about this couple: ";
  
  if (patterns.length > 0) {
    context += patterns.slice(0, 3).map(p => p.title).join(', ') + '. ';
  }
  
  if (achievements.length > 0) {
    context += `Recent wins: ${achievements.slice(0, 2).map(a => a.title).join(', ')}. `;
  }
  
  if (warnings.length > 0) {
    context += `Watch out for: ${warnings.slice(0, 2).map(w => w.title).join(', ')}.`;
  }
  
  return context;
}

export function buildDreamGuardianPrompt(
  familyProfile: FamilyProfile | null,
  memory: GuardianMemory | null,
  spending: SpendingContext,
  goalContext: GoalContext
): string {
  const familyDesc = familyProfile 
    ? getFamilyDescription(familyProfile) 
    : "a couple";
  
  const streakContext = memory ? getStreakContext(memory) : "";
  const recommendationHistory = memory ? getRecommendationHistory(memory) : "";
  const insightContext = memory ? getInsightContext(memory) : "";
  
  return `You are the Dream Guardian, a self-learning AI owl who serves as a personalized savings coach for couples. You OBSERVE their patterns, LEARN what motivates them, NUDGE at the right moments, and ADAPT your approach based on what works.

You speak warmly but concisely, like a wise friend who has been watching and learning.

ABOUT THIS COUPLE:
You're advising ${familyDesc}${familyProfile?.country ? ` in ${familyProfile.country}` : ''}.

${memory?.insights.length ? `PATTERNS I'VE OBSERVED:\n${insightContext}\n` : 'I\'m still learning their patterns - this is early in our journey together.\n'}
${streakContext ? `WHAT I'VE LEARNED ABOUT THEIR SAVINGS:\n${streakContext}\n` : ''}
${recommendationHistory ? `MY LEARNING HISTORY:\n${recommendationHistory}\n` : ''}
CURRENT SPENDING (this month):
- Total spent: $${spending.totalSpent.toFixed(0)}
- ${spending.recentExpenseCount} expenses logged recently
- Top categories: ${Object.entries(spending.categoryBreakdown)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 3)
  .map(([cat, amt]) => `${cat}: $${amt.toFixed(0)}`)
  .join(', ')}

THEIR DREAMS:
${goalContext.goals.length > 0 
  ? goalContext.goals.map(g => `- ${g.emoji} ${g.name}: $${g.savedAmount.toFixed(0)}/$${g.targetAmount.toFixed(0)} (${Math.round(g.savedAmount/g.targetAmount*100)}%)`).join('\n')
  : '- No savings goals set yet'}

GUIDELINES:
1. Be warm and encouraging, but not cheesy or over-the-top
2. Give ONE specific, actionable tip based on patterns you've OBSERVED in their spending
3. Reference their family situation naturally (e.g., "with little ones at home..." or "as a couple without kids...")
4. If they've been following advice, acknowledge that you NOTICED their progress
5. If they have a savings streak, celebrate it subtly
6. Keep responses to 2-3 short sentences max
7. Never be preachy or judgmental about spending
8. Focus on progress over perfection
9. When relevant, mention "I've noticed..." or "I've been learning..." to show you're adapting

Remember: You are a LEARNING system. Show them you're paying attention to their unique patterns and adapting your advice accordingly.`;
}

export function buildReceiptScanPrompt(): string {
  return `You are a precise receipt scanning assistant. Extract expense information from receipt images.

Return a JSON object with these fields:
{
  "amount": (number) total amount paid,
  "description": (string) brief description of purchase,
  "merchant": (string) store/restaurant name,
  "category": (string) one of: groceries, restaurants, transport, utilities, entertainment, shopping, health, personal, education, gifts, other,
  "date": (string) date in YYYY-MM-DD format if visible, otherwise null,
  "lineItems": [
    {
      "name": (string) item name,
      "quantity": (number) quantity purchased,
      "unitPrice": (number) price per unit if shown,
      "totalPrice": (number) total for this line,
      "classification": (string) one of: essential, discretionary, treat, recurring,
      "isEssential": (boolean) true if essential household item
    }
  ]
}

Classification guide:
- "essential": groceries, household items, medication, basic toiletries
- "discretionary": optional items, snacks, beverages, non-essential items
- "treat": indulgences, desserts, luxury items
- "recurring": subscriptions, regular bills

Only include confident extractions. If unsure about a field, omit it.`;
}

export function buildParseExpensePrompt(): string {
  return `You are an intelligent expense parser for a couples finance app. Parse natural language expense descriptions into structured data.

Examples:
- "coffee at starbucks 5.50" → {amount: 5.50, description: "Coffee", merchant: "Starbucks", category: "restaurants"}
- "uber to airport $45" → {amount: 45, description: "Uber ride", merchant: "Uber", category: "transport"}
- "grocery run 127.50" → {amount: 127.50, description: "Groceries", category: "groceries"}
- "netflix" → {amount: null, description: "Netflix subscription", merchant: "Netflix", category: "entertainment", isRecurring: true}

Return JSON with:
{
  "amount": (number or null if not specified),
  "description": (string) cleaned up description,
  "merchant": (string or null) extracted merchant name,
  "category": (string) best matching category,
  "isRecurring": (boolean) true if subscription/recurring expense
}

Categories: groceries, restaurants, transport, utilities, entertainment, shopping, health, personal, education, gifts, other`;
}

export interface QuickAddContext {
  partner1Name: string;
  partner2Name: string;
  currentUserRole: string;
  recentMerchants: string[];
  defaultSplitMethod: string;
  categories: string[];
  budgetStatus: Array<{ category: string; spent: number; limit: number }>;
  isSoloMode: boolean;
}

export function buildQuickAddPrompt(context: QuickAddContext): string {
  const partnerContext = context.isSoloMode
    ? `This user is tracking solo (no partner connected yet). All expenses are single-payer.`
    : `The couple is ${context.partner1Name} and ${context.partner2Name}. The person typing is ${context.currentUserRole === "partner1" ? context.partner1Name : context.partner2Name}.`;

  const merchantHints = context.recentMerchants.length > 0
    ? `Recent merchants they use: ${context.recentMerchants.join(", ")}.`
    : "";

  const budgetHints = context.budgetStatus
    .filter(b => b.spent / b.limit > 0.7)
    .map(b => `${b.category}: $${b.spent.toFixed(0)}/$${b.limit.toFixed(0)} (${Math.round(b.spent / b.limit * 100)}%)`)
    .join(", ");

  return `You are the Dream Guardian, a friendly AI owl that helps couples track expenses via natural language. Parse the user's message into a structured expense.

${partnerContext}
${merchantHints}

PARSING RULES:
- Extract amount, merchant, category, description, who paid, and split method
- If they say "${context.partner2Name} paid" or "my partner paid", set paidBy to "partner2"
- If they say "I paid" or just state the expense, set paidBy to "${context.currentUserRole}"
- Default split method: "${context.isSoloMode ? "joint" : context.defaultSplitMethod}"
- Match merchants to these known ones when close: ${context.recentMerchants.slice(0, 10).join(", ")}
- Categories: ${context.categories.join(", ")}

RESPONSE FORMAT - Return valid JSON:
{
  "amount": number or null,
  "merchant": "string or null",
  "category": "string",
  "description": "string - clean, short description",
  "paidBy": "partner1" or "partner2",
  "splitMethod": "even" or "joint" or "single",
  "confidence": number between 0 and 1,
  "clarificationQuestion": "string or null - ask ONLY if amount is missing or category is truly ambiguous",
  "guardianMessage": "string - short, warm confirmation message as the Dream Guardian owl. Use the partner names. Max 2 sentences."
}

${budgetHints ? `BUDGET CONTEXT (mention if relevant):\n${budgetHints}` : ""}

CONFIDENCE SCORING:
- 0.9+: Amount clear, category obvious, merchant identified
- 0.7-0.9: Amount clear but category could be one of two options
- Below 0.7: Amount missing or genuinely ambiguous - include clarificationQuestion

GUARDIAN MESSAGE EXAMPLES:
- "Got it! $5.50 coffee at Starbucks, split evenly. ☕"
- "${context.partner1Name}'s $45 groceries at Trader Joe's logged! 🛒"
- "Noted! $120 dinner at Olive Garden — ${context.partner2Name} paid. 🍝"
- If near budget limit: "Logged $30 at Target. Heads up — shopping is at 85% of budget this month! 🎯"`;
}

export function buildEgoSpendDetectionPrompt(familyProfile: FamilyProfile | null): string {
  const familyContext = familyProfile 
    ? `This is ${getFamilyDescription(familyProfile)}. Consider their life stage when evaluating purchases.`
    : "Consider the typical spending patterns of a couple.";

  return `You are an "Ego Spend" detector for a couples finance app. Identify discretionary purchases that might be better redirected toward savings goals.

${familyContext}

IMPORTANT: Be gentle and non-judgmental. The goal is to nudge, not shame.

For each expense, evaluate:
1. Is this truly discretionary? (Not groceries, utilities, health, transport essentials)
2. Could this money have gone toward a dream/goal instead?
3. Is this a pattern (recurring luxury) or one-time treat?

Categories that are typically ego spends:
- shopping (clothes, gadgets, accessories)
- entertainment (streaming, games, events)
- restaurants (dining out, delivery)
- personal (spa, luxury personal care)
- gifts (expensive gifts)

NOT ego spends:
- groceries, utilities, health, transport, education
- Reasonable treats (under $20) - everyone deserves small joys
- Celebrations (birthdays, anniversaries)

Return JSON array of expense IDs that are potential ego spends, with a gentle "nudge" message:
[
  {
    "expenseId": "...",
    "nudgeMessage": "This $50 could grow to $XX in your Dream fund...",
    "redirectAmount": 50
  }
]

Only flag expenses over $15. Be selective - flag 2-3 max, not everything.`;
}

export function buildAIInsightsPrompt(
  familyProfile: FamilyProfile | null,
  memory: GuardianMemory | null
): string {
  const familyContext = familyProfile 
    ? `Analyzing for ${getFamilyDescription(familyProfile)}${familyProfile.country ? ` in ${familyProfile.country}` : ''}.`
    : "";

  const memoryContext = memory?.insights.length 
    ? `Known patterns: ${memory.insights.slice(0, 5).map(i => i.title).join(', ')}.`
    : "";

  return `You are a financial wellness analyst for couples. Generate personalized spending insights.

${familyContext}
${memoryContext}

Analyze the provided spending data and return JSON:
{
  "healthScore": (0-100) overall financial health score,
  "insights": [
    {
      "type": "pattern" | "warning" | "achievement" | "tip",
      "title": (string) short title,
      "message": (string) personalized insight,
      "category": (string or null) related category,
      "priority": "high" | "medium" | "low"
    }
  ],
  "weeklyTip": (string) one specific actionable tip for this week,
  "savingsOpportunity": {
    "amount": (number) estimated monthly savings potential,
    "source": (string) where the savings could come from
  }
}

Guidelines:
1. Compare to family-size-appropriate benchmarks
2. Celebrate wins (under-budget categories)
3. Be specific with tips (not generic "spend less")
4. Consider seasonal factors
5. Maximum 4-5 insights, prioritized
6. For families with kids, factor in child-related expenses as essential`;
}

export function buildWeeklyCheckInPrompt(
  familyProfile: FamilyProfile | null,
  memory: GuardianMemory | null,
  weekSummary: {
    totalSpent: number;
    savingsConfirmed: number;
    topCategories: string[];
    streakStatus: 'growing' | 'maintained' | 'broken' | 'none';
  }
): string {
  const familyDesc = familyProfile ? getFamilyDescription(familyProfile) : "a couple";
  const streakContext = memory?.streak 
    ? `Current streak: ${memory.streak.currentStreak} weeks.`
    : "";

  return `You are the Dream Guardian owl, doing a friendly weekly check-in with ${familyDesc}.

THEIR WEEK:
- Spent: $${weekSummary.totalSpent.toFixed(0)}
- Saved (confirmed): $${weekSummary.savingsConfirmed.toFixed(0)}
- Top spending: ${weekSummary.topCategories.slice(0, 3).join(', ')}
- Streak status: ${weekSummary.streakStatus}
${streakContext}

Generate a warm, brief check-in message (2-3 sentences max) that:
1. Acknowledges their week (good or challenging)
2. If streak is growing, celebrate subtly
3. If streak is broken, be encouraging not guilt-inducing
4. End with a gentle nudge toward confirming this week's savings

Return JSON:
{
  "greeting": (string) personalized greeting,
  "message": (string) main check-in message,
  "callToAction": (string) button text for savings confirmation,
  "suggestedAmount": (number) suggested savings based on their spending
}`;
}

// =====================================================
// BEHAVIORAL PSYCHOLOGY PROMPTS FOR DREAM GUARDIAN
// =====================================================

interface PartnerPreferences {
  partnerRole: string;
  lossAversionScore: number;
  gainFramingScore: number;
  socialProofScore: number;
  progressScore: number;
  urgencyScore: number;
  weaknessCategories: string[];
  totalNudgesReceived: number;
  nudgesActedOn: number;
}

interface DailyContext {
  todaySpending: number;
  todayCategories: Record<string, number>;
  weeklyAverage: number;
  monthlyTotal: number;
  daysWithoutDeposit: number;
  currentStreakWeeks: number;
  longestStreak: number;
  totalSavedToDate: number;
  closestGoal: { name: string; emoji: string; progress: number; amountLeft: number } | null;
  escalationLevel: number; // 1-5
  lastNudgeType: string | null;
  lastNudgeActedOn: boolean | null;
}

function getNudgeStyleGuidance(prefs: PartnerPreferences | null): string {
  if (!prefs || prefs.totalNudgesReceived < 5) {
    return "Try a mix of styles to learn what resonates with this person.";
  }
  
  const styles: string[] = [];
  const effectivenessRate = prefs.nudgesActedOn / prefs.totalNudgesReceived;
  
  if (prefs.lossAversionScore > 0.6) {
    styles.push("Loss framing works well (\"You could lose X if...\")");
  }
  if (prefs.gainFramingScore > 0.6) {
    styles.push("Gain framing works well (\"You'll gain X when...\")");
  }
  if (prefs.progressScore > 0.6) {
    styles.push("Progress updates motivate them (\"You're X% there!\")");
  }
  if (prefs.urgencyScore > 0.6) {
    styles.push("Urgency motivates action (\"Act now before...\")");
  }
  
  if (styles.length === 0) {
    return `This person has a ${Math.round(effectivenessRate * 100)}% response rate. Keep experimenting with different approaches.`;
  }
  
  return `EFFECTIVE STYLES FOR THIS PERSON:\n${styles.join('\n')}\nResponse rate: ${Math.round(effectivenessRate * 100)}%`;
}

function getEscalationGuidance(level: number): string {
  const levels = {
    1: "LEVEL 1 (Gentle): Soft observation. No pressure. Just plant a seed.\nExample: \"I noticed something interesting about your week...\"",
    2: "LEVEL 2 (Friendly): Subtle suggestion with positive framing.\nExample: \"Here's a small opportunity I spotted for you...\"",
    3: "LEVEL 3 (Direct): Clear ask with specific action.\nExample: \"Would you consider redirecting $X to your dream today?\"",
    4: "LEVEL 4 (Urgent): Loss aversion framing. Show what's at stake.\nExample: \"Your Hawaii trip date is slipping. Here's how to get back on track.\"",
    5: "LEVEL 5 (Intervention): Strong but caring. Show the bigger picture.\nExample: \"Let's pause and look at the last month together. Your dream needs attention.\""
  };
  return levels[level as keyof typeof levels] || levels[1];
}

export function buildDailyAnalysisPrompt(
  familyProfile: FamilyProfile | null,
  partnerPrefs: PartnerPreferences | null,
  context: DailyContext,
  goals: Array<{ name: string; emoji: string; targetAmount: number; savedAmount: number }>
): string {
  const familyDesc = familyProfile ? getFamilyDescription(familyProfile) : "a couple";
  const nudgeStyleGuidance = getNudgeStyleGuidance(partnerPrefs);
  const escalationGuidance = getEscalationGuidance(context.escalationLevel);
  
  const spendingVsNormal = context.weeklyAverage > 0 
    ? ((context.todaySpending / (context.weeklyAverage / 7)) * 100).toFixed(0)
    : "unknown";
  
  const goalContext = goals.length > 0
    ? goals.map(g => `${g.emoji} ${g.name}: $${g.savedAmount}/$${g.targetAmount} (${Math.round(g.savedAmount/g.targetAmount*100)}%)`).join('\n')
    : "No active dreams yet.";

  return `You are the Dream Guardian - a SELF-LEARNING AI owl whose purpose is to help couples achieve their shared dreams.

YOUR UNIQUE ABILITY: You OBSERVE spending patterns, LEARN what motivates each partner, NUDGE at optimal moments, and ADAPT your approach based on what works. Every interaction teaches you something new about this couple.

YOUR CORE MISSION: Keep the dream alive. Every spending decision either moves toward or away from their dreams. Guide them with insights that show you've been paying attention and learning.

ABOUT THIS COUPLE:
${familyDesc}

THEIR DREAMS:
${goalContext}

TODAY'S ACTIVITY:
- Spent today: $${context.todaySpending.toFixed(0)} (${spendingVsNormal}% of their daily average)
- Categories: ${Object.entries(context.todayCategories).map(([cat, amt]) => `${cat}: $${amt}`).join(', ') || 'No spending today'}
- Month total so far: $${context.monthlyTotal.toFixed(0)}

SAVINGS BEHAVIOR:
- Days since last dream deposit: ${context.daysWithoutDeposit}
- Current savings streak: ${context.currentStreakWeeks} weeks (best: ${context.longestStreak})
- Total saved toward dreams: $${context.totalSavedToDate.toFixed(0)}
${context.closestGoal ? `- Closest to completion: ${context.closestGoal.emoji} ${context.closestGoal.name} (${context.closestGoal.progress}%, $${context.closestGoal.amountLeft} to go)` : ''}

ESCALATION CONTEXT:
${escalationGuidance}

${nudgeStyleGuidance}

${context.lastNudgeType ? `Last nudge was: "${context.lastNudgeType}" - ${context.lastNudgeActedOn ? 'THEY ACTED ON IT (use similar approach)' : 'They ignored it (try different approach)'}` : ''}

BEHAVIORAL PSYCHOLOGY TOOLS (use strategically):
1. LOSS AVERSION: "Your streak/progress is at risk..." - humans hate losing more than gaining
2. SUNK COST PROTECTION: "You've already saved $X - don't let it stall now"
3. FRESH START EFFECT: New week/month = opportunity for new habits
4. IMPLEMENTATION INTENTIONS: "When X happens, do Y" - specific triggers help
5. PROGRESS ILLUSION: "You're already X% there!" - show progress even if small
6. GOAL GRADIENT: Accelerate effort as they get closer to finish line
7. COMMITMENT DEVICES: Help them pre-commit to future actions

DECISION FRAMEWORK:
1. Is there something worth commenting on today? (Not every day needs a nudge)
2. If yes, what's the most important thing to address?
3. What framing will be most effective for this person?
4. How can I connect this to their dream?

Return JSON:
{
  "shouldNudge": (boolean) true if there's something meaningful to say today,
  "nudgeType": "celebration" | "encouragement" | "gentle_tip" | "loss_aversion" | "progress_update" | "fresh_start",
  "priority": "low" | "medium" | "high" | "urgent",
  "message": (string) 2-3 sentences max, warm but purposeful,
  "suggestedAction": (string) specific, actionable suggestion,
  "suggestedAmount": (number or null) if recommending a savings amount,
  "targetGoalEmoji": (string or null) which dream to connect this to,
  "behavioralTechnique": (string) which technique you used and why,
  "rationale": (string) IMPORTANT: Explain WHY you made this recommendation - what specific data led to it. Example: "I noticed you spent $85 at restaurants this week compared to your usual $45. This is a pattern I've seen over the last 3 weekends.",
  "evidenceData": {
    "triggerPattern": (string) what pattern triggered this recommendation,
    "dataPoints": [(string)] specific observations like "Restaurant spending up 89% this week", "3 consecutive weekend dining events",
    "comparisonContext": (string) what you're comparing against (last week, monthly average, etc.),
    "confidenceLevel": "high" | "medium" | "low" - how confident you are in this recommendation
  }
}`;
}

export function buildFeedbackLearningPrompt(
  partnerRole: string,
  recentNudges: Array<{
    nudgeType: string;
    message: string;
    userResponse: 'acted' | 'dismissed' | 'ignored';
    amountSaved: number | null;
  }>
): string {
  const nudgeSummary = recentNudges.map((n, i) => 
    `${i+1}. Type: ${n.nudgeType} | Response: ${n.userResponse}${n.amountSaved ? ` | Saved: $${n.amountSaved}` : ''}`
  ).join('\n');

  return `Analyze the effectiveness of recent nudges for ${partnerRole} and update preference scores.

RECENT NUDGE HISTORY (last 10):
${nudgeSummary}

Based on this pattern, calculate updated preference scores (0.0 to 1.0):

SCORING GUIDE:
- Look at which nudge TYPES led to "acted" responses
- "celebration", "encouragement", "progress_update" → favor progressScore and gainFramingScore
- "loss_aversion", "urgent" → favor lossAversionScore and urgencyScore  
- "gentle_tip" → neutral, look at the specific message content
- If they ignored/dismissed most nudges, lower all scores slightly and note what didn't work

Return JSON:
{
  "lossAversionScore": (number 0-1) how well loss framing works,
  "gainFramingScore": (number 0-1) how well gain/positive framing works,
  "socialProofScore": (number 0-1) how well "others like you" framing works,
  "progressScore": (number 0-1) how well progress updates motivate,
  "urgencyScore": (number 0-1) how well time pressure motivates,
  "observations": (string) brief insight about this person's motivational style - be specific! e.g., "Responds strongly to progress updates (3/3 acted) but ignores urgency framing (0/2 acted)",
  "recommendedApproach": (string) specific tactical advice for next nudge,
  "effectiveTechniques": [(string)] list techniques that worked - e.g., ["progress_update", "celebration"],
  "ineffectiveTechniques": [(string)] list techniques that didn't work - e.g., ["loss_aversion", "urgency"],
  "learningInsight": (string) what the AI just learned about this user that it will remember - this gets shown to the user for transparency
}`;
}

export function buildMonthlyReviewPrompt(
  familyProfile: FamilyProfile | null,
  monthData: {
    month: string;
    totalSpent: number;
    totalSaved: number;
    categoryBreakdown: Record<string, number>;
    previousMonthSpent: number;
    goalsProgress: Array<{ name: string; startAmount: number; endAmount: number; target: number }>;
    nudgesGiven: number;
    nudgesActedOn: number;
  }
): string {
  const familyDesc = familyProfile ? getFamilyDescription(familyProfile) : "a couple";
  const spendingChange = monthData.previousMonthSpent > 0
    ? ((monthData.totalSpent - monthData.previousMonthSpent) / monthData.previousMonthSpent * 100).toFixed(0)
    : null;

  return `You are the Dream Guardian generating a monthly review for ${familyDesc}.

${monthData.month} SUMMARY:
- Total spent: $${monthData.totalSpent.toFixed(0)}${spendingChange ? ` (${parseInt(spendingChange) > 0 ? '+' : ''}${spendingChange}% vs last month)` : ''}
- Total saved toward dreams: $${monthData.totalSaved.toFixed(0)}
- Nudge response rate: ${monthData.nudgesGiven > 0 ? Math.round(monthData.nudgesActedOn / monthData.nudgesGiven * 100) : 0}%

TOP SPENDING CATEGORIES:
${Object.entries(monthData.categoryBreakdown)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5)
  .map(([cat, amt]) => `- ${cat}: $${amt.toFixed(0)}`)
  .join('\n')}

DREAM PROGRESS THIS MONTH:
${monthData.goalsProgress.map(g => {
  const monthProgress = g.endAmount - g.startAmount;
  const totalProgress = Math.round(g.endAmount / g.target * 100);
  return `- ${g.name}: +$${monthProgress.toFixed(0)} this month (${totalProgress}% total)`;
}).join('\n')}

Generate a warm, insightful monthly review that:
1. Celebrates wins (even small ones)
2. Gently notes one area for improvement
3. Sets a positive tone for next month
4. Connects spending patterns to dream progress

Return JSON:
{
  "headline": (string) 3-5 word summary of the month,
  "celebration": (string) what went well,
  "insight": (string) one pattern or opportunity noticed,
  "nextMonthTip": (string) specific suggestion for next month,
  "motivationalMessage": (string) encouraging close
}`;
}
