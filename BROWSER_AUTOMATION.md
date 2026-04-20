# Browser Automation for DataBard

This document explains the browser automation system for ElevenLabs TTS fallback.

## Overview

DataBard includes browser automation as a fallback when the ElevenLabs API is unavailable. This is primarily designed for free tier users, but **has significant limitations**.

## Important: ElevenLabs Free Tier Limitation

**Free tier ElevenLabs accounts CANNOT use ANY voices via API**, including premade voices. The API returns 402 "payment_required" for all voice requests.

### Recommended Solution

**Upgrade to ElevenLabs Starter plan ($5/month)** for full API access. This is the most reliable solution for production use.

## Browser Automation Providers

DataBard supports four browser automation providers:

### 1. agent-browser (Vercel Labs)

**Type**: Local Rust CLI  
**Speed**: Fast  
**Cost**: Free  
**Best for**: Local development

**Installation**:
```bash
npm install -g agent-browser
agent-browser install
```

**Pros**:
- Fast native Rust binary
- No API keys needed
- Works offline
- Already in package.json

**Cons**:
- Requires local Chrome installation
- Needs ElevenLabs web UI login
- May be blocked by CAPTCHA

### 2. browser-use CLI

**Type**: Local Python CLI  
**Speed**: Fast  
**Cost**: Free  
**Best for**: Reusing existing Chrome logins

**Installation**:
```bash
curl -fsSL https://browser-use.com/cli/install.sh | bash
```

**Pros**:
- Can connect to real Chrome with existing logins
- No API keys needed
- Good for manual testing

**Cons**:
- Requires Python 3.11+
- Needs ElevenLabs web UI login
- More complex setup

### 3. Browser Use Cloud

**Type**: Cloud API  
**Speed**: Fast  
**Cost**: Pay-per-use  
**Best for**: Serverless/production

**Setup**:
```bash
export BROWSER_USE_API_KEY=your_key_here
export BROWSER_PROVIDER=browser-use
```

**Pros**:
- No local browser needed
- Works in serverless environments
- Reliable infrastructure

**Cons**:
- Requires API key (paid)
- Still needs ElevenLabs authentication
- Network latency

### 4. TinyFish

**Type**: Cloud AI Agent  
**Speed**: Medium  
**Cost**: Pay-per-use  
**Best for**: Natural language automation

**Setup**:
```bash
export TINYFISH_API_KEY=sk-tinyfish-your_key_here
export BROWSER_PROVIDER=tinyfish
```

**Pros**:
- Natural language goals
- AI-powered decision making
- No local browser needed

**Cons**:
- Requires API key (paid)
- Blocked by CAPTCHA on ElevenLabs
- Slower than other options

## Configuration

### Environment Variables

```bash
# Provider selection (default: auto)
BROWSER_PROVIDER=auto  # auto, agent-browser, browser-use-cli, browser-use, tinyfish

# Cloud provider API keys (only if using cloud providers)
BROWSER_USE_API_KEY=your_key_here
TINYFISH_API_KEY=sk-tinyfish-your_key_here
```

### Auto-Detection

When `BROWSER_PROVIDER=auto` (default), DataBard tries providers in this order:

1. agent-browser (local, fast, free)
2. browser-use CLI (local, can reuse logins)
3. TinyFish (cloud, AI-powered)
4. Browser Use Cloud (cloud, reliable)

## How It Works

1. **API First**: DataBard always tries the ElevenLabs REST API first
2. **402 Detection**: If API returns "payment_required", falls back to browser automation
3. **Provider Selection**: Uses configured provider or auto-detects first available
4. **Web UI Automation**: 
   - Opens ElevenLabs speech synthesis page
   - Selects voice from dropdown
   - Fills text area
   - Clicks Generate button
   - Waits for audio generation
   - Extracts audio URL
   - Downloads MP3
5. **Return to Client**: Streams audio back to client

## Limitations

### Authentication Required

ElevenLabs web UI requires login. Browser automation will fail if:
- User is not logged in
- CAPTCHA is triggered
- Session expires

### Performance

- **API**: ~5 seconds per segment
- **Browser automation**: ~30 seconds per segment

Browser automation is **6x slower** than the API.

### Reliability

Browser automation can fail due to:
- CAPTCHA challenges
- Web UI changes
- Network issues
- Session timeouts
- Rate limiting

### Not Recommended for Production

Browser automation is **experimental** and should only be used for:
- Testing without payment
- Development/debugging
- Fallback when API is temporarily unavailable

## Testing

### Check Provider Status

```bash
curl http://localhost:3000/api/providers
```

Response:
```json
{
  "ok": true,
  "configured": "auto",
  "providers": {
    "agent-browser": true,
    "browser-use-cli": false,
    "browser-use": false,
    "tinyfish": false
  },
  "available": ["agent-browser"],
  "recommendation": "agent-browser"
}
```

