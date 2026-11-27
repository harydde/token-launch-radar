// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and renders
// the ranked board, detail drawer, live-token view, calibration table and sandbox. No network: every byte shown is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var MODEL = DATA.model;
  var DEFAULT_SANDBOX = { multipleScale: 1, growthWeight: MODEL.growth_weight, breadth: true, size: true, odds: true };
  var state = {
    q: '', category: 'all', chain: 'all', watchlistOnly: false, tab: 'board',
    pinned: [], compare: [], palette: 'radar',
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
  // One row of a detail equation: a label and its value, optionally the total row.
  function eqRow(label, value, total) {
    return el('div', total ? { class: 'total-row' } : null, el('span', { text: label }), el('b', { class: 'num', text: value }));
  }

  // The model in one function: the page recomputes a row from the snapshot figures, so the page's
  // code and the board's data are visibly the same arithmetic, and the sandbox re-ranks live.
  function sandboxFactors(row, sb) {
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
    return { growthMult: growthMult, maturity: maturity, breadth: breadth, sizeFactor: sizeFactor, odds: odds, multiple: multiple };
  }
  function impliedOf(row, sb) {
    var f = sandboxFactors(row, sb);
    return Math.max(1, Math.round(row.tvl_usd * f.multiple * f.sizeFactor * f.growthMult * f.maturity * f.breadth * f.odds * DATA.calibration.level_correction));
  }
  // Effective multiple: category x size x level x odds; TVL x multiple x growth x maturity x breadth is the expected value.
  function effectiveMultiple(row) {
    return row.category_multiple * row.size_factor * row.odds * DATA.calibration.level_correction;
  }
  function equationText(row, implied) {
    var f = sandboxFactors(row, state.sandbox);
    return fmtUsd(row.tvl_usd) + ' × ' + f.multiple.toFixed(2) + ' × ' + f.sizeFactor.toFixed(2) + ' × ' + DATA.calibration.level_correction.toFixed(2) + ' × ' + f.growthMult.toFixed(2) + ' × ' + f.maturity.toFixed(2) + ' × ' + f.breadth.toFixed(2) + ' × ' + f.odds.toFixed(2) + ' = ' + fmtUsd(implied);
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
    if (params.get('pin')) state.pinned = params.get('pin').split(',').filter(Boolean);
    if (params.get('cmp')) state.compare = params.get('cmp').split(',').filter(Boolean).slice(0, 3);
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tab !== 'board') params.set('tab', state.tab);
    if (state.watchlistOnly) params.set('wl', '1');
    if (state.selected) params.set('p', state.selected);
    if (state.pinned.length) params.set('pin', state.pinned.join(','));
    if (state.compare.length) params.set('cmp', state.compare.join(','));
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  // Board tools: pins sort to the top, compare holds up to three rows, CSV downloads the
  // filtered board, palette swaps the accent. All four travel in the URL hash.
  function applyPalette() {
    if (state.palette === 'radar') document.documentElement.removeAttribute('data-palette');
    else document.documentElement.setAttribute('data-palette', state.palette);
  }
  function toggle(list, slug, max) {
    var i = list.indexOf(slug);
    if (i >= 0) list.splice(i, 1);
    else if (!max || list.length < max) list.push(slug);
    writeHash(); render();
  }
  function downloadCsv() {
    function esc(v) { var s = String(v == null ? '' : v); return s.indexOf(',') >= 0 || s.indexOf('"') >= 0 ? '"' + s.replace(/"/g, '""') + '"' : s; }
    var lines = ['rank,name,category,chains,tvl_usd,implied_value_usd,implied_low_usd,implied_high_usd,odds,farm_verdict'];
    sortedRows(filtered()).forEach(function (s) {
      var r = s.row;
      lines.push([s.rank, r.name, r.category, (r.chains || []).join(';'), r.tvl_usd, s.implied, r.implied_low_usd, r.implied_high_usd, r.odds, r.farm_verdict].map(esc).join(','));
    });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    a.download = 'token-radar-board.csv';
    document.body.appendChild(a); a.click(); a.remove();
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
        el('p', { text: 'The watchlist is the floor: protocols with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' more, ' + DATA.above_floor_size + ' above that floor. Implied value is calibrated from protocols that already trade; a model, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Value if every token lists' }), el('b', { text: fmtUsd(DATA.total_listed_usd) })),
        el('div', { class: 'fact total' }, el('span', { text: 'Total expected value' }), el('b', { text: fmtUsd(DATA.total_implied_usd) }))
      )
    );
  }

  function integrityStrip() {
    var v = DATA.validation;
    var text = 'Self-check — ' + DATA.watchlist_size + '/' + DATA.watchlist_size + ' watchlist · ' + DATA.board_size + ' rows · ' +
      DATA.calibration.global_peers + ' tokenized protocols audited · held-out LOO x' + v.loo.level_factor.toFixed(2) +
      ', walk-forward x' + v.time_split.level_factor.toFixed(2) + ', 5-fold x' + v.fold5.level_factor.toFixed(2) +
      ' · 50% conformal range covers ' + Math.round(v.conformal_coverage * 100) + '% held out (hash split) · snapshot ' + DATA.as_of;
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
      el('p', { class: 'sub', text: cats.length + ' categories on the board.' })
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
    var palButton = el('button', { class: 'button', type: 'button', text: 'Palette: ' + state.palette, onclick: function () { var pals = ['radar', 'amber', 'ocean']; state.palette = pals[(pals.indexOf(state.palette) + 1) % pals.length]; applyPalette(); writeHash(); render(); } });
    function tabButton(tab, label) {
      return el('button', { type: 'button', 'aria-pressed': state.tab === tab ? 'true' : 'false', text: label, onclick: function () { state.tab = tab; writeHash(); render(); } });
    }
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('label', { class: 'check', for: 'wl' }, wlBox, 'Watchlist only'),
      palButton,
      el('button', { class: 'button', type: 'button', text: 'Download CSV', onclick: downloadCsv }),
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
    // Pinned rows sort to the top, board rank first among them, the rest in sort order.
    list.sort(function (a, b) { return (state.pinned.indexOf(b.row.slug) >= 0) - (state.pinned.indexOf(a.row.slug) >= 0); });
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
      var pinned = state.pinned.indexOf(r.slug) >= 0, compared = state.compare.indexOf(r.slug) >= 0;
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', null, el('div', { class: 'rank-cell' },
          el('span', { class: 'num', text: String(s.rank) }),
          el('span', { class: 'sub rank-range', text: '#' + Math.min(r.rank_low, r.rank_high) + '–#' + Math.max(r.rank_low, r.rank_high) })
        )),
        el('td', null, el('div', { class: 'name' },
          el('span', null, el('b', { text: r.name }), r.watchlist ? el('span', { class: 'tag watch', text: 'watchlist' }) : null, pinned ? el('span', { class: 'tag', text: 'pinned' }) : null),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') + (r.chains && r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') }),
          el('span', { class: 'equation-line', text: equationText(r, s.implied), title: 'TVL × category × size × level × growth × maturity × breadth × odds = expected value' })
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
        el('td', null, el('span', { class: 'status', text: 'no token' }),
          el('div', { class: 'row-tools' },
            el('button', { class: 'mini-btn' + (pinned ? ' on' : ''), type: 'button', text: 'Pin', onclick: function (e) { e.stopPropagation(); toggle(state.pinned, r.slug); } }),
            el('button', { class: 'mini-btn' + (compared ? ' on' : ''), type: 'button', text: 'Compare', onclick: function (e) { e.stopPropagation(); toggle(state.compare, r.slug, 3); } })))
      );
      tbody.appendChild(tr);
    });
    var picked = state.compare.map(function (slug) { return DATA.rows.filter(function (r) { return r.slug === slug; })[0]; }).filter(Boolean);
    var tray = null;
    if (picked.length) {
      tray = el('div', { class: 'compare-tray' },
        el('p', null, el('b', { text: 'Compare (' + picked.length + '/3)' })),
        picked.map(function (row) {
          return el('p', { class: 'sub', text: '#' + row.rank + ' ' + row.name + ' — implied ' + fmtUsd(row.implied_value_usd) + ' (' + fmtUsd(row.implied_low_usd) + '–' + fmtUsd(row.implied_high_usd) + '), ' + fmtMult(effectiveMultiple(row)) + ', odds ' + (row.odds * 100).toFixed(0) + '%, ' + row.farm_verdict });
        }));
    }
    return el('div', null, tray, el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest expected value first. Multiple = category × size × level × token odds; each row shows its equation and rank range.' }),
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
    ));
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
          el('caption', { class: 'sub', text: 'Already trading: market cap is a fact, not a model; their mcap/TVL multiples calibrate the ranking.' }),
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
        el('td', { class: 'num', text: c.conformal_q50 === null ? 'global ' + fmtMult(DATA.calibration.conformal_q50) : fmtMult(c.conformal_q50) }),
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
    var splits = [['walk-forward', v.time_split], ['hash split', v.hash_split], ['5-fold', v.fold5], ['leave-one-out', v.loo]];
    var wins = splits.filter(function (s) { return s[1].cat_size_factor < s[1].cat_only_factor; }).map(function (s) { return s[0]; });
    var levelWins = splits.filter(function (s) { return s[1].level_factor < s[1].cat_size_factor; }).map(function (s) { return s[0]; });
    var termWins = v.term_tests.filter(function (t) { return t.fitted_factor < t.level_factor; }).length;
    var heldOutNote = (wins.length > 0
      ? 'Size factor improves the ' + wins.join(', ') + '. '
      : 'Size factor improves no held-out test. ') +
      'Level correction improves ' + levelWins.join(', ') + ' (' + levelWins.length + ' of 4). ' +
      'Fitted terms improve ' + termWins + ' of 4 tests — kept as assumptions, not fitted.';
    var heldBody = el('tbody');
    [
      ['Walk-forward', v.time_split.n_train + ' / ' + v.time_split.n_test, 'x' + v.time_split.cat_only_factor.toFixed(2), 'x' + v.time_split.cat_size_factor.toFixed(2), 'x' + v.time_split.level_factor.toFixed(2), v.time_split.level_med_ratio.toFixed(2)],
      ['Hash split', v.hash_split.n_train + ' / ' + v.hash_split.n_test, 'x' + v.hash_split.cat_only_factor.toFixed(2), 'x' + v.hash_split.cat_size_factor.toFixed(2), 'x' + v.hash_split.level_factor.toFixed(2), v.hash_split.level_med_ratio.toFixed(2)],
      ['5-fold', v.fold5.n_train + ' / ' + v.fold5.n_test + ' pooled', 'x' + v.fold5.cat_only_factor.toFixed(2), 'x' + v.fold5.cat_size_factor.toFixed(2), 'x' + v.fold5.level_factor.toFixed(2), v.fold5.level_med_ratio.toFixed(2)],
      ['Leave-one-out', v.loo.n + ' runs', 'x' + v.loo.cat_only_factor.toFixed(2), 'x' + v.loo.cat_size_factor.toFixed(2), 'x' + v.loo.level_factor.toFixed(2), '—']
    ].forEach(function (r) {
      heldBody.appendChild(el('tr', null,
        el('td', null, el('b', { text: r[0] })),
        el('td', { class: 'num', text: r[1] }),
        el('td', { class: 'num', text: r[2] }),
        el('td', { class: 'num', text: r[3] }),
        el('td', { class: 'num', text: r[4] }),
        el('td', { class: 'num', text: r[5] })
      ));
    });
    var catPanel = el('div', { class: 'panel' },
        el('div', { class: 'table-wrap' },
          el('table', null,
            el('caption', { class: 'sub', text: 'Category multiple = median mcap/TVL of tokenized peers (ratios capped at ' + MODEL.peer_ratio_cap + 'x), shrunk to the global median ' + fmtMult(DATA.calibration.global_median) + ' (' + DATA.calibration.global_peers + ' peers) with phantom peers, clamped to ' + fmtMult(MODEL.multiple_floor) + '–' + fmtMult(MODEL.multiple_cap) + '. Range = the category\'s own half-width with ' + MODEL.range_peers_min + '+ peers, else the global ' + fmtMult(DATA.calibration.conformal_q50) + '. Level correction ' + DATA.calibration.level_correction.toFixed(2) + 'x.' }),
            el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'Tokenized peers' }), el('th', { scope: 'col', text: 'Peer median mcap / TVL' }), el('th', { scope: 'col', text: '50% range half-width' }), el('th', { scope: 'col', text: 'Multiple used' }))),
            tbody
          )
        )
      );
    var bandPanel = el('div', { class: 'panel bands' },
        el('div', { class: 'table-wrap' },
          el('table', null,
            el('caption', { class: 'sub', text: 'Size effect: the smallest quarter trades at a far higher multiple than the largest; each protocol takes its TVL quartile band\'s median over the global median, clamped to ' + fmtMult(MODEL.size_factor_floor) + '..' + fmtMult(MODEL.size_factor_cap) + '.' }),
            el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'TVL band' }), el('th', { scope: 'col', text: 'Tokenized peers' }), el('th', { scope: 'col', text: 'Band median mcap / TVL' }), el('th', { scope: 'col', text: 'Size factor' }))),
            bandBody
          )
        )
      );
    var oddsPanel = el('div', { class: 'panel bands' },
        el('div', { class: 'table-wrap' },
          el('table', null,
            el('caption', { class: 'sub', text: 'Token odds: how often protocols of each age carry a token. Odds = (oldest band\'s rate, ' + (DATA.calibration.odds_eventual_rate * 100).toFixed(1) + '%, minus the band\'s rate) / (1 minus its rate), floored at ' + DATA.calibration.odds_floor.toFixed(2) + '.' }),
            el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Age band' }), el('th', { scope: 'col', text: 'Protocols' }), el('th', { scope: 'col', text: 'With token' }), el('th', { scope: 'col', text: 'Token rate' }), el('th', { scope: 'col', text: 'Odds used' }))),
            oddsBody
          )
        )
      );
    var heldPanel = el('div', { class: 'panel bands' },
        el('div', { class: 'table-wrap' },
          el('table', null,
            el('caption', { class: 'sub', text: 'Held-out tests: each number is the median factor the prediction is off by (lower is better, 1.00 exact). ' + heldOutNote }),
            el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Test' }), el('th', { scope: 'col', text: 'Train / test' }), el('th', { scope: 'col', text: 'Category alone' }), el('th', { scope: 'col', text: 'Category + size' }), el('th', { scope: 'col', text: 'With level' }), el('th', { scope: 'col', text: 'Median pred / actual' }))),
            heldBody
          )
        )
      );
    var acc = DATA.accounting;
    var accBody = el('tbody');
    [
      ['Already trade — calibrate the board, never ranked', acc.traded_with_mcap],
      ['Market cap zero or less — a broken record, not a price', acc.broken_mcap_zero],
      ['Token recorded, no market cap — has a token, no price to rank by', acc.token_no_mcap],
      ['No token at all — ranked on the board', acc.board],
      ['No token — exchange or versioned pool', acc.excluded_cex_versioned],
      ['No token — bridge, wrapped asset or staking receipt above the floor', acc.excluded_above_floor_product],
      ['Total protocols in the snapshot', acc.total]
    ].forEach(function (r) {
      accBody.appendChild(el('tr', null, el('td', null, el('b', { text: r[0] })), el('td', { class: 'num', text: String(r[1]) })));
    });
    var accPanel = el('div', { class: 'panel bands' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Every protocol in the snapshot lands in exactly one bucket: ' + acc.traded_with_mcap + ' + ' + acc.broken_mcap_zero + ' + ' + acc.token_no_mcap + ' + ' + acc.pre_token + ' = ' + acc.total + '; ' + acc.board + ' + ' + acc.excluded_cex_versioned + ' + ' + acc.excluded_above_floor_product + ' = ' + acc.pre_token + '.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Bucket' }), el('th', { scope: 'col', text: 'Protocols' }))),
          accBody
        )
      )
    );
    return el('div', { class: 'calibration-views' }, heldPanel, accPanel, catPanel, bandPanel, oddsPanel);
  }

  function modelPanel() {
    var m = MODEL;
    var sb = state.sandbox;
    function slider(id, label, min, max, step, value, fmt, oninput) {
      var input = el('input', { type: 'range', id: id, min: String(min), max: String(max), step: String(step), value: String(value) });
      input.addEventListener('input', function () { oninput(parseFloat(input.value)); render(); });
      var out = el('b', { text: fmt(value) });
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
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures.' }),
      el('div', { class: 'formula' },
        'expected = round( tvl_usd x category_multiple x size_factor x level (' + DATA.calibration.level_correction.toFixed(2) + ') x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x (1 + min(chains - 1, ' + m.breadth_cap_chains + ') x ' + m.breadth_per_chain + ') x token_odds )'
      ),
      el('p', { class: 'sub', text: 'The multiple, size factor, level correction (' + DATA.calibration.level_correction.toFixed(2) + 'x) and token odds are calibrated from the snapshot\'s own tokenized protocols; growth, maturity and breadth are assumptions. Every row also carries a range — a 50% conformal interval, the expected value times exp(+/- the 60th percentile of |log residual|, ' + fmtMult(DATA.calibration.conformal_q50) + ' globally) — in sample it covers ' + Math.round(DATA.validation.range_coverage * 100) + '% of traded market caps, held out ' + Math.round(DATA.validation.conformal_coverage * 100) + '% (hash split) and ' + Math.round(DATA.validation.conformal_coverage_fold5 * 100) + '% (5-fold). Held out four ways: walk-forward x' + DATA.validation.time_split.level_factor.toFixed(2) + ', hash split x' + DATA.validation.hash_split.level_factor.toFixed(2) + ', 5-fold x' + DATA.validation.fold5.level_factor.toFixed(2) + ', leave-one-out x' + DATA.validation.loo.level_factor.toFixed(2) + ' (with the level correction).' }),
      el('div', { class: 'sandbox' },
        el('h3', null, 'Model sandbox', sandboxActive() ? el('span', { class: 'badge', text: ' active' }) : null),
        el('p', { class: 'sub', text: 'Change the model and watch the board re-rank live.' }),
        el('div', { class: 'sliders' },
          slider('sb-mult', 'Multiple scale', 0.5, 2, 0.05, sb.multipleScale, function (v) { return v.toFixed(2) + 'x'; }, function (v) { state.sandbox.multipleScale = v; }),
          slider('sb-growth', 'Growth weight', 0, 1, 0.05, sb.growthWeight, function (v) { return v.toFixed(2); }, function (v) { state.sandbox.growthWeight = v; }),
          el('div', { class: 'slider' }, el('label', { for: 'breadth' }, el('span', { text: 'Breadth (multi-chain)' }), el('b', { text: sb.breadth ? 'on' : 'off' })), el('label', { class: 'check' }, breadthBox, 'Count extra chains')),
          el('div', { class: 'slider' }, el('label', { for: 'size' }, el('span', { text: 'Size (TVL band)' }), el('b', { text: sb.size ? 'on' : 'off' })), el('label', { class: 'check' }, sizeBox, 'Price the protocol\'s size')),
          el('div', { class: 'slider' }, el('label', { for: 'odds' }, el('span', { text: 'Token odds' }), el('b', { text: sb.odds ? 'on' : 'off' })), el('label', { class: 'check' }, oddsBox, 'Weight by the odds it lists'))
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
      dialog.appendChild(el('p', { class: 'sub product-note', text: 'Note: a bridge, staking or wrapped product — a launch here would be a new token for the product itself.' }));
    }
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        eqRow('TVL', fmtUsd(row.tvl_usd)),
        eqRow('Category multiple', fmtMult(row.category_multiple)),
        eqRow('Tokenized peers', String(row.category_peers) + (cal && cal.peer_median !== null ? ' (peer median ' + fmtMult(cal.peer_median) + ')' : ' (global median used)')),
        eqRow('Size factor (' + row.size_band + ' band)', fmtMult(row.size_factor) + (band ? ' (band median ' + fmtMult(band.median) + ', ' + band.peers + ' peers)' : '')),
        eqRow('Level correction', fmtMult(DATA.calibration.level_correction)),
        eqRow('7-day growth', fmtPct(row.change_7d)),
        eqRow('Growth multiplier', String(row.growth_multiplier)),
        eqRow('Age', fmtAge(row.age_days)),
        eqRow('Maturity multiplier', String(row.maturity_multiplier)),
        eqRow('Breadth multiplier', String(row.breadth_multiplier)),
        eqRow('Value if it lists', fmtUsd(row.listed_value_usd) + ' (' + fmtUsd(row.listed_low_usd) + ' – ' + fmtUsd(row.listed_high_usd) + ')'),
        eqRow('Token odds (' + row.odds_band + ')', (row.odds * 100).toFixed(0) + '%'),
        eqRow('Range', fmtUsd(row.implied_low_usd) + ' – ' + fmtUsd(row.implied_high_usd)),
        eqRow('Rank range', String(row.rank_low) + '–' + String(row.rank_high)),
        eqRow('Expected value', fmtUsd(row.implied_value_usd), true)
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': one function scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ' under the sandbox; the board carries ' + fmtUsd(row.implied_value_usd) + '.') + ' An estimate, not a price; no token on record is not proof it has none.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('p', { class: 'sub farm-meta', text: 'Budget: ' + row.farm_budget + '. First check-in: ' + row.farm_checkin + '.' }),
      el('p', { class: 'sub farm-meta', text: 'Verdict: ' + row.farm_verdict + ' — expected $' + row.farm_net_usd.toFixed(2) + ' net on $' + row.farm_capital_usd + ' capital, about $' + row.farm_gas_usd.toFixed(2) + ' of gas on ' + row.farm_chain + '.' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        return el('li', null, el('b', { text: at >= 0 ? s.slice(0, at) : s }), el('span', { class: 'cost', text: at >= 0 ? s.slice(at + 1) : '' }));
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
        eqRow('TVL', fmtUsd(row.tvl_usd)),
        eqRow('Market cap', fmtUsd(row.mcap_usd)),
        eqRow('Mcap / TVL', fmtMult(row.mcap_tvl)),
        eqRow('Seven-day growth', fmtPct(row.change_7d))
      ),
      el('p', { class: 'sub', text: 'Already trading: its market cap is a fact, not a model; its mcap/TVL multiple helps calibrate the board.' })
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function footer() {
    return el('p', { class: 'foot', text: 'Method: the board ranks ' + DATA.board_size + ' pre-token protocols by an expected value calibrated from the ' + DATA.calibration.global_peers + ' tokenized protocols (global median mcap/TVL ' + fmtMult(DATA.calibration.global_median) + ', size-adjusted, level-corrected ' + DATA.calibration.level_correction.toFixed(2) + 'x, weighted by token odds), then for growth, age and breadth; each row carries a 50% conformal range and its rank range. Held-out: walk-forward x' + DATA.validation.time_split.level_factor.toFixed(2) + ', hash x' + DATA.validation.hash_split.level_factor.toFixed(2) + ', 5-fold x' + DATA.validation.fold5.level_factor.toFixed(2) + ', LOO x' + DATA.validation.loo.level_factor.toFixed(2) + '. DefiLlama data as of ' + DATA.as_of + '. Implied value is a model, never a price.' });
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    if (state.tab === 'board') shell.appendChild(integrityStrip());
    shell.appendChild(controls());
    if (state.tab === 'live') shell.appendChild(liveTable());
    else if (state.tab === 'calibration') shell.appendChild(calibrationTable());
    else shell.appendChild(boardTable());
    if (state.tab === 'board') shell.appendChild(overview());
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
  applyPalette();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
