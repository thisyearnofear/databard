import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runTool, probeDurationSec, validateTiming, cacheKey, cacheMatches, audioHash, requestAudio, preflight } from "../scripts/video/kindness-audio.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const temp = () => mkdtempSync(resolve(tmpdir(), "databard-audio-test-"));

test("subprocess failures and invalid durations fail closed", () => {
  for (const result of [{ error: new Error("missing") }, { status: 1, stderr: "bad" }, { status: null }]) {
    assert.throws(() => runTool("ffprobe", [], () => result), /failed/);
  }
  for (const stdout of ["", "N/A", "0", "-1", "Infinity"]) {
    assert.throws(() => probeDurationSec("clip", () => ({ status: 0, stdout })), /Invalid/);
  }
  assert.equal(probeDurationSec("clip", () => ({ status: 0, stdout: "1.25\n" })), 1.25);
  assert.throws(() => preflight({ mux: true, silent: resolve(root, "missing-test-master.mp4") }, () => {
    assert.fail("must not call tools before checking master");
  }), /Missing silent master/);
});

test("timing rejects overlaps, out-of-order clips and end truncation", () => {
  const a = { id: "a", delayMs: 0, durationSec: 1 };
  const b = { id: "b", delayMs: 1000, durationSec: 1 };
  validateTiming([a, b], 2);
  for (const clips of [[{ ...a, durationSec: 1.01 }, b], [b, a], [a, { ...b, durationSec: 1.01 }], [{ ...a, delayMs: -1 }], []]) {
    assert.throws(() => validateTiming(clips, 2));
  }
});

test("cache requires matching synthesis inputs and unmodified audio", () => {
  const dir = temp();
  try {
    const path = resolve(dir, "clip.mp3");
    const input = { voice: "voice", text: "text", model: "model", settings: { stability: 0.5 }, outputFormat: "mp3" };
    const key = cacheKey(input);
    assert.equal(cacheMatches(path, key), false);
    writeFileSync(path, "audio");
    writeFileSync(`${path}.json`, JSON.stringify({ key, audioHash: audioHash("audio") }));
    assert.equal(cacheMatches(path, key), true);
    for (const field of Object.keys(input)) assert.notEqual(cacheKey({ ...input, [field]: "changed" }), key);
    writeFileSync(path, "tampered");
    assert.equal(cacheMatches(path, key), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("TTS rejects missing credentials, HTTP failure and empty audio", async () => {
  const input = { apiKey: "fake", voice: "test", text: "test", model: "test", settings: {}, outputFormat: "mp3" };
  await assert.rejects(requestAudio({ ...input, apiKey: "" }, () => assert.fail("no fetch")), /not set/);
  await assert.rejects(requestAudio(input, async () => new Response("failure", { status: 401 })), /401/);
  await assert.rejects(requestAudio(input, async () => new Response(new Uint8Array())), /empty/);
  assert.equal((await requestAudio(input, async () => new Response("audio"))).toString(), "audio");
});

test("isolated CLI generates mocked audio, muxes, verifies cache and fails without master", { skip: !process.env.DATABARD_TEST_MEDIA }, () => {
  const dir = temp();
  try {
    const scripts = resolve(dir, "scripts/video");
    const out = resolve(dir, "video/out");
    mkdirSync(scripts, { recursive: true });
    mkdirSync(out, { recursive: true });
    for (const name of ["kindness-tts.mjs", "kindness-audio.mjs"]) copyFileSync(resolve(root, "scripts/video", name), resolve(scripts, name));
    runTool("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=black:s=16x16:r=1:d=85", "-c:v", "libx264", resolve(out, "databard-kindness-silent.mp4")]);
    runTool("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=0.2", resolve(dir, "tone.mp3")]);
    const mock = resolve(dir, "mock.mjs");
    writeFileSync(mock, `import { readFileSync, appendFileSync } from 'node:fs';
globalThis.fetch = async () => {
  if (process.env.NO_FETCH) throw new Error('Unexpected network call');
  appendFileSync(${JSON.stringify(resolve(dir, "calls"))}, 'call\\n');
  return new Response(readFileSync(${JSON.stringify(resolve(dir, "tone.mp3"))}));
};`);
    const cli = (args, env = {}) => spawnSync(process.execPath, ["--import", mock, resolve(scripts, "kindness-tts.mjs"), ...args], {
      encoding: "utf8", timeout: 120_000, env: { ...process.env, ELEVENLABS_API_KEY: "fake", ...env },
    });
    const generated = cli(["--generate", "--mux"]);
    assert.equal(generated.status, 0, generated.stderr);
    assert.equal(readFileSync(resolve(dir, "calls"), "utf8").trim().split("\n").length, 9);
    const final = resolve(out, "databard-kindness-final.mp4");
    assert.ok(Math.abs(probeDurationSec(final) - 85) < 0.1);
    const streams = JSON.parse(runTool("ffprobe", ["-v", "error", "-show_streams", "-of", "json", final])).streams;
    assert.ok(streams.some((s) => s.codec_type === "audio"));
    assert.ok(streams.some((s) => s.codec_type === "video"));
    assert.equal(cli(["--check", "--mux"], { NO_FETCH: "1" }).status, 0);
    const stale = cli(["--check"], { NO_FETCH: "1", ELEVENLABS_TTS_MODEL: "changed-model" });
    assert.notEqual(stale.status, 0);
    assert.match(stale.stderr, /Missing\/stale/);
    rmSync(resolve(out, "databard-kindness-silent.mp4"));
    const missing = cli(["--generate", "--mux"], { NO_FETCH: "1" });
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /Missing silent master/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
