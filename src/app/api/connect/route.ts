import { NextRequest, NextResponse } from "next/server";
import { listSchemas } from "@/lib/metadata-adapter";
import type { ConnectionConfig } from "@/lib/types";
import { validateUrl, validateToken, validateDbtConfig, validateManifestPath, ValidationError, guardMutation } from "@/lib/validation";
import { createSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { source = "openmetadata" } = body;
  const omMode = body.omMode === "sandbox" ? "sandbox" : "custom";

  let resolvedOmUrl: string | undefined;
  let resolvedOmToken: string | undefined;

  try {
    guardMutation(req, { maxRequests: 20, windowMs: 3600000 });
    // Validate input based on source
    if (source === "openmetadata") {
      if (omMode === "sandbox") {
        resolvedOmUrl = process.env.OM_SANDBOX_URL || process.env.NEXT_PUBLIC_OM_SANDBOX_URL;
        const sandboxTokenFromEnv = process.env.OM_SANDBOX_TOKEN;
        const sandboxTokenFromBody = typeof body.token === "string" ? body.token : "";
        resolvedOmToken = sandboxTokenFromEnv || sandboxTokenFromBody;

        if (!resolvedOmUrl || !resolvedOmToken) {
          throw new ValidationError(
            "Sandbox token required. Ask admin to set OM_SANDBOX_TOKEN or paste your OpenMetadata token in Sandbox mode."
          );
        }

        validateUrl(resolvedOmUrl);
        validateToken(resolvedOmToken);
      } else {
        const customUrl = typeof body.url === "string" ? body.url : "";
        const customToken = typeof body.token === "string" ? body.token : "";
        validateUrl(customUrl);
        validateToken(customToken);
        resolvedOmUrl = customUrl;
        resolvedOmToken = customToken;
      }
    } else if (source === "dbt-cloud") {
      validateDbtConfig(body.dbtCloud);
    } else if (source === "dbt-local") {
      if (body.dbtLocal?.manifestContent) {
        try { JSON.parse(body.dbtLocal.manifestContent); } catch {
          throw new ValidationError("Invalid JSON in uploaded manifest file");
        }
      } else {
        validateManifestPath(body.dbtLocal?.manifestPath);
      }
    } else if (source === "the-graph") {
      if (!body.theGraph?.subgraphUrl) throw new ValidationError("Subgraph URL required");
    } else if (source === "dune") {
      if (!body.dune?.apiKey) throw new ValidationError("Dune API key required");
    } else {
      throw new ValidationError(`Unsupported data source: ${source}`);
    }

    // Build connection config
    const config: ConnectionConfig = {
      source: source as ConnectionConfig["source"],
      openmetadata: resolvedOmUrl && resolvedOmToken ? { url: resolvedOmUrl, token: resolvedOmToken } : undefined,
      dbtCloud: body.dbtCloud,
      dbtLocal: body.dbtLocal,
      theGraph: body.theGraph,
      dune: body.dune,
    };

    const schemas = await listSchemas(config);
    
    if (schemas.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No schemas found. Check your connection settings." },
        { status: 404 }
      );
    }

    // Create server-side session — credentials stored server-side only
    await createSession(config, schemas);
    
    return NextResponse.json({ ok: true, schemas, source, omMode });
  } catch (e: unknown) {
    if (e instanceof ValidationError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    }
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
