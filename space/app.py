"""DataBard x Beam — paste your DDL, Beam audits it, Alex & Morgan narrate.

Gradio Space for the Beam x Hugging Face build contest (Nov 2026).
Pipeline: (1) Beam parses the schema  (2) deterministic production rubric
scores it  (3) Beam narrates a two-host analysis with its reasoning visible.

Free-tier hygiene: Reflection's daily allowance caps this Space, so results
are cached aggressively and rate-limited per IP. Exhaustion degrades to an
honest card that still links the benchmark report + dataset.
"""
import datetime
import hashlib
import html
import json
import time
from pathlib import Path

import gradio as gr

import analysis
import beam_client
from scorecard import render_scorecard

HERE = Path(__file__).parent
CACHE_DIR = HERE / "cache"
CACHE_DIR.mkdir(exist_ok=True)

FIXTURES = {}
for p in (HERE / "fixtures").glob("*.json"):
    if p.name == "prompts.json":
        continue
    data = json.loads(p.read_text())
    FIXTURES[data["label"]] = data

BENCH_URL = "https://databard.persidian.com/benchmarks/beam"
DATASET_URL = "https://huggingface.co/datasets/Papajams/agent-service-quality"
DATABARD_URL = "https://databard.persidian.com"

DAILY_GLOBAL_CAP = 280  # under Reflection's 1M output-token/day allowance
DAILY_IP_CAP = 8

# ---- quota guard -----------------------------------------------------------

_quota = {"day": None, "global": 0, "ips": {}}


def _utc_day():
    return datetime.datetime.now(datetime.timezone.utc).date().isoformat()


def quota_take(ip):
    day = _utc_day()
    if _quota["day"] != day:  # reset aligns with Reflection's 00:00 UTC reset
        _quota.update({"day": day, "global": 0, "ips": {}})
    if _quota["global"] >= DAILY_GLOBAL_CAP:
        return False, "The Space's free daily allowance is used up. It resets at 00:00 UTC."
    if _quota["ips"].get(ip, 0) >= DAILY_IP_CAP:
        return False, "You've hit today's per-visitor limit — the featured examples below are cached and free to replay."
    _quota["global"] += 1
    _quota["ips"][ip] = _quota["ips"].get(ip, 0) + 1
    return True, ""


# ---- result cache -----------------------------------------------------------

_cache = {}


def cache_key(source, ddl, question, fmt):
    basis = source if source in FIXTURES else hashlib.sha1((ddl or "").encode()).hexdigest()[:16]
    return f"{basis}|{fmt}|{(question or '').strip().lower()[:120]}"


# ---- rendering helpers -------------------------------------------------------

def status_md(stage, note=""):
    steps = ["1 &nbsp;PARSE SCHEMA", "2 &nbsp;SCORE HEALTH", "3 &nbsp;NARRATE FINDINGS"]
    marks = []
    for i, s in enumerate(steps):
        if i < stage:
            marks.append(f"**[x] {s}**")
        elif i == stage:
            marks.append(f"**[~] {s} ...**")
        else:
            marks.append(f"[ ] {s}")
    line = " &nbsp;&nbsp;>&nbsp;&nbsp; ".join(marks)
    return f"{line}\n\n{note}"


def score_html(schema_name, insights):
    s = insights["healthScore"]
    label = insights["healthLabel"]
    color = {"healthy": "#5bf58c", "at-risk": "#f5c842",
             "critical": "#f55b5b"}[label]
    bars = ""
    for name, val in [("Test coverage", insights["testCoverage"]), ("Doc coverage", insights["docCoverage"])]:
        bars += (f"<div style='margin:6px 0'><div style='font-size:11px;color:#999'>{name}</div>"
                 f"<div style='background:#2a2440;border-radius:3px;height:8px;width:100%'>"
                 f"<div style='background:{color};height:8px;border-radius:3px;width:{val}%'></div></div></div>")
    flags = []
    if insights["untestedTables"]:
        flags.append(f"{len(insights['untestedTables'])} tables with zero tests")
    if insights["undocumentedTables"]:
        flags.append(f"{len(insights['undocumentedTables'])} undocumented")
    if insights["piiTables"]:
        flags.append(f"{len(insights['piiTables'])} tables carry PII")
    if insights["ownerlessTables"]:
        flags.append(f"{len(insights['ownerlessTables'])} ownerless")
    if insights["criticalTables"]:
        flags.append(f"{len(insights['criticalTables'])} critical-path tables")
    flags_html = "".join(f"<li style='margin:2px 0'>{html.escape(f)}</li>" for f in flags) or "<li>no structural defects</li>"
    return f"""
<div style="border:1px solid #3a3355;border-radius:10px;padding:18px;background:#1c1730">
  <div style="display:flex;align-items:baseline;gap:14px">
    <span style="font-size:52px;font-weight:700;color:{color}">{s}</span>
    <span style="color:#999">/100</span>
    <span style="border:1px solid {color};color:{color};border-radius:6px;padding:2px 10px;
          font-size:12px;letter-spacing:.12em;text-transform:uppercase">{html.escape(label)}</span>
  </div>
  <div style="margin-top:4px;color:#bbb;font-size:13px">{html.escape(schema_name)} — scored by the production DataBard rubric (deterministic, no LLM)</div>
  {bars}
  <ul style="margin:10px 0 0 18px;padding:0;font-size:13px;color:#ccc">{flags_html}</ul>
</div>"""


