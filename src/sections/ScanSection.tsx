import ScanPanel from "../components/ScanPanel";
import { Fold, SectionTitle } from "../components/ui";
import { useStudioContext } from "../studio/context";

// 貳 檔案狀態：上傳時掃描，只列出偵測到的項目
export function ScanSection() {
  const {
    fold,
    pdfInfo,
    san,
    scan,
    setSan,
    toggleFold,
  } = useStudioContext();
  return (
    <section data-section="s2-scan" className={`mb-6 transition-opacity ${pdfInfo ? "" : "opacity-40"}`}>
    <SectionTitle n="貳" title="檔案狀態" collapsed={!!fold.sScan} onToggle={() => toggleFold("sScan")} />
    <Fold open={!fold.sScan}>
    <div className={pdfInfo ? undefined : "pointer-events-none"}>
    <div className="rounded-2xl border border-[#E3D9C6] bg-[#FBF8F1] p-4">
      <ScanPanel scan={pdfInfo ? scan : null} san={san} setSan={setSan} />
    </div>
    </div>
    </Fold>
  </section>
  );
}
