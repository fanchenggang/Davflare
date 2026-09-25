// MCP 工具清单（JSON Schema 定义，纯数据）。
export const MCP_TOOLS = [
  {
    name: "list",
    description:
      "List files and folders at path (depth 1). Empty path is the root.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          default: "",
          description: "Folder key; empty string is the root",
        },
        limit: {
          type: "number",
          minimum: 1,
          maximum: 1000,
          description: "Page size 1-1000",
        },
        cursor: {
          type: "string",
          description: "Pagination cursor from the previous nextCursor",
        },
      },
    },
  },
  {
    name: "upload",
    description:
      "Upload a file. Up to 1 MiB is sent inline; larger content (up to 25 MB) is automatically uploaded in multipart chunks. For even larger files use the web UI or API key scripts.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          default: "",
          description: "Target folder; empty is the root",
        },
        name: { type: "string", description: "File name" },
        content: {
          type: "string",
          description: "File content (utf8 text or base64)",
        },
        encoding: {
          type: "string",
          enum: ["utf8", "base64"],
          default: "utf8",
          description: "How to decode content; default utf8",
        },
        overwrite: {
          type: "boolean",
          description: "Overwrite if the same name already exists (inline uploads only)",
        },
      },
      required: ["name", "content"],
    },
  },
  {
    name: "download",
    description:
      "Download a file. Up to 1 MiB is returned inline (utf8 text or base64). For larger files pass part (1-based) to page through the file in partSize (default 1 MiB) chunks as base64.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Object key of the file" },
        part: {
          type: "number",
          minimum: 1,
          description: "1-based part index for paged download of large files",
        },
        partSize: {
          type: "number",
          minimum: 1,
          maximum: 1048576,
          description: "Chunk size in bytes for paged download; default 1 MiB",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "zip",
    description:
      "Zip a folder (or single file) and return the archive. Up to 1 MiB is returned inline as base64. Larger zips: pass part (1-based) to page through the buffered archive in partSize (default 1 MiB) chunks. Cap 25 MB; beyond that use GET /api/archive with an API key (no public share link).",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Folder or file key to zip (directories strip the folder prefix)",
        },
        part: {
          type: "number",
          minimum: 1,
          description: "1-based part index for paged download of large zips",
        },
        partSize: {
          type: "number",
          minimum: 1,
          maximum: 1048576,
          description: "Chunk size in bytes for paged zip download; default 1 MiB",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "mkdir",
    description: "Create a folder (parent folders are created automatically).",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Folder key to create" },
      },
      required: ["path"],
    },
  },
  {
    name: "delete",
    description:
      "Delete a file or folder. Default is soft delete to trash; set hard=true to permanently delete.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File or folder key" },
        hard: {
          type: "boolean",
          default: false,
          description:
            "If true, permanently delete; otherwise soft-delete to trash",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "search",
    description:
      "Search all objects by filename substring (server-side full scan). Returns matches with a nextCursor for pagination.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Filename substring to match" },
        limit: {
          type: "number",
          minimum: 1,
          maximum: 500,
          description: "Max matches per page (default 100)",
        },
        cursor: {
          type: "string",
          description: "Pagination cursor from the previous nextCursor",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "move",
    description:
      "Move/rename a file or folder to a new key.",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Source file or folder key" },
        to: { type: "string", description: "Destination key" },
        overwrite: {
          type: "boolean",
          default: false,
          description: "Overwrite destination file if it exists",
        },
      },
      required: ["from", "to"],
    },
  },
  {
    name: "copy",
    description:
      "Copy a file to a new key (metadata preserved). Directories are not supported — copy files individually.",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Source file key" },
        to: { type: "string", description: "Destination file key" },
        overwrite: {
          type: "boolean",
          default: false,
          description: "Overwrite destination file if it exists",
        },
      },
      required: ["from", "to"],
    },
  },
  {
    name: "stat",
    description:
      "Get object metadata: kind (file/directory), size, etag, uploaded time, content type.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File or folder key" },
      },
      required: ["path"],
    },
  },
  {
    name: "share_create",
    description:
      "Create a public share link for a file or folder. Returns JSON including a forwardable `url` and `token`. Optional extract code (4-32 chars) and expiry in hours.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File or folder key to share" },
        extractCode: {
          type: "string",
          description: "Optional extraction code, 4-32 characters",
        },
        expiresInHours: {
          type: "number",
          minimum: 1,
          description: "Optional expiry in hours from now",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "share_list",
    description: "List all active share links (token, target, expiry, extract code).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "share_revoke",
    description: "Revoke a share link by token.",
    inputSchema: {
      type: "object",
      properties: {
        token: { type: "string", description: "Share token from share_create/share_list" },
      },
      required: ["token"],
    },
  },
  {
    name: "trash_list",
    description:
      "List soft-deleted items in trash (trashKey, originalKey, name, deletedAt, size).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "trash_restore",
    description:
      "Restore soft-deleted item(s) from trash by trashKey (from trash_list). Fails with conflict if the original path already exists.",
    inputSchema: {
      type: "object",
      properties: {
        trashKey: {
          type: "string",
          description: "Single trash id from trash_list",
        },
        trashKeys: {
          type: "array",
          items: { type: "string" },
          description: "One or more trash ids from trash_list",
        },
      },
    },
  },
  {
    name: "trash_empty",
    description:
      "Permanently delete trash entries. With no args, empties the entire trash. Pass trashKeys to delete specific entries only.",
    inputSchema: {
      type: "object",
      properties: {
        trashKeys: {
          type: "array",
          items: { type: "string" },
          description: "Optional trash ids; omit to empty all",
        },
      },
    },
  },
  {
    name: "sites_list",
    description:
      "List static sites hosted under sites/ with their SPA flag and cached stats (file count, total size).",
    inputSchema: {
      type: "object",
      properties: {
        stats: {
          type: "boolean",
          default: true,
          description: "Include per-site stats (may be cached up to 10 minutes)",
        },
      },
    },
  },
  {
    name: "sites_config",
    description:
      "Update a site config. spa=true makes unknown paths fall back to the site index.html (SPA history routing). The site must already exist.",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Site slug" },
        spa: { type: "boolean", description: "Enable SPA index.html fallback" },
      },
      required: ["slug", "spa"],
    },
  },
  {
    name: "sites_delete",
    description:
      "Delete a static site. Default removes files but keeps the config (SPA flag survives redeploys); purge=true also removes the config.",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Site slug" },
        purge: {
          type: "boolean",
          default: false,
          description: "Also delete the site config",
        },
      },
      required: ["slug"],
    },
  },
  {
    name: "pull",
    description:
      "Walk agents/{global|agent|agent/project}/{skills|rules|mcp}/ and return the tree plus file contents. Merge order for the client: project > agent > global (files are tagged with layer and remote key). Large files page with part/partSize like download.",
    inputSchema: {
      type: "object",
      properties: {
        agent: {
          type: "string",
          description: "Optional agent slug, e.g. cursor. Omit to read the global layer only.",
        },
        project: {
          type: "string",
          description: "Optional project/workspace name under that agent. Requires agent.",
        },
        type: {
          type: "string",
          enum: ["skills", "rules", "mcp"],
          description: "Optional folder filter (skills, rules, or mcp)",
        },
      },
    },
  },
  {
    name: "push",
    description:
      "Upload files into agents/{global|agent|agent/project}/ (mkdir as needed). mcp.json must use ${env:...} placeholders — raw API keys are rejected. No local disk watcher; pass file contents.",
    inputSchema: {
      type: "object",
      properties: {
        agent: {
          type: "string",
          description: "Optional agent slug, e.g. cursor. Omit to write the global layer.",
        },
        project: {
          type: "string",
          description: "Optional project/workspace name. Requires agent.",
        },
        files: {
          type: "array",
          description: "Files relative to that layer root, e.g. skills/commit/SKILL.md or mcp/mcp.json",
          items: {
            type: "object",
            properties: {
              path: { type: "string", description: "Relative path under the layer root" },
              content: { type: "string", description: "File content (utf8 text or base64)" },
              encoding: {
                type: "string",
                enum: ["utf8", "base64"],
                default: "utf8",
                description: "How to decode content; default utf8",
              },
            },
            required: ["path", "content"],
          },
        },
      },
      required: ["files"],
    },
  },
  {
    name: "publish_site",
    description:
      "Copy a drive folder onto sites/{slug}/ (overwrite same names; does not wipe SPA config). Slug is [a-z0-9][a-z0-9-]{0,62}. Errors if the Sites feature switch is off.",
    inputSchema: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description: "Site slug [a-z0-9][a-z0-9-]{0,62}",
        },
        source: {
          type: "string",
          description: "Source folder key in the drive",
        },
      },
      required: ["slug", "source"],
    },
  },
  {
    name: "image_upload",
    description:
      "Upload an image to the image host. Returns id, public url (https://<SITES_HOST>/i/{id}) and Markdown ![](...). Use encoding=base64 for binary. Cap 20 MB. Errors if the Image Host switch is off.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "File name including extension, e.g. shot.png" },
        content: {
          type: "string",
          description: "Image bytes as utf8 text or base64",
        },
        encoding: {
          type: "string",
          enum: ["utf8", "base64"],
          default: "base64",
          description: "How to decode content; default base64 for images",
        },
        contentType: {
          type: "string",
          description: "Optional MIME type, e.g. image/png. Inferred from name if omitted.",
        },
      },
      required: ["name", "content"],
    },
  },
  {
    name: "image_list",
    description:
      "List hosted images with id, name, size, url, and markdown. Errors if the Image Host switch is off.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "image_delete",
    description:
      "Delete a hosted image by id (32 hex chars). Errors if the Image Host switch is off.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Image id from image_upload / image_list" },
      },
      required: ["id"],
    },
  },
] as const;

export const MCP_TOOL_NAMES = MCP_TOOLS.map((tool) => tool.name);
