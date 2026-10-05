import { type Method } from "../types";
import { Fold, SectionTitle } from "../components/ui";
import { MethodThumb } from "../components/MethodThumb";
import { useStudioContext } from "../studio/context";

// 肆 選擇騎縫章用印方式
export function MethodSection() {
  const {
    fold,
    method,
    pdfInfo,
    seal,
    setMethod,
    setResult,
    toggleFold,
  } = useStudioContext();
  return (
    <section data-section="s4-method" className="mb-6">
    <div className={`transition-opacity ${pdfInfo && seal ? "" : "opacity-40"}`}>
    <SectionTitle n="肆" title="選擇騎縫章用印方式" collapsed={!!fold.s2} onToggle={() => toggleFold("s2")} />
    </div>
    <Fold open={!fold.s2}>
    <div className={`grid gap-3 transition-opacity sm:grid-cols-3 ${pdfInfo && seal ? "" : "pointer-events-none opacity-40"}`}>
      {([
        { key: "A", name: "摺頁橫蓋法", desc: "相鄰兩頁各蓋半章，併攏可拼回完整印章", thumb: "halves-h" },
        { key: "C", name: "摺頁直蓋法", desc: "印章直向轉 90°，相鄰兩頁各蓋半章，併攏拼回", thumb: "halves-v" },
        { key: "B", name: "側邊裝訂蓋章法", desc: "整份右緣切成連續薄片，依頁序拼回印章", thumb: "slices" },
      ] as { key: Method; name: string; desc: string; thumb: string }[]).map((m) => (
        <button
          key={m.key} type="button" aria-pressed={method === m.key}
          title={method === m.key ? "再點一次取消選取" : undefined}
          onClick={() => { setMethod((cur) => (cur === m.key ? null : m.key)); setResult(null); }}
          className={`relative flex items-center gap-3 rounded-2xl border-2 p-4 text-left transition-all focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#BE3A2B] ${
            method === m.key ? "border-[#BE3A2B] bg-[#FBF3EF] shadow-[0_2px_10px_rgba(190,58,43,0.15)]" : "border-[#D9CCB4] bg-[#FBF8F1] hover:border-[#BE3A2B66]"
          }`}
        >
          <div className="min-w-0 w-1/2 shrink-0">
            <span className="font-['Noto_Serif_TC'] text-base font-bold">{m.name}</span>
            <p className="mt-1 text-xs leading-relaxed text-[#6B5F4C]">{m.desc}</p>
            {/* 選取標記：排在說明文字下方、文字欄右端（卡片中間偏左），走版面流不疊在文字上；
                未選取時保留同尺寸空位，選取切換不跳版 */}
            <div className="mt-2 flex h-9 justify-end" aria-hidden="true">
              {method === m.key && (
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#BE3A2B] text-white shadow-[0_2px_8px_rgba(190,58,43,0.45)]">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 12.5l5 5L19.5 7" /></svg>
                </span>
              )}
            </div>
          </div>
          <MethodThumb
            kind={m.thumb}
            sealUrl={seal?.url}
            aspect={seal ? seal.info.w / seal.info.h : 1}
            pageCount={pdfInfo?.count}
          />
        </button>
      ))}
    </div>
    </Fold>
  </section>
  );
}
