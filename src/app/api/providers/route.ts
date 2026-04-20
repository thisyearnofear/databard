import { NextResponse } from "next/server";
import { checkProviders } from "@/lib/audio-engine-web";

/**
 * Check which browser automation providers are available
 */
export async function GET() {
  try {
    const providers = await checkProviders();
    
    const configured = process.env.BROWSER_PROVIDER || 'auto';
    const available = Object.entries(providers)
      .filter(([_, isAvailable]) => isAvailable)
      .map(([name]) => name);
    
    return NextResponse.json({
      ok: true,
      configured,
      providers,
      available,
      recommendation: available[0] || 'none',
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
