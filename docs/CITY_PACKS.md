# City packs

A city pack is plain data. The engine contains no city names; every difference between cities is configuration in `src/cities/*.ts`, compiled by `compileCity()` into a `CityPack`.

## What ships

| | London | Tokyo | Paris | Berlin |
| --- | --- | --- | --- | --- |
| Layout (original) | Rows following an invented river curve | Concentric rings around a garden | Sunflower spiral around a hub | Diamond lattice cut by a canal |
| Stations / districts | 50 / 10 | 47 / 13 | 51 / 11 | 50 / 9 |
| River rule | Free, +3 per crossing | none | 8 bridges only | 5 bridges free, others need tunnel card |
| Starts per line | 1 | 1 | 1 | 2 |
| Round end | 8 reveals | 4th lantern | 9 reveals | 10 reveals |
| Signature score | Districts × concentration | Stamps and loop | Bridges, bank balance, hub | Linked starts, one network |

All rules are house rules for this project. Names are invented except the city names. Layouts are generated from formulas in the pack files, not traced from any map.

## Writing a pack

```ts
export const myCity = compileCity({
  id: 'mycity', version: 1,
  stations: [{ id: 'a1', x: 100, y: 80, symbol: 'leaf', landmark: true }, /* … */],
  districts: [{ id: 'n', name: t('เหนือ', 'North'), seed: { x: 200, y: 100 } }],
  graph: { maxDist: 160, clearance: 24, riverMode: 'bridges', bridges: [['a1', 'b2']] },
  river: [...points],
  lines: [{ id: 'madder', name: t('…', '…'), starts: ['a1'] }, /* four lines */],
  deck: makeDeck({ copies: 2, wilds: 1, branches: 1 }),
  roundEnd: { type: 'reveals', count: 8 },
  lineRules: [...], finalRules: [...], objectives: [...], tieBreakers: [...],
  // names, texts, size…
});
```

Then add it to `CITIES` in `src/cities/index.ts`. The gallery, lobby, rules page, engine and the pack tests pick it up. Give it a scene in `CityArt` (`src/client/components/icons.tsx`) and Thai/English text for any new rule types. Update the expected list in `tests/scoring.test.ts`.

### Stations
`symbol`: `drop | leaf | spark | hex | any`. Flags: `landmark`, `stamp`, `loop`, `hub`. Station ids must not contain `-` (edge ids are `a-b`). Unnamed stations are named after their district and number.

### Districts
Give a `seed` for an automatic Voronoi cell, or an explicit `polygon`. Labels are placed automatically unless `label` is set.

### Edges
Every pair closer than `maxDist` is joined unless another station lies within `clearance` of the line. `extra` and `skip` adjust by hand. River crossings and edge intersections are computed.

`riverMode`: `free` (ordinary edges, counted), `bridges` (only listed edges cross), `tunnels` (listed edges are free, the rest need `tunnelPass`).

### Cards
`symbol`, plus optional `anyOrigin`, `segments`, `overpass`, `tunnelPass`, `lantern`, and `module` (included only when that option is on).

### Line rules
`districtTimesConcentration`, `districtPoints`, `concentrationPoints`, `riverCrossings`, `bridges`, `lineLandmarks`, `bankBalance` (needs `bankA`), `hub`, `stationCount`, `linkStarts`.

### Final rules
`landmarkTrack`, `interchanges`, `stamps`, `loop`, `linkedColors`, `oneNetwork`.

Tables are indexed by count and clamp to their last entry.

### Dual starts
Give a line two `starts` and set `mergeComponents: true`. Two halves of one colour may then join once; a second link would be a loop and is refused.

## Versioning
Bump `version` whenever stations, edges, deck or scoring change. A saved game with another version is returned to its lobby instead of continuing on a different map.

## Checking a pack
`npm test` verifies ids, connectivity, spacing, symbol balance, crossings, deck length, bilingual text and full bot games. `npm run simulate -- 60` prints score averages; `npx tsx scripts/inspect-cities.ts out` writes SVG proofs.
