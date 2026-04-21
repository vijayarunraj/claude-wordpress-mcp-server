/**
 * Shared constants for the WordPress MCP server.
 */

/** Maximum characters in a single tool response before truncation. */
export const CHARACTER_LIMIT = 25000;

/** Default number of items per page for list operations. */
export const DEFAULT_PER_PAGE = 10;

/** WordPress REST API v2 base path (relative to site root). */
export const WP_API_PATH = "/wp-json/wp/v2";

/** WordPress REST API search path. */
export const WP_SEARCH_PATH = "/wp-json/wp/v2/search";
