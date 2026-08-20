'use client';
import React, { useRef } from 'react';
import { Bold, Italic, Strikethrough, Code, List } from 'lucide-react';

interface Props {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
  className?: string;
}

// Textarea with a WhatsApp-style formatting toolbar.
// WhatsApp markup: *bold*, _italic_, ~strikethrough~, ```monospace```.
export default function WaTextarea({ value, onChange, rows = 5, maxLength, placeholder, className }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const wrap = (marker: string, endMarker?: string) => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const em = endMarker ?? marker;
    const selected = value.slice(start, end);
    const next = value.slice(0, start) + marker + selected + em + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const caret = selected ? start + marker.length + selected.length + em.length : start + marker.length;
      el.setSelectionRange(caret, caret);
    });
  };

  const prefixLine = (prefix: string) => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? value.length;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const next = value.slice(0, lineStart) + prefix + value.slice(lineStart);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const caret = start + prefix.length;
      el.setSelectionRange(caret, caret);
    });
  };

  const btn = 'p-1.5 rounded hover:bg-gray-100 text-gray-600';
  return (
    <div>
      <div className="flex items-center gap-1 mb-1 border border-gray-200 rounded-t-lg bg-gray-50 px-1 py-0.5 w-fit">
        <button type="button" title="Bold" className={btn} onClick={() => wrap('*')}><Bold className="w-4 h-4" /></button>
        <button type="button" title="Italic" className={btn} onClick={() => wrap('_')}><Italic className="w-4 h-4" /></button>
        <button type="button" title="Strikethrough" className={btn} onClick={() => wrap('~')}><Strikethrough className="w-4 h-4" /></button>
        <button type="button" title="Monospace" className={btn} onClick={() => wrap('```')}><Code className="w-4 h-4" /></button>
        <button type="button" title="List item" className={btn} onClick={() => prefixLine('- ')}><List className="w-4 h-4" /></button>
      </div>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        className={className}
      />
    </div>
  );
}
