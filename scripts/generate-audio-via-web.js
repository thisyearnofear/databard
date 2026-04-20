#!/usr/bin/env node
/**
 * Generate audio using ElevenLabs web UI via browser automation
 * Works with free tier API keys!
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ELEVENLABS_WEB_URL = 'https://elevenlabs.io/app/speech-synthesis';
const OUTPUT_DIR = path.join(__dirname, '../public/segments');
const SAMPLE_PATH = path.join(__dirname, '../public/sample-episode.json');

// Voice mappings
const VOICES = {
  Alex: 'George',
  Morgan: 'Charlotte'
};

function exec(cmd) {
  console.log(`> ${cmd}`);
  return execSync(cmd, { encoding: 'utf-8', stdio: 'inherit' });
}

async function main() {
  // Read sample episode
  const episode = JSON.parse(fs.readFileSync(SAMPLE_PATH, 'utf-8'));
  
  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log('🚀 Starting browser automation...');
  console.log('📝 This will use the ElevenLabs web UI to generate audio');
  console.log('⏱️  Estimated time: ~5-10 minutes for 13 segments\n');

  // Install agent-browser if needed
  try {
    execSync('agent-browser --version', { stdio: 'ignore' });
  } catch {
    console.log('Installing agent-browser...');
    exec('npm install -g agent-browser');
    exec('agent-browser install');
  }

  // Open ElevenLabs and login
  console.log('\n🌐 Opening ElevenLabs...');
  exec(`agent-browser open ${ELEVENLABS_WEB_URL}`);
  
  console.log('\n⚠️  Please log in to ElevenLabs in the browser window');
  console.log('Press Enter when you are logged in and on the Speech Synthesis page...');
  
  // Wait for user to login
  require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  }).question('', () => {
    
    // Generate each segment
    for (let i = 0; i < episode.script.length; i++) {
      const segment = episode.script[i];
      const num = String(i + 1).padStart(2, '0');
      const voice = VOICES[segment.speaker];
      const filename = `${num}-${segment.speaker.toLowerCase()}-${segment.topic}.mp3`;
      const filepath = path.join(OUTPUT_DIR, filename);

      console.log(`\n[${i + 1}/${episode.script.length}] Generating: ${filename}`);
      console.log(`Voice: ${voice}`);
      console.log(`Text: ${segment.text.slice(0, 60)}...`);

      try {
        // Select voice
        exec(`agent-browser click "text=${voice}"`);
        exec('agent-browser wait 1000');

        // Clear and fill text area
        exec('agent-browser click "textarea"');
        exec('agent-browser keyboard type "${segment.text.replace(/"/g, '\\"')}"');
        
        // Click generate
        exec('agent-browser click "text=Generate"');
        
        // Wait for generation
        exec('agent-browser wait 5000');
        
        // Download
        exec('agent-browser click "[aria-label=Download]"');
        exec('agent-browser wait 2000');

        console.log(`✓ ${filename}`);
      } catch (error) {
        console.error(`✗ Failed to generate ${filename}:`, error.message);
        process.exit(1);
      }
    }

    console.log('\n✅ All segments generated!');
    console.log('\nNext steps:');
    console.log('1. Move downloaded MP3s from ~/Downloads to public/segments/');
    console.log('2. Rename them to match the pattern: 01-alex-intro.mp3, etc.');
    console.log('3. Run: npm run concat-demo');
    
    exec('agent-browser close');
  });
}

main().catch(console.error);
