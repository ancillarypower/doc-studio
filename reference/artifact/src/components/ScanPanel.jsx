// 貳區「檔案狀態」：只列出上傳檔案裡真的偵測到的項目，每項附淨化選項（產出時套用）。
// 淨化 = 整份重寫，所以任何一項勾選都會連帶「只保留現行版本」。

export const SAN_DEFAULT = {
  meta: false, history: false, js: false, attach: false, links: "keep",
  piece: false, outlines: false, exif: false, flatten: false, ocg: false, invisible: false,
};
const SAN_BOOL = ["meta", "history", "js", "attach", "piece", "outlines", "exif", "flatten", "ocg", "invisible"];
const SAN_LABEL = {
  meta: "中繼資料", history: "舊版本與未引用物件", js: "JavaScript 與自動動作", attach: "附件與內嵌檔案",
  piece: "PieceInfo", outlines: "書籤", exif: "圖片 EXIF", flatten: "註解與表單（攤平）", ocg: "隱藏圖層", invisible: "隱形文字",
};

// 上傳掃描發現 JavaScript／附件／Launch → 預設勾選淨化
export function sanDefaultsFor(rep) {
  return { ...SAN_DEFAULT, js: !!rep?.js.detected, attach: !!rep?.attach.detected };
}
export const sanForcesRewrite = (san) => SAN_BOOL.some((k) => k !== "history" && san[k]) || san.links !== "keep";
export const sanActive = (san) => san.history || sanForcesRewrite(san);
export function sanSummary(san) {
  const out = SAN_BOOL.filter((k) => san[k] && k !== "history").map((k) => SAN_LABEL[k]);
  if (san.links === "external") out.push("外部連結");
  if (san.links === "all") out.push("全部連結");
  if (sanActive(san)) out.push("只保留現行版本");
  return out.join("、");
}

// [2,3,4,7] → 第 2–4、7 頁
export function fmtPages(list) {
  if (!list.length) return "";
  const runs = [];
  for (const p of list) {
    const r = runs[runs.length - 1];
    if (r && p === r[1] + 1) r[1] = p; else runs.push([p, p]);
  }
  const shown = runs.slice(0, 6).map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join("、");
  return `第 ${shown}${runs.length > 6 ? " 等" : ""} 頁`;
}

const TONE = {
  danger: { dot: "#BE3A2B", tag: "bg-[#BE3A2B] text-white" },
  warn: { dot: "#C98A2F", tag: "bg-[#FCF4E3] text-[#7A5A1E] border border-[#C98A2F]" },
  info: { dot: "#A1906F", tag: "" },
};

