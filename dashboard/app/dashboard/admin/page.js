"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard/owner");
  }, [router]);
  return (
    <div className="flex items-center justify-center h-full text-gray-400 text-sm">
      Redirection…
    </div>
  );
}
