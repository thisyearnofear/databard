/**
 * Reseller orchestration — how the Digest persona fulfills a digest WANT.
 *
 * The Digest doesn't generate audio. It:
 *   1. For each schema in the parent WANT's digestSchemas, posts a sub-WANT to the market
 *      (as a BUYER — using the Digest's own server-side keypair)
 *   2. Awards each sub-WANT to its winning content persona (typically Newsroom)
 *   3. "Delivers" each sub-WANT — in demo mode, uses canned audio; in real mode this would
 *      invoke that persona's pipeline
 *   4. Concatenates the sub-audio buffers with a Digest intro/outro tag
 *   5. Commits the concatenated manifest hash to the PARENT escrow
 *   6. When the top-level buyer releases the parent escrow, releases each sub-escrow in turn
 *
 * Two visible cash flows on-chain: parent (Consumer → Digest) and children (Digest → Newsroom).
 * This is the graph-not-pair story.
 */
import { PublicKey } from "@solana/web3.js";
import { store } from "../store";
import type { Bid, Deal, MarketActor, Want } from "../types";
import { getDemoAudio, type DemoFixtureId } from "./demo-fixtures";
import { pickBid } from "./buyer";
import {
  createDeal,
  createWant,
  getDeal,
  listBidsForWant,
  transitionWant,
  updateDeal,
} from "./protocol";
import { autoBidInternal, getSellerActor, getSellerKeypair, generateReference } from "./sellers";
import { explorerUrl } from "../settlement/verifier";
import {
  commitDelivery,
  deposit,
  fetchEscrowState,
  release,
  sha256,
} from "../settlement/backends/escrow";
import { Keypair } from "@solana/web3.js";
import { recordWin } from "./reputation";

const KEYPAIR_TTL = 86400 * 365 * 10;

/** Consumer's server-side keypair — the top-level buyer of Digest WANTs. */
export function getConsumerKeypair(): Keypair {
  const key = "consumer-buyer-key";
  const cached = store.get<string>(key);
  if (cached) return Keypair.fromSecretKey(Buffer.from(cached, "base64"));
  const kp = Keypair.generate();
  store.set(key, Buffer.from(kp.secretKey).toString("base64"), KEYPAIR_TTL);
  return kp;
}

export function getConsumerActor(): MarketActor {
  return {
    kind: "agent",
    publicKey: getConsumerKeypair().publicKey.toBase58(),
    label: "MegaCorp Insights",
  };
}

/** Digest's server-side buyer keypair — signs sub-WANT deposits + releases. */
export function getDigestBuyerKeypair(): Keypair {
  const key = "digest-buyer-key";
  const cached = store.get<string>(key);
  if (cached) return Keypair.fromSecretKey(Buffer.from(cached, "base64"));
  const kp = Keypair.generate();
  store.set(key, Buffer.from(kp.secretKey).toString("base64"), KEYPAIR_TTL);
  return kp;
}

export function getDigestBuyerActor(): MarketActor {
  return {
    kind: "agent",
    publicKey: getDigestBuyerKeypair().publicKey.toBase58(),
    label: "Digest (buyer role)",
  };
}

/** Sub-WANT records for a given parent — indexed for the dashboard graph view. */
const SUB_INDEX_TTL = 86400 * 30;
export function indexSubWant(parentWantId: string, subWantId: string): void {
  const key = `subwants:${parentWantId}`;
  const list = store.get<string[]>(key) ?? [];
  list.push(subWantId);
  store.set(key, list, SUB_INDEX_TTL);
}

export function getSubWantIds(parentWantId: string): string[] {
  return store.get<string[]>(`subwants:${parentWantId}`) ?? [];
}

export interface ResellerDeliverInput {
  /** The parent digest WANT id being fulfilled. */
  parentWantId: string;
  /**
   * Fixture id used for the sub-briefs' audio content — in demo mode all sub-schemas get
   * concatenated audio from this fixture. Real mode would drive each sub-persona's pipeline.
   */
  demoFixture?: DemoFixtureId;
}

