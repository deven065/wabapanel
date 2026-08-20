'use client';
import React from 'react';
import { Image as ImageIcon, Video, File, Phone, ExternalLink, Reply, ChevronLeft, Smile, Send } from 'lucide-react';

export interface PreviewButton { type?: string; text: string; }
export interface PreviewData {
  headerType?: string;
  headerText?: string;
  headerMediaUrl?: string;
  body?: string;
  footer?: string;
  buttons?: PreviewButton[];
}

const DOODLE_BG =
  "url(\"data:image/svg+xml,%3Csvg width='120' height='120' viewBox='0 0 120 120' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' stroke='%23c8c0b6' stroke-width='1.5' opacity='0.35'%3E%3Ccircle cx='20' cy='20' r='6'/%3E%3Cpath d='M70 15 l10 10 M80 15 l-10 10'/%3E%3Crect x='95' y='40' width='14' height='10' rx='2'/%3E%3Cpath d='M15 70 q6 -10 12 0 q-6 10 -12 0'/%3E%3Ccircle cx='60' cy='60' r='5'/%3E%3Cpath d='M40 100 h16 M48 92 v16'/%3E%3Cpath d='M90 90 a8 8 0 1 0 8 8'/%3E%3C/g%3E%3C/svg%3E\")";

const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL || '/api').replace(/\/api$/, '');
const mediaUrl = (u?: string) => (u ? (u.startsWith('http') ? u : `${API_ORIGIN}${u}`) : '');

export default function WhatsAppPhonePreview({ data, title }: { data: PreviewData; title?: string }) {
  const btns = (data.buttons || []).filter((b) => b.text && b.text.trim());
  const url = mediaUrl(data.headerMediaUrl);
  const now = new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  return (
    <div className="w-[300px] rounded-[2rem] border-[6px] border-gray-900 bg-gray-900 shadow-xl overflow-hidden shrink-0">
      {/* header */}
      <div className="bg-[#075e54] text-white flex items-center gap-2 px-3 py-2.5">
        <ChevronLeft className="w-4 h-4 opacity-80" />
        <div className="w-7 h-7 rounded-full bg-white/25 flex items-center justify-center text-xs font-semibold">B</div>
        <span className="text-sm font-medium truncate">{title || 'Business'}</span>
      </div>
      {/* chat area */}
      <div className="min-h-[380px] px-3 py-4 flex flex-col justify-end" style={{ backgroundColor: '#efe7dd', backgroundImage: DOODLE_BG }}>
        <div className="bg-white rounded-lg rounded-tl-none shadow-sm p-1.5 max-w-[92%]">
          {data.headerType === 'image' && (
            url ? <img src={url} alt="" className="w-full h-32 object-cover rounded-md mb-1.5" />
              : <div className="w-full h-32 bg-gray-200 rounded-md mb-1.5 flex items-center justify-center"><ImageIcon className="w-8 h-8 text-gray-400" /></div>
          )}
          {data.headerType === 'video' && (
            url ? <video src={url} className="w-full h-32 object-cover rounded-md mb-1.5" controls />
              : <div className="w-full h-32 bg-gray-800 rounded-md mb-1.5 flex items-center justify-center"><Video className="w-8 h-8 text-white" /></div>
          )}
          {data.headerType === 'document' && (
            <div className="w-full p-2.5 bg-gray-100 rounded-md mb-1.5 flex items-center gap-2">
              <File className="w-5 h-5 text-red-500 shrink-0" />
              <span className="text-xs text-gray-600 truncate">{url ? url.split('/').pop() : 'Document'}</span>
            </div>
          )}
          {data.headerType === 'text' && data.headerText && (
            <p className="font-bold text-gray-900 text-sm px-1 pt-0.5">{data.headerText}</p>
          )}
          <p className="text-sm text-gray-800 whitespace-pre-wrap px-1 py-0.5">{data.body || 'Your message will appear here...'}</p>
          {data.footer && <p className="text-[11px] text-gray-400 px-1">{data.footer}</p>}
          <p className="text-[10px] text-gray-400 text-right px-1 pb-0.5">{now}</p>
          {btns.length > 0 && (
            <div className="border-t border-gray-100">
              {btns.map((b, i) => (
                <div key={i} className="py-2 text-center text-sm text-[#00a5f4] flex items-center justify-center gap-1.5 border-b border-gray-100 last:border-b-0">
                  {b.type === 'URL' ? <ExternalLink className="w-3.5 h-3.5" /> : b.type === 'PHONE_NUMBER' ? <Phone className="w-3.5 h-3.5" /> : <Reply className="w-3.5 h-3.5" />}
                  {b.text}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* input bar */}
      <div className="bg-[#f0f0f0] px-3 py-2 flex items-center gap-2">
        <Smile className="w-4 h-4 text-gray-400" />
        <div className="flex-1 bg-white rounded-full h-7" />
        <div className="w-7 h-7 rounded-full bg-[#075e54] flex items-center justify-center"><Send className="w-3.5 h-3.5 text-white" /></div>
      </div>
    </div>
  );
}
