/**
 * UTM tagging for outbound share links. First-touch attribution in track.ts
 * reads utm_source/medium/campaign and stamps src/med/cmp on every event the
 * recipient fires — that is what chains the virality ladder (share → land →
 * activate → pay) in docs/GTM.md. Canonical permalinks and OG URLs stay clean;
 * tag only the copied/shared strings at share time.
 */
const FALLBACK_ORIGIN = "https://databard.persidian.com";

export function tagShareUrl(url: string, medium: string, campaign?: string): string {
  const parsed = new URL(url, process.env.NEXT_PUBLIC_URL || FALLBACK_ORIGIN);
  parsed.searchParams.set("utm_source", "share");
  parsed.searchParams.set("utm_medium", medium);
  if (campaign) parsed.searchParams.set("utm_campaign", campaign);
  return parsed.toString();
}

/** Swap the canonical link inside share copy for its tagged variant. */
export function tagShareText(text: string, link: string, medium: string, campaign?: string): string {
  if (!link || !text.includes(link)) return text;
  return text.split(link).join(tagShareUrl(link, medium, campaign));
}
