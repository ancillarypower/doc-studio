// All app state, effects and actions (lifted verbatim from the artifact's App component).
// Sections read it through StudioContext, so the render tree can be split per 區 without prop drilling.
import { type Align, type EngineData, type Lang, type Method, type SanOptions, type ScanState } from "../types";
import { LABEL_ASCENT, LABEL_DESCENT } from "../pdf/font.js";
import { MM, labelX, mulberry32, planPlacement } from "../seal/plan.js";
import { PdfDoc, PdfError, deflate } from "../pdf/pdf.js";
import { SAN_DEFAULT, sanActive, sanDefaultsFor, sanSummary } from "../components/ScanPanel";
import { applyOpacity, canvasToPdfImage, halfBoundaries, inkCoverage, loadSealCanvas, rotateQuarter, rotateSeal, sliceBoundaries, splitVertical, toGrayscale } from "../seal/image.js";
import { buildLabels, generateSealedPdf } from "../seal/generate.js";
import { createRenderer } from "../pdf/render.js";
import { decryptPdf, probeEncryption } from "../pdf/crypt.js";
import { postprocessPdf } from "../pdf/postprocess.js";
import { sanitizePdf, scanPdf } from "../pdf/sanitize.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ALIGN_LABELS, APP_VERSION, MAX_PAGES, METHOD_NAMES, UNIT_BYTES } from "../lib/constants";
import { type FoldState, type LockedState, type LogEntry, type PdfInfo, type PlanPage, type PpResult, type ResultState, type SealState, type SizeUnit, type WmColor } from "./stateTypes";
import { b64ToBytes, buildWatermarkCanvas, bytesToB64, clampNum, clampTarget, errText, fmtBytes, fmtTarget, prepSealCanvas, repairMojibake, sanitizeBase } from "../lib/helpers";

