"""Deterministic health scoring + production-prompt builder for the Space.

Python port of src/lib/schema-analysis.ts (analyzeSchema) and the user-prompt
half of src/lib/script-generator.ts (buildUserPrompt). The rubric is
production's — scores here match what DataBard's own pipeline computes.
System prompts are loaded frozen from fixtures/prompts.json (exported
byte-identical from the TS source).
"""
import json
import time
from pathlib import Path

HERE = Path(__file__).parent
_PROMPTS = json.loads((HERE / "fixtures" / "prompts.json").read_text())

SYSTEM_PROMPT = _PROMPTS["podcast_system"]
EXECUTIVE_SUMMARY_PROMPT = _PROMPTS["executive_system"]

DDL_PARSE_SYSTEM = """You are DataBard's schema ingestion stage. Convert the user's DDL, CSV headers, or free-text table listing into ONE strict JSON object describing the schema. Do not invent tests, owners, row counts, or descriptions that are not present or directly implied.

Output schema (JSON only, no prose, no code fences):
{
  "name": "<short schema name>",
  "fqn": "<name or catalog.name>",
  "description": "<one sentence or null>",
  "tables": [
    {
      "name": "...",
      "description": "<from COMMENT clauses or obvious-from-name, else null>",
      "owner": null,
      "rowCount": null,
      "freshness": null,
      "piiColumns": ["<columns that look like personal data: email, phone, name, ssn, address, dob, ip_address, ...>"],
      "glossaryTerms": [],
      "columns": [{"name": "...", "dataType": "..."}],
      "tags": [],
      "qualityTests": []
    }
  ],
  "lineage": [
    {"fromTable": "<schema.table>", "toTable": "<schema.table>"}
  ]
}

Lineage rules: infer an edge parent -> child when a column is named like <parent>_id or <parent singular>_id and a matching table exists. DDL carries no quality tests — leave qualityTests empty; that absence is a real finding, not something to fix up."""


def _clean(d):
    """Drop None/empty like JSON.stringify drops undefined (production parity)."""
    if isinstance(d, dict):
        return {k: _clean(v) for k, v in d.items() if v is not None}
    if isinstance(d, list):
        return [_clean(v) for v in d]
    return d


def analyze_schema(schema):
    tables = schema.get("tables", [])
    lineage = schema.get("lineage", [])

    total_tests = sum(len(t.get("qualityTests", [])) for t in tables)
    failing_tests = sum(
        1 for t in tables for q in t.get("qualityTests", []) if q.get("status") == "Failed"
    )
    passing_tests = sum(
        1 for t in tables for q in t.get("qualityTests", []) if q.get("status") == "Success"
    )

    untested = [t["name"] for t in tables if not t.get("qualityTests")]
    undocumented = [t["name"] for t in tables if not t.get("description")]
    test_coverage = round((len(tables) - len(untested)) / len(tables) * 100) if tables else 0
    doc_coverage = round((len(tables) - len(undocumented)) / len(tables) * 100) if tables else 0

    conn_count, downstream = {}, {}
    for edge in lineage:
        frm = edge.get("fromTable", "").split(".")[-1]
        to = edge.get("toTable", "").split(".")[-1]
        conn_count[frm] = conn_count.get(frm, 0) + 1
        conn_count[to] = conn_count.get(to, 0) + 1
        downstream[frm] = downstream.get(frm, 0) + 1

    fqns = {t.get("fqn") for t in tables if t.get("fqn")}
    external_deps = [
        e for e in lineage if e.get("fromTable") not in fqns or e.get("toTable") not in fqns
    ]

    critical = []
    for t in tables:
        failing = sum(1 for q in t.get("qualityTests", []) if q.get("status") == "Failed")
        down = downstream.get(t["name"], 0)
        risk_score = failing * (1 + down)
        if failing > 0 and down > 2:
            risk = "critical"
        elif failing > 0:
            risk = "high"
        elif not t.get("qualityTests") and down > 0:
            risk = "medium"
        else:
            risk = "low"
        if risk != "low":
            critical.append(
                {"name": t["name"], "failingTests": failing, "downstreamDependents": down,
                 "risk": risk, "_score": risk_score}
            )
    critical.sort(key=lambda c: -c["_score"])
    for c in critical:
        c.pop("_score")

    hotspots = [
        {"name": n, "connections": c}
        for n, c in sorted(conn_count.items(), key=lambda kv: -kv[1])[:5]
    ]

    owner_map, ownerless = {}, []
    for t in tables:
        if t.get("owner"):
            owner_map.setdefault(t["owner"], []).append(t["name"])
        else:
            ownerless.append(t["name"])
    owners = [{"name": k, "tables": v} for k, v in owner_map.items()]

    pii_tables = [
        {"name": t["name"], "columns": t["piiColumns"]}
        for t in tables if t.get("piiColumns")
    ]

    glossary = []
    for t in tables:
        for g in t.get("glossaryTerms", []) or []:
            if g not in glossary:
                glossary.append(g)

    now_ms = time.time() * 1000
    stale = []
    for t in tables:
        if t.get("freshness"):
            try:
                hours = round((now_ms - _parse_iso_ms(t["freshness"])) / 3_600_000)
            except Exception:
                continue
            if hours > 24:
                stale.append({"name": t["name"], "freshness": t["freshness"], "hoursAgo": hours})
    stale.sort(key=lambda s: -s["hoursAgo"])

    largest = sorted(
        ({"name": t["name"], "rowCount": t["rowCount"]} for t in tables if (t.get("rowCount") or 0) > 0),
        key=lambda x: -x["rowCount"],
    )[:5]

    score = 100
    if total_tests > 0:
        score -= round((failing_tests / total_tests) * 40)
    if tables:
        score -= round((len(untested) / len(tables)) * 30)
        score -= round((len(undocumented) / len(tables)) * 10)
        score -= round((len(ownerless) / len(tables)) * 5)
    if not lineage and len(tables) > 1:
        score -= 15
    if stale:
        score -= min(10, len(stale) * 3)
    score = max(0, min(100, score))

    label = "healthy" if score >= 80 else "at-risk" if score >= 50 else "critical"

    return _clean({
        "healthScore": score,
        "healthLabel": label,
        "criticalTables": critical,
        "untestedTables": untested,
        "undocumentedTables": undocumented,
        "docCoverage": doc_coverage,
        "testCoverage": test_coverage,
        "lineageHotspots": hotspots,
        "externalDeps": external_deps,
        "totalTests": total_tests,
        "passingTests": passing_tests,
        "failingTests": failing_tests,
        "queuedTests": total_tests - failing_tests - passing_tests,
        "owners": owners,
        "piiTables": pii_tables,
        "glossaryTerms": glossary,
        "staleTables": stale,
        "largestTables": largest,
        "ownerlessTables": ownerless,
    })


