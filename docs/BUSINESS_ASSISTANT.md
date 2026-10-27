# AI business assistant — Phases 9–10

Basira's **AI Assistant** explains the selected business's records and offers general small-business advice. It uses NVIDIA-hosted **Nemotron 3.5 Lightning**, `nvidia/nemotron-3.5-lightning-30b-a3b`, configured by the server-only `NVIDIA_ASSISTANT_MODEL` setting. The user approved this replacement after Gemma timed out in live diagnostics. Feedback analysis and report summaries retain their separate Gemma setting. The academic title remains **Intelligent Decision Support System with Predictive Analytics for Small Businesses**. Phase 10 adds bounded historical alert context.

Existing completed replies retain their saved model provenance. Retrying a failed answer uses the currently configured assistant and saves that model for the new attempt. No database migration or automatic resubmission is required. The system prompt, business-only scope, financial definitions, strict JSON validation and privacy boundaries are unchanged. The graduation report is maintained separately by the user.

## Using conversations

Select a business, open **AI Assistant**, choose Last 7/30/90 days, This month or custom dates, and start a conversation. Dates are resolved in the business timezone and fixed for that conversation; custom ranges contain at most 366 days and cannot end in the future. Each question rebuilds the summary for those dates. Start another conversation to change dates.

Questions may contain up to 2,000 characters. The interface provides example questions, loading/error states, saved history, explicit retry for the latest failed or interrupted answer, and confirmed permanent deletion. A conversation contains at most 50 question/answer pairs. History loads 20 messages per page, newest page first; each page displays its messages chronologically. The conversation list also uses 20-item pages. Only the selected business's owner can access its conversations; ADMIN does not bypass ownership.

Replies are displayed as escaped plain text with metric references and caveats. **View saved business data** shows the summary saved for that attempt. Completed answers and their context are not rewritten after record edits. A retry replaces the failed attempt's context with a fresh summary and keeps the same question/answer pair. Deleting a conversation removes its messages and snapshots. Business deletion cascades through all conversations.

## Controlled context

The server builds the context within the same Repeatable Read transaction that claims the request. It reuses the dashboard calculation function; the browser cannot supply metrics, history, a system prompt, model, API key or business-owner ID.

| Shared context  | Definition and bounds                                                                                                                                                                                      |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Business        | Type, optional other-type description, currency and timezone; no owner identity, business ID, business name or location                                                                                    |
| Reporting dates | Selected inclusive period and equally long immediately preceding period                                                                                                                                    |
| Metrics         | Exact-decimal revenue, classified expenses, known COGS, estimated profit/margin, average sale value, transaction and cost-coverage counts, recorded customer visits/days, and preceding-period comparisons |
| Products        | Up to five products by revenue and five by quantity, using historical sale names and aggregates; IDs omitted                                                                                               |
| Expenses        | Up to eight category/classification totals and a remainder, with historical expense classifications                                                                                                        |
| Feedback        | Selected-period sentiment counts and analyzed main-topic counts; pending/failed coverage disclosed; no individual comments or summaries                                                                    |
| Forecasts       | Latest three saved runs for this business, with their own dates, training end, total, currency, MAE/MAPE, gap confirmation and creation time; not restricted to the conversation period                    |
| Availability    | Latest five non-dismissed historical alerts across all dates; raw transactions, individual feedback and external research not provided                                                                     |
| History         | At most three completed question/answer pairs, at most 8,000 characters, excluding failed/interrupted pairs; newest qualifying pairs in chronological order                                                |

Alert summaries include type, title/message, status/severity, evaluation dates and creation time, with no IDs or raw evidence payload. They are historical observations, not proof that a condition still holds; absence of alerts is not proof of healthy performance. Prompt version `business-assistant-v2` and the sharing disclosure include this data. Saved v1 snapshots stay unchanged and display without an alert field. Building context does not evaluate alerts or call the provider separately.

The context limit is 24,000 UTF-8 bytes; the whole user envelope is limited to 64 KiB. No tools, database access, SQL execution, web search or automatic record changes are available to the model. The context is data, not an additional system message. Historical messages and user-controlled names are likewise untrusted data. The current server snapshot takes precedence over previous answers and unverified user claims.

Estimated profit remains **Revenue − known historical COGS − Operating Expenses**. Inventory purchases and OTHER spending remain separately visible and are not deducted again. Missing costs are unknown; a known zero cost counts as covered. Coverage warnings apply to both comparison periods. Customer totals mean visits, not unique people or retention; absent dates are unknown. Saved forecasts remain estimates, may be stale after edits, and retain separate dates. MAPE is not an accuracy percentage. The model is instructed to distinguish recorded observations from general advice and possible causes, and to acknowledge unavailable information.

