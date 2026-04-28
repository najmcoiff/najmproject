"use client";
import { useEffect } from "react";

export default function Toast({ message, type = "success", onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);

  const colors = {
    success: "bg-green-600",
    error: "bg-red-600",
    info: "bg-gray-800",
  };

  return (
    <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 toast-enter
      ${colors[type]} text-white text-sm font-medium px-5 py-3 rounded-xl shadow-lg
      flex items-center gap-2 min-w-[220px] max-w-[90vw]`}>
      {type === "success" && <span>✓</span>}
      {type === "error" && <span>✕</span>}
      {type === "info" && <span>ℹ</span>}
      <span>{message}</span>
    </div>
  );
}
