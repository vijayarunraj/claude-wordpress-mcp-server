/**
 * TypeScript interfaces for WordPress REST API v2 objects.
 * These match the shapes returned by the API (selected fields).
 */

export interface WpRendered {
  rendered: string;
  raw?: string;
}

// ── Posts & Pages ─────────────────────────────────────────────────────────────

export interface WpPost {
  id: number;
  date: string;
  date_gmt: string;
  modified: string;
  modified_gmt: string;
  slug: string;
  status: string;
  type: string;
  link: string;
  title: WpRendered;
  content: WpRendered;
  excerpt: WpRendered;
  author: number;
  featured_media: number;
  comment_status: string;
  ping_status: string;
  sticky: boolean;
  categories: number[];
  tags: number[];
  format?: string;
}

export interface WpPage extends Omit<WpPost, "sticky" | "categories" | "tags" | "format"> {
  parent: number;
  menu_order: number;
  template: string;
}

// ── Media ─────────────────────────────────────────────────────────────────────

export interface WpMediaDetails {
  width?: number;
  height?: number;
  file?: string;
  sizes?: Record<string, unknown>;
}

export interface WpMedia {
  id: number;
  date: string;
  slug: string;
  status: string;
  type: string;
  link: string;
  title: WpRendered;
  author: number;
  caption: WpRendered;
  alt_text: string;
  media_type: string;
  mime_type: string;
  media_details: WpMediaDetails;
  post: number | null;
  source_url: string;
}

// ── Taxonomy Terms ─────────────────────────────────────────────────────────────

export interface WpTerm {
  id: number;
  count: number;
  description: string;
  link: string;
  name: string;
  slug: string;
  taxonomy: string;
  parent?: number;
}

// ── Comments ──────────────────────────────────────────────────────────────────

export interface WpComment {
  id: number;
  post: number;
  parent: number;
  author: number;
  author_name: string;
  author_email: string;
  author_url: string;
  date: string;
  date_gmt: string;
  content: WpRendered;
  link: string;
  status: string;
  type: string;
}

// ── Users ─────────────────────────────────────────────────────────────────────

export interface WpUser {
  id: number;
  name: string;
  url: string;
  description: string;
  link: string;
  slug: string;
  avatar_urls: Record<string, string>;
  roles?: string[];
  email?: string;
  username?: string;
}

// ── Settings ──────────────────────────────────────────────────────────────────

export interface WpSettings {
  title: string;
  description: string;
  url: string;
  email: string;
  timezone: string;
  date_format: string;
  time_format: string;
  start_of_week: number;
  language: string;
  use_smilies: boolean;
  default_category: number;
  default_post_format: string;
  posts_per_page: number;
  show_on_front: string;
  page_on_front: number;
  page_for_posts: number;
}

// ── Post Types / Taxonomies ───────────────────────────────────────────────────

export interface WpPostType {
  capabilities: Record<string, string>;
  description: string;
  hierarchical: boolean;
  labels: Record<string, string>;
  name: string;
  slug: string;
  rest_base: string;
  rest_namespace: string;
}

export interface WpTaxonomy {
  capabilities: Record<string, string>;
  description: string;
  hierarchical: boolean;
  labels: Record<string, string>;
  name: string;
  slug: string;
  rest_base: string;
  types: string[];
}

// ── Search ────────────────────────────────────────────────────────────────────

export interface WpSearchResult {
  id: number;
  title: string;
  url: string;
  type: string;
  subtype: string;
}

// ── Pagination metadata ───────────────────────────────────────────────────────

export interface PaginationMeta {
  total: number;
  total_pages: number;
  page: number;
  per_page: number;
  has_more: boolean;
  next_page?: number;
}
