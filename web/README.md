# SolidStart Template

This project uses native, context-based authentication featuring OAuth and email-password login, with user data stored in PostgreSQL via Drizzle ORM.

## Installation

Generate the **with-auth** template using your preferred package manager

```bash
# using npm
npm create solid@latest -- -s -t with-auth
```

```bash
# using pnpm
pnpm create solid@latest -s -t with-auth
```

```bash
# using bun
bun create solid@latest --s --t with-auth
```

## Configuration

1. Rename `.env.example` to `.env`

2. Configure PostgreSQL (Railway):

    ```dotenv
    DATABASE_URL=your-railway-postgres-url
    ```

    - In Railway, open your Postgres service, copy the connection string, and set it as `DATABASE_URL` in your app service variables.

3. For Discord OAuth2 to work, update `.env` with your credentials:

    ```dotenv
    DISCORD_ID=your-discord-client-id
    DISCORD_SECRET=your-discord-client-secret
    ```

    - Create a Discord application at [discord.com/developers/applications](https://discord.com/developers/applications) to get your Client ID and Secret.
    - In the app's **OAuth2 → URL Generator** or **Redirects** section, add the following redirect URI:
        ```
        http://localhost:3000/api/oauth/discord
        ```

4. Run migrations:

    ```bash
    pnpm db:generate
    pnpm db:migrate
    ```

5. Railway deploy start command:

    ```bash
    pnpm start:railway
    ```

    This command applies pending migrations and then starts the app.

6. To configure additional providers, refer to the [start-oauth](https://github.com/thomasbuilds/start-oauth#README) documentation

## This project was created with the [Solid CLI](https://github.com/solidjs-community/solid-cli)
