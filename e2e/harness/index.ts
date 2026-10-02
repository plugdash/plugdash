// Shared helpers for e2e specs that run against the real EmDash site built by
// scripts/real-emdash/setup.sh. See README.md in this folder.
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdirSync,
	openSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";

export const ROOT = resolve(__dirname, "../..");
export const SITE = join(ROOT, ".real-emdash/site");
const PROD_DIR = join(ROOT, ".real-emdash/prod");
const DEV_LOG = join(SITE, ".astro/dev.log");

export const DEV_PORT = Number(process.env.E2E_PORT ?? 4321);
export const PROD_PORT = Number(process.env.E2E_PROD_PORT ?? 4400);

// ---------- servers ----------

export interface Server {
	baseURL: string;
	stop: () => Promise<void>;
}

async function waitFor200(url: string, timeoutMs = 180_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	let last = "no response";
	while (Date.now() < deadline) {
		try {
			const res = await fetch(url, { redirect: "manual" });
			if (res.status === 200) return;
			last = `HTTP ${res.status}`;
		} catch (err) {
			last = String(err);
		}
		await new Promise((r) => setTimeout(r, 1000));
	}
	throw new Error(`${url} did not return 200 within ${timeoutMs}ms (last: ${last})`);
}

function pnpm(args: string[]): void {
	execFileSync("pnpm", args, { cwd: SITE, stdio: "inherit" });
}

/** Starts `astro dev` on E2E_PORT (default 4321) and waits for HTTP 200. */
export async function startDev(): Promise<Server> {
	if (!existsSync(join(SITE, "package.json"))) {
		throw new Error(`${SITE} is missing. Run: bash scripts/real-emdash/setup.sh`);
	}
	const baseURL = `http://127.0.0.1:${DEV_PORT}`;
	// astro 7 runs dev as a background daemon and writes its output to .astro/dev.log
	try {
		pnpm(["astro", "dev", "stop"]);
	} catch {
		// nothing running
	}
	mkdirSync(join(SITE, ".astro"), { recursive: true });
	writeFileSync(DEV_LOG, "");
	pnpm(["astro", "dev", "--background", "--host", "127.0.0.1", "--port", String(DEV_PORT)]);
	await waitFor200(baseURL);
	process.env.E2E_BASE_URL = baseURL;
	process.env.E2E_LOG_FILE = DEV_LOG;
	return {
		baseURL,
		stop: async () => pnpm(["astro", "dev", "stop"]),
	};
}

/**
 * Production check: builds the site, copies the dev DB (SQLite backup API)
 * into an empty directory, drops plugin config rows, and runs
 * `node dist/server/entry.mjs` there on E2E_PROD_PORT (default 4400).
 * Starts a dev server first to create the admin user and API token, since
 * dev-bypass does not exist in production.
 */
export async function startProd(): Promise<Server> {
	const dev = await startDev();
	await session();
	pnpm(["build"]);

	rmSync(PROD_DIR, { recursive: true, force: true });
	mkdirSync(PROD_DIR, { recursive: true });
	const src = new DatabaseSync(join(SITE, "data.db"));
	await backup(src, join(PROD_DIR, "data.db"));
	src.close();
	const db = new DatabaseSync(join(PROD_DIR, "data.db"));
	db.exec("DELETE FROM options WHERE name LIKE 'plugin:%config%'");
	// emdash:site_url is written once from the first request origin (the dev
	// server), and ctx.site.url would report the dev host in prod otherwise
	db.prepare("UPDATE options SET value = ? WHERE name = 'emdash:site_url'").run(
		JSON.stringify(`http://127.0.0.1:${PROD_PORT}`),
	);
	db.close();
	if (existsSync(join(SITE, "uploads")))
		cpSync(join(SITE, "uploads"), join(PROD_DIR, "uploads"), { recursive: true });
	await dev.stop();

	const logFile = join(PROD_DIR, "server.log");
	const out = openSync(logFile, "a");
	const child: ChildProcess = spawn("node", [join(SITE, "dist/server/entry.mjs")], {
		cwd: PROD_DIR,
		env: { ...process.env, HOST: "127.0.0.1", PORT: String(PROD_PORT) },
		stdio: ["ignore", out, out],
	});
	const baseURL = `http://127.0.0.1:${PROD_PORT}`;
	await waitFor200(baseURL, 60_000);
	process.env.E2E_BASE_URL = baseURL;
	process.env.E2E_LOG_FILE = logFile;
	return {
		baseURL,
		stop: async () => {
			child.kill();
		},
	};
}

export function baseURL(): string {
	return process.env.E2E_BASE_URL ?? `http://127.0.0.1:${DEV_PORT}`;
}

// ---------- auth + api ----------

export interface Session {
	cookie: string;
	token: string;
}

/**
 * Logs in through /_emdash/api/setup/dev-bypass (dev only) and mints an API
 * token. Each call revokes the previous token, so global setup calls it once
 * and shares the result with workers through env vars.
 */