def transcript_html(segments):
    out = ["<div style='display:flex;flex-direction:column;gap:10px'>"]
    for seg in segments:
        speaker = seg.get("speaker", "Alex")
        alex = speaker == "Alex"
        name_color = "#8b5cf6" if alex else "#f5c842"
        align = "flex-start" if alex else "flex-end"
        bubble_bg = "#221b38" if alex else "#2a2440"
        text = html.escape(str(seg.get("text", "")))
        topic = html.escape(str(seg.get("topic", "")))
        out.append(f"""
<div style='display:flex;flex-direction:column;align-items:{align};max-width:100%'>
  <div style='font-size:11px;color:{name_color};letter-spacing:.1em;text-transform:uppercase;margin-bottom:2px'>
    {html.escape(speaker)}{' &middot; ' + topic if topic else ''}</div>
  <div style='background:{bubble_bg};border:1px solid #3a3355;border-radius:10px;padding:10px 14px;
       max-width:88%;font-size:14px;line-height:1.5;color:#eee'>{text}</div>
</div>""")
    out.append("</div>")
    return "".join(out)


def thoughts_md(reasoning, cap=2600):
    if not reasoning:
        return "*waiting for Beam...*"
    body = reasoning if len(reasoning) <= cap else "..." + reasoning[-cap:]
    return f"*Beam is thinking ({len(reasoning):,} chars so far) — raw reasoning stream, unedited:*\n\n> " + body.replace("\n", "\n> ")


def stats_md(usage, elapsed, cached_hit=False):
    bits = []
    if cached_hit:
        bits.append("served from cache — zero new tokens spent")
    if usage:
        rt = (usage.get("completion_tokens_details") or {}).get("reasoning_tokens")
        ct = usage.get("completion_tokens", 0)
        pt = usage.get("prompt_tokens", 0)
        bits.append(f"{pt:,} prompt / {ct:,} completion tokens")
        if rt:
            bits.append(f"{rt:,} of them reasoning ({rt * 100 // max(ct, 1)}%)")
    if elapsed:
        bits.append(f"{elapsed:.1f}s wall time")
    body = " &middot; ".join(bits) if bits else ""
    return (f"<div style='font-size:12px;color:#999'>{body}<br><br>"
            f"<a href='{BENCH_URL}' target='_blank'>Benchmark: Beam vs production on this exact workload</a> &middot; "
            f"<a href='{DATASET_URL}' target='_blank'>Dataset: 150+ measured agent services</a> &middot; "
            f"<a href='{DATABARD_URL}' target='_blank'>DataBard</a></div>")


QUOTA_CARD = """
<div style="border:1px dashed #3a3355;border-radius:10px;padding:20px;color:#ccc">
<strong>The free allowance for today is used up.</strong> This Space runs on Reflection's free
daily quota (resets 00:00 UTC) — nothing here is paid or curated.<br><br>
Meanwhile, everything this demo would produce is already frozen and public:
<ul>
<li><a href='{bench}' target='_blank'>The benchmark report</a> — Beam vs our production model on this exact workload, 24 runs</li>
<li><a href='{dataset}' target='_blank'>The dataset</a> — measured quality scores for 150+ pay-per-call agent services</li>
</ul></div>
""".format(bench=BENCH_URL, dataset=DATASET_URL)


def _emit(*vals):
    vals = list(vals) + [None] * (8 - len(vals))
    return tuple(vals[:8])


# ---- the pipeline -------------------------------------------------------------

