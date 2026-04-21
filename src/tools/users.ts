/**
 * WordPress Users tools — CRUD for /wp/v2/users
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
import { WpUser } from "../types.js";
import { CHARACTER_LIMIT } from "../constants.js";

export function registerUserTools(server: McpServer): void {

  // ── List users ─────────────────────────────────────────────────────────────

  server.registerTool(
    "wp_list_users",
    {
      title: "List WordPress Users",
      description: `List registered users on the WordPress site (requires authentication).

Args:
  - search: Search by name, username, or email.
  - roles: Filter by role — e.g. 'administrator', 'editor', 'author', 'contributor', 'subscriber'.
  - page, per_page, order, orderby: Pagination (orderby: 'id', 'name', 'registered_date', 'slug', 'email').
  - response_format: 'markdown' or 'json'.`,
      inputSchema: PaginationSchema.extend({
        search: z.string().optional().describe("Search by name, username, or email"),
        roles: z
          .enum(["administrator", "editor", "author", "contributor", "subscriber"])
          .optional()
          .describe("Filter by WordPress role"),
        response_format: ResponseFormatSchema,
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        const { data: users, response } = await wpRequest<WpUser[]>(
          "GET", "/users", undefined,
          {
            search: params.search,
            roles: params.roles,
            page: params.page,
            per_page: params.per_page,
            order: params.order,
            orderby: params.orderby ?? "name",
            _fields: "id,name,slug,url,link,avatar_urls,roles",
            context: "edit", // needed for roles
          }
        );

        const pagination = extractPagination(response, params.page, params.per_page);
        if (!users.length) return { content: [{ type: "text", text: "No users found." }] };

        let text: string;
        if (params.response_format === ResponseFormat.JSON) {
          text = JSON.stringify({ pagination, users }, null, 2);
        } else {
          const lines = [`# WordPress Users (Total: ${pagination.total})`, ""];
          for (const u of users) {
            lines.push(`## ${u.name} (ID: ${u.id}, @${u.slug})`);
            lines.push(`- **Roles**: ${u.roles?.join(", ") ?? "unknown"}`);
            if (u.url) lines.push(`- **Website**: ${u.url}`);
            lines.push(`- **Profile**: ${u.link}`);
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

  // ── Get current user (me) ──────────────────────────────────────────────────

  server.registerTool(
    "wp_get_current_user",
    {
      title: "Get Current WordPress User",
      description: `Get the profile of the currently authenticated WordPress user (the account used by WP_USERNAME).

Returns name, email, roles, avatar URL, and other profile details.

Args:
  - response_format: 'markdown' or 'json'.`,
      inputSchema: z.object({
        response_format: ResponseFormatSchema,
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        const { data: user } = await wpRequest<WpUser>(
          "GET", "/users/me", undefined, { context: "edit" }
        );

        if (params.response_format === ResponseFormat.JSON) {
          return { content: [{ type: "text", text: JSON.stringify(user, null, 2) }] };
        }
        return {
          content: [{
            type: "text",
            text: [
              `# Current User: ${user.name} (ID: ${user.id})`,
              `**Username**: ${user.slug}`,
              `**Email**: ${(user as WpUser & { email?: string }).email ?? "hidden"}`,
              `**Roles**: ${user.roles?.join(", ") ?? "unknown"}`,
              `**Website**: ${user.url || "none"}`,
              `**Profile**: ${user.link}`,
            ].join("\n"),
          }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleWpError(error) }] };
      }
    }
  );

  // ── Get user by ID ─────────────────────────────────────────────────────────

  server.registerTool(
    "wp_get_user",
    {
      title: "Get WordPress User",
      description: `Get a user's public profile by ID.\n\nArgs:\n  - id: User ID.\n  - response_format: 'markdown' or 'json'.`,
      inputSchema: z.object({
        id: z.number().int().positive().describe("User ID"),
        response_format: ResponseFormatSchema,
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        const { data: user } = await wpRequest<WpUser>("GET", `/users/${params.id}`);
        if (params.response_format === ResponseFormat.JSON) {
          return { content: [{ type: "text", text: JSON.stringify(user, null, 2) }] };
        }
        return {
          content: [{
            type: "text",
            text: [
              `# ${user.name} (ID: ${user.id})`,
              `**Username**: ${user.slug}`,
              `**Website**: ${user.url || "none"}`,
              `**Description**: ${user.description || "none"}`,
              `**Profile**: ${user.link}`,
            ].join("\n"),
          }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleWpError(error) }] };
      }
    }
  );

  // ── Create user ────────────────────────────────────────────────────────────

  server.registerTool(
    "wp_create_user",
    {
      title: "Create WordPress User",
      description: `Create a new WordPress user account. Requires administrator privileges.

Args:
  - username: Login username (required, cannot be changed later).
  - email: Email address (required).
  - password: Account password (required).
  - name: Display name.
  - first_name, last_name: Name components.
  - url: Website URL.
  - description: Biographical info.
  - roles: Array of roles to assign — e.g. ['editor'].`,
      inputSchema: z.object({
        username: z.string().min(1).describe("Login username"),
        email: z.string().email().describe("Email address"),
        password: z.string().min(6).describe("Account password (min 6 characters)"),
        name: z.string().optional().describe("Display name"),
        first_name: z.string().optional(),
        last_name: z.string().optional(),
        url: z.string().url().optional().describe("Website URL"),
        description: z.string().optional().describe("Bio / description"),
        roles: z
          .array(z.enum(["administrator", "editor", "author", "contributor", "subscriber"]))
          .optional(),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (params) => {
      try {
        const body: Record<string, unknown> = {
          username: params.username,
          email: params.email,
          password: params.password,
        };
        if (params.name) body.name = params.name;
        if (params.first_name) body.first_name = params.first_name;
        if (params.last_name) body.last_name = params.last_name;
        if (params.url) body.url = params.url;
        if (params.description) body.description = params.description;
        if (params.roles) body.roles = params.roles;

        const { data: user } = await wpRequest<WpUser>("POST", "/users", body);
        return {
          content: [{
            type: "text",
            text: `✅ User created!\n**ID**: ${user.id} | **Name**: ${user.name} | **Username**: ${user.slug}`,
          }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleWpError(error) }] };
      }
    }
  );

  // ── Update user ────────────────────────────────────────────────────────────

  server.registerTool(
    "wp_update_user",
    {
      title: "Update WordPress User",
      description: `Update an existing user account. Only supply fields to change.

Args:
  - id: User ID (required). Use the ID from wp_get_current_user or wp_list_users.
  - email, name, first_name, last_name, url, description, roles, password: Fields to update.`,
      inputSchema: z.object({
        id: z.number().int().positive().describe("User ID to update"),
        email: z.string().email().optional(),
        name: z.string().optional(),
        first_name: z.string().optional(),
        last_name: z.string().optional(),
        url: z.string().url().optional(),
        description: z.string().optional(),
        roles: z
          .array(z.enum(["administrator", "editor", "author", "contributor", "subscriber"]))
          .optional(),
        password: z.string().min(6).optional(),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        const { id, ...rest } = params;
        const body: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rest)) { if (v !== undefined) body[k] = v; }
        const { data: user } = await wpRequest<WpUser>("POST", `/users/${id}`, body);
        return {
          content: [{ type: "text", text: `✅ User updated!\n**ID**: ${user.id} | **Name**: ${user.name}` }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleWpError(error) }] };
      }
    }
  );

  // ── Delete user ────────────────────────────────────────────────────────────

  server.registerTool(
    "wp_delete_user",
    {
      title: "Delete WordPress User",
      description: `Delete a WordPress user account. Requires administrator privileges.

All of the user's content must be reassigned or deleted — you must supply either 'reassign' (another user ID to transfer content to) or set 'force=true' to also delete their content.

Args:
  - id: User ID to delete (required).
  - reassign: User ID to reassign deleted user's content to (recommended).
  - force: Must be true to confirm deletion.`,
      inputSchema: z.object({
        id: z.number().int().positive().describe("User ID to delete"),
        reassign: z.number().int().positive().optional().describe("User ID to reassign content to"),
        force: z.boolean().default(true),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (params) => {
      try {
        const queryParams: Record<string, unknown> = { force: true };
        if (params.reassign) queryParams.reassign = params.reassign;
        await wpRequest("DELETE", `/users/${params.id}`, undefined, queryParams);
        return {
          content: [{
            type: "text",
            text: `✅ User ID ${params.id} deleted.${params.reassign ? ` Content reassigned to user ${params.reassign}.` : ""}`,
          }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleWpError(error) }] };
      }
    }
  );
}
