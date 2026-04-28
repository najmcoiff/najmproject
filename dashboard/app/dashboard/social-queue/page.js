"use client";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { getRawSession, getRawToken } from "@/lib/auth";

const PLATFORM_ICONS = { tiktok: "🎵", instagram: "📷", facebook: "👤" };
const PLATFORM_LABELS = { tiktok: "TikTok", instagram: "Instagram", facebook: "Facebook" };

const OBJECTIFS = { coiffure_reels: 15, onglerie_reels: 15 };

function fmtDate(d) {
  if (!d) return "";
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("fr-DZ", { day: "2-digit", month: "short", year: "numeric" });
}

function ProgressBar({ label, icon, count, target, color }) {
  const pct = Math.min(100, Math.round((count / target) * 100));
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-gray-700">{icon} {label}</span>
        <span className={`text-sm font-bold ${count >= target ? "text-green-600" : "text-gray-500"}`}>
          {count}/{target}
        </span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${count >= target ? "bg-green-500" : color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {count >= target && (
        <p className="text-xs text-green-600 font-semibold mt-1">🎉 Objectif atteint !</p>
      )}
    </div>
  );
}

function CardQueue({ item, session, onMarkShared, onUnshare, onDelete, dragHandleProps }) {
  const isOwner = (session?.role || "").toLowerCase() === "owner";
  const [sharing, setSharing] = useState(false);
  const [unsharing, setUnsharing] = useState(false);

  async function handleShare() {
    if (sharing) return;
    setSharing(true);
    await onMarkShared(item);
    setSharing(false);
  }

  async function handleUnshare() {
    if (unsharing) return;
    setUnsharing(true);
    await onUnshare(item);
    setUnsharing(false);
  }

  const platLabels = (item.platforms || []).map(p => PLATFORM_LABELS[p] || p).join(", ");
  const worldColor = item.world === "coiffure" ? "bg-blue-50 text-blue-700" : "bg-pink-50 text-pink-700";
  const typeColor  = item.type === "reels" ? "bg-purple-100 text-purple-700" : "bg-orange-100 text-orange-700";

  return (
    <div
      className={`bg-white rounded-2xl border shadow-sm p-4 flex gap-3 items-start transition
        ${item.status === "partage" ? "opacity-60" : "hover:shadow-md"}`}
      data-id={item.id}
      {...dragHandleProps}
    >
      {/* Drag handle */}
      <div className="mt-1 text-gray-300 cursor-grab active:cursor-grabbing select-none flex-shrink-0 text-lg">
        ⠿
      </div>

      {/* Contenu */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 flex-wrap mb-1.5">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${typeColor}`}>
            {item.type}
          </span>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${worldColor}`}>
            {item.world === "coiffure" ? "✂️ Coiffure" : "💅 Onglerie"}
          </span>
          {item.status === "partage" && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
              ✅ Partagé
            </span>
          )}
        </div>

        <h3 className={`font-semibold text-gray-900 text-sm leading-snug mb-1 ${item.status === "partage" ? "line-through" : ""}`}>
          {item.titre}
        </h3>

        <div className="flex flex-wrap gap-1.5 mb-2">
          {(item.platforms || []).map(p => (
            <span key={p} className="text-[11px] bg-gray-100 px-2 py-0.5 rounded-full text-gray-600">
              {PLATFORM_ICONS[p]} {PLATFORM_LABELS[p] || p}
            </span>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-[11px] text-gray-400">
            {item.publication_date && (
              <span>📅 {fmtDate(item.publication_date)}</span>
            )}
            <span>· Ajouté par {item.created_by}</span>
          </div>

          {item.status === "partage" ? (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] text-green-600">
                Partagé par {item.published_by}
              </span>
              {isOwner && (
                <button
                  onClick={handleUnshare}
                  disabled={unsharing}
                  data-testid="unshare-btn"
                  className="text-xs bg-orange-100 hover:bg-orange-200 text-orange-700 px-3 py-1.5 rounded-xl font-semibold transition-colors disabled:opacity-50 border border-orange-200">
                  {unsharing ? "…" : "↩ Remettre en file"}
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={handleShare}
              disabled={sharing}
              className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-xl font-semibold transition-colors disabled:opacity-50">
              {sharing ? "…" : "✅ Marquer partagé"}
            </button>
          )}
        </div>
      </div>

      {/* Supprimer (owner) */}
      {isOwner && item.status !== "partage" && (
        <button
          onClick={() => onDelete(item.id)}
          className="text-gray-300 hover:text-red-500 transition flex-shrink-0 text-sm mt-0.5">
          ✕
        </button>
      )}
    </div>
  );
}

export default function SocialQueuePage() {
  const [session,  setSession]  = useState(null);
  const [items,    setItems]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [tab,      setTab]      = useState("valide"); // "valide" | "partage"
  const [dragging, setDragging] = useState(null);
  const dragOver = useRef(null);

  useEffect(() => {
    const s = getRawSession();
    setSession(s?.user || null);
  }, []);

  useEffect(() => {
    loadItems();
  }, []);

  async function loadItems() {
    setLoading(true);
    const { data } = await supabase.from("nc_social_queue")
      .select("*").order("position").order("created_at");
    setItems(data || []);
    setLoading(false);
  }

  // Compteurs mensuels (reels partagés ce mois)
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const reelsThisMonth = items.filter(i =>
    i.type === "reels" && i.status === "partage" &&
    i.published_at && i.published_at.startsWith(thisMonth)
  );
  const coiffureCount  = reelsThisMonth.filter(i => i.world === "coiffure").length;
  const ongleriCount   = reelsThisMonth.filter(i => i.world === "onglerie").length;

  const filtered = items.filter(i => i.status === tab);

  async function handleMarkShared(item) {
    if (!session) return;
    const now = new Date().toISOString();

    const { error: updErr } = await supabase.from("nc_social_queue").update({
      status:       "partage",
      published_by: session.nom,
      published_at: now,
    }).eq("id", item.id);
    if (updErr) { console.error("Mark shared error:", updErr); return; }

    // Mise à jour optimiste immédiate
    setItems(prev => prev.map(i => i.id === item.id
      ? { ...i, status: "partage", published_by: session.nom, published_at: now }
      : i
    ));

    // Note automatique dans Organisation
    const platStr = (item.platforms || []).map(p => PLATFORM_LABELS[p] || p).join(", ");
    const noteContenu = `🎬 "${item.titre}" — ${item.type === "reels" ? "Reels" : "Story"} ${item.world === "coiffure" ? "Coiffure ✂️" : "Onglerie 💅"} partagé sur ${platStr || "les réseaux"} par ${session.nom}`;

    const { error: noteErr } = await supabase.from("notes").insert({
      auteur_nom:  session.nom,
      contenu:     noteContenu,
      couleur:     "#86efac",
      type:        "public",
      board_owner: "",
      assigned_to: "",
      checkboxes:  [],
      pos_x:       Math.floor(Math.random() * 350) + 30,
      pos_y:       Math.floor(Math.random() * 250) + 30,
    });
    if (noteErr) console.error("Note creation error:", noteErr);

    // Push (fire & forget)
    try {
      const token = getRawToken();
      if (token) {
        fetch("/api/push/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            title: `✅ Partagé : ${item.titre}`,
            body: `${item.type === "reels" ? "Reels" : "Story"} ${item.world} — ${(item.platforms || []).join(", ")}`,
            url: "/dashboard/social-queue",
          }),
        }).catch(() => {});
      }
    } catch {}
  }

  async function handleUnshare(item) {
    try {
      const token = getRawToken();
      const res = await fetch("/api/social-queue/unshare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, id: item.id }),
      });
      const data = await res.json();
      if (!data.ok) { console.error("Unshare error:", data.error); return; }
      setItems(prev => prev.map(i => i.id === item.id
        ? { ...i, status: "valide", published_by: null, published_at: null }
        : i
      ));
    } catch (e) {
      console.error("Unshare error:", e);
    }
  }

  async function handleDelete(id) {
    await supabase.from("nc_social_queue").delete().eq("id", id);
    setItems(prev => prev.filter(i => i.id !== id));
  }

  // ── Drag & drop ────────────────────────────────────────────────────
  function handleDragStart(e, id) {
    setDragging(id);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e, id) {
    e.preventDefault();
    dragOver.current = id;
  }

  async function handleDrop(e) {
    e.preventDefault();
    if (!dragging || dragging === dragOver.current) { setDragging(null); return; }
    const filtered = items.filter(i => i.status === "valide");
    const fromIdx  = filtered.findIndex(i => i.id === dragging);
    const toIdx    = filtered.findIndex(i => i.id === dragOver.current);
    if (fromIdx === -1 || toIdx === -1) { setDragging(null); return; }
    const reordered = [...filtered];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    const updates = reordered.map((item, idx) => ({ id: item.id, position: idx }));
    setItems(prev => {
      const shared = prev.filter(i => i.status !== "valide");
      const newValidé = reordered.map((item, idx) => ({ ...item, position: idx }));
      return [...newValidé, ...shared];
    });
    for (const u of updates) {
      await supabase.from("nc_social_queue").update({ position: u.position }).eq("id", u.id);
    }
    setDragging(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">🎬 File d&apos;attente Créatif</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Contenu validé pour publication sur les réseaux sociaux.
        </p>
      </div>

      {/* Compteurs objectifs */}
      <div className="grid grid-cols-2 gap-3">
        <ProgressBar
          label="Coiffure Reels"
          icon="✂️"
          count={coiffureCount}
          target={OBJECTIFS.coiffure_reels}
          color="bg-blue-500"
        />
        <ProgressBar
          label="Onglerie Reels"
          icon="💅"
          count={ongleriCount}
          target={OBJECTIFS.onglerie_reels}
          color="bg-pink-500"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 bg-gray-100 p-1 rounded-2xl">
        {[
          { key: "valide",  label: `✅ À partager (${items.filter(i => i.status === "valide").length})` },
          { key: "partage", label: `🗂 Partagés (${items.filter(i => i.status === "partage").length})` },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 py-2 text-sm font-semibold rounded-xl transition-colors
              ${tab === t.key ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Liste */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3">{tab === "valide" ? "📋" : "📦"}</div>
          <p className="text-sm font-medium">
            {tab === "valide" ? "Aucun contenu en attente" : "Aucun contenu partagé ce mois"}
          </p>
          {tab === "valide" && (
            <p className="text-xs mt-1">Ajoute du contenu depuis le salon Créatif dans Discussions.</p>
          )}
        </div>
      ) : (
        <div
          className="space-y-3"
          onDrop={tab === "valide" ? handleDrop : undefined}
          onDragOver={tab === "valide" ? e => e.preventDefault() : undefined}>
          {filtered.map(item => (
            <div
              key={item.id}
              draggable={tab === "valide"}
              onDragStart={tab === "valide" ? e => handleDragStart(e, item.id) : undefined}
              onDragOver={tab === "valide" ? e => handleDragOver(e, item.id) : undefined}
              className={dragging === item.id ? "opacity-50" : ""}>
              <CardQueue
                item={item}
                session={session}
                onMarkShared={handleMarkShared}
                onUnshare={handleUnshare}
                onDelete={handleDelete}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

