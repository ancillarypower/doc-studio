// Live placement diagram: real page thumbnails, seal parts positioned at edges.
// 併攏 mode slides pages together so halves/slices visually reconstruct the seal.
// With 側邊裝訂蓋章法 (method B), 併攏 instead squares the pages up into a stack:
// each page slides under the previous one so only its right-edge slice stays
// visible, and the slices line up like the edge of a stamped paper stack.
// Every page renders in one long strip, no matter how many pages the document has.
// Pages shown are requested via onNeedThumb(pageIdx); until its real thumbnail
// arrives, a page keeps the old placeholder card (fake text lines).
import { Fragment, useEffect, useState } from "react";
import type { EngineData, Method } from "../types";

export interface DiagramProps {
  pages: EngineData[];
  planView: EngineData;
  joined: boolean;
  method: Method | null;
  thumbs: Record<number, string>;
  onNeedThumb?: (idx: number) => void;
  onRenderPage?: (idx: number, px: number) => Promise<string | null | undefined> | string | null | undefined;
}

const PAGE_H = 190; // px in diagram

export default function Diagram({ pages, planView, joined, method, thumbs, onNeedThumb, onRenderPage }: DiagramProps) {
  // planView: per page: { seals: [{dataURL, x, y, w, h} (pt, visual space)], label: {x, w, align} }
  // click-to-read overlay: one page rendered large enough to actually read
  const [zoomIdx, setZoomIdx] = useState<number | null>(null);
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  useEffect(() => {
    if (zoomIdx == null || !onRenderPage) return;
    let live = true;
    setZoomUrl(null);
    Promise.resolve(onRenderPage(zoomIdx, 1200)).then((u) => { if (live && u) setZoomUrl(u); }).catch(() => {});
    return () => { live = false; };
  }, [zoomIdx, onRenderPage]);
  useEffect(() => {
    if (zoomIdx == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoomIdx(null);
      else if (e.key === "ArrowLeft") setZoomIdx((z) => (z != null && z > 0 ? z - 1 : z));
      else if (e.key === "ArrowRight") setZoomIdx((z) => (z != null && z < pages.length - 1 ? z + 1 : z));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomIdx == null, pages.length]);
  // 側邊裝訂 + 併攏: pages overlap like a squared-up stack, each exposing its right-edge slice
  const stackB = joined && method === "B";

  // ask the app to rasterize every page (deduped upstream)
  useEffect(() => {
    if (!onNeedThumb) return;
    pages.forEach((_, i) => onNeedThumb(i));
  });

  return (
    <div>
      <div className="diag-scroll overflow-x-auto pb-2">
      <div
        className="flex items-stretch"
        style={{ gap: joined ? 0 : 10, transition: "gap 500ms cubic-bezier(.22,1,.36,1)", width: "max-content", padding: "4px 2px" }}
      >
        {pages.map((p, i) => {
          const pageIdx = i;
          const scale = PAGE_H / p.h;
          const w = p.w * scale;
          const view = planView?.[pageIdx];
          // stack mode: how much of this page peeks out from under the previous one.
          // The slice itself is often sub-pixel at preview scale (2 mm on A4 ≈ 1.3 px),
          // so slices are drawn stretched to the sliver width — the seal still reads
          // contiguously across the stack. (The 浮水印 layer is full-page width and is
          // excluded from slice detection.)
          const sliceWpts = (view?.seals || []).map((s: EngineData) => s.w).filter((wpt: number) => wpt < p.w * 0.9);
          const slicePx = sliceWpts.length ? Math.min(...sliceWpts) * scale : 0;
          const sliver = Math.max(slicePx, 10);
          const stacked = stackB && i > 0;
          return (
            <Fragment key={pageIdx}>
            <div
              key={pageIdx}
              onClick={() => setZoomIdx(pageIdx)}
              title={`放大閱讀第 ${pageIdx + 1} 頁`}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setZoomIdx(pageIdx); } }}
              className="relative shrink-0 cursor-zoom-in rounded-[3px] border bg-white shadow-[0_1px_3px_rgba(60,45,20,0.18)]"
              style={{
                width: w, height: PAGE_H,
                borderColor: "#E3D9C6",
                borderLeftWidth: joined ? 0.5 : 1,
                borderRightWidth: joined ? 0.5 : 1,
                marginLeft: stacked ? sliver - w : 0,
                zIndex: stackB ? pages.length - i : undefined,
                boxShadow: stackB ? "0 1px 3px rgba(60,45,20,0.18), 14px 0 16px -6px rgba(60,45,20,0.35)" : undefined,
                transition: "border-radius 400ms, margin-left 500ms cubic-bezier(.22,1,.36,1), box-shadow 400ms",
              }}
            >
              {/* page face: real rasterized thumbnail once ready, placeholder lines until then */}
              {thumbs && thumbs[pageIdx] ? (
                <img
                  src={thumbs[pageIdx]}
                  alt=""
                  draggable={false}
                  className="pointer-events-none absolute inset-0 h-full w-full select-none rounded-[2px]"
                />
              ) : (
                <div className="absolute left-[10%] top-[8%] flex w-[62%] flex-col gap-[6px] opacity-[0.13]">
                  {[0.9, 1, 0.95, 0.85].map((f, k) => (
                    <div key={k} style={{ height: 3, width: `${f * 100}%`, background: "#4A4132", borderRadius: 2 }} />
                  ))}
                </div>
              )}
              {/* seal parts (plan y is bottom-based PDF pt; CSS top is top-based: flip) */}
              {view?.seals.map((s: EngineData, k: number) => {
                // full-page layers (浮水印) never stretch; in stack mode a slice is drawn
                // stretched to the exposed sliver so the seal reconstructs legibly
                const fullPage = s.w >= p.w * 0.9;
                const stretch = stackB && !fullPage;
                return (
                  <img
                    key={k}
                    src={s.dataURL}
                    alt=""
                    draggable={false}
                    className="pointer-events-none absolute select-none"
                    style={stretch
                      ? { left: w - sliver, top: (p.h - s.y - s.h) * scale, width: sliver, height: s.h * scale }
                      : { left: s.x * scale, top: (p.h - s.y - s.h) * scale, width: s.w * scale, height: s.h * scale }}
                  />
                );
              })}
              {/* page-number label (position, size, rotation mirror the 頁碼設定) */}
              {view?.label && (
                <div
                  className={`absolute flex items-center justify-center rounded-[1px] ${view.label.rot ? "overflow-visible" : "overflow-hidden"}`}
                  style={{
                    left: view.label.x * scale,
                    bottom: (view.label.bottomMm ?? 10) * (72 / 25.4) * scale,
                    width: Math.max(view.label.w * scale, 6),
                    height: 9 * scale,
                    transform: view.label.rot ? `rotate(${-view.label.rot}deg)` : undefined,
                    transformOrigin: "left bottom",
                  }}
                >
                  <div style={{ width: "80%", height: 2.5, background: "#BE3A2B", borderRadius: 2, opacity: 0.85 }} />
                </div>
              )}
              {/* page index */}
              <div className="absolute left-1 top-1 rounded-sm bg-white/75 px-1 font-mono text-[13px] font-bold leading-snug text-[#8A7C66]">{pageIdx + 1}</div>
            </div>
            </Fragment>
          );
        })}
      </div>
      </div>

      {/* click-to-read overlay: one page large enough to read, with seal parts, page-number
          marker and watermark overlaid exactly as planned. The app wrapper zooms the UI 1.25×,
          so this overlay carries the inverse zoom to stay true viewport size. */}
      {zoomIdx != null && pages[zoomIdx] && (() => {
        const p = pages[zoomIdx];
        let H = Math.max(380, Math.min(window.innerHeight * 0.86, 1040));
        let scale = H / p.h;
        if (p.w * scale > window.innerWidth * 0.88) { scale = (window.innerWidth * 0.88) / p.w; H = p.h * scale; }
        const w = p.w * scale;
        const view = planView?.[zoomIdx];
        const imgUrl = zoomUrl || (thumbs && thumbs[zoomIdx]);
        return (
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-[rgba(30,25,15,0.6)] p-4 backdrop-blur-[3px]"
            style={{ zoom: 0.8 }}
            onClick={() => setZoomIdx(null)}
            role="dialog" aria-modal="true" aria-label={`第 ${zoomIdx + 1} 頁放大預覽`}
          >
            <div className="relative" style={{ width: w, height: H }} onClick={(e) => e.stopPropagation()}>
              <div className="relative h-full w-full select-none overflow-hidden rounded-md border border-[#E3D9C6] bg-white shadow-[0_24px_60px_rgba(20,15,8,0.5)]">
                {imgUrl ? (
                  <img src={imgUrl} alt={`第 ${zoomIdx + 1} 頁`} draggable={false} className="absolute inset-0 h-full w-full" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-sm text-[#A1906F]">頁面渲染中…</div>
                )}
                {view?.seals.map((s: EngineData, k: number) => (
                  <img
                    key={k} src={s.dataURL} alt="" draggable={false}
                    className="pointer-events-none absolute select-none"
                    style={{ left: s.x * scale, top: (p.h - s.y - s.h) * scale, width: s.w * scale, height: s.h * scale }}
                  />
                ))}
                {view?.label && (
                  <div
                    className={`absolute flex items-center justify-center rounded-[1px] ${view.label.rot ? "overflow-visible" : "overflow-hidden"}`}
                    style={{
                      left: view.label.x * scale,
                      bottom: (view.label.bottomMm ?? 10) * (72 / 25.4) * scale,
                      width: Math.max(view.label.w * scale, 6),
                      height: 9 * scale,
                      transform: view.label.rot ? `rotate(${-view.label.rot}deg)` : undefined,
                      transformOrigin: "left bottom",
                    }}
                  >
                    <div style={{ width: "80%", height: Math.max(3, 2.5 * scale), background: "#BE3A2B", borderRadius: 2, opacity: 0.85 }} />
                  </div>
                )}
              </div>
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-[#D9CCB4] bg-[#FBF8F1] px-3 py-1 font-mono text-xs font-bold text-[#4A4132] shadow-md">
                第 {zoomIdx + 1} / {pages.length} 頁
              </div>
              <button
                type="button" onClick={() => setZoomIdx(null)} aria-label="關閉放大預覽"
                className="absolute -right-3 -top-3 flex h-8 w-8 items-center justify-center rounded-full border border-[#D9CCB4] bg-[#FBF8F1] text-sm font-bold text-[#4A4132] shadow-md transition-colors hover:border-[#BE3A2B] hover:text-[#BE3A2B]"
              >✕</button>
              {zoomIdx > 0 && (
                <button
                  type="button" onClick={() => setZoomIdx(zoomIdx - 1)} aria-label="上一頁"
                  className="absolute -left-5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-[#D9CCB4] bg-[#FBF8F1] text-base font-bold text-[#4A4132] shadow-md transition-colors hover:border-[#BE3A2B] hover:text-[#BE3A2B]"
                >‹</button>
              )}
              {zoomIdx < pages.length - 1 && (
                <button
                  type="button" onClick={() => setZoomIdx(zoomIdx + 1)} aria-label="下一頁"
                  className="absolute -right-5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-[#D9CCB4] bg-[#FBF8F1] text-base font-bold text-[#4A4132] shadow-md transition-colors hover:border-[#BE3A2B] hover:text-[#BE3A2B]"
                >›</button>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
