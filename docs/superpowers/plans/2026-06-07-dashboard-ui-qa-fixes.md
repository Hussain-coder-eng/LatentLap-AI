# Dashboard UI QA Fixes

Goal: fix deployed dashboard QA issues from `https://dashboard-ten-lac-46.vercel.app/` and keep scrollytelling UI tests current.

- [x] Fix stale hero race copy after settings changes.
  - Issue: selecting `2024` changes title to `McLaren · Silverstone · 2024`, but hero explanation still says `2025 British Grand Prix` and `Race date: July 6, 2025`.
  - Files: `dashboard/app/components/ScrollStage.tsx`, `dashboard/tests/e2e/dashboard.spec.ts`.
  - Verification: `cd dashboard && PLAYWRIGHT_BASE_URL=http://localhost:3001 npx playwright test --config=playwright.config.ts tests/e2e/dashboard.spec.ts --project=chromium`.

- [x] Fix mobile hero layout on Pixel 5.
  - Issue: first viewport clips left hero copy and lets right callout overlap/offscreen; SIM/settings/scrubber must remain reachable.
  - Files: `dashboard/app/components/ScrollStage.tsx`, `dashboard/app/components/CalloutLeft.tsx`, `dashboard/app/components/CalloutRight.tsx`, `dashboard/app/components/TireHero.tsx`, `dashboard/tests/e2e/dashboard.spec.ts`.
  - Verification: `cd dashboard && PLAYWRIGHT_BASE_URL=http://localhost:3001 npx playwright test --config=playwright.config.ts tests/e2e/dashboard.spec.ts --project=mobile-chrome`.

- [x] Update stale e2e tests for redesigned scrollytelling UI.
  - Issue: previous tests expected removed panel IDs, selects, and replay button.
  - Files: `dashboard/tests/e2e/dashboard.spec.ts`.
  - Verification: `cd dashboard && PLAYWRIGHT_BASE_URL=http://localhost:3001 npx playwright test --config=playwright.config.ts tests/e2e/dashboard.spec.ts --project=chromium --project=mobile-chrome`.

- [x] Run build validation.
  - Issue: TypeScript/Next.js regressions must be caught after UI changes.
  - Files: dashboard app files above.
  - Verification: `cd dashboard && npm run build`.
