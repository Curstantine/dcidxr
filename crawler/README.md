# crawler

Transforms Discord export JSON into circle/link groups, then fetches MEGA folder metadata.

## Commands

- `pnpm run transform [inputPath] [outputPath]`
  - Default input: `dist/input.json`
  - Default output: `dist/transformed.json`
- `pnpm run fetch [inputPath] [outputPath]`
  - Default input: `dist/transformed.json`
  - Default output: `dist/releases.json`

You can also run `node --experimental-strip-types ./src/index.ts --help`.

## Input and output shape

- `transform` expects top-level `messages` array with each message containing `content` text.
- `transform` emits top-level `groups` array:
  - `circle`, `links`, `missingLinks`, `status`, `statusMeta`, `lastUpdated`
- `fetch` expects `groups` from `transform`, then appends:
  - `releases`, `errors`

## Notes

- Status parsing is tolerant of common typos (`Stats`, malformed `Updated`).
- Fetching is globally concurrency-limited across all links.
