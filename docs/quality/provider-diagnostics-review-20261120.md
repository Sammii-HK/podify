# Podify provider diagnostics boundary

20 November 2026. Bounded local follow-up to `2cb6888`, reviewed by root. Source/mock checks only; no real provider, authentication, runtime record, Blob, database, account, media or external request was used.

## Confirmed path and repair

Process stored raw provider exception text as job message/error. Synchronous generate also returned that text, and status exposed stored message/error to an authorised device. Ownership alone did not prevent diagnostics from entering that DTO. Route catches also logged exception objects, which could contain a bearer credential or source snippet.

The source handlers now store and return generic generation failures. Dynamic progress text is replaced at the route boundary with useful, fixed stage messages. Status derives its message from state/stage rather than trusting a stored provider message, so old records are covered without a migration. Public/device responses do not include diagnostic metadata.

Operators retain an allowlisted structural diagnostic: operation failure code, known error type and last known stage. No exception message, stack, header, URL, credential or source fragment is stored in this field. Its status projection also validates the allowed values and discards extra stored properties. Route error logs use the same structural information and job reference, never the raw exception object. This deliberately gives up arbitrary provider error text rather than persisting it in the existing public Blob store. An old record without structured diagnostics cannot recover them safely.

## Verification

Three new regressions execute the actual status, process and synchronous generate handlers with synthetic exception markers containing a fake device key. They check responses, progress/failure writes and route console errors, plus retained safe operator diagnostics and stage feedback. A legacy raw message/error record and a diagnostic object with extra raw/key fields are projected safely. Providers, filesystem, job storage and all network boundaries remain mocked.

The full suite now contains 75 Vitest checks and 11 canonical icon regressions. Normal lint/types/icon freshness and the production build pass under the protected-IO/network/media-execution guard. No protected-attempt records were emitted. No UI layout changed, and the disconnected client screenshots are not reclassified as provider evidence.

## Remaining limits

The unchanged pipeline/provider internals may still log their own text or retain legacy records; this fix does not certify those logs or historical confidentiality. It only controls these API route catches, newly written route job diagnostics and the job-status projection. Public Blob credential/config writes, unrestricted matching manifest-slug audio and legacy storage/media confidentiality remain explicit unresolved release blockers from `device-auth-review-20261120.md`. No storage migration, rotation, new diagnostic service, publication or release was performed. This is not a blanket confidentiality, security or release-readiness claim.
