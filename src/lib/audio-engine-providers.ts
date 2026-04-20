/**
 * Browser automation providers for ElevenLabs web UI
 * Supports multiple backends: agent-browser, browser-use, tinyfish
 */
import { exec } from 'child_process';
import { promisify } from 'util';
import type { ScriptSegment } from "./types";

const execAsync = promisify(exec);

const VOICES = {
  Alex: "Antoni",    // ErXwobaYiN019PkySvjV - premade voice
  Morgan: "Rachel",  // 21m00Tcm4TlvDq8ikWAM - premade voice
} as const;

const ELEVENLABS_WEB_URL = "https://elevenlabs.io/app/speech-synthesis";

export type BrowserProvider = 'agent-browser' | 'browser-use-cli' | 'browser-use' | 'tinyfish' | 'auto';

interface ProviderConfig {
  name: string;
  available: () => Promise<boolean>;
  synthesize: (segment: ScriptSegment) => Promise<Buffer>;
  cleanup: () => Promise<void>;
}

/**
 * Agent Browser Provider (Vercel - local/cloud)
 */
const agentBrowserProvider: ProviderConfig = {
  name: 'agent-browser',
  
  async available() {
    try {
      await execAsync('agent-browser --version');
      return true;
    } catch {
      return false;
    }
  },

  async synthesize(segment: ScriptSegment) {
    const voice = VOICES[segment.speaker];
    const escapedText = segment.text.replace(/"/g, '\\"').replace(/\n/g, ' ');

    // Navigate if needed
    const { stdout: currentUrl } = await execAsync('agent-browser get url').catch(() => ({ stdout: '' }));
    if (!currentUrl.includes('elevenlabs.io')) {
      await execAsync(`agent-browser open ${ELEVENLABS_WEB_URL}`);
      await execAsync('agent-browser wait 3000');
    }

    // Select voice
    await execAsync(`agent-browser click "text=${voice}"`);
    await execAsync('agent-browser wait 1000');

    // Fill and generate
    await execAsync(`agent-browser fill "textarea" "${escapedText}"`);
    await execAsync('agent-browser click "text=Generate"');
    
    const waitTime = Math.max(5000, segment.text.length * 50);
    await execAsync(`agent-browser wait ${waitTime}`);

    // Extract audio
    const { stdout: audioSrc } = await execAsync(
      'agent-browser eval "document.querySelector(\'audio\')?.src"'
    );

    if (!audioSrc || audioSrc === 'null') {
      throw new Error('Audio generation failed');
    }

    const response = await fetch(audioSrc.trim());
    return Buffer.from(await response.arrayBuffer());
  },

  async cleanup() {
    try {
      await execAsync('agent-browser close');
    } catch {
      // Ignore cleanup errors
    }
  }
};

/**
 * Browser Use CLI Provider (Local Python)
 */
const browserUseCliProvider: ProviderConfig = {
  name: 'browser-use-cli',
  
  async available() {
    try {
      await execAsync('~/.browser-use-env/bin/browser-use doctor');
      return true;
    } catch {
      return false;
    }
  },

  async synthesize(segment: ScriptSegment) {
    const voice = VOICES[segment.speaker];
    const escapedText = segment.text.replace(/"/g, '\\"').replace(/\n/g, ' ');

    // Open ElevenLabs
    await execAsync('~/.browser-use-env/bin/browser-use open https://elevenlabs.io/app/speech-synthesis');
    await execAsync('~/.browser-use-env/bin/browser-use wait 5000');

    // Get snapshot to find elements
    const { stdout: snapshot } = await execAsync('~/.browser-use-env/bin/browser-use snapshot -i');
    
    // Parse snapshot to find voice selector and text area
    // This is a simplified version - real implementation would parse the snapshot
    // and find the correct element refs
    
    // For now, throw an error indicating manual setup needed
    throw new Error('browser-use-cli requires manual ElevenLabs login. Please log in via browser first.');
  },

  async cleanup() {
    try {
      await execAsync('~/.browser-use-env/bin/browser-use close');
    } catch {
      // Ignore cleanup errors
    }
  }
};

/**
 * Browser Use Provider (Cloud)
 */
const browserUseProvider: ProviderConfig = {
  name: 'browser-use',
  
  async available() {
    return !!process.env.BROWSER_USE_API_KEY;
  },

  async synthesize(segment: ScriptSegment) {
    const apiKey = process.env.BROWSER_USE_API_KEY;
    if (!apiKey) throw new Error('BROWSER_USE_API_KEY not set');

    const voice = VOICES[segment.speaker];
    
    // Create browser session
    const sessionRes = await fetch('https://api.browser-use.com/v1/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: ELEVENLABS_WEB_URL,
        timeout: 60000,
      }),
    });

    if (!sessionRes.ok) {
      throw new Error(`Browser Use API error: ${sessionRes.statusText}`);
    }

    const { sessionId } = await sessionRes.json();

    try {
      // Execute automation steps
      const steps = [
        { action: 'click', selector: `text=${voice}` },
        { action: 'wait', duration: 1000 },
        { action: 'fill', selector: 'textarea', value: segment.text },
        { action: 'click', selector: 'text=Generate' },
        { action: 'wait', duration: Math.max(5000, segment.text.length * 50) },
        { action: 'evaluate', script: 'document.querySelector("audio")?.src' },
      ];

      let audioSrc = '';
      for (const step of steps) {
        const stepRes = await fetch(`https://api.browser-use.com/v1/sessions/${sessionId}/execute`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(step),
        });

        const result = await stepRes.json();
        if (step.action === 'evaluate') {
          audioSrc = result.value;
        }
      }

      if (!audioSrc) throw new Error('Failed to extract audio URL');

      const audioRes = await fetch(audioSrc);
      return Buffer.from(await audioRes.arrayBuffer());
    } finally {
      // Cleanup session
      await fetch(`https://api.browser-use.com/v1/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${apiKey}` },
      }).catch(() => {});
    }
  },

  async cleanup() {
    // Sessions are cleaned up per-request
  }
};

