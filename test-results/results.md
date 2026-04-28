# Tilly autonomous test run -- 2026-04-28T11:36:26.177Z

Live deployment: https://buildtogether-v2.vercel.app

**2 pass / 1 fail / 0 skip / 3 total**

| ID | Scenario | Result | Note |
| --- | --- | --- | --- |
| 1.1 | health endpoint | PASS | version=55ca877 provider=openrouter |
| 1.2 | web app loads sign-in screen | PASS | screenshot 01-signin.png |
| 2.1 | register works | FAIL | status=500 {"error":"column \"is_admin\" does not exist"} |

## Artifacts
- Screenshots: `test-results/screenshots/`
- API responses: `test-results/api-responses/`
- Console log: `test-results/console-log.txt`