'use client';
import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: boolean;
}

export default function Card({ children, className = '', padding = true }: CardProps) {
  return (
    <div className={`bg-white rounded-2xl ring-1 ring-gray-100 shadow-sm hover:shadow-md transition-shadow ${padding ? 'p-6' : ''} ${className}`}>
      {children}
    </div>
  );
}

export function StatCard({ title, value, icon, change, color = 'emerald' }: {
  title: string; value: string | number; icon: React.ReactNode; change?: string; color?: string;
}) {
  const colors: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-600',
    blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
    orange: 'bg-orange-50 text-orange-600',
    red: 'bg-red-50 text-red-600',
    yellow: 'bg-yellow-50 text-yellow-600',
  };
  return (
    <div className="bg-white rounded-2xl ring-1 ring-gray-100 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {change && <p className="text-xs text-emerald-600 mt-1">{change}</p>}
        </div>
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-inner ${colors[color] || colors.emerald}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}
