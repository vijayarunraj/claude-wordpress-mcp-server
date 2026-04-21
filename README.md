# WordPress MCP Server

A Model Context Protocol (MCP) server that connects Claude to any WordPress site via the WordPress REST API v2. Manage posts, pages, media, categories, tags, comments, users, and site settings — all from Claude.

Works with **any self-hosted WordPress site** (WP 5.6+) and WordPress.com (Business plan+).

---

## Features

| Resource | Operations |
|---|---|
| **Posts** | List, Get, Create, Update, Delete |
| **Pages** | List, Get, Create, Update, Delete |
| **Media** | List, Get, Upload (from local file), Update, Delete |
| **Categories** | List, Get, Create, Update, Delete |
| **Tags** | List, Get, Create, Update, Delete |
| **Comments** | List, Get, Create, Update (moderate), Delete |
| **Users** | List, Get (by ID or current), Create, Update, Delete |
| **Settings** | Get, Update site-wide settings |
| **Discovery** | List Post Types, List Taxonomies |
| **Search** | Full-text search across all content |

**30 tools total.**

---

## Prerequisites

- **Node.js 18+**
- A **WordPress site** running WP 5.6+ with the REST API enabled (default on all modern WP installs)
- A **WordPress Application Password** (created in WP Admin)

---

## Setup

### Step 1 — Create an Application Password

1. Log into your WordPress admin panel (`https://your-site.com/wp-admin`)
2. Go to **Users → Profile** (or **Users → All Users → [your username] → Edit**)
3. Scroll to the **Application Passwords** section
4. Enter a name (e.g. `Claude MCP`) and click **Add New Application Password**
5. **Copy the generated password** — it is shown only once

> **Note**: Application Passwords are available by default in WordPress 5.6+. If you don't see the section, your site may have them disabled by a plugin or you may be running an older version.

### Step 2 — Build the server

```bash
cd C:\Users\USER\Documents\ClaudeCode\wordpress-mcp-server
npm install
npm run build
```

### Step 3 — Register with Claude Code

Add the following to your Claude Code `.mcp.json` file (located at `%APPDATA%\Claude\` or the project root):

```json
{
  "mcpServers": {
    "wordpress": {
      "command": "node",
      "args": ["C:/Users/USER/Documents/ClaudeCode/wordpress-mcp-server/dist/index.js"],
      "env": {
        "WP_SITE_URL": "https://your-site.com",
        "WP_USERNAME": "your_wordpress_username",
        "WP_APP_PASSWORD": "xxxx xxxx xxxx xxxx xxxx xxxx"
      }
    }
  }
}
```

Replace the placeholder values with your real site URL, username, and Application Password.

> **Tip**: The Application Password can contain spaces — that is the format WordPress generates it in. Either format (with or without spaces) is accepted.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `WP_SITE_URL` | ✅ | Full URL to your WordPress site, no trailing slash (e.g. `https://my-blog.com`) |
| `WP_USERNAME` | ✅ | Your WordPress login username |
| `WP_APP_PASSWORD` | ✅ | Application Password generated in WP Admin |

---

## Example Usage

Once the server is registered, you can ask Claude things like:

- *"List my last 5 draft posts"*
- *"Create a new post titled 'Hello World' with this content: ... and publish it"*
- *"Update post 42 — change its status to draft and add it to the 'News' category"*
- *"Upload the image at C:/Users/USER/Pictures/banner.jpg to my media library with alt text 'Site banner'"*
- *"Show me all pending comments and approve the ones from trusted authors"*
- *"What are my site settings? What's the current posts-per-page setting?"*
- *"Search my site for articles about 'climate change'"*
- *"List all registered custom post types on my site"*

---

## Tool Reference

### Posts
| Tool | Description |
|---|---|
| `wp_list_posts` | List posts with filters (status, search, author, category, tag) |
| `wp_get_post` | Get a single post by ID |
| `wp_create_post` | Create a new post |
| `wp_update_post` | Update an existing post |
| `wp_delete_post` | Delete or trash a post |

### Pages
| Tool | Description |
|---|---|
| `wp_list_pages` | List pages |
| `wp_get_page` | Get a page by ID |
| `wp_create_page` | Create a page |
| `wp_update_page` | Update a page |
| `wp_delete_page` | Delete or trash a page |

### Media
| Tool | Description |
|---|---|
| `wp_list_media` | List media library items |
| `wp_get_media` | Get a media item by ID |
| `wp_upload_media` | Upload a local file to the media library |
| `wp_update_media` | Update media metadata (alt text, caption, title) |
| `wp_delete_media` | Permanently delete a media item |

### Categories
`wp_list_categories`, `wp_get_category`, `wp_create_category`, `wp_update_category`, `wp_delete_category`

### Tags
`wp_list_tags`, `wp_get_tag`, `wp_create_tag`, `wp_update_tag`, `wp_delete_tag`

### Comments
`wp_list_comments`, `wp_get_comment`, `wp_create_comment`, `wp_update_comment` (approve/hold/spam/trash), `wp_delete_comment`

### Users
`wp_list_users`, `wp_get_user`, `wp_get_current_user`, `wp_create_user`, `wp_update_user`, `wp_delete_user`

### Settings & Discovery
`wp_get_settings`, `wp_update_settings`, `wp_list_post_types`, `wp_list_taxonomies`, `wp_search`

---

## Authentication Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| 401 Unauthorized | Wrong credentials | Double-check `WP_USERNAME` and `WP_APP_PASSWORD` |
| 403 Forbidden | Insufficient role | Use an Administrator account for full access |
| 404 Not Found | Wrong site URL or REST API disabled | Check `WP_SITE_URL`; ensure REST API is not blocked by a security plugin |
| ENOTFOUND | Site unreachable | Check the URL and network connectivity |

> **Security plugins**: Some plugins (Wordfence, iThemes Security) can block REST API access. You may need to whitelist the REST API or the Application Password auth method.

---

## Development

```bash
# Development with auto-reload
npm run dev

# Build
npm run build

# Test with MCP Inspector
npx @modelcontextprotocol/inspector node dist/index.js
```
