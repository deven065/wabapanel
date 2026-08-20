"use client";
import React, { useEffect, useRef, useState } from "react";
import { Palette, Moon, Sun } from "lucide-react";

const PRESET_COLORS = ["#059669", "#2563eb", "#7c3aed", "#db2777", "#ea580c", "#0f766e", "#166534", "#111827"];
const FONTS = [
  { label: "Inter (default)", value: "Inter" },
  { label: "Poppins", value: "Poppins" },
  { label: "Roboto", value: "Roboto" },
  { label: "Montserrat", value: "Montserrat" },
  { label: "Nunito", value: "Nunito" },
  { label: "Lato", value: "Lato" },
  { label: "Open Sans", value: "Open Sans" },
];

const applyBrand = (c: string | null) => {
  const root = document.documentElement;
  if (c) { root.classList.add("brand-themed"); root.style.setProperty("--brand", c); }
  else { root.classList.remove("brand-themed"); root.style.removeProperty("--brand"); }
};

const applyFont = (f: string | null) => {
  const root = document.documentElement;
  if (f && f !== "Inter") {
    const id = "brand-font-link";
    let link = document.getElementById(id) as HTMLLinkElement | null;
    const href = "https://fonts.googleapis.com/css2?family=" + f.replace(/ /g, "+") + ":wght@400;500;600;700;800&display=swap";
    if (!link) { link = document.createElement("link"); link.id = id; link.rel = "stylesheet"; document.head.appendChild(link); }
    link.href = href;
    root.style.setProperty("--app-font", " + f + ");
  } else { root.style.removeProperty("--app-font"); }
};

const applyDark = (dark: boolean) => {
  const root = document.documentElement;
  if (dark) root.classList.add("dark"); else root.classList.remove("dark");
};

export default function ThemePicker() {
  const [open, setOpen] = useState(false);
  const [color, setColor] = useState("#059669");
  const [font, setFont] = useState("Inter");
  const [dark, setDark] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const c = localStorage.getItem("brandColor");
    const f = localStorage.getItem("brandFont");
    const d = localStorage.getItem("darkMode") === "true";
    if (c) { setColor(c); applyBrand(c); }
    if (f) { setFont(f); applyFont(f); }
    setDark(d); applyDark(d);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const setBrandColor = (c: string) => { setColor(c); localStorage.setItem("brandColor", c); applyBrand(c); };
  const setBrandFont = (f: string) => { setFont(f); localStorage.setItem("brandFont", f); applyFont(f); };
  const toggleDark = () => { const d = !dark; setDark(d); localStorage.setItem("darkMode", String(d)); applyDark(d); };
  const reset = () => { setColor("#059669"); setFont("Inter"); setDark(false); localStorage.removeItem("brandColor"); localStorage.removeItem("brandFont"); localStorage.removeItem("darkMode"); applyBrand(null); applyFont(null); applyDark(false); };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} title="Theme" className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"><Palette className="w-4 h-4" /></button>
      {open && (
        <div className="absolute left-0 top-full mt-2 w-64 bg-white dark:bg-gray-800 rounded-xl shadow-xl ring-1 ring-gray-100 dark:ring-gray-700 z-50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">Dark Mode</p>
            <button onClick={toggleDark} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${dark ? "bg-gray-700 text-yellow-300" : "bg-gray-100 text-gray-600"}`}>
              {dark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />} {dark ? "Light" : "Dark"}
            </button>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1.5">Theme colour</p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {PRESET_COLORS.map((c) => (<button key={c} onClick={() => setBrandColor(c)} className={`w-6 h-6 rounded-full border-2 ${color === c ? "border-gray-800" : "border-transparent"}`} style={{ backgroundColor: c }} />))}
            </div>
            <div className="flex items-center gap-2"><input type="color" value={color} onChange={(e) => setBrandColor(e.target.value)} className="w-8 h-8 p-0 border border-gray-200 rounded cursor-pointer" /><span className="text-xs text-gray-500 dark:text-gray-400">Custom</span></div>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1.5">Font</p>
            <select value={font} onChange={(e) => setBrandFont(e.target.value)} className="w-full text-sm px-2.5 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50">
              {FONTS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
          <button onClick={reset} className="w-full text-xs px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 font-medium">Reset to default</button>
        </div>
      )}
    </div>
  );
}
