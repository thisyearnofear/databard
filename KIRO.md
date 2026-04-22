# Building DataBard with Kiro

This document chronicles how Kiro was used to build DataBard — a podcast generator for data catalogs that turns OpenMetadata schemas into audio episodes using ElevenLabs TTS.

## Project Stats
- **Timeline**: 6 days (hackathon sprint)
- **Lines of code**: ~5,000 (15 API routes, 10 lib modules, 5 components)
- **Kiro features used**: Specs, steering (2 files), hooks (1 active), MCP integration
- **APIs integrated**: OpenMetadata REST API, ElevenLabs SDK (TTS + Sound Effects API), dbt Cloud, The Graph (GraphQL introspection), Dune Analytics, Stripe, Initia InterwovenKit

## Workflow

### 1. Spec-Driven Development
Created detailed specs in `.kiro/specs/` before writing any implementation code. This prevented scope drift and kept the two-hackathon timeline on track.

**Example prompt to Kiro:**
> "Create a spec for the audio synthesis pipeline. It should fetch metadata from OpenMetadata, generate a two-host script (Alex and Morgan), synthesize speech with ElevenLabs, add sound effects for transitions, and return a single mp3 blob."

**Result:** Kiro generated a structured spec with:
- API route contract (`POST /api/synthesize`)
- Request/response shapes
- Module dependencies (openmetadata.ts → script-generator.ts → audio-engine.ts)
- Error handling requirements

**Before/after:**
- **Before**: Jumped straight into coding, realized halfway through that lineage data wasn't being fetched
- **After**: Spec explicitly listed all OpenMetadata fields needed (tables, columns, quality tests, lineage, tags) — no missing data

### 2. Steering Rules
Defined two steering files:
1. **conventions.md** — project-wide patterns (TypeScript strict mode, functional components, DRY principle)
2. **elevenlabs.md** — ElevenLabs-specific patterns (voice IDs, context stitching, sound effect prompts)

**Example prompt to Kiro:**
> "Build the audio engine module. Use the ElevenLabs SDK to synthesize speech for each script segment."

**Result:** Kiro automatically applied the steering rules:
- Used the correct voice IDs from `elevenlabs.md` (Alex = George, Morgan = Charlotte)
- Added `previous_text` and `next_text` parameters for context stitching (from steering)
- Inserted transition sound effects between topic changes (from steering)
- Used singleton pattern for ElevenLabsClient (from conventions.md DRY principle)

**Code snippet showing steering in action:**
```typescript
// Kiro generated this with correct voice IDs and context stitching
// because elevenlabs.md steering was active
const VOICES = {
  Alex: "JBFqnCBsd6RMkjVDRZzb",   // George
  Morgan: "XB0fDUnXU5powFXDhCwa",  // Charlotte
} as const;

export async function synthesizeSpeech(
  segment: ScriptSegment,
  prevText?: string,  // ← context stitching from steering
  nextText?: string,
): Promise<Buffer> {
  const stream = await getClient().textToSpeech.convert(
    VOICES[segment.speaker],
    {
      text: segment.text,
      model_id: MODEL,
      output_format: "mp3_44100_128",
      ...(prevText && { previous_text: prevText }),
      ...(nextText && { next_text: nextText }),
    },
  );
  return streamToBuffer(stream);
}
```

### 3. Agent Hooks
Set up a `fileEdited` hook to auto-validate API routes against the design spec on every save.

**Hook configuration:**
```json
{
  "name": "Validate API Routes",
  "when": {
    "type": "fileEdited",
    "patterns": ["src/app/api/*/route.ts"]
  },
  "then": {
    "type": "askAgent",
    "prompt": "Check that this API route matches the design spec in PLAN.md: correct request body shape, proper error handling with try/catch, NextResponse.json for errors. If it doesn't match, suggest fixes."
  }
}
```

**Real example:** When I saved `src/app/api/synthesize/route.ts`, the hook caught that I forgot to handle the case where `fetchSchemaMeta` returns an empty schema. Kiro suggested adding a check and returning a 404. Saved a bug that would've surfaced in production.

