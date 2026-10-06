import { type ReactNode, useState } from "react";

export function Chip({ children }: { children?: ReactNode }) {
  return (
    <span className="rounded-full bg-[#F0E7D6] px-2 py-0.5 font-mono text-xs text-[#5A4E3C]">{children}</span>
  );
}

// 恢復預設 ⇄ 恢復自訂 toggle: the first click snapshots the section's current custom
// values and applies the defaults; the button then reads 恢復自訂 and clicking it brings
// the snapshot back (flipping the label again). Enlarged type per the app's senior-friendly scale.
export function ResetToggle<T>({ getCustom, defaults, apply }: { getCustom: () => T; defaults: () => T; apply: (v: T) => void }) {
  const [backup, setBackup] = useState<T | null>(null);
  return (
    <button
      type="button"
      onClick={() => {
        if (backup) { apply(backup); setBackup(null); }
        else { setBackup(getCustom()); apply(defaults()); }
      }}
      className="rounded-full border border-[#D9CCB4] bg-white px-4 py-1.5 text-base font-bold text-[#4A4132] transition-colors hover:border-[#BE3A2B] hover:text-[#BE3A2B]"
    >{backup ? "恢復自訂" : "恢復預設"}</button>
  );
}

// Every section title is a fold toggle: click the heading row to collapse/expand the
// section body (the action button on the right, e.g. 恢復預設, stays a separate click target).
export function SectionTitle({ n, title, sub, action, collapsed, onToggle }: { n: string; title: ReactNode; sub?: ReactNode; action?: ReactNode; collapsed?: boolean; onToggle?: () => void }) {
  return (
    <div className="mb-3 flex items-baseline gap-3">
      <button
        type="button" onClick={onToggle} aria-expanded={!collapsed}
        title={collapsed ? "展開章節" : "收合章節"}
        className="group flex flex-1 items-baseline gap-3 rounded-md text-left focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#BE3A2B]"
      >
        <span className="font-['Noto_Serif_TC'] text-[1.8rem] font-black leading-none text-[#BE3A2B]">{n}</span>
        <h2 className="font-['Noto_Serif_TC'] text-lg font-bold text-[#2A231A] transition-colors group-hover:text-[#BE3A2B]">{title}</h2>
        {sub && <span className="text-xs text-[#6E6250]">{sub}</span>}
        <span className={`ml-1 inline-flex h-[3rem] w-[3rem] items-end justify-center text-[#A1906F] transition-transform duration-300 group-hover:text-[#BE3A2B] ${collapsed ? "-rotate-90" : ""}`}>
          <svg viewBox="0 0 24 14" className="h-[1.15rem] w-[2rem]" fill="currentColor" aria-hidden="true"><path d="M1.5 1h21L12 13Z" /></svg>
        </span>
      </button>
      {action && <span className="shrink-0">{action}</span>}
    </div>
  );
}

// Collapsible section body: the grid-rows trick animates the fold without measuring heights.
export function Fold({ open, children }: { open: boolean; children?: ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", transition: "grid-template-rows 0.35s cubic-bezier(.22,1,.36,1)" }}>
      <div style={{ overflow: "hidden", minHeight: 0 }}>{children}</div>
    </div>
  );
}

export function OptionPill({ active, onClick, children, badge }: { active?: boolean; onClick?: () => void; children?: ReactNode; badge?: ReactNode; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative rounded-full border px-3.5 py-1.5 text-sm transition-all focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#BE3A2B] ${
        active ? "border-[#BE3A2B] bg-[#BE3A2B] font-bold text-white shadow-xs" : "border-[#D9CCB4] bg-white text-[#4A4132] hover:border-[#BE3A2B88]"
      }`}
    >
      {children}
      {badge && (
        <span className={`ml-1.5 rounded-sm px-1 text-[11px] ${active ? "bg-white/25 text-white" : "bg-[#BE3A2B14] text-[#BE3A2B]"}`}>{badge}</span>
      )}
    </button>
  );
}
