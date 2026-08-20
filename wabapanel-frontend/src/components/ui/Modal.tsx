'use client';
import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  guard?: boolean;
}

const sizeMap = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-6xl',
};

export default function Modal({ isOpen, onClose, title, children, size = 'md', guard = true }: ModalProps) {
  const [dirty, setDirty] = useState(false);
  const [warn, setWarn] = useState(false);

  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    setDirty(false);
    setWarn(false);
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  const requestClose = () => {
    if (guard && dirty) { setWarn(true); return; }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-0" onClick={requestClose} />
      <div
        className={`relative z-10 bg-white rounded-2xl shadow-2xl ring-1 ring-gray-100 ${sizeMap[size]} w-full mx-4 max-h-[90vh] flex flex-col`}
        onInput={() => setDirty(true)}
        onChangeCapture={() => setDirty(true)}
      >
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            <button onClick={requestClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
        <div className="overflow-y-auto p-6">{children}</div>
      </div>
      {warn && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-[360px] max-w-[90vw]">
            <h3 className="text-base font-semibold text-gray-900">Unsaved changes</h3>
            <p className="text-sm text-gray-500 mt-1">Your changes have not been saved. To save them, click Cancel below and use the form&apos;s Save button.</p>
            <div className="flex flex-col gap-2 mt-4">
              <button onClick={() => setWarn(false)} className="w-full px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700">Go back — I&apos;ll save</button>
              <button onClick={() => { setWarn(false); setDirty(false); onClose(); }} className="w-full px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200">Close without saving (Discard)</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
