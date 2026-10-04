# PPL Tracker

Push/Pull/Legs gym tracker PWA for iPhone. Vite + React + TypeScript.

## Layout / ownership

| Path | Owner |
| --- | --- |
| `src/core/` | Logic layer (types, storage, store, hooks). No UI. |
| `src/ui/`, `src/screens/`, `src/components/`, `public/`, service worker | UI (Graphics) |
| `research/exercises.json` | Seed data (Theodore) — schema in `docs/seed-schema.md` |

The UI imports only from `src/core` (`import { useToday } from './core'`).

## Scripts

```sh
npm run dev        # vite dev server
npm run build      # tsc -b && vite build
npm run typecheck  # tsc -b
npm test           # vitest run (jsdom + fake-indexeddb)
npm run deploy     # build + gh-pages -d dist  (base: /ppl-tracker/)
```