def run_audit(source, ddl, question, fmt, request: gr.Request):
    ip = (getattr(request, "client", None) and request.client.host) or "unknown"
    fmt_key = "podcast" if "Podcast" in fmt else "executive"

    key = cache_key(source, ddl, question, fmt_key)
    hit = _cache.get(key)
    if hit:
        yield _emit(status_md(3, "cached run — replayed instantly"), hit["thoughts"], hit["schema_json"],
               hit["score"], hit["transcript"], hit["card"], hit["audio"],
               stats_md(hit.get("usage"), hit.get("elapsed"), cached_hit=True))
        return

    ok, why = quota_take(ip)
    if not ok:
        yield _emit(QUOTA_CARD, "", None, None, None, None, None)
        return

    t_start = time.time()
    reasoning_buf = []
    usage_total = {"prompt_tokens": 0, "completion_tokens": 0,
                   "completion_tokens_details": {"reasoning_tokens": 0}}

    def add_usage(u):
        if not u:
            return
        usage_total["prompt_tokens"] += u.get("prompt_tokens", 0)
        usage_total["completion_tokens"] += u.get("completion_tokens", 0)
        rd = (u.get("completion_tokens_details") or {}).get("reasoning_tokens", 0)
        usage_total["completion_tokens_details"]["reasoning_tokens"] += rd

    # ---- Stage 1: schema ----
    schema = None
    label = source
    audio = None
    if source in FIXTURES:
        fx = FIXTURES[source]
        schema, label, audio = fx["schema"], fx["label"], fx.get("audio")
        audio_path = HERE / audio if audio and (HERE / audio).exists() else None
        yield _emit(status_md(1, f"featured dataset loaded — {len(schema.get('tables', []))} tables"),
               thoughts_md(""), json.dumps(schema, indent=1)[:6000], None, None, None, None)
    else:
        ddl = (ddl or "").strip()
        if not ddl:
            yield _emit("Paste some DDL first — or pick a featured dataset.", "", None, None, None, None, None)
            return
        if len(ddl) > 12_000:
            yield _emit("That's a big schema — trim it to ~12k characters for the free demo.", "", None, None, None, None, None)
            return
        audio_path = None
        yield _emit(status_md(0, "Beam is reading your DDL ..."), thoughts_md(""), "", None, None, None, None)
        partial = ""
        try:
            for ev in beam_client.stream_chat(
                analysis.DDL_PARSE_SYSTEM,
                f"Extract the schema from this:\n\n{ddl}",
                max_tokens=12_000, temperature=0.1, json_mode=True,
            ):
                if ev["kind"] == "reasoning":
                    reasoning_buf.append(ev["delta"])
                    if len(reasoning_buf) % 8 == 0:
                        yield _emit(status_md(0, "Beam is reading your DDL ..."),
                               thoughts_md("".join(reasoning_buf)), partial[:6000], None, None, None, None)
                elif ev["kind"] == "content":
                    partial += ev["delta"]
                    yield _emit(status_md(0, "Beam is extracting tables/columns ..."),
                           thoughts_md("".join(reasoning_buf)), partial[:6000], None, None, None, None)
                elif ev["kind"] == "done":
                    add_usage(ev.get("usage"))
            parsed = beam_client.extract_json(ev["text"])
        except (beam_client.BeamError, json.JSONDecodeError, KeyError) as e:
            yield _emit(f"**Stage 1 failed** — honest error, no retry: {html.escape(str(e)[:220])}",
                   thoughts_md("".join(reasoning_buf)), None, None, None, None, None)
            return
        if not isinstance(parsed, dict) or not parsed.get("tables"):
            yield _emit("**Beam couldn't find tables in that input.** Try `CREATE TABLE ...` statements or a CSV header row.",
                   thoughts_md("".join(reasoning_buf)), json.dumps(parsed, indent=1)[:6000], None, None, None, None)
            return
        schema = parsed
        label = schema.get("name", "your schema")
        yield _emit(status_md(1, f"Beam extracted {len(schema['tables'])} tables"),
               thoughts_md("".join(reasoning_buf)), json.dumps(schema, indent=1)[:6000], None, None, None, None)

    # ---- Stage 2: deterministic score ----
    insights = analysis.analyze_schema(schema)
    yield _emit(status_md(2, f"rubric complete — {insights['healthScore']}/100 ({insights['healthLabel']})"),
           thoughts_md("".join(reasoning_buf)), json.dumps(schema, indent=1)[:6000],
           score_html(label, insights), None, None, None)
    time.sleep(0.4)  # let the score land visually

    # ---- Stage 3: narration ----
    system = analysis.SYSTEM_PROMPT if fmt_key == "podcast" else analysis.EXECUTIVE_SUMMARY_PROMPT
    if source in FIXTURES and not (question or "").strip():
        # byte-identical production prompt, frozen from the TS source
        user = FIXTURES[source]["prompts"][fmt_key]["user"]
    else:
        user = analysis.build_user_prompt(schema, insights, question)

    content_buf = ""
    yield _emit(status_md(2, "Beam is writing the analysis ..."), thoughts_md("".join(reasoning_buf)),
           json.dumps(schema, indent=1)[:6000], score_html(label, insights),
           "<div style='color:#888;padding:20px'>Beam is writing ...</div>", None, None)
    tick = 0
    try:
        for ev in beam_client.stream_chat(system, user, max_tokens=32_000, temperature=0.8, json_mode=True):
            if ev["kind"] == "reasoning":
                reasoning_buf.append(ev["delta"])
                tick += 1
                if tick % 10 == 0:
                    yield _emit(status_md(2, "Beam is thinking ..."), thoughts_md("".join(reasoning_buf)),
                           json.dumps(schema, indent=1)[:6000], score_html(label, insights),
                           "<div style='color:#888;padding:20px'>Beam is writing ...</div>", None, None)
            elif ev["kind"] == "content":
                content_buf += ev["delta"]
                tick += 1
                if tick % 6 == 0:
                    yield _emit(status_md(2, "Beam is narrating ..."), thoughts_md("".join(reasoning_buf)),
                           json.dumps(schema, indent=1)[:6000], score_html(label, insights),
                           f"<pre style='white-space:pre-wrap;color:#bbb;font-size:12px'>{html.escape(content_buf[-2400:])}</pre>",
                           None, None)
            elif ev["kind"] == "done":
                add_usage(ev.get("usage"))
    except beam_client.BeamError as e:
        yield _emit(f"**Stage 3 failed** — honest error: {html.escape(str(e)[:220])}",
               thoughts_md("".join(reasoning_buf)), json.dumps(schema, indent=1)[:6000],
               score_html(label, insights), None, None, None)
        return

    try:
        parsed = beam_client.extract_json(content_buf)
        segments = parsed if isinstance(parsed, list) else parsed.get("segments") or parsed.get("script")
        if not isinstance(segments, list) or not segments:
            raise ValueError("not a segment array")
    except Exception:
        yield _emit(status_md(3, "Beam answered, but not in the required JSON-array shape — the pipeline would fall back to templates here."),
               thoughts_md("".join(reasoning_buf)), json.dumps(schema, indent=1)[:6000],
               score_html(label, insights),
               f"<div style='color:#f55b5b'>Shape failure (this is the benchmark's famous one):</div>"
               f"<pre style='white-space:pre-wrap;font-size:12px'>{html.escape(content_buf[:2000])}</pre>",
               None, None)
        return

    segments = [{"speaker": "Morgan" if s.get("speaker") == "Morgan" else "Alex",
                 "topic": s.get("topic") or "discussion", "text": str(s.get("text", ""))} for s in segments]
    quote = next((s["text"] for s in segments if str(insights["healthScore"]) in s["text"]), segments[0]["text"])

    card_path = CACHE_DIR / f"{hashlib.sha1(key.encode()).hexdigest()[:12]}.png"
    render_scorecard(label, insights, quote, card_path, len(schema.get("tables", [])))

    elapsed = time.time() - t_start
    result = {
        "thoughts": thoughts_md("".join(reasoning_buf)),
        "schema_json": json.dumps(schema, indent=1)[:6000],
        "score": score_html(label, insights),
        "transcript": transcript_html(segments),
        "card": str(card_path),
        "audio": str(audio_path) if audio_path else None,
        "usage": usage_total, "elapsed": elapsed,
    }
    _cache[key] = result
    yield _emit(status_md(3, f"done — {len(segments)} segments in {elapsed:.1f}s"),
           result["thoughts"], result["schema_json"], result["score"],
           result["transcript"], result["card"], result["audio"],
           stats_md(usage_total, elapsed))


