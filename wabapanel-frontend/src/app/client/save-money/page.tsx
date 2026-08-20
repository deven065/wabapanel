'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SaveMoneyRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/client/save-money/templates'); }, [router]);
  return null;
}
