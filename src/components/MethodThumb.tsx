import { type ReactNode, useEffect, useRef, useState } from "react";
import { type MethodThumbProps } from "../studio/stateTypes";
import { PLACEHOLDER_SEAL } from "../lib/constants";

// Fluid scaler: the method thumbnails are designed on a fixed w×h box, then scaled up
// (or down) to fill whatever width the card gives them, so the diagram — not the text —
// takes the larger share of the card.
export function FluidScale({ w, h, max = 1.9, children }: { w: number; h: number; max?: number; children?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setScale(Math.min(max, Math.max(0.6, el.clientWidth / w)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [w, max]);
  return (
    <div ref={ref} className="relative min-w-0 flex-1 overflow-visible" style={{ aspectRatio: `${w}/${h}` }} aria-hidden="true">
      <div className="absolute left-1/2 top-1/2" style={{ width: w, height: h, transform: `translate(-50%, -50%) scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}

// Miniature of how the seal lands on page edges, per method:
// halves-h = seal across the seam (橫蓋) · halves-v = seal turned 90° (直蓋) ·
// slices = seal cut into thin page strips (側邊裝訂).
export function MethodThumb(props: MethodThumbProps) {
  return (
    <FluidScale w={120} h={85}>
      <MethodThumbBox {...props} />
    </FluidScale>
  );
}

export function MethodThumbBox({ kind, sealUrl, aspect, pageCount }: MethodThumbProps) {
  const url = sealUrl || PLACEHOLDER_SEAL;
  const ar = aspect > 0 ? aspect : 1;
  const W = 120, H = 85; // larger thumbnail: text column yields width to the diagram
  const cardCls = "rounded-[3px] border border-[#E3D9C6] bg-white shadow-[0_1px_2px_rgba(60,45,20,0.12)]";
  if (kind === "slices") {
    const h = Math.min(H, (W * 0.92) / ar);
    // enlarge the sliced seal inside its fixed box: transform scale never touches layout
    const zoom = Math.min(1.2, H / h);
    // fixed 5px strips (as displayed, after zoom), as many as fit across the box
    const SW = 5 / zoom, GAP = 1 / zoom;
    const n = Math.max(4, Math.floor((W / zoom + GAP) / (SW + GAP)));
    return (
      <div className="flex shrink-0 items-center" style={{ width: W, height: H }} aria-hidden="true">
        <div className="flex w-full items-stretch justify-center" style={{ height: h, gap: GAP, transform: zoom > 1 ? `scale(${zoom})` : undefined, transformOrigin: "center" }}>
          {Array.from({ length: n }, (_, i) => (
            <div
              key={i}
              className="h-full shrink-0 rounded-[1px] border-[0.5px] border-[#E3D9C6] bg-white"
              style={{
                width: SW,
                backgroundImage: `url("${url}")`,
                backgroundSize: `${n * 100}% 100%`,
                backgroundPosition: `${(i / (n - 1)) * 100}% 0`,
              }}
            />
          ))}
        </div>
      </div>
    );
  }
  const vert = kind === "halves-v";
  // displayed (post-rotation) seal box: halves-v shows the seal turned 90°
  const dispAr = vert ? 1 / ar : ar; // displayed width / height
  const dispW = Math.min(W - 16, H * dispAr);
  const dispH = dispW / dispAr;
  const box = vert
    ? { width: dispH, height: dispW, left: (W - dispH) / 2, top: (H - dispW) / 2, transform: "rotate(90deg)" }
    : { width: dispW, height: dispH, left: (W - dispW) / 2, top: (H - dispH) / 2 };
  return (
    <div className="relative shrink-0" style={{ width: W, height: H }} aria-hidden="true">
      <div className="absolute inset-0 flex items-stretch justify-center" style={{ gap: 2 }}>
        <div className={cardCls} style={{ width: (W - 2) / 2 }} />
        <div className={cardCls} style={{ width: (W - 2) / 2 }} />
      </div>
      <div
        className="absolute"
        style={{ ...box, backgroundImage: `url("${url}")`, backgroundSize: "100% 100%" }}
      />
    </div>
  );
}
