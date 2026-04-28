"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { isValidAlgerianPhone } from "@/lib/utils";

const WILAYAS = [
  "أدرار","الشلف","الأغواط","أم البواقي","باتنة","بجاية","بسكرة","بشار",
  "البليدة","البويرة","تمنراست","تبسة","تلمسان","تيارت","تيزي وزو","الجزائر",
  "الجلفة","جيجل","سطيف","سعيدة","سكيكدة","سيدي بلعباس","عنابة","قالمة",
  "قسنطينة","المدية","مستغانم","المسيلة","معسكر","ورقلة","وهران","البيض",
  "إليزي","برج بوعريريج","بومرداس","الطارف","تندوف","تيسمسيلت","الوادي",
  "خنشلة","سوق أهراس","تيبازة","ميلة","عين الدفلى","النعامة","عين تموشنت",
  "غرداية","غليزان","تيميمون","برج باجي مختار","أولاد جلال","بني عباس",
  "عين صالح","عين قزام","تقرت","جانت","المغير","المنيعة",
];

export default function ComptePage() {
  const [tab, setTab] = useState("login");
  const [token, setToken] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Login form
  const [loginPhone, setLoginPhone] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // Register form
  const [regPhone, setRegPhone] = useState("");
  const [regName, setRegName] = useState("");
  const [regWilaya, setRegWilaya] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");
  const [regLoading, setRegLoading] = useState(false);

  // Charger le session depuis localStorage
  useEffect(() => {
    const saved = localStorage.getItem("nc_customer_token");
    if (saved) {
      setToken(saved);
      fetchProfile(saved);
    } else {
      setLoading(false);
    }
  }, []);

  async function fetchProfile(t) {
    setLoading(true);
    try {
      const res = await fetch("/api/boutique/auth/me", {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (!res.ok) {
        localStorage.removeItem("nc_customer_token");
        setToken(null);
        setLoading(false);
        return;
      }
      const data = await res.json();
      setCustomer(data.customer);
      setOrders(data.orders || []);
    } catch {
      localStorage.removeItem("nc_customer_token");
      setToken(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    if (!isValidAlgerianPhone(loginPhone)) {
      setError("رقم هاتف غير صالح");
      return;
    }
    setLoginLoading(true);
    try {
      const res = await fetch("/api/boutique/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: loginPhone, password: loginPassword }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "خطأ في تسجيل الدخول"); return; }
      localStorage.setItem("nc_customer_token", data.token);
      setToken(data.token);
      setCustomer(data.customer);
      setOrders([]);
      fetchProfile(data.token);
    } catch {
      setError("خطأ في الاتصال بالخادم");
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    setError("");
    if (!isValidAlgerianPhone(regPhone)) { setError("رقم هاتف غير صالح"); return; }
    if (!regName.trim()) { setError("الاسم مطلوب"); return; }
    if (regPassword.length < 6) { setError("كلمة المرور يجب أن تكون 6 أحرف على الأقل"); return; }
    if (regPassword !== regConfirm) { setError("كلمتا المرور غير متطابقتين"); return; }
    setRegLoading(true);
    try {
      const res = await fetch("/api/boutique/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: regPhone,
          full_name: regName.trim(),
          password: regPassword,
          wilaya: regWilaya || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "خطأ في إنشاء الحساب"); return; }
      localStorage.setItem("nc_customer_token", data.token);
      setToken(data.token);
      setCustomer(data.customer);
      setOrders([]);
      setSuccess("تم إنشاء حسابك بنجاح!");
    } catch {
      setError("خطأ في الاتصال بالخادم");
    } finally {
      setRegLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem("nc_customer_token");
    setToken(null);
    setCustomer(null);
    setOrders([]);
    setSuccess("");
    setError("");
  }

  function formatDate(d) {
    return new Date(d).toLocaleDateString("ar-DZ", {
      year: "numeric", month: "short", day: "numeric",
    });
  }

  function statusLabel(s) {
    const map = {
      pending: "قيد الانتظار",
      confirmed: "مؤكدة",
      preparing: "قيد التحضير",
      shipped: "تم الشحن",
      delivered: "تم التسليم",
      cancelled: "ملغاة",
    };
    return map[s] || s || "—";
  }

  function statusColor(s) {
    if (s === "delivered") return "text-green-400";
    if (s === "cancelled") return "text-red-400";
    if (s === "shipped") return "text-blue-400";
    return "text-yellow-400";
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Logged in ─────────────────────────────────────────────────────────────
  if (token && customer) {
    return (
      <div className="min-h-screen bg-black text-white" dir="rtl">
        <div className="max-w-2xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <Link href="/produits" className="text-sm text-gray-400 hover:text-white flex items-center gap-2">
              ← متابعة التسوق
            </Link>
            <button
              onClick={handleLogout}
              className="text-sm text-red-500 hover:text-red-400 flex items-center gap-1"
            >
              خروج
            </button>
          </div>

          {/* Profile card */}
          <div className="bg-zinc-900 rounded-xl p-6 mb-8 border border-zinc-800">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 rounded-full bg-red-600 flex items-center justify-center text-2xl font-bold">
                {customer.full_name.charAt(0)}
              </div>
              <div>
                <h2 className="text-xl font-bold">{customer.full_name}</h2>
                <p className="text-gray-400 text-sm">{customer.phone}</p>
                {customer.wilaya && (
                  <p className="text-gray-500 text-xs">{customer.wilaya}</p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-zinc-700">
              <div className="text-center">
                <p className="text-2xl font-bold text-red-500">{customer.total_orders ?? 0}</p>
                <p className="text-xs text-gray-400">إجمالي الطلبات</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-red-500">
                  {(customer.total_spent || 0).toLocaleString("ar-DZ")} دج
                </p>
                <p className="text-xs text-gray-400">إجمالي الإنفاق</p>
              </div>
            </div>
          </div>

          {/* Orders */}
          <h3 className="text-lg font-semibold mb-4">طلباتي</h3>
          {orders.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="text-4xl mb-3">📦</p>
              <p>لا توجد طلبات بعد</p>
              <Link href="/produits" className="mt-4 inline-block text-red-500 hover:underline text-sm">
                ابدأ التسوق
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {orders.map((order) => {
                const items = order.items_json || [];
                return (
                  <div key={order.id} className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-bold text-red-400">{order.order_name || `#${order.id?.slice(0,8)}`}</p>
                        <p className="text-xs text-gray-500">{formatDate(order.created_at)}</p>
                      </div>
                      <span className={`text-xs font-medium ${statusColor(order.status)}`}>
                        {statusLabel(order.status)}
                      </span>
                    </div>
                    {items.length > 0 && (
                      <div className="mb-3 space-y-1">
                        {items.slice(0, 3).map((item, i) => (
                          <p key={i} className="text-sm text-gray-300 truncate">
                            {item.title} × {item.qty}
                          </p>
                        ))}
                        {items.length > 3 && (
                          <p className="text-xs text-gray-500">+{items.length - 3} منتجات أخرى</p>
                        )}
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-3 border-t border-zinc-700">
                      <p className="text-sm text-gray-400">
                        {order.delivery_type === "home" ? "🏠 توصيل للمنزل" : "🏢 توصيل للمكتب"} —{" "}
                        {order.wilaya}
                      </p>
                      <p className="font-bold">
                        {(order.total_price || 0).toLocaleString("ar-DZ")} دج
                      </p>
                    </div>
                    <Link
                      href={`/suivi/${order.id}`}
                      className="mt-3 block text-center text-xs text-red-500 hover:underline"
                    >
                      تتبع الطلب →
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Auth forms ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-black text-white flex flex-col" dir="rtl">
      <div className="max-w-md mx-auto w-full px-4 py-10 flex-1">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold">حسابي</h1>
          <p className="text-gray-400 text-sm mt-1">سجّل دخولك لمتابعة طلباتك</p>
        </div>

        {/* Tabs */}
        <div className="flex rounded-xl overflow-hidden border border-zinc-700 mb-8">
          <button
            onClick={() => { setTab("login"); setError(""); }}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              tab === "login"
                ? "bg-red-600 text-white"
                : "bg-zinc-900 text-gray-400 hover:text-white"
            }`}
          >
            تسجيل الدخول
          </button>
          <button
            onClick={() => { setTab("register"); setError(""); }}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              tab === "register"
                ? "bg-red-600 text-white"
                : "bg-zinc-900 text-gray-400 hover:text-white"
            }`}
          >
            إنشاء حساب
          </button>
        </div>

        {error && (
          <div className="bg-red-950 border border-red-800 text-red-300 rounded-lg px-4 py-3 text-sm mb-4">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-950 border border-green-800 text-green-300 rounded-lg px-4 py-3 text-sm mb-4">
            {success}
          </div>
        )}

        {/* Login Form */}
        {tab === "login" && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-300 mb-1">رقم الهاتف</label>
              <input
                type="tel"
                value={loginPhone}
                onChange={(e) => setLoginPhone(e.target.value)}
                placeholder="05XXXXXXXX"
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-red-600 text-right"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">كلمة المرور</label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-red-600"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loginLoading}
              className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors"
            >
              {loginLoading ? "جاري الدخول..." : "تسجيل الدخول"}
            </button>
          </form>
        )}

        {/* Register Form */}
        {tab === "register" && (
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-300 mb-1">الاسم الكامل</label>
              <input
                type="text"
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                placeholder="الاسم واللقب"
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-red-600 text-right"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">رقم الهاتف</label>
              <input
                type="tel"
                value={regPhone}
                onChange={(e) => setRegPhone(e.target.value)}
                placeholder="05XXXXXXXX"
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-red-600 text-right"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">الولاية (اختياري)</label>
              <select
                value={regWilaya}
                onChange={(e) => setRegWilaya(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-red-600 text-right"
              >
                <option value="">اختر ولايتك</option>
                {WILAYAS.map((w) => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">كلمة المرور</label>
              <input
                type="password"
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                placeholder="6 أحرف على الأقل"
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-red-600"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">تأكيد كلمة المرور</label>
              <input
                type="password"
                value={regConfirm}
                onChange={(e) => setRegConfirm(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-red-600"
                required
              />
            </div>
            <button
              type="submit"
              disabled={regLoading}
              className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors"
            >
              {regLoading ? "جاري الإنشاء..." : "إنشاء الحساب"}
            </button>
          </form>
        )}

        <p className="text-center text-xs text-gray-600 mt-8">
          بإنشاء حساب، أنت توافق على شروط الاستخدام الخاصة بـ NajmCoiff
        </p>
      </div>
    </div>
  );
}