export function useStudio() {
  const [pdfInfo, setPdfInfo] = useState<PdfInfo | null>(null); // {name, bytes, pages:[{w,h,rotate}], count, sizeNote}
  const [seal, setSeal] = useState<SealState | null>(null); // {canvas, url, info}
  const [method, setMethod] = useState<Method | null>(null); // "A" | "B" | "C"
  const [align, setAlign] = useState<Align>("center");
  const [lang, setLang] = useState<Lang>("tc");
  const [sealWmm, setSealWmm] = useState(30);
  const [sliceWmm, setSliceWmm] = useState(2.0);
  const [sealCount, setSealCount] = useState(1);
  const [grayscale, setGrayscale] = useState(false);
  const [sealOpacity, setSealOpacity] = useState(100); // 淡化: ink opacity %
  const [grayDoc, setGrayDoc] = useState(false); // 全文件轉灰階
  const [compressPdf, setCompressPdf] = useState(false); // 壓縮檔案
  const [compressQuality, setCompressQuality] = useState(80); // 檔案壓縮率 (JPEG re-encode quality %)
  const [compressMode, setCompressMode] = useState<"ratio" | "size">("ratio"); // "ratio" 依壓縮率 | "size" 依目標大小
  const [targetMB, setTargetMB] = useState<number | string>(2); // 目標檔案大小（數值，單位見 targetUnit）
  const [targetUnit, setTargetUnit] = useState<SizeUnit>("MB"); // "MB" | "KB"
  const [outName, setOutName] = useState(""); // 重新命名檔案 (base, no .pdf; empty = original name)
  const [rotMin, setRotMin] = useState(-10);
  const [rotMax, setRotMax] = useState(10);
  const [labelSize, setLabelSize] = useState(12);
  const [labelBottom, setLabelBottom] = useState(10);
  const [labelRot, setLabelRot] = useState(0);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const [joined, setJoined] = useState(false);
  const [busy, setBusy] = useState<string | null>(null); // progress string
  const [error, setError] = useState<string | null>(null);
  const [blankOK, setBlankOK] = useState(false);
  const [skipConflicts, setSkipConflicts] = useState(false);
  const [result, setResult] = useState<ResultState | null>(null); // {url, name, size, report}
  const [nudgeKey, setNudgeKey] = useState(0); // >0: 「產生用印 PDF」外框強調動畫（下載鈕搶先被點）
  const [stale, setStale] = useState(false); // 產出後又改過騎縫章/浮水印/產出設定：需重新用印
  const resultRef = useRef<ResultState | null>(null); resultRef.current = result;
  const [log, setLog] = useState<LogEntry[]>([]); // [{t, msg}] processing records
  // 貳區 檔案狀態：scan = null | {status:"scanning",done,total} | {status:"done",report} | {status:"error",msg}
  const [scan, setScan] = useState<ScanState | null>(null);
  const [san, setSan] = useState<SanOptions>(SAN_DEFAULT); // 淨化選項（產出時套用）
  const scanGen = useRef(0);
  const [fxRun, setFxRun] = useState(0); // >0: 傳國玉璽 stamping cinematic is playing
  // section key (s1..s8, sPw) → collapsed。上傳 PDF 前只展開壹、捌，其餘收合；上傳後參–捌展開。
  // 玖區（s8 處理紀錄）永遠收合，只有出現錯誤／失敗時才自動展開
  const FOLD_PRE_UPLOAD: FoldState = { sScan: true, sPw: true, s2: true, s3: true, s4: true, s5: true, s6: true, s8: true };
  const [fold, setFold] = useState<FoldState>(FOLD_PRE_UPLOAD);
  const toggleFold = (k: string) => setFold((f) => ({ ...f, [k]: !f[k] }));
  useEffect(() => { if (error) setFold((f) => ({ ...f, s8: false })); }, [error]); // 錯誤訊息 → 展開處理紀錄
  // 下載紀錄：純文字 .txt（UTF-8 BOM，Windows 記事本也能正確顯示中文）
  const [logUrl, setLogUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!log.length) { setLogUrl(null); return; }
    const body = ["印・章工廠 處理紀錄", `版本：v${APP_VERSION}`, `匯出時間：${new Date().toLocaleString("zh-TW", { hour12: false })}`, `共 ${log.length} 筆`, "",
      ...log.map((e) => `[${e.d ? e.d + " " : ""}${e.t}] ${e.msg}`)].join("\r\n");
    const u = URL.createObjectURL(new Blob(["\uFEFF" + body], { type: "text/plain;charset=utf-8" }));
    setLogUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [log]);
  const logFileName = (() => {
    const d = new Date(), z = (n: number) => String(n).padStart(2, "0");
    return `處理紀錄_${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}T${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}.txt`;
  })();
  // 浮水印 (watermark): full-page translucent text layer under seals and labels
  const [wmOn, setWmOn] = useState(false);
  const [wmText, setWmText] = useState("僅供參考");
  const [wmSize, setWmSize] = useState(64);
  const [wmOpacity, setWmOpacity] = useState(15);
  const [wmAngle, setWmAngle] = useState(-45);
  const [wmColor, setWmColor] = useState<WmColor>("grey");
  const [wmTile, setWmTile] = useState(false);
  const [wmFontReady, setWmFontReady] = useState(false);
  const pdfInputKey = useRef(0);
  // 貳區 加密文件選項 + 壹區 pending encrypted upload
  const [unlockPw, setUnlockPw] = useState(true); // 移除密碼後加印騎縫章或浮水印
  const [unlockPerm, setUnlockPerm] = useState(true); // 移除權限控制（owner password only）
  const [locked, setLockedState] = useState<LockedState | null>(null); // {name, bytes, probe, stage, pwError, cached}
  const lockedRef = useRef<LockedState | null>(null);
  const setLocked = (v: LockedState | null) => { lockedRef.current = v; setLockedState(v); };
  const s1Ref = useRef<HTMLElement>(null);
  const pwInputRef = useRef<HTMLInputElement>(null);

  // PDF 只收在壹區：拖放落在上傳框以外時，擋下瀏覽器預設的「直接開檔」（會洗掉整頁設定）
  useEffect(() => {
    const over = (e: DragEvent) => { if (e.dataTransfer?.types?.includes("Files")) e.preventDefault(); };
    const drop = (e: DragEvent) => {
      if (e.defaultPrevented || !e.dataTransfer?.types?.includes("Files")) return;
      e.preventDefault();
      setError("PDF 請拖曳到壹區的「拖曳 PDF 到這裡」上傳框。");
      setFold((f) => ({ ...f, s1: false }));
      s1Ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => { window.removeEventListener("dragover", over); window.removeEventListener("drop", drop); };
  }, []);

  // make sure the display faces are actually loaded before any watermark canvas is drawn
  useEffect(() => {
    let live = true;
    if (document.fonts?.load) {
      Promise.all([
        document.fonts.load('700 64px "Noto Sans TC"', wmText || "僅供參考"),
        document.fonts.load('900 64px "Noto Serif TC"', wmText || "僅供參考"),
      ]).then(() => { if (live) setWmFontReady(true); }).catch(() => {});
    }
    return () => { live = false; };
  }, [wmText]);

  // real page thumbnails for the 配置預覽 diagram: rendered on demand from the
  // actual PDF content, one page at a time so the UI never blocks
  const pdfDocRef = useRef<{ doc: EngineData; pageRefs: EngineData[] } | null>(null); // { doc, pageRefs } of the current upload
  const rendererRef = useRef<EngineData>(null);
  const [thumbs, setThumbs] = useState<Record<number, string>>({}); // pageIdx → dataURL
  const thumbGen = useRef(0); // bumped on every new upload: stale renders stop
  const thumbQ = useRef<{ pending: number[]; queued: Set<number>; running: boolean }>({ pending: [], queued: new Set(), running: false });
  const requestThumb = useCallback((pageIdx: number) => {
    const q = thumbQ.current;
    if (q.queued.has(pageIdx) || !pdfDocRef.current || !rendererRef.current) return;
    q.queued.add(pageIdx);
    q.pending.push(pageIdx);
    if (q.running) return;
    q.running = true;
    const gen = thumbGen.current;
    (async () => {
      while (q.pending.length) {
        if (gen !== thumbGen.current || !pdfDocRef.current) break;
        const idx = q.pending.shift()!;
        try {
          const cv = await rendererRef.current.renderPage(pdfDocRef.current.pageRefs[idx], 380);
          if (cv && gen === thumbGen.current) {
            let url = cv.toDataURL("image/webp", 0.85);
            if (!url.startsWith("data:image/webp")) url = cv.toDataURL();
            setThumbs((t) => (t[idx] ? t : { ...t, [idx]: url }));
          }
        } catch { /* the page keeps its placeholder card */ }
        await new Promise((r) => setTimeout(r, 0)); // let the UI breathe between pages
      }
      q.running = false;
    })();
  }, []);

  // high-resolution single-page render for the click-to-read zoom overlay
  const renderZoomPage = useCallback(async (pageIdx: number, width = 1200) => {
    if (!pdfDocRef.current || !rendererRef.current) return null;
    try {
      const cv = await rendererRef.current.renderPage(pdfDocRef.current.pageRefs[pageIdx], width);
      let url = cv.toDataURL("image/webp", 0.9);
      if (!url.startsWith("data:image/webp")) url = cv.toDataURL();
      return url;
    } catch { return null; }
  }, []);

  const isErrMsg = (msg: string) => /失敗|錯誤/.test(msg);
  const addLog = (msg: string) => {
    const d = new Date();
    setLog((l) => [...l, { t: d.toLocaleTimeString("zh-TW", { hour12: false }), d: d.toLocaleDateString("zh-TW"), msg }]);
    if (isErrMsg(msg)) setFold((f) => ({ ...f, s8: false })); // 出錯才展開處理紀錄
  };

  // ---------- file handlers ----------
  function resetPdfState() {
    thumbGen.current++;
    pdfDocRef.current = null;
    rendererRef.current = null;
    setThumbs({});
    thumbQ.current = { pending: [], queued: new Set(), running: false };
  }

  // load an unencrypted PDF into 壹區 (a fresh upload, or a decrypted file flowing back in)
  async function loadPlainPdf(bytes: Uint8Array, displayName: string, unlock: EngineData = null) {
    const doc = await PdfDoc.load(bytes);
    const pageRefs = await doc.getPageRefs();
    if (pageRefs.length > MAX_PAGES) throw new PdfError(`頁數過多（${pageRefs.length} 頁，上限 ${MAX_PAGES} 頁）`);
    const pages = pageRefs.map((p) => {
      const [x0, y0, x1, y1] = p.box;
      const w = x1 - x0, h = y1 - y0;
      return p.rotate % 180 === 0 ? { w, h, rotate: p.rotate } : { w: h, h: w, rotate: p.rotate };
    });
    // size summary
    const tally = new Map();
    for (const p of pages) {
      const key = `${Math.round(p.w)}×${Math.round(p.h)}`;
      tally.set(key, (tally.get(key) || 0) + 1);
    }
    const rotatedCount = pages.filter((p) => p.rotate !== 0).length;
    resetPdfState();
    setResult(null); setStale(false);
    setPdfInfo({ name: displayName, bytes, pages, count: pages.length, tally: [...tally.entries()], rotatedCount, unlock });
    pdfDocRef.current = { doc, pageRefs };
    rendererRef.current = createRenderer(doc);
    // 上傳 PDF 後展開參–捌（捌區可直接產出下載）；玖區維持收合；貳區僅在解密版本時展開
    setFold((f) => ({ ...f, sScan: false, s2: false, s3: false, s4: false, s5: false, s6: false, s7: false, sPw: unlock ? false : f.sPw }));
    setOutName(displayName.replace(/\.pdf$/i, "")); // 重新命名檔案 defaults to 原檔名
    pdfInputKey.current++;
    addLog(`載入 PDF「${displayName}」：${pages.length} 頁 · ${fmtBytes(bytes.length)}${rotatedCount ? ` · ${rotatedCount} 頁有旋轉` : ""}${unlock ? " · 已解密版本" : ""}`);
    runScan(bytes);
  }

  // 貳區 檔案狀態：背景掃描，換檔時舊掃描作廢
  async function runScan(bytes: Uint8Array) {
    const gen = ++scanGen.current;
    setSan(SAN_DEFAULT);
    setScan({ status: "scanning", done: 0, total: 0 });
    try {
      const report = await scanPdf(bytes, (done, total) => { if (gen === scanGen.current) setScan({ status: "scanning", done, total }); });
      if (gen !== scanGen.current) return;
      setScan({ status: "done", report });
      setSan(sanDefaultsFor(report));
      const found = [
        report.meta.detected && "中繼資料", report.history.detected && "舊版本／未引用物件", report.js.detected && "JavaScript／自動動作",
        report.attach.detected && "附件", report.links.detected && "連結", report.piece.detected && "PieceInfo／書籤",
        report.exif.detected && "EXIF", report.annots.detected && "註解／表單", report.layers.detected && "隱藏圖層",
        report.invisible.detected && "隱形文字", report.sig.detected && "數位簽章", report.hiddenText.detected && "疑似藏字",
      ].filter(Boolean);
      addLog(`檔案狀態掃描完成：${found.length ? `偵測到 ${found.join("、")}` : "沒有偵測到需要處理的項目"}`);
      if (report.js.detected || report.attach.detected) addLog("警示：發現 JavaScript／附件／Launch 等主動內容，已預設勾選淨化");
      if (report.sig.detected) addLog("提醒：原檔含數位簽章，用印後簽章必定失效，請先淨化再簽章");
    } catch (e) {
      if (gen !== scanGen.current) return;
      setScan({ status: "error", msg: errText(e) });
      addLog("檔案狀態掃描失敗：" + errText(e));
    }
  }
  function clearScan() { scanGen.current++; setScan(null); setSan(SAN_DEFAULT); }

  // 淨化（產出時）：壓縮／灰階之後、用印之前
  async function runSanitize(bytes: Uint8Array) {
    if (!sanActive(san)) return null;
    setBusy("淨化文件…");
    const r = await sanitizePdf(bytes, san, (msg) => setBusy(msg));
    const s = r.stats;
    const bits = [
      san.meta && `中繼資料 ${s.metaRemoved} 處`, san.js && `主動內容 ${s.jsRemoved} 處`, san.attach && `附件 ${s.attachRemoved} 處`,
      san.links !== "keep" && `連結 ${s.linksRemoved} 個`, san.piece && `PieceInfo ${s.pieceRemoved} 處`, san.outlines && s.outlinesRemoved && "書籤",
      san.exif && `EXIF ${s.exifStripped} 張（省 ${fmtBytes(s.exifBytes)}）`,
      san.flatten && `註解表單 ${s.annotsRemoved} 個（攤平 ${s.flattened}${s.flattenNoAP ? `，${s.flattenNoAP} 個無外觀` : ""}）`,
      san.ocg && `隱藏圖層內容 ${s.ocSpans + s.ocDos} 段`, san.invisible && `隱形文字 ${s.invisibleText} 段`,
    ].filter(Boolean);
    addLog(`淨化完成：${bits.join(" · ")}${bits.length ? " · " : ""}物件 ${s.objectsBefore} → ${s.objectsAfter}（只保留現行版本）· ${fmtBytes(bytes.length)} → ${fmtBytes(r.bytes.length)}`);
    if (s.contentSkipped) addLog(`注意：${s.contentSkipped} 個內容流使用不支援的壓縮格式，未做圖層／隱形文字淨化`);
    return { bytes: r.bytes, desc: sanSummary(san) };
  }

  function unloadPdf() {
    resetPdfState();
    clearScan();
    setPdfInfo(null); setResult(null); setStale(false);
    setFold((f) => ({ ...f, ...FOLD_PRE_UPLOAD, s1: false, s7: false })); // 卸下 PDF：回到上傳前的收合狀態
  }

  async function handlePdf(file: File) {
    setError(null); setResult(null); setStale(false);
    setLocked(null);
    resetPdfState();
    clearScan();
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const displayName = repairMojibake(file.name);
      try {
        await loadPlainPdf(bytes, displayName);
      } catch (e) {
        if (!(e instanceof PdfError && e.message === "ENCRYPTED")) throw e;
        setPdfInfo(null);
        let probe;
        try { probe = await probeEncryption(bytes); }
        catch (pe) {
          throw new PdfError(errText(pe) === "UNSUPPORTED_SECURITY" ? "這份 PDF 使用憑證或非標準加密，無法在瀏覽器內解除。" : "無法讀取加密設定：" + errText(pe));
        }
        addLog(`偵測到加密 PDF「${displayName}」：${probe.algo} · ${probe.ownerOnly ? `僅設權限密碼${probe.denied.length ? `（禁止${probe.denied.join("、")}）` : ""}` : "需要開啟密碼"}`);
        await applyLocked({ name: displayName, bytes, probe, stage: "",  pwError: null, cached: null }, { pw: unlockPw, perm: unlockPerm });
      }
    } catch (e) {
      setPdfInfo(null);
      const msg = e instanceof PdfError && e.message !== "ENCRYPTED" && !/^[A-Za-z]/.test(e.message) ? e.message : "無法解析這份 PDF：" + errText(e);
      setError(msg);
      addLog("PDF 載入失敗：" + msg);
    }
  }

  // route an encrypted upload by the two 貳區 options: blocked / auto-unlock / ask for password
  async function applyLocked(entry: LockedState, flags: { pw: boolean; perm: boolean }) {
    const kind = entry.probe.ownerOnly ? "perm" : "pw";
    const allowed = kind === "perm" ? flags.perm : flags.pw;
    if (!allowed) {
      unloadPdf();
      setLocked({ ...entry, stage: kind === "perm" ? "blocked-perm" : "blocked-pw", pwError: null });
      return;
    }
    if (entry.cached) {
      setLocked({ ...entry, stage: "unlocked" });
      await loadPlainPdf(entry.cached.bytes, entry.name, entry.cached.unlock);
      return;
    }
    if (kind === "pw") {
      unloadPdf();
      setLocked({ ...entry, stage: "need-pw", pwError: null });
      setTimeout(() => pwInputRef.current?.focus(), 60);
      return;
    }
    await unlockWith(entry, "");
  }

  async function unlockWith(entry: LockedState, password: string) {
    setLocked({ ...entry, stage: "working", pwError: null });
    await new Promise((r) => setTimeout(r, 30)); // let 「解密中…」 paint first
    try {
      const dec = await decryptPdf(entry.bytes, password);
      if (!dec) {
        setLocked({ ...entry, stage: "need-pw", pwError: "密碼不正確，請再試一次。" });
        addLog("解除密碼失敗：密碼不正確");
        setTimeout(() => { pwInputRef.current?.focus(); pwInputRef.current?.select(); }, 60);
        return;
      }
      const unlock = { kind: entry.probe.ownerOnly ? "perm" : "pw", algo: dec.algo, as: dec.as, denied: dec.denied };
      const next = { ...entry, stage: "unlocked", pwError: null, cached: { bytes: dec.bytes, unlock } };
      setLocked(next);
      addLog(unlock.kind === "perm"
        ? `已自動解除權限限制（${dec.algo}${dec.denied.length ? `；原檔禁止${dec.denied.join("、")}` : ""}），未加密版本回到壹區`
        : `已用${dec.as === "owner" ? "擁有者" : "開啟"}密碼解密（${dec.algo}），未加密版本回到壹區`);
      await loadPlainPdf(dec.bytes, entry.name, unlock);
    } catch (e) {
      // surface the failure on the card itself too, so 解除密碼 never looks like it did nothing
      setLocked({ ...entry, stage: entry.probe.ownerOnly ? "blocked-perm" : "need-pw", pwError: "解密失敗：" + errText(e) });
      setError("解密失敗：" + errText(e));
      addLog("解密失敗：" + errText(e));
    }
  }

  // 貳區 option toggled while an encrypted upload is pending/unlocked → 回流壹區
  function toggleUnlock(which: "pw" | "perm", value: boolean) {
    const flags = { pw: which === "pw" ? value : unlockPw, perm: which === "perm" ? value : unlockPerm };
    if (which === "pw") setUnlockPw(value); else setUnlockPerm(value);
    const entry = lockedRef.current;
    if (!entry) return;
    const kind = entry.probe.ownerOnly ? "perm" : "pw";
    if (kind !== which) return;
    const label = which === "pw" ? "移除密碼後加印騎縫章或浮水印" : "移除權限控制";
    addLog(value ? `勾選「${label}」：回到壹區處理加密文件` : `取消「${label}」：已卸下解密後的文件`);
    setError(null);
    setFold((f) => ({ ...f, s1: false }));
    applyLocked(entry, flags);
    setTimeout(() => s1Ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }

  async function handleSeal(file: File) {
    // 統一只在壹區 PDF 框處理 PDF：丟進印章框的 PDF 自動改走 PDF 上傳
    if (file && (file.type === "application/pdf" || /\.pdf$/i.test(file.name))) {
      addLog("印章框收到 PDF，已改當作文件上傳");
      return handlePdf(file);
    }
    setError(null); setResult(null); setStale(false);
    try {
      const raw = await loadSealCanvas(file);
      // small preview of the untrimmed original, for the scissor-cut transition
      const pk = Math.min(1, 240 / Math.max(raw.width, raw.height));
      let origUrl;
      if (pk < 1) {
        const pc = document.createElement("canvas");
        pc.width = Math.round(raw.width * pk); pc.height = Math.round(raw.height * pk);
        pc.getContext("2d")!.drawImage(raw, 0, 0, pc.width, pc.height);
        origUrl = pc.toDataURL();
      } else {
        origUrl = raw.toDataURL();
      }
      const { canvas, trimmed, downscaled, bgRemoved } = prepSealCanvas(raw);
      setSeal({
        canvas, url: canvas.toDataURL(), origUrl,
        info: { origW: trimmed.origW, origH: trimmed.origH, w: canvas.width, h: canvas.height, trimmed: trimmed.trimmed, downscaled, bgRemoved, bytes: file.size },
      });
      addLog(`載入印章圖片「${repairMojibake(file.name)}」：${trimmed.origW}×${trimmed.origH} → ${canvas.width}×${canvas.height}px${downscaled ? " · 已縮小以加速處理" : ""}${bgRemoved ? " · 已去除白色背景" : ""}`);
    } catch (e) {
      setSeal(null);
      setError("無法讀取印章圖片：" + errText(e));
      addLog("印章圖片載入失敗：" + errText(e));
    }
  }

  // grayscale variant of the uploaded seal (alpha preserved); null until a seal exists
  const sealCanvas = useMemo(() => {
    if (!seal) return null;
    let c = grayscale ? toGrayscale(seal.canvas) : seal.canvas;
    if (sealOpacity < 100) c = applyOpacity(c, sealOpacity);
    return c;
  }, [seal, grayscale, sealOpacity]);

  // ---------- planning ----------
  const basePlan = useMemo(() => {
    if (!pdfInfo || !seal || !sealCanvas || !method) return null;
    const rng = mulberry32(seed);
    const pages = pdfInfo.pages;
    const N = pages.length;
    const labels = buildLabels(N, lang, align, undefined, labelSize);
    const labelHeightPt = (LABEL_ASCENT + LABEL_DESCENT) * labelSize;
    const rLo = Math.min(rotMin, rotMax), rHi = Math.max(rotMin, rotMax);
    const planOpts = { align, labelHeightPt, labelWidths: labels.map((l) => l.w), rng, count: sealCount, labelBottomPt: labelBottom * MM, labelRotDeg: labelRot };

    if (method === "A" || method === "C") {
      // 橫蓋: seal as-is; 直蓋: pre-rotate 90° so the seal crosses the seam vertically
      const base = method === "C" ? rotateQuarter(sealCanvas) : sealCanvas;
      const scale = (sealWmm * MM) / base.width;
      // draw per-seal angles first, then rotate canvases
      const angleDraws = [];
      for (let i = 0; i < (N - 1) * sealCount; i++) angleDraws.push(rLo + rng() * (rHi - rLo));
      const rots = angleDraws.map((a) => rotateSeal(base, a));
      // worst-case dims for safe planning
      const worstW = Math.max(...rots.map((r) => r.width)) * scale;
      const worstH = Math.max(...rots.map((r) => r.height)) * scale;
      const res = planPlacement({ pages, seal: { w: worstW, h: worstH }, method: "A", ...planOpts });
      // rebuild placements with actual rotated canvases, centered at planned cy
      const pagesPlan: PlanPage[] = pages.map(() => ({ seals: [], label: null }));
      const diagram: PlanPage[] = pages.map(() => ({ seals: [], label: null }));
      const parts: EngineData[] = []; // canvases per seal part
      res.notes.filter((n: EngineData) => n.type === "pair").forEach((note: EngineData) => {
        const i = note.pair - 1;
        const slot = note.slot ?? 0;
        const ri = i * sealCount + slot; // angleDraws index (conflicting pairs still consumed draws)
        const rot = rots[ri];
        const [lb, rb] = halfBoundaries(rot.width);
        const [leftC, rightC] = splitVertical(rot, [lb, rb]);
        const leftWpt = leftC.width * scale, rightWpt = rightC.width * scale, hpt = rot.height * scale;
        const cy = note.cy;
        const y = cy - hpt / 2;
        const pi = i, pj = i + 1;
        const keyL = `p${i}s${slot}L`, keyR = `p${i}s${slot}R`;
        pagesPlan[pi].seals.push({ imgKey: keyL, x: pages[pi].w - leftWpt, y, w: leftWpt, h: hpt });
        pagesPlan[pj].seals.push({ imgKey: keyR, x: 0, y, w: rightWpt, h: hpt });
        diagram[pi].seals.push({ dataURL: leftC.toDataURL(), x: pages[pi].w - leftWpt, y, w: leftWpt, h: hpt });
        diagram[pj].seals.push({ dataURL: rightC.toDataURL(), x: 0, y, w: rightWpt, h: hpt });
        parts.push({ key: keyL, canvas: leftC }, { key: keyR, canvas: rightC });
      });
      pages.forEach((p, i) => {
        const text = labels[i].text;
        const w = labels[i].w;
        let x = labelX(align, p.w, w);
        let yB = labelBottom * MM;
        if (labelRot < 0) {
          // clockwise-rotated labels descend to the right: raise the origin so the
          // lowest glyph stays on the page; right-aligned runs end at the right margin
          const rad = (-labelRot * Math.PI) / 180;
          yB += w * Math.sin(rad);
          if (align === "right") x = p.w - 10 * MM - w * Math.cos(rad);
        } else if (labelRot > 0 && align === "right") {
          // counterclockwise runs ascend to the right: pull the origin left so the
          // ascending (top-right) end still lands on the right margin
          const rad = (labelRot * Math.PI) / 180;
          x = p.w - 10 * MM - w * Math.cos(rad);
        }
        pagesPlan[i].label = { text, x, yBottom: yB, w, size: labelSize, rot: labelRot };
        diagram[i].label = { x, w, bottomMm: yB / MM, rot: labelRot };
      });
      return { res, pagesPlan, diagram, parts, labels, conflicts: res.conflicts, blanks: [], scale };
    }
    // method B: `sealCount` strips, each sliced across all pages at its own angle
    const N2 = pages.length;
    const strips = [];
    for (let j = 0; j < sealCount; j++) {
      const angle = rLo + rng() * (rHi - rLo);
      const rot = rotateSeal(sealCanvas, angle);
      const scale = (N2 * sliceWmm * MM) / rot.width;
      strips.push({ angle, rot, scale, hpt: rot.height * scale });
    }
    const worstH = Math.max(...strips.map((s) => s.hpt));
    const res = planPlacement({ pages, seal: { w: N2 * sliceWmm * MM, h: worstH }, method, ...planOpts });
    const sliceNotes = res.notes.filter((n: EngineData) => n.type === "slices");
    const pagesPlan: PlanPage[] = pages.map(() => ({ seals: [], label: null }));
    const diagram: PlanPage[] = pages.map(() => ({ seals: [], label: null }));
    const parts: EngineData[] = [];
    const blanksSet = new Set<number>();
    strips.forEach((st, j) => {
      const note = sliceNotes.find((n: EngineData) => (n.slot ?? 0) === j);
      if (!note) return;
      const slices = splitVertical(st.rot, sliceBoundaries(st.rot.width, N2));
      slices.forEach((c: HTMLCanvasElement, i: number) => { if (inkCoverage(c) < 0.005) blanksSet.add(i + 1); });
      const sliceWpt = sliceWmm * MM;
      const y = note.cy - st.hpt / 2;
      slices.forEach((c: HTMLCanvasElement, i: number) => {
        const key = `s${i}t${j}`;
        pagesPlan[i].seals.push({ imgKey: key, x: pages[i].w - sliceWpt, y, w: sliceWpt, h: st.hpt });
        diagram[i].seals.push({ dataURL: c.toDataURL(), x: pages[i].w - sliceWpt, y, w: sliceWpt, h: st.hpt });
        parts.push({ key, canvas: c });
      });
    });
    const blanks = [...blanksSet].sort((a, b) => a - b);
    pages.forEach((p, i) => {
      const text = labels[i].text;
      const w = labels[i].w;
      let x = labelX(align, p.w, w);
      let yB = labelBottom * MM;
      if (labelRot < 0) {
        // clockwise-rotated labels descend to the right: raise the origin so the
        // lowest glyph stays on the page; right-aligned runs end at the right margin
        const rad = (-labelRot * Math.PI) / 180;
        yB += w * Math.sin(rad);
        if (align === "right") x = p.w - 10 * MM - w * Math.cos(rad);
      } else if (labelRot > 0 && align === "right") {
        // counterclockwise runs ascend to the right: pull the origin left so the
        // ascending (top-right) end still lands on the right margin
        const rad = (labelRot * Math.PI) / 180;
        x = p.w - 10 * MM - w * Math.cos(rad);
      }
      pagesPlan[i].label = { text, x, yBottom: yB, w, size: labelSize, rot: labelRot };
      diagram[i].label = { x, w, bottomMm: yB / MM, rot: labelRot };
    });
    return { res, pagesPlan, diagram, parts, labels, conflicts: res.conflicts, blanks, angle: strips[0].angle, scale: strips[0].scale };
  }, [pdfInfo, seal, sealCanvas, method, align, lang, sealWmm, sliceWmm, sealCount, labelSize, labelBottom, labelRot, seed, rotMin, rotMax]);

  // 浮水印 layer: one translucent full-page image per unique page size, prepended under
  // each page's seal parts (so seals + page numbers print over it, over the page content)
  const plan = useMemo(() => {
    if (!basePlan || !pdfInfo) return basePlan;
    const text = wmText.trim();
    if (!wmOn || !text) return basePlan;
    void wmFontReady; // re-render the canvas once webfonts are confirmed loaded
    const cache = new Map<string, { key: string; canvas: HTMLCanvasElement; dataURL: string }>(); // sizeKey → {key, canvas, dataURL}
    const getWm = (p: { w: number; h: number }) => {
      const sk = `${Math.round(p.w)}x${Math.round(p.h)}`;
      if (!cache.has(sk)) {
        const canvas = buildWatermarkCanvas({ text, sizePt: wmSize, opacityPct: wmOpacity, angleDeg: wmAngle, color: wmColor, tile: wmTile, pageWpt: p.w, pageHpt: p.h });
        cache.set(sk, { key: `wm:${sk}`, canvas, dataURL: canvas.toDataURL() });
      }
      return cache.get(sk)!;
    };
    const pagesPlan = basePlan.pagesPlan.map((pp, i) => {
      const p = pdfInfo.pages[i];
      const wm = getWm(p);
      return { ...pp, seals: [{ imgKey: wm.key, x: 0, y: 0, w: p.w, h: p.h }, ...pp.seals] };
    });
    const diagram = basePlan.diagram.map((pd, i) => {
      const p = pdfInfo.pages[i];
      const wm = getWm(p);
      return { ...pd, seals: [{ dataURL: wm.dataURL, x: 0, y: 0, w: p.w, h: p.h }, ...pd.seals] };
    });
    const wmParts = [...cache.values()].map((v) => ({ key: v.key, canvas: v.canvas }));
    return { ...basePlan, pagesPlan, diagram, parts: [...wmParts, ...basePlan.parts] };
  }, [basePlan, pdfInfo, wmOn, wmText, wmSize, wmOpacity, wmAngle, wmColor, wmTile, wmFontReady]);

  const ready = !!(pdfInfo && seal && method && plan);
  const hasConflicts = (plan?.conflicts?.length || 0) > 0;
  const hasBlanks = method === "B" && (plan?.blanks?.length || 0) > 0;
  // 捌區只要有 PDF 就能產出：印章/方式未備齊時走「不用印」輸出（僅套用產出設定）
  const outputOnly = !!pdfInfo && !ready;
  const canGenerate = !!pdfInfo && !busy && (outputOnly || ((!hasConflicts || skipConflicts) && (!hasBlanks || blankOK)));
  // 貳區：解密後才啟用；解密後可直接下載未加密版本
  const decrypted = !!locked?.cached;
  const decUrl = useMemo(() => (locked?.cached ? URL.createObjectURL(new Blob([locked.cached.bytes], { type: "application/pdf" })) : null), [locked?.cached]);
  useEffect(() => () => { if (decUrl) URL.revokeObjectURL(decUrl); }, [decUrl]);
  const decName = locked ? `${sanitizeBase(locked.name.replace(/\.pdf$/i, "")) || "document"}_已解密.pdf` : "";
  // 解密前（原始加密檔）
  const origUrl = useMemo(() => (locked?.bytes ? URL.createObjectURL(new Blob([locked.bytes], { type: "application/pdf" })) : null), [locked?.bytes]);
  useEffect(() => () => { if (origUrl) URL.revokeObjectURL(origUrl); }, [origUrl]);
  const origName = locked ? `${sanitizeBase(locked.name.replace(/\.pdf$/i, "")) || "document"}_未解密.pdf` : "";

  // any config change (a new plan) invalidates the old output: download button goes back to grey;
  // if output had already been produced, flag 需重新用印 so the generate button keeps pulsing
  useEffect(() => { if (resultRef.current) setStale(true); setResult(null); }, [plan]);

  // output options: 全文件灰階 / 壓縮 change the content → regenerate; 重新命名 only renames the download
  const pdfBase = pdfInfo ? pdfInfo.name.replace(/\.pdf$/i, "") : "";
  const finalFileName = (sanitizeBase(outName) || pdfBase || "output") + ".pdf";
  useEffect(() => { if (resultRef.current) setStale(true); setResult(null); }, [grayDoc, compressPdf, compressQuality, compressMode, targetMB, targetUnit, san]);

  // 下載鈕搶先被點：「產生用印 PDF」外框閃爍幾秒後自動停止
  useEffect(() => {
    if (!nudgeKey) return;
    const t = setTimeout(() => setNudgeKey(0), 3000);
    return () => clearTimeout(t);
  }, [nudgeKey]);
  useEffect(() => { setResult((r) => (r ? { ...r, name: finalFileName } : r)); }, [finalFileName]);

  // ---------- document post-processing (grayscale / compression) ----------
  // ratio mode: one pass at the chosen JPEG quality.
  // size mode: search for the highest JPEG quality whose output fits the target; if even the
  // lowest quality is too big, downsample images step by step. overheadBytes reserves room
  // for what gets appended afterwards (seal images, label font).
  // Returns { bytes, stats, q, scale, target, reached } or null when the original should be kept.
  async function runPostprocess(overheadBytes = 0): Promise<PpResult | null> {
    if (!grayDoc && !compressPdf) return null;
    if (!pdfInfo) return null; // unreachable: generation requires an uploaded PDF
    const src = pdfInfo.bytes;
    const pass = (q: number | null, scale = 1, tag = "") => postprocessPdf(src, {
      grayscale: grayDoc, jpegQuality: q, jpegScale: scale,
      onProgress: (i, n) => setBusy(`文件後製處理${tag}… ${i}/${n}`),
    });
    const keepOrig = (pp: { bytes: Uint8Array }) => !grayDoc && compressPdf && pp.bytes.length > src.length;
    if (!compressPdf || compressMode === "ratio") {
      const q = compressPdf ? clampNum(compressQuality, 10, 100, 80) : 0;
      const pp = await pass(compressPdf ? q / 100 : null);
      if (keepOrig(pp)) { addLog(`壓縮後檔案反而變大（${fmtBytes(pp.bytes.length)} > ${fmtBytes(src.length)}），已改用原檔內容`); return null; }
      return { bytes: pp.bytes, stats: pp.stats, q, scale: 1, target: 0, reached: true };
    }
    const target = Math.round(clampTarget(targetMB, targetUnit) * UNIT_BYTES[targetUnit]);
    const budget = Math.max(1024, target - overheadBytes);
    addLog(`目標大小壓縮：目標 ${fmtBytes(target)}${overheadBytes ? `（預留印章 ${fmtBytes(overheadBytes)}）` : ""} · 原檔 ${fmtBytes(src.length)}`);
    let best: PpResult | null = null; // smallest attempt so far
    const tryPass = async (q: number, scale: number): Promise<PpResult> => {
      const pp = await pass(q / 100, scale, `（品質 ${q}%${scale < 1 ? ` · 解析度 ${Math.round(scale * 100)}%` : ""}）`);
      const r: PpResult = { bytes: pp.bytes, stats: pp.stats, q, scale, target };
      if (!best || r.bytes.length < best.bytes.length) best = r;
      return r;
    };
    // 1) highest quality that fits (binary search on 10–95 in 5% steps)
    let fit: PpResult | null = null;
    const top = await tryPass(95, 1);
    if (top.bytes.length <= budget) fit = top;
    else {
      let lo = 2, hi = 18; // quality = k*5
      const bottom = await tryPass(10, 1);
      if (bottom.bytes.length <= budget) {
        fit = bottom;
        while (hi - lo > 1) {
          const mid = (lo + hi) >> 1;
          const r = await tryPass(mid * 5, 1);
          if (r.bytes.length <= budget) { fit = r; lo = mid; } else hi = mid;
        }
      } else {
        // 2) still too big: downsample images, keeping a readable quality
        for (const scale of [0.75, 0.5, 0.35, 0.25]) {
          const r = await tryPass(60, scale);
          if (r.bytes.length <= budget) { fit = r; break; }
        }
      }
    }
    const pick = (fit || best)!;
    addLog(fit
      ? `目標大小壓縮完成：圖片品質 ${pick.q}%${pick.scale < 1 ? ` · 解析度 ${Math.round(pick.scale * 100)}%` : ""} → ${fmtBytes(pick.bytes.length)}`
      : `目標大小壓縮未達標：最小只能壓到 ${fmtBytes(pick.bytes.length)}（目標 ${fmtBytes(target)}），文件多為文字或向量內容時可壓縮空間有限`);
    if (keepOrig(pick)) { addLog(`壓縮後檔案反而變大，已改用原檔內容`); return null; }
    return { ...pick, reached: !!fit };
  }
  const compressLabel = (pp: PpResult | null) => pp && compressPdf
    ? `${pp.target ? `目標 ${fmtBytes(pp.target)} · ` : ""}圖片品質 ${pp.q}%${pp.scale < 1 ? ` · 解析度 ${Math.round(pp.scale * 100)}%` : ""}`
    : "";

  // ---------- generation ----------
  async function generate() {
    if (!canGenerate) return;
    if (outputOnly) return generatePlain();
    if (!pdfInfo || !seal || !method || !plan) return; // unreachable: !outputOnly means all four are set
    setFxRun((k) => k + 1); // play the 活字鉛字章 cinematic alongside generation
    const t0 = performance.now();
    const rLo = Math.min(rotMin, rotMax), rHi = Math.max(rotMin, rotMax);
    addLog(`開始產生 · ${METHOD_NAMES[method]} · ${grayscale ? "灰階" : "原色"}${sealOpacity < 100 ? ` · 淡化 ${sealOpacity}%` : ""} · 旋轉 ${rLo}°～${rHi}° · 種子 ${seed}${sealCount > 1 ? ` · 章數 ${sealCount}` : ""}${wmOn && wmText.trim() ? ` · 浮水印「${wmText.trim()}」` : ""}`);
    setBusy("準備印章影像…"); setError(null);
    try {
      const sealImages = [];
      for (const p of plan.parts) {
        const img = await canvasToPdfImage(p.canvas, deflate);
        sealImages.push({ key: p.key, ...img });
      }
      addLog(`印章影像準備完成：${sealImages.length} 張切片 · RGB+Alpha 壓縮`);
      // optional document post-processing (grayscale / compression) on the base file,
      // before the seal overlay is appended
      let srcBytes = pdfInfo.bytes;
      let ppStats: EngineData = null;
      let ppRes: PpResult | null = null;
      if (grayDoc || compressPdf) {
        setBusy("文件後製處理…");
        // 預留印章影像 + 頁碼字型的空間，讓最終檔案也落在目標大小內
        const overhead = sealImages.reduce((n, im) => n + (im.rgb?.length || 0) + (im.mask?.length || 0), 0) + 60000;
        ppRes = await runPostprocess(overhead);
        if (ppRes) {
          srcBytes = ppRes.bytes;
          ppStats = ppRes.stats;
          addLog(`後製完成：${grayDoc ? "全文件灰階 · " : ""}${compressPdf ? `${compressLabel(ppRes)} · ` : ""}${fmtBytes(pdfInfo.bytes.length)} → ${fmtBytes(ppRes.bytes.length)}（內容流 ${ppRes.stats.contents} 條 · 圖片 ${ppRes.stats.images} 張）`);
        }
      }
      // 貳區淨化：整份重寫（只保留追得到的物件），印章再以增量方式疊上
      const sanRes = await runSanitize(srcBytes);
      if (sanRes) srcBytes = sanRes.bytes;
      setBusy("寫入 PDF 頁面…");
      const res = await generateSealedPdf({
        pdfBytes: srcBytes, pagesPlan: plan.pagesPlan, sealImages, lang,
        onProgress: (i: number, n: number) => setBusy(`寫入 PDF 頁面… ${i}/${n}`),
      });
      const blob = new Blob([res.bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const name = finalFileName;
      setResult({
        url, name, size: res.bytes.length,
        report: {
          verified: res.verified, count: res.pageCount,
          method, align, lang, seed,
          grayscale, sealOpacity, rotMin: rLo, rotMax: rHi,
          sealCount, labelSize, labelBottom, labelRot,
          blanks: plan.blanks, blankOK,
          conflicts: plan.conflicts, skipped: skipConflicts,
          wm: wmOn && wmText.trim() ? { text: wmText.trim(), size: wmSize, opacity: wmOpacity, angle: wmAngle, color: wmColor, tile: wmTile } : null,
          grayDoc, compressQ: compressPdf && ppStats ? ppRes!.q : 0, compressDesc: compressPdf && ppStats ? compressLabel(ppRes) : "",
          srcSize: pdfInfo.bytes.length, baseSize: srcBytes.length,
          sanDesc: sanRes ? sanRes.desc : "", sigWarn: !!(scan?.status === "done" && scan.report?.sig.detected),
          sealInfo: seal.info,
          dpi: Math.round(((method === "C" ? seal.canvas.height : seal.canvas.width) / (sealWmm / 25.4)) || 0),
        },
      });
      setStale(false);
      const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
      addLog(`寫入完成：${res.pageCount} 頁覆蓋 · 頁數核對 ${res.verified ? "✓ 通過" : "✗ 不符"}`);
      addLog(`產生完成：${name}（${fmtBytes(res.bytes.length)}）· 耗時 ${elapsed} 秒 · 頁碼 ${lang === "tc" ? "繁中" : "EN"}/${ALIGN_LABELS[align]}`);
      if (ppRes && ppRes.target && res.bytes.length > ppRes.target) addLog(`注意：用印後檔案 ${fmtBytes(res.bytes.length)} 仍超過目標 ${fmtBytes(ppRes.target)}`);
      window.__sealOutB64 = bytesToB64(res.bytes);
      setBusy(null);
    } catch (e) {
      setBusy(null);
      setError("產生失敗：" + errText(e));
      addLog("產生失敗：" + errText(e));
    }
  }

  // 不用印輸出：只套用捌區的壓縮／灰階／重新命名
  async function generatePlain() {
    if (!pdfInfo) return; // unreachable: 捌區 requires an uploaded PDF
    const t0 = performance.now();
    addLog(`開始產生（不用印）${sanActive(san) ? " · 淨化" : ""}${grayDoc ? " · 全文件灰階" : ""}${compressPdf ? (compressMode === "size" ? ` · 壓縮至 ${fmtTarget(targetMB, targetUnit)}` : ` · 壓縮 ${clampNum(compressQuality, 10, 100, 80)}%`) : ""}`);
    setBusy("準備輸出…"); setError(null);
    try {
      let outBytes = pdfInfo.bytes;
      let compressQ = 0;
      let compressDesc = "";
      if (grayDoc || compressPdf) {
        setBusy("文件後製處理…");
        const pp = await runPostprocess(0);
        if (pp) {
          outBytes = pp.bytes;
          compressQ = compressPdf ? pp.q : 0;
          compressDesc = compressPdf ? compressLabel(pp) : "";
        }
      }
      const sanRes = await runSanitize(outBytes);
      if (sanRes) outBytes = sanRes.bytes;
      let count = pdfInfo.count;
      try { count = (await (await PdfDoc.load(outBytes)).getPageRefs()).length; } catch { count = -1; }
      const url = URL.createObjectURL(new Blob([outBytes], { type: "application/pdf" }));
      setResult({
        url, name: finalFileName, size: outBytes.length,
        report: { plain: true, verified: count === pdfInfo.count, count, grayDoc, compressQ, compressDesc, srcSize: pdfInfo.bytes.length, unlock: pdfInfo.unlock || null, sanDesc: sanRes ? sanRes.desc : "" },
      });
      setStale(false);
      addLog(`產生完成（不用印）：${finalFileName}（${fmtBytes(outBytes.length)}）· 耗時 ${((performance.now() - t0) / 1000).toFixed(1)} 秒`);
      setBusy(null);
    } catch (e) {
      setBusy(null);
      setError("產生失敗：" + errText(e));
      addLog("產生失敗：" + errText(e));
    }
  }

  // hidden E2E hook (used by automated tests)
  useEffect(() => {
    window.__sealTest = async (pdfB64: string, pngB64: string, opts: EngineData = {}) => {
      const bytes = b64ToBytes(pdfB64);
      const doc = await PdfDoc.load(bytes);
      const pageRefs = await doc.getPageRefs();
      const pages = pageRefs.map((p) => {
        const [x0, y0, x1, y1] = p.box;
        const w = x1 - x0, h = y1 - y0;
        return p.rotate % 180 === 0 ? { w, h, rotate: p.rotate } : { w: h, h: w, rotate: p.rotate };
      });
      setPdfInfo({ name: "e2e.pdf", bytes, pages, count: pages.length, tally: [], rotatedCount: 0 });
      const img = new Image();
      img.src = "data:image/png;base64," + pngB64;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      c.getContext("2d")!.drawImage(img, 0, 0);
      if (opts.realSeal) {
        const { canvas, trimmed, downscaled, bgRemoved } = prepSealCanvas(c);
        setSeal({ canvas, url: canvas.toDataURL(), info: { w: canvas.width, h: canvas.height, trimmed: trimmed.trimmed, origW: trimmed.origW, origH: trimmed.origH, downscaled, bgRemoved } });
      } else {
        setSeal({ canvas: c, url: c.toDataURL(), info: { w: c.width, h: c.height } });
      }
      if (opts.method) setMethod(opts.method);
      if (opts.align) setAlign(opts.align);
      if (opts.lang) setLang(opts.lang);
      if (opts.seed !== undefined) setSeed(opts.seed);
      if (opts.grayscale !== undefined) setGrayscale(opts.grayscale);
      if (opts.sealOpacity !== undefined) setSealOpacity(opts.sealOpacity);
      if (opts.rotMin !== undefined) setRotMin(opts.rotMin);
      if (opts.rotMax !== undefined) setRotMax(opts.rotMax);
      if (opts.sealCount !== undefined) setSealCount(opts.sealCount);
      if (opts.labelSize !== undefined) setLabelSize(opts.labelSize);
      if (opts.labelBottom !== undefined) setLabelBottom(opts.labelBottom);
      if (opts.labelRot !== undefined) setLabelRot(opts.labelRot);
      if (opts.grayDoc !== undefined) setGrayDoc(opts.grayDoc);
      if (opts.compressPdf !== undefined) setCompressPdf(opts.compressPdf);
      if (opts.compressQuality !== undefined) setCompressQuality(opts.compressQuality);
      if (opts.compressMode !== undefined) setCompressMode(opts.compressMode);
      if (opts.targetMB !== undefined) setTargetMB(opts.targetMB);
      if (opts.targetUnit !== undefined) setTargetUnit(opts.targetUnit);
      if (opts.outName !== undefined) setOutName(opts.outName);
      if (opts.wmOn !== undefined) setWmOn(opts.wmOn);
      if (opts.wmText !== undefined) setWmText(opts.wmText);
      if (opts.wmSize !== undefined) setWmSize(opts.wmSize);
      if (opts.wmOpacity !== undefined) setWmOpacity(opts.wmOpacity);
      if (opts.wmAngle !== undefined) setWmAngle(opts.wmAngle);
      if (opts.wmColor !== undefined) setWmColor(opts.wmColor);
      if (opts.wmTile !== undefined) setWmTile(opts.wmTile);
      return true;
    };
    // structural check of the generated output: page count, leftover color ops, image color spaces
    window.__sealInspect = async () => {
      if (!window.__sealOutB64) return null;
      const bytes = b64ToBytes(window.__sealOutB64);
      const doc = await PdfDoc.load(bytes);
      const pageRefs = await doc.getPageRefs();
      const lat1 = (b: Uint8Array) => { let s = ""; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return s; };
      let colorOps = 0, grayOps = 0;
      const images = [];
      for (const [num, entry] of doc.xref.entries()) {
        if (entry.type !== 1 && entry.type !== 2) continue;
        let v;
        try { v = await doc.getObject(num); } catch { continue; }
        if (!v || !v.$stream) continue;
        if (v.dict["/Subtype"] === "/Image") {
          let cs = v.dict["/ColorSpace"];
          try { cs = await doc.resolve(cs); } catch { /* keep raw */ }
          images.push({ num, filter: String(v.dict["/Filter"]), cs: Array.isArray(cs) ? cs[0] : String(cs), bytes: v.data.length });
        } else if (v.dict["/Subtype"] === "/Form" || v.dict["/Length"] !== undefined) {
          let f = v.dict["/Filter"];
          if (Array.isArray(f)) f = f[0];
          if (f === "/FlateDecode") {
            try {
              const t = lat1(await doc.decodeStream(v));
              const colr = t.match(/[\d.\-]+ [\d.\-]+ [\d.\-]+ (rg|RG)\b|[\d.\-]+ [\d.\-]+ [\d.\-]+ [\d.\-]+ (k|K)\b/g);
              const gray = t.match(/[\d.\-]+ (g|G)\b/g);
              if (colr) colorOps += colr.length;
              if (gray) grayOps += gray.length;
            } catch { /* not decodable */ }
          }
        }
      }
      return { pages: pageRefs.length, size: bytes.length, colorOps, grayOps, images };
    };
    window.__sealState = () => ({
      pdf: !!pdfInfo, seal: !!seal, method, plan: !!plan,
      conflicts: plan?.conflicts ?? null, blanks: plan?.blanks ?? null,
      ready, canGenerate, result: !!result, error,
    });
    window.__sealGenerate = async () => { await generate(); return window.__sealState!(); };
  });

  return {
    pdfInfo,
    setPdfInfo,
    seal,
    setSeal,
    method,
    setMethod,
    align,
    setAlign,
    lang,
    setLang,
    sealWmm,
    setSealWmm,
    sliceWmm,
    setSliceWmm,
    sealCount,
    setSealCount,
    grayscale,
    setGrayscale,
    sealOpacity,
    setSealOpacity,
    grayDoc,
    setGrayDoc,
    compressPdf,
    setCompressPdf,
    compressQuality,
    setCompressQuality,
    compressMode,
    setCompressMode,
    targetMB,
    setTargetMB,
    targetUnit,
    setTargetUnit,
    outName,
    setOutName,
    rotMin,
    setRotMin,
    rotMax,
    setRotMax,
    labelSize,
    setLabelSize,
    labelBottom,
    setLabelBottom,
    labelRot,
    setLabelRot,
    seed,
    setSeed,
    joined,
    setJoined,
    busy,
    setBusy,
    error,
    setError,
    blankOK,
    setBlankOK,
    skipConflicts,
    setSkipConflicts,
    result,
    setResult,
    nudgeKey,
    setNudgeKey,
    stale,
    setStale,
    resultRef,
    log,
    setLog,
    scan,
    setScan,
    san,
    setSan,
    scanGen,
    fxRun,
    setFxRun,
    FOLD_PRE_UPLOAD,
    fold,
    setFold,
    toggleFold,
    logUrl,
    setLogUrl,
    logFileName,
    wmOn,
    setWmOn,
    wmText,
    setWmText,
    wmSize,
    setWmSize,
    wmOpacity,
    setWmOpacity,
    wmAngle,
    setWmAngle,
    wmColor,
    setWmColor,
    wmTile,
    setWmTile,
    wmFontReady,
    setWmFontReady,
    pdfInputKey,
    unlockPw,
    setUnlockPw,
    unlockPerm,
    setUnlockPerm,
    locked,
    setLockedState,
    lockedRef,
    setLocked,
    s1Ref,
    pwInputRef,
    pdfDocRef,
    rendererRef,
    thumbs,
    setThumbs,
    thumbGen,
    thumbQ,
    requestThumb,
    renderZoomPage,
    isErrMsg,
    addLog,
    resetPdfState,
    loadPlainPdf,
    runScan,
    clearScan,
    runSanitize,
    unloadPdf,
    handlePdf,
    applyLocked,
    unlockWith,
    toggleUnlock,
    handleSeal,
    sealCanvas,
    basePlan,
    plan,
    ready,
    hasConflicts,
    hasBlanks,
    outputOnly,
    canGenerate,
    decrypted,
    decUrl,
    decName,
    origUrl,
    origName,
    pdfBase,
    finalFileName,
    runPostprocess,
    compressLabel,
    generate,
    generatePlain,
  };
}

export type Studio = ReturnType<typeof useStudio>;