def _parse_iso_ms(s):
    from datetime import datetime
    dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    return dt.timestamp() * 1000


def build_user_prompt(schema, insights, research_question=None):
    """Mirror of buildUserPrompt in src/lib/script-generator.ts."""
    tables = []
    for t in schema.get("tables", []):
        tests = t.get("qualityTests", [])
        tables.append(_clean({
            "name": t.get("name"),
            "description": t.get("description"),
            "owner": t.get("owner"),
            "rowCount": t.get("rowCount"),
            "freshness": t.get("freshness"),
            "piiColumns": t.get("piiColumns"),
            "glossaryTerms": t.get("glossaryTerms"),
            "columnCount": len(t.get("columns", [])),
            "columnSample": [f"{c.get('name')} ({c.get('dataType')})" for c in (t.get("columns") or [])[:5]],
            "tags": t.get("tags"),
            "tests": {
                "total": len(tests),
                "failing": [q.get("name") for q in tests if q.get("status") == "Failed"],
                "passing": sum(1 for q in tests if q.get("status") == "Success"),
            },
        }))
    lineage = schema.get("lineage", [])
    payload = _clean({
        "researchQuestion": (research_question or "").strip() or None,
        "schema": schema.get("name"),
        "fqn": schema.get("fqn"),
        "description": schema.get("description"),
        "tableCount": len(schema.get("tables", [])),
        "tables": tables,
        "lineageEdges": len(lineage),
        "lineageSample": [
            {"from": e.get("fromTable", "").split(".")[-1], "to": e.get("toTable", "").split(".")[-1]}
            for e in lineage[:20]
        ],
        "insights": {
            "healthScore": insights["healthScore"],
            "healthLabel": insights["healthLabel"],
            "testCoverage": f"{insights['testCoverage']}%",
            "docCoverage": f"{insights['docCoverage']}%",
            "failingTests": insights["failingTests"],
            "untestedTables": insights["untestedTables"],
            "undocumentedTables": insights["undocumentedTables"],
            "criticalTables": insights["criticalTables"],
            "lineageHotspots": insights["lineageHotspots"],
            "externalDeps": len(insights["externalDeps"]),
            "owners": insights["owners"],
            "ownerlessTables": insights["ownerlessTables"],
            "piiTables": insights["piiTables"],
            "glossaryTerms": insights["glossaryTerms"],
            "staleTables": insights["staleTables"],
            "largestTables": insights["largestTables"],
        },
    })
    return json.dumps(payload)
