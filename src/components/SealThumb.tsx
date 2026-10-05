import { useMemo } from "react";
import { type SealState } from "../studio/stateTypes";

// Seal thumbnail with a one-shot scissor animation when blank margins were auto-trimmed:
// the original image shows with dashed cut lines + a ✂️ sweep, then fades to the trimmed result.
export function SealThumb({ seal }: { seal: SealState }) {
  const t = seal.info?.trimmed;
  const hasTrim = !!t && t.top + t.left + t.bottom + t.right > 0 && !!seal.origUrl;
  // slower cut with a random 1–3 s dwell at the corner (the overlay remounts per seal via key)
  const dwell = useMemo(() => 1 + Math.random() * 2, [seal.url]);
  let frame = null;
  if (hasTrim) {
    const box = 56;
    const { origW, origH } = seal.info;
    const k = Math.min(box / origW, box / origH);
    const ow = origW * k, oh = origH * k;
    frame = {
      ow, oh,
      l: (t.left / origW) * ow, r: (t.right / origW) * ow,
      tp: (t.top / origH) * oh, b: (t.bottom / origH) * oh,
    };
  }
  return (
    <div className="relative h-14 w-40 shrink-0">
      <img
        src={seal.url} alt="印章預覽"
        className="h-14 w-40 rounded-lg border border-[#E3D9C6] bg-[repeating-conic-gradient(#f0e9db_0%_25%,#fff_0%_50%)] bg-[length:12px_12px] object-contain"
      />
      {frame && (
        <div
          key={seal.url}
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
          style={{ animation: `sealTrimOut ${0.15 + 1.7 + dwell + 1.7 + 0.6}s ease forwards` }}
        >
          <div className="relative" style={{ width: frame.ow, height: frame.oh }}>
            <img src={seal.origUrl} alt="" className="absolute inset-0 h-full w-full rounded-sm border border-[#D9CCB4] bg-white" />
            <div className="absolute border-t border-dashed border-[#BE3A2B]" style={{ left: frame.l, right: frame.r, top: frame.tp }} />
            <div className="absolute border-b border-dashed border-[#BE3A2B]" style={{ left: frame.l, right: frame.r, bottom: frame.b }} />
            <div className="absolute border-l border-dashed border-[#BE3A2B]" style={{ top: frame.tp, bottom: frame.b, left: frame.l }} />
            <div className="absolute border-r border-dashed border-[#BE3A2B]" style={{ top: frame.tp, bottom: frame.b, right: frame.r }} />
          </div>
        </div>
      )}
      {frame && (
        <span
          className="pointer-events-none absolute text-[32px] leading-none drop-shadow-[0_2px_3px_rgba(60,45,20,0.45)]"
          style={{
            left: 0, top: 0, transform: "translate(-50%,-50%)",
            animation: `sealCutOrbitA 1.7s ease-in-out 0.15s forwards, sealCutOrbitB 1.7s ease-in-out ${0.15 + 1.7 + dwell}s forwards, sealTrimOut ${0.15 + 1.7 + dwell + 1.7 + 0.6}s ease forwards`,
          }}
        >
          {/* 路徑轉向時剪刀跟著轉：上緣向右走刀口朝右，轉角後沿右緣向下刀口朝下 */}
          <span className="inline-block" style={{ animation: `scissorTurn 0.45s ease-in-out ${0.15 + 1.7}s forwards` }}>
          <svg viewBox="0 0 64 64" width="34" height="34" aria-hidden="true">
            {/* two halves snip open/shut around the pivot the whole time the scissors travel */}
            <g style={{ transformOrigin: "26px 32px", animation: "scissSnipA 0.38s ease-in-out infinite" }}>
              <circle cx="13" cy="22" r="7.5" fill="none" stroke="#2A231A" strokeWidth="4.5" />
              <path d="M19 26.5 L26 32" stroke="#2A231A" strokeWidth="4.5" strokeLinecap="round" />
              <path d="M24 30 L56 10 L59 15 L27 34.5 Z" fill="#B9BEC6" stroke="#2A231A" strokeWidth="1.6" strokeLinejoin="round" />
            </g>
            <g style={{ transformOrigin: "26px 32px", animation: "scissSnipB 0.38s ease-in-out infinite" }}>
              <circle cx="13" cy="42" r="7.5" fill="none" stroke="#2A231A" strokeWidth="4.5" />
              <path d="M19 37.5 L26 32" stroke="#2A231A" strokeWidth="4.5" strokeLinecap="round" />
              <path d="M24 34 L56 54 L59 49 L27 29.5 Z" fill="#B9BEC6" stroke="#2A231A" strokeWidth="1.6" strokeLinejoin="round" />
            </g>
            <circle cx="26" cy="32" r="3.2" fill="#BE3A2B" stroke="#2A231A" strokeWidth="1.2" />
          </svg>
          </span>
        </span>
      )}
    </div>
  );
}
