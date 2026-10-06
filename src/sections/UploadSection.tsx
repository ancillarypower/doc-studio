import DropZone from "../components/DropZone";
import { Chip, Fold, SectionTitle } from "../components/ui";
import { LockedCard } from "../components/LockedCard";
import { SealThumb } from "../components/SealThumb";
import { fmtBytes } from "../lib/helpers";
import { useStudioContext } from "../studio/context";

// 壹 上傳文件與騎縫章（PDF 只從這裡進入）
export function UploadSection() {
  const {
    fold,
    handlePdf,
    handleSeal,
    locked,
    lockedRef,
    pdfInfo,
    pwInputRef,
    s1Ref,
    seal,
    setFold,
    toggleFold,
    unlockWith,
  } = useStudioContext();
  return (
    <section data-section="s1-upload" ref={s1Ref} className="mb-6 scroll-mt-4">
    <SectionTitle n="壹" title="上傳文件與騎縫章" collapsed={!!fold.s1} onToggle={() => toggleFold("s1")} />
    <Fold open={!fold.s1}>
    <div className="grid gap-4 sm:grid-cols-2">
      <DropZone label="拖曳 PDF 到這裡" hint="或點擊選擇檔案 · 加密 PDF 依參區設定處理" accept="application/pdf,.pdf" file={pdfInfo || locked} onFile={handlePdf}>
        {!pdfInfo && locked && (
          <LockedCard
            locked={locked} inputRef={pwInputRef}
            onSubmit={(pw) => unlockWith(lockedRef.current!, pw)}
            onGoto={() => { setFold((f) => ({ ...f, sPw: false })); document.getElementById("unlock-options")?.scrollIntoView({ behavior: "smooth", block: "center" }); }}
          />
        )}
        {pdfInfo && (
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-[#BE3A2B14] font-mono text-base font-bold text-[#BE3A2B]">PDF</div>
            <div className="min-w-0 flex-1">
              <div className="pdfname-blur truncate text-sm font-bold text-[#2A231A]" title={pdfInfo.name}>{pdfInfo.name}</div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Chip>{pdfInfo.count} 頁</Chip>
                <Chip>{fmtBytes(pdfInfo.bytes.length)}</Chip>
                {pdfInfo.rotatedCount > 0 && <Chip>{pdfInfo.rotatedCount} 頁有旋轉</Chip>}
                {pdfInfo.unlock && <Chip>{pdfInfo.unlock.kind === "perm" ? "已解除權限限制" : "已解密"}</Chip>}
                {pdfInfo.unlock && <Chip>{pdfInfo.unlock.algo}</Chip>}
              </div>
            </div>
          </div>
        )}
      </DropZone>
      <DropZone label="拖曳印章圖片" hint="PNG 透明背景最佳 · JPG 自動去除白底" accept="image/png,image/jpeg,image/webp" file={seal} onFile={handleSeal}>
        {seal && (
          <div className="flex items-center gap-3">
            <SealThumb seal={seal} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold">已裁切空白邊</div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Chip>{seal.info.w}×{seal.info.h}px</Chip>
                {seal.info.bytes != null && <Chip>{fmtBytes(seal.info.bytes)}</Chip>}
                {seal.info.downscaled && <Chip>已縮小以加速處理</Chip>}
                {seal.info.bgRemoved && <Chip>已去背</Chip>}
              </div>
            </div>
          </div>
        )}
      </DropZone>
    </div>
    </Fold>
  </section>
  );
}
