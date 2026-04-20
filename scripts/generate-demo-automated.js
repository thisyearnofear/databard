#!/usr/bin/env node
/**
 * Advanced Browser Automation for ElevenLabs Demo Generation
 * Uses browser-use CLI to leverage existing Chrome logins.
 * 
 * Flow:
 * 1. Connect to active Chrome session
 * 2. Navigate to ElevenLabs
 * 3. Verify login (or wait for user)
 * 4. Select voices (Neil/Juniper)
 * 5. Loop through public/sample-episode.json segments
 * 6. Generate, wait, and download
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const SAMPLE_PATH = path.join(__dirname, '../public/sample-episode.json');
const OUTPUT_DIR = path.join(__dirname, '../public/segments');
const BROWSER_USE_BIN = path.join(process.env.HOME, '.browser-use-env/bin/browser-use');

// New 2024/2025 Voice Mappings
const VOICES = {
  Alex: 'Neil',
  Morgan: 'Juniper'
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf-8' }).trim();
  } catch (e) {
    return null;
  }
}

async function main() {
  console.log('🎙️  DataBard Demo Audio Generator (Automated Flow)');
  console.log('================================================\n');

  if (!fs.existsSync(BROWSER_USE_BIN)) {
    console.error('❌ Error: browser-use not found at ' + BROWSER_USE_BIN);
    console.log('Please install it: curl -fsSL https://browser-use.com/cli/install.sh | bash');
    process.exit(1);
  }

  const episode = JSON.parse(fs.readFileSync(SAMPLE_PATH, 'utf-8'));
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log('Step 1: Connecting to Chrome...');
  console.log('Make sure Chrome is open and you are logged into ElevenLabs.');
  
  // Try to connect to existing Chrome
  execSync(`${BROWSER_USE_BIN} connect`, { stdio: 'inherit' });
  
  console.log('\nStep 2: Navigating to ElevenLabs Speech Synthesis...');
  execSync(`${BROWSER_USE_BIN} open "https://elevenlabs.io/app/speech-synthesis"`, { stdio: 'inherit' });

  console.log('\nStep 3: Verification');
  console.log('Please check the browser window.');
  console.log('1. Ensure you are logged in.');
  console.log('2. Ensure you are on the "Speech Synthesis" tab.');
  console.log('3. Select the "Eleven Multilingual v2" model manually if needed.');
  
  await new Promise(resolve => rl.question('\nPress ENTER when ready to start automation...', resolve));

  for (let i = 0; i < episode.script.length; i++) {
    const segment = episode.script[i];
    const voice = VOICES[segment.speaker];
    const index = String(i + 1).padStart(2, '0');
    const filename = `${index}-${segment.speaker.toLowerCase()}-${segment.topic}.mp3`;
    
    console.log(`\n[${i+1}/${episode.script.length}] Generating ${filename} with ${voice}...`);

    // 1. Select Voice
    console.log(`   - Selecting voice: ${voice}`);
    run(`${BROWSER_USE_BIN} click "text=${voice}"`);
    run(`${BROWSER_USE_BIN} wait 1000`);

    // 2. Clear and Input Text
    console.log(`   - Entering text...`);
    // Escape single quotes for shell, then double quotes for browser-use selector
    const escapedText = segment.text.replace(/'/g, "'\\''").replace(/"/g, '\\"');
    run(`${BROWSER_USE_BIN} click "textarea"`);
    run(`${BROWSER_USE_BIN} keyboard type "${escapedText}"`);
    
    // 3. Click Generate
    console.log(`   - Clicking Generate...`);
    run(`${BROWSER_USE_BIN} click "text=Generate"`);
    
    // 4. Wait for audio (simple heuristic: 2s + 1s per 50 chars)
    const waitMs = 2000 + Math.floor(segment.text.length / 50) * 1000;
    console.log(`   - Waiting ${waitMs}ms for generation...`);
    run(`${BROWSER_USE_BIN} wait ${waitMs}`);
    
    // 5. Download
    console.log(`   - Clicking Download...`);
    run(`${BROWSER_USE_BIN} click "[aria-label=Download]"`);
    run(`${BROWSER_USE_BIN} wait 1500`);
    
    // 6. Clear for next round
    run(`${BROWSER_USE_BIN} keyboard press Control+A`);
    run(`${BROWSER_USE_BIN} keyboard press Backspace`);
    
    console.log(`   ✓ ${filename} triggered for download.`);
  }

  console.log('\n✅ All segments triggered for download.');
  console.log('\nFinal Steps:');
  console.log(`1. Move the MP3s from your Downloads folder to: ${OUTPUT_DIR}`);
  console.log(`2. Rename them to match the segment names shown above.`);
  console.log(`3. Run: ./scripts/concat-demo.sh`);
  
  rl.close();
}

main().catch(err => {
  console.error('\n❌ Automation failed:', err.message);
  process.exit(1);
});
