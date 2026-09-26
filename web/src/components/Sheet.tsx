"use client";

import React, { useEffect } from "react";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  kicker?: string;
  children: React.ReactNode;
  width?: number;
}

/** Every dialog: a sheet on the strip, square, one hard shadow. */
export const Sheet: React.FC<SheetProps> = ({ open, onClose, title, kicker, children, width = 460 }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "var(--scrim)" }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="sheet rise w-full" style={{ maxWidth: width }} role="dialog" aria-modal="true" aria-label={title}>
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 rule-b">
          <div>
            {kicker && <div className="lab mb-1.5">{kicker}</div>}
            <h2 className="serif text-[26px] leading-none">{title}</h2>
          </div>
          <button onClick={onClose} className="btn btn-quiet" aria-label="Close">
            esc
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
};

export const Field: React.FC<{ label: string; hint?: React.ReactNode; children: React.ReactNode }> = ({
  label,
  hint,
  children,
}) => (
  <label className="block">
    <div className="flex items-baseline justify-between mb-1.5">
      <span className="lab">{label}</span>
      {hint && <span className="mono text-[10px] ink-3">{hint}</span>}
    </div>
    {children}
  </label>
);

export const ErrorNote: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="mono text-[11px] leading-relaxed px-3 py-2.5" style={{ color: "var(--alarm)", background: "var(--alarm-soft)" }}>
    {children}
  </div>
);
