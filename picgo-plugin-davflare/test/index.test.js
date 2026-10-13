"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeOrigin,
  imagesEndpoint,
  headerFileName,
  guessContentType,
  UPLOADER_ID,
} = require("../index.js");

describe("picgo-plugin-davflare helpers", () => {
  it("normalizes origin and builds /api/images", () => {
    assert.equal(normalizeOrigin("https://drive.example.com/"), "https://drive.example.com");
    assert.equal(normalizeOrigin("drive.example.com"), "https://drive.example.com");
    assert.equal(
      imagesEndpoint("https://drive.example.com/"),
      "https://drive.example.com/api/images"
    );
  });

  it("percent-encodes X-File-Name for non-ASCII", () => {
    assert.equal(headerFileName("shot.png"), "shot.png");
    assert.equal(headerFileName("截图.png"), encodeURIComponent("截图.png"));
    assert.equal(headerFileName("a/b/c.png"), "c.png");
  });

  it("guesses content types", () => {
    assert.equal(guessContentType("a.PNG"), "image/png");
    assert.equal(guessContentType("x", ".webp"), "image/webp");
  });

  it("uploader id is davflare", () => {
    assert.equal(UPLOADER_ID, "davflare");
  });
});
