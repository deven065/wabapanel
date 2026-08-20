'use client';
import React, { useState } from 'react';
import { Bot, Link2, Copy, ExternalLink, MessageSquare, Zap, Settings, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ToolsetPage() {
  const [chatbotEnabled, setChatbotEnabled] = useState(false);
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const generatedLink = phone ? `https://wa.me/${phone.replace(/[^0-9]/g, '')}${message ? `?text=${encodeURIComponent(message)}` : ''}` : '';

  return (
    <div className="space-y-6">
      <div>
        <div className="page-hero">
        <div>
        <h1 className="text-2xl font-bold text-gray-900">Toolset</h1>
        <p className="text-sm text-gray-500 mt-1">Chatbot tools & WhatsApp link generator</p>
        </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chatbot Section */}
        <div className="bg-white rounded-xl border p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <Bot className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">Chatbot</h2>
                <p className="text-xs text-gray-500">Auto-reply to customer messages</p>
              </div>
            </div>
            <button onClick={() => setChatbotEnabled(!chatbotEnabled)} className={`relative w-12 h-6 rounded-full transition-colors ${chatbotEnabled ? 'bg-emerald-600' : 'bg-gray-300'}`}>
              <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${chatbotEnabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </button>
          </div>

          <p className="text-sm text-gray-600 mb-4">
            When enabled, the chatbot will automatically respond to incoming messages using your configured Keywords and Quick Replies.
          </p>

          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-700">Manage Auto-Replies:</p>
            <a href="/client/keywords" className="flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50 group">
              <div className="flex items-center gap-3">
                <Zap className="w-5 h-5 text-emerald-600" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Keywords</p>
                  <p className="text-xs text-gray-500">Auto-reply when specific keywords are detected</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600" />
            </a>
            <a href="/client/quick-replies" className="flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50 group">
              <div className="flex items-center gap-3">
                <MessageSquare className="w-5 h-5 text-blue-600" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Quick Replies</p>
                  <p className="text-xs text-gray-500">Pre-saved reply templates for chat</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600" />
            </a>
            <a href="/client/automations" className="flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50 group">
              <div className="flex items-center gap-3">
                <Settings className="w-5 h-5 text-purple-600" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Automations</p>
                  <p className="text-xs text-gray-500">Build complex auto-reply flows</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600" />
            </a>
          </div>
        </div>

        {/* WhatsApp Link Generator */}
        <div className="bg-white rounded-xl border p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
              <Link2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">WhatsApp Link Generator</h2>
              <p className="text-xs text-gray-500">Create direct chat links</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number *</label>
              <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                placeholder="919782005500 (with country code, no +)" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pre-filled Message (optional)</label>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none resize-none"
                placeholder="Hi, I am interested in your services..." />
            </div>

            {generatedLink && (
              <div className="bg-gray-50 rounded-lg p-3 border">
                <p className="text-xs text-gray-500 mb-1">Generated Link:</p>
                <div className="flex items-center gap-2">
                  <input type="text" value={generatedLink} readOnly className="flex-1 px-3 py-2 border rounded-lg text-sm bg-white" />
                  <button onClick={() => { navigator.clipboard.writeText(generatedLink); toast.success('Link copied!'); }}
                    className="p-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700" title="Copy">
                    <Copy className="w-4 h-4" />
                  </button>
                  <a href={generatedLink} target="_blank" rel="noopener noreferrer"
                    className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200" title="Open">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
