import { type RefObject, useState } from "react";
import { Chip } from "./ui";
import { type LockedState } from "../studio/stateTypes";

// 壹區 PDF 卡片（加密檔）：依貳區選項顯示 需要密碼 / 解密中 / 被選項擋下。
// Clicks and keys inside stay here so the surrounding drop zone doesn't open the file picker.
export function LockedCard({ locked, inputRef, onSubmit, onGoto }: { locked: LockedState; inputRef: RefObject<HTMLInputElement | null>; onSubmit: (pw: string) => void; onGoto: () => void }) {
  const [pw, setPw] = useState("");
  const { stage, probe } = locked;
  const submit = () => { if (pw) onSubmit(pw); };
  return (
    <div className="flex items-start gap-3" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-[#BE3A2B14] font-mono text-base font-bold text-[#BE3A2B]">
        PDF
        <span className="absolute -bottom-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#BE3A2B] text-white shadow-sm" aria-hidden="true">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" />
          </svg>
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="pdfname-blur truncate text-sm font-bold text-[#2A231A]" title={locked.name}>{locked.name}</div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <Chip>{probe.ownerOnly ? "權限密碼" : "開啟密碼"}</Chip>
          <Chip>{probe.algo}</Chip>
        </div>
        {stage === "need-pw" && (
          <div className="mt-2.5">
            {/* No <form> submit here: the artifact viewer's sandboxed frame blocks form submission
                (no allow-forms), so the submit event never fired and 解除密碼 looked dead.
                Button click + Enter on the field call unlock directly instead. */}
            <div className="flex gap-2">
              <input
                ref={inputRef} type="password" value={pw} onChange={(e) => setPw(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }}
                placeholder="輸入 PDF 密碼" autoComplete="off" aria-label="PDF 密碼"
                className={`min-w-0 flex-1 rounded-md border bg-white px-2.5 py-1.5 text-sm ${locked.pwError ? "border-[#BE3A2B]" : "border-[#D9CCB4]"}`}
              />
              <button type="button" onClick={submit} disabled={!pw} className="shrink-0 rounded-md bg-[#BE3A2B] px-3 py-1.5 text-sm font-bold text-white transition-opacity disabled:opacity-40">解除密碼</button>
            </div>
            <p className={`mt-1 text-xs ${locked.pwError ? "font-bold text-[#8E2A20]" : "text-[#8A7C66]"}`}>{locked.pwError || "開啟密碼或擁有者密碼都可以"}</p>
          </div>
        )}
        {stage === "working" && <p className="mt-2 text-sm font-bold text-[#6E6250]">解密中…</p>}
        {(stage === "blocked-pw" || stage === "blocked-perm") && (
          <p className="mt-2 text-xs leading-relaxed text-[#6E6250]">
            {stage === "blocked-pw" ? "這份 PDF 需要開啟密碼。" : `這份 PDF 設有權限限制${probe.denied.length ? `（禁止${probe.denied.join("、")}）` : ""}。`}
            <button type="button" onClick={onGoto} className="ml-1 font-bold text-[#BE3A2B] underline underline-offset-2">
              到參區勾選「{stage === "blocked-pw" ? "移除密碼後加印騎縫章或浮水印" : "移除權限控制"}」
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
