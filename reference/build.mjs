// Builds the visual baseline: the artifact's original source (reference/artifact/src, only
// data-section attributes added) bundled like the artifact runtime does it: esbuild 0.27.2,
// React 18.2, and the compiled stylesheet captured from the runtime build (artifact.css).
// Output: reference/build/index.html (+ app.js), served by CI next to the new build.
import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "build");
mkdirSync(out, { recursive: true });
await build({
  entryPoints: [join(here, "entry.jsx")],
  bundle: true, minify: true, format: "iife", target: ["es2022"], jsx: "automatic",
  alias: { react: "react18", "react-dom": "react-dom18" },
  define: { "process.env.NODE_ENV": '"production"' },
  outfile: join(out, "app.js"), logLevel: "info",
  plugins: [{
    // The artifact's PDF / seal engines are byte-identical to src/pdf and src/seal (the port does not
    // touch them), so the reference build reads them from there instead of keeping a second copy.
    name: "shared-engines",
    setup(b) {
      b.onResolve({ filter: /^\.\/(pdf|seal)\// }, (a) =>
        a.importer.includes(`${"artifact"}/src`) ? { path: join(here, "..", "src", a.path.slice(2)) } : undefined);
      b.onResolve({ filter: /^\.\.\/(pdf|seal)\// }, (a) =>
        a.importer.includes(`${"artifact"}/src/components`) ? { path: join(here, "..", "src", a.path.slice(3)) } : undefined);
    },
  }],
});
const css = readFileSync(join(here, "artifact", "artifact.css"), "utf8");
writeFileSync(join(out, "index.html"), `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>印章工廠</title>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@600;900&amp;family=Noto+Sans+TC:wght@400;500;700&amp;family=IBM+Plex+Mono:wght@400;500&amp;display=swap" />
    <style>${css}</style>
  </head>
  <body>
    <div id="root"></div>
    <script src="./app.js"></script>
  </body>
</html>
`);
console.log("reference build → reference/build/");
