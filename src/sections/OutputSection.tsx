import { type Align } from "../types";
import { ALIGN_LABELS, TARGET_RANGE, UNIT_BYTES } from "../lib/constants";
import { Fold, ResetToggle, SectionTitle } from "../components/ui";
import { type SizeUnit } from "../studio/stateTypes";
import { clampTarget, fmtBytes } from "../lib/helpers";
import { useStudioContext } from "../studio/context";

// 玖 產出與下載
export function OutputSection() {
  const {
    busy,
    canGenerate,
    compressMode,
    compressPdf,
    compressQuality,
    fold,
    generate,
    grayDoc,
    nudgeKey,
    outName,
    outputOnly,
    pdfBase,
    pdfInfo,
    result,
    setCompressMode,
    setCompressPdf,
    setCompressQuality,
    setGrayDoc,
    setNudgeKey,
    setOutName,
    setTargetMB,
    setTargetUnit,
    stale,
    targetMB,
    targetUnit,
    toggleFold,
  } = useStudioContext();
  return (
    <section data-section="s9-output" className={`mb-6 transition-opacity ${pdfInfo ? "" : "opacity-40"}`}>
    <SectionTitle
      n="玖" title="產出與下載"
      collapsed={!!fold.s7} onToggle={() => toggleFold("s7")}
      action={
        <ResetToggle
          getCustom={() => ({ compressPdf, compressQuality, compressMode, targetMB, targetUnit, grayDoc, outName })}
          defaults={() => ({ compressPdf: false, compressQuality: 80, compressMode: "ratio" as const, targetMB: 2 as number | string, targetUnit: "MB" as SizeUnit, grayDoc: false, outName: pdfBase })}
          apply={(v) => { setCompressPdf(v.compressPdf); setCompressQuality(v.compressQuality); setCompressMode(v.compressMode); setTargetMB(v.targetMB); setTargetUnit(v.targetUnit || "MB"); setGrayDoc(v.grayDoc); setOutName(v.outName); }}
        />
      }
    />
    <Fold open={!fold.s7}>
    <div className={pdfInfo ? undefined : "pointer-events-none"}>
    <div className="rounded-2xl border border-[#E3D9C6] bg-[#FBF8F1] p-4">
      {/* output options: compression / full-document grayscale / rename */}
      <div className="mb-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-3 rounded-xl border border-[#E3D9C6] bg-white/70 px-4 py-3 text-sm">
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={compressPdf} onChange={(e) => setCompressPdf(e.target.checked)} className="h-4 w-4 accent-[#BE3A2B]" />
          <span className="font-bold text-[#2A231A]">壓縮檔案</span>
        </label>
        <div className={`flex flex-wrap items-center gap-2 font-bold ${compressPdf ? "text-[#2A231A]" : "text-[#B4A88F]"}`}>
          {/* 壓縮方式：依壓縮率（JPEG 品質）或依目標大小（自動搜尋品質／解析度） */}
          <div role="radiogroup" aria-label="壓縮方式" className={`inline-flex rounded-full border border-[#D9CCB4] bg-white p-0.5 ${compressPdf ? "" : "opacity-50"}`}>
            {([["ratio", "壓縮率"], ["size", "目標大小"]] as ["ratio" | "size", string][]).map(([k, lbl]) => (
              <button
                key={k} type="button" role="radio" aria-checked={compressMode === k}
                disabled={!compressPdf}
                onClick={() => setCompressMode(k)}
                className={`rounded-full px-3 py-1 text-sm font-bold transition-colors ${compressMode === k ? "bg-[#BE3A2B] text-white" : "text-[#6E6250] enabled:hover:text-[#BE3A2B]"}`}
              >{lbl}</button>
            ))}
          </div>
          {compressMode === "ratio" ? (
            <label className="flex items-center gap-2">
              <input
                type="range" min="10" max="100" step="5" value={compressQuality}
                aria-label="檔案壓縮率"
                disabled={!compressPdf}
                onChange={(e) => setCompressQuality(Number(e.target.value))}
                className="w-24 accent-[#BE3A2B] disabled:opacity-40"
              />
              <span className="w-10 font-mono text-xs font-normal text-[#6E6250]">{compressQuality}%</span>
            </label>
          ) : (
            <label className="flex items-center gap-2">
              <span className="text-sm">壓到</span>
              <input
                type="number" min={TARGET_RANGE[targetUnit][0]} step={targetUnit === "MB" ? 0.1 : 50} value={targetMB}
                aria-label={`目標大小（${targetUnit}）`}
                disabled={!compressPdf}
                onChange={(e) => setTargetMB(e.target.value === "" ? "" : Number(e.target.value))}
                onBlur={() => setTargetMB((v) => clampTarget(v, targetUnit))}
                className="w-20 rounded-md border border-[#D9CCB4] bg-white px-2 py-1.5 font-mono text-xs font-normal disabled:opacity-40"
              />
              {/* 單位切換：換單位時數值等量換算（2 MB ⇄ 2048 KB） */}
              <span role="radiogroup" aria-label="目標大小單位" className="inline-flex rounded-full border border-[#D9CCB4] bg-white p-0.5">
                {(["MB", "KB"] as SizeUnit[]).map((u) => (
                  <button
                    key={u} type="button" role="radio" aria-checked={targetUnit === u}
                    disabled={!compressPdf}
                    onClick={() => {
                      if (u === targetUnit) return;
                      const bytes = clampTarget(targetMB, targetUnit) * UNIT_BYTES[targetUnit];
                      const v = bytes / UNIT_BYTES[u];
                      setTargetMB(clampTarget(u === "KB" ? Math.round(v) : Math.round(v * 100) / 100, u));
                      setTargetUnit(u);
                    }}
                    className={`rounded-full px-2.5 py-0.5 font-mono text-sm font-bold transition-colors ${targetUnit === u ? "bg-[#6E6250] text-white" : "text-[#6E6250] enabled:hover:text-[#BE3A2B]"}`}
                  >{u}</button>
                ))}
              </span>
              <span className="text-sm">以內</span>
              {pdfInfo && <span className="font-mono text-xs font-normal text-[#6E6250]">（原檔 {fmtBytes(pdfInfo.bytes.length)}）</span>}
            </label>
          )}
          <span className="text-xs font-normal text-[#6E6250]">（勾選壓縮檔案才可設定）</span>
        </div>
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={grayDoc} onChange={(e) => setGrayDoc(e.target.checked)} className="h-4 w-4 accent-[#BE3A2B]" />
          <span className="font-bold text-[#2A231A]">全文件轉黑白（灰階）</span>
        </label>
        <label className="flex items-center gap-2 font-bold text-[#2A231A]">重新命名檔案
          <input
            type="text" value={outName} onChange={(e) => setOutName(e.target.value)}
            placeholder={pdfBase || "原檔名"}
            className="w-44 rounded-md border border-[#D9CCB4] bg-white px-2 py-1.5 font-mono text-xs font-normal"
          />
          <span className="text-xs font-normal text-[#6E6250]">.pdf（預設用原檔名）</span>
        </label>
      </div>
      <div className="text-center text-sm leading-relaxed text-[#6E6250]">所有處理皆在你的瀏覽器內完成，文件不會離開這台電腦。<br />印章與頁碼僅為視覺輔助，不構成數位簽章或防篡改保證。</div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          key={nudgeKey}
          type="button" disabled={!canGenerate} onClick={generate}
          className={`group relative flex w-full items-center justify-center overflow-hidden rounded-2xl py-4 font-['Noto_Serif_TC'] text-xl font-black tracking-[0.15em] text-white transition-all duration-150 focus:outline-hidden focus-visible:ring-4 focus-visible:ring-[#BE3A2B44] ${
            canGenerate
              ? "bg-[#BE3A2B] shadow-[0_4px_16px_rgba(190,58,43,0.4)] hover:shadow-[0_6px_24px_rgba(190,58,43,0.5)] active:translate-y-[2px] active:shadow-[0_1px_4px_rgba(190,58,43,0.3)]"
              : "cursor-not-allowed bg-[#C9BBA6]"
          }`}
          style={{
            transition: "transform 150ms cubic-bezier(.34,1.56,.64,1), box-shadow 150ms ease",
            ...(stale ? { animation: "genNudgePulse 1.4s ease-in-out infinite" } : nudgeKey ? { animation: "genNudgePulse 0.9s ease-in-out 3" } : null),
          }}
        >
          <span className={`inline-block transition-transform duration-150 ${canGenerate ? "group-active:scale-95" : ""}`}>
            {busy ? busy : outputOnly ? (stale ? "重新產生 PDF（不用印）" : "產生 PDF（不用印）") : stale ? "重新產生用印 PDF" : "產生用印 PDF"}
          </span>
        </button>
        {result ? (
          <a
            href={result.url} download={result.name}
            className="group relative flex w-full flex-col items-center justify-center overflow-hidden rounded-2xl bg-[#2A6B3A] py-4 text-center font-['Noto_Serif_TC'] text-xl font-black tracking-[0.15em] text-white shadow-[0_4px_16px_rgba(42,107,58,0.4)] transition-all duration-150 hover:shadow-[0_6px_24px_rgba(42,107,58,0.5)] active:translate-y-[2px] active:shadow-[0_1px_4px_rgba(42,107,58,0.3)] focus:outline-hidden focus-visible:ring-4 focus-visible:ring-[#2A6B3A44]"
            style={{ transition: "transform 150ms cubic-bezier(.34,1.56,.64,1), box-shadow 150ms ease" }}
          >
            <span className="inline-block transition-transform duration-150 group-active:scale-95">⬇ 下載 PDF</span>
          </a>
        ) : (
          <button
            type="button" onClick={() => setNudgeKey((k) => k + 1)}
            title="請先產生用印 PDF"
            className="flex w-full cursor-pointer flex-col items-center justify-center rounded-2xl bg-[#C9BBA6] py-4 font-['Noto_Serif_TC'] text-xl font-black tracking-[0.15em] text-black transition-shadow hover:shadow-[0_0_0_3px_rgba(190,58,43,0.28)] focus:outline-hidden focus-visible:ring-4 focus-visible:ring-[#BE3A2B44]"
          >
            ⬇ 下載 PDF
            <span className="mt-0.5 block font-mono text-xs font-normal tracking-normal text-black/75">{stale ? `設定已變更 · 請重新產生${outputOnly ? " PDF" : "用印 PDF"}` : outputOnly ? "點擊「產生 PDF（不用印）」後即可下載" : "點擊「產生用印 PDF」後即可下載"}</span>
          </button>
        )}
      </div>
    </div>
  
    {/* result */}
    {result?.report.plain && (
      <div className="mt-4 overflow-hidden rounded-2xl border-2 border-[#BE3A2B] bg-[#FBF8F1] px-5 py-4 text-sm">
        <div className="mb-1 text-xs font-bold tracking-widest text-[#6E6250]">產出摘要</div>
        <ul className="space-y-1 text-[#4A4132]">
          <li>方式：不用印（未加騎縫章、頁碼與浮水印）{result.report.unlock ? ` · ${result.report.unlock.kind === "perm" ? "已解除權限限制" : "已解密"}` : ""}</li>
          <li>頁數核對：{result.report.verified ? `✅ ${result.report.count} 頁，與原檔一致` : "⚠️ 頁數不符，請勿使用"}</li>
          <li>輸出：{[result.report.grayDoc ? "全文件灰階" : null, result.report.compressQ > 0 ? `壓縮・${result.report.compressDesc || `圖片品質 ${result.report.compressQ}%`}` : null].filter(Boolean).join(" · ") || "原檔內容"}（{fmtBytes(result.report.srcSize)} → {fmtBytes(result.size)}）</li>
          {result.report.sanDesc && <li>淨化：{result.report.sanDesc}</li>}
        </ul>
      </div>
    )}
    {result && !result.report.plain && (
      <div className="mt-4 overflow-hidden rounded-2xl border-2 border-[#BE3A2B] bg-[#FBF8F1]">
        <div className="grid gap-4 px-5 py-4 text-sm sm:grid-cols-2">
          <div>
            <div className="mb-1 text-xs font-bold tracking-widest text-[#6E6250]">產出摘要</div>
            <ul className="space-y-1 text-[#4A4132]">
              <li>方式：{result.report.method === "A" ? "摺頁橫蓋法（成對半章）" : result.report.method === "C" ? "摺頁直蓋法（成對半章・直向）" : "側邊裝訂蓋章法（全份切片）"}{result.report.sealCount > 1 ? ` · 章數 ${result.report.sealCount}` : ""}</li>
              <li>頁碼：{result.report.lang === "tc" ? "繁體中文" : "English"} · {ALIGN_LABELS[result.report.align as Align] || result.report.align} · {result.report.labelSize} pt · 下緣上方 {result.report.labelBottom} mm{result.report.labelRot ? ` · 旋轉 ${result.report.labelRot}°` : ""}</li>
              <li>印章：{result.report.grayscale ? "灰階" : "原色"}{result.report.sealOpacity < 100 ? ` · 淡化 ${result.report.sealOpacity}%` : ""} · 旋轉 {result.report.rotMin}°～{result.report.rotMax}° 隨機</li>
              {result.report.wm && <li>浮水印：「{result.report.wm.text}」 · {result.report.wm.size} pt · 淡化 {result.report.wm.opacity}% · {result.report.wm.angle}°{result.report.wm.tile ? " · 鋪滿全頁" : ""}</li>}
              <li>頁數核對：{result.report.verified ? `✅ ${result.report.count} 頁，與原檔一致` : "⚠️ 頁數不符，請勿使用"}</li>
              {(result.report.grayDoc || result.report.compressQ > 0) && (
                <li>輸出：{[result.report.grayDoc ? "全文件灰階" : null, result.report.compressQ > 0 ? `壓縮・${result.report.compressDesc || `圖片品質 ${result.report.compressQ}%`}` : null].filter(Boolean).join(" · ")}（{fmtBytes(result.report.srcSize)} → {fmtBytes(result.size)}）</li>
              )}
              {result.report.sanDesc && <li>淨化：{result.report.sanDesc}</li>}
              <li>隨機種子：<span className="font-mono text-xs">{result.report.seed}</span>（相同種子可重現相同配置）</li>
              {result.report.dpi < 150 && <li className="text-[#8E2A20]">⚠️ 印章解析度約 {result.report.dpi} dpi，建議使用更大的圖片</li>}
            </ul>
          </div>
          <div>
            <div className="mb-1 text-xs font-bold tracking-widest text-[#6E6250]">例外與揭露</div>
            <ul className="space-y-1 text-[#6B5F4C]">
              {result.report.blanks.length > 0 && <li>· 第 {result.report.blanks.join("、")} 頁為經確認的空白切片</li>}
              {result.report.conflicts.length > 0 && <li>· {result.report.conflicts.length} 個頁對因空間不足未用印</li>}
              {result.report.wm && <li>· 浮水印為半透明圖層，覆於頁面內容之上、印章與頁碼之下</li>}
              {result.report.grayDoc && <li>· 全文件灰階涵蓋文字、向量圖形與點陣圖片；漸層、圖樣填色與 ICC 色彩可能保留原色</li>}
              <li>· 位置以頁面幾何規劃，未對原文件內容逐像素偵測；如頁碼或印章壓到內容，請換組隨機位置或調整對齊</li>
              {result.report.sigWarn && <li className="font-bold text-[#7A5A1E]">· 原檔含數位簽章：用印後簽章必定失效，請先淨化再簽章</li>}
              <li>· 騎縫章與頁碼為視覺識別，不是數位簽章，無法防止 PDF 被修改</li>
            </ul>
          </div>
        </div>
      </div>
    )}
    </div>
    </Fold>
  </section>
  );
}