# ---- UI -------------------------------------------------------------------------

CSS = """
.gradio-container {max-width: 1180px !important}
footer {display: none !important}
#title h1 {font-weight:700; letter-spacing:-0.02em}
.thoughts-box {font-size: 12px}
"""

EXAMPLE_DDL = """CREATE TABLE customers (
  id BIGINT PRIMARY KEY,
  email VARCHAR(255),
  full_name VARCHAR(120),
  phone VARCHAR(32),
  created_at TIMESTAMP
);

CREATE TABLE orders (
  id BIGINT PRIMARY KEY,
  customer_id BIGINT,
  total NUMERIC(12,2),
  status VARCHAR(32),
  placed_at TIMESTAMP
);

CREATE TABLE shipments (
  id BIGINT PRIMARY KEY,
  order_id BIGINT,
  carrier VARCHAR(64),
  delivered_at TIMESTAMP
);"""

with gr.Blocks() as demo:
    gr.Markdown(
        """
# Beam audits your database
### Paste your DDL. **Beam 1.0 501B** parses it, the production DataBard rubric scores it, and two hosts — Alex (advocate) & Morgan (auditor) — narrate what they find. **Beam's raw reasoning is visible throughout.**

Built for the [Beam x Hugging Face contest](https://huggingface.co/reflection/Beam-1.0-501B-A23B) · runs on Reflection's **free daily allowance** · [benchmark](%s) · [dataset](%s)
""" % (BENCH_URL, DATASET_URL))

    with gr.Row():
        with gr.Column(scale=2):
            source = gr.Radio(list(FIXTURES.keys()) + ["Your own DDL"],
                              value=list(FIXTURES.keys())[0], label="Dataset")
            ddl = gr.Code(value="", label="Your DDL / CREATE TABLE statements", language="sql",
                          visible=True)
            question = gr.Textbox(value="", label="Optional research question",
                                  placeholder="e.g. Where are the governance gaps?")
            fmt = gr.Radio(["Podcast (12–25 segments)", "Executive briefing (5–8 segments)"],
                           value="Podcast (12–25 segments)", label="Output format")
            run_btn = gr.Button("Run the audit", variant="primary", size="lg")
            gr.Markdown(
                f"<small>Free tier: ~{DAILY_GLOBAL_CAP} generations/day shared, {DAILY_IP_CAP} per visitor. "
                f"Featured runs are cached. When the day's allowance runs out, the Space says so honestly.</small>")
        with gr.Column(scale=3):
            status = gr.Markdown("")
            score_panel = gr.HTML("")
            with gr.Accordion("Beam's thoughts — live reasoning stream", open=True):
                thoughts = gr.Markdown("", elem_classes=["thoughts-box"])
            transcript = gr.HTML("")
            with gr.Accordion("Extracted schema JSON", open=False):
                schema_out = gr.Code(label="", language="json", interactive=False)
            with gr.Row():
                card = gr.Image(label="Shareable scorecard", type="filepath", height=260)
                audio = gr.Audio(label="Featured audio briefing (fixtures only)", type="filepath")
            stats = gr.HTML("")

    def toggle_ddl(src):
        return gr.update(visible=(src == "Your own DDL"))
    source.change(toggle_ddl, source, ddl)

    outputs = [status, thoughts, schema_out, score_panel, transcript, card, audio, stats]
    run_btn.click(run_audit, [source, ddl, question, fmt], outputs, concurrency_limit=2)

    gr.Examples(
        examples=[
            [list(FIXTURES.keys())[0], "", "", "Podcast (12–25 segments)"],
            [list(FIXTURES.keys())[1], "", "Where are the governance gaps?", "Podcast (12–25 segments)"],
            ["Your own DDL", EXAMPLE_DDL, "", "Executive briefing (5–8 segments)"],
        ],
        inputs=[source, ddl, question, fmt],
        label="One-click examples",
    )

    gr.Markdown(
        f"""
---
<div style="font-size:12px;color:#888">
DataBard is an AI data analyst and an Agent Service Provider on OKX.AI. This Space calls
reflection/Beam-1.0-501B-A23B through Reflection's free API; health scores are computed by a deterministic
Python port of the production rubric (no LLM in the scoring). Beam is a thinking model — reasoning tokens
count against its output budget, which is why the thoughts panel is so chatty.
<br><a href="{BENCH_URL}" target="_blank">Benchmark report</a> ·
<a href="{DATASET_URL}" target="_blank">Agent-service quality dataset</a> ·
<a href="{DATABARD_URL}" target="_blank">databard.persidian.com</a>
</div>""")

demo.queue(default_concurrency_limit=2)

# Gradio 6 moved theme/css/head from Blocks() to launch(); older versions take
# them on the constructor. Try launch-side first, fall back gracefully.
_THEME = dict(theme=gr.themes.Soft(primary_hue="purple", neutral_hue="slate"), css=CSS)

def _launch():
    try:
        demo.launch(**_THEME)
    except TypeError:
        demo.launch()

if __name__ == "__main__":
    _launch()
