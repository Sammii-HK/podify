# Podify compatible dependency follow-up, 20 November 2026

Separate from functional batch `4d7ac4a`. No framework/React/SDK major migration and no provider, account, Blob, database or media-generation operation was used.

The required UI/review dependency installation exposed an old format-6 lock that the declared pnpm 10 could not freeze. That functional batch regenerated a format-9 lock inside the existing declared major ranges. Its resolved UI graph had three high, two moderate and one low registry advisories. This is not a measured pristine-baseline audit.

## Scoped changes

- `next@15.5.29>postcss` resolves to 8.5.33 instead of Next's pinned 8.4.31. A regression resolves the actual processor under Next and parses the application's real stylesheet.
- The old `@vercel/cli-config@0.3.1` under Blob's OIDC chain resolves Zod 4.6.7 instead of 4.1.11, staying within major 4. The separate newer config chain already used 4.6.7. A regression resolves the actual nested Zod without loading account configuration and exercises valid/bounded invalid fixture schemas.
- The local review compiler moves from esbuild 0.27.4 to 0.28.2. Its real TypeScript transform and the complete offline client bundle both pass.

Next remains 15.5.29 and React remains 19.3.1 in this follow-up. No broad override silently replaces a framework or schema major. The lock is frozen-installable with pnpm 10; install scripts remain disabled, so no FFmpeg download/postinstall ran.

## Verification

Fifty-three Vitest cases and eleven canonical icon regressions pass. Normal release lint includes icon and generated-brand freshness checks plus TypeScript. The real client-only fixture bundle and stylesheet compile without server services. The normal Next production build passes under `scripts/build-io-guard.mjs`, which disconnects network/media execution and protected runtime/environment paths. No protected IO/network/media-execution attempt was recorded in that build. Feed and API routes stay dynamic.

The full and production registry audits now both report zero findings. Machine-readable counts and loaded versions are in `dependency-audit-20261120.json`. This is a package-graph result, not proof of absent vulnerabilities, live exploit reachability or successful provider/authentication behaviour.

The actual offline browser evidence belongs to the unchanged visual presentation recorded in `product-review-20261120.md`. No generation, audio playback/download, private RSS, account, device quota or Blob request was used to validate these dependencies. The inherited device-prefix/job-ownership boundary remains a separate release review item. No push, merge, deployment or publication was performed.
