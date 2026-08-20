"use client";
// Predefined Actions has been merged into the Events page.
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PredefinedActionsPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/client/events"); }, [router]);
  return <div className="flex items-center justify-center h-64 text-sm text-gray-400">Redirecting to Events…</div>;
}
