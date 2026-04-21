/**
 * WordPress Pages tools — CRUD for /wp/v2/pages
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
import { WpPage } from "../types.js";
import { CHARACTER_LIMIT } from "../constants.js";

export function registerPageTools(server: McpServer): void {

  // ── List pages ─────────────────────────────────────────────────────────────

  server.registerTool(
    "wp_list_pages",
    {
      title: "List WordPress Pages",
      description: `List static pages from the WordPress site.

Args:
  - status: Filter by status — 'publish', 'draft', 'pending', 'private', 'future' (default: publish).
  - search: Full-text search.
  - parent: Filter by parent page ID (0 for top-level).
  - page: Page number (default: 1).
  - per_page: Items per page, 1–100 (default: 10).
  - order: 'asc' or 'desc'.
  - orderby: 'date', 'title', 'id', 'modified', 'menu_order'.
  - response_format: 'markdown' or 'json'.`,
      inputSchema: PaginationSchema.extend({
        status: PostStatusSchema.optional().describe("Filter by page status (default: publish)"),
        search: z.string().optional().describe("Full-text search"),
        parent: z.number().int().nonnegative().optional().describe("Parent page ID (0 = top-level)"),
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
        const { data: pages, response } = await wpRequest<WpPage[]>(
          "GET",
          "/pages",
          undefined,
          {
            status: params.status ?? "publish",
            search: params.search,
            parent: params.parent,
            page: params.page,
            per_page: params.per_page,
            order: params.order,
            orderby: params.orderby ?? "menu_order",
            _fields: "id,date,slug,status,link,title,excerpt,author,parent,menu_order,template",
          }
        );

        const pagination = extractPagination(response, params.page, params.per_page);

        if (!pages.length) {
          return { content: [{ type: "text", text: "No pages found." }] };
        }

        let text: string;
        if (params.response_format === ResponseFormat.JSON) {
          text = JSON.stringify({ pagination, pages }, null, 2);
        } else {
          const lines: string[] = [
            `# WordPress Pages (Page ${pagination.page}/${pagination.total_pages}, Total: ${pagination.total})`,
            "",
          ];
          for (const page of pages) {
            lines.push(`## [${page.title.rendered}](${page.link}) — ID: ${page.id}`);
            lines.push(`- **Status**: ${page.status} | **Date**: ${formatDate(page.date)}`);
            lines.push(`- **Parent**: ${page.parent || "none"} | **Menu Order**: ${page.menu_order}`);
            if (page.excerpt?.rendered) {
              lines.push(`- **Excerpt**: ${stripHtml(page.excerpt.rendered).slice(0, 200)}`);
            }
            lines.push("");
          }
          if (pagination.has_more) {
            lines.push(`*Use page=${pagination.next_page} to see more.*`);
          }
          text = lines.join("\n");
        }

        return { content: [{ type: "text", text: truncateIfNeeded(text, CHARACTER_LIMIT) }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleWpError(error) }] };
      }
    }
  );

  // ── Get page ───────────────────────────────────────────────────────────────

  server.registerTool(
    "wp_get_page",
    {
      title: "Get WordPress Page",
      description: `Retrieve a single WordPress page by ID.

Args:
  - id: Page ID (required).
  - response_format: 'markdown' or 'json'.`,
      inputSchema: z.object({
        id: z.number().int().positive().describe("Page ID"),
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
        const { data: page } = await wpRequest<WpPage>("GET", `/pages/${params.id}`);

        let text: string;
        if (params.response_format === ResponseFormat.JSON) {
          text = JSON.stringify(page, null, 2);
        } else {
          text = [
            `# ${page.title.rendered} (ID: ${page.id})`,
            "",
            `**Status**: ${page.status} | **Date**: ${formatDate(page.date)} | **Modified**: ${formatDate(page.modified)}`,
            `**Author ID**: ${page.author} | **Slug**: ${page.slug}`,
            `**Parent**: ${page.parent || "none"} | **Menu Order**: ${page.menu_order}`,
            `**Link**: ${page.link}`,
            "",
            "## Content",
            stripHtml(page.content?.rendered ?? ""),
          ].join("\n");
        }

        return { content: [{ type: "text", text: truncateIfNeeded(text, CHARACTER_LIMIT) }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleWpError(error) }] };
      }
    }
  );

  // ── Create page ────────────────────────────────────────────────────────────

  server.registerTool(
    "wp_create_page",
    {
      title: "Create WordPress Page",
      description: `Create a new WordPress static page.

Args:
  - title: Page title (required).
  - content: Page content in HTML (required).
  - status: 'publish', 'draft' (default), 'pending', 'private', or 'future'.
  - slug: URL slug.
  - parent: Parent page ID (for hierarchical pages).
  - menu_order: Order in menus (integer).
  - author: Author user ID.
  - featured_media: Featured image media ID.
  - comment_status: 'open' or 'closed'.
  - template: Page template filename (must match a theme template).

Returns the created page with its ID.`,
      inputSchema: z.object({
        title: z.string().min(1).describe("Page title"),
        content: z.string().min(1).describe("Page content (HTML)"),
        status: PostStatusSchema.default("draft").optional(),
        slug: z.string().optional(),
        parent: z.number().int().nonnegative().optional().describe("Parent page ID"),
        menu_order: z.number().int().optional().describe("Order in navigation menus"),
        author: z.number().int().positive().optional(),
        featured_media: z.number().int().nonnegative().optional(),
        comment_status: OpenCloseSchema.optional(),
        template: z.string().optional().describe("Theme page template filename"),
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
        if (params.slug !== undefined) body.slug = params.slug;
        if (params.parent !== undefined) body.parent = params.parent;
        if (params.menu_order !== undefined) body.menu_order = params.menu_order;
        if (params.author !== undefined) body.author = params.author;
        if (params.featured_media !== undefined) body.featured_media = params.featured_media;
        if (params.comment_status !== undefined) body.comment_status = params.comment_status;
        if (params.template !== undefined) body.template = params.template;

        const { data: page } = await wpRequest<WpPage>("POST", "/pages", body);

        return {
          content: [
            {
              type: "text",
              text: [
                `✅ Page created successfully!`,
                `**ID**: ${page.id}`,
                `**Title**: ${page.title.rendered}`,
                `**Status**: ${page.status}`,
                `**Link**: ${page.link}`,
              ].join("\n"),
            },
          ],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleWpError(error) }] };
      }
    }
  );

  // ── Update page ────────────────────────────────────────────────────────────

  server.registerTool(
    "wp_update_page",
    {
      title: "Update WordPress Page",
      description: `Update an existing WordPress page. Only supply fields you want to change.

Args:
  - id: Page ID (required).
  - title, content, status, slug, parent, menu_order, author, featured_media, comment_status, template — same as wp_create_page.`,
      inputSchema: z.object({
        id: z.number().int().positive().describe("Page ID to update"),
        title: z.string().optional(),
        content: z.string().optional(),
        status: PostStatusSchema.optional(),
        slug: z.string().optional(),
        parent: z.number().int().nonnegative().optional(),
        menu_order: z.number().int().optional(),
        author: z.number().int().positive().optional(),
        featured_media: z.number().int().nonnegative().optional(),
        comment_status: OpenCloseSchema.optional(),
        template: z.string().optional(),
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

        const { data: page } = await wpRequest<WpPage>("POST", `/pages/${id}`, body);

        return {
          content: [
            {
              type: "text",
              text: [
                `✅ Page updated!`,
                `**ID**: ${page.id} | **Title**: ${page.title.rendered}`,
                `**Status**: ${page.status} | **Link**: ${page.link}`,
              ].join("\n"),
            },
          ],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleWpError(error) }] };
      }
    }
  );

  // ── Delete page ────────────────────────────────────────────────────────────

  server.registerTool(
    "wp_delete_page",
    {
      title: "Delete WordPress Page",
      description: `Delete a WordPress page by ID. Moves to trash by default; set force=true to permanently delete.

Args:
  - id: Page ID (required).
  - force: Permanently delete if true (default: false).`,
      inputSchema: z.object({
        id: z.number().int().positive().describe("Page ID to delete"),
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
        await wpRequest("DELETE", `/pages/${params.id}`, undefined, { force: params.force });
        const action = params.force ? "permanently deleted" : "moved to trash";
        return {
          content: [{ type: "text", text: `✅ Page ID ${params.id} has been ${action}.` }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleWpError(error) }] };
      }
    }
  );
}