/**
 * TinyFish Provider (Agent API)
 * Uses natural language goal-based automation
 */
const tinyfishProvider: ProviderConfig = {
  name: 'tinyfish',
  
  async available() {
    return !!process.env.TINYFISH_API_KEY;
  },

  async synthesize(segment: ScriptSegment) {
    const apiKey = process.env.TINYFISH_API_KEY;
    if (!apiKey) throw new Error('TINYFISH_API_KEY not set');

    const voice = VOICES[segment.speaker];
    
    // Use TinyFish Agent API with natural language goal
    // TinyFish decides the browser actions from the goal description
    const goal = `Navigate to ElevenLabs speech synthesis page. Select the voice "${voice}" from the voice dropdown. Enter the following text into the text area: "${segment.text.replace(/"/g, '\\"')}". Click the Generate button and wait for audio generation to complete. Extract the audio element's src attribute.`;

    const response = await fetch('https://agent.tinyfish.ai/v1/automation/run', {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey, // TinyFish uses X-API-Key header, not Bearer
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: ELEVENLABS_WEB_URL,
        goal,
        browser_profile: 'lite', // Faster, cheaper profile
        // Note: output_schema requires premium access, so we extract from natural language result
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`TinyFish API error (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    
    // Check for infrastructure failure
    if (result.status === 'FAILED') {
      throw new Error(`TinyFish automation failed: ${result.error?.message || 'Unknown error'}`);
    }
    
    // Check for goal-level failure
    if (result.result?.status === 'failure') {
      throw new Error(`TinyFish goal failed: ${result.result.reason || 'Could not complete automation'}`);
    }
    
    // Extract audio URL from result (multiple possible formats)
    let audioUrl: string | undefined;
    
    // Try structured result first (if output_schema was used)
    if (result.result?.audioUrl) {
      audioUrl = result.result.audioUrl;
    }
    // Try extracting from text result
    else if (typeof result.result === 'string') {
      const urlMatch = result.result.match(/https?:\/\/[^\s"']+\.mp3/);
      audioUrl = urlMatch?.[0];
    }
    // Try extracting from object result
    else if (result.result && typeof result.result === 'object') {
      // Check common field names
      audioUrl = result.result.src || result.result.url || result.result.audio;
      
      // If still not found, try to find any URL in the result
      if (!audioUrl) {
        const resultStr = JSON.stringify(result.result);
        const urlMatch = resultStr.match(/https?:\/\/[^\s"']+\.mp3/);
        audioUrl = urlMatch?.[0];
      }
    }
    
    if (!audioUrl) {
      console.error('[TinyFish] Result:', JSON.stringify(result, null, 2));
      throw new Error('Failed to extract audio URL from TinyFish result');
    }

    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) {
      throw new Error(`Failed to fetch audio from ${audioUrl}: ${audioRes.statusText}`);
    }
    
    return Buffer.from(await audioRes.arrayBuffer());
  },

  async cleanup() {
    // TinyFish handles cleanup automatically
  }
};

/**
 * Get the configured provider
 */
function getProvider(): BrowserProvider {
  const provider = process.env.BROWSER_PROVIDER as BrowserProvider;
  return provider || 'auto';
}

/**
 * Auto-detect best available provider
 */
async function detectProvider(): Promise<ProviderConfig> {
  const providers = [agentBrowserProvider, browserUseCliProvider, tinyfishProvider, browserUseProvider];
  
  for (const provider of providers) {
    if (await provider.available()) {
      console.log(`[Browser Provider] Using: ${provider.name}`);
      return provider;
    }
  }
  
  throw new Error(
    'No browser automation provider available. Install agent-browser, browser-use CLI, or set BROWSER_USE_API_KEY/TINYFISH_API_KEY'
  );
}

/**
 * Get provider by name or auto-detect
 */
async function getProviderConfig(name: BrowserProvider): Promise<ProviderConfig> {
  if (name === 'auto') {
    return detectProvider();
  }
  
  const providerMap: Record<string, ProviderConfig> = {
    'agent-browser': agentBrowserProvider,
    'browser-use-cli': browserUseCliProvider,
    'browser-use': browserUseProvider,
    'tinyfish': tinyfishProvider,
  };
  
  const provider = providerMap[name];
  if (!provider) {
    throw new Error(`Unknown provider: ${name}`);
  }
  
  if (!(await provider.available())) {
    throw new Error(`Provider ${name} is not available. Check configuration.`);
  }
  
  return provider;
}

/**
 * Synthesize episode using configured browser provider
 */
export async function synthesizeEpisodeViaWeb(script: ScriptSegment[]): Promise<Buffer[]> {
  const providerName = getProvider();
  const provider = await getProviderConfig(providerName);
  
  console.log(`[Web TTS] Using provider: ${provider.name}`);
  
  const buffers: Buffer[] = [];
  
  try {
    for (let i = 0; i < script.length; i++) {
      console.log(`[Web TTS] Generating segment ${i + 1}/${script.length}: ${script[i].speaker}`);
      const buffer = await provider.synthesize(script[i]);
      buffers.push(buffer);
    }
  } finally {
    await provider.cleanup();
  }
  
  return buffers;
}

/**
 * Check which providers are available
 */
export async function checkProviders(): Promise<Record<string, boolean>> {
  return {
    'agent-browser': await agentBrowserProvider.available(),
    'browser-use-cli': await browserUseCliProvider.available(),
    'browser-use': await browserUseProvider.available(),
    'tinyfish': await tinyfishProvider.available(),
  };
}
