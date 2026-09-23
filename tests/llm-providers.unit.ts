import { parseJsonFromText } from "../src/lib/llm-providers";

let passed = 0;
let failed = 0;
function assert(condition: boolean, label: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

// Plain JSON object
{
  const v = parseJsonFromText('{"a":1}');
  assert((v as { a: number }).a === 1, "plain object parses");
}

// Plain JSON array
{
  const v = parseJsonFromText('[{"speaker":"Alex"}]');
  assert(Array.isArray(v) && v.length === 1, "plain array parses");
}

// ```json fenced
{
  const v = parseJsonFromText('```json\n{"segments":[{"speaker":"Alex","text":"hi"}]}\n```');
  assert((v as { segments: unknown[] }).segments.length === 1, "json fence strips");
}

// Bare ``` fence
{
  const v = parseJsonFromText('```\n[1,2,3]\n```');
  assert(Array.isArray(v) && (v as number[])[2] === 3, "bare fence strips");
}

// Fence with leading/trailing whitespace
{
  const v = parseJsonFromText('   ```json\n{"ok":true}\n```   ');
  assert((v as { ok: boolean }).ok === true, "padded fence parses");
}

// Invalid JSON throws (callers fall back to templates)
{
  let threw = false;
  try {
    parseJsonFromText("not json at all");
  } catch {
    threw = true;
  }
  assert(threw, "invalid text throws");
}

// Prose around JSON still throws — we only strip a surrounding fence
{
  let threw = false;
  try {
    parseJsonFromText('Here is the JSON: {"a":1} hope that helps');
  } catch {
    threw = true;
  }
  assert(threw, "prose-wrapped JSON throws (honest)");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
