/**
 * WordPress REST API client.
 *
 * Authentication uses WordPress Application Passwords (WP 5.6+).
 * Env vars required:
 *   WP_SITE_URL  — e.g. https://my-blog.com  (no trailing slash)
 *   WP_USERNAME  — WordPress username
 *   WP_APP_PASSWORD — Application password (spaces are fine)
 */

import axios, { AxiosError, AxiosInstance, AxiosResponse } from "axios";
import FormData from "form-data";
import fs from "fs";
import path from "path";
import { WP_API_PATH } from "../constants.js";
import { PaginationMeta } from "../types.js";

// ── Configuration ─────────────────────────────────────────────────────────────

function getConfig(): { siteUrl: string; username: string; appPassword: string } {
  const siteUrl = process.env.WP_SITE_URL?.replace(/\/$/, "");
  const username = process.env.WP_USERNAME;
  const appPassword = process.env.WP_APP_PASSWORD;

  if (!siteUrl || !username || !appPassword) {
    console.error(
      "ERROR: Missing required environment variables.\n" +
        "  WP_SITE_URL, WP_USERNAME, WP_APP_PASSWORD must all be set.\n" +
        "  See README for how to create a WordPress Application Password."
    );
    process.exit(1);
  }

  return { siteUrl, username, appPassword };
}

// ── Axios instance ─────────────────────────────────────────────────────────────

let _client: AxiosInstance | null = null;
let _siteUrl: string = "";

export function getClient(): AxiosInstance {
  if (_client) return _client;

  const { siteUrl, username, appPassword } = getConfig();
  _siteUrl = siteUrl;

  const token = Buffer.from(`${username}:${appPassword}`).toString("base64");

  _client = axios.create({
    baseURL: `${siteUrl}${WP_API_PATH}`,
    timeout: 30000,
    headers: {
      "Authorization": `Basic ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
  });

  return _client;
}

export function getSiteUrl(): string {
  if (!_siteUrl) getConfig(); // ensure init
  return _siteUrl;
}

// ── Generic request helper ────────────────────────────────────────────────────

export async function wpRequest<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  endpoint: string,
  data?: Record<string, unknown>,
  params?: Record<string, unknown>
): Promise<{ data: T; response: AxiosResponse<T> }> {
  const client = getClient();
  const response = await client.request<T>({
    method,
    url: endpoint,
    data,
    params,
  });
  return { data: response.data, response };
}

// ── Pagination helper ─────────────────────────────────────────────────────────

export function extractPagination(
  response: AxiosResponse<unknown>,
  page: number,
  perPage: number
): PaginationMeta {
  const total = parseInt(response.headers["x-wp-total"] ?? "0", 10);
  const totalPages = parseInt(response.headers["x-wp-totalpages"] ?? "1", 10);
  const hasMore = page < totalPages;
  return {
    total,
    total_pages: totalPages,
    page,
    per_page: perPage,
    has_more: hasMore,
    ...(hasMore ? { next_page: page + 1 } : {}),
  };
}

// ── Media upload helper ───────────────────────────────────────────────────────

export async function uploadMedia<T>(
  filePath: string,
  extraFields?: Record<string, string>
): Promise<T> {
  const client = getClient();
  const absolutePath = path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`File not found: ${absolutePath}`);
  }

  const fileName = path.basename(absolutePath);
  const fileBuffer = fs.readFileSync(absolutePath);

  const form = new FormData();
  form.append("file", fileBuffer, { filename: fileName });

  if (extraFields) {
    for (const [key, value] of Object.entries(extraFields)) {
      form.append(key, value);
    }
  }

  const response = await client.post<T>("/media", form, {
    headers: {
      ...form.getHeaders(),
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });

  return response.data;
}

// ── Error handler ─────────────────────────────────────────────────────────────

export function handleWpError(error: unknown): string {
  if (error instanceof AxiosError) {
    if (error.response) {
      const status = error.response.status;
      const wpMessage: string =
        (error.response.data as Record<string, unknown>)?.message as string ?? "";
      const wpCode: string =
        (error.response.data as Record<string, unknown>)?.code as string ?? "";

      switch (status) {
        case 400:
          return `Error 400 (Bad Request): ${wpMessage || "Invalid request parameters."} Code: ${wpCode}`;
        case 401:
          return (
            "Error 401 (Unauthorized): Authentication failed. " +
            "Check WP_USERNAME and WP_APP_PASSWORD. " +
            "Make sure you created an Application Password in WP Admin → Users → Profile."
          );
        case 403:
          return (
            `Error 403 (Forbidden): Your user account doesn't have permission for this action. ${wpMessage}`
          );
        case 404:
          return `Error 404 (Not Found): The requested resource does not exist. Check the ID is correct. ${wpCode}`;
        case 409:
          return `Error 409 (Conflict): ${wpMessage || "A resource with this slug/name already exists."}`;
        case 422:
          return `Error 422 (Unprocessable): Validation failed — ${wpMessage}`;
        case 429:
          return "Error 429 (Rate Limited): Too many requests. Please wait before retrying.";
        case 500:
          return `Error 500 (Server Error): WordPress returned an internal error. ${wpMessage}`;
        default:
          return `Error ${status}: ${wpMessage || error.message}`;
      }
    }

    if (error.code === "ECONNABORTED") {
      return "Error: Request timed out. The WordPress site may be slow or unreachable.";
    }
    if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED") {
      return (
        `Error: Cannot connect to WordPress at ${process.env.WP_SITE_URL}. ` +
        "Check WP_SITE_URL and ensure the site is reachable."
      );
    }
  }

  return `Error: Unexpected error — ${error instanceof Error ? error.message : String(error)}`;
}

// ── Truncation helper ─────────────────────────────────────────────────────────

export function truncateIfNeeded(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const truncMsg =
    `\n\n[Response truncated at ${limit} characters. Use pagination (page, per_page) or filters to narrow results.]`;
  return text.slice(0, limit - truncMsg.length) + truncMsg;
}
