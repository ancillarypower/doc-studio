import { type Align, type Method } from "../types";
import { type SizeUnit, type WmColor } from "../studio/stateTypes";

export const VERM = "#BE3A2B";

export const INK = "#2A231A";

export const MUTED = "#6E6250";

export const PAPER = "#F5F0E6";

export const CARD = "#FBF8F1";

export const LINE = "#E3D9C6";

export const GREEN = "#2A6B3A";

export const MAX_PAGES = 300;

// artifact 版本號：寫入下載紀錄表頭與檔名；每次 artifact save 前同步更新
export const APP_VERSION = 38;

export const ALIGN_LABELS: Record<Align, string> = { left: "靠左", "center-left": "中間靠左", center: "置中", "center-right": "中間靠右", right: "靠右" };

export const METHOD_NAMES: Record<Method, string> = { A: "摺頁橫蓋法", B: "側邊裝訂蓋章法", C: "摺頁直蓋法" };

export const METHOD_SHORT: Record<Method, string> = { A: "摺頁橫蓋法", B: "側邊裝訂", C: "摺頁直蓋" };

export const UNIT_BYTES: Record<SizeUnit, number> = { MB: 1048576, KB: 1024 };

export const TARGET_RANGE: Record<SizeUnit, [number, number, number]> = { MB: [0.05, 2000, 2], KB: [50, 2048000, 2048] };

// Generic round seal used on method-card thumbnails until a real seal is uploaded.
export const PLACEHOLDER_SEAL =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'>` +
    `<circle cx='60' cy='60' r='52' fill='none' stroke='#BE3A2B' stroke-width='6'/>` +
    `<circle cx='60' cy='60' r='40' fill='none' stroke='#BE3A2B' stroke-width='2'/>` +
    `<text x='60' y='76' font-size='46' text-anchor='middle' fill='#BE3A2B' font-family='serif'>章</text></svg>`
  );

export const WM_COLORS: Record<WmColor, [number, number, number]> = { grey: [110, 98, 80], red: [190, 58, 43], black: [42, 35, 26] };
