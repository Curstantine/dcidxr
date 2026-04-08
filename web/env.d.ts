/// <reference types="vite/client" />

interface ImportMetaEnv {
	SESSION_SECRET: string;
	DATABASE_URL: string;
	DISCORD_ID: string;
	DISCORD_SECRET: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

declare namespace NodeJS {
	interface ProcessEnv extends ImportMetaEnv {}
}
