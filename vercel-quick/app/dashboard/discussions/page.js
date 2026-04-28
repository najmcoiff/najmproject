"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { getSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { sendPushNotification } from "@/lib/push";

// Détecte les @mentions dans un texte et retourne les noms cités
// Noms = un seul mot alphanumérique (tous les agents ont des noms simples)
function extraireMentions(texte) {
  if (!texte) return [];
  const matches = texte.match(/@([\wÀ-ÿ]+)/g) || [];
  return matches.map(m => m.slice(1).trim());
}

/* ── Helpers ────────────────────────────────────────────────── */
function formatHeure(ts) {
  return new Date(ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}
function formatDate(ts) {
  const d = new Date(ts);
  const auj = new Date(); const hier = new Date(); hier.setDate(hier.getDate() - 1);
  if (d.toDateString() === auj.toDateString()) return "Aujourd'hui";
  if (d.toDateString() === hier.toDateString()) return "Hier";
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}
function formatDuree(sec) {
  if (!sec && sec !== 0) return "0:00";
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
}
function isImage(mime) { return mime?.startsWith("image/"); }
function isVideo(mime) { return mime?.startsWith("video/"); }

const ROLE_COLORS = {
  owner: "bg-gray-900 text-white",
  "chef d'equipe": "bg-amber-100 text-amber-800",
  responsable: "bg-amber-100 text-amber-800",
  "agent digital": "bg-blue-100 text-blue-700",
  "agent de caisse": "bg-purple-100 text-purple-700",
  "preparateur de quota": "bg-orange-100 text-orange-700",
  acheteur: "bg-green-100 text-green-700",
  drh: "bg-pink-100 text-pink-700",
};
function roleColor(role) {
  return (role && ROLE_COLORS[role.toLowerCase()]) || "bg-gray-100 text-gray-600";
}
function isManager(role) {
  return ["owner", "chef d'equipe", "responsable"].includes((role || "").toLowerCase());
}

/* ── Modal confirmation suppression ────────────────────────── */
function ConfirmDeleteModal({ message, onConfirm, onCancel }) {
  if (!message) return null;
  const isVocal = message.type === "vocal";
  const preview = message.type === "text"
    ? message.contenu?.slice(0, 80) + (message.contenu?.length > 80 ? "…" : "")
    : message.type === "vocal" ? "🎤 Message vocal"
    : message.type === "image" ? "🖼️ Image"
    : message.type === "video" ? "🎬 Vidéo"
    : "📎 Fichier";

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-4"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
            <TrashIcon size={18} className="text-red-600" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900">
              {isVocal ? "Supprimer ce vocal ?" : "Supprimer ce message ?"}
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">Cette action est irréversible.</p>
          </div>
        </div>
        <div className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
          <p className="text-xs text-gray-500 mb-1 font-medium">{message.auteur_nom}</p>
          <p className="text-sm text-gray-700 leading-relaxed">{preview}</p>
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600
              hover:bg-gray-50 transition">
            Annuler
          </button>
          <button onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold
              hover:bg-red-700 transition">
            Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Lecteur vocal ──────────────────────────────────────────── */
function VocalPlayer({ url, duree, isMe }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentSec, setCurrentSec] = useState(0);
  const [totalSec, setTotalSec] = useState(duree || 0);

  function togglePlay() {
    const a = audioRef.current; if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.play(); setPlaying(true); }
  }
  function onTimeUpdate() {
    const a = audioRef.current; if (!a?.duration) return;
    setCurrentSec(a.currentTime);
    setProgress((a.currentTime / a.duration) * 100);
  }
  function onLoaded() {
    const a = audioRef.current;
    if (a?.duration && isFinite(a.duration)) setTotalSec(a.duration);
  }
  function seekTo(e) {
    const a = audioRef.current; if (!a?.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    a.currentTime = ((e.clientX - rect.left) / rect.width) * a.duration;
  }

  const barBg   = isMe ? "bg-white/25" : "bg-gray-200";
  const barFill = isMe ? "bg-white"    : "bg-gray-800";
  const btnBg   = isMe ? "bg-white/20 hover:bg-white/35" : "bg-gray-800 hover:bg-gray-600";
  const tc      = isMe ? "text-white/65" : "text-gray-400";

  return (
    <div data-testid="vocal-player" className="flex items-center gap-2.5 min-w-[190px]">
      <button onClick={togglePlay}
        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition ${btnBg}`}>
        {playing ? <PauseIcon size={13} className="text-white" /> : <PlayIcon size={13} className="text-white" />}
      </button>
      <div className="flex-1 flex flex-col gap-1">
        <div className={`h-1.5 rounded-full cursor-pointer ${barBg}`} onClick={seekTo}>
          <div className={`h-1.5 rounded-full transition-all duration-100 ${barFill}`} style={{ width: `${progress}%` }} />
        </div>
        <div className={`text-[10px] flex justify-between ${tc}`}>
          <span>🎤 {playing ? formatDuree(currentSec) : formatDuree(totalSec)}</span>
          {playing && <span>{formatDuree(totalSec)}</span>}
        </div>
      </div>
      <audio ref={audioRef} src={url} onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoaded} onEnded={() => { setPlaying(false); setProgress(100); }} className="hidden" />
    </div>
  );
}

/* ── Barre de réactions ─────────────────────────────────────── */
// ❤️ = Bien reçu  |  🔥 = Effectué / terminé  |  ❌ = Problème / faute
// ❤️ = Bien reçu  |  🔥 = Effectué / terminé  |  ❌ = Problème / faute  |  ⛔ = Important
const REACTION_EMOJIS  = { heart: "❤️", fire: "🔥", x: "❌", stop: "⛔" };
const REACTION_LABELS  = { heart: "Bien reçu", fire: "Effectué", x: "Problème", stop: "Important" };
const REACTION_TYPES   = ["heart", "fire", "x", "stop"];

function ReactionBar({ messageId, reactions, currentUser, onToggle, isMe }) {
  const msgReactions = reactions[messageId] || { heart: [], fire: [], x: [], stop: [] };
  const [hoveredType, setHoveredType] = useState(null);

  return (
    <div className={`flex items-center gap-1 mt-1 px-1 ${isMe ? "justify-end" : "justify-start"}`}>
      {REACTION_TYPES.map(type => {
        const users = msgReactions[type] || [];
        const hasMe = users.includes(currentUser);
        return (
          <div key={type} className="relative">
            <button
              onClick={() => onToggle(messageId, type)}
              onMouseEnter={() => setHoveredType(type)}
              onMouseLeave={() => setHoveredType(null)}
              className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[11px] transition
                ${hasMe
                  ? "bg-gray-900 text-white shadow-sm"
                  : users.length > 0
                    ? "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    : "text-gray-300 hover:text-gray-500 hover:bg-gray-50 opacity-0 group-hover:opacity-100"
                }`}>
              <span>{REACTION_EMOJIS[type]}</span>
              {users.length > 0 && <span className={hasMe ? "text-white" : "text-gray-500"}>{users.length}</span>}
            </button>
            {/* Popover noms — visible au survol si au moins 1 réaction */}
            {hoveredType === type && users.length > 0 && (
              <div className={`absolute z-50 bottom-full mb-1.5 pointer-events-none
                bg-gray-900 text-white rounded-xl shadow-xl px-3 py-2 min-w-[110px]
                ${isMe ? "right-0" : "left-0"}`}>
                <div className="text-[10px] font-bold mb-1 text-white/70 uppercase tracking-wide">
                  {REACTION_EMOJIS[type]} {REACTION_LABELS[type]}
                </div>
                {users.map(name => (
                  <div key={name} className={`text-[11px] font-medium leading-snug ${name === currentUser ? "text-yellow-300" : "text-white"}`}>
                    {name === currentUser ? "✓ Vous" : name}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Preview fichier avant envoi ────────────────────────────── */
function FilePreview({ file, onRemove }) {
  const url = URL.createObjectURL(file);
  const imgType = isImage(file.type);
  const vidType = isVideo(file.type);

  return (
    <div className="relative inline-block mb-2 rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
      {imgType && (
        <img src={url} alt="preview" className="max-h-32 max-w-xs object-cover rounded-xl" />
      )}
      {vidType && (
        <video src={url} className="max-h-32 max-w-xs rounded-xl" controls />
      )}
      {!imgType && !vidType && (
        <div className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700">
          <span>📎</span><span className="truncate max-w-[180px]">{file.name}</span>
        </div>
      )}
      <button onClick={onRemove}
        className="absolute top-1 right-1 w-6 h-6 bg-black/60 text-white rounded-full flex items-center justify-center hover:bg-black/80 transition">
        <CloseIcon size={12} />
      </button>
    </div>
  );
}

/* ── Composant message ──────────────────────────────────────── */
/* ── Modal Ajouter à la file d'attente ──────────────────── */
const PLATFORMS = ["TikTok", "Instagram", "Facebook"];

function ModalAjouterFile({ msg, user, onClose }) {
  const [titre, setTitre]       = useState("");
  const [type, setType]         = useState("reels");
  const [world, setWorld]       = useState("coiffure");
  const [platforms, setPlatforms] = useState(["TikTok", "Instagram", "Facebook"]);
  const [pubDate, setPubDate]   = useState("");
  const [saving, setSaving]     = useState(false);

  function togglePlatform(p) {
    setPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!titre.trim() || platforms.length === 0) return;
    setSaving(true);

    const platLabels = { tiktok: "TikTok", instagram: "Instagram", facebook: "Facebook" };
    const platStr = platforms.map(p => platLabels[p] || p).join(", ");
    const typeLabel = type === "reels" ? "Reels" : "Story";
    const worldLabel = world === "coiffure" ? "Coiffure ✂️" : "Onglerie 💅";
    const titreFinal = titre.trim();

    // Calcul de la position
    const { data: allItems } = await supabase.from("nc_social_queue")
      .select("position").order("position", { ascending: false }).limit(1);
    const nextPos = ((allItems?.[0]?.position) ?? -1) + 1;

    // Insertion dans la file d'attente
    const { error: qErr } = await supabase.from("nc_social_queue").insert({
      titre:             titreFinal,
      type,
      world,
      platforms:         platforms.map(p => p.toLowerCase()),
      source_message_id: msg?.id || null,
      content_url:       msg?.fichier_url || null,
      status:            "valide",
      publication_date:  pubDate || null,
      position:          nextPos,
      created_by:        user.nom,
    });
    if (qErr) { console.error("Insert social queue error:", qErr); setSaving(false); return; }

    // ── Note automatique dans Organisation (alerte agents) ──
    const dateStr = pubDate
      ? new Date(pubDate + "T00:00:00").toLocaleDateString("fr-DZ", { day: "2-digit", month: "short" })
      : "date à définir";
    const noteContenu = `🎬 À publier : "${titreFinal}" — ${typeLabel} ${worldLabel} sur ${platStr} (${dateStr})`;
    const { error: noteErr } = await supabase.from("notes").insert({
      auteur_nom:  user.nom,
      contenu:     noteContenu,
      couleur:     "#c4b5fd",
      type:        "public",
      board_owner: "",
      assigned_to: "",
      checkboxes:  [],
      pos_x:       Math.floor(Math.random() * 350) + 30,
      pos_y:       Math.floor(Math.random() * 250) + 30,
    });
    if (noteErr) console.error("Note création erreur:", noteErr);

    setSaving(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">🎬 Ajouter à la file d&apos;attente</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Titre */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Titre *</label>
            <input autoFocus value={titre} onChange={e => setTitre(e.target.value)}
              placeholder="Ex: Tuto balayage mai 2026"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
          {/* Type + Univers */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Type</label>
              <div className="flex gap-2">
                {["reels", "story"].map(t => (
                  <button key={t} type="button" onClick={() => setType(t)}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium border transition
                      ${type === t ? "bg-gray-900 text-white border-gray-900" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                    {t === "reels" ? "🎬 Reels" : "📸 Story"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Univers</label>
              <div className="flex gap-2">
                {["coiffure", "onglerie"].map(w => (
                  <button key={w} type="button" onClick={() => setWorld(w)}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium border transition
                      ${world === w ? "bg-indigo-600 text-white border-indigo-600" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                    {w === "coiffure" ? "✂️" : "💅"}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {/* Plateformes */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Plateformes</label>
            <div className="flex gap-2">
              {PLATFORMS.map(p => {
                const checked = platforms.includes(p);
                const icons = { TikTok: "🎵", Instagram: "📷", Facebook: "👤" };
                return (
                  <button key={p} type="button" onClick={() => togglePlatform(p)}
                    className={`flex-1 py-2 rounded-xl text-xs font-medium border transition flex items-center justify-center gap-1
                      ${checked ? "bg-gray-900 text-white border-gray-900" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                    <span>{icons[p]}</span><span>{p}</span>
                  </button>
                );
              })}
            </div>
          </div>
          {/* Date */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Date de publication prévue</label>
            <input type="date" value={pubDate} onChange={e => setPubDate(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 font-medium">Annuler</button>
            <button type="submit" disabled={!titre.trim() || platforms.length === 0 || saving}
              className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-40 transition-colors">
              {saving ? "…" : "➕ Ajouter"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Message({ msg, isMe, showAvatar, canDelete, onRequestDelete, reactions, currentUser, onToggleReaction, isOwner, isSalonCreatif, onAddToQueue, readBy }) {
  return (
    <div className={`flex items-end gap-2 ${isMe ? "flex-row-reverse" : ""} mb-0.5 group`}>
      {/* Avatar */}
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mb-0.5
        ${showAvatar
          ? isMe ? "bg-gray-900 text-white" : "bg-gray-200 text-gray-700"
          : "opacity-0 pointer-events-none"}`}>
        {(msg.auteur_nom || "?")[0].toUpperCase()}
      </div>

      <div className={`max-w-[72%] flex flex-col ${isMe ? "items-end" : "items-start"} gap-0.5`}>
        {/* Nom + rôle */}
        {showAvatar && (
          <div className={`flex items-center gap-2 px-1 ${isMe ? "flex-row-reverse" : ""}`}>
            <span className="text-xs font-semibold text-gray-700">{msg.auteur_nom}</span>
            {msg.auteur_role && (
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${roleColor(msg.auteur_role)}`}>
                {msg.auteur_role}
              </span>
            )}
          </div>
        )}

        {/* Bulle */}
        <div className={`rounded-2xl px-3 py-2 text-sm leading-relaxed
          ${isMe
            ? "bg-gray-900 text-white rounded-br-sm"
            : "bg-white border border-gray-100 text-gray-800 rounded-bl-sm shadow-sm"}`}>

          {msg.type === "text" && (
            <p className="whitespace-pre-wrap break-words">
              {(msg.contenu || "").split(/(@[\wÀ-ÿ]+)/g).map((part, i) =>
                /^@[\wÀ-ÿ]+$/.test(part)
                  ? <span key={i} className={`font-bold rounded px-0.5 ${isMe ? "text-indigo-300" : "text-indigo-600"}`}>{part}</span>
                  : part
              )}
            </p>
          )}
          {msg.type === "vocal" && msg.fichier_url && (
            <VocalPlayer url={msg.fichier_url} duree={msg.duree_secondes} isMe={isMe} />
          )}
          {msg.type === "image" && msg.fichier_url && (
            <a href={msg.fichier_url} target="_blank" rel="noreferrer">
              <img src={msg.fichier_url} alt={msg.fichier_nom || "image"}
                className="rounded-xl max-w-full max-h-56 object-cover cursor-zoom-in" />
            </a>
          )}
          {msg.type === "video" && msg.fichier_url && (
            <video src={msg.fichier_url} controls
              className="rounded-xl max-w-full max-h-56 bg-black" />
          )}
          {msg.type === "fichier" && msg.fichier_url && (
            <a href={msg.fichier_url} target="_blank" rel="noreferrer"
              className={`flex items-center gap-2 underline underline-offset-2 text-sm
                ${isMe ? "text-white/90" : "text-blue-600"}`}>
              <span>📎</span>
              <span className="truncate max-w-[160px]">{msg.fichier_nom || "Fichier"}</span>
            </a>
          )}
        </div>

        {/* Réactions */}
        <ReactionBar
          messageId={msg.id}
          reactions={reactions}
          currentUser={currentUser}
          onToggle={onToggleReaction}
          isMe={isMe}
        />

        {/* Heure + double tick (D) */}
        <span className={`text-[10px] text-gray-400 px-1 flex items-center gap-1 ${isMe ? "flex-row-reverse" : ""}`}>
          <span>{formatHeure(msg.created_at)}</span>
          {isMe && (
            <span
              className={`font-bold text-[11px] leading-none ${
                readBy && readBy.length > 0 ? "text-blue-400" : "text-gray-300"
              }`}
              title={readBy && readBy.length > 0 ? `Lu par : ${readBy.join(", ")}` : "Envoyé"}
            >
              ✓✓
            </span>
          )}
        </span>
      </div>

      {/* Bouton supprimer */}
      {canDelete && (
        <button onClick={() => onRequestDelete(msg)}
          className="self-center p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition
            opacity-0 group-hover:opacity-100">
          <TrashIcon size={13} />
        </button>
      )}

      {/* Bouton ➕ File (salon Créatif + owner uniquement) */}
      {isSalonCreatif && isOwner && (
        <button onClick={() => onAddToQueue(msg)}
          title="Ajouter à la file d'attente Créatif"
          className="self-center p-1.5 rounded-lg text-gray-300 hover:text-indigo-600 hover:bg-indigo-50 transition
            opacity-0 group-hover:opacity-100 flex-shrink-0">
          <span className="text-sm font-bold">+🎬</span>
        </button>
      )}
    </div>
  );
}

/* ── Séparateur date ────────────────────────────────────────── */
function DateSep({ label }) {
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px bg-gray-100" />
      <span className="text-xs text-gray-400 font-medium px-2">{label}</span>
      <div className="flex-1 h-px bg-gray-100" />
    </div>
  );
}

/* ── Modal créer sondage ────────────────────────────────────── */
function ModalCreerSondage({ salonId, user, onClose }) {
  const [question, setQuestion] = useState("");
  const [options,  setOptions]  = useState(["", ""]);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");

  const updateOption = (i, val) => setOptions(o => o.map((x, j) => j === i ? val : x));
  const removeOption = (i) => { if (options.length > 2) setOptions(o => o.filter((_, j) => j !== i)); };
  const addOption    = () => { if (options.length < 6) setOptions(o => [...o, ""]); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validOpts = options.map(o => o.trim()).filter(Boolean);
    if (!question.trim()) { setError("Question requise"); return; }
    if (validOpts.length < 2) { setError("Au moins 2 options requises"); return; }
    setSaving(true); setError("");
    const { error: err } = await supabase.from("sondages").insert({
      salon_id: salonId,
      question: question.trim(),
      options: validOpts,
      created_by: user.nom,
      active: true,
    });
    if (err) { setError(err.message); setSaving(false); return; }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-indigo-700 px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-white font-bold text-base">📊 Créer un sondage</h2>
            <p className="text-indigo-200 text-xs mt-0.5">Visible par toute l&apos;équipe</p>
          </div>
          <button onClick={onClose} className="text-indigo-200 hover:text-white text-2xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-lg">{error}</div>
          )}
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Question *</label>
            <textarea value={question} onChange={e => setQuestion(e.target.value)} rows={2} required
              placeholder="Quelle est votre question ?"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-2">Options * (2 à 6)</label>
            <div className="space-y-2">
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input value={opt} onChange={e => updateOption(i, e.target.value)}
                    placeholder={`Option ${i + 1}`}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  {options.length > 2 && (
                    <button type="button" onClick={() => removeOption(i)}
                      className="w-7 h-7 rounded-full bg-gray-100 hover:bg-red-100 text-gray-400 hover:text-red-500 flex items-center justify-center text-sm transition-colors">
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
            {options.length < 6 && (
              <button type="button" onClick={addOption}
                className="mt-2 text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                + Ajouter une option
              </button>
            )}
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:border-gray-400 transition-colors">
              Annuler
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              {saving ? "Envoi…" : "Publier le sondage"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Carte sondage ──────────────────────────────────────────── */
function SondageCard({ sondage, currentUser, votes, onVote, onClose, canClose }) {
  const totalVotes = votes.length;
  const myVote     = votes.find(v => v.voter_nom === currentUser);
  const voted      = !!myVote;
  const counts     = (sondage.options || []).map((_, i) => votes.filter(v => v.option_idx === i).length);

  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-2 mx-2">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <span className="text-[10px] font-bold text-indigo-500 tracking-wide uppercase">📊 Sondage</span>
          <p className="text-sm font-bold text-gray-900 mt-0.5 leading-snug">{sondage.question}</p>
        </div>
        {canClose && (
          <button onClick={() => onClose(sondage.id)}
            title="Clôturer le sondage"
            className="text-gray-400 hover:text-red-500 text-base leading-none shrink-0 transition-colors">
            ✕
          </button>
        )}
      </div>

      <div className="space-y-2">
        {(sondage.options || []).map((opt, i) => {
          const pct       = totalVotes > 0 ? Math.round(counts[i] / totalVotes * 100) : 0;
          const isMyChoice = myVote?.option_idx === i;
          return (
            <button key={i}
              onClick={() => !voted && onVote(sondage.id, i)}
              disabled={voted}
              className={`w-full text-left relative overflow-hidden rounded-lg border transition-all
                ${voted
                  ? isMyChoice
                    ? "border-indigo-400 bg-indigo-100 cursor-default"
                    : "border-gray-200 bg-white cursor-default"
                  : "border-indigo-200 bg-white hover:border-indigo-400 hover:bg-indigo-50 cursor-pointer"
                }`}>
              {voted && (
                <div className="absolute inset-y-0 left-0 bg-indigo-200/50 transition-all rounded-lg"
                  style={{ width: `${pct}%` }} />
              )}
              <div className="relative px-3 py-2 flex items-center justify-between gap-2">
                <span className={`text-sm ${isMyChoice ? "font-semibold text-indigo-700" : "text-gray-700"}`}>
                  {isMyChoice && "✓ "}{opt}
                </span>
                {voted && (
                  <span className="text-xs font-bold text-indigo-600 shrink-0">{pct}%</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between mt-3">
        <p className="text-[10px] text-gray-400">{totalVotes} vote{totalVotes !== 1 ? "s" : ""}</p>
        <p className="text-[10px] text-gray-400">par <span className="font-medium">{sondage.created_by}</span></p>
      </div>
      {!voted && (
        <p className="text-[10px] text-indigo-500 mt-1">Cliquez sur une option pour voter</p>
      )}
    </div>
  );
}

/* ── Page principale ────────────────────────────────────────── */
export default function DiscussionsPage() {
  const [user, setUser] = useState(null);
  const [allUsers, setAllUsers] = useState([]); // pour @mentions
  const [salons, setSalons] = useState([]);
  const [salonActif, setSalonActif] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reactions, setReactions] = useState({});
  const [texte, setTexte] = useState("");
  const [pendingFile, setPendingFile] = useState(null);
  const [loadingSalons, setLoadingSalons] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [sidebarMobile, setSidebarMobile] = useState(false);
  const [msgASupprimer, setMsgASupprimer] = useState(null);

  // @mention autocomplete
  const [mentionQuery,     setMentionQuery]     = useState(null); // null = inactif, string = filtre
  const [mentionIndex,     setMentionIndex]     = useState(0);
  const [mentionCursorAt,  setMentionCursorAt]  = useState(0); // position du @ dans le texte

  // Sondages
  const [sondages,         setSondages]         = useState([]);
  const [sondageVotes,     setSondageVotes]      = useState({}); // { sondage_id: [votes] }
  const [showCreerSondage, setShowCreerSondage]  = useState(false);
  const [msgPourFile,      setMsgPourFile]       = useState(null); // modal file d'attente

  // Compteurs messages non lus par salon (style WhatsApp)
  const [unreadCounts,     setUnreadCounts]      = useState({}); // { salon_id: number }

  // Vocal
  const [enregistrement, setEnregistrement] = useState(false);
  const [dureeRec, setDureeRec] = useState(0);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const cancelRecordRef = useRef(false); // si true → onstop n'envoie pas
  const timerRef = useRef(null);

  const [realtimeStatus, setRealtimeStatus] = useState("CONNECTING");

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const channelRef = useRef(null);
  const salonActifRef = useRef(null);    // ref pour le canal global
  const globalChannelRef = useRef(null); // canal global unread (tous salons)
  const lastMsgAtRef = useRef(null);     // timestamp du dernier message vu (polling fallback)

  /* ── Init ──────────────────────────────────────────────── */
  useEffect(() => {
    const s = getSession(); if (s?.user) setUser(s.user);
  }, []);

  useEffect(() => {
    supabase.from("nc_users").select("nom, role").order("nom")
      .then(({ data }) => { if (data) setAllUsers(data); });
  }, []);

  /* ── Synchronise salonActifRef (utilisé par canal global) ── */
  useEffect(() => {
    salonActifRef.current = salonActif;
  }, [salonActif]);

  /* ── Helpers non lus ────────────────────────────────────── */
  const fetchUnreadCounts = useCallback(async (salonList, userName) => {
    if (!salonList.length || !userName) return;
    // Récupère les dernières lectures de l'utilisateur
    const { data: reads } = await supabase.from("salon_reads")
      .select("salon_id, last_read_at").eq("user_nom", userName);
    const readsMap = {};
    (reads || []).forEach(r => { readsMap[r.salon_id] = r.last_read_at; });

    // Pour les salons sans entrée salon_reads (jamais visités) :
    // initialiser à maintenant pour éviter de compter tous les anciens messages.
    const now = new Date().toISOString();
    const salonsNonInitialises = salonList.filter(s => !readsMap[s.id]);
    if (salonsNonInitialises.length > 0) {
      // Créer les entrées manquantes en arrière-plan (fire & forget)
      supabase.from("salon_reads").upsert(
        salonsNonInitialises.map(s => ({
          user_nom: userName, salon_id: s.id, last_read_at: now, updated_at: now,
        })),
        { onConflict: "user_nom,salon_id" }
      ).then(() => {});
      salonsNonInitialises.forEach(s => { readsMap[s.id] = now; });
    }

    // Compte les messages non lus pour chaque salon en parallèle
    const counts = {};
    await Promise.all(salonList.map(async (salon) => {
      const lastRead = readsMap[salon.id] || now;
      const { count } = await supabase.from("messages")
        .select("id", { count: "exact", head: true })
        .eq("salon_id", salon.id)
        .gt("created_at", lastRead)
        .neq("auteur_nom", userName);
      counts[salon.id] = count || 0;
    }));
    setUnreadCounts(counts);
  }, []);

  const markSalonRead = useCallback(async (salon, userName) => {
    if (!salon || !userName) return;
    // Reset immédiat dans l'UI
    setUnreadCounts(prev => ({ ...prev, [salon.id]: 0 }));
    // Persiste dans Supabase
    const now = new Date().toISOString();
    await supabase.from("salon_reads").upsert(
      { user_nom: userName, salon_id: salon.id, last_read_at: now, updated_at: now },
      { onConflict: "user_nom,salon_id" }
    );
    // ── D : marquer les messages récents comme lus (read_by) ──
    // On récupère les 50 derniers messages du salon, pas encore dans read_by
    const { data: unread } = await supabase.from("messages")
      .select("id, read_by")
      .eq("salon_id", salon.id)
      .neq("auteur_nom", userName)
      .order("created_at", { ascending: false })
      .limit(50);
    if (unread?.length) {
      const toUpdate = unread.filter(m => !(m.read_by || []).includes(userName));
      for (const msg of toUpdate) {
        const newReadBy = [...(msg.read_by || []), userName];
        await supabase.from("messages").update({ read_by: newReadBy }).eq("id", msg.id);
      }
      // Mettre à jour l'UI locale
      setMessages(prev => prev.map(m => {
        if (toUpdate.find(u => u.id === m.id) && !(m.read_by || []).includes(userName)) {
          return { ...m, read_by: [...(m.read_by || []), userName] };
        }
        return m;
      }));
    }
  }, []);

  /* ── Canal global : messages non lus (hors salon actif) ─── */
  useEffect(() => {
    if (!user) return;

    const gc = supabase.channel("global-unread-disc")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const msg = payload.new;
        if (msg.auteur_nom === user.nom) return;       // ignorer ses propres messages
        if (salonActifRef.current?.id === msg.salon_id) return; // ignorer le salon actif
        setUnreadCounts(prev => ({
          ...prev,
          [msg.salon_id]: (prev[msg.salon_id] || 0) + 1,
        }));
      })
      .subscribe();

    globalChannelRef.current = gc;
    return () => {
      if (globalChannelRef.current) {
        supabase.removeChannel(globalChannelRef.current);
        globalChannelRef.current = null;
      }
    };
  }, [user]);

  /* ── Charger compteurs non lus quand user + salons prêts ── */
  useEffect(() => {
    if (user && salons.length) fetchUnreadCounts(salons, user.nom);
  }, [user, salons, fetchUnreadCounts]);

  /* ── Marquer salon comme lu quand on l'ouvre ────────────── */
  useEffect(() => {
    if (user && salonActif) markSalonRead(salonActif, user.nom);
  }, [salonActif, user, markSalonRead]);

  /* ── Salons ────────────────────────────────────────────── */
  useEffect(() => {
    async function fetchSalons() {
      const { data } = await supabase.from("salons").select("*").order("ordre");
      if (data?.length) { setSalons(data); setSalonActif(data[0]); }
      setLoadingSalons(false);
    }
    fetchSalons();
  }, []);

  /* ── Charger réactions ─────────────────────────────────── */
  const fetchReactions = useCallback(async (messageIds) => {
    if (!messageIds.length) return;
    const { data } = await supabase.from("reactions").select("*")
      .in("message_id", messageIds);
    if (data) {
      const map = {};
      data.forEach(r => {
        if (!map[r.message_id]) map[r.message_id] = { heart: [], fire: [], x: [], stop: [] };
        if (!map[r.message_id][r.type]) map[r.message_id][r.type] = [];
        map[r.message_id][r.type].push(r.auteur_nom);
      });
      setReactions(map);
    }
  }, []);

  /* ── Sondages ──────────────────────────────────────────── */
  const fetchSondages = useCallback(async (salonId) => {
    const { data } = await supabase.from("sondages")
      .select("*").eq("salon_id", salonId).eq("active", true).order("created_at", { ascending: false });
    if (data) {
      setSondages(data);
      if (data.length > 0) {
        const { data: vData } = await supabase.from("sondage_votes")
          .select("*").in("sondage_id", data.map(s => s.id));
        if (vData) {
          const map = {};
          vData.forEach(v => { if (!map[v.sondage_id]) map[v.sondage_id] = []; map[v.sondage_id].push(v); });
          setSondageVotes(map);
        }
      }
    }
  }, []);

  const handleVote = async (sondageId, optionIdx) => {
    if (!user) return;
    const { error } = await supabase.from("sondage_votes").insert({
      sondage_id: sondageId, option_idx: optionIdx, voter_nom: user.nom,
    });
    if (!error) {
      setSondageVotes(prev => ({
        ...prev,
        [sondageId]: [...(prev[sondageId] || []), { sondage_id: sondageId, option_idx: optionIdx, voter_nom: user.nom }],
      }));
    }
  };

  const handleCloseSondage = async (sondageId) => {
    if (!isManager(user?.role)) return;
    await supabase.from("sondages").update({ active: false }).eq("id", sondageId);
    setSondages(prev => prev.filter(s => s.id !== sondageId));
  };

  /* ── Messages + Realtime ───────────────────────────────── */
  useEffect(() => {
    if (!salonActif) return;
    setLoadingMessages(true);
    setMessages([]);
    setReactions({});
    setSondages([]);
    setSondageVotes({});
    setRealtimeStatus("CONNECTING");
    lastMsgAtRef.current = null;

    if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; }

    async function fetchMessages() {
      const { data } = await supabase.from("messages").select("*")
        .eq("salon_id", salonActif.id)
        .order("created_at", { ascending: true }).limit(200);
      if (data) {
        setMessages(data);
        fetchReactions(data.map(m => m.id));
      }
      setLoadingMessages(false);
    }
    fetchMessages();
    fetchSondages(salonActif.id);

    const channel = supabase.channel(`salon-${salonActif.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages",
        filter: `salon_id=eq.${salonActif.id}` }, (payload) => {
        setMessages(prev => prev.find(m => m.id === payload.new.id) ? prev : [...prev, payload.new]);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages",
        filter: `salon_id=eq.${salonActif.id}` }, (payload) => {
        // ── D : mise à jour read_by en temps réel ──
        setMessages(prev => prev.map(m => m.id === payload.new.id ? { ...m, read_by: payload.new.read_by } : m));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, (payload) => {
        setMessages(prev => prev.filter(m => m.id !== payload.old.id));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "reactions" }, (payload) => {
        const r = payload.new;
        setReactions(prev => {
          const cur = prev[r.message_id] || { heart: [], fire: [], x: [], stop: [] };
          const list = cur[r.type] || [];
          if (list.includes(r.auteur_nom)) return prev;
          return { ...prev, [r.message_id]: { ...cur, [r.type]: [...list, r.auteur_nom] } };
        });
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "reactions" }, (payload) => {
        const r = payload.old;
        setReactions(prev => {
          const cur = prev[r.message_id];
          if (!cur) return prev;
          return { ...prev, [r.message_id]: { ...cur, [r.type]: (cur[r.type] || []).filter(n => n !== r.auteur_nom) } };
        });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "sondages",
        filter: `salon_id=eq.${salonActif.id}` }, (payload) => {
        if (payload.new.active) setSondages(prev => [payload.new, ...prev]);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sondages" }, (payload) => {
        if (!payload.new.active) setSondages(prev => prev.filter(s => s.id !== payload.new.id));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "sondage_votes" }, (payload) => {
        const v = payload.new;
        setSondageVotes(prev => ({
          ...prev,
          [v.sondage_id]: [...(prev[v.sondage_id] || []).filter(x => x.id !== v.id), v],
        }));
      })
      .subscribe((status, err) => {
        if (err) console.error("[Realtime] Erreur canal discussions:", err);
        setRealtimeStatus(status === "SUBSCRIBED" ? "SUBSCRIBED" : status || "CONNECTING");
      });

    channelRef.current = channel;
    return () => { if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; } };
  }, [salonActif, fetchReactions, fetchSondages]);

  /* ── Suivre le timestamp du dernier message ────────────── */
  useEffect(() => {
    if (messages.length > 0) {
      lastMsgAtRef.current = messages[messages.length - 1].created_at;
    }
  }, [messages]);

  /* ── Polling fallback : rattraper les messages manqués ── */
  /* Active en permanence — filet de sécurité si Realtime */
  /* perd la connexion (onglet en arrière-plan, réseau...) */
  useEffect(() => {
    if (!salonActif) return;
    const poll = async () => {
      const since = lastMsgAtRef.current || new Date(Date.now() - 10000).toISOString();
      const { data } = await supabase.from("messages")
        .select("*")
        .eq("salon_id", salonActif.id)
        .gt("created_at", since)
        .order("created_at", { ascending: true });
      if (data?.length) {
        setMessages(prev => {
          const ids = new Set(prev.map(m => m.id));
          const newMsgs = data.filter(m => !ids.has(m.id));
          return newMsgs.length ? [...prev, ...newMsgs] : prev;
        });
      }
    };
    const interval = setInterval(poll, 4000);
    return () => clearInterval(interval);
  }, [salonActif]);

  /* ── Refresh quand l'onglet reprend le focus ────────────── */
  useEffect(() => {
    if (!salonActif) return;
    const onVisible = async () => {
      if (document.visibilityState !== "visible") return;
      const since = lastMsgAtRef.current
        ? new Date(new Date(lastMsgAtRef.current).getTime() - 500).toISOString()
        : new Date(Date.now() - 30000).toISOString();
      const { data } = await supabase.from("messages")
        .select("*")
        .eq("salon_id", salonActif.id)
        .gt("created_at", since)
        .order("created_at", { ascending: true });
      if (data?.length) {
        setMessages(prev => {
          const ids = new Set(prev.map(m => m.id));
          const newMsgs = data.filter(m => !ids.has(m.id));
          return newMsgs.length ? [...prev, ...newMsgs] : prev;
        });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [salonActif]);

  /* ── Auto-scroll ───────────────────────────────────────── */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* ── Envoyer texte / fichier ───────────────────────────── */
  async function envoyerMessage(e) {
    e?.preventDefault();
    if ((!texte.trim() && !pendingFile) || !salonActif || envoi) return;
    setEnvoi(true);

    if (pendingFile) {
      await envoyerFichier(pendingFile);
      setPendingFile(null);
    }

    if (texte.trim()) {
      const contenu = texte.trim();
      setTexte("");
      const { data, error } = await supabase.from("messages").insert({
        salon_id: salonActif.id,
        auteur_nom: user?.nom || "Anonyme",
        auteur_role: user?.role || null,
        contenu, type: "text",
      }).select().single();
      if (!error && data) {
        setMessages(prev => prev.find(m => m.id === data.id) ? prev : [...prev, data]);
        // Push notification
        const mentions = extraireMentions(contenu);
        const auteur = user?.nom || "Quelqu'un";
        const preview = contenu.length > 60 ? contenu.slice(0, 60) + "…" : contenu;

        if (mentions.length > 0) {
          // Envoyer UNIQUEMENT les notifs de mention aux personnes mentionnées.
          // PAS de notif générale : elle créerait un doublon pour les personnes mentionnées
          // (elles recevraient à la fois "vous a mentionné" ET "dans [salon]").
          const destinatairesUniques = [...new Set(mentions)].filter(nom => nom !== auteur);
          for (const nom of destinatairesUniques) {
            await sendPushNotification({
              title: `📣 ${auteur} vous a mentionné`,
              body: `${salonActif.nom} : ${preview}`,
              url: "/dashboard/discussions",
              tag: `mention-${data.id}`,
              targetUser: nom,       // ← notif privée pour ce destinataire uniquement
              fromUser: auteur,
              type: "mention",
            });
          }
        } else {
          // Pas de mention → notif générale pour tous sauf l'expéditeur
          await sendPushNotification({
            title: `💬 ${auteur} dans ${salonActif.nom}`,
            body: preview,
            url: "/dashboard/discussions",
            tag: `msg-${salonActif.id}`,
            excludeUser: auteur,   // ← l'expéditeur ne reçoit pas sa propre notif générale
            fromUser: auteur,
            type: "discussion",
          });
        }
      }
    }

    setEnvoi(false);
    inputRef.current?.focus();
  }

  /* ── Envoyer fichier (image/vidéo) ─────────────────────── */
  async function envoyerFichier(file) {
    const ext = file.name.split(".").pop();
    const nomFichier = `${Date.now()}_${(user?.nom || "user").replace(/\s/g, "_")}.${ext}`;
    const type = isImage(file.type) ? "image" : isVideo(file.type) ? "video" : "fichier";

    const { error: uploadError } = await supabase.storage.from("medias")
      .upload(nomFichier, file, { contentType: file.type });
    if (uploadError) { alert("Erreur upload : " + uploadError.message); return; }

    const { data: urlData } = supabase.storage.from("medias").getPublicUrl(nomFichier);

    const { data, error } = await supabase.from("messages").insert({
      salon_id: salonActif.id,
      auteur_nom: user?.nom || "Anonyme",
      auteur_role: user?.role || null,
      type, fichier_url: urlData.publicUrl, fichier_nom: file.name,
    }).select().single();
    if (!error && data) setMessages(prev => prev.find(m => m.id === data.id) ? prev : [...prev, data]);
  }

  /* ── Supprimer message ─────────────────────────────────── */
  async function confirmerSuppression() {
    if (!msgASupprimer) return;
    // Supprimer le fichier audio du storage si c'est un vocal
    if (msgASupprimer.type === "vocal" && msgASupprimer.fichier_nom) {
      await supabase.storage.from("vocaux").remove([msgASupprimer.fichier_nom]);
    }
    const { error } = await supabase.from("messages").delete().eq("id", msgASupprimer.id);
    if (error) { alert("Erreur : " + error.message); }
    else setMessages(prev => prev.filter(m => m.id !== msgASupprimer.id));
    setMsgASupprimer(null);
  }

  /* ── Réactions ─────────────────────────────────────────── */
  async function toggleReaction(messageId, type) {
    if (!user) return;
    const cur = reactions[messageId] || { heart: [], fire: [], x: [], stop: [] };
    const hasMe = (cur[type] || []).includes(user.nom);

    if (hasMe) {
      await supabase.from("reactions").delete()
        .eq("message_id", messageId).eq("auteur_nom", user.nom).eq("type", type);
      setReactions(prev => ({
        ...prev,
        [messageId]: { ...(prev[messageId] || {}), [type]: (prev[messageId]?.[type] || []).filter(n => n !== user.nom) }
      }));
    } else {
      const { data } = await supabase.from("reactions").insert({
        message_id: messageId, auteur_nom: user.nom, type,
      }).select().single();
      if (data) {
        setReactions(prev => ({
          ...prev,
          [messageId]: { ...(prev[messageId] || { heart: [], fire: [], x: [], stop: [] }), [type]: [...(prev[messageId]?.[type] || []), user.nom] }
        }));
      }
    }
  }

  /* ── Enregistrement vocal ──────────────────────────────── */
  async function demarrerEnregistrement() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      cancelRecordRef.current = false;
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        if (cancelRecordRef.current) { cancelRecordRef.current = false; return; } // annulé
        const duree = dureeRec;
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        await envoyerVocal(blob, duree);
      };
      mr.start(); mediaRecorderRef.current = mr;
      setEnregistrement(true); setDureeRec(0);
      timerRef.current = setInterval(() => setDureeRec(d => d + 1), 1000);
    } catch (err) { alert("Microphone non accessible : " + err.message); }
  }

  function arreterEnregistrement() {
    clearInterval(timerRef.current); setEnregistrement(false);
    if (mediaRecorderRef.current?.state !== "inactive") mediaRecorderRef.current.stop();
  }

  function annulerEnregistrement() {
    clearInterval(timerRef.current);
    cancelRecordRef.current = true;
    setEnregistrement(false);
    if (mediaRecorderRef.current?.state !== "inactive") mediaRecorderRef.current.stop();
  }

  async function envoyerVocal(blob, duree) {
    if (!salonActif || !user) return;
    const nomFichier = `${Date.now()}_${(user.nom || "user").replace(/\s/g, "_")}.webm`;
    const { error: uploadError } = await supabase.storage.from("vocaux")
      .upload(nomFichier, blob, { contentType: "audio/webm" });
    if (uploadError) { alert("Erreur upload vocal : " + uploadError.message); return; }
    const { data: urlData } = supabase.storage.from("vocaux").getPublicUrl(nomFichier);
    const { data, error } = await supabase.from("messages").insert({
      salon_id: salonActif.id, auteur_nom: user?.nom || "Anonyme", auteur_role: user?.role || null,
      type: "vocal", fichier_url: urlData.publicUrl, fichier_nom: nomFichier, duree_secondes: duree,
    }).select().single();
    if (!error && data) setMessages(prev => prev.find(m => m.id === data.id) ? prev : [...prev, data]);
  }

  /* ── Groupes messages ──────────────────────────────────── */
  function buildGroupes(msgs) {
    const groupes = []; let lastDate = null; let lastAuteur = null;
    msgs.forEach((msg, idx) => {
      const dl = formatDate(msg.created_at);
      if (dl !== lastDate) { groupes.push({ type: "date", label: dl, key: `d${idx}` }); lastDate = dl; lastAuteur = null; }
      groupes.push({ type: "msg", msg, showAvatar: msg.auteur_nom !== lastAuteur, key: msg.id });
      lastAuteur = msg.auteur_nom;
    });
    return groupes;
  }

  const groupes = buildGroupes(messages);
  const isMe = msg => msg.auteur_nom === user?.nom;
  const admin = isManager(user?.role);
  const isFormation = salonActif?.nom?.toLowerCase().includes("formation");
  const readOnly = isFormation && !admin;

  /* ── Render ────────────────────────────────────────────── */
  return (
    <>
      <ConfirmDeleteModal
        message={msgASupprimer}
        onConfirm={confirmerSuppression}
        onCancel={() => setMsgASupprimer(null)}
      />
      {msgPourFile && (
        <ModalAjouterFile
          msg={msgPourFile}
          user={user}
          onClose={() => setMsgPourFile(null)}
        />
      )}
      {showCreerSondage && salonActif && (
        <ModalCreerSondage
          salonId={salonActif.id}
          user={user}
          onClose={() => setShowCreerSondage(false)}
        />
      )}

      <div className="flex h-[calc(100vh-8rem)] bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

        {sidebarMobile && (
          <div className="fixed inset-0 bg-black/30 z-20 md:hidden" onClick={() => setSidebarMobile(false)} />
        )}

        {/* ── Salons ──────────────────────────────────────── */}
        <aside className={`fixed md:static z-30 h-full w-60 bg-gray-50 border-r border-gray-100
          flex flex-col transition-transform duration-200
          ${sidebarMobile ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}>

          <div className="px-4 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-gray-900">💬 Salons</h2>
              <p className="text-xs text-gray-400 mt-0.5">Équipe Najm Coiff</p>
            </div>
            <button className="md:hidden p-1 rounded-lg hover:bg-gray-200" onClick={() => setSidebarMobile(false)}>
              <CloseIcon size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto py-2 px-2">
            {loadingSalons ? (
              [1,2,3,4].map(i => <div key={i} className="h-12 rounded-xl bg-gray-200 animate-pulse mb-1.5" />)
            ) : salons.map(salon => {
              const formation = salon.nom?.toLowerCase().includes("formation");
              const locked = formation && !admin;
              const isActive = salonActif?.id === salon.id;
              const unread = isActive ? 0 : (unreadCounts[salon.id] || 0);
              return (
                <button key={salon.id}
                  data-testid={`salon-btn-${salon.id}`}
                  onClick={() => { setSalonActif(salon); setSidebarMobile(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition mb-0.5
                    ${isActive
                      ? "bg-gray-900 text-white"
                      : unread > 0
                        ? "bg-green-50 text-gray-900 hover:bg-green-100"
                        : "text-gray-700 hover:bg-gray-100"}`}>
                  <span className="text-lg leading-none shrink-0">{salon.icone}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate
                      ${isActive ? "font-semibold text-white"
                        : unread > 0 ? "font-bold text-gray-900"
                        : "font-medium text-gray-800"}`}>
                      {salon.nom}
                    </p>
                    {locked && (
                      <p className={`text-[10px] ${isActive ? "text-white/60" : "text-amber-500"}`}>
                        🔒 Lecture seule
                      </p>
                    )}
                    {!locked && !isActive && unread > 0 && (
                      <p className="text-[10px] text-green-600 font-medium">
                        {unread} nouveau{unread > 1 ? "x" : ""} message{unread > 1 ? "s" : ""}
                      </p>
                    )}
                  </div>
                  {/* Badge style WhatsApp */}
                  {!isActive && unread > 0 && (
                    <span
                      data-testid={`unread-badge-${salon.id}`}
                      className="min-w-[20px] h-5 bg-green-500 text-white text-[11px] font-bold rounded-full
                        flex items-center justify-center px-1.5 shrink-0 shadow-sm">
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        {/* ── Zone chat ───────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">

          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-100 bg-white flex items-center gap-3 shrink-0">
            {/* Bouton sidebar mobile avec badge total non lus */}
            <div className="relative md:hidden">
              <button className="p-1.5 rounded-lg hover:bg-gray-100" onClick={() => setSidebarMobile(true)}>
                <MenuIcon size={18} />
              </button>
              {(() => {
                const total = Object.values(unreadCounts).reduce((s, v) => s + v, 0);
                return total > 0 ? (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-green-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none pointer-events-none">
                    {total > 99 ? "99+" : total}
                  </span>
                ) : null;
              })()}
            </div>
            {salonActif ? (
              <>
                <span className="text-xl">{salonActif.icone}</span>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    {salonActif.nom}
                    {readOnly && <span className="text-[10px] font-normal bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">🔒 Lecture seule</span>}
                  </h3>
                  {salonActif.description && <p className="text-xs text-gray-400">{salonActif.description}</p>}
                </div>
              </>
            ) : (
              <h3 className="text-sm text-gray-400">Sélectionne un salon</h3>
            )}
            <div className="ml-auto flex items-center gap-1.5">
              <div
                data-testid="realtime-indicator"
                data-status={realtimeStatus}
                className={`w-2 h-2 rounded-full animate-pulse ${
                  realtimeStatus === "SUBSCRIBED"
                    ? "bg-green-400"
                    : realtimeStatus === "CHANNEL_ERROR" || realtimeStatus === "TIMED_OUT" || realtimeStatus === "CLOSED"
                      ? "bg-orange-400"
                      : "bg-gray-300"
                }`}
              />
              <span className="text-xs text-gray-400">
                {realtimeStatus === "SUBSCRIBED" ? "En direct" : realtimeStatus === "CHANNEL_ERROR" || realtimeStatus === "CLOSED" ? "Reconnexion…" : "Connexion…"}
              </span>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 bg-gray-50/40">
            {!salonActif && (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <span className="text-5xl">💬</span>
                <p className="text-gray-400 text-sm">Sélectionne un salon</p>
              </div>
            )}
            {/* Sondages actifs */}
            {salonActif && !loadingMessages && sondages.length > 0 && (
              <div className="pt-3 pb-1 space-y-2">
                {sondages.map(s => (
                  <SondageCard
                    key={s.id}
                    sondage={s}
                    currentUser={user?.nom}
                    votes={sondageVotes[s.id] || []}
                    onVote={handleVote}
                    onClose={handleCloseSondage}
                    canClose={admin}
                  />
                ))}
              </div>
            )}

            {salonActif && loadingMessages && (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin w-6 h-6 border-2 border-gray-200 border-t-gray-700 rounded-full" />
              </div>
            )}
            {salonActif && !loadingMessages && messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                <span className="text-4xl">{salonActif.icone}</span>
                <p className="text-sm font-medium text-gray-700">
                  {readOnly ? "Aucun message pour l'instant." : "Soyez le premier à écrire !"}
                </p>
              </div>
            )}
            <div className="space-y-0.5">
              {groupes.map(item => {
                if (item.type === "date") return <DateSep key={item.key} label={item.label} />;
                const me = isMe(item.msg);
                const isSalonCreatif = salonActif?.nom?.toLowerCase().includes("créatif") || salonActif?.nom?.toLowerCase().includes("creatif");
                const isOwner = ["owner", "chef d'equipe"].includes((user?.role || "").toLowerCase());
                return (
                  <Message
                    key={item.key}
                    msg={item.msg}
                    isMe={me}
                    showAvatar={item.showAvatar}
                    canDelete={item.msg.type === "vocal" ? true : (me || admin)}
                    onRequestDelete={setMsgASupprimer}
                    reactions={reactions}
                    currentUser={user?.nom}
                    onToggleReaction={toggleReaction}
                    isSalonCreatif={isSalonCreatif}
                    isOwner={isOwner}
                    onAddToQueue={setMsgPourFile}
                    readBy={item.msg.read_by || []}
                  />
                );
              })}
            </div>
            <div ref={messagesEndRef} />
          </div>

          {/* Zone saisie */}
          {salonActif && (
            readOnly ? (
              <div className="px-4 py-4 border-t border-gray-100 bg-amber-50 flex items-center justify-center gap-2">
                <span className="text-amber-500">🔒</span>
                <p className="text-sm text-amber-700 font-medium">
                  Salon en lecture seule — réservé aux responsables et propriétaires.
                </p>
              </div>
            ) : (
              <div className="px-4 py-3 border-t border-gray-100 bg-white shrink-0 relative">
                {enregistrement && (
                  <div className="mb-2 flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-100 rounded-xl">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                    <span className="text-sm text-red-700 font-semibold tabular-nums">{formatDuree(dureeRec)}</span>
                    <span className="text-xs text-red-400 flex-1">Enregistrement en cours…</span>
                    <button type="button" onClick={annulerEnregistrement}
                      className="text-xs border border-red-300 text-red-600 px-3 py-1 rounded-lg hover:bg-red-100 transition shrink-0">
                      ✕ Annuler
                    </button>
                    <button type="button" onClick={arreterEnregistrement}
                      className="text-xs bg-red-600 text-white px-3 py-1 rounded-lg hover:bg-red-700 transition shrink-0">
                      ✓ Envoyer
                    </button>
                  </div>
                )}

                {/* Prévisualisation fichier */}
                {pendingFile && (
                  <FilePreview file={pendingFile} onRemove={() => setPendingFile(null)} />
                )}

                {/* ── @mention dropdown — hors du form pour éviter stacking conflict ── */}
                {mentionQuery !== null && (() => {
                  const filtered = allUsers.filter(u =>
                    u.nom !== user?.nom &&
                    u.nom.toLowerCase().startsWith(mentionQuery.toLowerCase())
                  );
                  if (filtered.length === 0) return null;
                  return (
                    <div data-mention-dropdown className="absolute bottom-full left-0 right-0 mb-1 z-[200] px-2">
                      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
                        {filtered.map((u, i) => (
                          <button
                            key={u.nom}
                            type="button"
                            data-mention-item={u.nom}
                            onMouseDown={e => {
                              e.preventDefault();
                              const before = texte.slice(0, mentionCursorAt);
                              const after  = texte.slice(mentionCursorAt + 1 + mentionQuery.length);
                              const newVal = before + "@" + u.nom + " " + after;
                              setTexte(newVal);
                              setMentionQuery(null);
                              setTimeout(() => inputRef.current?.focus(), 0);
                            }}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition
                              ${i === mentionIndex ? "bg-indigo-50 text-indigo-700" : "text-gray-700 hover:bg-gray-50"}`}>
                            <span className="w-7 h-7 rounded-full bg-gray-900 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                              {u.nom[0].toUpperCase()}
                            </span>
                            <span className="font-semibold">@{u.nom}</span>
                            <span className="text-xs text-gray-400 ml-auto">{u.role}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                <form onSubmit={envoyerMessage} className="flex items-end gap-2">
                  {/* Input caché pour fichiers */}
                  <input ref={fileInputRef} type="file" accept="image/*,video/*"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) setPendingFile(f); e.target.value = ""; }}
                  />

                  {/* Bouton pièce jointe */}
                  <button type="button" onClick={() => fileInputRef.current?.click()}
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0
                      bg-gray-100 text-gray-600 hover:bg-gray-200 transition"
                    title="Joindre image ou vidéo">
                    <PaperclipIcon size={16} />
                  </button>

                  {/* Bouton sondage (managers seulement) */}
                  {admin && (
                    <button type="button" onClick={() => setShowCreerSondage(true)}
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0
                        bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition"
                      title="Créer un sondage">
                      <PollIcon size={16} />
                    </button>
                  )}

                  <textarea ref={inputRef} value={texte}
                    onChange={e => {
                      const val = e.target.value;
                      setTexte(val);
                      // Détecter @query à la position du curseur
                      const cursor = e.target.selectionStart;
                      const textBeforeCursor = val.slice(0, cursor);
                      const atMatch = textBeforeCursor.match(/@([\wÀ-ÿ]*)$/);
                      if (atMatch) {
                        const atPos = textBeforeCursor.lastIndexOf("@");
                        setMentionCursorAt(atPos);
                        setMentionQuery(atMatch[1]);
                        setMentionIndex(0);
                      } else {
                        setMentionQuery(null);
                      }
                    }}
                    onKeyDown={e => {
                      // Navigation @mention
                      if (mentionQuery !== null) {
                        const filtered = allUsers.filter(u =>
                          u.nom !== user?.nom &&
                          u.nom.toLowerCase().startsWith(mentionQuery.toLowerCase())
                        );
                        if (filtered.length > 0) {
                          if (e.key === "ArrowDown") {
                            e.preventDefault();
                            setMentionIndex(i => Math.min(i + 1, filtered.length - 1));
                            return;
                          }
                          if (e.key === "ArrowUp") {
                            e.preventDefault();
                            setMentionIndex(i => Math.max(i - 1, 0));
                            return;
                          }
                          if (e.key === "Enter" || e.key === "Tab") {
                            e.preventDefault();
                            const u = filtered[mentionIndex] || filtered[0];
                            const before = texte.slice(0, mentionCursorAt);
                            const after  = texte.slice(mentionCursorAt + 1 + mentionQuery.length);
                            setTexte(before + "@" + u.nom + " " + after);
                            setMentionQuery(null);
                            return;
                          }
                          if (e.key === "Escape") {
                            e.preventDefault();
                            setMentionQuery(null);
                            return;
                          }
                        }
                      }
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        envoyerMessage(e);
                      }
                    }}
                    onBlur={() => setTimeout(() => setMentionQuery(null), 150)}
                    placeholder={`Message dans ${salonActif.nom}…`}
                    rows={1} disabled={enregistrement}
                    className="flex-1 resize-none rounded-xl border border-gray-200 px-4 py-2.5 text-sm
                      focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400
                      placeholder:text-gray-400 bg-white disabled:opacity-50
                      min-h-[42px] max-h-32 overflow-y-auto"
                    style={{ height: "42px" }}
                    onInput={e => { e.target.style.height = "42px"; e.target.style.height = Math.min(e.target.scrollHeight, 128) + "px"; }}
                  />

                  <button type="button"
                    onClick={enregistrement ? arreterEnregistrement : demarrerEnregistrement}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition
                      ${enregistrement ? "bg-red-500 text-white hover:bg-red-600" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                    title={enregistrement ? "Arrêter et envoyer" : "Vocal"}>
                    {enregistrement ? <StopIcon size={16} /> : <MicIcon size={16} />}
                  </button>

                  <button type="submit" disabled={(!texte.trim() && !pendingFile) || envoi}
                    className="w-10 h-10 rounded-xl bg-gray-900 text-white flex items-center justify-center
                      hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition shrink-0">
                    <SendIcon size={16} />
                  </button>
                </form>

                <p className="text-[10px] text-gray-400 mt-1.5 px-1">
                  Entrée pour envoyer · Maj+Entrée saut de ligne · 📎 images &amp; vidéos
                </p>
              </div>
            )
          )}
        </div>
      </div>
    </>
  );
}

/* ── Icônes ──────────────────────────────────────────────────── */
function SendIcon({ size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>;
}
function MicIcon({ size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>;
}
function StopIcon({ size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>;
}
function PlayIcon({ size = 20, className = "" }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}><polygon points="5 3 19 12 5 21 5 3"/></svg>;
}
function PauseIcon({ size = 20, className = "" }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>;
}
function TrashIcon({ size = 20, className = "" }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>;
}
function PaperclipIcon({ size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>;
}
function MenuIcon({ size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>;
}
function CloseIcon({ size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
}
function PollIcon({ size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>;
}
