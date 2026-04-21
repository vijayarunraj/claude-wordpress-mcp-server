/**
 * WordPress Posts tools — CRUD for /wp/v2/posts
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  wpRequest,
  extractPagination,
  handleWpError,
  truncateIfNeeded,
} from "../services/wordpress.js";
import {
  ResponseFormat,
  ResponseFormatSchema,
  PaginationSchema,
  PostStatusSchema,
  OpenCloseSchema,
  stripHtml,
  formatDate,
} from "../schemas/common.js";
import { WpPost } from "../types.js";
import { CHARACTER_LIMIT } from "../constants.js";

export function registerPostTools(server: McpServer): void {

  // ── List posts ─────────────────────────────────────────────────────────────

  server.registerTool(
    "wp_list_posts",
    {
      title: "List WordPress Posts",
      description: `List blog posts from the WordPress site with filtering and pagination.

Returns a paginated list of posts. Use filters to narrow results by status, author, category, tag, or search term.

Args:
  - status: Filter by post status (default: 'publish'). Use 'draft' to see unpublished posts.
  - search: Full-text search across post title and content.
  - author: Filter by author user ID.
  - categories: Filter by category ID (comma-separated list of IDs not supported — use one ID).
  - tags: Filter by tag ID.
  - page: Page number (default: 1).
  - per_page: Items per page, 1–100 (default: 10).
  - order: 'asc' or 'desc' (default: 'desc').
  - orderby: Sort field — 'date', 'title', 'id', 'modified', 'relevance' (default: 'date').
  - response_format: 'markdown' (default) or 'json'.

Returns a list of posts with id, title, status, date, author, excerpt, and link.`,
      inputSchema: PaginationSchema.extend({
        status: PostStatusSchema.optional().describe("Filter by post status (default: publish)"),
        search: z.string().optional().describe("Full-text search across title and content"),
        author: z.number().int().positive().optional().describe("Filter by author user ID"),
        categories: z.number().int().positive().optional().describe("Filter by category ID"),
        tags: z.number().int().positive().optional().describe("Filter by tag ID"),
        response_format: ResponseFormatSchema,
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const { data: posts, response } = await wpRequest<WpPost[]>(
          "GET",
          "/posts",
          undefined,
          {
            status: params.status ?? "publish",
            search: params.search,
            author: params.author,
            categories: params.categories,
            tags: params.tags,
            page: params.page,
            per_page: params.per_page,
            order: params.order,
            orderby: params.orderby ?? "date",
            _fields: "id,date,slug,status,type,link,title,excerpt,author,categories,tags,featured_media,sticky",
          }
        );

        const pagination = extractPagination(response, params.page, params.per_page);

        if (!posts.length) {
          return {
            content: [{ type: "text", text: "No posts found matching your criteria." }],
          };
        }

        let text: string;
        if (params.response_format === ResponseFormat.JSON) {
          text = JSON.stringify({ pagination, posts }, null, 2);
        } else {
          const lines: string[] = [
            `# WordPress Posts (Page ${pagination.page}/${pagination.total_pages}, Total: ${pagination.total})`,
            "",
          ];
          for (const post of posts) {
            lines.push(`## [${post.title.rendered}](${post.link}) — ID: ${post.id}`);
            lines.push(`- **Status**: ${post.status} | **Date**: ${formatDate(post.date)}`);
            lines.push(`- **Author ID**: ${post.author} | **Sticky**: ${post.sticky}`);
            if (post.excerpt?.rendered) {
              lines.push(`- **Excerpt**: ${stripHtml(post.excerpt.rendered).slice(0, 200)}`);
            }
            lines.push("");
          }
          if (pagination.has_more) {
            lines.push(`*Page ${pagination.page} of ${pagination.total_pages}. Use page=${pagination.next_page} to see more.*`);
          }
          text = lines.join("\n");
        }

        return { content: [{ type: "text", text: truncateIfNeeded(text, CHARACTER_LIMIT) }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleWpError(error) }] };
      }
    }
  );

  // ── Get post ───────────────────────────────────────────────────────────────

  server.registerTool(
    "wp_get_post",
    {
      title: "Get WordPress Post",
      description: `Retrieve a single WordPress post by its ID.

Returns the full post content, metadata, categories, tags, and settings.

Args:
  - id: The post ID (required).
  - response_format: 'markdown' (default) or 'json'.`,
      inputSchema: z.object({
        id: z.number().int().positive().describe("Post ID"),
        response_format: ResponseFormatSchema,
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const { data: post } = await wpRequest<WpPost>("GET", `/posts/${params.id}`);

        let text: string;
        if (params.response_format === ResponseFormat.JSON) {
          text = JSON.stringify(post, null, 2);
        } else {
          text = [
            `# ${post.title.rendered} (ID: ${post.id})`,
            "",
            `**Status**: ${post.status} | **Date**: ${formatDate(post.date)} | **Modified**: ${formatDate(post.modified)}`,
            `**Author ID**: ${post.author} | **Slug**: ${post.slug}`,
            `**Link**: ${post.link}`,
            `**Categories**: ${post.categories?.join(", ") || "none"} | **Tags**: ${post.tags?.join(", ") || "none"}`,
            `**Comment Status**: ${post.comment_status} | **Featured Media ID**: ${post.featured_media || "none"}`,
            "",
            "## Content",
            stripHtml(post.content?.rendered ?? ""),
          ].join("\n");
        }

        return { content: [{ type: "text", text: truncateIfNeeded(text, CHARACTER_LIMIT) }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleWpError(error) }] };
      }
    }
  );

  // ── Create post ────────────────────────────────────────────────────────────

  server.registerTool(
    "wp_create_post",
    {
      title: "Create WordPress Post",
      description: `Create a new WordPress blog post.

Args:
  - title: Post title (required).
  - content: Post body in HTML or plain text (required).
  - status: 'publish', 'draft' (default), 'pending', 'private', or 'future'.
  - excerpt: Optional short summary.
  - slug: URL-friendly slug (auto-generated from title if omitted).
  - author: Author user ID (defaults to authenticated user).
  - categories: Array of category IDs.
  - tags: Array of tag IDs.
  - featured_media: Featured image media ID.
  - comment_status: 'open' or 'closed'.
  - ping_status: 'open' or 'closed'.
  - sticky: Whether to stick the post to the front page.
  - format: Post format — 'standard', 'aside', 'chat', 'gallery', 'link', 'image', 'quote', 'status', 'video', 'audio'.

Returns the created post with its new ID.`,
      inputSchema: z.object({
        title: z.string().min(1).describe("Post title"),
        content: z.string().min(1).describe("Post content (HTML or plain text)"),
        status: PostStatusSchema.default("draft").optional(),
        excerpt: z.string().optional().describe("Short summary / excerpt"),
        slug: z.string().optional().describe("URL slug (auto-generated if omitted)"),
        author: z.number().int().positive().optional().describe("Author user ID"),
        categories: z.array(z.number().int().positive()).optional().describe("Array of category IDs"),
        tags: z.array(z.number().int().positive()).optional().describe("Array of tag IDs"),
        featured_media: z.number().int().nonnegative().optional().describe("Featured image media ID"),
        comment_status: OpenCloseSchema.optional(),
        ping_status: OpenCloseSchema.optional(),
        sticky: z.boolean().optional().describe("Stick post to front page"),
        format: z
          .enum(["standard", "aside", "chat", "gallery", "link", "image", "quote", "status", "video", "audio"])
          .optional()
          .describe("Post format"),
      }).strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const body: Record<string, unknown> = {
          title: params.title,
          content: params.content,
          status: params.status ?? "draft",
        };
        if (params.excerpt !== undefined) body.excerpt = params.excerpt;
        if (params.slug !== undefined) body.slug = params.slug;
        if (params.author !== undefined) body.author = params.author;
        if (params.categories !== undefined) body.categories = params.categories;
        if (params.tags !== undefined) body.tags = params.tags;
        if (params.featured_media !== undefined) body.featured_media = params.featured_media;
        if (params.comment_status !== undefined) body.comment_status = params.comment_status;
        if (params.ping_status !== undefined) body.ping_status = params.ping_status;
        if (params.sticky !== undefined) body.sticky = params.sticky;
        if (params.format !== undefined) body.format = params.format;

        const { data: post } = await wpRequest<WpPost>("POST", "/posts", body);

        return {
          content: [
            {
              type: "text",
              text: [
                `✅ Post created successfully!`,
                `**ID**: ${post.id}`,
                `**Title**: ${post.title.rendered}`,
                `**Status**: ${post.status}`,
                `**Link**: ${post.link}`,
                `**Slug**: ${post.slug}`,
              ].join("\n"),
            },
          ],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleWpError(error) }] };
      }
    }
  );

  // ── Update post ────────────────────────────────────────────────────────────

  server.registerTool(
    "wp_update_post",
    {
      title: "Update WordPress Post",
      description: `Update an existing WordPress post by ID. Only supply fields you want to change — omitted fields are left unchanged.

Args:
  - id: Post ID to update (required).
  - title: New title.
  - content: New content (HTML or plain text).
  - status: New status — 'publish', 'draft', 'pending', 'private', or 'future'.
  - excerpt: New excerpt.
  - slug: New URL slug.
  - author: New author user ID.
  - categories: Replacement array of category IDs.
  - tags: Replacement array of tag IDs.
  - featured_media: New featured image media ID (0 to remove).
  - comment_status: 'open' or 'closed'.
  - ping_status: 'open' or 'closed'.
  - sticky: Stick/unpin from front page.
  - format: Post format.

Returns the updated post.`,
      inputSchema: z.object({
        id: z.number().int().positive().describe("Post ID to update"),
        title: z.string().optional().describe("New post title"),
        content: z.string().optional().describe("New post content"),
        status: PostStatusSchema.optional(),
        excerpt: z.string().optional(),
        slug: z.string().optional(),
        author: z.number().int().positive().optional(),
        categories: z.array(z.number().int().positive()).optional(),
        tags: z.array(z.number().int().positive()).optional(),
        featured_media: z.number().int().nonnegative().optional(),
        comment_status: OpenCloseSchema.optional(),
        ping_status: OpenCloseSchema.optional(),
        sticky: z.boolean().optional(),
        format: z
          .enum(["standard", "aside", "chat", "gallery", "link", "image", "quote", "status", "video", "audio"])
          .optional(),
      }).strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const { id, ...rest } = params;
        const body: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(rest)) {
          if (value !== undefined) body[key] = value;
        }

        const { data: post } = await wpRequest<WpPost>("POST", `/posts/${id}`, body);

        return {
          content: [
            {
              type: "text",
              text: [
                `✅ Post updated successfully!`,
                `**ID**: ${post.id}`,
                `**Title**: ${post.title.rendered}`,
                `**Status**: ${post.status}`,
                `**Link**: ${post.link}`,
                `**Modified**: ${formatDate(post.modified)}`,
              ].join("\n"),
            },
          ],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleWpError(error) }] };
      }
    }
  );

  // ── Delete post ────────────────────────────────────────────────────────────

  server.registerTool(
    "wp_delete_post",
    {
      title: "Delete WordPress Post",
      description: `Delete a WordPress post by ID.

By default this moves the post to Trash. Set force=true to permanently delete it (irreversible).

Args:
  - id: Post ID to delete (required).
  - force: If true, permanently deletes instead of trashing (default: false).`,
      inputSchema: z.object({
        id: z.number().int().positive().describe("Post ID to delete"),
        force: z.boolean().default(false).describe("Permanently delete (true) vs. trash (false)"),
      }).strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const { data } = await wpRequest<WpPost | { deleted: boolean; previous: WpPost }>(
          "DELETE",
          `/posts/${params.id}`,
          undefined,
          { force: params.force }
        );

        const action = params.force ? "permanently deleted" : "moved to trash";
        return {
          content: [
            {
              type: "text",
              text: `✅ Post ID ${params.id} has been ${action}.\n${JSON.stringify(data, null, 2)}`,
            },
          ],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleWpError(error) }] };
      }
    }
  );
}
