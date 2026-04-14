# Crawler

Data pipeline for transforming, fetching, and syncing doujin music collection metadata from MEGA.

## What It Does

The crawler processes data in three stages:

1. **Transform** - Converts raw input data into normalized format
2. **Fetch** - Retrieves release metadata from MEGA links
3. **Sync** - Writes processed data to the PostgreSQL database

It also supports a snapshot-based ingestion flow for deployed environments:

1. **Setup** - Downloads the latest raw messages JSON from `MESSAGES_DL_URL`
2. **Start** - Finds the latest saved message snapshot in the mounted data volume
3. **Pipeline** - Runs transform, fetch, and sync using files derived from that snapshot

## Prerequisites

- Node.js (see `.node-version`)
- pnpm 10.33.0+
- PostgreSQL database (for sync command)

## Environment Variables

Create a `.env` file in the `crawler` directory:

```/dev/null/.env#L1-3
DATABASE_URL=postgresql://user:password@localhost:5432/dcidxr
MESSAGES_DL_URL=https://example.com/messages.json
RAILWAY_VOLUME_MOUNT_PATH=./dist
```

### Variables

- `DATABASE_URL` - PostgreSQL connection string used by the sync stage
- `MESSAGES_DL_URL` - URL that returns the raw message JSON payload
- `RAILWAY_VOLUME_MOUNT_PATH` - Optional mounted storage path. If not set, the crawler defaults to `/data`

## Getting Started

1. Install dependencies (from workspace root):
```/dev/null/commands.sh#L1-1
pnpm install
```

2. Run the pipeline stages manually in order:
```/dev/null/commands.sh#L1-7
# Transform input data
pnpm --filter crawler transform

# Fetch release data from MEGA
pnpm --filter crawler fetch

# Sync to database
pnpm --filter crawler sync
```

## Available Commands

- `pnpm start` - Run the pipeline using the newest snapshot in the mounted volume
- `pnpm transform [inputPath] [outputPath]` - Transform raw data
- `pnpm fetch [inputPath] [outputPath]` - Fetch release metadata
- `pnpm sync [inputPath]` - Sync data to database

## Default Paths

### Manual stage commands

- **transform**: `dist/input.json` → `dist/transformed.json`
- **fetch**: `dist/transformed.json` → `dist/releases.json`
- **sync**: `dist/releases.json`

You can override these by passing custom paths as arguments.

### Start command

The `start` command does not use `dist/` defaults. It uses the latest snapshot from the mounted volume and writes timestamped derived outputs back into that same volume.

## Code Quality Scripts

- `pnpm format` - Format code with Biome
- `pnpm lint` - Lint code with Biome
- `pnpm check` - Run format and lint checks

## Project Structure

```/dev/null/tree.txt#L1-9
script/
└── setup.ts      # Downloads raw messages into the mounted volume

src/
├── index.ts      # CLI entry point
├── start.ts      # Runs the pipeline from the latest saved snapshot
├── transform.ts  # Data transformation logic
├── fetch.ts      # MEGA data fetching
├── sync.ts       # Database synchronization
└── utils/        # Helper utilities
```

## How It Works

### Manual mode

1. **Transform**: Takes raw collection data and normalizes it into a consistent format
2. **Fetch**: Reads transformed data, connects to MEGA using the `megajs` package, and retrieves file/folder metadata
3. **Sync**: Takes the fetched release data and writes it to the PostgreSQL database using Drizzle ORM

### Snapshot mode

1. **Setup** downloads and validates the raw JSON payload
2. **Start** selects the latest timestamped message snapshot
3. **Transform** writes normalized output for that snapshot
4. **Fetch** resolves MEGA releases for that snapshot
5. **Sync** persists the final result into PostgreSQL

## Contributing

1. Create a feature branch
2. Make your changes
3. Run `pnpm check` to ensure code quality
4. Test the pipeline stages with sample data
5. Submit a pull request

## Notes

- The crawler uses Node.js experimental TypeScript support (`--experimental-strip-types`)
- MEGA operations are handled by the `megajs` workspace package
- The database schema is defined in the `web` workspace
- Processing large collections may take significant time
