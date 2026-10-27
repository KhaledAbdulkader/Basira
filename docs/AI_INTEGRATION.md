# AI integration — feedback and business assistant

Basira uses NVIDIA-hosted **Nemotron 3.5 Lightning** for business conversations and **Google Gemma 4 31B IT** for customer-feedback analysis and optional report summaries. The user approved switching the assistant after Gemma timed out in live diagnostics and Nemotron returned validated replies using the same key. The original GP2 OpenAI plan is superseded for this integration; this is neither the Google Gemini API nor OpenAI's Responses API. The academic project title is unchanged. This document describes shared transport/configuration and feedback; [BUSINESS_ASSISTANT.md](BUSINESS_ASSISTANT.md) defines chat context, scope, privacy and persistence.

## Configuration and request boundary

Set these server variables in the ignored `.env` file locally, or the deployment platform's secrets store:

```dotenv
NVIDIA_API_KEY="YOUR_NVIDIA_API_KEY"
NVIDIA_MODEL="google/gemma-4-31b-it"
NVIDIA_ASSISTANT_MODEL="nvidia/nemotron-3.5-lightning-30b-a3b"
```

Absent model settings default to the values above. `NVIDIA_MODEL` applies to feedback and report summaries; `NVIDIA_ASSISTANT_MODEL` applies only to chat. Each setting accepts only its approved model; incompatible overrides are rejected before a provider call. There is no automatic fallback between models. Both use the same server-side key. Missing/placeholder keys disable analysis without disabling feedback capture, sign-in or builds. Never use a `NEXT_PUBLIC_` prefix. Restart the server after changing configuration. The real key is not in `.env.example`, source, screenshots or documentation. Rotate any credential shared in a conversation through the provider console and replace its local value.

`src/lib/feedback/server.ts` and `src/lib/assistant/server.ts` are the server-only configuration entry points. Their domain providers use `src/lib/ai/nvidia.ts`, a shared mockable native Node `fetch` transport; no Axios or SDK dependency is needed for this single HTTP operation. Its fixed HTTPS destination is NVIDIA's [Chat Completions endpoint](https://docs.api.nvidia.com/nim/reference/google-gemma-4-31b-it-infer). Redirects are rejected. The API does not accept a client-selected URL, model or key. Provider HTTP 202 pending responses are handled as unavailable; there is no asynchronous provider polling.

Feedback requests use non-streaming output, at most 512 output tokens, temperature 0.2, JSON Schema output and `chat_template_kwargs.enable_thinking: false`. This sampling choice is an application choice for classification, not a quality benchmark. Each feedback request sends a fixed classification prompt plus exactly one JSON-encoded feedback text (maximum 2,000 characters). It sends no business name, financial records, owner email, record IDs, authentication data or other businesses' data. Feedback analysis has no tools, browsing, SQL or chat history. Chat uses 1,024 output tokens, its own strict schema and a bounded aggregate context/history as documented separately. Nemotron chat also disables thinking and uses non-streaming structured output; see its [official model reference](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-5-lightning-30b-a3b). The shared 60-second deadline, response-size limit, schema validation and manual retry policy still apply.

## Output contract

```json
{
  "sentiment": "POSITIVE",
  "topic": "staff",
  "summary": "The staff were friendly.",
  "confidence": 0.9
}
```

The server requires all four fields and rejects extra fields, unknown enums, blank/over-600-character summaries, strings masquerading as numbers, and confidence outside 0–1. The wire request supplies a strict JSON Schema and the response independently passes Zod validation. A successful HTTP status alone is insufficient: exactly one completed choice with finish reason `stop` must contain valid JSON. Refusals, truncation, markdown fences, invalid JSON/schema and oversized responses do not produce an analysis. The total response-body limit is 64 KiB. There is no regex extraction of arbitrary JSON from prose.

