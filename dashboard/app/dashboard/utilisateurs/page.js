"use client";
import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { getSession } from "@/lib/auth";

const DEFAULT_ROLES = [
  "agent digital",
  "agent de caisse",
  "preparateur de commande",
  "preparateur de quota",
  "acheteur",
  "responsable",
  "chef d'equipe",
  "drh",
  "owner",
];

const ROLE_COLORS = {
  owner:                  "bg-gray-900 text-white",
  "chef d'equipe":        "bg-amber-100 text-amber-800",
  responsable:            "bg-amber-100 text-amber-800",
  "agent digital":        "bg-blue-100 text-blue-700",
  "agent de caisse":      "bg-purple-100 text-purple-700",
  "preparateur de quota": "bg-orange-100 text-orange-700",
  acheteur:               "bg-green-100 text-green-700",
  drh:                    "bg-pink-100 text-pink-700",
};

function roleBadge(role) {
  return ROLE_COLORS[(role || "").toLowerCase()] || "bg-gray-100 text-gray-600";
}

function isManager(role) {
  const r = (role || "").toLowerCase();
  return r === "owner" || r.includes("chef");
}

// ── Modal changement de rôle ─────────────────────────────────────────
function ModalChangeRole({ user, allRoles, session, onClose, onSave }) {
  const [selected,  setSelected]  = useState(user.role || "");
  const [custom,    setCustom]    = useState("");
  const [useCustom, setUseCustom] = useState(!allRoles.includes(user.role));
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState("");

  const isOwnerSession = (session?.role || "").toLowerCase() === "owner";
  const availableRoles = isOwnerSession ? allRoles : allRoles.filter(r => r !== "owner");
  const finalRole = useCustom ? custom.trim() : selected;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!finalRole) { setError("Rôle obligatoire"); return; }
    setSaving(true); setError("");
    try {
      const res = await api.updateUserRole(user.nom, finalRole);
      if (res.ok) { onSave(finalRole); onClose(); }
      else setError(res.error || "Erreur");
    } catch { setError("Erreur réseau"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="bg-gray-900 px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-white font-bold text-sm">✏️ Modifier le rôle</h2>
            <p className="text-gray-400 text-xs mt-0.5">{user.nom}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-lg">{error}</div>}

          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-2">Rôle prédéfini</label>
            <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto">
              {availableRoles.map(r => (
                <button
                  key={r} type="button"
                  onClick={() => { setSelected(r); setUseCustom(false); setCustom(""); }}
                  className={`text-xs px-3 py-2 rounded-lg border text-left font-medium transition-colors
                    ${!useCustom && selected === r
                      ? "bg-gray-900 text-white border-gray-900"
                      : "bg-white text-gray-700 border-gray-200 hover:border-gray-400"}`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">
              Ou saisir un rôle personnalisé
            </label>
            <input
              value={custom}
              onChange={e => { setCustom(e.target.value); setUseCustom(!!e.target.value); }}
              placeholder="ex: superviseur terrain, livreur…"
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 transition-colors
                ${useCustom ? "border-gray-900 bg-blue-50" : "border-gray-200"}`}
            />
            {useCustom && custom && (
              <p className="text-xs text-blue-600 mt-1">✓ Rôle personnalisé : &ldquo;{custom.trim()}&rdquo;</p>
            )}
          </div>

          <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-500">
            Rôle actuel : <span className="font-semibold text-gray-800">{user.role || "—"}</span>
            {finalRole && finalRole !== user.role && (
              <span className="ml-2 text-blue-600 font-semibold">→ {finalRole}</span>
            )}
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:border-gray-400">
              Annuler
            </button>
            <button type="submit" disabled={saving || !finalRole || finalRole === user.role}
              className="flex-1 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-gray-700 disabled:opacity-40">
              {saving ? "…" : "Enregistrer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Modal ajout utilisateur ──────────────────────────────────────────
function ModalAddUser({ session, allRoles, onClose, onSave }) {
  const [nom,      setNom]      = useState("");
  const [role,     setRole]     = useState("agent digital");
  const [customRole, setCustomRole] = useState("");
  const [useCustom,  setUseCustom]  = useState(false);
  const [password, setPassword] = useState("");
  const [email,    setEmail]    = useState("");
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");
  const [showPwd,  setShowPwd]  = useState(false);

  const isOwner = (session?.role || "").toLowerCase() === "owner";
  const availableRoles = isOwner ? allRoles : allRoles.filter(r => r !== "owner");
  const finalRole = useCustom ? customRole.trim() : role;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!nom.trim() || !password.trim()) { setError("Nom et mot de passe obligatoires"); return; }
    if (!finalRole) { setError("Rôle obligatoire"); return; }
    setSaving(true); setError("");
    try {
      const res = await api.addUser(nom.trim(), finalRole, password.trim(), email.trim());
      if (res.ok) { onSave(); onClose(); }
      else {
        setError(res.error || "Erreur");
      }
    } catch { setError("Erreur réseau"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-gray-900 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-white font-bold text-base">➕ Nouvel utilisateur</h2>
            <p className="text-gray-400 text-xs mt-0.5">Ajouter un membre à l'équipe</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 rounded-lg">{error}</div>
          )}

          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Nom complet *</label>
            <input value={nom} onChange={e => setNom(e.target.value)} required
              placeholder="ex: Ahmed Benali"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Email (optionnel)</label>
            <input value={email} onChange={e => setEmail(e.target.value)} type="email"
              placeholder="ex: ahmed@example.com"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Rôle *</label>
            <select value={useCustom ? "__custom__" : role}
              onChange={e => {
                if (e.target.value === "__custom__") { setUseCustom(true); }
                else { setRole(e.target.value); setUseCustom(false); setCustomRole(""); }
              }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900">
              {availableRoles.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
              <option value="__custom__">✏️ Rôle personnalisé…</option>
            </select>
            {useCustom && (
              <input
                value={customRole}
                onChange={e => setCustomRole(e.target.value)}
                placeholder="Saisir le rôle personnalisé"
                className="w-full mt-2 border border-blue-300 bg-blue-50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Mot de passe *</label>
            <div className="relative">
              <input value={password} onChange={e => setPassword(e.target.value)} required
                type={showPwd ? "text" : "password"}
                placeholder="Mot de passe pour se connecter"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-gray-900" />
              <button type="button" onClick={() => setShowPwd(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 text-xs">
                {showPwd ? "Cacher" : "Voir"}
              </button>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:border-gray-400 transition-colors">
              Annuler
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-gray-700 disabled:opacity-50 transition-colors">
              {saving ? "Création…" : "Créer l'utilisateur"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Modal changement de mot de passe ─────────────────────────────────
function ModalChangePassword({ user, session, onClose, onSave }) {
  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");
  const [showPwd,  setShowPwd]  = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirm) { setError("Les mots de passe ne correspondent pas"); return; }
    if (password.length < 4) { setError("Mot de passe trop court (min 4 caractères)"); return; }
    setSaving(true); setError("");
    try {
      const res = await api.updateUserPassword(user.nom, password);
      if (res.ok) { onSave(); onClose(); }
      else setError(res.error || "Erreur");
    } catch { setError("Erreur réseau"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="bg-gray-900 px-5 py-4 flex items-center justify-between">
          <h2 className="text-white font-bold text-sm">🔑 Modifier le mot de passe</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <p className="text-sm text-gray-600">Compte : <span className="font-semibold text-gray-900">{user.nom}</span></p>

          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-lg">{error}</div>}

          {[{v: password, sv: setPassword, lbl: "Nouveau mot de passe"}, {v: confirm, sv: setConfirm, lbl: "Confirmer"}].map(({v, sv, lbl}) => (
            <div key={lbl}>
              <label className="text-xs font-semibold text-gray-600 block mb-1">{lbl}</label>
              <input value={v} onChange={e => sv(e.target.value)} type={showPwd ? "text" : "password"} required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
          ))}

          <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
            <input type="checkbox" checked={showPwd} onChange={e => setShowPwd(e.target.checked)} className="rounded" />
            Afficher les mots de passe
          </label>

          <div className="flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:border-gray-400">
              Annuler
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-gray-700 disabled:opacity-50">
              {saving ? "…" : "Enregistrer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
//  PAGE GESTION UTILISATEURS
// ════════════════════════════════════════════════════════════════════
export default function UtilisateursPage() {
  const [session,        setSession]        = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [users,          setUsers]          = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [toast,          setToast]          = useState(null);
  const [showAdd,        setShowAdd]        = useState(false);
  const [changePwd,      setChangePwd]      = useState(null);
  const [changeRole,     setChangeRole]     = useState(null);
  const [confirm,        setConfirm]        = useState(null);
  const [deleting,       setDeleting]       = useState(null);
  const [search,         setSearch]         = useState("");

  // Rôles dynamiques = DEFAULT + rôles existants en DB non présents dans la liste
  const allRoles = [...new Set([
    ...DEFAULT_ROLES,
    ...users.map(u => u.role).filter(Boolean),
  ])];

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getUsers();
      if (res.ok) setUsers(res.users || []);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const s = getSession();
    if (s?.user) setSession(s.user);
    setSessionLoading(false);
    loadUsers();
  }, [loadUsers]);

  const canManage = isManager(session?.role);
  const isOwner   = (session?.role || "").toLowerCase() === "owner";

  const handleDelete = async (user) => {
    setDeleting(user.nom);
    try {
      const res = await api.deleteUser(user.nom);
      if (res.ok) {
        showToast(`${user.nom} désactivé et retiré de la liste ✓`);
        setConfirm(null);
        // Retrait immédiat de la liste sans attendre le rechargement
        setUsers(prev => prev.filter(u => u.nom !== user.nom));
        await loadUsers();
      } else {
        showToast(res.error || "Erreur", "error");
      }
    } catch { showToast("Erreur réseau", "error"); }
    finally { setDeleting(null); }
  };

  // Determine if current user can delete/modify a given target
  const canModify = (targetUser) => {
    if (!canManage) return false;
    const targetRole = (targetUser.role || "").toLowerCase();
    if (targetRole === "owner" && !isOwner) return false;
    if (targetUser.nom === session?.nom) return false; // cannot modify yourself
    return true;
  };

  const filtered = users.filter(u => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (u.nom || "").toLowerCase().includes(q) || (u.role || "").toLowerCase().includes(q);
  });

  if (sessionLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-gray-400 text-sm">Chargement…</div>
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="flex items-center justify-center h-full text-center p-8">
        <div>
          <div className="text-5xl mb-4">🔒</div>
          <p className="text-gray-600 font-semibold">Accès réservé aux managers</p>
          <p className="text-gray-400 text-sm mt-1">Contactez votre chef d&apos;équipe ou owner.</p>
        </div>
      </div>
    );
  }

  const totalByRole = users.reduce((acc, u) => {
    const r = (u.role || "autre").toLowerCase();
    acc[r] = (acc[r] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all
          ${toast.type === "error" ? "bg-red-600 text-white" : "bg-gray-900 text-white"}`}>
          {toast.msg}
        </div>
      )}

      {/* Modals */}
      {showAdd && (
        <ModalAddUser
          session={session}
          allRoles={allRoles}
          onClose={() => setShowAdd(false)}
          onSave={() => { showToast("Utilisateur créé ✓"); loadUsers(); }}
        />
      )}
      {changeRole && (
        <ModalChangeRole
          user={changeRole}
          allRoles={allRoles}
          session={session}
          onClose={() => setChangeRole(null)}
          onSave={(newRole) => {
            showToast(`Rôle de ${changeRole.nom} → ${newRole} ✓`);
            setUsers(prev => prev.map(u => u.nom === changeRole.nom ? { ...u, role: newRole } : u));
          }}
        />
      )}
      {changePwd && (
        <ModalChangePassword
          user={changePwd}
          session={session}
          onClose={() => setChangePwd(null)}
          onSave={() => showToast("Mot de passe mis à jour ✓")}
        />
      )}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center text-2xl mx-auto mb-3">⚠️</div>
              <h3 className="font-bold text-gray-900">Désactiver {confirm.nom} ?</h3>
              <p className="text-xs text-gray-500 mt-1">L&apos;utilisateur ne pourra plus se connecter à la plateforme.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirm(null)}
                className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:border-gray-400">
                Annuler
              </button>
              <button onClick={() => handleDelete(confirm)} disabled={!!deleting}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
                {deleting ? "…" : "Désactiver"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 flex-shrink-0">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">👥 Gestion des utilisateurs</h1>
            <p className="text-xs text-gray-500 mt-0.5">{users.length} membre{users.length > 1 ? "s" : ""} actif{users.length > 1 ? "s" : ""}</p>
          </div>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 transition-colors">
            <span className="text-base leading-none">+</span> Ajouter
          </button>
        </div>

        {/* Stats par rôle */}
        <div className="flex flex-wrap gap-2 mt-3">
          {Object.entries(totalByRole).map(([r, n]) => (
            <span key={r} className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${roleBadge(r)}`}>
              {r} <span className="font-bold">{n}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Recherche */}
      <div className="px-4 py-3 flex-shrink-0">
        <input type="text" placeholder="Rechercher par nom ou rôle…" value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full max-w-sm border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
      </div>

      {/* Liste */}
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {loading ? (
          <div className="space-y-2 mt-2">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="h-16 bg-white rounded-xl animate-pulse border border-gray-100" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-4xl mb-2">🔍</div>
            <p className="text-sm">Aucun utilisateur trouvé</p>
          </div>
        ) : (
          <div className="space-y-2 mt-1">
            {filtered.map(user => {
              const modifiable = canModify(user);
              const isCurrentUser = user.nom === session?.nom;
              return (
                <div key={user.nom}
                  className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center gap-3 hover:border-gray-200 transition-colors">
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-sm font-bold text-gray-600 flex-shrink-0">
                    {(user.nom || "?").charAt(0).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 text-sm">{user.nom}</span>
                      {isCurrentUser && (
                        <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-semibold">Vous</span>
                      )}
                    </div>
                    <span className={`inline-block mt-0.5 text-xs px-2 py-0.5 rounded-full font-medium ${roleBadge(user.role)}`}>
                      {user.role || "—"}
                    </span>
                  </div>

                  {/* Actions */}
                  {modifiable && (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button onClick={() => setChangeRole(user)}
                        className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:border-blue-400 hover:text-blue-700 transition-colors"
                        title="Modifier le rôle">
                        ✏️
                      </button>
                      <button onClick={() => setChangePwd(user)}
                        className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:border-gray-400 hover:text-gray-900 transition-colors"
                        title="Changer le mot de passe">
                        🔑
                      </button>
                      <button onClick={() => setConfirm(user)}
                        className="text-xs px-2.5 py-1.5 border border-red-200 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                        title="Désactiver l'utilisateur">
                        🗑️
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
