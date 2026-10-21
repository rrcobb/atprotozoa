import test from "node:test";
import assert from "node:assert";
import {
  crossOriginRequest,
  parseImageSize,
  quoteDisplay,
  validateCapabilityInput,
} from "../public/lib/hydracept-pure.js";

test("parseImageSize reads WxH", () => {
  assert.deepStrictEqual(parseImageSize("512x768"), { width: 512, height: 768 });
  assert.deepStrictEqual(parseImageSize("nope"), { width: 1024, height: 1024 });
});

test("parseImageSize clamps to the Hydracept image bounds", () => {
  assert.deepStrictEqual(parseImageSize("100x100"), { width: 256, height: 256 });
  assert.deepStrictEqual(parseImageSize("5000x1000"), { width: 3840, height: 1008 });
  assert.deepStrictEqual(parseImageSize("1000x1000"), { width: 1008, height: 1008 });
});

test("quoteDisplay prefers expectedCharge", () => {
  assert.strictEqual(
    quoteDisplay({ expectedCharge: { display: "US$0.05" }, quoteId: "est_x" }),
    "US$0.05",
  );
});

test("validateCapabilityInput enforces allowlist and voice fields", () => {
  assert.strictEqual(validateCapabilityInput("video.generate.v1", {}).ok, false);
  assert.strictEqual(validateCapabilityInput("image.generate.v1", { prompt: "hi" }).ok, false);
  const voice = validateCapabilityInput("audio.voice.generate.v1", {
    text: "hello",
    voiceId: "abc",
    outputFormatPreference: "mp3_44100_128",
  });
  assert.strictEqual(voice.ok, true);
  assert.strictEqual(
    validateCapabilityInput("audio.voice.generate.v1", { text: "x" }).ok,
    false,
  );
});

test("crossOriginRequest only allows the site's own origin", () => {
  assert.strictEqual(crossOriginRequest(null, "https://byok.example/api"), false);
  assert.strictEqual(crossOriginRequest("https://byok.example", "https://byok.example/api"), false);
  assert.strictEqual(crossOriginRequest("https://evil.example", "https://byok.example/api"), true);
  assert.strictEqual(crossOriginRequest("not a url", "https://byok.example/api"), true);
});
