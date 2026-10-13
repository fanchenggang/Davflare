/**
 * PicGo / PicList uploader for Davflare image host.
 * Reuses existing POST /api/images — no new Davflare APIs.
 */

"use strict";

const UPLOADER_ID = "davflare";

/**
 * @param {string} origin
 * @returns {string}
 */
function normalizeOrigin(origin) {
  const raw = String(origin || "").trim();
  if (!raw) return "";
  try {
    const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return `${u.protocol}//${u.host}`;
  } catch {
    return raw.replace(/\/+$/, "");
  }
}

/**
 * @param {string} origin
 * @returns {string}
 */
function imagesEndpoint(origin) {
  return `${normalizeOrigin(origin)}/api/images`;
}

/**
 * Prefer encodeURIComponent when the name is not already a pure ASCII ByteString-safe token.
 * Server accepts both raw UTF-8 (curl) and percent-encoded (Node clients).
 * @param {string} name
 * @returns {string}
 */
function headerFileName(name) {
  const base = String(name || "image.png").replace(/\\/g, "/").split("/").pop() || "image.png";
  // Always percent-encode so Node/Electron fetch never hits ByteString errors.
  return encodeURIComponent(base);
}

/**
 * @param {import('picgo').PicGo} ctx
 * @param {{ url: string, apiKey: string }} userConfig
 * @param {{ buffer?: Buffer, base64Image?: string, fileName?: string, extname?: string }} img
 */
async function uploadOne(ctx, userConfig, img) {
  let body = img.buffer;
  if (!body && img.base64Image) {
    body = Buffer.from(img.base64Image, "base64");
  }
  if (!body || !body.length) {
    throw new Error("empty image buffer");
  }

  const fileName = img.fileName || `image${img.extname || ".png"}`;
  const endpoint = imagesEndpoint(userConfig.url);
  const headers = {
    Authorization: `Bearer ${userConfig.apiKey}`,
    "X-Api-Key": userConfig.apiKey,
    "X-File-Name": headerFileName(fileName),
    "User-Agent": "picgo-plugin-davflare",
  };

  // Prefer multipart field `file` (API accepts it); fall back to raw body via request options.
  const requestOptions = {
    method: "POST",
    url: endpoint,
    headers: { ...headers },
    formData: {
      file: {
        value: body,
        options: {
          filename: fileName,
          contentType: guessContentType(fileName, img.extname),
        },
      },
    },
  };

  let responseText;
  if (typeof ctx.request === "function") {
    responseText = await ctx.request(requestOptions);
  } else if (ctx.Request && typeof ctx.Request.request === "function") {
    responseText = await ctx.Request.request(requestOptions);
  } else if (typeof fetch === "function") {
    // Node 18+ / modern Electron fallback
    const FormDataCtor = globalThis.FormData;
    const BlobCtor = globalThis.Blob;
    if (!FormDataCtor || !BlobCtor) {
      throw new Error("fetch FormData unavailable; upgrade PicGo / Node");
    }
    const form = new FormDataCtor();
    form.append(
      "file",
      new BlobCtor([body], { type: guessContentType(fileName, img.extname) }),
      fileName
    );
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: headers.Authorization,
        "X-Api-Key": headers["X-Api-Key"],
        "X-File-Name": headers["X-File-Name"],
        "User-Agent": headers["User-Agent"],
      },
      body: form,
    });
    responseText = await res.text();
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${responseText.slice(0, 200)}`);
    }
  } else {
    throw new Error("no HTTP client available in PicGo ctx");
  }

  let parsed;
  try {
    parsed = typeof responseText === "string" ? JSON.parse(responseText) : responseText;
  } catch {
    throw new Error(`invalid JSON from Davflare: ${String(responseText).slice(0, 200)}`);
  }
  if (!parsed || typeof parsed.url !== "string" || !parsed.url) {
    throw new Error(
      parsed && parsed.error
        ? String(parsed.error)
        : "Davflare response missing url (is SITES_HOST set?)"
    );
  }
  return parsed.url;
}

/**
 * @param {string} fileName
 * @param {string} [extname]
 */
function guessContentType(fileName, extname) {
  const name = `${fileName || ""}${extname || ""}`.toLowerCase();
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".gif")) return "image/gif";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".svg")) return "image/svg+xml";
  if (name.endsWith(".avif")) return "image/avif";
  if (name.endsWith(".bmp")) return "image/bmp";
  if (name.endsWith(".ico")) return "image/x-icon";
  return "application/octet-stream";
}

/**
 * @param {import('picgo').PicGo} ctx
 */
const handle = async (ctx) => {
  const userConfig = ctx.getConfig(`picBed.${UPLOADER_ID}`);
  if (!userConfig || !userConfig.url || !userConfig.apiKey) {
    throw new Error("Davflare config missing: set site URL and API Key");
  }
  const config = {
    url: String(userConfig.url).trim(),
    apiKey: String(userConfig.apiKey).trim(),
  };
  if (!normalizeOrigin(config.url)) {
    throw new Error("Davflare site URL is invalid");
  }

  const list = ctx.output || [];
  for (let i = 0; i < list.length; i++) {
    try {
      const imgUrl = await uploadOne(ctx, config, list[i]);
      delete list[i].base64Image;
      delete list[i].buffer;
      list[i].imgUrl = imgUrl;
      list[i].url = imgUrl;
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      ctx.emit("notification", {
        title: "Davflare upload failed",
        body: message,
      });
      throw err;
    }
  }
  return ctx;
};

/**
 * @param {import('picgo').PicGo} ctx
 */
const config = (ctx) => {
  let userConfig = ctx.getConfig(`picBed.${UPLOADER_ID}`);
  if (!userConfig) userConfig = {};
  return [
    {
      name: "url",
      type: "input",
      default: userConfig.url || "",
      required: true,
      message: "https://your-davflare-host",
      alias: "Site URL",
    },
    {
      name: "apiKey",
      type: "password",
      default: userConfig.apiKey || "",
      required: true,
      message: "fd_… API Key",
      alias: "API Key",
    },
  ];
};

module.exports = (ctx) => {
  const register = () => {
    ctx.helper.uploader.register(UPLOADER_ID, {
      handle,
      name: "Davflare",
      config,
    });
  };
  return {
    register,
    uploader: UPLOADER_ID,
    // Exported for unit tests / local scripts
    _internal: {
      UPLOADER_ID,
      normalizeOrigin,
      imagesEndpoint,
      headerFileName,
      guessContentType,
    },
  };
};

module.exports.UPLOADER_ID = UPLOADER_ID;
module.exports.normalizeOrigin = normalizeOrigin;
module.exports.imagesEndpoint = imagesEndpoint;
module.exports.headerFileName = headerFileName;
module.exports.guessContentType = guessContentType;
