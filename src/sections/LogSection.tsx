import { Fold, SectionTitle } from "../components/ui";
import { useStudioContext } from "../studio/context";

// 拾 處理紀錄
export function LogSection() {
  const {
    fold,
    log,
    logFileName,
    logUrl,
    toggleFold,
  } = useStudioContext();
  return (
    <section data-section="s10-log" className="mb-6">
    <SectionTitle
      n="拾" title="處理紀錄"
      sub={log.length ? `${log.length} 筆` : undefined}
      collapsed={!!fold.s8} onToggle={() => toggleFold("s8")}
      action={logUrl ? (
        <a
          href={logUrl} download={logFileName}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#D9CCB4] bg-white px-4 py-1.5 text-base font-bold text-[#4A4132] transition-colors hover:border-[#BE3A2B] hover:text-[#BE3A2B]"
        >⬇ 下載紀錄</a>
      ) : (
        <span className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-full border border-[#E3D9C6] bg-white/60 px-4 py-1.5 text-base font-bold text-[#B4A88F]" title="尚無紀錄">⬇ 下載紀錄</span>
      )}
    />
    <Fold open={!fold.s8}>
    <div className="rounded-2xl border border-[#E3D9C6] bg-[#FBF8F1] p-4">
      {log.length === 0 ? (
        <div className="text-sm text-[#6E6250]">
          尚無紀錄。載入 PDF、印章或產生文件後，每個處理步驟都會記在這裡。
        </div>
      ) : (
        <div>
          <div className="mb-2 flex items-center justify-between text-xs text-[#6E6250]">
            <span>時間</span>
            <span>共 {log.length} 筆紀錄</span>
          </div>
          <ul className="space-y-1 text-sm leading-relaxed text-[#4A4132]">
            {log.map((e, i) => (
              <li key={i} className="flex gap-3 rounded-md px-2 py-1 odd:bg-[#F5EFE2]/60">
                <span className="shrink-0 font-mono text-xs tabular-nums text-[#A99B7E]">[{e.t}]</span>
                <span className={`break-all ${e.msg.includes("失敗") || e.msg.includes("錯誤") ? "text-[#8E2A20]" : e.msg.includes("完成") ? "text-[#2A6B3A]" : ""}`}>{e.msg}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
    </Fold>
  </section>
  );
}