## Scope and output contract

General marketing, customer retention, business terminology and explanations of supplied metrics are in scope even without sufficient records. Unrelated sports, gaming, politics, homework, medical, relationship and random-trivia requests are out of scope. Merely claiming an unrelated question is for a business does not make it relevant. Mixed requests containing unrelated tasks are classified out of scope.

```json
{
  "inScope": true,
  "answer": "General advice: ...",
  "referencedMetrics": [],
  "warnings": []
}
```

The request specifies a strict JSON Schema. The server independently validates it with Zod: four required fields, no extras, a nonempty answer up to 4,000 characters, references drawn only from the closed `METRIC_LABELS` vocabulary, and at most five model warnings of 240 characters each. The service validates again at its boundary. Deterministic context warnings are appended separately for in-scope answers, so the saved warning list may exceed five. References are labels for data the model says it used, not verified citations or proof that its arithmetic is correct.

For valid output with `inScope: false`, application code discards the model's answer, references and warnings and returns exactly:

> Sorry, I can only help with questions related to your business and the business data available in this system. If you have a business-related question, go ahead.

This guarantees wording after classification; it does not guarantee perfect semantic classification, factuality or resistance to every prompt injection. Malformed output fails safely instead of displaying partial prose. Replies are instructed to use concise plain English and not replace professional accounting, legal, auditing, investment or financial advice. Model refusals and transport failures are distinct from the canonical business-scope refusal.

## Persistence and concurrency

`ChatConversation` has a composite reference to `Business(id, ownerId)`, fixed dates, optimistic version and message count. `ChatMessage` stores role, sequence, UUID turn ID, status, content, in-scope result, metric references, warnings, context snapshot, safe failure code, provider/model/prompt version, attempts and private lease metadata. It stores neither raw provider responses nor reasoning. The migration constrains dates, counts, role/sequence, status/content, leases and safe errors.

1. Require a current active owner, validate the strict body, and lock the business. Check conversation version, one-minute per-business cooldown, active leases and the 50-question limit. The chat cooldown is independent of feedback analysis.
2. An identical UUID/question retry returns the existing conversation without another provider call or duplicate pair. Reusing the UUID for different text returns 409. The browser retains this UUID while an unchanged unsent draft is retried after a transport error.
3. Check provider configuration and build bounded context/history. Atomically save the user question and pending assistant slot, or reclaim the latest failed/expired slot, with a random token and a 150-second lease. Missing configuration rolls back without saving a question or consuming cooldown.
4. Call NVIDIA outside the database transaction. Shared transport uses non-streaming output, temperature 0.2, disabled thinking, strict structured output and a 60-second deadline covering body consumption. Chat allows 1,024 output tokens; feedback remains at 512. Responses are limited to 64 KiB. No automatic retries, redirects, provider polling or work after an HTTP response. A provider 202 pending response is treated as unavailable.
5. Recheck active ownership under the business lock and save only if the token and unexpired lease still match. Deletion, suspension or a replacement attempt prevents a stale answer from overwriting current state. Completion increments the conversation version.

Safe errors are CONFIGURATION, TIMEOUT, RATE_LIMIT, UNAVAILABLE, INVALID_RESPONSE or REFUSED. A failed call retains the question and context, with an empty failed assistant slot. Only the latest failed/interrupted answer can be retried; moving on retires older interrupted work. Expired pending work becomes retryable after 150 seconds. Refresh to see newly completed or expired work; there is no background polling or job queue. A service interruption during completion can leave a pending slot until its lease expires.

## Privacy and operational limits

The send action shares the question, bounded history and the context above with NVIDIA. The UI discloses this before sending. Product/category names, business-type descriptions and free-text questions may still contain personal information; Basira does not claim automatic PII redaction or zero provider retention. Do not include sensitive information in questions or names. Existing saved local conversations can be read/deleted without a working AI key.

Configuration and provider terms are in [AI_INTEGRATION.md](AI_INTEGRATION.md). Both message/retry routes declare `maxDuration = 90`; the deployment plan must support that budget. Free-trial availability, quota and latency are external constraints. Synthetic live results and automated verification are in [PHASE_9_BUSINESS_ASSISTANT.md](PHASE_9_BUSINESS_ASSISTANT.md). Automated tests inject deterministic providers and cannot establish live model accuracy.
