"use client";
import { useState, useCallback, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Spinner from "@/components/Spinner";
import Toast from "@/components/Toast";
import { saveSession } from "@/lib/auth";
import { api } from "@/lib/api";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [showPwd, setShowPwd] = useState(false);

  useEffect(() => {
    if (searchParams.get("session_expired") === "1") {
      setToast({ message: "⏰ Session expirée — veuillez vous reconnecter.", type: "error" });
    }
  }, [searchParams]);

  const closeToast = useCallback(() => setToast(null), []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setLoading(true);
    setToast(null);

    try {
      const res = await api.login(username.trim(), password);
      if (res.ok) {
        saveSession({ token: res.token, user: res.user });
        setToast({ message: `Bienvenue, ${res.user.nom} !`, type: "success" });
        setTimeout(() => router.push("/dashboard"), 700);
      } else {
        setToast({ message: res.error || "Identifiant ou mot de passe incorrect.", type: "error" });
      }
    } catch {
      // GAS_URL non configurée → mode démo
      if (!process.env.NEXT_PUBLIC_GAS_URL) {
        saveSession({ token: "demo", user: { nom: "Démo", role: "admin" } });
        setToast({ message: "Mode démo — GAS non configuré.", type: "info" });
        setTimeout(() => router.push("/dashboard"), 800);
      } else {
        setToast({ message: "Erreur réseau, réessayez.", type: "error" });
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      {toast && <Toast {...toast} onClose={closeToast} />}

      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="relative w-24 h-24">
            <Image
              src="/logo.png"
              alt="Najm Coiff"
              fill
              className="object-contain"
              priority
            />
          </div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-1 text-center">Connexion</h1>
          <p className="text-sm text-gray-500 text-center mb-7">Plateforme NAJM COIFF</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Identifiant */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                Identifiant
              </label>
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Votre identifiant"
                required
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm
                  focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent
                  placeholder:text-gray-300 transition"
              />
            </div>

            {/* Mot de passe */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                Mot de passe
              </label>
              <div className="relative">
                <input
                  type={showPwd ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-4 py-3 pr-12 rounded-xl border border-gray-200 text-sm
                    focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent
                    placeholder:text-gray-300 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(p => !p)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 transition text-xs"
                >
                  {showPwd ? "Cacher" : "Voir"}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300
                text-white font-semibold py-3 px-4 rounded-xl transition text-sm
                flex items-center justify-center gap-2"
            >
              {loading ? <><Spinner size={18} /> Connexion…</> : "Se connecter"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Accès réservé — NAJM COIFF
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