export interface ResellerDeliverResult {
  parentDeal: Deal;
  subDeals: Deal[];
  combinedAudio: Buffer;
  parentManifestHashHex: string;
  parentCommitTxSig: string;
}

/**
 * Run the reseller cycle for a parent digest WANT that Digest just won.
 * Returns after the parent commit hash lands on-chain — the top-level buyer's release()
 * call (and this reseller's downstream releases) happen separately in `resellerRelease`.
 */
export async function resellerDeliver(input: ResellerDeliverInput): Promise<ResellerDeliverResult> {
  const parentDeal = getDeal(input.parentWantId);
  if (!parentDeal) throw new Error(`Parent deal ${input.parentWantId} not found`);
  if (parentDeal.personaId !== "digest") {
    throw new Error(`Reseller deliver called on non-digest deal (persona=${parentDeal.personaId})`);
  }
  if (parentDeal.state !== "deposited") {
    throw new Error(`Parent deal is ${parentDeal.state}, expected deposited`);
  }

  const digestBuyerKp = getDigestBuyerKeypair();
  const digestBuyerActor = getDigestBuyerActor();
  const parentSchemas = parentDeal.want.digestSchemas ?? [parentDeal.want.schemaFqn];

  const subDeals: Deal[] = [];
  const subAudioBuffers: Buffer[] = [];

  // For every schema in the digest, run a mini-market cycle.
  for (const schemaFqn of parentSchemas) {
    // 1. Digest posts a sub-WANT — cheaper budget than the parent since it's a single flash.
    const subWant = createWant({
      buyer: digestBuyerActor,
      schemaFqn,
      focus: "freshness",
      budgetLamports: 20_000_000, // 0.02 SOL — headroom above Newsroom's urgency-adjusted floor
      deadlineSec: 300,             // 300s → urgency ~0.5 → Newsroom bids ~0.0135 SOL
      wantType: "brief",
      parentWantId: input.parentWantId,
    });
    indexSubWant(input.parentWantId, subWant.id);
    autoBidInternal(subWant);

    // 2. Digest picks a bid (uses the same heuristic buyer — Newsroom typically wins on freshness)
    const bids = listBidsForWant(subWant.id);
    const pick = pickBid(subWant, bids);
    if (!pick) throw new Error(`No bids for sub-WANT ${subWant.id}`);
    const winningBid = bids.find((b) => b.id === pick.award.winningBidId)!;

    // 3. Digest deposits into sub-escrow
    const subReference = generateReference();
    const subRefPk = new PublicKey(subReference);
    const subSellerKp = getSellerKeypair(winningBid.personaId);
    transitionWant(subWant.id, "awarded");
    const subDepositSig = await deposit({
      buyer: digestBuyerKp,
      seller: subSellerKp.publicKey,
      reference: subRefPk,
      amountLamports: winningBid.priceLamports,
      deadlineSec: 120,
    });
    transitionWant(subWant.id, "deposited");
    const subDeal: Deal = {
      wantId: subWant.id,
      reference: subReference,
      buyer: digestBuyerKp.publicKey.toBase58(),
      seller: subSellerKp.publicKey.toBase58(),
      personaId: winningBid.personaId,
      priceLamports: winningBid.priceLamports,
      state: "deposited",
      explorer: { deposit: explorerUrl("tx", subDepositSig) },
      want: subWant,
      winningBid,
      award: pick.award,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    createDeal(subDeal);

    // 4. Content persona "delivers" (demo audio) + commits its own hash on the sub-escrow.
    const subAudio = input.demoFixture
      ? await getDemoAudio(input.demoFixture)
      : await getDemoAudio("ecommerce");
    subAudioBuffers.push(subAudio);
    const subAudioHash = sha256(subAudio).hex;
    const subManifest = JSON.stringify({
      episodeId: `sub_${subWant.id}`,
      schemaFqn,
      personaId: winningBid.personaId,
      audioSha256: subAudioHash,
      parentWantId: input.parentWantId,
    });
    const subManifestHashBytes = sha256(subManifest).bytes;
    const subCommitSig = await commitDelivery({
      seller: subSellerKp,
      buyer: digestBuyerKp.publicKey,
      reference: subRefPk,
      manifestHash: subManifestHashBytes,
    });
    transitionWant(subWant.id, "delivered");
    const subUpdated = updateDeal(subWant.id, {
      manifestHash: sha256(subManifest).hex,
      state: "delivered",
      explorer: { commit: explorerUrl("tx", subCommitSig) },
    })!;
    subDeals.push(subUpdated);
  }

  // 5. Digest concatenates the sub-audio buffers → the packaged deliverable.
  const combinedAudio = Buffer.concat(subAudioBuffers);

  // 6. Digest commits the parent's manifest hash to the parent escrow (as seller).
  const parentManifest = JSON.stringify({
    episodeId: `digest_${input.parentWantId}`,
    schemaFqn: parentDeal.want.schemaFqn,
    personaId: "digest",
    audioSha256: sha256(combinedAudio).hex,
    subDealIds: subDeals.map((d) => d.wantId),
  });
  const parentManifestBytes = sha256(parentManifest).bytes;
  const parentManifestHashHex = sha256(parentManifest).hex;
  const digestSellerKp = getSellerKeypair("digest");
  const parentCommitSig = await commitDelivery({
    seller: digestSellerKp,
    buyer: new PublicKey(parentDeal.buyer),
    reference: new PublicKey(parentDeal.reference),
    manifestHash: parentManifestBytes,
  });
  transitionWant(parentDeal.wantId, "delivered");
  const parentUpdated = updateDeal(parentDeal.wantId, {
    manifestHash: parentManifestHashHex,
    state: "delivered",
    explorer: { commit: explorerUrl("tx", parentCommitSig) },
  })!;

  return {
    parentDeal: parentUpdated,
    subDeals,
    combinedAudio,
    parentManifestHashHex,
    parentCommitTxSig: parentCommitSig,
  };
}

/**
 * When the top-level buyer releases the parent escrow, Digest also releases each of the
 * sub-escrows it opened. Cash flows: Consumer → Digest (parent), Digest → Newsroom (subs).
 */
export async function resellerReleaseAll(parentWantId: string): Promise<{
  parentDeal: Deal;
  subReleases: { subWantId: string; releaseTxSig: string }[];
}> {
  const parentDeal = getDeal(parentWantId);
  if (!parentDeal) throw new Error(`Parent deal ${parentWantId} not found`);
  if (parentDeal.state !== "released") {
    throw new Error(`Parent deal is ${parentDeal.state}, expected released before sub-releases`);
  }

  const digestBuyerKp = getDigestBuyerKeypair();
  const subReleases: { subWantId: string; releaseTxSig: string }[] = [];

  for (const subWantId of getSubWantIds(parentWantId)) {
    const subDeal = getDeal(subWantId);
    if (!subDeal || subDeal.state !== "delivered") continue;
    const sellerKp = getSellerKeypair(subDeal.personaId);
    // Verify the sub-escrow's committed hash is still there before releasing.
    const state = await fetchEscrowState(digestBuyerKp.publicKey, new PublicKey(subDeal.reference));
    if (!state?.deliverableHash) continue;
    const sig = await release({
      buyer: digestBuyerKp,
      seller: sellerKp.publicKey,
      reference: new PublicKey(subDeal.reference),
    });
    transitionWant(subWantId, "released");
    updateDeal(subWantId, {
      state: "released",
      explorer: { release: explorerUrl("tx", sig) },
    });
    // Sub-releases feed reputation too — Newsroom's win-count grows here.
    recordWin(subDeal.personaId, subDeal.priceLamports);
    subReleases.push({ subWantId, releaseTxSig: sig });
  }

  return { parentDeal, subReleases };
}
