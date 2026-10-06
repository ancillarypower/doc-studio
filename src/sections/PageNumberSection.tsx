import { type Align } from "../types";
import { Fold, OptionPill, ResetToggle, SectionTitle } from "../components/ui";
import { clampNum } from "../lib/helpers";
import { useStudioContext } from "../studio/context";

// 柒 選擇頁碼標註方式
export function PageNumberSection() {
  const {
    align,
    fold,
    labelBottom,
    labelRot,
    labelSize,
    lang,
    pdfInfo,
    setAlign,
    setLabelBottom,
    setLabelRot,
    setLabelSize,
    setLang,
    toggleFold,
  } = useStudioContext();
  return (
    <section data-section="s7-pagenum" className={`mb-6 transition-opacity ${pdfInfo ? "" : "opacity-40"}`}>
    <SectionTitle
      n="柒" title="選擇頁碼標註方式"
      collapsed={!!fold.s5} onToggle={() => toggleFold("s5")}
      action={
        <ResetToggle
          getCustom={() => ({ lang, align, labelSize, labelBottom, labelRot })}
          defaults={() => ({ lang: "tc", align: "center" as Align, labelSize: 12, labelBottom: 10, labelRot: 0 })}
          apply={(v) => { setLang(v.lang); setAlign(v.align); setLabelSize(v.labelSize); setLabelBottom(v.labelBottom); setLabelRot(v.labelRot); }}
        />
      }
    />
    <Fold open={!fold.s5}>
    <div className={pdfInfo ? undefined : "pointer-events-none"}>
    <div className="rounded-2xl border border-[#E3D9C6] bg-[#FBF8F1] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-[#6E6250]">語言</span>
        <OptionPill active={lang === "tc"} onClick={() => setLang("tc")} badge="預設">繁體中文</OptionPill>
        <OptionPill active={lang === "en"} onClick={() => setLang("en")}>English</OptionPill>
        <span className="ml-3 text-xs text-[#6E6250]">對齊</span>
        <OptionPill active={align === "left"} onClick={() => setAlign("left")}>靠左</OptionPill>
        <OptionPill active={align === "center-left"} onClick={() => setAlign("center-left")}>中間靠左</OptionPill>
        <OptionPill active={align === "center"} onClick={() => setAlign("center")} badge="預設">置中</OptionPill>
        <OptionPill active={align === "center-right"} onClick={() => setAlign("center-right")}>中間靠右</OptionPill>
        <OptionPill active={align === "right"} onClick={() => setAlign("right")}>靠右</OptionPill>
        <span className="ml-3 text-xs text-[#6E6250]">斜角</span>
        <OptionPill
          active={align === "left" && labelRot === -45}
          onClick={() => { setAlign("left"); setLabelRot(-45); setLabelBottom(3); }}
          title="文字置於左下角，順時針旋轉 45° 貼入角落"
        >左下斜角</OptionPill>
        <OptionPill
          active={align === "right" && labelRot === 45}
          onClick={() => { setAlign("right"); setLabelRot(45); setLabelBottom(3); }}
          title="文字置於右下角，逆時針旋轉 45° 貼入角落"
        >右下斜角</OptionPill>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
        <label className="flex items-center gap-2 font-bold text-[#2A231A]">字體大小
          <input type="number" min="6" max="24" step="0.5" value={labelSize} onChange={(e) => setLabelSize(clampNum(e.target.value, 6, 24, 12))} className="w-16 rounded-md border border-[#D9CCB4] bg-white px-2 py-1.5 font-mono text-xs font-normal" />
          <span className="text-xs font-normal text-[#6E6250]">pt（預設 12）</span>
        </label>
        <label className="flex items-center gap-2 font-bold text-[#2A231A]">下緣距離
          <input type="number" min="3" max="40" step="1" value={labelBottom} onChange={(e) => setLabelBottom(clampNum(e.target.value, 3, 40, 10))} className="w-16 rounded-md border border-[#D9CCB4] bg-white px-2 py-1.5 font-mono text-xs font-normal" />
          <span className="text-xs font-normal text-[#6E6250]">mm（預設 10）</span>
        </label>
        <label className="flex items-center gap-2 font-bold text-[#2A231A]">旋轉角度
          <input type="number" min="-90" max="90" step="1" value={labelRot} onChange={(e) => setLabelRot(clampNum(e.target.value, -90, 90, 0))} className="w-16 rounded-md border border-[#D9CCB4] bg-white px-2 py-1.5 font-mono text-xs font-normal" />
          <span className="text-xs font-normal text-[#6E6250]">°（預設 0，正值逆時針）</span>
        </label>
      </div>
    </div>
    </div>
    </Fold>
  </section>
  );
}
