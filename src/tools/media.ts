/**
 * WordPress Media tools — CRUD for /wp/v2/media
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  wpRequest,
  extractPagination,
  handleWpError,
  uploadMedia,
  truncateIfNeeded,
} from "../services/wordpress.js";
import {
  ResponseFormat,
  ResponseFormatSchema,
  PaginationSchema,
  formatDate,
} from "../schemas/common.js";
import { WpMedia } from "../types.js";
import { CHARACTER_LIMIT } from "../constants.js";

export function registerMediaTools(server: McpServer): void {

  // ── List media ─────────────────────────────────────────────────────────────

  server.registerTool(
    "wp_list_media",
    {
      title: "List WordPress Media",
      description: `List items in the WordPress Media Library.

Args:
  - search: Search by filename or title.
  - media_type: Filter by type — 'image', 'video', 'audio', 'application', 'text'.
  - mime_type: Filter by exact MIME type (e.g. 'image/jpeg', 'image/png', 'video/mp4').
  - parent: Filter by post ID the media is attached to (0 = unattached).
  - page, per_page, order, orderby: Pagination and sorting.
  - response_format: 'markdown' or 'json'.`,
      inputSchema: PaginationSchema.extend({
        search: z.string().optional().describe("Search by title or filename"),
        media_type: z
          .enum(["image", "video", "audio", "application", "text"])
          .optional()
          .describe("Filter by media type"),
        mime_type: z.string().optional().describe("Filter by MIME type (e.g. 'image/jpeg')"),
        parent: z.number().int().nonnegative().optional().describe("Attached post ID (0 = unattached)"),
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
        const { data: items, response } = await wpRequest<WpMedia[]>(
          "GET",
          "/media",
          undefined,
          {
            search: params.search,
            media_type: params.media_type,
            mime_type: params.mime_type,
            parent: params.parent,
            page: params.page,
            per_page: params.per_page,
            order: params.order,
            orderby: params.orderby ?? "date",
            _fields: "id,date,slug,status,link,title,author,caption,alt_text,media_type,mime_type,source_url,post,media_details",
          }
        );

        const pagination = extractPagination(response, params.page, params.per_page);

        if (!items.length) {
          return { content: [{ type: "text", text: "No media items found." }] };
        }

        let text: string;
        if (params.response_format === ResponseFormat.JSON) {
          text = JSON.stringify({ pagination, items }, null, 2);
        } else {
          const lines: string[] = [
            `# WordPress Media (Page ${pagination.page}/${pagination.total_pages}, Total: ${pagination.total})`,
            "",
          ];
          for (const item of items) {
            lines.push(`## ${item.title.rendered} — ID: ${item.id}`);
            lines.push(`- **Type**: ${item.mime_type} | **Date**: ${formatDate(item.date)}`);
            lines.push(`- **URL**: ${item.source_url}`);
            if (item.alt_text) lines.push(`- **Alt Text**: ${item.alt_text}`);
            if (item.post) lines.push(`- **Attached to Post ID**: ${item.post}`);
            if (item.media_details?.width) {
              lines.push(`- **Dimensions**: ${item.media_details.width}×${item.media_details.height}`);
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

  // ── Get media item ─────────────────────────────────────────────────────────

  server.registerTool(
    "wp_get_media",
    {
      title: "Get WordPress Media Item",
      description: `Retrieve a single media item by ID.

Args:
  - id: Media ID (required).
  - response_format: 'markdown' or 'json'.`,
      inputSchema: z.object({
        id: z.number().int().positive().describe("Media item ID"),
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
        const { data: item } = await wpRequest<WpMedia>("GET", `/media/${params.id}`);

        let text: string;
        if (params.response_format === ResponseFormat.JSON) {
          text = JSON.stringify(item, null, 2);
        } else {
          const lines = [
            `# ${item.title.rendered} (ID: ${item.id})`,
            "",
            `**Type**: ${item.mime_type} | **Date**: ${formatDate(item.date)}`,
            `**URL**: ${item.source_url}`,
            `**Alt Text**: ${item.alt_text || "none"}`,
            `**Caption**: ${item.caption?.rendered ? item.caption.rendered.replace(/<[^>]+>/g, "") : "none"}`,
            `**Attached to Post ID**: ${item.post ?? "none"}`,
          ];
          if (item.media_details?.width) {
            lines.push(`**Dimensions**: ${item.media_details.width}×${item.media_details.height}`);
          }
          text = lines.join("\n");
        }

        return { content: [{ type: "text", text }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleWpError(error) }] };
      }
    }
  );

  // ── Upload media ───────────────────────────────────────────────────────────

  server.registerTool(
    "wp_upload_media",
    {
      title: "Upload Media to WordPress",
      description: `Upload a local file to the WordPress Media Library.

The file is read from the local filesystem and sent to WordPress via multipart upload.

Args:
  - file_path: Absolute path to the local file (e.g. C:/Users/USER/Pictures/photo.jpg).
  - title: Optional title for the media item.
  - alt_text: Optional alt text (important for accessibility and SEO).
  - caption: Optional caption text.
  - post: Optional post ID to attach the media to.

Returns the uploaded media item with its ID and source URL.`,
      inputSchema: z.object({
        file_path: z.string().min(1).describe("Absolute local path to the file to upload"),
        title: z.string().optional().describe("Media title"),
        alt_text: z.string().optional().describe("Alt text for the image"),
        caption: z.string().optional().describe("Caption text"),
        post: z.number().int().nonnegative().optional().describe("Post ID to attach media to"),
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
        const extraFields: Record<string, string> = {};
        if (params.title) extraFields.title = params.title;
        if (params.alt_text) extraFields.alt_text = params.alt_text;
        if (params.caption) extraFields.caption = params.caption;
        if (params.post !== undefined) extraFields.post = String(params.post);

        const item = await uploadMedia<WpMedia>(params.file_path, extraFields);

        return {
          content: [
            {
              type: "text",
              text: [
                `✅ Media uploaded successfully!`,
                `**ID**: ${item.id}`,
                `**Title**: ${item.title.rendered}`,
                `**URL**: ${item.source_url}`,
                `**Type**: ${item.mime_type}`,
              ].join("\n"),
            },
          ],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleWpError(error) }] };
      }
    }
  );

  // ── Update media ───────────────────────────────────────────────────────────

  server.registerTool(
    "wp_update_media",
    {
      title: "Update WordPress Media Item",
      description: `Update metadata for an existing media item (title, alt text, caption, description).

Note: This does NOT replace the file. To upload a new file, use wp_upload_media.

Args:
  - id: Media ID (required).
  - title: New title.
  - alt_text: New alt text.
  - caption: New caption.
  - description: New description.
  - post: Attach/re-attach to a post ID (0 to detach).`,
      inputSchema: z.object({
        id: z.number().int().positive().describe("Media item ID"),
        title: z.string().optional(),
        alt_text: z.string().optional(),
        caption: z.string().optional(),
        description: z.string().optional(),
        post: z.number().int().nonnegative().optional().describe("Attach to post ID (0 to detach)"),
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

        const { data: item } = await wpRequest<WpMedia>("POST", `/media/${id}`, body);

        return {
          content: [
            {
              type: "text",
              text: [
                `✅ Media updated!`,
                `**ID**: ${item.id} | **Title**: ${item.title.rendered}`,
                `**URL**: ${item.source_url}`,
              ].join("\n"),
            },
          ],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleWpError(error) }] };
      }
    }
  );

  // ── Delete media ───────────────────────────────────────────────────────────

  server.registerTool(
    "wp_delete_media",
    {
      title: "Delete WordPress Media Item",
      description: `Permanently delete a media item from the WordPress Media Library.

WARNING: Media deletion is always permanent (WordPress does not trash media). The physical file is also removed from the server.

Args:
  - id: Media item ID to delete (required).`,
      inputSchema: z.object({
        id: z.number().int().positive().describe("Media item ID to delete"),
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
        await wpRequest("DELETE", `/media/${params.id}`, undefined, { force: true });
        return {
          content: [{ type: "text", text: `✅ Media ID ${params.id} permanently deleted.` }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleWpError(error) }] };
      }
    }
  );
}
