import { Fold, OptionPill, ResetToggle, SectionTitle } from "../components/ui";
import { type WmColor } from "../studio/stateTypes";
import { clampNum } from "../lib/helpers";
import { useStudioContext } from "../studio/context";

// 捌 設計浮水印
export function WatermarkSection() {
  const {
    fold,
    pdfInfo,
    setWmAngle,
    setWmColor,
    setWmOn,
    setWmOpacity,
    setWmSize,
    setWmText,
    setWmTile,
    toggleFold,
    wmAngle,
    wmColor,
    wmOn,
    wmOpacity,
    wmSize,
    wmText,
    wmTile,
  } = useStudioContext();
  return (
    <section data-section="s8-watermark" className={`mb-6 transition-opacity ${pdfInfo ? "" : "opacity-40"}`}>
    <SectionTitle
      n="捌" title="設計浮水印"
      collapsed={!!fold.s6} onToggle={() => toggleFold("s6")}
      action={
        <ResetToggle
          getCustom={() => ({ wmOn, wmText, wmSize, wmOpacity, wmAngle, wmColor, wmTile })}
          defaults={() => ({ wmOn: false, wmText: "僅供參考", wmSize: 64, wmOpacity: 15, wmAngle: -45, wmColor: "grey" as WmColor, wmTile: false })}
          apply={(v) => { setWmOn(v.wmOn); setWmText(v.wmText); setWmSize(v.wmSize); setWmOpacity(v.wmOpacity); setWmAngle(v.wmAngle); setWmColor(v.wmColor); setWmTile(v.wmTile); }}
        />
      }
    />
    <Fold open={!fold.s6}>
    <div className={pdfInfo ? undefined : "pointer-events-none"}>
    <div className="rounded-2xl border border-[#E3D9C6] bg-[#FBF8F1] p-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={wmOn} onChange={(e) => setWmOn(e.target.checked)} className="h-4 w-4 accent-[#BE3A2B]" />
          <span className="font-bold text-[#2A231A]">啟用浮水印</span>
        </label>
        <label className={`flex items-center gap-2 font-bold ${wmOn ? "text-[#2A231A]" : "text-[#B4A88F]"}`}>文字
          <input
            type="text" value={wmText} maxLength={24} disabled={!wmOn}
            onChange={(e) => setWmText(e.target.value)}
            placeholder="僅供參考"
            className="w-40 rounded-md border border-[#D9CCB4] bg-white px-2 py-1.5 text-xs font-normal disabled:opacity-40"
          />
        </label>
        <span className={`flex items-center gap-2 ${wmOn ? "" : "pointer-events-none opacity-40"}`}>
          <span className="text-xs text-[#6E6250]">顏色</span>
          <OptionPill active={wmColor === "grey"} onClick={() => setWmColor("grey")} badge="預設">灰</OptionPill>
          <OptionPill active={wmColor === "red"} onClick={() => setWmColor("red")}>紅</OptionPill>
          <OptionPill active={wmColor === "black"} onClick={() => setWmColor("black")}>黑</OptionPill>
        </span>
        <label className={`flex cursor-pointer items-center gap-2 ${wmOn ? "" : "pointer-events-none opacity-40"}`}>
          <input type="checkbox" checked={wmTile} onChange={(e) => setWmTile(e.target.checked)} className="h-4 w-4 accent-[#BE3A2B]" />
          <span className="font-bold text-[#2A231A]">鋪滿全頁</span>
        </label>
      </div>
      <div className={`mt-3 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm ${wmOn ? "" : "pointer-events-none opacity-40"}`}>
        <label className="flex items-center gap-2 font-bold text-[#2A231A]">字號
          <input type="number" min="24" max="120" step="1" value={wmSize} onChange={(e) => setWmSize(clampNum(e.target.value, 24, 120, 64))} className="w-16 rounded-md border border-[#D9CCB4] bg-white px-2 py-1.5 font-mono text-xs font-normal" />
          <span className="text-xs font-normal text-[#6E6250]">pt（預設 64）</span>
        </label>
        <label className="flex items-center gap-2 font-bold text-[#2A231A]">淡化
          <input type="range" min="5" max="40" step="1" value={wmOpacity} onChange={(e) => setWmOpacity(Number(e.target.value))} className="w-24 accent-[#BE3A2B]" />
          <span className="w-10 font-mono text-xs font-normal text-[#6E6250]">{wmOpacity}%</span>
          <span className="text-xs font-normal text-[#6E6250]">（預設 15，越低越淡）</span>
        </label>
        <label className="flex items-center gap-2 font-bold text-[#2A231A]">角度
          <input type="number" min="-60" max="60" step="1" value={wmAngle} onChange={(e) => setWmAngle(clampNum(e.target.value, -60, 60, -45))} className="w-16 rounded-md border border-[#D9CCB4] bg-white px-2 py-1.5 font-mono text-xs font-normal" />
          <span className="text-xs font-normal text-[#6E6250]">°（預設 -45，負值由左上往右下）</span>
        </label>
      </div>
      <div className="mt-2 text-xs text-[#6E6250]">浮水印以半透明圖層覆於頁面內容之上、印章與頁碼之下；僅為視覺識別，不構成防篡改保護。</div>
    </div>
    </div>
    </Fold>
  </section>
  );
}
