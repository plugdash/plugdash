// Hand-built Ghost export fixtures, small enough to read in one glance.
// Shapes follow Ghost's own JSON exporter: `{ db: [{ meta, data }] }`.

export function ghostV5Export() {
	return {
		db: [
			{
				meta: { exported_on: 1700000000000, version: "5.78.0" },
				data: {
					posts: [
						{
							id: "1",
							uuid: "uuid-1",
							title: "Hello Ghost",
							slug: "hello-ghost",
							html: "<p>First <strong>post</strong>.</p>",
							feature_image: "__GHOST_URL__/content/images/2024/01/cover.jpg",
							feature_image_alt: "A cover",
							published_at: "2024-01-15T10:00:00.000Z",
							created_at: "2024-01-14T09:00:00.000Z",
							updated_at: "2024-01-16T09:00:00.000Z",
							status: "published",
							custom_excerpt: "An intro",
							meta_title: "Hello Ghost | SEO",
							meta_description: "SEO description",
							type: "post",
						},
						{
							id: "2",
							title: "Draft Post",
							slug: "draft-post",
							html: "<p>Unfinished.</p>",
							status: "draft",
							type: "post",
						},
						{
							id: "3",
							title: "About",
							slug: "about",
							html: "<p>About us.</p>",
							status: "published",
							type: "page",
						},
					],
					tags: [
						{ id: "t1", name: "News", slug: "news", visibility: "public" },
						{ id: "t2", name: "Internal", slug: "internal", visibility: "internal" },
					],
					users: [
						{ id: "u1", name: "Ada Lovelace", slug: "ada", email: "ada@example.com" },
					],
					posts_tags: [
						{ post_id: "1", tag_id: "t1", sort_order: 0 },
						{ post_id: "1", tag_id: "t2", sort_order: 1 },
					],
					posts_authors: [{ post_id: "1", author_id: "u1", sort_order: 0 }],
					settings: [{ key: "title", value: "Ada's Blog" }],
				},
			},
		],
	};
}

export function ghostV4Export() {
	return {
		db: [
			{
				meta: { exported_on: 1600000000000, version: "4.32.2" },
				data: {
					posts: [
						{
							id: "10",
							title: "Old Post",
							slug: "old-post",
							html: "<p>From Ghost 4.</p>",
							status: "published",
							page: false,
							published_at: "2021-01-01T00:00:00.000Z",
						},
						{
							id: "11",
							title: "Old Page",
							slug: "old-page",
							html: "<p>A page.</p>",
							status: "published",
							page: true,
						},
					],
					tags: [],
					users: [],
					posts_tags: [],
					posts_authors: [],
					settings: [],
				},
			},
		],
	};
}
