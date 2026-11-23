// The token radar's model, radar-3: one sealed snapshot in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds
// every rankable pre-token protocol below the floor: the early rows the radar exists to find. It
// also adds the standalone pre-token protocols above the floor that the watchlist does not name —
// a bridge, a wrapped asset or a staking receipt is not a standalone launch candidate, but a
// standalone protocol the watchlist missed is exactly what a radar is for. A protocol is
// pre-token when its record carries no token (no market cap, no CoinGecko id, no symbol); the
// live-token protocols are kept apart and shown with the market's own values, never mixed into
// the ranked board.
//
// Implied value is calibrated from the snapshot's own figures, never from a list of names:
//
//   1. Calibration. For every protocol that already trades, the snapshot carries both a market cap
//      and a TVL, so the market's own mcap/TVL multiple is observable. Peer ratios are winsorized
//      at 5x (above it, a ratio is a micro-TVL artifact, not evidence); the model then takes the
//      median multiple per category, shrunk toward the global median with a prior of phantom peers
//      that scales with the evidence — twelve when a category has no peers of its own, down to
//      three once it has nine or more — and clamps it to [MULTIPLE_FLOOR, MULTIPLE_CAP]. A
//      category with no tokenized peer takes the global median. The calibration table is part of
//      the dashboard's data, so the page shows the evidence behind every multiple.
//   2. Base. base = tvl_usd x category_multiple.
//   3. Growth. growth = clamp(change_7d, -50, +100) per cent; growthMult = 1 + growth/100 x 0.5.
//   4. Maturity. maturity = 0.6 + min(age_days, 1095) / 1095 x 0.4 (age unknown: 365 days). A
//      protocol that has run longer with no token on record is a more seasoned launch candidate.
//   5. Breadth. breadth = 1 + 0.015 x min(chains - 1, 10): a protocol live on more chains has
//      wider distribution, capped so a chain count never dominates the value.
//   implied = max(1, round(base x growthMult x maturity x breadth))
//
// Growth, maturity and breadth are assumptions, stated as such in the dashboard: only the
// category multiple is calibrated from the snapshot. Every constant is stated in the dashboard
// and changeable in its model sandbox. No protocol name is ever special-cased: the same function
// scores every row, and every farm step is derived from the protocol's own record — category,
// chains, TVL, age and seven-day move — never from a named product the snapshot does not carry.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  /** Phantom peers of global-median strength each category's median is shrunk with, at the thin end: the prior scales down as a category's own peers grow. */
  prior_peers: number;
  /** The smallest the phantom-peer prior shrinks to, once a category has many peers of its own. */
  prior_peers_min: number;
  /** Peer mcap/TVL ratios are winsorized at this cap before the median: above it, a ratio is
   * almost always a micro-TVL artifact (a tiny TVL with a speculative market cap), not evidence. */
  peer_ratio_cap: number;
  /** The calibrated multiple's floor and cap. */
  multiple_floor: number;
  multiple_cap: number;
  /** The growth window in per cent and the weight it carries. */
  growth_floor: number;
  growth_cap: number;
  growth_weight: number;
  /** The maturity curve: floor, range, the age it saturates at, and the age assumed unknown. */
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  /** The breadth adjustment per extra chain and the chains it counts. */
  breadth_per_chain: number;
  breadth_cap_chains: number;
}

