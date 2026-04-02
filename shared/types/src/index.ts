// @plugdash/types - EmDash plugin type definitions
// Derived from emdash-source/packages/core/src/plugins/types.ts

export type { PortableTextBlock, PortableTextSpan } from "@portabletext/types";

// ── Utility ──

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ── Capability ──

export type PluginCapability =
	| "read:content"
	| "write:content"
	| "read:media"
	| "write:media"
	| "network:fetch"
	| "network:fetch:any"
	| "read:users"
	| "email:send"
	| "email:provide"
	| "email:intercept";

// ── KV ──

export interface KVAccess {
	get<T = unknown>(key: string): Promise<T | null>;
	set(key: string, value: unknown): Promise<void>;
	delete(key: string): Promise<void>;
	list(prefix?: string): Promise<Array<{ key: string; value: unknown }>>;
}

// ── Log ──

export interface LogAccess {
	info(message: string, ...args: unknown[]): void;
	warn(message: string, ...args: unknown[]): void;
	error(message: string, ...args: unknown[]): void;
	debug(message: string, ...args: unknown[]): void;
}

// ── Storage ──

export interface StorageCollection {
	get(id: string): Promise<Record<string, unknown> | null>;
	put(id: string, data: Record<string, unknown>): Promise<void>;
	delete(id: string): Promise<void>;
	count(filter?: Record<string, unknown>): Promise<number>;
	query(options?: StorageQueryOptions): Promise<PaginatedResult<StorageItem>>;
}

export interface StorageQueryOptions {
	orderBy?: Record<string, "asc" | "desc">;
	limit?: number;
	cursor?: string;
	filter?: Record<string, unknown>;
}

export interface StorageItem {
	id: string;
	data: Record<string, unknown>;
}

// ── Content ──

export interface ContentItem {
	id: string;
	type: string;
	slug: string | null;
	status: string;
	data: Record<string, unknown>;
	createdAt: string;
	updatedAt: string;
	publishedAt: string | null;
}

export interface ContentListOptions {
	limit?: number;
	cursor?: string;
	orderBy?: Record<string, "asc" | "desc">;
	status?: string;
}

export interface ContentAccess {
	get(collection: string, id: string): Promise<ContentItem | null>;
	list(
		collection: string,
		options?: ContentListOptions,
	): Promise<PaginatedResult<ContentItem>>;
	create?(
		collection: string,
		data: Record<string, unknown>,
	): Promise<ContentItem>;
	update?(
		collection: string,
		id: string,
		data: Record<string, unknown>,
	): Promise<ContentItem>;
	delete?(collection: string, id: string): Promise<boolean>;
}

export interface ContentAccessWithWrite extends ContentAccess {
	create(
		collection: string,
		data: Record<string, unknown>,
	): Promise<ContentItem>;
	update(
		collection: string,
		id: string,
		data: Record<string, unknown>,
	): Promise<ContentItem>;
	delete(collection: string, id: string): Promise<boolean>;
}

// ── Media ──

export interface MediaAccess {
	get(id: string): Promise<Record<string, unknown> | null>;
	list(options?: { limit?: number; cursor?: string }): Promise<
		PaginatedResult<Record<string, unknown>>
	>;
	getUploadUrl?(): Promise<{ url: string; id: string }>;
	delete?(id: string): Promise<boolean>;
}

// ── HTTP ──

export interface HttpAccess {
	fetch(url: string, init?: RequestInit): Promise<Response>;
}

// ── Users ──

export interface UserAccess {
	get(id: string): Promise<Record<string, unknown> | null>;
	list(options?: { limit?: number; cursor?: string }): Promise<
		PaginatedResult<Record<string, unknown>>
	>;
	getByEmail?(email: string): Promise<Record<string, unknown> | null>;
}

// ── Email ──

export interface EmailAccess {
	send(options: {
		to: string | string[];
		subject: string;
		html?: string;
		text?: string;
	}): Promise<void>;
}

// ── Cron ──

export interface CronAccess {
	schedule(
		name: string,
		cron: string,
		handler: () => Promise<void>,
	): void;
}

// ── Site ──

export interface SiteInfo {
	url: string;
	name: string;
}

// ── Pagination ──

export interface PaginatedResult<T> {
	items: T[];
	cursor: string | null;
	hasMore: boolean;
}

// ── Plugin Context ──

export interface PluginContext {
	plugin: { id: string; version: string };
	storage: Record<string, StorageCollection>;
	kv: KVAccess;
	log: LogAccess;
	site: SiteInfo;
	url(path: string): string;
	content?: ContentAccess;
	media?: MediaAccess;
	http?: HttpAccess;
	users?: UserAccess;
	cron?: CronAccess;
	email?: EmailAccess;
}

// ── Hook Events ──

export interface ContentHookEvent {
	content: Record<string, unknown>;
	collection: string;
	isNew: boolean;
}

export interface ContentDeleteEvent {
	id: string;
	collection: string;
}

export interface MediaUploadEvent {
	media: { id: string };
}

export interface LifecycleEvent {
	type: string;
}

// ── Hook Config ──

export interface HookConfig<THandler> {
	priority?: number;
	timeout?: number;
	dependencies?: string[];
	errorPolicy?: "continue" | "abort";
	exclusive?: boolean;
	handler: THandler;
}

// ── Plugin Definition (Standard format) ──

export interface StandardPluginDefinition {
	hooks?: Record<string, HookConfig<(...args: any[]) => Promise<any>>>;
	routes?: Record<string, { public?: boolean; handler: (...args: any[]) => Promise<any> }>;
}

// ── Plugin Descriptor ──

export interface PluginDescriptor<TOptions = Record<string, unknown>> {
	id: string;
	version: string;
	format?: "standard" | "native";
	entrypoint: string;
	options?: TOptions;
	capabilities?: PluginCapability[];
	allowedHosts?: string[];
	storage?: Record<string, { indexes: string[] }>;
	adminPages?: Array<{ path: string; label: string; icon?: string }>;
	adminWidgets?: Array<{ id: string; title: string; size?: string }>;
}
