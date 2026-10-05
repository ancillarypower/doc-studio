import { useRef, useState } from "react";

export default function DropZone({ label, hint, accept, file, onFile, children, accent = "#BE3A2B" }) {
  const [over, setOver] = useState(false);
  const inputRef = useRef(null);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault(); setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      className={`relative cursor-pointer rounded-2xl border-2 border-dashed p-5 transition-all duration-200 focus:outline-none focus-visible:ring-2 ${
        over ? "scale-[1.015] bg-[#F3E9DC]" : file ? "border-solid bg-[#FBF8F1]" : "bg-[#FBF8F1]/60 hover:bg-[#F8F2E6]"
      }`}
      style={{ borderColor: over || file ? accent : "#D9CCB4" }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }}
      />
      {file ? children : (
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-full" style={{ backgroundColor: accent + "1a", color: accent }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 16V4m0 0l-4 4m4-4l4 4" /><path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" />
            </svg>
          </div>
          <div className="text-[15px] font-bold text-[#2A231A]">{label}</div>
          <div className="text-xs text-[#8A7C66]">{hint}</div>
        </div>
      )}
    </div>
  );
}
