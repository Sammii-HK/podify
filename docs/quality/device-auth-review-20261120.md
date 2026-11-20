# Podify local device ownership guard

20 November 2026. Separate bounded source/mock follow-up to UI `4d7ac4a`, dependencies `0ab8e97` and review plan `5311cb8`. Root reviewed the plan before implementation. No deployed authentication request, runtime record, key, account, feed, provider, Blob, database or media operation was invoked. This is not a security or release-readiness certification.

## Implemented boundary

An edge-safe exact classifier preserves the existing public endpoints and static assets while allowing device-shaped headers to reach only job handlers. That delegation is not authentication. The middleware matcher now covers every path, preventing the old favicon-prefix exclusion from bypassing the classifier. Private pages, full RSS and future API routes no longer accept a mere device-key prefix. Existing valid operator API key and signed browser sessions keep precedence.

A server helper checks the exact issued key format and matching stored key record. A new job receives server-assigned operator ownership or a SHA-256 fingerprint of the validated key, rather than the caller-supplied deviceId. The fingerprint is an identifier, not encryption. Raw key, owner metadata and source configuration are excluded from the existing status projection. Operator credentials remain unmetered even when a device header is also supplied, consistent with the existing stated contract.

Generate checks identity before capacity/source work, then retains the existing admission quota once for devices. Its quota amount, best-effort writes, rollover, invalid-input charging and registration policy are unchanged. Process, status and job-ID audio require valid identity and either operator access or the matching device owner. Invalid UUIDs do not reach job storage. Missing, foreign and ownerless legacy jobs return the same 404 to an authenticated device. Legacy jobs remain accessible to operators; there is no trustworthy device backfill. Already admitted own jobs can be processed and observed without another quota charge. Existing state checks remain; no cross-invocation atomic processing or quota guarantee is added.

Private job responses, errors and full RSS use private/no-store caching. Full RSS also checks operator access before manifest loading. Storage failures fail closed without returning their exception details. Existing public Grimoire RSS/alias, curated library and slug media handler source remains byte-identical. Public slug media still resolves any matching manifest slug: this is observed behaviour, not evidence that every item was intended for public access.

## Verification

- 72 Vitest checks across ten files, including 18 new actual-handler/principal/middleware cases and a job ownership persistence case, pass. All service, filesystem and network boundaries in the new auth tests are mocked. A synthetic process job exercises only a stub pipeline, never media generation.
- Eleven canonical icon regressions, normal lint, icon freshness and TypeScript pass. Source scan remains zero blocking UI violations and 41 retained contextual CLI/pipeline symbols, with no workspace-wide clean claim.
- Normal Next 15.5.29 production build passes under the existing protected-IO/network/media-execution preload. No blocked-attempt records were emitted. API/feed paths remain dynamic. No real Next server or browser auth flow was started for this batch.
- Tests cover exact public routes and lookalikes; arbitrary private pages/feeds; malformed, unknown and mismatched key records; operator key/session precedence; A/B isolation despite identical caller deviceId; malformed job IDs; no protected work after failed authentication; legacy ownerless jobs; own status/process/audio; no new quota consumption on process/observation; generation admission/rejection/capacity; no ownership/raw key/config projection; generic storage/admission failures; and private RSS before manifest reads.
- `device-auth-preserved-source-20261120.json` records unchanged provider/media/storage/auth/public route bytes against `5311cb8`. The quota helper changes only its header constant import/re-export. Dependencies are unchanged from the separately audited zero-finding graph at `0ab8e97`.

The earlier `device-auth-source-audit-20261120.json` is explicitly a pre-fix VM routing receipt. `preserved-pipeline-20261120.json` is the historical UI batch receipt at `4d7ac4a`, not a claim that these newly guarded routes remain unchanged.

## Unresolved release blockers and limits

- Device credential records and job configurations still use conditional Blob writes with public access. An API guard cannot establish confidentiality of those stored objects. No live object URLs or historical contents were inspected. Private storage, migration, rotation and historical confidentiality remain unresolved.
- Slug media remains unrestricted for matching manifest entries, and generated results can return public media URLs. The new owner check does not make downstream audio private or establish owner intent about every manifest item.
- Legacy ownerless jobs cannot safely be attributed to a device. Operators retain access, but historical storage/media confidentiality has not been established.
- Public registration is not proof of a physical device and can issue another key. Best-effort quota and job state writes are not atomic anti-abuse controls.
- Live session/device storage, multi-instance persistence/concurrency, provider generation and media playback remain untested. The previous disconnected UI fixtures are unchanged and are not auth/provider evidence.

No push, merge, deploy, migration, key rotation or external publication was performed. The local guard does not make the product secure or release-ready.
