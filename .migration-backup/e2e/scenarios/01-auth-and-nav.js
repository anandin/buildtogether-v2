/**
 * 01 — Auth + tab navigation.
 *
 * Login lands on Today; verify all 5 tabs are reachable and render their
 * home content without error.
 */
const { runScenario } = require("../lib/helpers");

async function scenario({ page, ss, gotoTab, log, apiCall }) {
  await ss("today-after-login");

  for (const tab of ["Spend", "Tilly", "Dreams", "You", "Today"]) {
    await gotoTab(tab);
    await ss(`tab-${tab.toLowerCase()}`);
    log(`✓ tab ${tab} switched`);
  }

  // Sanity: profile API returns 200 with a tone field
  const profile = await apiCall("/api/tilly/profile");
  if (profile.status !== 200 || !profile.body?.tone) {
    throw new Error(
      `/api/tilly/profile expected 200 + tone, got ${profile.status}: ${JSON.stringify(profile.body).slice(0, 200)}`,
    );
  }
  log(`profile tone=${profile.body.tone}`);
}

if (require.main === module) {
  runScenario("01-auth-and-nav", scenario).then((r) => {
    process.exit(r.status === "pass" ? 0 : 1);
  });
}

module.exports = scenario;
