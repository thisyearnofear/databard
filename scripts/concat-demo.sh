#!/bin/bash
# Concatenate all segment MP3s into final demo episode

set -e

SEGMENTS_DIR="public/segments"
OUTPUT="public/demo-episode.mp3"

if [ ! -d "$SEGMENTS_DIR" ]; then
  echo "❌ Error: $SEGMENTS_DIR not found"
  echo "Run: node scripts/prepare-for-web-tts.js first"
  exit 1
fi

# Count MP3 files
MP3_COUNT=$(find "$SEGMENTS_DIR" -name "*.mp3" | wc -l | tr -d ' ')

if [ "$MP3_COUNT" -eq 0 ]; then
  echo "❌ Error: No MP3 files found in $SEGMENTS_DIR"
  echo "Generate them via ElevenLabs web UI first"
  exit 1
fi

echo "Found $MP3_COUNT MP3 files"

# Create concat list
FILELIST="$SEGMENTS_DIR/filelist.txt"
rm -f "$FILELIST"

for file in "$SEGMENTS_DIR"/*.mp3; do
  echo "file '$(basename "$file")'" >> "$FILELIST"
done

echo "Concatenating..."
cd "$SEGMENTS_DIR"
ffmpeg -f concat -safe 0 -i filelist.txt -c copy "../../$OUTPUT" -y
cd ../..

# Cleanup
rm -f "$FILELIST"

SIZE=$(ls -lh "$OUTPUT" | awk '{print $5}')
echo "✅ Created $OUTPUT ($SIZE)"
echo "Ready to commit and push!"