export const MODEL: ModelConstants = {
  // Deliberately strong at the thin end: several categories have only one or two tokenized peers,
  // and a single peer (an oracle filed under Risk Curators, a staking product filed under Chain)
  // must not set the multiple on its own. But the prior scales with the evidence: a category with
  // nine or more peers is shrunk with only PRIOR_PEERS_MIN phantom peers, so its own data speaks.
  prior_peers: 12,
  prior_peers_min: 3,
  peer_ratio_cap: 5,
  multiple_floor: 0.05,
  multiple_cap: 1.0,
  growth_floor: -50,
  growth_cap: 100,
  growth_weight: 0.5,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  breadth_per_chain: 0.015,
  breadth_cap_chains: 10,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-3';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 30;

/** One row of the calibration table: a category's multiple and the evidence behind it. */
export interface CalibrationRow {
  category: string;
  /** The multiple the model uses for this category, after shrinkage and clamping. */
  multiple: number;
  /** How many tokenized protocols in the snapshot this category's median comes from. */
  peers: number;
  /** The raw median mcap/TVL of those peers, null when the category has none. */
  peer_median: number | null;
}

/** The calibration: the global median and one row per category that appears in the snapshot. */
export interface Calibration {
  global_median: number;
  global_peers: number;
  rows: CalibrationRow[];
  /** The multiple by category, for the page's recompute. */
  by_category: Record<string, number>;
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: {
    category_multiple: number;
    category_peers: number;
    category_peer_median: number | null;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  category_multiple: number;
  category_peers: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  mcap_tvl: number | null;
}

/** Everything the dashboard needs: the board, the live set, the calibration and the model. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  above_floor_size: number;
  live_size: number;
  total_implied_usd: number;
  calibration: Calibration;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a list of numbers, or null when it holds none. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/**
 * Calibrate the mcap/TVL multiples from the snapshot's own tokenized protocols. Each category's
 * median is shrunk toward the global median with a phantom-peer prior that scales with the
 * evidence (prior_peers at the thin end, prior_peers_min once a category has many peers), then
 * clamped; a category with no tokenized peer takes the global median outright.
 */
export function calibrate(protocols: SnapshotProtocol[], model: ModelConstants): Calibration {
  const ratiosByCategory = new Map<string, number[]>();
  const allRatios: number[] = [];
  for (const p of protocols) {
    if (p.mcap_usd === null || p.tvl_usd <= 0) continue;
    const ratio = Math.min(p.mcap_usd / p.tvl_usd, model.peer_ratio_cap);
    if (!Number.isFinite(ratio) || ratio < 0) continue;
    allRatios.push(ratio);
    const key = p.category ?? 'Other';
    const list = ratiosByCategory.get(key) ?? [];
    list.push(ratio);
    ratiosByCategory.set(key, list);
  }
  const globalMedian = median(allRatios) ?? 0.2;
  const categories = new Set(protocols.map((p) => p.category ?? 'Other'));
  const rows: CalibrationRow[] = [];
  const byCategory: Record<string, number> = {};
  for (const category of [...categories].sort()) {
    const peers = ratiosByCategory.get(category) ?? [];
    const peerMedian = median(peers);
    // The prior scales with the evidence: twelve phantom peers when the category has none of its
    // own, down to the floor once it has nine or more, so a well-evidenced category's own median
    // speaks and a thin one stays near the global median.
    const prior = Math.max(model.prior_peers_min, model.prior_peers - peers.length);
    const shrunk =
      peerMedian === null
        ? globalMedian
        : (peers.length * peerMedian + prior * globalMedian) / (peers.length + prior);
    const multiple = Math.min(model.multiple_cap, Math.max(model.multiple_floor, shrunk));
    rows.push({ category, multiple: round4(multiple), peers: peers.length, peer_median: peerMedian === null ? null : round4(peerMedian) });
    byCategory[category] = round4(multiple);
  }
  return { global_median: round4(globalMedian), global_peers: allRatios.length, rows, by_category: byCategory };
}

/** The calibrated multiple for one protocol's category, from the calibration table. */
function multipleFor(p: SnapshotProtocol, calibration: Calibration): number {
  return calibration.by_category[p.category ?? 'Other'] ?? calibration.global_median;
}

/** The three multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  calibration: Calibration,
): { implied: number; multiple: number; growthPct: number; growthMult: number; maturityMult: number; breadthMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const multiple = multipleFor(protocol, calibration);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const extraChains = Math.min(Math.max(protocol.chains.length - 1, 0), model.breadth_cap_chains);
  const breadthMult = 1 + extraChains * model.breadth_per_chain;
  const base = protocol.tvl_usd * multiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * breadthMult));
  return { implied, multiple, growthPct, growthMult, maturityMult, breadthMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** Categories that mark a protocol as another protocol's product, not a standalone launch candidate. */
const PRODUCT_CATEGORY = /(bridge|wrapper|staking|restak)/i;

/** Names that mark a product of another protocol rather than a standalone one. */
const PRODUCT_NAME = /(staked|wrapped|bridge)/i;

/** Whether a protocol is a standalone launch candidate: rankable, and neither its category nor its
 * name marks it as another protocol's product. */
export function isStandalone(p: SnapshotProtocol): boolean {
  return isRankable(p) && !PRODUCT_CATEGORY.test(p.category ?? '') && !PRODUCT_NAME.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; calibration: Calibration } {
  const calibration = calibrate(snapshot.protocols, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug it names.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every rankable pre-token protocol below the watchlist floor, not just the
  // largest few. A chosen protocol stays chosen.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd) chosen.set(p.slug, p);
  }
  // Above the floor, the watchlist already filtered: add only the standalone protocols it missed.
  // A bridge, a wrapped asset or a staking receipt above the floor stays out — the watchlist left
  // it out for that reason — but a standalone protocol the watchlist missed is exactly what a
  // radar is for.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isStandalone(p) && p.tvl_usd >= snapshot.floor_usd) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const { implied, multiple, growthPct, growthMult, maturityMult, breadthMult, age } = impliedValue(p, snapshot.as_of, model, calibration);
    const cal = calibration.rows.find((r) => r.category === (p.category ?? 'Other'));
    return { p, implied, multiple, growthPct, growthMult, maturityMult, breadthMult, age, peers: cal?.peers ?? 0, peerMedian: cal?.peer_median ?? null };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const watchlist = new Set(snapshot.watchlist);
  const board = scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token' as const,
    watchlist: watchlist.has(s.p.slug),
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      category_multiple: round4(s.multiple),
      category_peers: s.peers,
      category_peer_median: s.peerMedian,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      breadth_multiplier: round4(s.breadthMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age, i + 1, scored.length).map(stepText),
  }));
  return { board, calibration };
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** Chains where a transaction typically costs under a dollar, for the gas guidance. */
const CHEAP_CHAINS = new Set([
  'Arbitrum', 'Optimism', 'Base', 'BSC', 'Polygon', 'Solana', 'Avalanche', 'Blast', 'Linea', 'Scroll',
  'zkSync Era', 'Mantle', 'Mode', 'Berachain', 'Sui', 'Aptos', 'Sei', 'Hyperliquid', 'Abstract', 'Unichain',
]);

