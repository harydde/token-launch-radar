# Token Launch Radar

A make.fun entry for **"Build the best token launch radar"** (token-radar-01): a
dashboard that ranks the protocols in a sealed DefiLlama snapshot that record no
token, by the implied value a token launch would carry, and shows a reader how
to farm each one.

## What it does

`main.ts` (Node 22, standard library only) reads `/input/snapshot.json`, scores
every pre-token protocol with the calibrated model in `lib/model.ts`, and writes:

- `board.json` — 226 ranked rows: the whole 40-protocol watchlist plus every
  rankable pre-token protocol below the floor, each with an implied value and a
  six-step farm plan.
- `data.js` — the dashboard's dataset, including the calibration table.
- `dashboard/` — a static page (no network): sortable/filterable board, a
  detail view for every protocol, a live-token view, the calibration table and a
  model sandbox that re-ranks the board live.
- `screenshots/` — the board, a protocol detail view and a filtered view.
- `dossier.json` — built with the vendored make.fun library.

## The model (radar-2)

Implied value is calibrated from the snapshot's own figures, never from a list
of names:

1. **Calibration.** For each category, the median mcap/TVL of the tokenized
   protocols in it (peer ratios winsorized at 5x first, so a micro-TVL outlier
   cannot set it), shrunk toward the global median with 12 phantom peers and
   clamped to 0.05x–1.00x. A category with no tokenized peer takes the global
   median. The prior is deliberately strong: several categories have only one or
   two tokenized peers, and a single peer must not set the multiple on its own.
2. **Base** = TVL x category multiple.
3. **Growth** = 1 + clamp(change_7d, −50%, +100%) x 0.5.
4. **Maturity** = 0.6 + min(age, 1095 days) / 1095 x 0.4.
5. **Breadth** = 1 + 0.015 x min(chains − 1, 10).

The dashboard states every constant and shows the calibration table with the
peer count behind each multiple.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

## Honesty note

The snapshot records no token for the ranked protocols; that is not proof none
exists. Implied value is this entry's own model, never a price, and no protocol
is predicted to issue a token.
