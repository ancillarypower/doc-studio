// Mounts the untouched artifact App the same way the ClickUp artifact runtime does (React 18.2).
import { createRoot } from "react-dom/client";
import App from "./artifact/src/App.jsx";

createRoot(document.getElementById("root")).render(<App />);