### Test Synthesis

```bash
curl -X POST http://localhost:3000/api/synthesize \
  -H "Content-Type: application/json" \
  -d '{
    "script": [
      { "speaker": "Alex", "topic": "test", "text": "Hello world" }
    ]
  }' \
  --output test.mp3
```

## Troubleshooting

### "No browser automation provider available"

**Solution**: Install a provider:
```bash
# Option 1: agent-browser
npm install -g agent-browser
agent-browser install

# Option 2: browser-use CLI
curl -fsSL https://browser-use.com/cli/install.sh | bash

# Option 3: Cloud providers
export BROWSER_USE_API_KEY=your_key_here
# or
export TINYFISH_API_KEY=sk-tinyfish-your_key_here
```

### "Blocked by CAPTCHA"

**Solution**: 
1. Upgrade to ElevenLabs Starter plan ($5/month)
2. Or manually log in to ElevenLabs in the browser first

### "Failed to extract audio URL"

**Causes**:
- ElevenLabs web UI changed
- Audio generation failed
- Network timeout

**Solution**: Check browser automation logs and retry

### Slow Generation

**Expected**: Browser automation is 6x slower than API

**Solution**: Upgrade to ElevenLabs Starter plan for API access

## Recommended Setup

### For Development

```bash
# 1. Get ElevenLabs Starter plan ($5/month)
# 2. Add API key to .env
ELEVENLABS_API_KEY=sk_your_key_here

# 3. Browser automation as fallback (optional)
npm install -g agent-browser
agent-browser install
BROWSER_PROVIDER=auto
```

### For Production

```bash
# 1. Use ElevenLabs API (required)
ELEVENLABS_API_KEY=sk_your_key_here

# 2. Optional: Cloud browser automation for fallback
BROWSER_PROVIDER=browser-use
BROWSER_USE_API_KEY=your_key_here
```

### For Testing Without Payment

```bash
# 1. Install local browser automation
npm install -g agent-browser
agent-browser install

# 2. Configure provider
BROWSER_PROVIDER=agent-browser

# 3. Note: You'll need to manually log in to ElevenLabs
# when prompted, and CAPTCHA may block automation
```

## Persistent User Session Flow (Signup/Login)

To leverage the more generous free-character limits of the ElevenLabs web UI compared to the restricted free API tier, DataBard uses a "Persistent Session" pattern.

### The Strategy

1.  **Direct Connection**: The browser automation connects to your *actual* Chrome browser session (`browser-use connect`).
2.  **One-Time Login**: You manually log in to ElevenLabs in your browser. The automation then inherits this authenticated state.
3.  **Headless/Automated Drive**: The script `scripts/generate-demo-automated.js` then drives the web UI to select voices, input text, and trigger downloads.

### Automated Demo Generation

We have a dedicated script for generating high-quality home page demos using the latest 2025 voices (**Neil** and **Juniper**):

```bash
# Ensure browser-use is installed
curl -fsSL https://browser-use.com/cli/install.sh | bash

# Run the automated generator
./scripts/generate-demo-automated.js
```

### Why This Flow?

*   **Bypasses 402 Errors**: The ElevenLabs API often blocks free-tier accounts from using premade voices. The Web UI does not.
*   **Access to New Voices**: Newer voices like "Neil" and "Juniper" are often available on the web before or instead of the free API tier.
*   **Visual Verification**: You can see exactly what the AI is doing in your browser window, making it easier to handle unexpected UI changes or CAPTCHAs.

## How It Works (Technical)

```
[ DataBard Script ] -> [ browser-use CLI ] -> [ Real Chrome Session ] -> [ ElevenLabs Web UI ]
```

1.  `browser-use connect` finds the Chrome debugging port.
2.  `browser-use open` navigates to the Speech Synthesis page.
3.  The script loops through `public/sample-episode.json`.
4.  For each segment, it clicks the voice, types the text, and clicks "Generate".
5.  It then clicks "Download" which saves the file to your system's `~/Downloads` folder.


## Future Improvements

- [ ] Persistent browser sessions to avoid re-login
- [ ] Cookie/session management for authentication
- [ ] Better CAPTCHA handling
- [ ] Parallel segment generation
- [ ] Retry logic with exponential backoff
- [ ] Provider health monitoring
- [ ] Automatic provider failover

## Conclusion

Browser automation is a **fallback solution** with significant limitations. For reliable production use, **upgrade to ElevenLabs Starter plan ($5/month)** for full API access.

Browser automation is best used for:
- Testing without payment
- Development/debugging
- Understanding the system architecture

Not recommended for:
- Production deployments
- High-volume usage
- Time-sensitive applications
- Automated workflows
