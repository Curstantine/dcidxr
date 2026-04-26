# Doujin Cafe Indexer

A monorepo for indexing and browsing doujin music collections from MEGA.

## Projects

- **[web](./web)** - Web slop for browsing the indexed collection
- **[crawler](./crawler)** - Data crawler and transformer for MEGA links
- **megajs** - Internal MEGA.nz client library
- **[mega](./mega)** - Go rewrite of the internal MEGA.nz client library

## Prerequisites

- Node.js (see `.node-version` for required version)
- pnpm (use corepack)
- Go (via Nix dev shell or local install)
- PostgreSQL database

## Getting Started

1. Install dependencies:
```bash
pnpm install
```

2. Set up environment variables (see individual project READMEs)

## Development Workflow

Each project has its own scripts and can be run independently. See the README in each project directory for specific instructions.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `pnpm run check` to ensure code quality
5. Submit a pull request

## License

[MIT](./LICENSE.md)
