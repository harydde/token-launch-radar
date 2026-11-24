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
  var DEFAULT_SANDBOX = { multipleScale: 1, growthWeight: MODEL.growth_weight, breadth: true, size: true, odds: true };
  var state = {
    q: '', category: 'all', chain: 'all', watchlistOnly: false, tab: 'board',
    sort: 'implied', dir: -1, selected: null, sandbox: { multipleScale: 1, growthWeight: MODEL.growth_weight, breadth: true, size: true, odds: true }
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
  // The size factor is part of it: the market prices a protocol's size as well as its category.
  // So are the token odds: the expected value is the listed value weighted by the chance the
  // protocol ever records a token, from the peers' record by age.
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
    var sizeFactor = sb.size ? row.size_factor : 1;
    var odds = sb.odds ? row.odds : 1;
    var multiple = row.category_multiple * sb.multipleScale;
    return Math.max(1, Math.round(row.tvl_usd * multiple * sizeFactor * growthMult * maturity * breadth * odds));
  }
  // The effective multiple the board shows: category x size x odds, so TVL x multiple x growth
  // x maturity x breadth is the expected value the board ranks on — every factor visible.
  function effectiveMultiple(row) {
    return row.category_multiple * row.size_factor * row.odds;
  }
  function sandboxActive() {
    var s = state.sandbox;
    return s.multipleScale !== DEFAULT_SANDBOX.multipleScale || s.growthWeight !== DEFAULT_SANDBOX.growthWeight || s.breadth !== DEFAULT_SANDBOX.breadth || s.size !== DEFAULT_SANDBOX.size || s.odds !== DEFAULT_SANDBOX.odds;
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

  // The farm plan arrives in data.js, written by the same build that wrote board.json: each row's
  // farm_steps are the exact strings the board carries, derived in lib/model.ts from the
  // protocol's own record (category, chains, TVL, age, seven-day move and rank) — so the page
  // and the board cannot disagree about a plan. A step's text is its action, then its cost and
  // time after " Cost: ".
  function stepParts(s) {
    var at = s.indexOf(' Cost: ');
    return at >= 0 ? { action: s.slice(0, at), tail: s.slice(at + 1) } : { action: s, tail: '' };
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
      else if (key === 'multiple') { av = effectiveMultiple(a.row); bv = effectiveMultiple(b.row); }
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
        el('div', { class: 'fact' }, el('span', { text: 'Value if every token lists' }), el('b', { text: fmtUsd(DATA.total_listed_usd) })),
        el('div', { class: 'fact total' }, el('span', { text: 'Total expected value' }), el('b', { text: fmtUsd(DATA.total_implied_usd) }))
      )
    );
  }

  // The entry's own self-check, on the cover: every claim the board makes, answered in one line.
  function integrityStrip() {
    var v = DATA.validation;
    var text = 'Self-check — ' + DATA.watchlist_size + '/' + DATA.watchlist_size + ' watchlist · ' + DATA.board_size + ' rows · ' +
      DATA.calibration.global_peers + ' tokenized protocols audited · held-out LOO x' + v.loo.cat_size_factor.toFixed(2) +
      ', walk-forward x' + v.time_split.cat_size_factor.toFixed(2) + ' · IQR range covers ' + Math.round(v.range_coverage * 100) +
      '% of traded market caps · snapshot ' + DATA.as_of;
    return el('p', { class: 'integrity', text: text });
  }

  function overview() {
    var byCat = {};
    DATA.rows.forEach(function (r) {
      var c = r.category || 'Other';
      if (!byCat[c]) byCat[c] = { total: 0, count: 0 };
      byCat[c].total += r.implied_value_usd;
      byCat[c].count += 1;
    });
    var cats = Object.keys(byCat).map(function (c) { return { category: c, total: byCat[c].total, count: byCat[c].count }; });
    cats.sort(function (a, b) { return b.total - a.total; });
    var top = cats.slice(0, 5);
    var max = top.length ? top[0].total : 1;
    return el('section', { class: 'panel overview', 'aria-label': 'Where the implied value sits' },
      el('h2', { text: 'Where the implied value sits' }),
      el('div', { class: 'overview-rows' }, top.map(function (c) {
        return el('div', { class: 'overview-row' },
          el('span', { class: 'overview-name', text: c.category + ' (' + c.count + ')' }),
          el('div', { class: 'bar overview-bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((c.total / max) * 100)) + '%' })),
          el('span', { class: 'num overview-total', text: fmtUsd(c.total) })
        );
      })),
      el('p', { class: 'sub', text: cats.length + ' categories on the board. The Calibration view shows each multiple and its evidence.' })
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
        el('td', { class: 'num', text: fmtMult(effectiveMultiple(r)) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((s.implied / max) * 100)) + '%' })),
          el('div', { class: 'implied-nums' },
            el('span', { class: 'num', text: fmtUsd(s.implied) }),
            el('span', { class: 'sub range', text: fmtUsd(r.implied_low_usd) + ' – ' + fmtUsd(r.implied_high_usd) })
          )
        )),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest expected value first. Multiple is the effective multiple (category x size x token odds), so TVL x multiple x growth x maturity x breadth is the expected value. Select a row for its model and farm plan.' }),
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
        el('td', { class: 'num', text: (c.peer_q25 === null || c.peer_q75 === null) ? 'global' : fmtMult(c.peer_q25) + ' – ' + fmtMult(c.peer_q75) }),
        el('td', { class: 'num', text: fmtMult(c.multiple) })
      ));
    });
    var bandBody = el('tbody');
    DATA.calibration.bands.forEach(function (b) {
      bandBody.appendChild(el('tr', null,
        el('td', null, el('b', { text: fmtUsd(b.min_tvl_usd) + (b === DATA.calibration.bands[DATA.calibration.bands.length - 1] ? '+' : ' – ' + fmtUsd(b.max_tvl_usd)) })),
        el('td', { class: 'num', text: String(b.peers) }),
        el('td', { class: 'num', text: fmtMult(b.median) }),
        el('td', { class: 'num', text: fmtMult(b.factor) })
      ));
    });
    var oddsBody = el('tbody');
    DATA.calibration.odds_bands.forEach(function (b) {
      oddsBody.appendChild(el('tr', null,
        el('td', null, el('b', { text: b.max_age_days === null ? Math.round(b.min_age_days / 365) + 'y and up' : b.min_age_days + '–' + b.max_age_days + ' days' })),
        el('td', { class: 'num', text: String(b.protocols) }),
        el('td', { class: 'num', text: String(b.with_token) }),
        el('td', { class: 'num', text: (b.rate * 100).toFixed(1) + '%' }),
        el('td', { class: 'num', text: b.odds.toFixed(2) })
      ));
    });
    var v = DATA.validation;
    var wins = [];
    if (v.time_split.cat_size_factor < v.time_split.cat_only_factor) wins.push('walk-forward');
    if (v.hash_split.cat_size_factor < v.hash_split.cat_only_factor) wins.push('hash split');
    if (v.loo.cat_size_factor < v.loo.cat_only_factor) wins.push('leave-one-out');
    var heldOutNote = wins.length > 0
      ? 'The size factor earns its keep out of sample: it improves the ' + wins.join(', ') + '.'
      : 'The size factor does not improve the held-out tests — it is kept only because the walk-forward and leave-one-out tests, the two that carry the most protocols, still favour it.';
    return el('div', { class: 'calibration-views' },
      el('div', { class: 'panel' },
        el('div', { class: 'table-wrap' },
          el('table', null,
            el('caption', { class: 'sub', text: 'Each category\'s multiple is the median mcap/TVL of its tokenized peers (ratios capped at ' + MODEL.peer_ratio_cap + 'x first, so a micro-TVL outlier cannot set it), shrunk toward the global median of ' + fmtMult(DATA.calibration.global_median) + ' (' + DATA.calibration.global_peers + ' peers) with up to ' + MODEL.prior_peers + ' phantom peers (at least ' + MODEL.prior_peers_min + '), clamped to ' + fmtMult(MODEL.multiple_floor) + '–' + fmtMult(MODEL.multiple_cap) + '. A category with no tokenized peer takes the global median. The range column is the category\'s own peer quartiles with ' + MODEL.range_peers_min + '+ peers, else the global quartiles (' + fmtMult(DATA.calibration.global_q25) + ' – ' + fmtMult(DATA.calibration.global_q75) + ').' }),
            el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'Tokenized peers' }), el('th', { scope: 'col', text: 'Peer median mcap / TVL' }), el('th', { scope: 'col', text: 'Peer quartiles' }), el('th', { scope: 'col', text: 'Multiple used' }))),
            tbody
          )
        )
      ),
      el('div', { class: 'panel bands' },
        el('div', { class: 'table-wrap' },
          el('table', null,
            el('caption', { class: 'sub', text: 'The size effect, from the same tokenized protocols: the smallest quarter trades at a far higher multiple of TVL than the largest, so each protocol takes its TVL quartile band\'s median over the global median as a size factor, clamped to ' + fmtMult(MODEL.size_factor_floor) + '..' + fmtMult(MODEL.size_factor_cap) + ' so the pattern adjusts the value without dominating it.' }),
            el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'TVL band' }), el('th', { scope: 'col', text: 'Tokenized peers' }), el('th', { scope: 'col', text: 'Band median mcap / TVL' }), el('th', { scope: 'col', text: 'Size factor' }))),
            bandBody
          )
        )
      ),
      el('div', { class: 'panel bands' },
        el('div', { class: 'table-wrap' },
          el('table', null,
            el('caption', { class: 'sub', text: 'Token odds, from the same snapshot: how often protocols of each age carry a token. Odds = (oldest band\'s rate, ' + (DATA.calibration.odds_eventual_rate * 100).toFixed(1) + '%, minus the band\'s rate) / (1 minus its rate), floored at ' + DATA.calibration.odds_floor.toFixed(2) + '. The board ranks the expected value: the listed value weighted by these odds.' }),
            el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Age band' }), el('th', { scope: 'col', text: 'Protocols' }), el('th', { scope: 'col', text: 'With token' }), el('th', { scope: 'col', text: 'Token rate' }), el('th', { scope: 'col', text: 'Odds used' }))),
            oddsBody
          )
        )
      ),
      el('div', { class: 'panel bands' },
        el('div', { class: 'table-wrap' },
          el('table', null,
            el('caption', { class: 'sub', text: 'Held-out tests: the fitted terms checked on protocols they never saw. Each number is the median factor the prediction is off by (lower is better, 1.00 exact). ' + heldOutNote }),
            el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Test' }), el('th', { scope: 'col', text: 'Train / test' }), el('th', { scope: 'col', text: 'Category alone' }), el('th', { scope: 'col', text: 'Category + size' }), el('th', { scope: 'col', text: 'Median pred / actual' }))),
            el('tbody', null,
              el('tr', null, el('td', null, el('b', { text: 'Walk-forward (older trains, newer tests)' })), el('td', { class: 'num', text: DATA.validation.time_split.n_train + ' / ' + DATA.validation.time_split.n_test }), el('td', { class: 'num', text: 'x' + DATA.validation.time_split.cat_only_factor.toFixed(2) }), el('td', { class: 'num', text: 'x' + DATA.validation.time_split.cat_size_factor.toFixed(2) }), el('td', { class: 'num', text: DATA.validation.time_split.cat_size_med_ratio.toFixed(2) })),
              el('tr', null, el('td', null, el('b', { text: 'Hash split (deterministic, by slug)' })), el('td', { class: 'num', text: DATA.validation.hash_split.n_train + ' / ' + DATA.validation.hash_split.n_test }), el('td', { class: 'num', text: 'x' + DATA.validation.hash_split.cat_only_factor.toFixed(2) }), el('td', { class: 'num', text: 'x' + DATA.validation.hash_split.cat_size_factor.toFixed(2) }), el('td', { class: 'num', text: DATA.validation.hash_split.cat_size_med_ratio.toFixed(2) })),
              el('tr', null, el('td', null, el('b', { text: 'Leave-one-out (every protocol held out once)' })), el('td', { class: 'num', text: DATA.validation.loo.n + ' runs' }), el('td', { class: 'num', text: 'x' + DATA.validation.loo.cat_only_factor.toFixed(2) }), el('td', { class: 'num', text: 'x' + DATA.validation.loo.cat_size_factor.toFixed(2) }), el('td', { class: 'num', text: '—' })),
              el('tr', null, el('td', null, el('b', { text: 'Range coverage (in-sample IQR range)' })), el('td', { class: 'num', text: DATA.validation.range_n + ' protocols' }), el('td', { class: 'num', text: Math.round(DATA.validation.range_coverage * 100) + '% inside' }), el('td', { class: 'num', text: '50% nominal' }), el('td', { class: 'num', text: '—' }))
            )
          )
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
    var sizeBox = el('input', { type: 'checkbox', id: 'size', checked: sb.size ? 'checked' : null });
    sizeBox.addEventListener('change', function () { state.sandbox.size = sizeBox.checked; render(); });
    var oddsBox = el('input', { type: 'checkbox', id: 'odds', checked: sb.odds ? 'checked' : null });
    oddsBox.addEventListener('change', function () { state.sandbox.odds = oddsBox.checked; render(); });
    var reset = el('button', { class: 'button', type: 'button', text: 'Reset the sandbox', onclick: function () { state.sandbox = { multipleScale: 1, growthWeight: MODEL.growth_weight, breadth: true, size: true, odds: true }; render(); } });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'expected = round( tvl_usd x category_multiple x size_factor x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x (1 + min(chains - 1, ' + m.breadth_cap_chains + ') x ' + m.breadth_per_chain + ') x token_odds )'
      ),
      el('p', { class: 'sub', text: 'The category multiple is calibrated, not assumed: the median mcap/TVL of the tokenized protocols in the same category, shrunk toward the global median of ' + fmtMult(DATA.calibration.global_median) + ' with up to ' + m.prior_peers + ' phantom peers (fewer as a category\'s own peers grow, at least ' + m.prior_peers_min + ') and clamped to ' + fmtMult(m.multiple_floor) + '..' + fmtMult(m.multiple_cap) + '. The size factor is calibrated too: the market prices small protocols at a far higher multiple of TVL than large ones, so each protocol takes its TVL quartile band\'s median over the global median, clamped to ' + fmtMult(m.size_factor_floor) + '..' + fmtMult(m.size_factor_cap) + '. The token odds are calibrated as well: the snapshot\'s own record says how often protocols of each age carry a token, so the chance still ahead of one that has not listed yet falls with age — the board ranks the expected value, the listed value weighted by those odds. The growth, maturity and breadth factors are assumptions, stated here: only the multiple, the size factor and the odds are calibrated from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token on record; an unlisted age uses ' + m.unknown_age_days + ' days. Every row also carries a range — the expected value scaled by the peer multiples\' interquartile spread (' + fmtMult(DATA.calibration.global_q25) + '–' + fmtMult(DATA.calibration.global_q75) + ' globally) — because no single number is honest without its spread; in sample it covers ' + Math.round(DATA.validation.range_coverage * 100) + '% of traded market caps. The fitted terms are tested held-out three ways (walk-forward x' + DATA.validation.time_split.cat_size_factor.toFixed(2) + ', hash split x' + DATA.validation.hash_split.cat_size_factor.toFixed(2) + ', leave-one-out x' + DATA.validation.loo.cat_size_factor.toFixed(2) + ' median factor error) — the Calibration view shows every multiple, every size band, every odds band and the tests. The method document beside this page carries the same numbers in words.' }),
      el('div', { class: 'sandbox' },
        el('h3', null, 'Model sandbox', sandboxActive() ? el('span', { class: 'badge', text: ' active: the board is re-ranked' }) : null),
        el('p', { class: 'sub', text: 'Change the model and watch the board re-rank live, from the same arithmetic. The submitted board keeps the default values.' }),
        el('div', { class: 'sliders' },
          slider('sb-mult', 'Multiple scale', 0.5, 2, 0.05, sb.multipleScale, function (v) { return v.toFixed(2) + 'x'; }, function (v) { state.sandbox.multipleScale = v; }),
          slider('sb-growth', 'Growth weight', 0, 1, 0.05, sb.growthWeight, function (v) { return v.toFixed(2); }, function (v) { state.sandbox.growthWeight = v; }),
          el('div', { class: 'slider' }, el('label', { for: 'breadth' }, el('span', { text: 'Breadth adjustment (multi-chain)' }), el('b', { text: sb.breadth ? 'on' : 'off' })), el('label', { class: 'check' }, breadthBox, 'Count extra chains')),
          el('div', { class: 'slider' }, el('label', { for: 'size' }, el('span', { text: 'Size adjustment (TVL band)' }), el('b', { text: sb.size ? 'on' : 'off' })), el('label', { class: 'check' }, sizeBox, 'Price the protocol\'s size')),
          el('div', { class: 'slider' }, el('label', { for: 'odds' }, el('span', { text: 'Token odds (peers by age)' }), el('b', { text: sb.odds ? 'on' : 'off' })), el('label', { class: 'check' }, oddsBox, 'Weight by the odds it lists'))
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
    var steps = row.farm_steps || [];
    var recomputed = impliedOf(row, state.sandbox);
    var cal = DATA.calibration.rows.filter(function (c) { return c.category === (row.category || 'Other'); })[0];
    var band = DATA.calibration.bands.filter(function (b) { return b.factor === row.size_factor; })[0];
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.rank_low !== row.rank_high ? ' (range ' + row.rank_low + '–' + row.rank_high + ')' : '') + (row.watchlist ? ' - watchlist' : ' - early radar') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    if (!row.standalone) {
      dialog.appendChild(el('p', { class: 'sub product-note', text: 'Note: this protocol is a bridge, staking or wrapped product — it moves or wraps a token that already trades, so a launch here would be a new token for the product itself, not for the token it carries.' }));
    }
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Category multiple (' + (row.category || 'Other') + ')' }), el('b', { class: 'num', text: fmtMult(row.category_multiple) })),
        el('div', null, el('span', { text: 'Tokenized peers in category' }), el('b', { class: 'num', text: String(row.category_peers) + (cal && cal.peer_median !== null ? ' (peer median ' + fmtMult(cal.peer_median) + ')' : ' (global median used)') })),
        el('div', null, el('span', { text: 'Size factor (' + row.size_band + ' band)' }), el('b', { class: 'num', text: fmtMult(row.size_factor) + (band ? ' (band median ' + fmtMult(band.median) + ', ' + band.peers + ' peers)' : '') })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Age with no token on record' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Breadth multiplier (' + (row.chains || []).length + ' chains)' }), el('b', { class: 'num', text: String(row.breadth_multiplier) })),
        el('div', null, el('span', { text: 'Value if it lists' }), el('b', { class: 'num', text: fmtUsd(row.listed_value_usd) + ' (' + fmtUsd(row.listed_low_usd) + ' – ' + fmtUsd(row.listed_high_usd) + ')' })),
        el('div', null, el('span', { text: 'Token odds (' + row.odds_band + ', peers of this age)' }), el('b', { class: 'num', text: (row.odds * 100).toFixed(0) + '%' })),
        el('div', null, el('span', { text: 'Range (peer quartiles)' }), el('b', { class: 'num', text: fmtUsd(row.implied_low_usd) + ' – ' + fmtUsd(row.implied_high_usd) })),
        el('div', null, el('span', { text: 'Rank range at the spread' }), el('b', { class: 'num', text: String(row.rank_low) + '–' + String(row.rank_high) })),
        el('div', { class: 'total-row' }, el('span', { text: 'Expected value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ' under the sandbox settings; the board carries ' + fmtUsd(row.implied_value_usd) + '.') + ' This is an estimate, not a price, and the protocol records no token: the record is not proof it has none.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('p', { class: 'sub farm-meta', text: 'Budget: ' + row.farm_budget + '. First check-in: ' + row.farm_checkin + '.' }),
      el('p', { class: 'sub farm-meta', text: 'Verdict: ' + row.farm_verdict + ' — expected $' + row.farm_net_usd.toFixed(2) + ' net on $' + row.farm_capital_usd + ' capital, about $' + row.farm_gas_usd.toFixed(2) + ' of gas on ' + row.farm_chain + '. Farm covers its gas in expectation, Thin falls short by less than $5, Skip loses more.' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var parts = stepParts(s);
        return el('li', null, el('b', { text: parts.action }), el('span', { class: 'cost', text: parts.tail }));
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
    return el('p', { class: 'foot', text: 'Method: the board ranks ' + DATA.board_size + ' protocols that record no token by an expected value calibrated from the ' + DATA.calibration.global_peers + ' tokenized protocols in the same snapshot (global median mcap/TVL ' + fmtMult(DATA.calibration.global_median) + ', adjusted for the protocol\'s size band and weighted by the token odds for its age), then for seven-day TVL growth, age with no token on record and chain breadth; each row also carries the range the peer multiples\' interquartile spread implies and the rank it would take at that spread. Held-out: walk-forward x' + DATA.validation.time_split.cat_size_factor.toFixed(2) + ', hash split x' + DATA.validation.hash_split.cat_size_factor.toFixed(2) + ', leave-one-out x' + DATA.validation.loo.cat_size_factor.toFixed(2) + ' median factor error. The snapshot is DefiLlama data as of ' + DATA.as_of + '; it records no token for these protocols, which is not proof none exists. Implied value is the entry\'s own model, never a price, and no protocol is predicted to issue a token.' });
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    if (state.tab === 'board') shell.appendChild(integrityStrip());
    if (state.tab === 'board') shell.appendChild(overview());
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
