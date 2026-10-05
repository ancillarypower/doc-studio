import { useStudioContext } from "../studio/context";

// 頁首：印章標誌與標題
export function Header() {
  const {

  } = useStudioContext();
  return (
    <header data-section="header" className="border-b border-[#E3D9C6] bg-[#FBF8F1]">
  <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-4 xl:max-w-[79.6rem]">
    <div className="flex h-10 w-10 items-center justify-center rounded-full border-[3px] border-[#BE3A2B] font-['Noto_Serif_TC'] text-lg font-black text-[#BE3A2B]">章</div>
    <div>
      <h1 className="font-['Noto_Serif_TC'] text-xl font-black tracking-wide">印・章工廠</h1>
      <p className="text-xs tracking-widest text-[#6E6250]">騎縫章、浮水印、加頁碼，全在本機瀏覽器完成，免上傳任何伺服器。</p>
    </div>
  </div>
        </header>
  );
}
