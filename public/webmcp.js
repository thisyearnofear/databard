/**
 * DataBard WebMCP surface — browser-native tools for in-browser AI agents.
 *
 * Loaded ONLY when the browser exposes `document.modelContext` or
 * `navigator.modelContext` (Chromium 146+ behind #enable-webmcp-testing).
 * See src/components/WebMcpLoader.tsx for the guard. No secrets here —
 * every tool calls the same server APIs the UI uses.
 *
 * Mirrors the server A2MCP surface (GET /api/mcp/tools) with tab-bound tools:
 * same names, same intent, JS-heap transport instead of HTTP+JSON-RPC.
 */
(function () {
  var mc =
    (typeof document !== "undefined" && document.modelContext) ||
    (typeof navigator !== "undefined" && navigator.modelContext);
  if (!mc || typeof mc.registerTool !== "function") return;

  function textResult(text) {
    return { content: [{ type: "text", text: text }] };
  }

  // Read-only: run the labelled demo health-check, no credentials needed.
  mc.registerTool(
    {
      name: "databard_runDemoHealthCheck",
      description:
        "Run DataBard's free labelled demo health analysis. Use when the user wants to see what a DataBard briefing looks like before connecting a source. No credentials needed.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true },
      execute: async function () {
        var res = await fetch("/api/mcp/health-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ demo: true }),
        });
        var data = await res.json();
        if (!res.ok || !data.ok) return textResult("Demo analysis failed. Suggest connecting a source at /?start=connect instead.");
        var score = data.health && data.health.score;
        var summary = data.summary || (data.keyFindings && data.keyFindings[0]) || "Demo analysis ready.";
        return textResult(
          typeof score === "number"
            ? "Demo health " + score + "/100 — " + summary + " Next step: " + (data.nextStep || "connect a source.")
            : summary
        );
      },
    }
  );

  // Read-only: point the agent at the tool catalog.
  mc.registerTool(
    {
      name: "databard_getTools",
      description:
        "List DataBard's agent-callable tools (health-check, briefing, writeback, probe) with input schemas. Use to discover how to call DataBard from an agent.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true },
      execute: async function () {
        var res = await fetch("/api/mcp/tools");
        var data = await res.json();
        var names = (data.tools || []).map(function (t) { return t.name; }).join(", ");
        return textResult(
          names
            ? "DataBard tools: " + names + ". Full schemas at /api/mcp/tools."
            : "Tool catalog unavailable. Try /api/mcp/tools directly."
        );
      },
    }
  );

  // Navigational: start the connect flow in the current tab.
  mc.registerTool(
    {
      name: "databard_startConnect",
      description:
        "Navigate the current tab to DataBard's connect flow so the user can link their own data source (DataHub, OpenMetadata, dbt, The Graph, Dune, Coral, Monid). Use when the user wants analysis on their own data.",
      inputSchema: {
        type: "object",
        properties: {
          source: {
            type: "string",
            description: "Data source to preselect, e.g. datahub, dune, monid. Optional.",
          },
        },
      },
      execute: async function (args) {
        var href = "/?start=connect";
        if (args && args.source) href += "&source=" + encodeURIComponent(args.source);
        window.location.href = href;
        return textResult("Navigating to the connect flow.");
      },
    }
  );
})();
