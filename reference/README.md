# reference/ — visual baseline

`artifact/src/` is the ClickUp artifact **印章工廠 v38** source. Two edits only: a
`data-section="…"` attribute on the header and on each of the ten sections (壹–拾), so CI can
screenshot and compare section by section, and the NUL escape in one regex written as `\x00`
instead of the equivalent `\u` form (the GitHub API transport mangled the latter; same semantics).
The artifact's full changelog (v12–v38) is the comment block at the top of `App.jsx`.

- `artifact/artifact.css` — compiled stylesheet captured from the artifact runtime build (Tailwind 3.4.18).
- `artifact/src/App.jsx.parts/` — `App.jsx` (142 KB) split at line boundaries into ordered chunks so each fits one API commit; `cat App.jsx.parts/*.part` is the exact file, and `build.mjs` stitches them in memory.
- The artifact's `pdf/` and `seal/` engine modules are byte-identical to `src/pdf` and `src/seal`, so they are not duplicated here; `build.mjs` resolves them from `src/`.
- `build.mjs` — rebuilds the baseline in CI (esbuild 0.27.2 + React 18.2, same as the runtime).

Do not edit `artifact/` except to re-sync it with a newer artifact version.
