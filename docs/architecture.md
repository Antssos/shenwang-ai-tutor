# Architecture and operating boundaries

One Node.js 24/Hono process serves the React build and `/api` on the same origin. SQLite is the source of truth for accounts, sessions, conversation branches, messages, runs, quotas and knowledge metadata. External OpenAI-compatible chat/embedding services are adapters, not owners of conversation state.

## Request flow

1. Limit bodies while reading (16 KiB), validate write origins and authenticate sessions.
2. Enforce account rate/concurrency limits and persistent account/global daily reservations.
3. Persist the user message, assistant placeholder and unique request key before generation.
4. Use safety prechecks and schema-validated classification to choose one of six routes. Classification failures return a safe fixed response.
5. Filter active documents by business knowledge base; combine segmented FTS5 and optional cosine rankings using reciprocal ranks. Evaluate vectors in a bounded worker thread. Missing evidence produces a fixed insufficiency response.
6. Generate with bounded context/output, total and idle deadlines; respect backpressure and cancellation.
7. Save partial output and finalize before `done`. Stops, disconnects, failures and startup recovery preserve their states.

Editing a user message creates a new branch with the valid preceding history and revised turn. The original branch remains available. Clients cannot PUT entire histories or choose server message IDs.

## Security and resource assumptions

- Deploy one application process on one SQLite volume. Only the server startup process recovers abandoned runs; CLI commands must not mark live runs as abandoned.
- Do not trust caller-supplied forwarding headers. Introducing a reverse proxy requires an explicit IP trust contract.
- Browser writes check Origin/fetch metadata and require JSON on POST/PUT/PATCH. Cookies are HttpOnly/SameSite=Lax; enable Secure with HTTPS.
- Password derivation is asynchronous and concurrency-limited. Session tokens are hashed. Assign administrators through the controlled CLI, never registration input.
- Treat provider responses as untrusted. Never log credentials, identifying details or question/answer bodies.
- Fixed safety responses work with the model disabled. Finite tests cannot establish zero safety false negatives.
- Token quotas are conservative reservations, not invoices; failures/cancellations do not refund them.
- Non-root container, read-only rootfs, writable data volume, 384 MiB memory and 0.5 CPU limits. Test fixtures require opt-in, loopback binding and a visible notice.

## Private assets and validation

Actual knowledge and old handoffs live only in permanently private `Antssos/cloudcodex`, branch `internal/shenwang-ai-tutor`, folder `shenwang-ai-tutor-internal/`. Public product tests use synthetic data. Knowledge must not enter the browser bundle.

Import uses active-only manifests, canonical path checks, hashes and versioned chunks. Changing embedding model requires full reimport. Keyword fallback is supported; evidence sufficiency still needs calibration against the deployed corpus/model.

Browser tests use a marked deterministic provider; protocol tests use a synthetic HTTP upstream. These validate UI/API behavior and protocol handling, not real model authorization, latency or answer quality. Before enabling AI, verify real chat/embeddings from the target machine and review routing, evidence, refusals, crisis handling and prompt injection.

The old BFF database schema is not automatically imported. The handoff supplied no database backup; recovered historical data requires a separately validated offline importer.

## Publication, admission and protocol boundaries

Operator publication decisions persist independently of imported content. Reimport preserves retirement; explicit admin publication is required to restore it. Retrieval rechecks publication/library and index generation after asynchronous vector scoring. Runs record corpus/policy versions and score metadata; generation rechecks evidence before contacting the provider and before forwarding each delta. Retirement stops subsequent output when observed, but cannot retract context already sent to an upstream provider.

Recognized crisis requests use an authenticated, body-limited and independently rate-limited fixed response, without reserving paid tokens or acquiring a generation slot. They create a separate safety conversation so even a full ordinary conversation cannot block help. If that independent limiter rejects a request, its response still contains the fixed help text. This keyword path complements classification and is not a complete crisis detector.

Normal task creation, validation, idempotency and paid reservation are one database transaction: rejected edits/full conversations/failed inserts do not spend quota. Accepted failures and cancellation retain the conservative reservation policy.

`[DONE]` or `finish_reason=stop` terminates the provider read without requiring HTTP EOF; trailing usage is not used for billing. Length truncation, content filtering, unsupported tools and premature EOF are incomplete/error outcomes. JSON response bytes, embedding batches/dimensions/indices and generation frame/output bytes have explicit bounds.

Candidate retrieval has a conservative lexical coverage guard; center-information candidates require lexical support even when a vector score is high. Other libraries can use high semantic similarity. Short elliptical follow-ups append bounded preceding user context rather than inventing a rewritten topic. Coverage/cosine settings are provisional guards, not calibrated quality claims; deployed-model routing, relevance, refusal and multi-turn accuracy remain acceptance work after controlled deployment.
