# Token Launch Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/harydde/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/harydde/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A make.fun entry for **"Build the best token launch radar"** (token-radar-01): a
dashboard that ranks the protocols in a sealed DefiLlama snapshot that record no
token, by the implied value a token launch would carry, and shows a reader how
to farm each one.

## What it does

`main.ts` (Node 22, standard library only) reads `/input/snapshot.json`, scores
every pre-token protocol with the calibrated model in `lib/model.ts`, and writes:

- `board.json` — 244 ranked rows: the whole 40-protocol watchlist plus every
  rankable pre-token protocol below the floor, plus the standalone pre-token
  protocols above the floor that the watchlist does not name (a bridge, a
  wrapped asset or a staking receipt is not ranked as a launch on its own).
  Each row carries an implied value with a low and a high from a 50% conformal
  interval, and an eight-step farm plan derived from the protocol's own record:
  category, chains, TVL, age, seven-day move and rank.
- `data.js` — the dashboard's dataset, including the calibration table, the
  TVL size bands and each row's farm plan, so the page shows exactly the steps
  board.json carries.
- `dashboard/` — a static page (no network): sortable/filterable board, a
  detail view for every protocol, a live-token view, the calibration table and
  size bands, a category overview, the held-out validation and the snapshot's
  full accounting (every one of the 758 protocols in exactly one bucket), and
  a model sandbox that re-ranks the board live. The build also writes
  `dashboard/method.md`, the method document with the snapshot's own
  calibration figures.
- `screenshots/` — the board, a protocol detail view, a filtered view and the
  calibration view.
- `dossier.json` — built with the vendored make.fun library.

## The model (radar-8)

Implied value is calibrated from the snapshot's own figures, never from a list
of names:

1. **Calibration.** For each category, the median mcap/TVL of the tokenized
   protocols in it (peer ratios winsorized at 5x first, so a micro-TVL outlier
   cannot set it), shrunk toward the global median with a phantom-peer prior
   that scales with the evidence — twelve phantom peers when a category has no
   peers of its own, down to three once it has nine or more — and clamped to
   0.05x–1.00x. A category with no tokenized peer takes the global median. The
   prior is deliberately strong at the thin end: several categories have only
   one or two tokenized peers, and a single peer must not set the multiple on
   its own; but a well-evidenced category's own median should speak.
2. **Size.** The market does not price all sizes alike: the smallest quarter of
   tokenized protocols trades at a median 0.88x of TVL, the largest quarter at
   0.05x. Each protocol takes a size factor — its TVL quartile band's median
   over the global median, clamped to 0.5x–2.0x so the pattern adjusts the
   value without dominating it.
3. **Base** = TVL x category multiple x size factor.
4. **Growth** = 1 + clamp(change_7d, −50%, +100%) x 0.5.
5. **Maturity** = 0.6 + min(age, 1095 days) / 1095 x 0.4.
6. **Breadth** = 1 + 0.015 x min(chains − 1, 10).
7. **Range.** Every row also carries a low and a high: a 50% conformal
   interval, the implied value times exp(+/- the 60th percentile of |log
   residual| of the tokenized peers, level-corrected — the category's own
   half-width when it has eight or more peers, the global half-width
   otherwise). Split-conformal coverage is 50% on the hash split and 49% on
   5-fold, against the nominal 50%.

Growth, maturity and breadth are assumptions, stated as such in the dashboard:
only the category multiple, the size factor, the level correction (0.94x) and
the token odds are calibrated from the snapshot. The dashboard states every
constant and shows the calibration table with the peer count behind each
multiple, plus the size bands. Farm plans name no product the snapshot does not
carry: every step follows from the protocol's category, chains, TVL, age,
seven-day move and rank.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

## Honesty note

The snapshot records no token for the ranked protocols; that is not proof none
exists. Implied value is this entry's own model, never a price, and no protocol
is predicted to issue a token.

---

<sub>Entered on [make.fun](https://make.fun/?ref=twfe3v6t&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
