/**
 * WordPress Comments tools — CRUD + moderation for /wp/v2/comments
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
  CommentStatusSchema,
  stripHtml,
  formatDate,
} from "../schemas/common.js";
import { WpComment } from "../types.js";
import { CHARACTER_LIMIT } from "../constants.js";

export function registerCommentTools(server: McpServer): void {

  // ── List comments ──────────────────────────────────────────────────────────

  server.registerTool(
    "wp_list_comments",
    {
      title: "List WordPress Comments",
      description: `List comments on the WordPress site.

Args:
  - post: Filter by post ID.
  - status: Filter by status — 'approve', 'hold', 'spam', 'trash' (default: 'approve').
  - author_email: Filter by commenter email.
  - search: Full-text search.
  - parent: Filter by parent comment ID.
  - page, per_page, order, orderby: Pagination (orderby: 'date', 'id', 'post').
  - response_format: 'markdown' or 'json'.`,
      inputSchema: PaginationSchema.extend({
        post: z.number().int().positive().optional().describe("Filter by post ID"),
        status: CommentStatusSchema.optional().describe("Comment status filter (default: approve)"),
        author_email: z.string().email().optional().describe("Filter by author email"),
        search: z.string().optional(),
        parent: z.number().int().nonnegative().optional().describe("Parent comment ID"),
        response_format: ResponseFormatSchema,
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        const { data: comments, response } = await wpRequest<WpComment[]>(
          "GET", "/comments", undefined,
          {
            post: params.post,
            status: params.status ?? "approve",
            author_email: params.author_email,
            search: params.search,
            parent: params.parent,
            page: params.page,
            per_page: params.per_page,
            order: params.order,
            orderby: params.orderby ?? "date",
            _fields: "id,post,parent,author,author_name,author_email,date,content,link,status",
          }
        );

        const pagination = extractPagination(response, params.page, params.per_page);
        if (!comments.length) return { content: [{ type: "text", text: "No comments found." }] };

        let text: string;
        if (params.response_format === ResponseFormat.JSON) {
          text = JSON.stringify({ pagination, comments }, null, 2);
        } else {
          const lines = [`# Comments (Total: ${pagination.total})`, ""];
          for (const c of comments) {
            lines.push(`## Comment ID: ${c.id} on Post ${c.post}`);
            lines.push(`- **Author**: ${c.author_name} (${c.author_email || "no email"})`);
            lines.push(`- **Date**: ${formatDate(c.date)} | **Status**: ${c.status}`);
            lines.push(`- **Content**: ${stripHtml(c.content?.rendered ?? "").slice(0, 300)}`);
            if (c.parent) lines.push(`- **Reply to Comment**: ${c.parent}`);
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

  // ── Get comment ────────────────────────────────────────────────────────────

  server.registerTool(
    "wp_get_comment",
    {
      title: "Get WordPress Comment",
      description: `Retrieve a single comment by ID.\n\nArgs:\n  - id: Comment ID.\n  - response_format: 'markdown' or 'json'.`,
      inputSchema: z.object({
        id: z.number().int().positive().describe("Comment ID"),
        response_format: ResponseFormatSchema,
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        const { data: c } = await wpRequest<WpComment>("GET", `/comments/${params.id}`);
        if (params.response_format === ResponseFormat.JSON) {
          return { content: [{ type: "text", text: JSON.stringify(c, null, 2) }] };
        }
        return {
          content: [{
            type: "text",
            text: [
              `# Comment ID: ${c.id} (Post: ${c.post})`,
              `**Author**: ${c.author_name} | **Email**: ${c.author_email || "none"}`,
              `**Date**: ${formatDate(c.date)} | **Status**: ${c.status}`,
              `**Parent**: ${c.parent || "none"}`,
              "",
              "## Content",
              stripHtml(c.content?.rendered ?? ""),
            ].join("\n"),
          }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleWpError(error) }] };
      }
    }
  );

  // ── Create comment ─────────────────────────────────────────────────────────

  server.registerTool(
    "wp_create_comment",
    {
      title: "Create WordPress Comment",
      description: `Post a new comment on a WordPress post or page.

Args:
  - post: Post ID to comment on (required).
  - content: Comment text (required).
  - author_name: Display name for the commenter.
  - author_email: Email address of the commenter.
  - author_url: Website URL of the commenter.
  - parent: Parent comment ID (for replies).
  - status: Initial status — 'approve', 'hold' (default), 'spam'.`,
      inputSchema: z.object({
        post: z.number().int().positive().describe("Post ID to comment on"),
        content: z.string().min(1).describe("Comment text"),
        author_name: z.string().optional().describe("Commenter display name"),
        author_email: z.string().email().optional().describe("Commenter email"),
        author_url: z.string().url().optional().describe("Commenter website URL"),
        parent: z.number().int().nonnegative().optional().describe("Parent comment ID for replies"),
        status: CommentStatusSchema.optional().describe("Comment status (default: hold)"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (params) => {
      try {
        const body: Record<string, unknown> = { post: params.post, content: params.content };
        if (params.author_name) body.author_name = params.author_name;
        if (params.author_email) body.author_email = params.author_email;
        if (params.author_url) body.author_url = params.author_url;
        if (params.parent !== undefined) body.parent = params.parent;
        if (params.status) body.status = params.status;

        const { data: c } = await wpRequest<WpComment>("POST", "/comments", body);
        return {
          content: [{
            type: "text",
            text: `✅ Comment created!\n**ID**: ${c.id} | **Status**: ${c.status} | **Post**: ${c.post}`,
          }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleWpError(error) }] };
      }
    }
  );

  // ── Update comment ─────────────────────────────────────────────────────────

  server.registerTool(
    "wp_update_comment",
    {
      title: "Update WordPress Comment",
      description: `Update an existing comment. Commonly used to moderate (approve, hold, spam, trash) or edit content.

Args:
  - id: Comment ID (required).
  - content: Updated comment text.
  - status: New moderation status — 'approve', 'hold', 'spam', or 'trash'.
  - author_name, author_email, author_url: Updated commenter details.`,
      inputSchema: z.object({
        id: z.number().int().positive().describe("Comment ID"),
        content: z.string().optional(),
        status: CommentStatusSchema.optional(),
        author_name: z.string().optional(),
        author_email: z.string().email().optional(),
        author_url: z.string().url().optional(),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        const { id, ...rest } = params;
        const body: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rest)) { if (v !== undefined) body[k] = v; }
        const { data: c } = await wpRequest<WpComment>("POST", `/comments/${id}`, body);
        return {
          content: [{
            type: "text",
            text: `✅ Comment ${c.id} updated! **Status**: ${c.status}`,
          }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleWpError(error) }] };
      }
    }
  );

  // ── Delete comment ─────────────────────────────────────────────────────────

  server.registerTool(
    "wp_delete_comment",
    {
      title: "Delete WordPress Comment",
      description: `Delete a comment. Moves to trash by default; force=true permanently deletes it.

Args:
  - id: Comment ID (required).
  - force: Permanently delete (default: false = trash).`,
      inputSchema: z.object({
        id: z.number().int().positive().describe("Comment ID"),
        force: z.boolean().default(false),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (params) => {
      try {
        await wpRequest("DELETE", `/comments/${params.id}`, undefined, { force: params.force });
        const action = params.force ? "permanently deleted" : "moved to trash";
        return { content: [{ type: "text", text: `✅ Comment ${params.id} ${action}.` }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleWpError(error) }] };
      }
    }
  );
}
