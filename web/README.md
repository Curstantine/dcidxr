# web

Browsing and searching the Doujin Cafe indexed music collection.

## Prerequisites

- Node.js (see `.node-version`)
- pnpm 10.33.0+
- PostgreSQL database

## Environment Variables

Copy the `.env.example` to `.env.local` and update the necessary variables.

## Getting Started

1. Install dependencies (from workspace root):
```
pnpm install
```

2. Set up the database:

```bash
# Generate migration files from schema
pnpm --filter web db:generate

# Apply migrations to database
pnpm --filter web db:migrate
```

3. Start the development server:
```bash
pnpm --filter web dev
```

The application will be available at `http://localhost:3000`.

## Available Scripts

- `pnpm dev` - Start development server on port 3000
- `pnpm build` - Build for production
- `pnpm start` - Start production server
- `pnpm preview` - Preview production build
- `pnpm test` - Run tests
- `pnpm format` - Format code with Biome
- `pnpm lint` - Lint code with Biome
- `pnpm check` - Run format and lint checks

### Database Scripts

**Migration workflow (recommended for production):**
- `pnpm db:generate` - Generate migration files from schema changes
- `pnpm db:migrate` - Apply pending migrations to database

**Database management:**
- `pnpm db:studio` - Open Drizzle Studio (visual database browser)

## Project Structure

```
src/
├── auth/           # Authentication configuration
├── components/     # Reusable UI components
├── db/             # Database schema and configuration
├── integrations/   # Third-party integrations
├── queries/        # Data fetching queries
├── routes/         # Application routes
├── types/          # TypeScript types
└── utils/          # Utility functions
```

## Contributing

1. Create a feature branch
2. Make your changes
3. Run `pnpm check` to ensure code quality
4. Submit a pull request

## Deployment

This application is configured for deployment on Railway (see `railway.json`). Ensure all environment variables are set in your deployment environment.
