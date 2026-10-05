import Diagram from "../components/Diagram";
import { type EngineData } from "../types";
import { Fold, SectionTitle } from "../components/ui";
import { useStudioContext } from "../studio/context";

// 伍 預覽：即時用印示意圖
export function PreviewSection() {
  const {
    blankOK,
    fold,
    hasBlanks,
    hasConflicts,
    joined,
    method,
    pdfInfo,
    plan,
    ready,
    renderZoomPage,
    requestThumb,
    setBlankOK,
    setJoined,
    setSeed,
    setSkipConflicts,
    skipConflicts,
    thumbs,
    toggleFold,
    wmOn,
    wmText,
  } = useStudioContext();
  return (
    <section data-section="s5-preview" className={`mb-6 transition-opacity ${ready ? "" : "opacity-40"}`}>
    <SectionTitle n="伍" title="預覽" collapsed={!!fold.s3} onToggle={() => toggleFold("s3")} />
    <Fold open={!fold.s3}>
    <div className={ready ? undefined : "pointer-events-none"}>
    {ready && (
      <div className="rounded-2xl border border-[#E3D9C6] bg-[#FBF8F1] p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-xs text-[#6E6250]">縮圖為文件實際頁面 · 紅色為印章位置，紅線為頁碼位置{wmOn && wmText.trim() ? " · 淡色文字為浮水印" : ""}</div>
          <button
            type="button"
            onClick={() => setJoined((j) => !j)}
            className="min-w-[180px] rounded-full border border-[#D9CCB4] bg-white px-3 py-1 text-center text-xs font-bold text-[#4A4132] transition-colors hover:border-[#BE3A2B] hover:text-[#BE3A2B]"
          >
            {joined ? "↔ 展開頁面" : "⇄ 併攏驗證"}
          </button>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
        <Diagram pages={pdfInfo!.pages} planView={plan!.diagram} joined={joined} method={method} thumbs={thumbs} onNeedThumb={requestThumb} onRenderPage={renderZoomPage} />
  
        {hasBlanks && (
          <div className="mt-3 rounded-xl border border-[#C98A2F] bg-[#FCF4E3] px-4 py-3 text-sm text-[#7A5A1E]">
            <b>第 {plan!.blanks.join("、")} 頁的印章切片近乎空白</b>（旋轉後該處無印面）。
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => setBlankOK(true)} className={`rounded-full px-3 py-1 text-xs font-bold ${blankOK ? "bg-[#7A5A1E] text-white" : "border border-[#C98A2F]"}`}>保留空白切片，繼續</button>
              <button type="button" onClick={() => { setSeed(Math.floor(Math.random() * 1e9)); setBlankOK(false); }} className="rounded-full border border-[#C98A2F] px-3 py-1 text-xs">換個角度</button>
            </div>
          </div>
        )}
        </div>
        {hasConflicts && (
          <div className="shrink-0 rounded-xl border border-[#EAB308] bg-[#FEF9C3] px-4 py-3 text-sm text-[#854D0E] shadow-[0_2px_8px_rgba(234,179,8,0.25)] sm:w-72">
            <b>部分頁面找不到安全的用印位置</b>（頁對：{plan!.conflicts.map((c: EngineData) => c.pages ? c.pages.join("–") : "整份").join("、")}）。
              建議縮小印章尺寸、減少章數或調整頁碼對齊。
            <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs">
              <input type="checkbox" className="accent-[#CA8A04]" checked={skipConflicts} onChange={(e) => setSkipConflicts(e.target.checked)} />
              我了解風險，仍要產生（這些頁對將不加蓋印章）
            </label>
          </div>
        )}
        </div>
      </div>
    )}
    </div>
    </Fold>
  </section>
  );
}
