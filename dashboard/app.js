// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and renders
// the ranked board, a filterable table, a per-protocol detail drawer with the model's own inputs and
// the protocol's farm plan, a live-token view, the calibration table and a model sandbox that
// recomputes the board from the same arithmetic. No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var MODEL = DATA.model;
  var DEFAULT_SANDBOX = { multipleScale: 1, growthWeight: MODEL.growth_weight, breadth: true };
  var state = {
    q: '', category: 'all', chain: 'all', watchlistOnly: false, tab: 'board',
    sort: 'implied', dir: -1, selected: null, sandbox: { multipleScale: 1, growthWeight: MODEL.growth_weight, breadth: true }
  };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return n.toFixed(2) + 'x';
  }

  // The model in one function: the page recomputes a row from the snapshot figures, so the page's
  // code and the board's data are visibly the same arithmetic, and the sandbox re-ranks live.
  function impliedOf(row, sb) {
    var growth = Math.min(MODEL.growth_cap, Math.max(MODEL.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * sb.growthWeight;
    var age = row.age_days === null || row.age_days === undefined ? MODEL.unknown_age_days : row.age_days;
    var maturity = MODEL.maturity_floor + (Math.min(Math.max(age, 0), MODEL.maturity_days) / MODEL.maturity_days) * MODEL.maturity_range;
    var breadth = 1;
    if (sb.breadth) {
      var extra = Math.min(Math.max((row.chains || []).length - 1, 0), MODEL.breadth_cap_chains);
      breadth = 1 + extra * MODEL.breadth_per_chain;
    }
    var multiple = row.category_multiple * sb.multipleScale;
    return Math.max(1, Math.round(row.tvl_usd * multiple * growthMult * maturity * breadth));
  }
  function sandboxActive() {
    var s = state.sandbox;
    return s.multipleScale !== DEFAULT_SANDBOX.multipleScale || s.growthWeight !== DEFAULT_SANDBOX.growthWeight || s.breadth !== DEFAULT_SANDBOX.breadth;
  }
  // The rows as the board shows them: the submitted ranks and values, or the sandbox's recompute.
  function effectiveRows() {
    if (!sandboxActive()) return DATA.rows.map(function (r) { return { row: r, implied: r.implied_value_usd, rank: r.rank }; });
    var scored = DATA.rows.map(function (r) { return { row: r, implied: impliedOf(r, state.sandbox), rank: 0 }; });
    scored.sort(function (a, b) { return b.implied - a.implied || (a.row.slug < b.row.slug ? -1 : a.row.slug > b.row.slug ? 1 : 0); });
    scored.forEach(function (s, i) { s.rank = i + 1; });
    return scored;
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL, age,
  // the seven-day move and the rank decide the action, the capital, the hold and every cost and
  // time. No name is special-cased, and no product the snapshot does not carry is named.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  var CHEAP_CHAINS = { Arbitrum: 1, Optimism: 1, Base: 1, BSC: 1, Polygon: 1, Solana: 1, Avalanche: 1, Blast: 1, Linea: 1, Scroll: 1, 'zkSync Era': 1, Mantle: 1, Mode: 1, Berachain: 1, Sui: 1, Aptos: 1, Sei: 1, Hyperliquid: 1, Abstract: 1, Unichain: 1 };
  function gasFor(chain) {
    if (chain === 'Ethereum') return 'about $5 to $15 of gas on Ethereum mainnet';
    if (CHEAP_CHAINS[chain]) return 'under $1 of gas on this chain';
    return 'a few dollars of gas';
  }
  function weeklyGasFor(chain) {
    if (chain === 'Ethereum') return 'about $5 to $15 of gas a week';
    if (CHEAP_CHAINS[chain]) return 'under $1 of gas a week';
    return 'a few dollars of gas a week';
  }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function growthNote(p) {
    var g = p.change_7d;
    if (g === null || g === undefined) return null;
    if (g <= -10) return 'TVL fell ' + Math.abs(g).toFixed(1) + '% in the last 7 days, so start with half the capital below and add the rest only if the fall stops.';
    if (g >= 10) return 'TVL grew ' + g.toFixed(1) + '% in the last 7 days, so enter before the next snapshot counts the inflow.';
    return null;
  }
  function setupFor(p, chain) {
    var extra = p.chains && p.chains.length > 1 ? ' It also runs on ' + (p.chains.length - 1) + ' other chain' + (p.chains.length - 1 === 1 ? '' : 's') + '; start on ' + chain + ' first.' : '';
    return "Set up a fresh wallet on " + chain + " and fund it with the chain's gas token plus the capital below, keeping the seed phrase offline." + extra;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('risk curator') >= 0 || c.indexOf('capital allocator') >= 0 || c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Allocate $' + capital + ' of USDC through ' + name + ' on ' + chain + ' and hold the position.';
    if (c.indexOf('rwa') >= 0) return 'Buy $' + capital + " of " + name + "'s tokenized real-world asset on " + chain + ' and hold it.';
    if (c.indexOf('basis') >= 0) return 'Deposit $' + capital + ' of USDC into a basis position on ' + name + ' (' + chain + ') and keep it open.';
    if (c === 'chain') return 'Bridge $' + capital + ' of USDC to ' + name + " and use it in two of the chain's own apps.";
    if (c.indexOf('cedefi') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('yield aggregator') >= 0 || c.indexOf('yield') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('leveraged farm') >= 0) return 'Open a $' + capital + ' leveraged farm on ' + name + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('liquid restaking') >= 0 || c.indexOf('restak') >= 0) return 'Restake $' + capital + ' of the staking asset through ' + name + ' on ' + chain + ' and keep the receipt token.';
    if (c.indexOf('liquid staking') >= 0 || c.indexOf('staking') >= 0) return 'Stake $' + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('stablecoin wrapper') >= 0 || c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('payment') >= 0) return 'Move $' + capital + ' through ' + name + ' on ' + chain + ' and keep a balance in its app.';
    if (c.indexOf('governance') >= 0) return 'Lock $' + capital + ' in ' + name + ' on ' + chain + ' and vote on one proposal.';
    if (c.indexOf('option') >= 0) return 'Deposit $' + capital + ' of USDC as collateral on ' + name + ' and open one small options position.';
    if (c.indexOf('farm') >= 0) return 'Stake $' + capital + ' of LP tokens in ' + name + ' on ' + chain + ' and keep the position open.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function weeklyFor(p) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0) return 'Make one qualifying action each week, such as a deposit, a swap, a harvest or a re-stake.';
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Make one qualifying action each week, such as a supply, a borrow, a repay or a collateral top-up.';
    if (c.indexOf('risk curator') >= 0 || c.indexOf('capital allocator') >= 0 || c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Make one qualifying action each week, such as an allocation, a top-up or a position review.';
    if (c.indexOf('bridge') >= 0) return 'Make one qualifying action each week, such as a bridge, a swap or a deposit on the destination chain.';
    if (c.indexOf('governance') >= 0) return 'Make one qualifying action each week, such as a vote, a delegation or a forum post.';
    if (c.indexOf('prediction') >= 0) return 'Make one qualifying action each week, such as a trade, a limit order or a market resolution check.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Make one qualifying action each week, such as a trade, a margin adjustment or a funding check.';
    return 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.';
  }
  function exitFor(p) {
    var c = (p.category || '').toLowerCase();
    var claim = 'and claim rewards only from the link the protocol itself publishes.';
    if (c.indexOf('dex') >= 0) return 'Remove the liquidity, claim any trading fees, ' + claim;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Repay any borrow first, then withdraw the supply, ' + claim;
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('option') >= 0) return 'Close every open position, then withdraw the margin or collateral, ' + claim;
    if (c.indexOf('liquid staking') >= 0 || c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Unstake, wait out any unbonding period, then withdraw, ' + claim;
    if (c.indexOf('bridge') >= 0) return 'Bridge the funds back to the chain you started on, ' + claim;
    if (c.indexOf('governance') >= 0) return 'Unlock the position after the vote closes, ' + claim;
    if (c.indexOf('risk curator') >= 0 || c.indexOf('capital allocator') >= 0 || c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Withdraw the allocation, ' + claim;
    return "Withdraw the position from the protocol's own page, " + claim;
  }
  function holdFor(age, hold) {
    var base = 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.';
    if (age !== null && age !== undefined && age < 180) return base + ' This protocol is under six months old, so early activity usually counts most.';
    return base;
  }
  function reviewFor(rank, boardSize) {
    return "Write the wallet, the dates and every transaction in a farm log, and re-check the protocol's TVL and rank (" + rank + ' of ' + boardSize + ' by implied value) before adding capital or exiting early.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var note = growthNote(p);
    var entry = note === null ? actionFor(p, capital, chain) : actionFor(p, capital, chain) + ' ' + note;
    return [
      { text: setupFor(p, chain), cost: gasFor(chain) + ' for the first transactions', time: '10 minutes' },
      { text: entry, cost: '$' + capital + ' of capital and ' + gasFor(chain), time: '15 minutes to set up' },
      { text: weeklyFor(p), cost: weeklyGasFor(chain), time: '10 minutes a week' },
      { text: holdFor(p.age_days, hold), cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: exitFor(p), cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: reviewFor(p.rank, DATA.board_size), cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('wl') === '1') state.watchlistOnly = true;
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tab !== 'board') params.set('tab', state.tab);
    if (state.watchlistOnly) params.set('wl', '1');
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    return effectiveRows().filter(function (s) {
      var r = s.row;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.watchlistOnly && !r.watchlist) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.row.name.toLowerCase(); bv = b.row.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.row.tvl_usd; bv = b.row.tvl_usd; }
      else if (key === 'growth') { av = a.row.change_7d === null ? -Infinity : a.row.change_7d; bv = b.row.change_7d === null ? -Infinity : b.row.change_7d; }
      else if (key === 'age') { av = a.row.age_days === null ? Infinity : a.row.age_days; bv = b.row.age_days === null ? Infinity : b.row.age_days; }
      else if (key === 'multiple') { av = a.row.category_multiple; bv = b.row.category_multiple; }
      else { av = a.implied; bv = b.implied; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.row.slug < b.row.slug ? -1 : a.row.slug > b.row.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols the watchlist does not name, including ' + DATA.above_floor_size + ' above that floor that the watchlist missed. Implied value is calibrated from the market caps of protocols that already trade, and it is a model, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows beyond the watchlist' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) })),
        el('div', { class: 'fact total' }, el('span', { text: 'Total implied value' }), el('b', { text: fmtUsd(DATA.total_implied_usd) }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    var wlBox = el('input', { type: 'checkbox', id: 'wl', checked: state.watchlistOnly ? 'checked' : null });
    wlBox.addEventListener('change', function () { state.watchlistOnly = wlBox.checked; writeHash(); render(); });
    function tabButton(tab, label) {
      return el('button', { type: 'button', 'aria-pressed': state.tab === tab ? 'true' : 'false', text: label, onclick: function () { state.tab = tab; writeHash(); render(); } });
    }
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('label', { class: 'check', for: 'wl' }, wlBox, 'Watchlist only'),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'View' }), el('div', { class: 'tabs' }, tabButton('board', 'Pre-token'), tabButton('live', 'Live token'), tabButton('calibration', 'Calibration'))),
      el('span', { class: 'count', text: state.tab === 'board' ? filtered().length + ' rows shown' + (sandboxActive() ? ' (sandbox)' : '') : state.tab === 'live' ? DATA.live.length + ' live-token protocols' : DATA.calibration.rows.length + ' categories calibrated' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(filtered());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchlistOnly = false; writeHash(); render(); } })
      ));
    }
    var max = 1;
    list.forEach(function (s) { if (s.implied > max) max = s.implied; });
    var tbody = el('tbody');
    list.forEach(function (s) {
      var r = s.row;
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(s.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('span', null, el('b', { text: r.name }), r.watchlist ? el('span', { class: 'tag watch', text: 'watchlist' }) : null),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') + (r.chains && r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: fmtMult(r.category_multiple) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((s.implied / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(s.implied) })
        )),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('multiple', 'Multiple'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', {
        tabindex: '0',
        onclick: function () { openLiveDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLiveDetail(r.slug); } }
      },
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: fmtMult(r.mcap_tvl) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking, and their mcap/TVL multiples calibrate it.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Mcap / TVL' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function calibrationTable() {
    var rows = DATA.calibration.rows.slice().sort(function (a, b) { return b.multiple - a.multiple || (a.category < b.category ? -1 : 1); });
    var tbody = el('tbody');
    rows.forEach(function (c) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('b', { text: c.category })),
        el('td', { class: 'num', text: String(c.peers) }),
        el('td', { class: 'num', text: c.peer_median === null ? 'none' : fmtMult(c.peer_median) }),
        el('td', { class: 'num', text: fmtMult(c.multiple) })
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Each category\'s multiple is the median mcap/TVL of the snapshot\'s tokenized protocols in it (peer ratios capped at ' + MODEL.peer_ratio_cap + 'x before the median, so a micro-TVL outlier cannot set it), shrunk toward the global median of ' + fmtMult(DATA.calibration.global_median) + ' (' + DATA.calibration.global_peers + ' tokenized protocols) with up to ' + MODEL.prior_peers + ' phantom peers (fewer as a category\'s own peers grow, at least ' + MODEL.prior_peers_min + '), then clamped to ' + fmtMult(MODEL.multiple_floor) + '..' + fmtMult(MODEL.multiple_cap) + '. A category with no tokenized peer takes the global median.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'Tokenized peers' }), el('th', { scope: 'col', text: 'Peer median mcap / TVL' }), el('th', { scope: 'col', text: 'Multiple used' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = MODEL;
    var sb = state.sandbox;
    function slider(id, label, min, max, step, value, fmt, oninput) {
      var input = el('input', { type: 'range', id: id, min: String(min), max: String(max), step: String(step), value: String(value) });
      input.addEventListener('input', function () { oninput(parseFloat(input.value)); render(); });
      var out = el('b', { text: fmt(value) });
      input.addEventListener('input', function () { out.textContent = fmt(parseFloat(input.value)); });
      return el('div', { class: 'slider' }, el('label', { for: id }, el('span', { text: label }), out), input);
    }
    var breadthBox = el('input', { type: 'checkbox', id: 'breadth', checked: sb.breadth ? 'checked' : null });
    breadthBox.addEventListener('change', function () { state.sandbox.breadth = breadthBox.checked; render(); });
    var reset = el('button', { class: 'button', type: 'button', text: 'Reset the sandbox', onclick: function () { state.sandbox = { multipleScale: 1, growthWeight: MODEL.growth_weight, breadth: true }; render(); } });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x category_multiple x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x (1 + min(chains - 1, ' + m.breadth_cap_chains + ') x ' + m.breadth_per_chain + ') )'
      ),
      el('p', { class: 'sub', text: 'The category multiple is calibrated, not assumed: the median mcap/TVL of the tokenized protocols in the same category, shrunk toward the global median of ' + fmtMult(DATA.calibration.global_median) + ' with up to ' + m.prior_peers + ' phantom peers (fewer as a category\'s own peers grow, at least ' + m.prior_peers_min + ') and clamped to ' + fmtMult(m.multiple_floor) + '..' + fmtMult(m.multiple_cap) + '. The growth, maturity and breadth factors are assumptions, stated here: only the multiple is calibrated from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token on record; an unlisted age uses ' + m.unknown_age_days + ' days. The Calibration view shows every multiple and its evidence.' }),
      el('div', { class: 'sandbox' },
        el('h3', null, 'Model sandbox', sandboxActive() ? el('span', { class: 'badge', text: ' active: the board is re-ranked' }) : null),
        el('p', { class: 'sub', text: 'Change the model and watch the board re-rank live, from the same arithmetic. The submitted board keeps the default values.' }),
        el('div', { class: 'sliders' },
          slider('sb-mult', 'Multiple scale', 0.5, 2, 0.05, sb.multipleScale, function (v) { return v.toFixed(2) + 'x'; }, function (v) { state.sandbox.multipleScale = v; }),
          slider('sb-growth', 'Growth weight', 0, 1, 0.05, sb.growthWeight, function (v) { return v.toFixed(2); }, function (v) { state.sandbox.growthWeight = v; }),
          el('div', { class: 'slider' }, el('label', { for: 'breadth' }, el('span', { text: 'Breadth adjustment (multi-chain)' }), el('b', { text: sb.breadth ? 'on' : 'off' })), el('label', { class: 'check' }, breadthBox, 'Count extra chains'))
        ),
        reset
      )
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var recomputed = impliedOf(row, state.sandbox);
    var cal = DATA.calibration.rows.filter(function (c) { return c.category === (row.category || 'Other'); })[0];
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.watchlist ? ' - watchlist' : ' - early radar') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Category multiple (' + (row.category || 'Other') + ')' }), el('b', { class: 'num', text: fmtMult(row.category_multiple) })),
        el('div', null, el('span', { text: 'Tokenized peers in category' }), el('b', { class: 'num', text: String(row.category_peers) + (cal && cal.peer_median !== null ? ' (peer median ' + fmtMult(cal.peer_median) + ')' : ' (global median used)') })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Age with no token on record' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Breadth multiplier (' + (row.chains || []).length + ' chains)' }), el('b', { class: 'num', text: String(row.breadth_multiplier) })),
        el('div', { class: 'total-row' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ' under the sandbox settings; the board carries ' + fmtUsd(row.implied_value_usd) + '.') + ' This is an estimate, not a price, and the protocol records no token: the record is not proof it has none.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function openLiveDetail(slug) {
    var row = DATA.live.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Live token - set aside from the ranking' }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Market value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Market cap' }), el('b', { class: 'num', text: fmtUsd(row.mcap_usd) })),
        el('div', null, el('span', { text: 'Mcap / TVL' }), el('b', { class: 'num', text: fmtMult(row.mcap_tvl) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) }))
      ),
      el('p', { class: 'sub', text: 'This protocol already trades, so its market cap is a fact, not a model: it is set aside from the pre-token ranking, and its mcap/TVL multiple helps calibrate the category multiples the board is ranked on.' })
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function footer() {
    return el('p', { class: 'foot', text: 'Method: the board ranks ' + DATA.board_size + ' protocols that record no token by an implied value calibrated from the ' + DATA.calibration.global_peers + ' tokenized protocols in the same snapshot (global median mcap/TVL ' + fmtMult(DATA.calibration.global_median) + '), adjusted for seven-day TVL growth, age with no token on record and chain breadth. The snapshot is DefiLlama data as of ' + DATA.as_of + '; it records no token for these protocols, which is not proof none exists. Implied value is the entry\'s own model, never a price, and no protocol is predicted to issue a token.' });
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    if (state.tab === 'live') shell.appendChild(liveTable());
    else if (state.tab === 'calibration') shell.appendChild(calibrationTable());
    else shell.appendChild(boardTable());
    if (state.tab === 'board') shell.appendChild(modelPanel());
    shell.appendChild(footer());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) {
      if (DATA.rows.some(function (r) { return r.slug === state.selected; })) openDetail(state.selected);
      else if (DATA.live.some(function (r) { return r.slug === state.selected; })) openLiveDetail(state.selected);
    }
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
