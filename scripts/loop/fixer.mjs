/**
 * The loop's coding-agent fixer.
 *
 * Given a failing invariant test + TestSprite's root-cause hypothesis, walks a provider
 * fallback chain (Venice → NVIDIA → Anthropic by default; see providers.mjs) asking for
 * a strict-JSON patch: { file, old_string, new_string, commit_message, reasoning }.
 *
 * Response schema is enforced. The LLM cannot output free-form code that we execute.
 * We validate the patch, apply it verbatim to the file, and let loop.mjs commit it.
 *
 * No nested CLI, no permission bypass. Every mutation is a plain fs.writeFileSync that a
 * reviewer can trace and revert with `git revert`.
 */
import { readFileSync, writeFileSync } from "fs";
import { join, resolve, isAbsolute } from "path";
import { enabledProviders, listConfigured } from "./providers.mjs";

const MAX_TOKENS = 1500;

/**
 * @param {object} args
 * @param {string} args.repoRoot  Absolute path of the repo
 * @param {object} args.test      { name, file, scopeHint }
 * @param {object} args.failure   TestSprite failure bundle (or raw output)
 * @param {string} args.candidatePath  Suggested file to inspect first
 * @returns {Promise<{ok: true, path: string, commitMessage: string, provider: string, reasoning: string} | {ok: false, reason: string, attempts: Array}>}
 */
export async function proposeAndApplyFix({ repoRoot, test, failure, candidatePath, expectedAnchor }) {
  const configured = listConfigured();
  if (configured.length === 0) {
    return {
      ok: false,
      reason: "No LLM providers configured. Set at least one of VENICE_API_KEY, NVIDIA_NIM_API_KEY, ANTHROPIC_API_KEY in .env",
      attempts: [],
    };
  }
  log(`[fixer] providers in fallback order: ${configured.join(" → ")}`);

  const { systemPrompt, userPrompt } = buildPrompts({ repoRoot, test, failure, candidatePath, expectedAnchor });

  const attempts = [];
  for (const provider of enabledProviders()) {
    log(`[fixer] trying ${provider.name} (${provider.model})…`);
    let text;
    try {
      text = await provider.chat({ system: systemPrompt, user: userPrompt, maxTokens: MAX_TOKENS });
    } catch (e) {
      log(`[fixer] × ${provider.name}: ${e.message}`);
      attempts.push({ provider: provider.name, ok: false, reason: e.message });
      continue;
    }

    const parsed = parsePatch(text);
    if (!parsed.ok) {
      log(`[fixer] × ${provider.name}: bad JSON — ${parsed.reason}`);
      attempts.push({ provider: provider.name, ok: false, reason: `bad JSON: ${parsed.reason}` });
      continue;
    }

    // Anchor check — the model must have targeted the correct region of the file.
    if (expectedAnchor && !parsed.data.old_string.includes(expectedAnchor)) {
      const reason = `wrong region: old_string does not include expected anchor '${expectedAnchor}'`;
      log(`[fixer] × ${provider.name}: ${reason}`);
      attempts.push({ provider: provider.name, ok: false, reason });
      continue;
    }

    const applied = applyPatch(repoRoot, parsed.data);
    if (!applied.ok) {
      const preview = parsed.data.old_string.slice(0, 120).replace(/\n/g, "\\n");
      log(`[fixer] × ${provider.name}: patch rejected — ${applied.reason}`);
      log(`[fixer]   attempted old_string (preview): "${preview}..."`);
      attempts.push({ provider: provider.name, ok: false, reason: applied.reason });
      continue;
    }

    log(`[fixer] ✓ ${provider.name} patched ${parsed.data.file}`);
    return {
      ok: true,
      path: parsed.data.file,
      commitMessage: parsed.data.commit_message,
      reasoning: parsed.data.reasoning ?? "",
      provider: provider.name,
      attempts,
    };
  }

  return {
    ok: false,
    reason: `All ${attempts.length} providers exhausted`,
    attempts,
  };
}

