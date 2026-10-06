import { createRoot } from "react-dom/client";
// Self-hosted webfonts (replaces the artifact's Google Fonts <link>): same families and weights.
import "@fontsource/noto-serif-tc/600.css";
import "@fontsource/noto-serif-tc/900.css";
import "@fontsource/noto-sans-tc/400.css";
import "@fontsource/noto-sans-tc/500.css";
import "@fontsource/noto-sans-tc/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./index.css";
import "./styles/app.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(<App />);
