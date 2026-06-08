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

- [x] Fix mobile hero readability after overflow-only test missed narrow text strips.
  - Issue: Pixel 5 had no horizontal overflow but rendered hero title/copy in unusably narrow columns.
  - Files: `dashboard/styles/globals.css`, `dashboard/app/components/ScrollStage.tsx`, `dashboard/app/components/CalloutLeft.tsx`, `dashboard/app/components/CalloutRight.tsx`, `dashboard/app/components/TireHero.tsx`, `dashboard/tests/e2e/dashboard.spec.ts`.
  - Verification: `cd dashboard && PLAYWRIGHT_BASE_URL=http://localhost:3001 npx playwright test --config=playwright.config.ts tests/e2e/dashboard.spec.ts --project=mobile-chrome --grep "Pixel 5 hero"`.

- [x] Fix mobile entrance animation offscreen risk.
  - Issue: narrow viewport callout blocks could become temporarily offscreen during horizontal translate entrance animation.
  - Files: `dashboard/app/components/CalloutLeft.tsx`, `dashboard/app/components/CalloutRight.tsx`, `dashboard/lib/useNarrowViewport.ts`, `dashboard/styles/globals.css`, `dashboard/tests/e2e/dashboard.spec.ts`.
  - Verification: `cd dashboard && PLAYWRIGHT_BASE_URL=http://localhost:3001 npx playwright test --config=playwright.config.ts tests/e2e/dashboard.spec.ts --project=mobile-chrome --grep "entrance animation"`.

- [x] Fix chapter dot navigation flake.
  - Issue: parallel e2e run could click chapter dot before smooth scroll/ScrollTrigger had updated chapter content.
  - Files: `dashboard/app/components/ChapterDots.tsx`, `dashboard/app/components/ScrollStage.tsx`, `dashboard/tests/e2e/dashboard.spec.ts`.
  - Verification: `cd dashboard && PLAYWRIGHT_BASE_URL=http://localhost:3001 npx playwright test --config=playwright.config.ts tests/e2e/dashboard.spec.ts --project=chromium --project=mobile-chrome`.

- [x] Hide Vercel preview feedback overlays.
  - Issue: Vercel preview injects `vercel-live-feedback` / `vercel-toolbar` custom elements that can intercept pointer events over chapter dots.
  - Files: `dashboard/styles/globals.css`, `dashboard/tests/e2e/dashboard.spec.ts`.
  - Verification: `cd dashboard && PLAYWRIGHT_BASE_URL=http://localhost:3001 npx playwright test --config=playwright.config.ts tests/e2e/dashboard.spec.ts --project=chromium --grep "Vercel preview"`.

- [x] Update stale e2e tests for redesigned scrollytelling UI.
  - Issue: previous tests expected removed panel IDs, selects, and replay button.
  - Files: `dashboard/tests/e2e/dashboard.spec.ts`.
  - Verification: `cd dashboard && PLAYWRIGHT_BASE_URL=http://localhost:3001 npx playwright test --config=playwright.config.ts tests/e2e/dashboard.spec.ts --project=chromium --project=mobile-chrome`.

- [x] Run build validation.
  - Issue: TypeScript/Next.js regressions must be caught after UI changes.
  - Files: dashboard app files above.
  - Verification: `cd dashboard && npm run build`.