function Check({ checked, onChange, disabled, children }) {
  return (
    <label className={`flex items-center gap-2 whitespace-nowrap text-sm font-bold ${disabled ? "cursor-default text-[#8A7C66]" : "cursor-pointer text-[#2A231A]"}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[#BE3A2B]" />
      {children}
    </label>
  );
}

function Row({ tone = "info", title, summary, note, control }) {
  const t = TONE[tone];
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span className="mt-[0.45rem] h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.dot }} aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-wrap items-start gap-x-6 gap-y-2">
        <div className="min-w-[12rem] flex-1">
          <div className="font-bold text-[#2A231A]">{title}</div>
          {summary && <div className="mt-0.5 break-words text-sm leading-relaxed text-[#4A4132]">{summary}</div>}
          {note && <div className="mt-0.5 text-xs leading-relaxed text-[#8A7C66]">{note}</div>}
        </div>
        <div className="flex shrink-0 flex-col items-start gap-1.5 pt-0.5">{control}</div>
      </div>
    </li>
  );
}

const Only = ({ children }) => (
  <span className="rounded-full border border-[#E3D9C6] bg-white px-3 py-1 text-xs font-bold text-[#8A7C66]">僅提醒</span>
);

export default function ScanPanel({ scan, san, setSan }) {
  if (!scan) {
    return <div className="text-sm text-[#6E6250]">上傳 PDF 後自動掃描看不到的內容：中繼資料、舊版本、JavaScript、附件、連結、EXIF、註解表單、隱藏圖層、隱形文字、數位簽章。</div>;
  }
  if (scan.status === "scanning") {
    return (
      <div className="flex items-center gap-3 text-sm font-bold text-[#6E6250]">
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[#BE3A2B] border-t-transparent" aria-hidden="true" />
        掃描中…{scan.total ? ` ${scan.done}/${scan.total} 頁` : ""}
      </div>
    );
  }
  if (scan.status === "error") {
    return <div className="text-sm font-bold text-[#8E2A20]">掃描失敗：{scan.msg}</div>;
  }
  const r = scan.report;
  const set = (patch) => setSan((s) => ({ ...s, ...patch }));
  const forced = sanForcesRewrite(san);
  const rows = [];
  const missing = [];
  const add = (detected, label, node) => (detected ? rows.push(node) : missing.push(label));

  // 1 中繼資料
  add(r.meta.detected, "中繼資料", (
    <Row key="meta" title="中繼資料"
      summary={[
        ...r.meta.fields.map((f) => `${f.label}：${f.value}`),
        r.meta.xmpCount ? `XMP ${r.meta.xmpCount} 份${r.meta.xmpTool ? `（${r.meta.xmpTool}）` : ""}` : null,
        r.meta.hasId ? "文件 ID" : null,
      ].filter(Boolean).join(" · ")}
      note="移除文件資訊（作者、軟體、時間）與 XMP，文件 ID 換成隨機值"
      control={<Check checked={san.meta} onChange={(v) => set({ meta: v })}>移除</Check>}
    />
  ));
  // 2 舊版本 / 未引用物件
  add(r.history.detected, "舊版本", (
    <Row key="history" title="增量存檔的舊版本、未被引用的物件"
      summary={[
        r.history.revisions > 1 ? `存檔 ${r.history.revisions} 次，檔案裡還留著 ${r.history.revisions - 1} 個舊版本` : null,
        r.history.orphans ? `${r.history.orphans} 個沒被引用的物件` : null,
      ].filter(Boolean).join(" · ")}
      note="只寫出從文件根節點追得到的物件，舊版本與殘留物件一律丟棄"
      control={<>
        <Check checked={san.history || forced} disabled={forced} onChange={(v) => set({ history: v })}>只保留現行版本</Check>
        {forced && <span className="text-xs text-[#8A7C66]">其他淨化項目會整份重寫，已一併執行</span>}
      </>}
    />
  ));
  // 3 JavaScript 與自動動作
  const js = r.js;
  add(js.detected, "JavaScript", (
    <Row key="js" tone="danger" title="JavaScript 與自動動作"
      summary={[
        js.openAction ? `開檔動作（${js.openAction}）` : null,
        js.aa ? `觸發動作 ${js.aa} 個` : null,
        js.js ? `JavaScript ${js.js} 段` : null,
        js.launch ? `Launch ${js.launch} 個` : null,
        js.submit ? `SubmitForm ${js.submit} 個` : null,
        js.importData ? `ImportData ${js.importData} 個` : null,
        js.xfa ? "XFA 動態表單" : null,
      ].filter(Boolean).join(" · ")}
      note="移除開檔動作、各層觸發動作（頁面、欄位、註解）與 JavaScript／Launch／SubmitForm／ImportData"
      control={<Check checked={san.js} onChange={(v) => set({ js: v })}>移除</Check>}
    />
  ));
  // 4 附件
  const at = r.attach;
  add(at.detected, "附件", (
    <Row key="attach" tone="danger" title="附件與內嵌檔案"
      summary={[
        at.files ? `${at.files} 個內嵌檔案${at.names.length ? `：${at.names.join("、")}` : ""}` : null,
        at.fileAnnots ? `附件圖示 ${at.fileAnnots} 個` : null,
        at.portfolio ? "PDF 作品集（Portfolio）" : null,
      ].filter(Boolean).join(" · ")}
      note="附件、內嵌檔案與作品集結構整個移除"
      control={<Check checked={san.attach} onChange={(v) => set({ attach: v })}>移除</Check>}
    />
  ));
  // 5 連結
  const lk = r.links;
  add(lk.detected, "連結", (
    <Row key="links" title="連結"
      summary={`${lk.total} 個連結${lk.external ? `，${lk.external} 個指向外部` : "，全部是文件內跳頁"}${lk.hosts.length ? `：${lk.hosts.join("、")}` : ""}`}
      note="外部 = 網址或其他檔案；文件內跳頁可以留著"
      control={
        <div role="radiogroup" aria-label="連結處理方式" className="inline-flex rounded-full border border-[#D9CCB4] bg-white p-0.5">
          {[["keep", "保留"], ["external", "只移除外部網址"], ["all", "全部移除"]].map(([k, lbl]) => (
            <button key={k} type="button" role="radio" aria-checked={san.links === k}
              disabled={k === "external" && !lk.external}
              onClick={() => set({ links: k })}
              className={`rounded-full px-3 py-1 text-sm font-bold transition-colors disabled:opacity-40 ${san.links === k ? "bg-[#BE3A2B] text-white" : "text-[#6E6250] enabled:hover:text-[#BE3A2B]"}`}
            >{lbl}</button>
          ))}
        </div>
      }
    />
  ));
  // 6 PieceInfo、書籤
  add(r.piece.detected, "PieceInfo、書籤", (
    <Row key="piece" title="PieceInfo、書籤"
      summary={[r.piece.pieceInfo ? `PieceInfo ${r.piece.pieceInfo} 處（編輯軟體留下的私有資料）` : null, r.piece.outlines ? `書籤 ${r.piece.outlines} 個` : null].filter(Boolean).join(" · ")}
      control={<>
        {r.piece.pieceInfo > 0 && <Check checked={san.piece} onChange={(v) => set({ piece: v })}>移除 PieceInfo</Check>}
        {r.piece.outlines > 0 && <Check checked={san.outlines} onChange={(v) => set({ outlines: v })}>移除書籤</Check>}
      </>}
    />
  ));
  // 7 EXIF
  const ex = r.exif;
  add(ex.detected, "EXIF", (
    <Row key="exif" tone={ex.gps ? "warn" : "info"} title="內嵌 JPEG 圖片的 EXIF"
      summary={<>
        {ex.jpegs} 張 JPEG{ex.exif ? `，${ex.exif} 張含 EXIF` : ""}
        {ex.gps > 0 && <span className="font-bold text-[#8E2A20]">，{ex.gps} 張含 GPS 定位</span>}
        {ex.other ? `，${ex.other} 張含其他中繼資料` : ""}
      </>}
      note="直接切掉中繼資料區段，不重新編碼，畫質零損失"
      control={<Check checked={san.exif} onChange={(v) => set({ exif: v })}>移除</Check>}
    />
  ));
  // 8 註解、表單
  const an = r.annots;
  add(an.detected, "註解與表單", (
    <Row key="annots" tone={an.noAP ? "warn" : "info"} title="註解與表單"
      summary={[
        ...Object.entries(an.types).map(([k, v]) => `${k} ${v}`),
        an.fields ? `表單欄位樹 ${an.fields} 組` : null,
      ].filter(Boolean).join(" · ")}
      note={<>先攤平（把外觀畫進頁面內容）再刪，欄位裡的字才不會消失{an.noAP > 0 && <span className="block font-bold text-[#7A5A1E]">{an.noAP} 個欄位沒有外觀，攤平後會是空白</span>}</>}
      control={<Check checked={san.flatten} onChange={(v) => set({ flatten: v })}>攤平後移除</Check>}
    />
  ));
  // 9 隱藏圖層
  const ly = r.layers;
  add(ly.detected, "隱藏圖層", (
    <Row key="ocg" tone="warn" title="隱藏圖層（OCG）"
      summary={`${ly.total} 個圖層，${ly.hidden.length} 個隱藏：${ly.hidden.join("、")}`}
      note="連同圖層內容一起刪；只刪圖層設定會讓隱藏內容全部變可見"
      control={<Check checked={san.ocg} onChange={(v) => set({ ocg: v })}>連內容刪除</Check>}
    />
  ));
  // 10 隱形文字
  const iv = r.invisible;
  add(iv.detected, "隱形文字", (
    <Row key="invisible" tone={iv.ocrPages.length ? "warn" : "info"} title="隱形文字"
      summary={`${fmtPages(iv.pages)}，共 ${iv.ops} 段`}
      note={iv.ocrPages.length
        ? <span className="font-bold text-[#7A5A1E]">{fmtPages(iv.ocrPages)}像掃描檔的 OCR 文字層，刪掉就無法搜尋、複製</span>
        : "看不見但可被搜尋、複製的文字"}
      control={<Check checked={san.invisible} onChange={(v) => set({ invisible: v })}>刪除</Check>}
    />
  ));
  // 12 數位簽章
  const sg = r.sig;
  add(sg.detected, "數位簽章", (
    <Row key="sig" tone="warn" title="數位簽章"
      summary={`${sg.fields} 個簽章欄${sg.signed ? `，${sg.signed} 個已簽署` : ""}${sg.perms ? "（含權限簽章）" : ""}`}
      note={<span className="font-bold text-[#7A5A1E]">用印後簽章必定失效，請先淨化再簽章</span>}
      control={<Only />}
    />
  ));
  // 13 疑似藏字
  const ht = r.hiddenText;
  add(ht.detected, "疑似藏字", (
    <Row key="hidden" tone="warn" title="同色文字、被蓋住的文字（粗略）"
      summary={[
        ht.sameOps ? `與底色同色：${fmtPages(ht.samePages)}（${ht.sameOps} 處）` : null,
        ht.coveredOps ? `被圖片或色塊蓋住：${fmtPages(ht.coveredPages)}（${ht.coveredOps} 處）` : null,
      ].filter(Boolean).join(" · ")}
      note="粗略偵測，可能誤判；蓋住不等於刪除，文字仍可被複製"
      control={<Only />}
    />
  ));

  const danger = [
    js.js || js.namesJs ? "JavaScript" : null,
    js.launch ? "Launch" : null,
    at.detected ? "附件" : null,
    js.submit ? "SubmitForm" : null,
    js.importData ? "ImportData" : null,
    js.openAction || js.aa ? "自動動作" : null,
  ].filter(Boolean);
  const canCheck = ["meta", "js", "attach", "exif", "flatten", "ocg", "invisible"].filter((k) => ({
    meta: r.meta.detected, js: js.detected, attach: at.detected, exif: ex.detected, flatten: an.detected, ocg: ly.detected, invisible: iv.detected,
  })[k]);
  const allOn = canCheck.every((k) => san[k]) && (!r.piece.pieceInfo || san.piece) && (!r.piece.outlines || san.outlines) && (!r.history.detected || san.history || forced);

  return (
    <div>
      {danger.length > 0 && (
        <div className="mb-3 flex items-start gap-3 rounded-xl border-2 border-[#BE3A2B] bg-[#FDECEA] px-4 py-3 text-sm text-[#8E2A20]">
          <span className="mt-[-2px] text-lg leading-none" aria-hidden="true">⚠</span>
          <div><span className="font-bold">上傳掃描發現 {danger.join("、")}。</span>已預設勾選淨化，產出時一併移除。</div>
        </div>
      )}
      {rows.length ? (
        <>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-[#6E6250]">偵測到 <span className="font-bold text-[#2A231A]">{rows.length}</span> 項 · 勾選的項目在玖區產出時淨化</div>
            {canCheck.length > 0 && (
              <button type="button" disabled={allOn}
                onClick={() => set({ ...Object.fromEntries(canCheck.map((k) => [k, true])), piece: r.piece.pieceInfo > 0, outlines: r.piece.outlines > 0, history: r.history.detected })}
                className="rounded-full border border-[#D9CCB4] bg-white px-4 py-1 text-sm font-bold text-[#4A4132] transition-colors enabled:hover:border-[#BE3A2B] enabled:hover:text-[#BE3A2B] disabled:opacity-40"
              >全部勾選淨化</button>
            )}
          </div>
          <ul className="divide-y divide-[#EFE6D4] overflow-hidden rounded-xl border border-[#E3D9C6] bg-white/70">{rows}</ul>
        </>
      ) : (
        <div className="rounded-xl border border-[#E3D9C6] bg-white/70 px-4 py-3 text-sm font-bold text-[#2A6B3A]">✓ 沒有偵測到需要處理的項目</div>
      )}
      {missing.length > 0 && <p className="mt-2 text-xs text-[#8A7C66]">未偵測到：{missing.join("、")}</p>}
      {r.unreadablePages > 0 && <p className="mt-1 text-xs text-[#7A5A1E]">{r.unreadablePages} 頁內容使用不支援的壓縮格式，頁面內容未掃描</p>}
    </div>
  );
}