### 4. DRY Principle Enforcement
Kiro proactively consolidated duplicated code when building the OpenMetadata client.

**Before:** The `/api/connect` route had inline fetch logic for listing schemas:
```typescript
const res = await fetch(`${url}/api/v1/databases?limit=100`, {
  headers: { Authorization: `Bearer ${token}` },
});
// ... 30 lines of nested fetching
```

**After Kiro refactor:** Extracted to shared `lib/openmetadata.ts`:
```typescript
export async function listSchemas(conn: OMConnection): Promise<string[]> {
  // Single source of truth for OM API interactions
}
```

Then updated `/api/connect` to use it:
```typescript
const schemas = await listSchemas({ url, token });
return NextResponse.json({ ok: true, schemas });
```

**Impact:** When I later needed to add retry logic for flaky OM connections, I only had to change one function instead of four route files.

## Key Wins

### 1. Faster Iteration
Specs prevented scope drift during the 6-day sprint. When I was tempted to add "real-time streaming playback" (out of scope), the spec reminded me the MVP was "single mp3 blob response."

### 2. Consistent Code
Steering rules eliminated 100+ style decisions:
- No debates about "should we use arrow functions or function declarations?" (steering says functional components with hooks)
- No "which ElevenLabs voice should Alex use?" (steering defines it once)
- No "how do we handle OM API errors?" (steering says try/catch with NextResponse.json)

### 3. Automated QA
The API validation hook caught 3 bugs before commit:
1. Missing error handling in `/api/metadata`
2. Incorrect response shape in `/api/generate-script` (returned `{ script }` instead of `{ ok: true, meta, script }`)
3. Forgot to set `Content-Type: audio/mpeg` header in `/api/synthesize`

### 4. Deep API Integration
Kiro helped navigate complex SDK types. When integrating ElevenLabs, I asked:
> "Check the elevenlabs SDK types in node_modules and show me how to call text-to-speech and sound effects APIs"

Kiro read the `.d.ts` files, found `textToSpeech.convert()` and `textToSoundEffects.convert()`, and generated correct usage with proper types. Saved hours of SDK documentation diving.

## Challenges

### 1. Initial Spec Writing
Writing detailed specs upfront felt slow at first. The `audio-synthesis.spec.md` took 30 minutes to write before any code. But it saved 2+ hours of refactoring later when I realized I needed lineage data.

**Lesson:** Spec time is front-loaded but pays off exponentially.

### 2. Learning Curve for Hooks
Hook syntax (especially `fileEdited` with glob patterns) took trial and error. First attempt used `*.ts` instead of `src/app/api/*/route.ts` and triggered on every TypeScript file save (noisy).

**Lesson:** Start with narrow patterns, expand later.

### 3. Balancing Automation vs Manual Control
The API validation hook sometimes triggered false positives (e.g., flagging intentional deviations from the spec). Had to tune the prompt to say "if it doesn't match, suggest fixes" instead of "enforce strict compliance."

**Lesson:** Hooks should suggest, not block.

## Concrete Examples

### Example 1: Script Generator
**Prompt:** "Build the script generator. It should take schema metadata and produce a two-host conversation. Alex is enthusiastic, Morgan is skeptical and focuses on quality issues."

**Kiro output:** Generated `lib/script-generator.ts` with:
- Intro/outro functions
- Per-table discussion with column summaries
- Quality test analysis (Morgan calls out failures)
- Lineage section
- Personality-driven dialogue (Alex: "Let's get into it", Morgan: "Red flag on...")

**Why this worked:** The spec defined the `ScriptSegment` type and the steering defined the host personalities. Kiro combined both to generate contextually appropriate code.

### Example 2: Waveform Visualization
**Prompt:** "Add a waveform visualization to the episode player using Web Audio API and canvas."

**Kiro output:** Generated canvas-based frequency visualization with:
- `AnalyserNode` setup
- `requestAnimationFrame` loop
- HSL color gradient based on frequency data
- Proper cleanup on unmount

**Why this worked:** Conventions steering said "functional components with hooks" so Kiro used `useRef`, `useEffect`, and `useCallback` idiomatically.

