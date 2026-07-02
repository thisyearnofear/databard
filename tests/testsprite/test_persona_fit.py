"""
INVARIANT: The buyer LLM's fit-vs-price scoring must reflect persona identity.

Each persona has a semantic focus specialty:
  - Cascade (deep-dive):     wins Quality briefs
  - Newsroom (breaking flash): wins Freshness briefs
  - Signal (executive brief):  wins Overview briefs at premium price

If the scoring weights drift such that the cheap persona always wins, the market loses
its "picks best fit, not cheapest" story — which is DataBard's whole differentiator.

This test defends against silent regressions in buyer.ts fit weights.
"""
import os
import requests

BASE = os.environ.get("TARGET_URL", "http://localhost:3000").rstrip("/")
DEMO = f"{BASE}/api/market/demo"


def run_cycle_with_focus(fixture: str = "ecommerce") -> dict:
    # phase="all" runs post→award→deliver→release end-to-end
    r = requests.post(DEMO, json={"fixture": fixture, "phase": "all"}, timeout=180)
    r.raise_for_status()
    data = r.json()
    assert data.get("ok") is True, f"Cycle failed: {data}"
    return data


def test_cascade_wins_quality_brief():
    """The e-commerce fixture triggers 4 quality delta hints; Cascade should win it."""
    result = run_cycle_with_focus("ecommerce")
    deal = result["deal"]
    focus = deal["want"]["focus"]
    persona = deal["personaId"]

    assert focus == "quality", (
        f"Watchdog should detect the fixture's failing tests as a 'quality' focus, got '{focus}'"
    )
    assert persona == "cascade", (
        f"On a quality brief, Cascade (deep-dive specialist) should win — got '{persona}'.\n"
        f"Root cause: buyer.ts scoreBid weights may have drifted; fit should dominate price at 68/32."
    )
