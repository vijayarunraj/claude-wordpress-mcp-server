/**
 * Shared Zod schemas reused across all tool files.
 */

import { z } from "zod";
import { DEFAULT_PER_PAGE } from "../constants.js";

// ── Response format ───────────────────────────────────────────────────────────

export enum ResponseFormat {
  MARKDOWN = "markdown",
  JSON = "json",
}

export const ResponseFormatSchema = z
  .nativeEnum(ResponseFormat)
  .default(ResponseFormat.MARKDOWN)
  .describe("Output format: 'markdown' for human-readable, 'json' for machine-readable");

// ── Pagination ────────────────────────────────────────────────────────────────

export const PaginationSchema = z.object({
  page: z
    .number()
    .int()
    .min(1)
    .default(1)
    .describe("Page number (1-based)"),
  per_page: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(DEFAULT_PER_PAGE)
    .describe("Items per page (1–100, default 10)"),
  order: z
    .enum(["asc", "desc"])
    .default("desc")
    .describe("Sort direction: 'asc' or 'desc'"),
  orderby: z
    .string()
    .optional()
    .describe("Field to sort by (depends on resource — e.g. 'date', 'title', 'id')"),
});

// ── Post status ───────────────────────────────────────────────────────────────

export const PostStatusSchema = z
  .enum(["publish", "draft", "pending", "private", "future"])
  .describe("Post/page publication status");

// ── Comment status ────────────────────────────────────────────────────────────

export const CommentStatusSchema = z
  .enum(["approve", "hold", "spam", "trash"])
  .describe("Comment moderation status");

// ── Open / close ──────────────────────────────────────────────────────────────

export const OpenCloseSchema = z
  .enum(["open", "closed"])
  .describe("'open' to allow, 'closed' to disallow");

// ── Format helpers ────────────────────────────────────────────────────────────

/** Strip HTML tags from rendered WordPress content. */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

/** Format a WordPress date string to a more readable form. */
export function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}
