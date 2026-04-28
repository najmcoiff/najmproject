"use client";
import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { trackPageView } from "@/lib/track";

function SuiviForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") || "");
  const [error, setError] = useState("");

  useEffect(() => {
    trackPageView("Suivi commande");
    if (params.get("q")) {
      router.push(`/suivi/${encodeURIComponent(params.get("q"))}`);
    }
  }, []);

  function handleSearch() {
    const v = query.trim();
    if (!v) {
      setError("أدخل رقم الطلب للمتابعة");
      return;
    }
    router.push(`/suivi/${encodeURIComponent(v)}`);
  }

  return (
    <>
      <div className="text-center mb-8">
        <div className="text-5xl mb-4">📦</div>
        <h1 className="text-2xl font-bold mb-2" style={{ color: "#f5f5f5" }}>
          تتبع طلبي
        </h1>
        <p className="text-sm" style={{ color: "#a0a0a0" }}>
          أدخل رقم الطلب (مثال: NC-260411-0001) لتتبع توصيلك
        </p>
      </div>

      <div className="rounded-2xl p-6" style={{ background: "#161616", border: "1px solid #2a2a2a" }}>
        <label className="text-sm font-medium block mb-2" style={{ color: "#a0a0a0" }}>
          رقم الطلب
        </label>
        <input
          type="text"
          name="order_id"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setError(""); }}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="رقم الطلب — NC-260411-0001"
          className="w-full rounded-xl px-4 py-3 text-sm mb-3"
          style={{
            background: "#1e1e1e",
            border: "1px solid #333",
            color: "#f5f5f5",
            outline: "none",
          }}
          onFocus={(e) => (e.target.style.border = "1px solid #e63012")}
          onBlur={(e) => (e.target.style.border = "1px solid #333")}
          autoFocus
        />
        {error && <p className="text-xs mb-3" style={{ color: "#e63012" }}>{error}</p>}
        <button
          type="submit"
          onClick={handleSearch}
          className="w-full font-bold py-3 rounded-xl transition-colors text-sm"
          style={{ background: "#e63012", color: "#fff" }}
        >
          🔍 بحث عن طلبي
        </button>
      </div>

      <p className="text-center text-xs mt-6" style={{ color: "#555" }}>
        لا تجد طلبك؟{" "}
        <a
          href="https://wa.me/213798522820"
          className="hover:underline"
          style={{ color: "#e63012" }}
          target="_blank"
          rel="noopener noreferrer"
        >
          تواصل معنا على واتساب
        </a>
      </p>
    </>
  );
}

export default function SuiviSearchPage() {
  return (
    <>
      <Header />
      <main className="max-w-lg mx-auto px-4 py-16 min-h-screen">
        <Suspense fallback={
          <div className="text-center py-12">
            <div
              className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto"
              style={{ borderColor: "#e63012", borderTopColor: "transparent" }}
            />
          </div>
        }>
          <SuiviForm />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
