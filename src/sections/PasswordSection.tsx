import { Fold, SectionTitle } from "../components/ui";
import { fmtBytes } from "../lib/helpers";
import { useStudioContext } from "../studio/context";

// 參 移除密碼：解密後才啟用
export function PasswordSection() {
  const {
    addLog,
    decName,
    decUrl,
    decrypted,
    fold,
    locked,
    origName,
    origUrl,
    toggleFold,
    toggleUnlock,
    unlockPerm,
    unlockPw,
  } = useStudioContext();
  return (
    <section data-section="s3-password" className={`mb-6 transition-opacity ${decrypted ? "" : "opacity-40"}`}>
    <SectionTitle n="參" title="移除密碼" collapsed={!!fold.sPw} onToggle={() => toggleFold("sPw")} />
    <Fold open={!fold.sPw}>
    <div className={decrypted ? undefined : "pointer-events-none"} aria-disabled={!decrypted}>
    <div className="rounded-2xl border border-[#E3D9C6] bg-[#FBF8F1] p-4">
    {/* 加密文件選項：PDF 上傳後才可操作，改動時觸發回流壹區 */}
    <div id="unlock-options" className="rounded-xl border border-[#E3D9C6] bg-white/70 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
        <label className="flex cursor-pointer items-start gap-2">
          <input type="checkbox" checked={unlockPw} onChange={(e) => toggleUnlock("pw", e.target.checked)} disabled={!decrypted} className="mt-0.5 h-4 w-4 accent-[#BE3A2B]" />
          <span>
            <span className="font-bold text-[#2A231A]">移除密碼後加印騎縫章或浮水印</span>
            <span className="block text-xs text-[#6E6250]">有開啟密碼的 PDF：在壹區輸入密碼，解密後回到壹區接續用印</span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2">
          <input type="checkbox" checked={unlockPerm} onChange={(e) => toggleUnlock("perm", e.target.checked)} disabled={!decrypted} className="mt-0.5 h-4 w-4 accent-[#BE3A2B]" />
          <span>
            <span className="font-bold text-[#2A231A]">移除權限控制（owner password only）</span>
            <span className="block text-xs text-[#6E6250]">只設權限密碼的 PDF：自動解除列印、複製等限制</span>
          </span>
        </label>
      </div>
      <p className="mt-2 text-xs text-[#8A7C66]">僅限你有權處理的文件。解除後產出的用印 PDF 不再加密。</p>
    </div>
    {/* 解密後：直接下載未加密版本（不用印） */}
    {decrypted && (
      <div className="mt-3 flex flex-col items-center gap-2">
        {locked!.stage !== "unlocked" && (
          <p className="text-center text-sm text-[#6E6250]">已取消勾選，重新勾選即可下載解密後 PDF。</p>
        )}
        <div className="flex w-full gap-3">
        {locked!.stage === "unlocked" ? (
          <a
            href={decUrl ?? undefined} download={decName}
            onClick={() => addLog(`下載解密後 PDF：${decName}（${fmtBytes(locked!.cached!.bytes.length)}）`)}
            className="flex flex-[3] items-center justify-center rounded-xl bg-[#2A6B3A] px-6 py-4 font-['Noto_Serif_TC'] text-lg font-black tracking-[0.12em] text-white shadow-[0_4px_16px_rgba(42,107,58,0.35)] transition-all duration-150 hover:shadow-[0_6px_22px_rgba(42,107,58,0.5)] active:translate-y-[2px] focus:outline-hidden focus-visible:ring-4 focus-visible:ring-[#2A6B3A44]"
          >⬇ 下載解密後 PDF</a>
        ) : (
          <span className="flex flex-[3] cursor-not-allowed items-center justify-center rounded-xl bg-[#C9BBA6] px-6 py-4 font-['Noto_Serif_TC'] text-lg font-black tracking-[0.12em] text-black/70">⬇ 下載解密後 PDF</span>
        )}
          {/* 解密前：原始加密檔，隨時可下載 */}
          <a
            href={origUrl ?? undefined} download={origName}
            onClick={() => addLog(`下載解密前 PDF：${origName}（${fmtBytes(locked!.bytes.length)}）`)}
            className="flex flex-[2] items-center justify-center rounded-xl bg-[#77716A] px-5 py-4 font-['Noto_Serif_TC'] text-lg font-black tracking-[0.12em] text-white shadow-[0_4px_14px_rgba(60,55,48,0.25)] transition-all duration-150 hover:bg-[#67625B] active:translate-y-[2px] focus:outline-hidden focus-visible:ring-4 focus-visible:ring-[#77716A55]"
          >⬇ 下載解密前 PDF</a>
        </div>
      </div>
    )}
    </div>
    </div>
    </Fold>
  </section>
  );
}