function buildPrompts({ repoRoot, test, failure, candidatePath, expectedAnchor }) {
  const testSrcPath = join(repoRoot, "tests/testsprite", test.file);
  const testSrc = readFileSync(testSrcPath, "utf-8");
  let candidateSrc = "";
  try {
    candidateSrc = candidatePath ? readFileSync(join(repoRoot, candidatePath), "utf-8") : "";
  } catch { /* candidate may not exist yet; the model can still propose */ }

  const failureText = typeof failure === "string" ? failure : JSON.stringify(failure, null, 2);

  const systemPrompt = `You are a code-fixing subagent inside an automated verification loop.
Your ONLY job is to output valid JSON matching the schema below — no prose, no code fences,
no explanation. Wrap absolutely nothing around the JSON.

Schema (strict):
{
  "file": "<repo-relative path to edit>",
  "old_string": "<the EXACT current substring to replace — must be unique in the file, ≥20 chars, include enough surrounding context to be unambiguous>",
  "new_string": "<the replacement substring>",
  "commit_message": "<one-line conventional commit, prefix with 'loop(fix):'>",
  "reasoning": "<one sentence, ≤ 200 chars, why this fix restores the invariant>"
}

Rules:
- old_string MUST appear literally in the file's current contents (whitespace-exact).
- new_string MUST differ from old_string.
${expectedAnchor ? `- old_string MUST include the substring "${expectedAnchor}" — this anchors your edit to the correct region. Patches without this anchor are rejected before being applied.` : ""}
- Prefer edits to the persona pricing / buyer scoring / market glue files. Avoid touching
  the escrow program or shared types unless the root-cause clearly points there.
- Keep the diff minimal. One region, one change. If more is needed, pick the highest-impact
  region.
- Do not add comments referencing the loop, TestSprite, or this iteration.

Return ONLY the JSON. Do not preface with "Here is" or use markdown fences.`;

  const userPrompt = `Failing invariant test (${test.name}):
\`\`\`python
${truncate(testSrc, 2500)}
\`\`\`

Suspect scope: ${test.scopeHint}

${candidatePath ? `Candidate file (${candidatePath}) — the exact current source you MUST read from, not invent:
\`\`\`
${truncate(candidateSrc, 14000)}
\`\`\`` : ""}

TestSprite failure bundle / raw output:
\`\`\`
${truncate(failureText, 3500)}
\`\`\`

Output the JSON patch now.`;

  return { systemPrompt, userPrompt };
}

function applyPatch(repoRoot, patch) {
  const targetAbs = isAbsolute(patch.file) ? patch.file : join(repoRoot, patch.file);
  if (!targetAbs.startsWith(resolve(repoRoot))) {
    return { ok: false, reason: `Patch escapes repo root: ${patch.file}` };
  }
  let current;
  try {
    current = readFileSync(targetAbs, "utf-8");
  } catch {
    return { ok: false, reason: `Target file not readable: ${patch.file}` };
  }
  const occurrences = countOccurrences(current, patch.old_string);
  if (occurrences === 0) {
    return { ok: false, reason: `old_string not found in ${patch.file}` };
  }
  if (occurrences > 1) {
    return { ok: false, reason: `old_string ambiguous in ${patch.file} (${occurrences} matches)` };
  }
  const updated = current.replace(patch.old_string, patch.new_string);
  if (updated === current) {
    return { ok: false, reason: "Replacement produced no change" };
  }
  writeFileSync(targetAbs, updated);
  return { ok: true };
}

function parsePatch(text) {
  const trimmed = text.trim();
  // Some models still wrap in markdown fences despite instructions — strip them.
  const stripped = trimmed.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  // Some models add a preamble like "Here is the JSON:" — try to isolate the first `{`…`}` block.
  const startIdx = stripped.indexOf("{");
  const endIdx = stripped.lastIndexOf("}");
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    return { ok: false, reason: "no JSON object found in response" };
  }
  const jsonText = stripped.slice(startIdx, endIdx + 1);
  let data;
  try {
    data = JSON.parse(jsonText);
  } catch (e) {
    return { ok: false, reason: e.message };
  }
  const required = ["file", "old_string", "new_string", "commit_message"];
  for (const k of required) {
    if (typeof data[k] !== "string" || data[k].length === 0) {
      return { ok: false, reason: `missing/invalid field: ${k}` };
    }
  }
  if (data.old_string.length < 20) {
    return { ok: false, reason: "old_string too short — must be ≥20 chars (uniqueness check happens at apply time)" };
  }
  return { ok: true, data };
}

function countOccurrences(haystack, needle) {
  if (needle.length === 0) return 0;
  let n = 0, i = 0;
  while ((i = haystack.indexOf(needle, i)) !== -1) {
    n++;
    i += needle.length;
  }
  return n;
}

function truncate(s, n) {
  if (s.length <= n) return s;
  return s.slice(0, n) + `\n… (truncated ${s.length - n} chars)`;
}

function log(...args) {
  console.log(...args);
}
