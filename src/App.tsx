// 印・章工廠 Doc Studio: app shell.
// Ported from the ClickUp artifact (v38). The original single-file source and its build live in
// reference/artifact/ and are used by CI as the visual baseline. The artifact's changelog (v12–v38)
// is preserved at the top of reference/artifact/src/App.jsx.
import { YuxiFX } from "./components/YuxiFX";
import { Header } from "./sections/Header";
import { UploadSection } from "./sections/UploadSection";
import { ScanSection } from "./sections/ScanSection";
import { PasswordSection } from "./sections/PasswordSection";
import { MethodSection } from "./sections/MethodSection";
import { PreviewSection } from "./sections/PreviewSection";
import { SealFormatSection } from "./sections/SealFormatSection";
import { PageNumberSection } from "./sections/PageNumberSection";
import { WatermarkSection } from "./sections/WatermarkSection";
import { OutputSection } from "./sections/OutputSection";
import { LogSection } from "./sections/LogSection";
import { StudioContext } from "./studio/context";
import { useStudio } from "./studio/useStudio";

export default function App() {
  const studio = useStudio();
  const { error, fxRun, setFxRun } = studio;
  return (
    <StudioContext.Provider value={studio}>
    <main className="min-h-screen bg-[#F5F0E6] text-[#2A231A]" style={{ fontFamily: "'Noto Sans TC', system-ui, sans-serif" }}>

      {/* everything behind the cinematic blurs out of focus while it plays;
          長者友善字級：全站放大 1.25×（浮動面板與鉛字章動畫在此層之外，維持原尺寸） */}
      <div className={fxRun > 0 ? "yuxi-defocus" : undefined} style={{ transition: "filter .45s ease", zoom: 1.25 }}>
      {/* header */}
      <Header />

      <div className="mx-auto max-w-5xl px-5 py-6 xl:max-w-[79.6rem]">
        {error && (
          <div className="mb-4 rounded-xl border border-[#BE3A2B] bg-[#FDECEA] px-4 py-3 text-sm text-[#8E2A20]">{error}</div>
        )}

        {/* step 1: uploads (the only place a PDF enters the app) */}
        <UploadSection />

        {/* 貳 檔案狀態：upload-time scan; only detected items are listed, each with its 淨化 option */}
        <ScanSection />

        {/* step 2: 移除密碼 (encrypted-PDF options). Stays dimmed and unclickable until an
            encrypted upload has actually been decrypted (cached decrypted bytes exist); after that
            the options stay live (untick → 卸下, retick → 回流) and a 下載解密後 PDF button appears. */}
        <PasswordSection />

        {/* step 3: seal method */}
        <MethodSection />

        {/* step 4: placement preview */}
        <PreviewSection />

        {/* step 4: seal config */}
        <SealFormatSection />

        {/* step 5: page numbers */}
        <PageNumberSection />

        {/* step 6: watermark */}
        <WatermarkSection />

        {/* step 7: output */}
        <OutputSection />

        {/* step 8: processing records */}
        <LogSection />
      </div>
      </div>
      {fxRun > 0 && <YuxiFX key={fxRun} onDone={() => setFxRun(0)} />}
    </main>
    </StudioContext.Provider>
  );
}
