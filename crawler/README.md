# Crawler

Data pipeline for transforming, fetching, and syncing doujin music collection metadata from MEGA.

## What It Does

The crawler processes data in three stages:

1. **Transform** - Converts raw input data into normalized format
2. **Fetch** - Retrieves release metadata from MEGA links
3. **Sync** - Writes processed data to the PostgreSQL database

## Prerequisites

- Node.js (see `.node-version`)
- pnpm 10.33.0+
- PostgreSQL database (for sync command)

## Environment Variables

Create a `.env` file in the `crawler` directory:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/dcidxr
```

## Getting Started

1. Install dependencies (from workspace root):
```bash
pnpm install
```

2. Run the pipeline stages in order:
```bash
# Transform input data
pnpm --filter crawler transform

# Fetch release data from MEGA
pnpm --filter crawler fetch

# Sync to database
pnpm --filter crawler sync
```

## Available Commands

- `pnpm transform [inputPath] [outputPath]` - Transform raw data
- `pnpm fetch [inputPath] [outputPath]` - Fetch release metadata
- `pnpm sync [inputPath]` - Sync data to database

### Default Paths

- **transform**: `dist/input.json` → `dist/transformed.json`
- **fetch**: `dist/transformed.json` → `dist/releases.json`
- **sync**: `dist/releases.json`

You can override these by passing custom paths as arguments.

## Code Quality Scripts

- `pnpm format` - Format code with Biome
- `pnpm lint` - Lint code with Biome
- `pnpm check` - Run format and lint checks

## Project Structure

```
src/
├── index.ts       # CLI entry point
├── transform.ts   # Data transformation logic
├── fetch.ts       # MEGA data fetching
├── sync.ts        # Database synchronization
└── utils/         # Helper utilities
```

## How It Works

1. **Transform**: Takes raw collection data and normalizes it into a consistent format
2. **Fetch**: Reads transformed data, connects to MEGA using the `megajs` package, and retrieves file/folder metadata
3. **Sync**: Takes the fetched release data and writes it to the PostgreSQL database using Drizzle ORM

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