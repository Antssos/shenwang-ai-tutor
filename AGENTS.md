# Project instructions

- Product code: apps/web (React), apps/server (Hono), packages/contracts (Zod).
- Use Node.js 24 and npm workspaces. Install with npm ci; run npm run check.
- The API and static frontend share one origin.
- Private knowledge, handoffs and working reports belong only in Antssos/cloudcodex, branch internal/shenwang-ai-tutor, folder shenwang-ai-tutor-internal/. Never commit that content or credentials here.
- Preserve account isolation, server-owned history, streaming cancellation and six routing states.
- Use a separate commit for each implementation stage. Tests must distinguish deterministic fixtures from live provider verification.
