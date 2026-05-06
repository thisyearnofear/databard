# Testing DataBard

## Quick Start Testing

### 1. Set Up Environment

Edit `.env` with your actual credentials:

```env
ELEVENLABS_API_KEY=sk_your_actual_key_here
OPENMETADATA_URL=https://sandbox.open-metadata.org
OPENMETADATA_TOKEN=your_token_here
```

**Getting credentials:**

- **ElevenLabs API Key**: Sign up at [elevenlabs.io](https://elevenlabs.io), go to Profile → API Keys
- **OpenMetadata Sandbox**: Use `https://sandbox.open-metadata.org` with a demo token, or run locally with Docker

### 2. Test the API Routes

#### Test Connection
```bash
curl -X POST http://localhost:3000/api/connect \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://sandbox.open-metadata.org",
    "token": "your_token"
  }'
```

Expected response:
```json
{
  "ok": true,
  "schemas": ["sample_data.ecommerce_db.shopify", "..."]
}
```

#### Test Dune Analytics Connection
```bash
curl -X POST http://localhost:3000/api/connect \
  -H "Content-Type: application/json" \
  -d '{
    "source": "dune",
    "dune": { "apiKey": "your_dune_api_key", "namespace": "uniswap" }
  }'
```

Expected response:
```json
{
  "ok": true,
  "schemas": ["dune.uniswap"],
  "source": "dune"
}
```

DataBard will fetch query metadata, execute non-parameterized queries (top 10 by recency), and compute column statistics. Results are cached for 30 minutes.

#### Test Dune Episode Generation
```bash
curl -X POST http://localhost:3000/api/synthesize \
  -H "Content-Type: application/json" \
  -d '{
    "source": "dune",
    "dune": { "apiKey": "your_dune_api_key", "namespace": "uniswap" },
    "schemaFqn": "dune.uniswap"
  }' \
  --output dune-episode.mp3
```

The generated episode will include data-aware narration — actual numbers, ranges, and top values from query results.

#### Test Script Generation
```bash
curl -X POST http://localhost:3000/api/generate-script \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://sandbox.open-metadata.org",
    "token": "your_token",
    "schemaFqn": "sample_data.ecommerce_db.shopify"
  }'
```

Expected response:
```json
{
  "ok": true,
  "meta": { "fqn": "...", "tables": [...] },
  "script": [
    { "speaker": "Alex", "topic": "intro", "text": "Welcome to DataBard!..." },
    ...
  ]
}
```

#### Test Full Audio Synthesis
```bash
curl -X POST http://localhost:3000/api/synthesize \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://sandbox.open-metadata.org",
    "token": "your_token",
    "schemaFqn": "sample_data.ecommerce_db.shopify"
  }' \
  --output episode.mp3
```

This will take 30-60 seconds and save the podcast as `episode.mp3`.

#### Test Browser Automation (Experimental)

Browser automation is available as a fallback for free tier users, but requires ElevenLabs web UI authentication.

**Check which providers are available:**
```bash
curl http://localhost:3000/api/providers

# Expected response:
# {
#   "ok": true,
#   "configured": "auto",
#   "providers": {
#     "agent-browser": true,
#     "browser-use": false,
#     "browser-use-cli": false,
#     "tinyfish": false
#   },
#   "available": ["agent-browser"],
#   "recommendation": "agent-browser"
# }
```

**Setup agent-browser (recommended for local testing):**
```bash
npm install -g agent-browser
agent-browser install
```

**Or use cloud providers:**
```bash
# Option 1: Browser Use Cloud
export BROWSER_USE_API_KEY=your_key_here

# Option 2: TinyFish AI
export TINYFISH_API_KEY=sk-tinyfish-your_key_here

# Option 3: browser-use CLI (local Python)
curl -fsSL https://browser-use.com/cli/install.sh | bash
```

**Important Limitations:**
- Browser automation requires ElevenLabs web UI login
- CAPTCHA may block automated access
- Much slower than API (~30s per segment vs ~5s)
- Not recommended for production use

**Recommended**: Upgrade to ElevenLabs Starter plan ($5/month) for reliable API access.

### 3. Test the UI

1. Open http://localhost:3000
2. Enter your OpenMetadata URL and token
3. Click "Connect"
4. Select a schema from the list
5. Click to generate (wait 30-60s)
6. Hit play and verify:
   - Audio plays
   - Waveform animates
   - Segment timeline highlights current speaker
   - Episode metadata displays correctly

## Common Issues

### "elevenlabs: command not found"
- Make sure you ran `npm install`
- Check that `node_modules/elevenlabs` exists

### "OpenMetadata returned 401"
- Your token is invalid or expired
- Try the sandbox URL: `https://sandbox.open-metadata.org`

### "No schemas found"
- Your OpenMetadata instance might be empty
- Try connecting to the sandbox which has sample data

### Audio doesn't play
- Check browser console for errors
- Verify `ELEVENLABS_API_KEY` is set in `.env`
- **Recommended**: Upgrade to ElevenLabs Starter plan ($5/month) for API access
- Check that the API response has `Content-Type: audio/mpeg`
- **Free tier users**: Browser automation requires web UI login (experimental)

### Browser automation fails
- **Important**: ElevenLabs free tier does NOT support API access to any voices
- **agent-browser**: Run `agent-browser install` to set up the browser
- **browser-use-cli**: Run the installer script from docs
- **browser-use**: Verify `BROWSER_USE_API_KEY` is set correctly
- **tinyfish**: Verify `TINYFISH_API_KEY` starts with `sk-tinyfish-`
- Check `/api/providers` endpoint to see which providers are available
- Web automation requires ElevenLabs login and may be blocked by CAPTCHA
- Web automation takes longer (~30s per segment vs ~5s via API)
- **Solution**: Upgrade to Starter plan for reliable API access

### Waveform doesn't animate
- Web Audio API requires user interaction to start
- Click play button (don't use browser's native audio controls)
- Check browser console for AudioContext errors

## Manual Testing Checklist

- [ ] Connect to OpenMetadata (both sandbox and local)
- [ ] Connect to Dune Analytics (API key + namespace)
- [ ] Verify Dune queries are executed and column stats populated
- [ ] List schemas successfully
- [ ] Generate script for a small schema (1-3 tables)
- [ ] Generate script for a large schema (10+ tables)
- [ ] Synthesize audio end-to-end
- [ ] Play audio in browser
- [ ] Waveform visualization works
- [ ] Segment timeline highlights correctly
- [ ] Episode metadata displays (table count, quality summary)
- [ ] Error handling (invalid URL, bad token, network failure)

## Performance Benchmarks

Expected generation times (depends on schema size and ElevenLabs API latency):

- **Small schema** (1-3 tables): 15-30 seconds
- **Medium schema** (5-10 tables): 30-60 seconds
- **Large schema** (20+ tables): 60-120 seconds

Audio file sizes:
- ~1-2 MB per minute of audio (mp3_44100_128 format)
- Typical episode: 2-5 minutes = 2-10 MB

## Next Steps

Once basic testing passes:
1. Test with your own OpenMetadata instance
2. Try different schemas (with/without quality tests, lineage)
3. Verify script quality (does the conversation make sense?)
4. Check audio quality (clear speech, good transitions)
5. Test error cases (empty schema, API failures)