## Metrics

### Code Quality
- **0 linting errors** (steering enforced style)
- **0 type errors** (TypeScript strict mode from conventions)
- **3 bugs caught by hooks** before commit

### Development Speed
- **Day 1**: Specs + steering setup (4 hours)
- **Day 2**: Core pipeline (metadata → script → audio) working end-to-end (6 hours)
- **Day 3**: UI polish + waveform (4 hours)

**Total implementation time:** 14 hours for a working MVP (vs estimated 25+ hours without Kiro)

### Kiro Feature Usage
- **Specs**: 3 active specs (API routes, audio pipeline, UI components)
- **Steering**: 2 files (conventions, elevenlabs) — 47 lines total
- **Hooks**: 1 active hook (API validation)
- **MCP**: OpenMetadata MCP server for catalog browsing (fallback to REST API)

## Conclusion

Kiro's spec + steering + hooks workflow enabled rapid, consistent development of a complex multi-API integration project. The key insight: **upfront structure (specs, steering) pays for itself in reduced refactoring and debugging time.**

For hackathons specifically, Kiro's value is:
1. **Specs prevent scope creep** when you're racing a deadline
2. **Steering eliminates bikeshedding** (no time to debate style)
3. **Hooks catch bugs early** (no time for manual QA)

Would I use Kiro for non-hackathon projects? Absolutely. The workflow scales — more complex projects benefit even more from structured specs and automated validation.

The project grew from an 800-line MVP to a 5,000-line production system (Pro tier, scheduled episodes, PDF export, onchain data sources, Initia wallet integration) — all while maintaining zero TypeScript errors and consistent code style, because the steering rules and specs kept every new feature aligned with the original architecture.

## Hackathon Submission

### Project Description (copy-paste ready)

**DataBard** turns your data catalog into a podcast. Two AI hosts — Alex (the enthusiast) and Morgan (the skeptic) — have a natural conversation about your OpenMetadata schemas, dbt models, or onchain subgraphs: flagging failing tests, tracing lineage, calling out PII columns, and debating what needs fixing.

**ElevenLabs APIs used:**
- `textToSpeech.convert()` — dual-voice synthesis with context stitching (`previous_text`/`next_text`) for natural prosody across segment boundaries
- `textToSoundEffects.convert()` — dynamically generated transition SFX between podcast topics (cached 30 days)

**Kiro workflow:**
- Specs defined the full API contract before any code was written (prevented scope drift in a 6-day sprint)
- Steering files (`elevenlabs.md`, `conventions.md`) ensured correct voice IDs, context stitching params, and code style were applied automatically across every generated file
- `fileEdited` hook auto-validated API routes against the design spec on every save — caught 3 bugs before commit

**Live demo:** https://databard.vercel.app  
**Repo:** https://github.com/thisyearnofear/databard  
**Built with:** Next.js 15, ElevenLabs SDK, OpenMetadata API, Kiro spec-driven development

### Social Post Template

> 🎙️ I built DataBard with @kirodotdev + @elevenlabsio — your data catalog as a podcast.
>
> Two AI hosts debate your schema health, flag failing tests, and trace lineage. Kiro wrote the specs, steered the ElevenLabs integration, and caught bugs before commit.
>
> Try it: https://databard.vercel.app
>
> #ElevenHacks #CodeWithKiro

---

## Appendix: Prompts That Worked Well

1. "Create a spec for [feature] with [these requirements]"
2. "Build [module] using [API/library]. Follow the steering rules."
3. "Refactor [file] to eliminate duplication — extract shared logic to lib/"
4. "Check the [SDK] types in node_modules and show me how to call [method]"
5. "Add a hook that validates [pattern] on [event]"

## Appendix: Prompts That Didn't Work

1. "Build the entire app" (too vague — Kiro asked clarifying questions, wasted time)
2. "Make it look good" (subjective — better to say "dark theme with purple accent, inspired by Spotify")
3. "Fix the bug" without context (Kiro needs the error message or failing test)

**Lesson:** Specific, actionable prompts >> vague requests.
