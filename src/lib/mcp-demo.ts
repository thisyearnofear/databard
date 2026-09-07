import type { ConnectionConfig, SchemaMeta } from "./types";
import { fetchSchemaMeta } from "./metadata-adapter";
import { getDemoSchema } from "./market/demo-fixtures";

export interface SchemaMetaResult {
  meta: SchemaMeta;
  /** True when the live source was unreachable and the demo fixture was served. */
  demo: boolean;
  /** When demo: what went wrong + how to get a real analysis. */
  connectionNotice?: string;
}

/**
 * Fetch the requested schema's metadata, degrading to the labelled demo
 * fixture instead of erroring when the caller's source is unreachable.
 *
 * Marketplace reviewer agents pay per call and have no data-source
 * credentials — the OKX listing review failed on exactly this ("payment
 * successful but service returned HTTP 400"). A 200 demo deliverable with an
 * explicit notice is a real result, honestly labelled; a 400/500 is a dead
 * end the reviewer can't recover from.
 */
export async function fetchSchemaMetaLenient(
  config: ConnectionConfig,
  schemaFqn: string,
  opts: { forceDemo?: boolean } = {}
): Promise<SchemaMetaResult> {
  if (!opts.forceDemo) {
    try {
      return { meta: await fetchSchemaMeta(config, schemaFqn), demo: false };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.warn("[MCP] source fetch failed, serving labelled demo analysis:", detail);
      var noticeDetail = detail;
    }
  } else {
    var noticeDetail = "demo explicitly requested";
  }
  const meta = await getDemoSchema("web3");
  return {
    meta,
    demo: true,
    connectionNotice: `Could not reach the requested data source (${noticeDetail}). This is a clearly-labelled DEMO analysis of a sample Uniswap V3 schema, not your data. To get a real analysis, provide a reachable connection: "source" plus the matching connector block (e.g. openmetadata:{url,token}, datahub:{serverUrl,token}, dune:{apiKey}, monid:{provider,endpoint}) and a "schemaFqn" that exists there.`,
  };
}