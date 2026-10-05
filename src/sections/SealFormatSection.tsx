import { Fold, ResetToggle, SectionTitle } from "../components/ui";
import { clampNum, clampRot } from "../lib/helpers";
import { useStudioContext } from "../studio/context";

// 陸 編輯騎縫章格式
export function SealFormatSection() {
  const {
    fold,
    grayscale,
    method,
    pdfInfo,
    rotMax,
    rotMin,
    seal,
    sealCount,
    sealOpacity,
    sealWmm,
    seed,
    setGrayscale,
    setRotMax,
    setRotMin,
    setSealCount,
    setSealOpacity,
    setSealWmm,
    setSeed,
    setSliceWmm,
    sliceWmm,
    toggleFold,
  } = useStudioContext();
  return (
    <section data-section="s6-format" className={`mb-6 transition-opacity ${pdfInfo && seal && method ? "" : "opacity-40"}`}>
    <SectionTitle
      n="陸" title="編輯騎縫章格式"
      collapsed={!!fold.s4} onToggle={() => toggleFold("s4")}
      action={
        <ResetToggle
          getCustom={() => ({ sealWmm, sliceWmm, sealCount, grayscale, sealOpacity, rotMin, rotMax, seed })}
          defaults={() => ({ sealWmm: 30, sliceWmm: 2.0, sealCount: 1, grayscale: false, sealOpacity: 100, rotMin: -10, rotMax: 10, seed: Math.floor(Math.random() * 1e9) })}
          apply={(v) => { setSealWmm(v.sealWmm); setSliceWmm(v.sliceWmm); setSealCount(v.sealCount); setGrayscale(v.grayscale); setSealOpacity(v.sealOpacity); setRotMin(v.rotMin); setRotMax(v.rotMax); setSeed(v.seed); }}
        />
      }
    />
    <Fold open={!fold.s4}>
    <div className={pdfInfo && seal && method ? undefined : "pointer-events-none"}>
    <div className="rounded-2xl border border-[#E3D9C6] bg-[#FBF8F1] p-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
        {(method === "A" || method === "C") && (
          <label className="flex items-center gap-2 font-bold text-[#2A231A]">章寬
            <input type="number" min="10" max="60" step="1" value={sealWmm} onChange={(e) => setSealWmm(Number(e.target.value) || 30)} className="w-16 rounded-md border border-[#D9CCB4] bg-white px-2 py-1.5 font-mono text-xs font-normal" />
            <span className="text-xs font-normal text-[#6E6250]">mm{method === "C" ? "（直向跨幅）" : ""}</span>
          </label>
        )}
        {method === "B" && (
          <label className="flex items-center gap-2 font-bold text-[#2A231A]">每片寬
            <input type="number" min="0.1" step="0.1" value={sliceWmm} onChange={(e) => setSliceWmm(Math.max(0.1, Number(e.target.value) || 2.0))} className="w-48 rounded-md border border-[#D9CCB4] bg-white px-2 py-1.5 font-mono text-xs font-normal" />
            <span className="text-xs font-normal text-[#6E6250]">mm</span>
          </label>
        )}
        <label className="flex items-center gap-2 font-bold text-[#2A231A]">章數
          <input type="number" min="1" max="5" step="1" value={sealCount} onChange={(e) => setSealCount(Math.round(clampNum(e.target.value, 1, 5, 1)))} className="w-16 rounded-md border border-[#D9CCB4] bg-white px-2 py-1.5 font-mono text-xs font-normal" />
          <span className="text-xs font-normal text-[#6E6250]">個（預設 1；多章沿頁緣上下分散）</span>
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
        {/* 灰階印章 + 淡化 keep together as one unit: 灰階印章 always sits on 淡化's left */}
        <div className="flex items-center gap-x-5">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={grayscale} onChange={(e) => setGrayscale(e.target.checked)} className="h-4 w-4 accent-[#BE3A2B]" />
            <span className="font-bold text-[#2A231A]">灰階印章</span>
          </label>
          <label className="flex items-center gap-2 font-bold text-[#2A231A]">淡化
            <input
              type="range" min="10" max="100" step="5" value={sealOpacity}
              onChange={(e) => setSealOpacity(Number(e.target.value))}
              className="w-24 accent-[#BE3A2B]"
            />
            <span className="w-10 font-mono text-xs font-normal text-[#6E6250]">{sealOpacity}%</span>
            <span className="text-xs font-normal text-[#6E6250]">（預設 100，越低越淡）</span>
          </label>
        </div>
        <label className="flex items-center gap-2 font-bold text-[#2A231A]">旋轉範圍
          <input type="number" min="-45" max="45" step="1" value={rotMin} onChange={(e) => setRotMin(clampRot(e.target.value, -10))} className="w-16 rounded-md border border-[#D9CCB4] bg-white px-2 py-1.5 font-mono text-xs font-normal" />
          <span className="text-xs font-normal text-[#6E6250]">°～</span>
          <input type="number" min="-45" max="45" step="1" value={rotMax} onChange={(e) => setRotMax(clampRot(e.target.value, 10))} className="w-16 rounded-md border border-[#D9CCB4] bg-white px-2 py-1.5 font-mono text-xs font-normal" />
          <span className="text-xs font-normal text-[#6E6250]">°</span>
        </label>
        <span className="text-xs text-[#6E6250]">角度於範圍內隨機取值（預設 -10°～10°）</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
        <label className="flex items-center gap-2 font-bold text-[#2A231A]">隨機種子
          <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value) || 0)} className="w-28 rounded-md border border-[#D9CCB4] bg-white px-2 py-1.5 font-mono text-xs font-normal" />
        </label>
        <button type="button" onClick={() => setSeed(Math.floor(Math.random() * 1e9))} className="rounded-full border border-[#D9CCB4] bg-white px-3 py-1 text-xs hover:border-[#BE3A2B]">換一組位置</button>
      </div>
    </div>
    </div>
    </Fold>
  </section>
  );
}
