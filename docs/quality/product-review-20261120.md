# Podify local product review, 20 November 2026

Isolated `codex/podify-product-polish` from committed baseline `460c62a`. The main checkout's modified TypeScript cache and untracked interview files were not read or copied. Sparse checkout excluded environment files, output/private/temp folders and build caches before tracked source was populated. No generation, model, TTS, FFmpeg, provider, Blob, database, account or private-feed operation was invoked.

## Actual repairs

The source, title and settings stay mounted through request failures. A typed client handoff validates the selected source, acknowledgement, requested job ID, status and result before advancing. Non-JSON HTTP failures are explained without losing the brief. A synchronous submission lock prevents duplicate clicks before React updates the disabled state. Network/timeout ambiguity is kept explicit: no acknowledgement does not prove that the server created no job, and the UI asks the user to check before resubmitting. This does not add server-side idempotency.

Process-start failures are no longer swallowed. The process connection is separate from status observation, while monitoring continues with a visible warning and saved job reference. A 409 means an existing process can be observed. Checking an existing job never sends another generation or process-start request. Stopping observation aborts the current status request and delay; it does not claim to cancel the server job. Leaving the page releases the browser-owned requests without promising server cancellation.

Status reads are serial and no-store, with a fifteen-second per-request deadline and a ten-minute observation window. Request timers/listeners are released. Late responses after observation stops cannot update the UI. A failed status check retains the job reference and offers recovery. Unknown initial progress stays indeterminate, rather than presenting a fabricated reported zero.

The source choices have pressed states, labelled inputs and preserved per-source values. Native radio controls take their names from the actual shared voice presets, correcting the old Luna/Sol versus Luna/Sage mismatch. Format, target length, tone and optional direction remain explicit; target length is not promised as exact. The full brief remains in this tab, not in a new persistent content store.

The player rounds the total duration once before splitting minutes and seconds, so 59.6 seconds becomes 1m 0s. Native audio uses preload none. Error/retry leaves the transcript and metadata available; cleanup pauses and detaches the old media resource. Same-origin files retain the download action; remote files are labelled Open MP3 file because a browser download is not guaranteed by a cross-origin link. The actual audio paths were not contacted.

Transcript expansion exposes state and its controlled list. Unknown speaker labels remain literal rather than becoming Host B. Feed filters/search operate on the supplied records, with announced counts, a useful empty state and recovery. Dates use an explicit UK/UTC presentation. The existing server feed reader stays dynamic and unchanged in purpose; no real manifest was loaded.

The shared studio/feed shell, form, progress, player and transcript use one visual system, meaningful focus states, phone layouts and Lucide controls. The generated Lucide favicon retains its licence and a freshness check. Middleware has one exact public static-asset exception for `/icon.svg`; mocked checks retain gating for `/feed`, protected APIs and an icon-prefix lookalike. Sign-in, device-key, quota and generation logic is unchanged. Login receives only a button text-colour correction for the lighter accent.

## Preserved backend boundaries

`preserved-pipeline-20261120.json` records fourteen tracked source files whose Git blob hashes match the baseline, including generation/process/status handlers, the pipeline, script/audio/media/storage/jobs, authentication and device quota helpers. This establishes preserved source bytes, not live authentication, provider, quota or generation correctness. The only middleware difference is the exact static favicon route above.

The normal build was reviewed for import-time IO first. Feed rendering is explicitly dynamic, and generation work remains inside request handlers. A verification-only preload disables JavaScript network/media execution and protected-file access, including main-checkout files, environment files, output manifests and Voicebox profile state. The normal Next build passed under that guard; it recorded no protected IO/network/media-execution attempts. This is build verification, not a successful generation or data-service request.

## Actual offline browser evidence

`review:build` compiles the real client components and stylesheet and rejects server-service imports. The fixture server at 127.0.0.1:4832 serves an allowlisted asset/route set with connect-src none, media-src none and no auth/server handlers. Its visible banner identifies every record, progress value and transcript line as illustrative, with all services disconnected. Source text was written for this review. No generated success is simulated.

- Actual title verified as Podify: offline interface review before proof.
- Desktop 1144px and phone 390px have no page overflow in the brief, progress, player and feed views.
- Switching to the article URL, reviewing it locally and returning to text preserved the hand-written source. The local action explicitly reported that no generation request was sent.
- Native radio ArrowRight selected the mixed voice pair. Source/header controls measured at least44px, with the phone source choices approximately58px and the submit action46px.
- The player layout displays the corrected1m0s rounding. There were no audio elements or active audio links in the fixture, so no media request could follow from these checks.
- Enter expanded the actual transcript list from8 to10 lines and updated aria-expanded.
- Feed Grimoire filtering changed3 to1; an unmatched search produced an empty state; Clear returned3 and All episodes. Its controls measured44px.
- The progress example selected Assembly, exposing aria-valuenow88 and current-step semantics. It is explicitly an illustration, not a running job.
- Browser error log was empty. Viewport reset to1144px and ownership released before another agent used Chrome.

Saved screenshots under `.codex-artifacts`: podify-studio-desktop.jpg, podify-studio-phone.jpg, podify-brief-phone.jpg, podify-progress-phone.jpg, podify-player-desktop.jpg, podify-feed-desktop.jpg and podify-feed-phone.jpg. Desktop studio/player/feed captures were directly inspected after saving. Some viewport captures omit the top banner because of their scroll position; player/feed still show disconnected/illustrative content, and any future portfolio use needs an explicit fixture caption. They must not be presented as generated-output, real-feed or live-site proof. Later changes to hidden initial-progress semantics, request deadlines, remote-link naming and favicon metadata do not change the captured fixture states.

## Checks and limits

Fifty Vitest cases and eleven canonical icon regressions pass. New client checks cover request/result validation, source payload boundaries, duplicate submission, processing failure, bounded and aborted polling, late responses, timer release, duration rollover, safe audio URLs, kept form state, literal transcript labels, media error/cleanup and the static-icon auth boundary. The old feed tests now exercise the actual filter function instead of a duplicate implementation. TypeScript and normal release icon/freshness checks pass. Icon scan: zero blocking findings,41 contextual content-symbol candidates in retained CLI/pipeline source; no workspace-wide clean claim.

The initial lock format6 was incompatible with the declared pnpm10 package manager. Adding the required UI/review dependencies regenerated a valid format9 lock with resolutions inside the existing declared major ranges. Install scripts were disabled, so media binaries were not downloaded or run through postinstall. The resolved UI graph audit still had three high, two moderate and one low findings; a separate compatible dependency follow-up is required before calling that graph clean.

Real generation, provider configuration/quality, audio delivery or playback, codecs/assembly, Blob persistence, private RSS contents, device/account authentication, quota consumption, long/background sessions and other browser/assistive-technology combinations remain unverified. Native audio lifecycle tests use stubs; browser evidence is deliberately media-disconnected. No release, push, merge or deployment was performed.
