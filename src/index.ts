#!/usr/bin/env node
/**
 * WordPress MCP Server
 *
 * Connects Claude to any WordPress site via the REST API v2.
 * Supports posts, pages, media, categories, tags, comments, users, and site settings.
 *
 * Required environment variables:
 *   WP_SITE_URL      — e.g. https://my-blog.com (no trailing slash)
 *   WP_USERNAME      — WordPress username
 *   WP_APP_PASSWORD  — Application Password from WP Admin → Users → Profile
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerPostTools } from "./tools/posts.js";
import { registerPageTools } from "./tools/pages.js";
import { registerMediaTools } from "./tools/media.js";
import { registerCategoryTools } from "./tools/categories.js";
import { registerTagTools } from "./tools/tags.js";
import { registerCommentTools } from "./tools/comments.js";
import { registerUserTools } from "./tools/users.js";
import { registerSettingsTools } from "./tools/settings.js";

// ── Server ────────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "wordpress-mcp-server",
  version: "1.0.0",
});

// ── Register all tool groups ──────────────────────────────────────────────────

registerPostTools(server);
registerPageTools(server);
registerMediaTools(server);
registerCategoryTools(server);
registerTagTools(server);
registerCommentTools(server);
registerUserTools(server);
registerSettingsTools(server);

// ── Start stdio transport ─────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Validate required env vars on startup (getClient() also checks, but we want
  // a clear error before the transport is connected).
  const missing = ["WP_SITE_URL", "WP_USERNAME", "WP_APP_PASSWORD"].filter(
    (v) => !process.env[v]
  );
  if (missing.length > 0) {
    console.error(
      `[wordpress-mcp-server] ERROR: Missing required environment variables: ${missing.join(", ")}\n` +
        `Set them in your Claude Code .mcp.json config or shell environment.\n` +
        `See README.md for setup instructions.`
    );
    process.exit(1);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(
    `[wordpress-mcp-server] Running — connected to ${process.env.WP_SITE_URL}`
  );
}

main().catch((error: unknown) => {
  console.error("[wordpress-mcp-server] Fatal error:", error);
  process.exit(1);
});