export async function session(): Promise<Session> {
	if (process.env.E2E_TOKEN) {
		return { cookie: process.env.E2E_COOKIE ?? "", token: process.env.E2E_TOKEN };
	}
	const res = await fetch(`${baseURL()}/_emdash/api/setup/dev-bypass?token=1`);
	const body = (await res.json()) as { data?: { token?: string } };
	const token = body.data?.token;
	if (!res.ok || !token)
		throw new Error(`dev-bypass failed: HTTP ${res.status} ${JSON.stringify(body)}`);
	const cookie = res.headers
		.getSetCookie()
		.map((c) => c.split(";")[0])
		.join("; ");
	process.env.E2E_TOKEN = token;
	process.env.E2E_COOKIE = cookie;
	return { cookie, token };
}

export interface ApiResponse<T = any> {
	status: number;
	/** Parsed JSON body, envelope included: `{ success, data }` or `{ error }`. */
	body: T;
	/** Shortcut for `body.data`. */
	data: any;
}

/** Calls the EmDash API as the dev admin. `path` starts with `/_emdash/...` or is relative to the site. */
export async function api<T = any>(
	method: string,
	path: string,
	body?: unknown,
): Promise<ApiResponse<T>> {
	const { cookie, token } = await session();
	const headers: Record<string, string> = {
		"X-EmDash-Request": "1",
		Authorization: `Bearer ${token}`,
	};
	if (cookie) headers.Cookie = cookie;
	if (body !== undefined) headers["Content-Type"] = "application/json";
	const res = await fetch(new URL(path, baseURL()), {
		method,
		headers,
		body: body === undefined ? undefined : JSON.stringify(body),
		redirect: "manual",
	});
	const text = await res.text();
	let parsed: any = text;
	try {
		parsed = JSON.parse(text);
	} catch {
		// not JSON, keep the text
	}
	return { status: res.status, body: parsed, data: parsed?.data };
}

async function ok(method: string, path: string, body?: unknown): Promise<any> {
	const res = await api(method, path, body);
	if (res.status >= 400)
		throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(res.body)}`);
	return res.data;
}

// ---------- content ----------

export interface PortableTextBlock {
	_type: string;
	_key?: string;
	[key: string]: unknown;
}

let keySeq = 0;
const key = () => `k${Date.now().toString(36)}${(keySeq++).toString(36)}`;

/** A Portable Text text block. `style` is "normal", "h2", "h3", ... */
export function block(text: string, style = "normal"): PortableTextBlock {
	return {
		_type: "block",
		_key: key(),
		style,
		markDefs: [],
		children: [{ _type: "span", _key: key(), text, marks: [] }],
	};
}

export interface Post {
	id: string;
	slug: string;
	status: string;
	data: Record<string, any>;
	[key: string]: any;
}

/**
 * Creates a draft post. `blocks` may mix strings (paragraphs) and Portable
 * Text blocks. The slug defaults to a unique value derived from the title.
 */
export async function createPost(opts: {
	title: string;
	blocks?: Array<string | PortableTextBlock>;
	slug?: string;
	data?: Record<string, unknown>;
	collection?: string;
}): Promise<Post> {
	const slug =
		opts.slug ??
		`${opts.title
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "")}-${key()}`;
	const content = (opts.blocks ?? []).map((b) => (typeof b === "string" ? block(b) : b));
	const data = await ok("POST", `/_emdash/api/content/${opts.collection ?? "posts"}`, {
		data: { title: opts.title, content, ...opts.data },
		slug,
	});
	return data.item;
}

export async function publish(id: string, collection = "posts"): Promise<Post> {
	return (await ok("POST", `/_emdash/api/content/${collection}/${id}/publish`, {})).item;
}

export async function unpublish(id: string, collection = "posts"): Promise<Post> {
	return (await ok("POST", `/_emdash/api/content/${collection}/${id}/unpublish`, {})).item;
}

/** Same request the admin editor sends 2 s after typing stops. */
export async function autosave(
	id: string,
	data: Record<string, unknown>,
	collection = "posts",
): Promise<Post> {
	return (await ok("PUT", `/_emdash/api/content/${collection}/${id}`, { data, skipRevision: true }))
		.item;
}

export async function getPost(id: string, collection = "posts"): Promise<Post> {
	return (await ok("GET", `/_emdash/api/content/${collection}/${id}`)).item;
}

// ---------- logs ----------

/** Current end of the server log. Pass it to pluginLog() to see only newer lines. */
export function logMark(): number {
	const file = process.env.E2E_LOG_FILE ?? DEV_LOG;
	return existsSync(file) ? statSync(file).size : 0;
}

/**
 * Lines from the server log (dev: .astro/dev.log, prod: server stdout) that
 * start with `[plugin:`. `since` is a byte offset from logMark().
 */
export function pluginLog(since = 0): string[] {
	const file = process.env.E2E_LOG_FILE ?? DEV_LOG;
	if (!existsSync(file)) return [];
	return readFileSync(file)
		.subarray(since)
		.toString("utf8")
		.split("\n")
		.map((line) => {
			// dev.log wraps some lines as {"message": "..."}
			if (!line.startsWith("{")) return line;
			try {
				return String(JSON.parse(line).message ?? line);
			} catch {
				return line;
			}
		})
		.filter((line) => line.startsWith("[plugin:"));
}