/** The gas line for a chain: cheap rollups and alt-L1s cost far less than Ethereum mainnet. */
function gasFor(chain: string): string {
  if (chain === 'Ethereum') return 'about $5 to $15 of gas on Ethereum mainnet';
  if (CHEAP_CHAINS.has(chain)) return 'under $1 of gas on this chain';
  return 'a few dollars of gas';
}

/** The weekly gas line: the same chain's cost, for a week of qualifying actions. */
function weeklyGasFor(chain: string): string {
  if (chain === 'Ethereum') return 'about $5 to $15 of gas a week';
  if (CHEAP_CHAINS.has(chain)) return 'under $1 of gas a week';
  return 'a few dollars of gas a week';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The seven-day TVL move, as advice a farmer can act on — only when the move is large. */
function growthNote(p: SnapshotProtocol): string | null {
  const g = p.change_7d;
  if (g === null) return null;
  if (g <= -10) return `TVL fell ${Math.abs(g).toFixed(1)}% in the last 7 days, so start with half the capital below and add the rest only if the fall stops.`;
  if (g >= 10) return `TVL grew ${g.toFixed(1)}% in the last 7 days, so enter before the next snapshot counts the inflow.`;
  return null;
}

/** The setup step: the chain, its gas, and where to start when the protocol runs on several. */
function setupFor(p: SnapshotProtocol, chain: string): string {
  const extra =
    p.chains.length > 1
      ? ` It also runs on ${p.chains.length - 1} other chain${p.chains.length - 1 === 1 ? '' : 's'}; start on ${chain} first.`
      : '';
  return `Set up a fresh wallet on ${chain} and fund it with the chain's gas token plus the capital below, keeping the seed phrase offline.${extra}`;
}

/** The category's main action, in words a farmer can follow. The action is the category's own
 * mechanic — supply, liquidity, margin, a vote — never a named product the snapshot does not
 * carry: the snapshot has no product data, so the plan names none. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('risk curator') || c.includes('capital allocator') || c.includes('curator') || c.includes('allocator')) {
    return `Allocate $${capital} of USDC through ${name} on ${chain} and hold the position.`;
  }
  if (c.includes('rwa')) return `Buy $${capital} of ${name}'s tokenized real-world asset on ${chain} and hold it.`;
  if (c.includes('basis')) return `Deposit $${capital} of USDC into a basis position on ${name} (${chain}) and keep it open.`;
  if (c === 'chain') return `Bridge $${capital} of USDC to ${name} and use it in two of the chain's own apps.`;
  if (c.includes('cedefi')) return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex')) return `Provide $${capital} of liquidity to ${name} on ${chain} and keep the position open.`;
  if (c.includes('yield aggregator') || c.includes('yield')) return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
  if (c.includes('leveraged farm')) return `Open a $${capital} leveraged farm on ${name} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('liquid restaking') || c.includes('restak')) return `Restake $${capital} of the staking asset through ${name} on ${chain} and keep the receipt token.`;
  if (c.includes('liquid staking') || c.includes('staking')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('stablecoin wrapper') || c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('payment')) return `Move $${capital} through ${name} on ${chain} and keep a balance in its app.`;
  if (c.includes('governance')) return `Lock $${capital} in ${name} on ${chain} and vote on one proposal.`;
  if (c.includes('option')) return `Deposit $${capital} of USDC as collateral on ${name} and open one small options position.`;
  if (c.includes('farm')) return `Stake $${capital} of LP tokens in ${name} on ${chain} and keep the position open.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The weekly qualifying action, fitted to the category. */
function weeklyFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('dex') || c.includes('yield')) return 'Make one qualifying action each week, such as a deposit, a swap, a harvest or a re-stake.';
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'Make one qualifying action each week, such as a supply, a borrow, a repay or a collateral top-up.';
  if (c.includes('risk curator') || c.includes('capital allocator') || c.includes('curator') || c.includes('allocator')) return 'Make one qualifying action each week, such as an allocation, a top-up or a position review.';
  if (c.includes('bridge')) return 'Make one qualifying action each week, such as a bridge, a swap or a deposit on the destination chain.';
  if (c.includes('governance')) return 'Make one qualifying action each week, such as a vote, a delegation or a forum post.';
  if (c.includes('prediction')) return 'Make one qualifying action each week, such as a trade, a limit order or a market resolution check.';
  if (c.includes('perpetual') || c.includes('derivative')) return 'Make one qualifying action each week, such as a trade, a margin adjustment or a funding check.';
  return 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.';
}