NVIDIA documents that Gemma can emit an empty thought wrapper with thinking disabled. The adapter removes only that exact empty wrapper before parsing; nonempty reasoning wrappers are rejected. It never stores or displays reasoning. See the [model reference](https://docs.api.nvidia.com/nim/reference/google-gemma-4-31b-it).

Sentiment is POSITIVE, NEUTRAL or NEGATIVE. The prompt treats balanced mixed sentiment, factual comments and text without a clear customer opinion as NEUTRAL. One dominant topic is selected from price, quality, customer service, staff, delivery, waiting time, cleanliness, availability, product/service, and other. Summaries use English to match the current interface, including for Arabic input; original comments remain unchanged. This is a prompt instruction, not a guarantee of language or semantic accuracy.

Confidence is the model's classification strength, **not calibrated probability, statistical confidence or measured accuracy**. The database stores four decimal places; the UI shows a rounded percentage with this explanation. Multiple complaints in one comment still yield only one main topic. Sarcasm, dialect, ambiguity and adversarial text require human review. Feedback text is explicitly untrusted data; structural validation and the absence of tools limit capabilities but cannot guarantee immunity from semantic prompt injection.

## Analysis workflow and concurrency

1. Saving manual feedback or confirming a feedback import creates UNKNOWN/PENDING entries. Neither operation sends data automatically.
2. The owner chooses **Analyze pending feedback**, **Retry failed feedback**, or a single row's action. The page explains that comment text is sent to NVIDIA before those controls.
3. The service checks current active status and ownership, including ADMIN, and takes the business row lock. It selects at most three oldest entries by date/ID and claims them with a random token and a 150-second lease. There is one batch per business per minute; a still-active lease also prevents another batch. These limits are application safeguards, not an assertion about NVIDIA account quotas.
4. Up to three calls run concurrently, outside database transactions. Each has a 60-second deadline covering response-body consumption. There is no automatic provider retry. The route declares a 90-second execution budget; actual hosting support must be checked at deployment.
5. Short completion transactions recheck active ownership and update only rows with the same version, claim token and unexpired lease. Successful analysis writes sentiment/topic/summary/confidence, provider/model/prompt version, and completion time. Failure writes a safe allowlisted error code with FAILED/UNKNOWN and preserves the original text. Completion increments the record version.
6. Edits clear analysis and claim metadata, even when only the feedback date changes. Edits and deletion use the same business lock. A late result cannot overwrite changed text, resurrect a deleted row or replace a newer attempt. An interrupted request becomes eligible again after 150 seconds; refresh before retrying. Leases are not background jobs and there is no work after an HTTP response is sent.

Missing configuration is detected before a claim commits, leaving entries pending and consuming no attempt/cooldown. Once a call starts, timeout, rate-limit, refusal, invalid result or unavailability produces a retryable FAILED row. Authentication/configuration rejection by the provider is a safe CONFIGURATION failure. Database or access failure during completion may leave a lease pending until expiry. API errors/logs never include provider response bodies, credentials or original comments.

The UI reports counts of analyzed, failed and changed/interrupted entries. Concurrent UI actions and stale single-row versions receive 409. HTTP/API details are in [API.md](API.md). Lifetime attempt count and last attempt time remain server-side; editing clears the current result but not this audit count. Internal lease tokens are never returned to the browser.

## Insights and privacy

The feedback page aggregates all dates for the selected business, independently of its table filters, and explicitly labels that scope. Positive/neutral/negative percentages divide by the number of successfully analyzed comments, excluding pending and failed entries. With none analyzed, percentages are unavailable, not zero-confidence estimates. The existing dashboard continues to use its selected period and shows unanalysed/failed records as Unknown.

Common topics rank analyzed comments. Repeated complaint topics require at least two NEGATIVE comments in the same main topic; repeated positive themes require at least two POSITIVE comments. These are database counts, not an invented cross-comment AI narrative or proof that all comments describe the same issue. Topic labels are bounded by the vocabulary; ties use alphabetical order. Lists show up to five topics. Analyzed/total, pending and failed counts disclose coverage.

Owners should remove names, contact details and sensitive information from comments before submitting them. This release does not claim automatic PII detection/redaction. For feedback analysis, only feedback text is transmitted, but provider processing still occurs externally. Business chat has a separate disclosure for questions, recent exchanges and aggregate business data. The UI's disclosure is not a promise of zero retention. NVIDIA's hosted trial is subject to its [API Trial Terms](https://assets.ngc.nvidia.com/products/api-catalog/legal/NVIDIA%20API%20Trial%20Terms%20of%20Service.pdf); account limits and continued free availability must be checked before deployment. No production-scale cost/latency guarantee is claimed.

## Verification and future scope

The approved assistant-only model replacement and its successful live synthetic probes are recorded in [ASSISTANT_MODEL_SWITCH.md](ASSISTANT_MODEL_SWITCH.md). Historical phase reports below describe the Gemma configuration that was tested at those times.

Default unit and database tests inject deterministic provider responses and make no AI network calls. Browser tests explicitly unset `NVIDIA_API_KEY`; they exercise unavailable configuration and display results persisted through the tested service with a mock analyzer. They do not pretend to test a live provider end to end. The transport tests cover the real HTTP request/response contract with mocked `fetch`. Live checks are separate and use synthetic comments only; results and limitations are recorded in [PHASE_8_FEEDBACK_ANALYSIS.md](PHASE_8_FEEDBACK_ANALYSIS.md).

Phase 9 implements business-grounded conversations, bounded context/history and the specified off-topic refusal; see [its verification report](PHASE_9_BUSINESS_ASSISTANT.md). The live Phase 9 probes timed out, including a minimal arithmetic transport probe; no live assistant accuracy or availability claim is made. Phase 10 adds local alert rules and up to five dated historical alerts to new chat contexts, without additional AI calls. Phase 11 adds separately requested report executive summaries from immutable calculated context, reusing the same transport with a strict 1800-character schema and independent cooldown/leases. Deterministic report creation and PDF export work without AI. See [REPORTS.md](REPORTS.md) for data disclosure, recovery and verification limits. Demo seed remains for Phase 14. Financial calculations, forecasting and alert evaluation remain deterministic local services.
