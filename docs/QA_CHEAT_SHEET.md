# Q&A Cheat Sheet — Solana Accelerator Judges
## 2-3 minutes of Q&A after the pitch

---

## Anticipated Questions & Answers

### "Why does this need a blockchain?"

> "Honestly, the core product doesn't. It's a communication layer for data teams — audio briefings, dashboards, trend narratives. That works without Solana. But for a specific audience — web3 protocols making public claims about their infrastructure — verifiable health is worth more than unverifiable health. Solana makes the report tamper-evident and independently checkable. It's an optional layer for teams that need public trust, not the reason the product exists."

### "If the core product doesn't need Solana, why are you pitching here?"

> "Because the web3 ecosystem is our wedge. Protocols already produce health metrics, they need them verifiable, and the leaderboard is a public registry they want to be on. The accelerator's ecosystem intros cold-start that registry. Enterprise is the bigger market, but web3 is where we start — and Solana's fee structure makes per-report attestation economically trivial, about five ten-thousandths of a cent."

### "A memo transaction is trivial — is that really the on-chain feature?"

> "Deliberately. Hash commitment is the right primitive — zero contract risk, about five ten-thousandths of a cent per attestation, verify with one RPC call. We also built an Anchor escrow program on devnet where data insights can settle through on-chain escrow — that's experimental, but it shows we can go deeper where the use case demands it."

### "Why Solana specifically and not Ethereum or another chain?"

> "Cost and speed. At about $0.000005 per attestation, we can anchor every single report without thinking about it. On Ethereum that would be dollars per report — economically non-viable for a weekly digest product. Solana's fee structure makes per-report attestation economically trivial, which is the only way this works as a habit, not a novelty."

### "Is the escrow marketplace on mainnet?"

> "Devnet, and honestly it's experimental. There's no existing market for 'data insights as on-chain goods' — we're testing whether that demand exists. The attestation layer is ready for mainnet today. The escrow marketplace is a hypothesis we're validating."

### "What's on-chain exactly? The full report?"

> "No — the report stays private. Only the commitment is public: schema name, health score, episode ID, SHA-256 of the report script, author wallet, and timestamp. Anyone can recompute the hash from the report and check it against the on-chain memo. The report itself doesn't go on-chain."

### "How do you make money?"

> "$49 a month per team, up to 5 schemas, unlimited listeners. Cost per briefing is about 80 cents — ElevenLabs TTS is 95% of variable cost. We're default alive at 10 paying teams. The price is deliberately below the procurement threshold — no IT approval needed, expense it on a personal card."

### "Who are your competitors?"

> "Nobody, directly. We're not competing with Monte Carlo or Bigeye — they detect what's broken, we synthesise what it means and act on it. They could be inputs to DataBard. We're an AI data analyst, not a observability tool or a podcast tool. The closest competitor is a data team lead writing a weekly Notion doc that nobody reads — except we also explain why it happened, recommend what to do, and (next) file the ticket for you."

### "Do you have customers?"

> "Not paying customers yet — we're in the validation phase. We have 5 Solana protocol teams identified with data already seeded and briefings ready to send. The first 10 users come from us going to them manually. The accelerator ecosystem intros would cold-start that process."

### "What's the distribution strategy? How do you get users?"

> "The product is its own distribution channel. Every shared episode is a mini-landing page with a 'Get this for your data' CTA. Every dashboard has an embeddable health badge for READMEs. The success event — forwarding the Monday briefing to 20 stakeholders — IS the acquisition event. Usage and distribution are the same act."

### "What if ElevenLabs goes down or raises prices?"

> "ElevenLabs is 95% of variable cost, so it's a real dependency. We have a fallback: a web automation TTS path that uses browser-based speech synthesis for the free tier. If ElevenLabs raises prices, we can switch to OpenAI TTS or Azure TTS — the audio engine is abstracted. The risk is cost, not capability."

### "How is the AI analysis different from just asking ChatGPT?"

> "ChatGPT doesn't have your schema metadata. DataBard connects to your actual data catalog — OpenMetadata, dbt, Coral — and computes real health scores from test results, coverage stats, lineage, ownership, and PII flags. The LLM synthesizes the analysis into a narrative, but the analysis itself is deterministic. 'Your health dropped 8 points because test coverage fell in payments after Friday's deploy' requires knowing your schema, not just generic AI."

### "What's the roadmap?"

> "Three priorities. First: validate with 10 paying teams — that's the only metric that matters right now. Second: mainnet attestation for the teams that want it. Third: benchmarking — 'your health score vs teams your size' — which creates a network effect. The roadmap is customer-driven, not feature-driven."

### "Would enterprises actually want their data health public?"

> "Most wouldn't — and we don't push it on them. The attestation is optional. Enterprise teams use DataBard for internal communication: the Monday briefing, the dashboard, the trend narratives. Public verifiability is for the subset that benefits from it — protocols, DAOs, open-source data teams. We're not trying to put every enterprise's dirty laundry on-chain."

---

## If They Ask Something You Don't Know

> "That's a great question — I don't want to guess. Can I follow up with you after the session?"

**Don't bullshit.** Judges can tell. Honesty about what you don't know yet is better than a confident wrong answer.

---

## If They Challenge the Solana Angle

> "Fair challenge. The core product works without Solana — it's a communication layer. But for web3 protocols, health claims are public claims, and verifiable claims are worth more than unverifiable ones. Solana is a trust layer for that audience, not the foundation of the product. We're pitching here because the web3 ecosystem is our wedge — it's where we start, not where we end."

---

## If They Ask About the Team

*(Adapt this to your actual background)*

> "I'm a builder who felt the pain — I spent 5 hours a week writing a data quality report that nobody read. Forrester says 75% of business users don't trust dashboards enough to make decisions, and only 7% of companies are truly insights-driven. DataBard exists because I needed it. I've shipped the full product end-to-end: the analysis engine, the LLM synthesis, the TTS pipeline, the Solana attestation, the escrow program. The code is on GitHub — you can verify everything I just showed you."
