# Item Recommendations Visualizer

Compare recommendation variants (Control vs Variant A/B/etc.) and run bulk expected-value analysis.

## Run

```bash
npm start
```

Then open **http://localhost:3000** in your browser.

## Modes

- **Visual** — Fetch a source lot, add comparison views, fetch recommendations, run analysis (EV, house diversity).
- **Bulk** — Define Control + variants, paste source lot IDs, run analysis across all of them.
- **Saved Examples** — Save and load visual or bulk configs/results.

Requires Node.js.
