import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { randomMandala } from "../lib/helpers";

// 活字印刷鉛字章 stamping cinematic, played when 產生用印 PDF is pressed: a movable-type
// lead slug (brushed metal column, typesetter's nicks, cinnabar-inked mandala matrix on its
// face) glides in from a random screen edge like a paper plane settling onto the desk,
// while the whole page behind blurs out of focus; after 1s a hand pops in, grabs it, stamps
// it at screen center, lets go and fades out; the slug then flies itself away, tumbling out
// through a random screen edge (~1.3–2.2s).
export function YuxiFX({ onDone }: { onDone: () => void }) {
  const conf = useMemo(() => {
    const edge = Math.floor(Math.random() * 4); // 0 left · 1 right · 2 top · 3 bottom
    const departMs = 1300 + Math.random() * 900;
    const grab = { x: 28 + Math.random() * 18, y: 30 + Math.random() * 14 }; // vw / vh
    const start =
      edge === 0 ? { x: -16, y: 16 + Math.random() * 42 } :
      edge === 1 ? { x: 116, y: 16 + Math.random() * 42 } :
      edge === 2 ? { x: 16 + Math.random() * 66, y: -20 } :
                   { x: 16 + Math.random() * 66, y: 120 };
    // after stamping, the seal flies itself off through a random screen edge
    const exitEdge = Math.floor(Math.random() * 4);
    const exit =
      exitEdge === 0 ? { x: -18, y: 8 + Math.random() * 76 } :
      exitEdge === 1 ? { x: 118, y: 8 + Math.random() * 76 } :
      exitEdge === 2 ? { x: 8 + Math.random() * 84, y: -26 } :
                       { x: 8 + Math.random() * 84, y: 126 };
    return { departMs, grab, dx: start.x - grab.x, dy: start.y - grab.y, ex: exit.x - 50, ey: exit.y - 46, spin: Math.random() < 0.5 ? -1 : 1 };
  }, []);
  const [phase, setPhase] = useState("fly");
  const mandala = useMemo(randomMandala, []); // fresh 圖騰 per stamping
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  useEffect(() => {
    // run once per mount: progress re-renders from generate() must not restart the timeline
    const schedule: [number, string][] = [
      [1000, "grab"],      // hand pops in, no transition
      [1120, "center"],    // carry the seal to screen center
      [1620, "stampDown"], // press
      [1840, "stampUp"],   // rebound
      [2140, "release"],   // hand lets go and fades
      [2540, "depart"],    // the seal flies itself away through a random edge
    ];
    const timers = schedule.map(([ms, ph]) => setTimeout(() => setPhase(ph), ms));
    const done = setTimeout(() => onDoneRef.current(), 2540 + conf.departMs + 150);
    return () => { timers.forEach(clearTimeout); clearTimeout(done); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pos =
    phase === "fly" || phase === "grab" ? conf.grab :
    phase === "stampDown" ? { x: 50, y: 53 } :
    { x: 50, y: 46 };
  const moveMs = phase === "center" ? 500 : phase === "stampDown" ? 220 : phase === "stampUp" ? 300 : 0;
  const handShown = phase !== "fly";
  const handFading = phase === "release" || phase === "depart";
  const departing = phase === "depart";

  return (
    <div className="pointer-events-none fixed inset-0 z-[70] overflow-hidden" aria-hidden="true">
      {/* red imprint flash right where the seal lands: a random mandala, no characters */}
      {(phase === "stampUp" || phase === "release") && (
        <div className="absolute" style={{ left: "50vw", top: "55vh" }}>
          <img
            src={mandala} alt=""
            className="h-24 w-24 rounded-md bg-[#BE3A2B] p-1.5"
            style={{ transform: "translate(-50%,-30%)", animation: "yuxiImprint 0.95s ease-out forwards" }}
          />
        </div>
      )}
      <div
        className="absolute"
        style={{
          left: pos.x + "vw",
          top: pos.y + "vh",
          transform: "translate(-50%,-50%)",
          transition: moveMs
            ? `left ${moveMs}ms cubic-bezier(.33,.9,.35,1), top ${moveMs}ms ${phase === "stampDown" ? "cubic-bezier(.55,.06,.9,.4)" : "cubic-bezier(.34,1.4,.64,1)"}`
            : undefined,
        }}
      >
        {/* chaotic tumble-in from the chosen edge (fly phase only) */}
        <div style={phase === "fly" ? ({ animation: "yuxiFly 1s cubic-bezier(.25,.8,.3,1) forwards", "--dx": conf.dx + "vw", "--dy": conf.dy + "vh", "--spin": conf.spin } as CSSProperties) : undefined}>
          {/* after the hand lets go, the seal tumbles away on its own */}
          <div style={departing ? ({ animation: `yuxiFlyOut ${conf.departMs}ms cubic-bezier(.45,.05,.75,.35) forwards`, "--ex": conf.ex + "vw", "--ey": conf.ey + "vh", "--spin": conf.spin } as CSSProperties) : undefined}>
            <div className="relative" style={{ width: 134, height: 184 }}>
              {/* 活字印刷鉛字章: brushed lead column + cinnabar-inked matrix face pointing down */}
              <div className="absolute bottom-0 left-1/2" style={{ transform: "translateX(-50%)" }}>
                {/* soft contact shadow-sm grounding the slug */}
                <div style={{ position: "absolute", left: "50%", bottom: -10, width: 150, height: 20, transform: "translateX(-50%)", borderRadius: "50%", background: "radial-gradient(ellipse at center, rgba(30,25,15,.35), rgba(30,25,15,0) 68%)", filter: "blur(3px)" }} />
                {/* lead type column: cool metal with a top-left sheen and brushed vertical grain */}
                <div style={{ position: "relative", width: 100, height: 128, margin: "0 auto", borderRadius: 5, background: "radial-gradient(ellipse 58% 40% at 30% 14%, rgba(255,255,255,.5), rgba(255,255,255,0) 70%), linear-gradient(165deg,#82828E 0%,#5A5A66 34%,#3D3D47 68%,#2C2C34 100%)", border: "2px solid #201E26", boxShadow: "inset 0 4px 7px rgba(255,255,255,.4), inset -8px -10px 14px rgba(0,0,0,.4), inset 6px 0 10px rgba(255,255,255,.14), 0 16px 28px rgba(25,22,30,.45)", overflow: "hidden" }}>
                  <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(90deg, rgba(255,255,255,.05) 0 2px, rgba(0,0,0,.05) 2px 4px)" }} />
                  {/* typesetter's nicks: twin grooves near the base, felt to orient the slug */}
                  <div style={{ position: "absolute", left: 8, right: 8, bottom: 16, height: 3, borderRadius: 2, background: "rgba(15,14,20,.55)", boxShadow: "inset 0 1px 1px rgba(0,0,0,.6), 0 1px 0 rgba(255,255,255,.14)" }} />
                  <div style={{ position: "absolute", left: 8, right: 8, bottom: 8, height: 3, borderRadius: 2, background: "rgba(15,14,20,.55)", boxShadow: "inset 0 1px 1px rgba(0,0,0,.6), 0 1px 0 rgba(255,255,255,.14)" }} />
                </div>
                {/* cinnabar-inked face: the same random mandala matrix it stamps */}
                <div style={{ position: "relative", width: 108, height: 34, margin: "-2px auto 0", transform: "skewX(-14deg)", transformOrigin: "top center", borderRadius: "0 0 8px 8px", background: "linear-gradient(180deg,#D85A4C 0%,#B8392C 55%,#93231A 100%)", border: "2px solid #7E2118", boxShadow: "inset 0 2px 3px rgba(255,255,255,.3), inset 0 -5px 7px rgba(0,0,0,.3), 0 6px 9px rgba(0,0,0,.34)", overflow: "hidden" }}>
                  <img src={mandala} alt="" draggable={false} style={{ position: "absolute", left: "50%", top: "50%", width: 46, height: 46, transform: "translate(-50%,-52%)", opacity: 0.92 }} />
                </div>
              </div>
              {/* white-gloved fist, pops in over the knob */}
              <svg
                viewBox="0 0 120 104"
                style={{
                  position: "absolute", left: "50%", bottom: 120, width: 140,
                  transform: "translateX(-50%)",
                  opacity: handShown ? (handFading ? 0 : 1) : 0,
                  transition: handFading ? "opacity 380ms ease" : "none",
                  filter: "drop-shadow(0 6px 8px rgba(30,25,15,.35))",
                }}
              >
                <g stroke="#2A231A" strokeWidth="4" strokeLinejoin="round">
                  {/* sleeve */}
                  <rect x="42" y="-2" width="36" height="26" rx="8" fill="#2A231A" />
                  {/* fist */}
                  <path d="M30 22 h60 v24 a30 27 0 0 1 -60 0 Z" fill="#FFFDF8" />
                  {/* knuckle bumps */}
                  <circle cx="42" cy="66" r="11" fill="#FFFDF8" />
                  <circle cx="60" cy="70" r="11" fill="#FFFDF8" />
                  <circle cx="78" cy="66" r="11" fill="#FFFDF8" />
                  {/* thumb */}
                  <ellipse cx="97" cy="46" rx="10" ry="15" fill="#FFFDF8" transform="rotate(28 97 46)" />
                  {/* finger grooves */}
                  <path d="M51 30 v26 M69 30 v26" fill="none" strokeLinecap="round" />
                </g>
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
