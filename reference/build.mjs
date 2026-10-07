// Builds the visual baseline: the artifact's original source (reference/artifact/src, only
// data-section attributes added) bundled like the artifact runtime does it: esbuild 0.27.2,
// React 18.2, and the compiled stylesheet captured from the runtime build (artifact.css).
// Output: reference/build/index.html (+ app.js), served by CI next to the new build.
import { build } from "esbuild";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
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
    // App.jsx (142 KB) is stored as ordered line-boundary chunks in App.jsx.parts/ so each one fits
    // a single commit through the GitHub API; concatenated they are the exact original file.
    name: "app-parts",
    setup(b) {
      const partsDir = join(here, "artifact", "src", "App.jsx.parts");
      b.onResolve({ filter: /\/artifact\/src\/App\.jsx$/ }, () => ({ path: join(here, "artifact", "src", "App.jsx"), namespace: "app-parts" }));
      b.onLoad({ filter: /.*/, namespace: "app-parts" }, () => ({
        contents: readdirSync(partsDir).filter((f) => f.endsWith(".part")).sort()
          .map((f) => readFileSync(join(partsDir, f), "utf8")).join(""),
        loader: "jsx", resolveDir: join(here, "artifact", "src"),
      }));
    },
  }, {
    // The artifact's PDF / seal engines are shared with src/pdf and src/seal, so the reference build
    // reads them from there instead of keeping a second copy. Phase B (#4) converts those engines to
    // TypeScript file by file: once `x.js` is gone, the artifact's `x.js` import falls back to `x.ts`.
    // esbuild only strips the type annotations, so the baseline still runs the same engine code.
    name: "shared-engines",
    setup(b) {
      const engine = (rel) => {
        const p = join(here, "..", "src", rel);
        const ts = p.replace(/\.js$/, ".ts");
        return { path: !existsSync(p) && ts !== p && existsSync(ts) ? ts : p };
      };
      b.onResolve({ filter: /^\.\/(pdf|seal)\// }, (a) =>
        a.importer.includes(`${"artifact"}/src`) ? engine(a.path.slice(2)) : undefined);
      b.onResolve({ filter: /^\.\.\/(pdf|seal)\// }, (a) =>
        a.importer.includes(`${"artifact"}/src/components`) ? engine(a.path.slice(3)) : undefined);
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
