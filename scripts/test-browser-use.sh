#!/bin/bash
# Test browser-use CLI for ElevenLabs automation

BROWSER_USE=~/.browser-use-env/bin/browser-use

# Connect to real Chrome (preserves logins)
echo "Connecting to Chrome..."
$BROWSER_USE connect

# Navigate to ElevenLabs
echo "Opening ElevenLabs..."
$BROWSER_USE open "https://elevenlabs.io/app/speech-synthesis"

# Wait for page to load
sleep 5

# Get page state
echo "Getting page state..."
$BROWSER_USE state

# Take screenshot
echo "Taking screenshot..."
$BROWSER_USE screenshot /tmp/elevenlabs-page.png

echo "Screenshot saved to /tmp/elevenlabs-page.png"
echo "Browser session is still open. You can run more commands or close with:"
echo "  $BROWSER_USE close"
