# reference/ — visual baseline

`artifact/src/` is the ClickUp artifact **印章工廠 v38** source, copied verbatim. The only edit is a
`data-section="…"` attribute on the header and on each of the ten sections (壹–拾), so CI can
screenshot and compare section by section. The artifact's full changelog (v12–v38) is the comment
block at the top of `artifact/src/App.jsx`.

- `artifact/artifact.css` — compiled stylesheet captured from the artifact runtime build (Tailwind 3.4.18).
- `artifact/dist/index.html` — the runtime's own single-file build of the same source, kept for the record.
- The artifact's `pdf/` and `seal/` engine modules are byte-identical to `src/pdf` and `src/seal`, so they are not duplicated here; `build.mjs` resolves them from `src/`.
- `build.mjs` — rebuilds the baseline in CI (esbuild 0.27.2 + React 18.2, same as the runtime).

Do not edit `artifact/` except to re-sync it with a newer artifact version.
