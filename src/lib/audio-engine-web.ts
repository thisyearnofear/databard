/**
 * Audio engine using ElevenLabs web UI via browser automation
 * Works with free tier! Supports multiple providers.
 * 
 * Re-exports from audio-engine-providers for backward compatibility
 */
export { synthesizeEpisodeViaWeb, checkProviders } from './audio-engine-providers';
export type { BrowserProvider } from './audio-engine-providers';
