/**
 * WordPress Settings, Discovery, and Search tools.
 *
 * Covers:
 *   - /wp/v2/settings    → wp_get_settings, wp_update_settings
 *   - /wp/v2/types       → wp_list_post_types
 *   - /wp/v2/taxonomies  → wp_list_taxonomies
 *   - /wp/v2/search      → wp_search
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
import { WpSettings, WpPostType, WpTaxonomy, WpSearchResult } from "../types.js";
import { CHARACTER_LIMIT } from "../constants.js";

export function registerSettingsTools(server: McpServer): void {

  // ── Get settings ───────────────────────────────────────────────────────────

  server.registerTool(
    "wp_get_settings",
    {
      title: "Get WordPress Site Settings",
      description: `Retrieve WordPress site-wide settings such as title, description, timezone, posts per page, and more.

Requires administrator privileges.

Args:
  - response_format: 'markdown' or 'json'.`,
      inputSchema: z.object({
        response_format: ResponseFormatSchema,
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        const { data: settings } = await wpRequest<WpSettings>("GET", "/settings");

        if (params.response_format === ResponseFormat.JSON) {
          return { content: [{ type: "text", text: JSON.stringify(settings, null, 2) }] };
        }
        return {
          content: [{
            type: "text",
            text: [
              `# WordPress Site Settings`,
              "",
              `**Site Title**: ${settings.title}`,
              `**Tagline**: ${settings.description}`,
              `**URL**: ${settings.url}`,
              `**Admin Email**: ${settings.email}`,
              `**Timezone**: ${settings.timezone}`,
              `**Date Format**: ${settings.date_format}`,
              `**Time Format**: ${settings.time_format}`,
              `**Language**: ${settings.language}`,
              `**Posts Per Page**: ${settings.posts_per_page}`,
              `**Default Category**: ${settings.default_category}`,
              `**Front Page**: ${settings.show_on_front === "page" ? `Page ID ${settings.page_on_front}` : "Latest posts"}`,
            ].join("\n"),
          }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleWpError(error) }] };
      }
    }
  );

  // ── Update settings ────────────────────────────────────────────────────────

  server.registerTool(
    "wp_update_settings",
    {
      title: "Update WordPress Site Settings",
      description: `Update WordPress site-wide settings. Requires administrator privileges. Only supply settings you want to change.

Args:
  - title: Site title.
  - description: Site tagline.
  - email: Admin email address.
  - timezone: Timezone string (e.g. 'America/New_York').
  - date_format: PHP date format string (e.g. 'Y-m-d').
  - time_format: PHP time format string (e.g. 'H:i').
  - start_of_week: Day the week starts, 0=Sunday … 6=Saturday.
  - posts_per_page: Number of posts to show per page/feed.
  - default_category: Default category ID for new posts.
  - show_on_front: 'posts' or 'page' (what to show on front page).
  - page_on_front: Page ID to use as front page (when show_on_front='page').
  - page_for_posts: Page ID to use as blog listing (when show_on_front='page').`,
      inputSchema: z.object({
        title: z.string().optional(),
        description: z.string().optional(),
        email: z.string().email().optional(),
        timezone: z.string().optional().describe("Timezone string (e.g. 'America/New_York')"),
        date_format: z.string().optional().describe("PHP date format (e.g. 'Y-m-d')"),
        time_format: z.string().optional().describe("PHP time format (e.g. 'H:i')"),
        start_of_week: z.number().int().min(0).max(6).optional(),
        posts_per_page: z.number().int().min(1).max(100).optional(),
        default_category: z.number().int().positive().optional(),
        show_on_front: z.enum(["posts", "page"]).optional(),
        page_on_front: z.number().int().nonnegative().optional(),
        page_for_posts: z.number().int().nonnegative().optional(),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        const body: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(params)) { if (v !== undefined) body[k] = v; }
        if (Object.keys(body).length === 0) {
          return { content: [{ type: "text", text: "No settings provided to update." }] };
        }
        const { data: settings } = await wpRequest<WpSettings>("POST", "/settings", body);
        return {
          content: [{
            type: "text",
            text: `✅ Settings updated!\n**Site Title**: ${settings.title}\n**URL**: ${settings.url}`,
          }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleWpError(error) }] };
      }
    }
  );

  // ── List post types ────────────────────────────────────────────────────────

  server.registerTool(
    "wp_list_post_types",
    {
      title: "List WordPress Post Types",
      description: `List all registered post types on the WordPress site (e.g. 'post', 'page', custom post types).

Useful for discovering what content types are available on the site.

Args:
  - response_format: 'markdown' or 'json'.`,
      inputSchema: z.object({
        response_format: ResponseFormatSchema,
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        const { data } = await wpRequest<Record<string, WpPostType>>("GET", "/types");
        const types = Object.values(data);

        if (params.response_format === ResponseFormat.JSON) {
          return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        }
        const lines = [`# Registered Post Types (${types.length})`, ""];
        for (const t of types) {
          lines.push(`## ${t.name} (slug: \`${t.slug}\`)`);
          lines.push(`- **REST Base**: \`/wp/v2/${t.rest_base}\``);
          lines.push(`- **Hierarchical**: ${t.hierarchical}`);
          if (t.description) lines.push(`- **Description**: ${t.description}`);
          lines.push("");
        }
        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleWpError(error) }] };
      }
    }
  );

  // ── List taxonomies ────────────────────────────────────────────────────────

  server.registerTool(
    "wp_list_taxonomies",
    {
      title: "List WordPress Taxonomies",
      description: `List all registered taxonomies on the WordPress site (e.g. 'category', 'post_tag', custom taxonomies).

Args:
  - type: Filter by post type (e.g. 'post', 'page').
  - response_format: 'markdown' or 'json'.`,
      inputSchema: z.object({
        type: z.string().optional().describe("Filter by post type (e.g. 'post')"),
        response_format: ResponseFormatSchema,
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        const { data } = await wpRequest<Record<string, WpTaxonomy>>(
          "GET", "/taxonomies", undefined,
          { type: params.type }
        );
        const taxs = Object.values(data);

        if (params.response_format === ResponseFormat.JSON) {
          return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        }
        const lines = [`# Registered Taxonomies (${taxs.length})`, ""];
        for (const t of taxs) {
          lines.push(`## ${t.name} (slug: \`${t.slug}\`)`);
          lines.push(`- **REST Base**: \`/wp/v2/${t.rest_base}\``);
          lines.push(`- **Hierarchical**: ${t.hierarchical}`);
          lines.push(`- **Used by**: ${t.types?.join(", ")}`);
          if (t.description) lines.push(`- **Description**: ${t.description}`);
          lines.push("");
        }
        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleWpError(error) }] };
      }
    }
  );

  // ── Global search ──────────────────────────────────────────────────────────

  server.registerTool(
    "wp_search",
    {
      title: "Search WordPress Content",
      description: `Perform a full-text search across all WordPress content (posts, pages, and other post types).

Args:
  - query: Search string (required).
  - type: Limit to 'post', 'term', or 'post-format' (default: 'post').
  - subtype: Narrow by post type slug or taxonomy slug (e.g. 'post', 'page', 'category').
  - page, per_page: Pagination.
  - response_format: 'markdown' or 'json'.`,
      inputSchema: PaginationSchema.extend({
        query: z.string().min(1).describe("Search query"),
        type: z
          .enum(["post", "term", "post-format"])
          .default("post")
          .describe("Type of content to search"),
        subtype: z
          .string()
          .optional()
          .describe("Post type or taxonomy slug to narrow results (e.g. 'post', 'page')"),
        response_format: ResponseFormatSchema,
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        const { data: results, response } = await wpRequest<WpSearchResult[]>(
          "GET", "/search", undefined,
          {
            search: params.query,
            type: params.type,
            subtype: params.subtype,
            page: params.page,
            per_page: params.per_page,
          }
        );

        const pagination = extractPagination(response, params.page, params.per_page);
        if (!results.length) {
          return { content: [{ type: "text", text: `No results found for "${params.query}".` }] };
        }

        let text: string;
        if (params.response_format === ResponseFormat.JSON) {
          text = JSON.stringify({ pagination, results }, null, 2);
        } else {
          const lines = [
            `# Search: "${params.query}" (${pagination.total} results)`,
            "",
          ];
          for (const r of results) {
            lines.push(`- **[${r.title}](${r.url})** — ID: ${r.id} | Type: ${r.type}/${r.subtype}`);
          }
          if (pagination.has_more) {
            lines.push(`\n*Use page=${pagination.next_page} for more results.*`);
          }
          text = lines.join("\n");
        }

        return { content: [{ type: "text", text: truncateIfNeeded(text, CHARACTER_LIMIT) }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleWpError(error) }] };
      }
    }
  );
}