/** The exit step: how to unwind this category's position, and where to claim safely. */
function exitFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  const claim = 'and claim rewards only from the link the protocol itself publishes.';
  if (c.includes('dex')) return `Remove the liquidity, claim any trading fees, ${claim}`;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Repay any borrow first, then withdraw the supply, ${claim}`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('option')) return `Close every open position, then withdraw the margin or collateral, ${claim}`;
  if (c.includes('liquid staking') || c.includes('staking') || c.includes('restak')) return `Unstake, wait out any unbonding period, then withdraw, ${claim}`;
  if (c.includes('bridge')) return `Bridge the funds back to the chain you started on, ${claim}`;
  if (c.includes('governance')) return `Unlock the position after the vote closes, ${claim}`;
  if (c.includes('risk curator') || c.includes('capital allocator') || c.includes('curator') || c.includes('allocator')) return `Withdraw the allocation, ${claim}`;
  return `Withdraw the position from the protocol's own page, ${claim}`;
}

/** The hold step: the window, and why a young protocol's early activity counts most. */
function holdFor(age: number | null, hold: number): string {
  const base = `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`;
  if (age !== null && age < 180) return `${base} This protocol is under six months old, so early activity usually counts most.`;
  return base;
}

/** The review step: log the position and re-check the protocol's rank before adding capital. */
function reviewFor(rank: number, boardSize: number): string {
  return `Write the wallet, the dates and every transaction in a farm log, and re-check the protocol's TVL and rank (${rank} of ${boardSize} by implied value) before adding capital or exiting early.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age, seven-day move and rank), never
 * from a hand-written list of names — and it names no product the snapshot does not carry.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, rank: number, boardSize: number): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const note = growthNote(p);
  const entry = note === null ? actionFor(p, capital, chain) : `${actionFor(p, capital, chain)} ${note}`;
  return [
    {
      text: setupFor(p, chain),
      cost: `${gasFor(chain)} for the first transactions`,
      time: '10 minutes',
    },
    {
      text: entry,
      cost: `$${capital} of capital and ${gasFor(chain)}`,
      time: '15 minutes to set up',
    },
    {
      text: weeklyFor(p),
      cost: weeklyGasFor(chain),
      time: '10 minutes a week',
    },
    {
      text: holdFor(age, hold),
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: exitFor(p),
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: reviewFor(rank, boardSize),
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      mcap_tvl: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    watchlist: row.watchlist,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    category_multiple: row.model.category_multiple,
    category_peers: row.model.category_peers,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const { board, calibration } = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !r.watchlist).length;
  const aboveFloor = board.filter((r) => !r.watchlist && r.tvl_usd >= snapshot.floor_usd).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    above_floor_size: aboveFloor,
    live_size: live.length,
    total_implied_usd: board.reduce((n, r) => n + r.implied_value_usd, 0),
    calibration,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
