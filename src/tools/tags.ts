/**
 * WordPress Tags tools — CRUD for /wp/v2/tags
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
} from "../schemas/common.js";
import { WpTerm } from "../types.js";
import { CHARACTER_LIMIT } from "../constants.js";

export function registerTagTools(server: McpServer): void {

  // ── List tags ──────────────────────────────────────────────────────────────

  server.registerTool(
    "wp_list_tags",
    {
      title: "List WordPress Tags",
      description: `List post tags.

Args:
  - search: Search by name or slug.
  - hide_empty: Exclude tags with no posts (default: false).
  - page, per_page, order, orderby: Pagination (orderby: 'id', 'name', 'slug', 'count').
  - response_format: 'markdown' or 'json'.`,
      inputSchema: PaginationSchema.extend({
        search: z.string().optional(),
        hide_empty: z.boolean().default(false),
        response_format: ResponseFormatSchema,
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        const { data: tags, response } = await wpRequest<WpTerm[]>(
          "GET", "/tags", undefined,
          {
            search: params.search,
            hide_empty: params.hide_empty,
            page: params.page,
            per_page: params.per_page,
            order: params.order,
            orderby: params.orderby ?? "count",
          }
        );

        const pagination = extractPagination(response, params.page, params.per_page);
        if (!tags.length) return { content: [{ type: "text", text: "No tags found." }] };

        let text: string;
        if (params.response_format === ResponseFormat.JSON) {
          text = JSON.stringify({ pagination, tags }, null, 2);
        } else {
          const lines = [`# Tags (Total: ${pagination.total})`, ""];
          for (const tag of tags) {
            lines.push(`- **${tag.name}** (ID: ${tag.id}, slug: \`${tag.slug}\`) — ${tag.count} posts`);
          }
          if (pagination.has_more) lines.push(`\n*Use page=${pagination.next_page} for more.*`);
          text = lines.join("\n");
        }

        return { content: [{ type: "text", text: truncateIfNeeded(text, CHARACTER_LIMIT) }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleWpError(error) }] };
      }
    }
  );

  // ── Get tag ────────────────────────────────────────────────────────────────

  server.registerTool(
    "wp_get_tag",
    {
      title: "Get WordPress Tag",
      description: `Get a single tag by ID.\n\nArgs:\n  - id: Tag ID.\n  - response_format: 'markdown' or 'json'.`,
      inputSchema: z.object({
        id: z.number().int().positive().describe("Tag ID"),
        response_format: ResponseFormatSchema,
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        const { data: tag } = await wpRequest<WpTerm>("GET", `/tags/${params.id}`);
        if (params.response_format === ResponseFormat.JSON) {
          return { content: [{ type: "text", text: JSON.stringify(tag, null, 2) }] };
        }
        return {
          content: [{
            type: "text",
            text: `# ${tag.name} (ID: ${tag.id})\n**Slug**: ${tag.slug} | **Posts**: ${tag.count}\n**Description**: ${tag.description || "none"}\n**Link**: ${tag.link}`,
          }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleWpError(error) }] };
      }
    }
  );

  // ── Create tag ─────────────────────────────────────────────────────────────

  server.registerTool(
    "wp_create_tag",
    {
      title: "Create WordPress Tag",
      description: `Create a new post tag.\n\nArgs:\n  - name: Tag name (required).\n  - slug: URL slug (auto-generated if omitted).\n  - description: Optional description.`,
      inputSchema: z.object({
        name: z.string().min(1).describe("Tag name"),
        slug: z.string().optional(),
        description: z.string().optional(),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (params) => {
      try {
        const { data: tag } = await wpRequest<WpTerm>("POST", "/tags", params as Record<string, unknown>);
        return {
          content: [{ type: "text", text: `✅ Tag created!\n**ID**: ${tag.id} | **Name**: ${tag.name} | **Slug**: ${tag.slug}` }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleWpError(error) }] };
      }
    }
  );

  // ── Update tag ─────────────────────────────────────────────────────────────

  server.registerTool(
    "wp_update_tag",
    {
      title: "Update WordPress Tag",
      description: `Update an existing tag.\n\nArgs:\n  - id: Tag ID (required).\n  - name, slug, description: Fields to update.`,
      inputSchema: z.object({
        id: z.number().int().positive().describe("Tag ID"),
        name: z.string().optional(),
        slug: z.string().optional(),
        description: z.string().optional(),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        const { id, ...rest } = params;
        const body: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rest)) { if (v !== undefined) body[k] = v; }
        const { data: tag } = await wpRequest<WpTerm>("POST", `/tags/${id}`, body);
        return {
          content: [{ type: "text", text: `✅ Tag updated!\n**ID**: ${tag.id} | **Name**: ${tag.name}` }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleWpError(error) }] };
      }
    }
  );

  // ── Delete tag ─────────────────────────────────────────────────────────────

  server.registerTool(
    "wp_delete_tag",
    {
      title: "Delete WordPress Tag",
      description: `Delete a tag permanently.\n\nArgs:\n  - id: Tag ID (required).`,
      inputSchema: z.object({
        id: z.number().int().positive().describe("Tag ID"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (params) => {
      try {
        await wpRequest("DELETE", `/tags/${params.id}`, undefined, { force: true });
        return { content: [{ type: "text", text: `✅ Tag ID ${params.id} deleted.` }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleWpError(error) }] };
      }
    }
  );
}
