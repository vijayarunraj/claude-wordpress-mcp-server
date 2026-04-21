/**
 * WordPress Categories tools — CRUD for /wp/v2/categories
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

export function registerCategoryTools(server: McpServer): void {

  // ── List categories ────────────────────────────────────────────────────────

  server.registerTool(
    "wp_list_categories",
    {
      title: "List WordPress Categories",
      description: `List post categories.

Args:
  - search: Search by name or slug.
  - parent: Filter by parent category ID (0 = top-level).
  - hide_empty: If true, exclude categories with no posts (default: false).
  - page, per_page, order, orderby: Pagination (orderby: 'id', 'name', 'slug', 'count', 'term_group').
  - response_format: 'markdown' or 'json'.`,
      inputSchema: PaginationSchema.extend({
        search: z.string().optional(),
        parent: z.number().int().nonnegative().optional().describe("Parent category ID"),
        hide_empty: z.boolean().default(false).describe("Exclude empty categories"),
        response_format: ResponseFormatSchema,
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        const { data: cats, response } = await wpRequest<WpTerm[]>(
          "GET", "/categories", undefined,
          {
            search: params.search,
            parent: params.parent,
            hide_empty: params.hide_empty,
            page: params.page,
            per_page: params.per_page,
            order: params.order,
            orderby: params.orderby ?? "name",
          }
        );

        const pagination = extractPagination(response, params.page, params.per_page);
        if (!cats.length) return { content: [{ type: "text", text: "No categories found." }] };

        let text: string;
        if (params.response_format === ResponseFormat.JSON) {
          text = JSON.stringify({ pagination, categories: cats }, null, 2);
        } else {
          const lines = [`# Categories (Total: ${pagination.total})`, ""];
          for (const cat of cats) {
            lines.push(`## ${cat.name} (ID: ${cat.id}, slug: ${cat.slug})`);
            lines.push(`- **Posts**: ${cat.count} | **Parent**: ${cat.parent || "none"}`);
            if (cat.description) lines.push(`- **Description**: ${cat.description}`);
            lines.push("");
          }
          if (pagination.has_more) lines.push(`*Use page=${pagination.next_page} for more.*`);
          text = lines.join("\n");
        }

        return { content: [{ type: "text", text: truncateIfNeeded(text, CHARACTER_LIMIT) }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleWpError(error) }] };
      }
    }
  );

  // ── Get category ───────────────────────────────────────────────────────────

  server.registerTool(
    "wp_get_category",
    {
      title: "Get WordPress Category",
      description: `Get a single category by ID.\n\nArgs:\n  - id: Category ID.`,
      inputSchema: z.object({
        id: z.number().int().positive().describe("Category ID"),
        response_format: ResponseFormatSchema,
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        const { data: cat } = await wpRequest<WpTerm>("GET", `/categories/${params.id}`);
        if (params.response_format === ResponseFormat.JSON) {
          return { content: [{ type: "text", text: JSON.stringify(cat, null, 2) }] };
        }
        return {
          content: [{
            type: "text",
            text: [
              `# ${cat.name} (ID: ${cat.id})`,
              `**Slug**: ${cat.slug} | **Posts**: ${cat.count}`,
              `**Parent**: ${cat.parent || "none"}`,
              `**Description**: ${cat.description || "none"}`,
              `**Link**: ${cat.link}`,
            ].join("\n"),
          }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleWpError(error) }] };
      }
    }
  );

  // ── Create category ────────────────────────────────────────────────────────

  server.registerTool(
    "wp_create_category",
    {
      title: "Create WordPress Category",
      description: `Create a new post category.\n\nArgs:\n  - name: Category name (required).\n  - slug: URL slug (auto-generated if omitted).\n  - description: Optional description.\n  - parent: Parent category ID.`,
      inputSchema: z.object({
        name: z.string().min(1).describe("Category name"),
        slug: z.string().optional(),
        description: z.string().optional(),
        parent: z.number().int().nonnegative().optional(),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (params) => {
      try {
        const { data: cat } = await wpRequest<WpTerm>("POST", "/categories", params as Record<string, unknown>);
        return {
          content: [{
            type: "text",
            text: `✅ Category created!\n**ID**: ${cat.id} | **Name**: ${cat.name} | **Slug**: ${cat.slug}`,
          }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleWpError(error) }] };
      }
    }
  );

  // ── Update category ────────────────────────────────────────────────────────

  server.registerTool(
    "wp_update_category",
    {
      title: "Update WordPress Category",
      description: `Update an existing category. Only supply fields to change.\n\nArgs:\n  - id: Category ID (required).\n  - name, slug, description, parent: Same as wp_create_category.`,
      inputSchema: z.object({
        id: z.number().int().positive().describe("Category ID"),
        name: z.string().optional(),
        slug: z.string().optional(),
        description: z.string().optional(),
        parent: z.number().int().nonnegative().optional(),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        const { id, ...rest } = params;
        const body: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rest)) { if (v !== undefined) body[k] = v; }
        const { data: cat } = await wpRequest<WpTerm>("POST", `/categories/${id}`, body);
        return {
          content: [{ type: "text", text: `✅ Category updated!\n**ID**: ${cat.id} | **Name**: ${cat.name}` }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleWpError(error) }] };
      }
    }
  );

  // ── Delete category ────────────────────────────────────────────────────────

  server.registerTool(
    "wp_delete_category",
    {
      title: "Delete WordPress Category",
      description: `Delete a category. Requires a force=true flag (WordPress always requires force for term deletion).\n\nArgs:\n  - id: Category ID (required).\n  - force: Must be true to confirm deletion.`,
      inputSchema: z.object({
        id: z.number().int().positive().describe("Category ID"),
        force: z.boolean().default(true),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (params) => {
      try {
        await wpRequest("DELETE", `/categories/${params.id}`, undefined, { force: true });
        return { content: [{ type: "text", text: `✅ Category ID ${params.id} deleted.` }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleWpError(error) }] };
      }
    }
  );
}
