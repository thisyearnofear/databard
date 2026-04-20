#!/usr/bin/env node
/**
 * Prepare script segments for manual TTS generation via ElevenLabs web UI
 * Outputs numbered text files that you can copy-paste into the web interface
 */

const fs = require('fs');
const path = require('path');

const samplePath = path.join(__dirname, '../public/sample-episode.json');
const outputDir = path.join(__dirname, '../public/segments');

// Read sample episode
const episode = JSON.parse(fs.readFileSync(samplePath, 'utf-8'));

// Create output directory
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Write each segment to a numbered file
episode.script.forEach((segment, index) => {
  const num = String(index + 1).padStart(2, '0');
  const filename = `${num}-${segment.speaker.toLowerCase()}-${segment.topic}.txt`;
  const filepath = path.join(outputDir, filename);
  
  fs.writeFileSync(filepath, segment.text, 'utf-8');
  console.log(`✓ ${filename}`);
});

console.log(`\n✅ Created ${episode.script.length} text files in public/segments/`);
console.log('\nNext steps:');
console.log('1. Go to https://elevenlabs.io/app/speech-synthesis');
console.log('2. Select voice:');
console.log('   - Alex segments → Use "George" or "Antoni"');
console.log('   - Morgan segments → Use "Charlotte"');
console.log('3. Copy text from each file, generate, and download as:');
console.log('   - 01-alex-intro.mp3, 02-morgan-intro.mp3, etc.');
console.log('4. Save all MP3s to public/segments/');
console.log('5. Run: npm run concat-demo');
