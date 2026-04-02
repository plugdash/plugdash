// @plugdash/testing - Mock context factories for plugin tests

import { vi } from "vitest";
import type { PluginContext, ContentAccess } from "@plugdash/types";

export function makeContext(
	overrides?: Partial<PluginContext>,
): PluginContext {
	const defaultContent: ContentAccess = {
		get: vi.fn().mockResolvedValue(null),
		list: vi.fn().mockResolvedValue({ items: [], cursor: null, hasMore: false }),
		create: vi.fn().mockResolvedValue({}),
		update: vi.fn().mockResolvedValue({}),
		delete: vi.fn().mockResolvedValue(true),
	};

	return {
		plugin: { id: "test-plugin", version: "0.0.0" },
		storage: {},
		kv: {
			get: vi.fn().mockResolvedValue(null),
			set: vi.fn().mockResolvedValue(undefined),
			delete: vi.fn().mockResolvedValue(undefined),
			list: vi.fn().mockResolvedValue([]),
		},
		log: {
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
			debug: vi.fn(),
		},
		site: { url: "https://example.com", name: "Test Site" },
		url: (path: string) => `https://example.com${path}`,
		content: defaultContent,
		media: undefined,
		http: undefined,
		users: undefined,
		cron: undefined,
		email: undefined,
		...overrides,
	};
}

export function makeContentItem(
	overrides?: Record<string, unknown>,
): Record<string, unknown> {
	const defaults: Record<string, unknown> = {
		id: "content-001",
		type: "posts",
		slug: "test-post",
		status: "published",
		data: {
			body: [
				{
					_type: "block",
					_key: "default-block",
					children: [
						{
							_type: "span",
							_key: "default-span",
							text: "Default test content for reading time calculation.",
							marks: [],
						},
					],
					markDefs: [],
					style: "normal",
				},
			],
			metadata: {},
		},
		createdAt: "2026-01-01T00:00:00Z",
		updatedAt: "2026-01-01T00:00:00Z",
		publishedAt: "2026-01-01T00:00:00Z",
	};

	return { ...defaults, ...overrides };
}
