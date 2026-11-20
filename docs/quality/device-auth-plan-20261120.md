# Device access and job ownership review

Baseline: local `0ab8e97`, 20 November 2026. Source and isolated mocks only. No service, runtime record, real key, session, feed, Blob, model or media process was opened or invoked. This is a proposed implementation boundary, pending root review.

## Observed boundary

`middleware.ts` accepts any `x-device-key` beginning with `dk_` on every protected path. Only `generate/route.ts` subsequently validates a registered key through the quota function. Process, status and job audio handlers load a job by ID without authentication or ownership checks. `Job` has no owner field. The attached VM receipt exercises the actual middleware with stub imports and synthetic request objects; it proves routing decisions, not a live exploit or storage exposure.

The operator API key and signed browser session are existing access paths. Device registration is intentionally public and its caller-supplied `deviceId` is not an ownership identity. Keys are issued as `dk_` plus 32 hexadecimal characters. Registration and quota remain product policy, not a physical-device identity guarantee.

## Preserve current public output contracts

- Public Grimoire RSS: `/api/podcast/feed/grimoire` and `/rss/grimoire`, filtered by Grimoire source.
- Public `/api/library`: curated manifest entries only, with existing pack/category filters.
- Public `/api/podcast/episodes/:slug/audio`: currently resolves any matching manifest slug, not only curated or Grimoire entries. Preserve this observed behaviour in the bounded guard batch; source code does not establish owner intent that every manifest item should be public. Unrestricted slug visibility remains a separate release blocker.
- Existing login, exact auth endpoints, brand assets and Next static assets.
- `/feed` and full `/api/podcast/feed` remain operator-only according to current middleware. README wording calling the full feed public conflicts with that implementation. Do not open it to devices or the public as part of this fix.

## Minimal proposed change

1. Share a pure exact route classifier. Delegate device verification only for generate, process, status and job-ID audio endpoints. A prefix is never authority to open arbitrary pages, full RSS or future routes. Preserve public assets and route methods; avoid broad public lookalike prefixes.
2. Add a server-only principal helper. Resolve existing valid operator API key or signed session first; otherwise validate the exact issued-key format, load the issued key record and require its stored key to match. Never trust a client role header. Device reads/process calls do not consume quota.
3. Add optional server-assigned job ownership: operator or a SHA-256 fingerprint of the validated issued key. Do not persist another raw bearer credential or use caller-supplied deviceId. A fingerprint is a comparison identifier, not encryption or confidentiality. Owner fields must not be returned through the status response.
4. Generate authenticates before capacity or other protected work, then retains the existing best-effort admission quota once for devices. Existing operator/session use stays unmetered even if a device header is also supplied, matching the stated source intent and middleware precedence. No quota/refund/re-registration policy changes. New jobs receive owner metadata at creation.
5. Process, status and job audio authenticate before job access; validate the UUID parameter; permit operator access or the matching device owner. Unknown/foreign jobs return the same 404 to an authenticated device. Exhausted generation quota does not prevent observing or processing an already admitted owned job. Existing process state checks remain; this does not claim atomic execution across invocations.
6. Legacy ownerless jobs are operator-only. There is no trustworthy device ownership backfill from the current schema. This deliberately prevents old device clients from resuming ownerless jobs; operator access remains available. Do not silently assign the first requester ownership.
7. Full RSS and private job responses use private/no-store cache headers, including errors. Intentional public RSS/library/slug media caching remains unchanged.

## Mock verification before a release candidate

Test malformed/prefix-only and unknown issued-shaped keys, exact private/public paths, unrelated private pages, valid A/B devices, wrong-owner and missing-job indistinguishability, legacy ownerless jobs, operator key/session precedence, no quota consumption on observation/process, unchanged generation quota handling, no owner/raw-key/config leakage and no protected job/provider calls after failed authentication. Stub storage, generation, filesystem and network boundaries. Existing client/release gates remain required. No real attack requests or provider/Blob/database operations are needed.

## Separate storage caveat

Both `lib/device-keys.ts` and `lib/jobs.ts` conditionally write whole JSON records to Blob with `access: "public"`. Device records include the raw bearer key; jobs can include source content and configuration. API ownership guards alone cannot establish confidentiality for those stored objects. No live Blob URLs were requested and no conclusion about deployed records is possible from this review.

A private-store migration, historical rewrite, key rotation or encryption design is outside this minimal batch and has not been authorised. Keep this as a release caveat rather than claiming the app is secure after an API guard. Public registration can issue new keys and quota writes are best-effort; neither is upgraded to anti-abuse or atomic quota protection here.

## Status

Dependency receipt saved separately as `0ab8e97` (53 Vitest tests, 11 icon regressions, types, normal guarded build and audit zero). No authentication implementation has been changed in this audit batch. Proposed design sent to root for review before mutation.

## Reviewed implementation follow-up

Root approved the bounded source/mock implementation after this plan was saved. See `device-auth-review-20261120.md` for its actual evidence and unresolved blockers. The earlier VM receipt remains explicitly the pre-fix baseline, not current middleware behaviour.
