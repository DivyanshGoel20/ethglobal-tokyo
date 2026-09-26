"use client";

import React from "react";
import { LifelineMark } from "./Pulse";

interface HeaderProps {
  onSignOut: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onSignOut }) => (
  <header className="rule-b" style={{ background: "var(--ground)" }}>
    <div className="max-w-[1180px] mx-auto px-4 sm:px-10 h-16 flex items-center justify-between gap-3 sm:gap-6">
      <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
        <LifelineMark size={16} />
        <span className="serif text-[21px] sm:text-[25px] leading-none tracking-tight">Lifeline</span>
      </div>
      <button onClick={onSignOut} className="btn btn-quiet" style={{ paddingInline: 10 }}>
        Sign out
      </button>
    </div>
  </header>
);
