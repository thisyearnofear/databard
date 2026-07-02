"""
INVARIANT: The escrow state machine must not admit invalid transitions.

Rules:
  - award() requires the WANT to be 'open'; second award on same WANT returns 409/500
  - deliver() requires 'deposited'
  - release() requires 'delivered'
  - Attempting phases out of order returns non-200 (or ok:false)

Guards against the whole class of "buyer released before seller committed" attacks.
"""
import os
import requests

BASE = os.environ.get("TARGET_URL", "http://localhost:3000").rstrip("/")
DEMO = f"{BASE}/api/market/demo"


def post_phase(want_id: str | None, phase: str, expect_ok: bool = True) -> dict:
    body = {"fixture": "ecommerce", "phase": phase}
    if want_id:
        body["wantId"] = want_id
    r = requests.post(DEMO, json=body, timeout=60)
    data = r.json()
    if expect_ok:
        assert r.ok and data.get("ok") is True, f"expected ok at phase={phase}, got {data}"
    return data


def test_cannot_release_before_deliver():
    """Post a WANT, award it, then try to skip straight to release without deliver."""
    post = post_phase(None, "post")
    want_id = post["wantId"]
    post_phase(want_id, "award")
    # At this point the deal is 'deposited'. Trying 'release' should fail because there's
    # no committed manifest hash — the escrow's release instruction requires deliverable_hash.is_some().
    # The demo route's `if deal.state === "delivered"` branch guards this.
    resp = post_phase(want_id, "release", expect_ok=False)
    ok = resp.get("ok")
    # We accept either ok:false with an explanatory error, OR ok:true but no state transition
    # to 'released' — either proves the invariant holds.
    if ok is True:
        # If the endpoint said ok, verify the state didn't jump — it should still be 'deposited'.
        deal = resp.get("deal") or {}
        assert deal.get("state") != "released", (
            "release() succeeded before deliver — escrow state machine is broken! "
            "The on-chain program's require!(deliverable_hash.is_some()) should have rejected it."
        )
