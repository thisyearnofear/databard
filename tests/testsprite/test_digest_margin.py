"""
INVARIANT: Digest must earn a strictly-positive margin on every settled digest deal.

The Digest reseller wins Consumer's parent WANT, then posts sub-WANTs to Newsroom for each
schema in the digest. The parent price MUST exceed the sum of sub-prices — otherwise the
reseller is losing money on every trade and the market economy is broken.

This is a REAL bug we caught during hackathon development:
  https://github.com/thisyearnofear/databard/blob/main/docs/CORAL_HACKATHON.md#lessons
When sub-WANT deadlines were 120s, Newsroom's urgency-pricing pushed each sub to 0.0144 SOL,
while Digest's parent pricing assumed 0.008/sub. Digest lost 0.013 SOL per deal until fixed.

This test defends against that regression forever.
"""
import os
import time
import requests

BASE = os.environ.get("TARGET_URL", "http://localhost:3000").rstrip("/")
DEMO = f"{BASE}/api/market/graph-demo"


def post_phase(want_id: str | None, phase: str, fixture: str = "ecommerce") -> dict:
    body = {"fixture": fixture, "phase": phase}
    if want_id:
        body["wantId"] = want_id
    r = requests.post(DEMO, json=body, timeout=120)
    r.raise_for_status()
    data = r.json()
    assert data.get("ok") is True, f"Non-ok response at phase={phase}: {data}"
    return data


def test_digest_earns_positive_margin_on_every_deal():
    # 1. Consumer posts the digest WANT
    post_resp = post_phase(None, "post")
    want_id = post_resp["wantId"]
    assert want_id, "wantId must be returned by phase=post"

    # 2. Consumer awards (Digest is the only bidder) — parent escrow deposit lands
    award_resp = post_phase(want_id, "award")
    parent_price = award_resp["parentDeal"]["priceLamports"]
    assert parent_price > 0, "Parent price must be positive"

    # 3. Digest fulfils by buying from Newsroom×N, concatenating, committing manifest hash.
    #    This is the moment the sub-market cash flows are locked in.
    deliver_resp = post_phase(want_id, "deliver")
    sub_deals = deliver_resp.get("subDeals", [])
    assert len(sub_deals) > 0, "Reseller must post at least one sub-WANT"

    sub_total = sum(d["priceLamports"] for d in sub_deals)
    margin_lamports = parent_price - sub_total
    margin_sol = margin_lamports / 1e9

    # THE INVARIANT: margin must be strictly positive on every settled deal.
    assert margin_lamports > 0, (
        f"INVARIANT VIOLATED: Digest lost money on this trade.\n"
        f"  parent price:  {parent_price/1e9:.4f} SOL\n"
        f"  sub-total:     {sub_total/1e9:.4f} SOL\n"
        f"  margin:        {margin_sol:+.4f} SOL\n"
        f"Root cause is almost always in voice-config.ts DIGEST pricingStrategy — "
        f"the estimated sub-cost is stale relative to the content persona's actual pricing."
    )

    # Bonus assertion: margin should also be > 5% of parent (economic viability)
    margin_pct = margin_lamports / parent_price
    assert margin_pct >= 0.05, (
        f"Digest margin thin at {margin_pct*100:.1f}% of parent (${margin_sol:+.4f} SOL). "
        f"Reseller economics require ≥ 5% to cover coordination + gas."
    )


def test_release_cascade_settles_all_sub_escrows():
    """
    INVARIANT: When Consumer releases the parent, EVERY sub-escrow must also release.
    A sub-escrow left in 'delivered' state means Newsroom never got paid — economic bug.
    """
    post_resp = post_phase(None, "post")
    want_id = post_resp["wantId"]
    post_phase(want_id, "award")
    post_phase(want_id, "deliver")
    release_resp = post_phase(want_id, "release")

    parent = release_resp["parentDeal"]
    sub_deals = release_resp.get("subDeals", [])

    assert parent["state"] == "released", f"Parent state must be 'released', got {parent['state']}"
    for i, sub in enumerate(sub_deals):
        assert sub["state"] == "released", (
            f"Sub-deal {i} for {sub['want']['schemaFqn']} did not release "
            f"(state={sub['state']}). Cascading release from orchestrator.releaseDeal is broken."
        )
        assert sub.get("explorer", {}).get("release"), (
            f"Sub-deal {i} released but has no explorer.release URL — receipt broken."
        )
