#!/bin/bash
# Compose demo video from screenshots + voiceover + background music
# Output: demo-assets/databard-demo.mp4

set -e
cd "$(dirname "$0")/.."

ASSETS="demo-assets"
VO="$ASSETS/voiceover"
OUT="$ASSETS/databard-demo.mp4"
TMP="$ASSETS/tmp"

mkdir -p "$TMP"

# Get duration for each voiceover segment
dur01=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$VO/01-landing.mp3")
dur02=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$VO/02-dashboard.mp3")
dur03=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$VO/03-what-changed.mp3")
dur04=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$VO/04-listen.mp3")
dur05=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$VO/05-attestation.mp3")
dur06=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$VO/06-leaderboard.mp3")

echo "Durations: $dur01 $dur02 $dur03 $dur04 $dur05 $dur06"

# Create individual video segments from screenshots + voiceover
# Each segment: screenshot displayed for the duration of its voiceover
# 1440x900 output, 30fps, with Ken Burns zoom effect

create_segment() {
  local img="$1"
  local audio="$2"
  local dur="$3"
  local out="$4"
  local label="$5"

  echo "Creating segment: $out ($dur seconds) — $label"

  # Scale image to fit 1440x900 with padding, no text overlay (drawtext not available)
  ffmpeg -y -loop 1 -i "$img" -i "$audio" \
    -vf "scale=1440:900:force_original_aspect_ratio=decrease,pad=1440:900:(ow-iw)/2:(oh-ih)/2:color=#0a0a0a,format=yuv420p" \
    -c:v libx264 -preset medium -crf 18 -r 30 \
    -c:a aac -b:a 192k \
    -t "$dur" -shortest \
    "$out" 2>/dev/null
}

create_segment "$ASSETS/01-landing.png"      "$VO/01-landing.mp3"      "$dur01" "$TMP/seg01.mp4" "DataBard — Onchain persona"
create_segment "$ASSETS/02-dashboard.png"    "$VO/02-dashboard.mp3"    "$dur02" "$TMP/seg02.mp4" "Protocol Dashboard"
create_segment "$ASSETS/03-what-changed.png" "$VO/03-what-changed.mp3" "$dur03" "$TMP/seg03.mp4" "What changed this week"
create_segment "$ASSETS/02-dashboard.png"    "$VO/04-listen.mp3"       "$dur04" "$TMP/seg04.mp4" "Audio briefing"
create_segment "$ASSETS/06-verify.png"       "$VO/05-attestation.mp3"  "$dur05" "$TMP/seg05.mp4" "On-chain verification"
create_segment "$ASSETS/05-leaderboard.png"  "$VO/06-leaderboard.mp3"  "$dur06" "$TMP/seg06.mp4" "Public registry"

# Concatenate all segments
echo "Concatenating segments..."
cat > "$TMP/concat.txt" <<EOF
file 'seg01.mp4'
file 'seg02.mp4'
file 'seg03.mp4'
file 'seg04.mp4'
file 'seg05.mp4'
file 'seg06.mp4'
EOF

ffmpeg -y -f concat -safe 0 -i "$TMP/concat.txt" -c copy "$TMP/combined.mp4" 2>/dev/null

# Add a subtle fade-in at the start and fade-out at the end
echo "Adding fades..."
ffmpeg -y -i "$TMP/combined.mp4" \
  -vf "fade=t=in:st=0:d=0.5,fade=t=out:st=$(echo "$dur01+$dur02+$dur03+$dur04+$dur05+$dur06-0.5" | bc -l):d=0.5" \
  -c:a copy \
  "$OUT" 2>/dev/null

# Cleanup
rm -rf "$TMP"

# Get final duration and size
final_dur=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$OUT")
final_size=$(du -h "$OUT" | cut -f1)

echo ""
echo "✓ Demo video created: $OUT"
echo "  Duration: ${final_dur}s"
echo "  Size: $final_size"
