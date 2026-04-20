# Generate Demo Audio via ElevenLabs Web UI

Since the free tier API doesn't allow voice access, generate the demo audio manually:

## Steps

1. Go to https://elevenlabs.io/app/speech-synthesis
2. Select voice: **George** (or any free voice)
3. Paste each segment from `public/sample-episode.json` one by one
4. Download each MP3
5. Concatenate them:

```bash
# Install ffmpeg if needed
brew install ffmpeg  # macOS
# or: sudo apt install ffmpeg  # Linux

# Concatenate all segments
ffmpeg -i "concat:segment1.mp3|segment2.mp3|segment3.mp3|..." -acodec copy public/demo-episode.mp3
```

## Automated Script (if you have the segments)

```bash
#!/bin/bash
# Save this as scripts/concat-audio.sh

cd public/segments
echo "file 'segment1.mp3'" > filelist.txt
echo "file 'segment2.mp3'" >> filelist.txt
# ... add all segments

ffmpeg -f concat -safe 0 -i filelist.txt -c copy ../demo-episode.mp3
cd ../..
```

## Or Use This Helper

```bash
# Generate text files for each segment
node scripts/split-segments.js

# Then paste each into ElevenLabs web UI and download
# Finally concatenate with the script above
```
