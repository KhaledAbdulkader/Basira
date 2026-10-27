# Assistant model switch — 2026-10-16

The user approved replacing the business assistant's Gemma model after live timeout diagnostics. Chat now uses NVIDIA-hosted **Nemotron 3.5 Lightning**, `nvidia/nemotron-3.5-lightning-30b-a3b`. The ignored local `.env` and `.env.example` use the separate `NVIDIA_ASSISTANT_MODEL` variable. Feedback analysis and report summaries retain `NVIDIA_MODEL=google/gemma-4-31b-it`. The graduation report/PDF was not changed; the user chose to update it separately.

## Behavior

The assistant still uses the existing business prompt, 1,024-token output limit, strict JSON schema and independent response validation. Thinking is disabled. Requests retain the 60-second deadline and 64 KiB response-body limit. Only the approved model for each feature is accepted; there is no automatic fallback or retry. No database migration is needed.

New replies record Nemotron as their model. Completed historical replies keep their original model and context. An explicit retry of a failed Gemma answer uses Nemotron and updates that attempt's provenance. The conversation disclosure names the new model.

## Verification

| Check                                  | Result                                                                                                                     |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Full unit suite                        | 179 passed across 18 files                                                                                                 |
| Assistant PostgreSQL integration suite | 14 passed, including old/new model provenance and retry in place                                                           |
| Assistant desktop browser suite        | 3 passed using Edge/Chromium, including the new model disclosure, saved responses, retry controls and ownership boundaries |
| ESLint                                 | Passed with zero warnings                                                                                                  |
| TypeScript                             | Route generation and `tsc --noEmit` passed                                                                                 |
| Production build                       | Prisma generation and `next build` passed                                                                                  |
| Running local production server        | `/api/health` and `/login` returned HTTP 200                                                                               |

ESLint excludes `tmp/pdfs/**`, which contains temporary standalone screenshot helpers from the earlier report task. Application source, scripts and tests remain linted.

Three live checks used the actual configured assistant adapter and synthetic context, without a transport override or private business data:

| Synthetic question/context                                                       | Result                                                                                                                                | Response time |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Revenue SAR 100, known COGS SAR 30, operating expenses SAR 20; 50% cost coverage | Validated reply gave estimated profit SAR 50, disclosed incomplete costs, and excluded inventory/Other spending from that calculation | 15.5 seconds  |
| No recorded financial activity                                                   | Validated reply distinguished recorded zero totals from proof of zero activity                                                        | 11.4 seconds  |
| Unrelated football question                                                      | Classified out of scope; displayed the exact application refusal                                                                      | 4.0 seconds   |

Unit, database and browser suites mock provider responses; the three live probes above are separate provider checks. These small checks establish request compatibility and observed availability at that time, not general accuracy or guaranteed latency. The model can still produce imprecise wording or unnecessary metric references. Feedback/report Gemma availability was not reverified by this assistant-only change. Verify every integration again in the intended hosted environment.

To retry the user's saved question, refresh the conversation and choose **Retry answer**. No automatic resubmission of that question occurred during verification.
