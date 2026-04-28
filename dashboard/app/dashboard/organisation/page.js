"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api";
import { sendPushNotification } from "@/lib/push";
import { getRawSession } from "@/lib/auth";

// ── Constantes ─────────────────────────────────────────────────────────────

const COULEURS_NOTES = [
  "#fef08a", "#fda4af", "#93c5fd", "#86efac",
  "#fdba74", "#c4b5fd", "#5eead4", "#e2e8f0",
];

const COULEURS_EVENTS = [
  "#6366f1", "#ef4444", "#22c55e", "#f59e0b",
  "#8b5cf6", "#06b6d4", "#ec4899", "#64748b",
];

const RECURRENCES = [
  { value: "aucune",         label: "Événement unique" },
  { value: "quotidienne",    label: "Routine quotidienne — chaque jour" },
  { value: "routine",        label: "Routine hebdomadaire — chaque semaine (même jour)" },
  { value: "mensuelle",      label: "Mensuelle — même jour chaque mois" },
  { value: "dates_precises", label: "Dates précises (liste manuelle)" },
];

// Retourne true si l'événement est marqué terminé pour la date donnée (YYYY-MM-DD)
function isEventDone(ev, dateStr) {
  if (!ev) return false;
  if (ev.recurrence === "aucune") return ev.terminee || false;
  return (ev.completions || {})[dateStr] || false;
}

const MOIS_FR  = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const JOURS_FR = ["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"];

// Signification des emojis de réaction
// ❤️ = Bien reçu  |  🔥 = Effectué / terminé  |  ❌ = Problème / faute  |  ⛔ = Important
const NOTE_REACTION_EMOJIS  = { heart: "❤️", fire: "🔥", x: "❌", stop: "⛔" };
const NOTE_REACTION_LABELS  = { heart: "Bien reçu", fire: "Effectué", x: "Problème", stop: "Important" };
const NOTE_REACTION_TYPES   = ["heart", "fire", "x", "stop"];

const MANAGER_ROLES = ["owner", "chef d'equipe", "responsable", "acheteur", "drh"];
function isManager(role) {
  return MANAGER_ROLES.some(r => (role || "").toLowerCase().includes(r));
}

function fmtDate(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("fr-DZ", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

// ── Page principale ─────────────────────────────────────────────────────────

export default function OrganisationPage() {
  const [session, setSession] = useState(null);
  const [tab, setTab]         = useState("board"); // "board" | "agenda"
  const [mobileBoard, setMobileBoard] = useState("public"); // mobile: "public" | "private"

  const [publicNotes,  setPublicNotes]  = useState([]);
  const [privateNotes, setPrivateNotes] = useState([]);
  const [events,       setEvents]       = useState([]);
  const [users,        setUsers]        = useState([]);
  const [loading,      setLoading]      = useState(true);

  const [noteReactions, setNoteReactions] = useState({}); // { noteId: {heart:[],fire:[],x:[],stop:[]} }
  const [editingNote,   setEditingNote]   = useState(null); // null | note object

  const [showNewPublic,  setShowNewPublic]  = useState(false);
  const [showNewPrivate, setShowNewPrivate] = useState(false);
  const [showNewEvent,   setShowNewEvent]   = useState(null); // null | Date

  const [calDate, setCalDate] = useState(new Date());

  useEffect(() => {
    const s = getRawSession();
    const user = s?.user || null;
    setSession(user);
    if (user) { loadNotes(user); loadUsers(); if (isManager(user.role)) loadEvents(); }
  }, []);

  // ── Realtime ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!session) return;
    const ch = supabase.channel("org-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notes" }, ({ new: n }) => {
        if (n.type === "public") setPublicNotes(p => [n, ...p]);
        else if (n.type === "private" && n.board_owner === session.nom) setPrivateNotes(p => [n, ...p]);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "notes" }, ({ old: n }) => {
        setPublicNotes(p => p.filter(x => x.id !== n.id));
        setPrivateNotes(p => p.filter(x => x.id !== n.id));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notes" }, ({ new: n }) => {
        if (n.type === "public") setPublicNotes(p => p.map(x => x.id === n.id ? n : x));
        else if (n.type === "private" && n.board_owner === session.nom) setPrivateNotes(p => p.map(x => x.id === n.id ? n : x));
      })
      // ── Réactions notes (temps réel) ──
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "note_reactions" }, ({ new: r }) => {
        setNoteReactions(prev => {
          const cur  = prev[r.note_id] || { heart: [], fire: [], x: [], stop: [] };
          const list = cur[r.type] || [];
          if (list.includes(r.auteur_nom)) return prev;
          return { ...prev, [r.note_id]: { ...cur, [r.type]: [...list, r.auteur_nom] } };
        });
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "note_reactions" }, ({ old: r }) => {
        setNoteReactions(prev => {
          const cur = prev[r.note_id];
          if (!cur) return prev;
          return { ...prev, [r.note_id]: { ...cur, [r.type]: (cur[r.type] || []).filter(n => n !== r.auteur_nom) } };
        });
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [session]);

  async function loadNoteReactions(noteIds) {
    if (!noteIds.length) return;
    const { data } = await supabase.from("note_reactions").select("*").in("note_id", noteIds);
    if (data) {
      const map = {};
      data.forEach(r => {
        if (!map[r.note_id]) map[r.note_id] = { heart: [], fire: [], x: [], stop: [] };
        if (!map[r.note_id][r.type]) map[r.note_id][r.type] = [];
        if (!map[r.note_id][r.type].includes(r.auteur_nom))
          map[r.note_id][r.type].push(r.auteur_nom);
      });
      setNoteReactions(map);
    }
  }

  async function loadNotes(user) {
    setLoading(true);
    const [pub, priv] = await Promise.all([
      supabase.from("notes").select("*").eq("type", "public").order("created_at", { ascending: false }),
      supabase.from("notes").select("*").eq("type", "private").eq("board_owner", user.nom).order("created_at", { ascending: false }),
    ]);
    const all = [...(pub.data || []), ...(priv.data || [])];
    setPublicNotes(pub.data || []);
    setPrivateNotes(priv.data || []);
    if (all.length > 0) loadNoteReactions(all.map(n => n.id));
    setLoading(false);
  }

  async function loadEvents() {
    const { data } = await supabase.from("evenements").select("*").order("date_debut");
    setEvents(data || []);
  }

  async function loadUsers() {
    try {
      const res = await api.getUsers();
      if (res.ok) setUsers(res.users || []);
    } catch {}
  }

  // ── Handlers notes ────────────────────────────────────────────────────────

  async function handleCreateNote(data) {
    const payload = {
      auteur_nom:  session.nom,
      contenu:     data.contenu,
      couleur:     data.couleur,
      type:        data.type,
      board_owner: data.type === "private" ? session.nom : "",
      assigned_to: data.type === "public" ? (data.assigned_to || "") : "",
      checkboxes:  data.checkboxes || [],
      pos_x:       Math.floor(Math.random() * 350) + 30,
      pos_y:       Math.floor(Math.random() * 250) + 30,
    };
    const { data: created, error } = await supabase.from("notes").insert([payload]).select().single();
    if (!error && created) {
      if (created.type === "public") setPublicNotes(p => [created, ...p]);
      else if (created.type === "private") setPrivateNotes(p => [created, ...p]);

      // Notifier tous les destinataires
      const assignees = (created?.assigned_to || "").split(",").map(s => s.trim()).filter(Boolean);
      assignees.filter(n => n !== session.nom).forEach(targetUser => {
        sendPushNotification({
          title: `📌 Note de ${session.nom}`,
          body: data.contenu.slice(0, 80),
          url: "/dashboard/organisation",
          targetUser,
          fromUser: session.nom,
          type: "note",
        });
      });
    }
  }

  async function handleUpdateNote(noteId, data) {
    const { data: updated, error } = await supabase.from("notes").update({
      contenu:     data.contenu,
      couleur:     data.couleur,
      assigned_to: data.assigned_to || "",
      checkboxes:  data.checkboxes  ?? [],
    }).eq("id", noteId).select().single();
    if (!error && updated) {
      const patchNote = n => n.id === noteId ? { ...n, ...updated } : n;
      if (updated.type === "public") setPublicNotes(p => p.map(patchNote));
      else setPrivateNotes(p => p.map(patchNote));
    }
    setEditingNote(null);
  }

  async function toggleCheckbox(noteId, taskId) {
    if (!session) return;
    const allNotes = [...publicNotes, ...privateNotes];
    const note = allNotes.find(n => n.id === noteId);
    if (!note) return;
    const canToggle = session.nom === note.auteur_nom || isManager(session.role);
    if (!canToggle) return;
    const updated = (note.checkboxes || []).map(cb =>
      cb.id === taskId ? { ...cb, checked: !cb.checked } : cb
    );
    const patchNote = n => n.id === noteId ? { ...n, checkboxes: updated } : n;
    if (note.type === "public")  setPublicNotes(p => p.map(patchNote));
    else                          setPrivateNotes(p => p.map(patchNote));
    await supabase.from("notes").update({ checkboxes: updated }).eq("id", noteId);
  }

  async function handleDeleteNote(note) {
    await supabase.from("notes").delete().eq("id", note.id);
    setPublicNotes(p => p.filter(x => x.id !== note.id));
    setPrivateNotes(p => p.filter(x => x.id !== note.id));
  }

  async function handleMoveNote(note, x, y) {
    await supabase.from("notes").update({ pos_x: x, pos_y: y }).eq("id", note.id);
  }

  // ── Réactions notes ───────────────────────────────────────────────────────

  async function toggleNoteReaction(noteId, type) {
    if (!session) return;
    const cur   = noteReactions[noteId] || { heart: [], fire: [], x: [], stop: [] };
    const hasMe = (cur[type] || []).includes(session.nom);

    if (hasMe) {
      await supabase.from("note_reactions").delete()
        .eq("note_id", noteId).eq("auteur_nom", session.nom).eq("type", type);
      setNoteReactions(prev => ({
        ...prev,
        [noteId]: { ...(prev[noteId] || {}), [type]: (prev[noteId]?.[type] || []).filter(n => n !== session.nom) }
      }));
    } else {
      const { data } = await supabase.from("note_reactions").insert({
        note_id: noteId, auteur_nom: session.nom, type,
      }).select().single();
      if (data) {
        setNoteReactions(prev => ({
          ...prev,
          [noteId]: { ...(prev[noteId] || { heart: [], fire: [], x: [], stop: [] }), [type]: [...(prev[noteId]?.[type] || []), session.nom] }
        }));
      }
    }
  }

  // ── Handlers événements ───────────────────────────────────────────────────

  async function handleCreateEvent(data) {
    const { data: created, error } = await supabase.from("evenements").insert([{
      auteur_nom:      session.nom,
      titre:           data.titre,
      description:     data.description || "",
      couleur:         data.couleur,
      date_debut:      data.date_debut,
      date_fin:        data.date_fin || data.date_debut,
      heure_debut:     data.heure_debut || "09:00",
      heure_fin:       data.heure_fin   || "10:00",
      recurrence:      data.recurrence,
      recurrence_data: data.recurrence_data || {},
      terminee:        false,
    }]).select().single();
    if (!error && created) setEvents(p => [...p, created]);
    setShowNewEvent(null);
  }

  async function handleDeleteEvent(id) {
    await supabase.from("evenements").delete().eq("id", id);
    setEvents(p => p.filter(e => e.id !== id));
  }

  async function handleToggleTerminee(id, value, dateStr) {
    const ev = events.find(e => e.id === id);
    if (!ev) return;
    if (ev.recurrence === "aucune") {
      // Événement unique : champ terminee classique
      await supabase.from("evenements").update({ terminee: value }).eq("id", id);
      setEvents(p => p.map(e => e.id === id ? { ...e, terminee: value } : e));
    } else {
      // Événement récurrent : complétion par date uniquement
      const newCompletions = { ...(ev.completions || {}), [dateStr]: value };
      await supabase.from("evenements").update({ completions: newCompletions }).eq("id", id);
      setEvents(p => p.map(e => e.id === id ? { ...e, completions: newCompletions } : e));
    }
  }

  async function handleMoveEvent(id, heure_debut, heure_fin) {
    await supabase.from("evenements").update({ heure_debut, heure_fin }).eq("id", id);
    setEvents(p => p.map(e => e.id === id ? { ...e, heure_debut, heure_fin } : e));
  }

  if (!session) return (
    <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Chargement...</div>
  );

  const manager = isManager(session.role);

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 112px)" }}>
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100 bg-white flex-shrink-0">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Organisation</h1>
          <p className="text-xs text-gray-400">Board public · Notes privées{manager ? " · Agenda" : ""}</p>
        </div>
        <div className="flex gap-1">
          <TabBtn active={tab === "board"}  onClick={() => setTab("board")}>📌 Board</TabBtn>
          {manager && <TabBtn active={tab === "agenda"} onClick={() => setTab("agenda")}>📅 Agenda</TabBtn>}
        </div>
      </div>

      {/* ── Board tab ── */}
      {tab === "board" && (
        <div className="flex flex-col flex-1 overflow-hidden min-h-0">
          {/* Sélecteur onglets mobile uniquement */}
          <div className="md:hidden flex border-b border-gray-100 bg-white flex-shrink-0">
            <button onClick={() => setMobileBoard("public")}
              className={`flex-1 py-2.5 text-sm font-semibold transition-colors border-b-2
                ${mobileBoard === "public" ? "border-indigo-500 text-indigo-600" : "border-transparent text-gray-500"}`}>
              📌 Board Public <span className="text-xs opacity-60">({publicNotes.length})</span>
            </button>
            <button onClick={() => setMobileBoard("private")}
              className={`flex-1 py-2.5 text-sm font-semibold transition-colors border-b-2
                ${mobileBoard === "private" ? "border-indigo-500 text-indigo-600" : "border-transparent text-gray-500"}`}>
              🔒 Mes notes <span className="text-xs opacity-60">({privateNotes.length})</span>
            </button>
          </div>
          <div className="flex flex-1 overflow-hidden min-h-0">
            {/* Board public */}
            <div className={`flex-1 min-w-0 ${mobileBoard !== "public" ? "hidden md:flex" : "flex"} flex-col`}>
              <NotesBoard
                title="📌 Board Public"
                notes={publicNotes}
                session={session}
                noteReactions={noteReactions}
                onAdd={() => setShowNewPublic(true)}
                onDelete={handleDeleteNote}
                onMove={handleMoveNote}
                onEdit={note => setEditingNote(note)}
                onToggleReaction={toggleNoteReaction}
                onToggleCheckbox={toggleCheckbox}
              />
            </div>
            <div className="hidden md:block w-px bg-gray-200 flex-shrink-0" />
            {/* Board privé */}
            <div className={`${mobileBoard !== "private" ? "hidden md:flex" : "flex"} flex-col md:w-80 flex-shrink-0 w-full`}>
              <NotesBoard
                title="🔒 Mes notes"
                notes={privateNotes}
                session={session}
                isNarrow
                noteReactions={noteReactions}
                onAdd={() => setShowNewPrivate(true)}
                onDelete={handleDeleteNote}
                onMove={handleMoveNote}
                onEdit={note => setEditingNote(note)}
                onToggleReaction={toggleNoteReaction}
                onToggleCheckbox={toggleCheckbox}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Agenda tab ── */}
      {tab === "agenda" && manager && (
        <div className="flex-1 overflow-auto p-6">
          <CalendarSection
            events={events}
            calDate={calDate}
            setCalDate={setCalDate}
            onAddEvent={d => setShowNewEvent(d || new Date())}
            onDeleteEvent={handleDeleteEvent}
            onToggleTerminee={handleToggleTerminee}
            onMoveEvent={handleMoveEvent}
          />
        </div>
      )}

      {/* ── Modals ── */}
      {showNewPublic && (
        <NoteModal type="public" session={session} users={users}
          onClose={() => setShowNewPublic(false)}
          onCreate={d => { handleCreateNote({ ...d, type: "public" }); setShowNewPublic(false); }}
        />
      )}
      {showNewPrivate && (
        <NoteModal type="private" session={session} users={[]}
          onClose={() => setShowNewPrivate(false)}
          onCreate={d => { handleCreateNote({ ...d, type: "private" }); setShowNewPrivate(false); }}
        />
      )}
      {editingNote && (
        <NoteModal
          type={editingNote.type}
          session={session}
          users={users}
          initialData={editingNote}
          onClose={() => setEditingNote(null)}
          onCreate={() => {}}
          onUpdate={d => handleUpdateNote(editingNote.id, d)}
        />
      )}
      {showNewEvent && (
        <EventModal initialDate={showNewEvent} onClose={() => setShowNewEvent(null)} onCreate={handleCreateEvent} />
      )}
    </div>
  );
}

// ── TabBtn ──────────────────────────────────────────────────────────────────

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        active ? "bg-indigo-600 text-white shadow-sm" : "text-gray-500 hover:bg-gray-100"
      }`}>
      {children}
    </button>
  );
}

// ── Note Reaction Bar ────────────────────────────────────────────────────────
// ❤️ = Bien reçu  |  🔥 = Effectué / terminé  |  ❌ = Problème / faute  |  ⛔ = Important

function NoteReactionBar({ noteId, reactions, currentUser, onToggle }) {
  const noteReacts = reactions[noteId] || { heart: [], fire: [], x: [], stop: [] };
  const [hoveredType, setHoveredType] = useState(null);

  return (
    <div className="flex items-center gap-0.5" onMouseDown={e => e.stopPropagation()}>
      {NOTE_REACTION_TYPES.map(type => {
        const users = noteReacts[type] || [];
        const hasMe = users.includes(currentUser);
        return (
          <div key={type} className="relative">
            <button
              type="button"
              onClick={e => { e.stopPropagation(); e.preventDefault(); onToggle(noteId, type); }}
              onMouseEnter={() => setHoveredType(type)}
              onMouseLeave={() => setHoveredType(null)}
              title={`${NOTE_REACTION_LABELS[type]}${users.length > 0 ? ": " + users.join(", ") : ""}`}
              className={`flex items-center gap-0.5 rounded-full text-[10px] px-1 py-0 transition
                ${hasMe
                  ? "bg-black/25 font-bold"
                  : users.length > 0
                    ? "bg-black/10 text-black/60 hover:bg-black/20"
                    : "text-black/25 hover:bg-black/10 hover:text-black/50"
                }`}
              style={{ color: hasMe ? "rgba(0,0,0,0.8)" : undefined }}>
              <span>{NOTE_REACTION_EMOJIS[type]}</span>
              {users.length > 0 && <span className="font-semibold">{users.length}</span>}
            </button>
            {hoveredType === type && users.length > 0 && (
              <div className="absolute z-50 bottom-full mb-1 left-0 bg-gray-900 text-white text-[9px] rounded-lg px-2 py-1.5 whitespace-nowrap shadow-lg pointer-events-none">
                <div className="font-semibold mb-0.5">{NOTE_REACTION_EMOJIS[type]} {NOTE_REACTION_LABELS[type]}</div>
                {users.map(name => <div key={name} className="opacity-75">{name}</div>)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Notes Board ─────────────────────────────────────────────────────────────

const NOTE_W = 185;
const NOTE_H = 200; // légèrement augmenté pour loger les réactions

function NotesBoard({ title, notes, session, isNarrow, onAdd, onDelete, onMove, onEdit, noteReactions, onToggleReaction, onToggleCheckbox }) {
  const CANVAS_W = isNarrow ? 700 : 1400;
  const CANVAS_H = 900;
  const MAX_X = CANVAS_W - NOTE_W - 10;
  const MAX_Y = CANVAS_H - NOTE_H - 10;

  const header = (
    <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100 bg-white flex-shrink-0 gap-2">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-sm font-semibold text-gray-800 truncate">{title}</span>
        <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">
          {notes.length}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <button onClick={onAdd}
          className="text-xs bg-gray-900 hover:bg-gray-700 text-white px-2.5 py-1 rounded-lg font-medium transition-colors flex-shrink-0 whitespace-nowrap">
          + Note
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col min-h-0 flex-1">
      {header}

      {/* ── Vue LISTE (mobile uniquement) ── */}
      <div className="md:hidden flex-1 overflow-y-auto p-3 space-y-2"
        style={{ backgroundColor: "#f8fafc" }}>
        {notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 opacity-40">
            <span className="text-4xl mb-2">📌</span>
            <p className="text-sm text-gray-500 font-medium">Aucune note</p>
            <p className="text-xs text-gray-400 mt-1">Appuyez sur &quot;+ Note&quot; pour commencer</p>
          </div>
        ) : notes.map(note => {
          const canDelete = session.nom === note.auteur_nom || isManager(session.role);
          const canEdit   = session.nom === note.auteur_nom || isManager(session.role);
          const isAssigned = note.type === "public" && (note.assigned_to || "").split(",").map(s => s.trim()).includes(session.nom);
          return (
            <div key={note.id}
              className="rounded-2xl p-3 shadow-sm"
              style={{
                backgroundColor: note.couleur || "#fef08a",
                outline: isAssigned ? "2.5px solid #6366f1" : "none",
                outlineOffset: 2,
              }}>
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <span className="text-[11px] font-bold opacity-50 leading-none">{note.auteur_nom}</span>
                <div className="flex items-center gap-1">
                  {canEdit && (
                    <button
                      onClick={() => onEdit(note)}
                      className="w-6 h-6 rounded-full flex items-center justify-center text-xs flex-shrink-0 transition-colors"
                      style={{ background: "rgba(0,0,0,0.10)", color: "rgba(0,0,0,0.5)" }}
                      title="Modifier la note">
                      ✎
                    </button>
                  )}
                  {canDelete && (
                    <button
                      onClick={() => onDelete(note)}
                      className="w-6 h-6 rounded-full flex items-center justify-center text-xs flex-shrink-0"
                      style={{ background: "rgba(0,0,0,0.12)", color: "rgba(0,0,0,0.5)" }}>
                      ✕
                    </button>
                  )}
                </div>
              </div>
              <p className="text-sm leading-relaxed break-words whitespace-pre-wrap"
                style={{ color: "rgba(0,0,0,0.80)" }}>
                {note.contenu}
              </p>
              {/* Tâches cochables */}
              {(note.checkboxes || []).length > 0 && (
                <div className="mt-2 space-y-1">
                  {(note.checkboxes || []).map(cb => {
                    const canToggle = session.nom === note.auteur_nom || isManager(session.role);
                    return (
                      <div key={cb.id}
                        className={`flex items-start gap-2 ${canToggle ? "cursor-pointer" : "cursor-default"}`}
                        onClick={() => canToggle && onToggleCheckbox(note.id, cb.id)}>
                        <span className="text-sm mt-0.5 flex-shrink-0 select-none">
                          {cb.checked ? "✅" : "☐"}
                        </span>
                        <span className={`text-sm leading-snug ${cb.checked ? "line-through text-gray-400" : ""}`}>
                          {cb.text}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              {/* Réactions emoji */}
              <div className="mt-2">
                <NoteReactionBar
                  noteId={note.id}
                  reactions={noteReactions}
                  currentUser={session.nom}
                  onToggle={onToggleReaction}
                />
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="text-[10px] opacity-30">{fmtDate(note.created_at)}</span>
                {note.assigned_to && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                    style={{ background: "rgba(0,0,0,0.10)", color: "rgba(0,0,0,0.55)" }}>
                    ✉ {note.assigned_to.split(",").map(s => s.trim()).filter(Boolean).join(", ")}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Vue CANVAS (desktop uniquement) ── */}
      <div className="hidden md:flex flex-1 overflow-auto"
        style={{
          background: "radial-gradient(circle, #cbd5e1 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          backgroundColor: "#f8fafc",
        }}>
        <div className="relative" style={{ width: CANVAS_W, height: CANVAS_H }}>
          {notes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center opacity-40">
                <div className="text-5xl mb-3">📌</div>
                <p className="text-sm text-gray-500 font-medium">Aucune note</p>
                <p className="text-xs text-gray-400 mt-1">Cliquez sur &quot;+ Note&quot; pour commencer</p>
              </div>
            </div>
          )}
          {notes.map(note => (
            <StickyNote
              key={note.id}
              note={note}
              session={session}
              maxX={MAX_X}
              maxY={MAX_Y}
              onDelete={onDelete}
              onMove={onMove}
              onEdit={onEdit}
              noteReactions={noteReactions}
              onToggleReaction={onToggleReaction}
              onToggleCheckbox={onToggleCheckbox}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Sticky Note ─────────────────────────────────────────────────────────────

function StickyNote({ note, session, maxX, maxY, onDelete, onMove, onEdit, noteReactions, onToggleReaction, onToggleCheckbox }) {
  const clamp = (x, y) => ({
    x: Math.max(0, Math.min(maxX || 1200, x)),
    y: Math.max(0, Math.min(maxY || 700,  y)),
  });

  const [pos, setPos]         = useState(() => clamp(note.pos_x || 20, note.pos_y || 20));
  const [hovered, setHovered] = useState(false);
  const posRef     = useRef(pos);
  const isDragging = useRef(false);
  const dragStart  = useRef({ mx: 0, my: 0, nx: 0, ny: 0 });

  const canDelete = session.nom === note.auteur_nom || isManager(session.role);
  const canEdit   = session.nom === note.auteur_nom || isManager(session.role);
  const isAssignedToMe = note.type === "public" && (note.assigned_to || "").split(",").map(s => s.trim()).includes(session.nom);

  useEffect(() => {
    if (!isDragging.current) {
      const np = clamp(note.pos_x || 20, note.pos_y || 20);
      setPos(np);
      posRef.current = np;
    }
  }, [note.pos_x, note.pos_y]); // eslint-disable-line

  const rotation = useMemo(() => {
    const code = note.id ? note.id.charCodeAt(0) + note.id.charCodeAt(note.id.length - 1) : 0;
    return ((code % 9) - 4) * 0.6;
  }, [note.id]);

  function handleMouseDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    isDragging.current = true;
    dragStart.current = { mx: e.clientX, my: e.clientY, nx: posRef.current.x, ny: posRef.current.y };

    function handleMouseMove(ev) {
      if (!isDragging.current) return;
      const np = clamp(
        dragStart.current.nx + ev.clientX - dragStart.current.mx,
        dragStart.current.ny + ev.clientY - dragStart.current.my
      );
      posRef.current = np;
      setPos(np);
    }
    function handleMouseUp(ev) {
      if (!isDragging.current) return;
      isDragging.current = false;
      const np = clamp(
        dragStart.current.nx + ev.clientX - dragStart.current.mx,
        dragStart.current.ny + ev.clientY - dragStart.current.my
      );
      posRef.current = np;
      setPos(np);
      onMove(note, np.x, np.y);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    }
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }

  return (
    <div
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="absolute select-none cursor-grab active:cursor-grabbing"
      style={{
        left: pos.x,
        top:  pos.y,
        width: 180,
        minHeight: 180,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        backgroundColor: note.couleur || "#fef08a",
        transform: `rotate(${rotation}deg)${hovered ? " scale(1.04)" : ""}`,
        transition: isDragging.current ? "none" : "transform 0.15s ease, box-shadow 0.15s ease",
        boxShadow: hovered
          ? "0 12px 32px rgba(0,0,0,0.18), 0 3px 10px rgba(0,0,0,0.10)"
          : "0 3px 12px rgba(0,0,0,0.09), 0 1px 4px rgba(0,0,0,0.06)",
        borderRadius: 3,
        zIndex: hovered || isDragging.current ? 100 : 10,
        outline: isAssignedToMe ? "2.5px solid #6366f1" : "none",
        outlineOffset: 3,
      }}
    >
      {/* Top grip bar */}
      <div className="px-2.5 pt-2 pb-1.5 flex items-center justify-between"
        style={{ borderBottom: "1px solid rgba(0,0,0,0.07)" }}>
        <span className="text-[10px] font-bold truncate max-w-[100px]"
          style={{ color: "rgba(0,0,0,0.45)" }}>
          {note.auteur_nom}
        </span>
        <div className="flex items-center gap-0.5">
          {/* Bouton modifier */}
          {canEdit && hovered && (
            <button
              onMouseDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); onEdit(note); }}
              className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] flex-shrink-0 transition-colors"
              style={{ background: "rgba(0,0,0,0.10)", color: "rgba(0,0,0,0.5)" }}
              title="Modifier"
              onMouseEnter={e => { e.currentTarget.style.background = "#6366f1"; e.currentTarget.style.color = "#fff"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(0,0,0,0.10)"; e.currentTarget.style.color = "rgba(0,0,0,0.5)"; }}>
              ✎
            </button>
          )}
          {/* Bouton supprimer */}
          {canDelete && hovered && (
            <button
              onMouseDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); onDelete(note); }}
              className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] flex-shrink-0 ml-0.5 transition-colors"
              style={{ background: "rgba(0,0,0,0.10)", color: "rgba(0,0,0,0.4)" }}
              onMouseEnter={e => { e.currentTarget.style.background = "#ef4444"; e.currentTarget.style.color = "#fff"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(0,0,0,0.10)"; e.currentTarget.style.color = "rgba(0,0,0,0.4)"; }}
            >✕</button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="px-2.5 py-2 text-xs leading-relaxed break-words whitespace-pre-wrap overflow-hidden"
        style={{ color: "rgba(0,0,0,0.78)", maxHeight: (note.checkboxes || []).length > 0 ? 60 : 90 }}>
        {note.contenu}
      </div>

      {/* Tâches cochables (sticky) */}
      {(note.checkboxes || []).length > 0 && (
        <div className="px-2.5 pb-1 space-y-0.5 flex-shrink-0 overflow-hidden"
          onMouseDown={e => e.stopPropagation()}>
          {(note.checkboxes || []).slice(0, 3).map(cb => {
            const canToggle = session.nom === note.auteur_nom || isManager(session.role);
            return (
              <div key={cb.id}
                className={`flex items-center gap-1 ${canToggle ? "cursor-pointer" : "cursor-default"}`}
                onClick={e => { e.stopPropagation(); canToggle && onToggleCheckbox(note.id, cb.id); }}>
                <span className="text-[11px] flex-shrink-0 select-none leading-none">
                  {cb.checked ? "✅" : "☐"}
                </span>
                <span className={`text-[9px] leading-snug truncate ${cb.checked ? "line-through opacity-40" : ""}`}>
                  {cb.text}
                </span>
              </div>
            );
          })}
          {(note.checkboxes || []).length > 3 && (
            <span className="text-[8px] opacity-35 pl-4">
              +{(note.checkboxes || []).length - 3} autre{(note.checkboxes || []).length - 3 > 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}

      {/* Footer : réactions + date + assigned */}
      <div className="px-2 pb-2 flex flex-col gap-0.5 flex-shrink-0"
        style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
        <NoteReactionBar
          noteId={note.id}
          reactions={noteReactions}
          currentUser={session.nom}
          onToggle={onToggleReaction}
        />
        <div className="flex items-center justify-between gap-1">
          <span className="text-[9px]" style={{ color: "rgba(0,0,0,0.28)" }}>
            {fmtDate(note.created_at)}
          </span>
          {note.assigned_to && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 max-w-[90px] truncate"
              style={{ background: "rgba(0,0,0,0.09)", color: "rgba(0,0,0,0.55)" }}
              title={note.assigned_to}>
              ✉ {note.assigned_to.split(",").map(s => s.trim()).filter(Boolean).join(", ")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Note Modal (création + édition) ────────────────────────────────────────

function NoteModal({ type, session, users, onClose, onCreate, initialData, onUpdate }) {
  const isEdit = !!initialData;

  const [contenu,    setContenu]    = useState(initialData?.contenu    || "");
  const [couleur,    setCouleur]    = useState(initialData?.couleur    || COULEURS_NOTES[0]);
  const parseAssigned = raw => (raw || "").split(",").map(s => s.trim()).filter(Boolean);
  const [assignedTo, setAssignedTo] = useState(parseAssigned(initialData?.assigned_to));
  const [taskList,   setTaskList]   = useState(initialData?.checkboxes || []);
  const [newTask,    setNewTask]    = useState("");

  function toggleAssigned(nom) {
    setAssignedTo(prev =>
      prev.includes(nom) ? prev.filter(n => n !== nom) : [...prev, nom]
    );
  }

  function addTask() {
    if (!newTask.trim()) return;
    setTaskList(prev => [...prev, {
      id:       crypto.randomUUID(),
      text:     newTask.trim(),
      checked:  false,
      added_by: session.nom,
    }]);
    setNewTask("");
  }

  function removeTask(id) { setTaskList(prev => prev.filter(t => t.id !== id)); }

  function handleSubmit(e) {
    e.preventDefault();
    if (!contenu.trim()) return;
    const assignedStr = assignedTo.join(", ");
    if (isEdit) {
      onUpdate({ contenu: contenu.trim(), couleur, assigned_to: assignedStr, checkboxes: taskList });
    } else {
      onCreate({ contenu: contenu.trim(), couleur, assigned_to: assignedStr, checkboxes: taskList });
    }
  }

  const titleText = isEdit
    ? "Modifier la note"
    : type === "public" ? "Nouvelle note publique" : "Note privée";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">{titleText}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Couleur */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-2">Couleur</label>
            <div className="flex gap-2 flex-wrap">
              {COULEURS_NOTES.map(c => (
                <button key={c} type="button" onClick={() => setCouleur(c)}
                  className="w-8 h-8 rounded-xl transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c,
                    border: couleur === c ? "2.5px solid #6366f1" : "2px solid transparent",
                    boxShadow: couleur === c ? "0 0 0 1px #6366f1" : "0 1px 3px rgba(0,0,0,0.12)",
                  }} />
              ))}
            </div>
          </div>

          {/* Contenu avec preview couleur */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Contenu *</label>
            <div className="rounded-xl p-3 min-h-[120px]" style={{ backgroundColor: couleur }}>
              <textarea
                value={contenu} onChange={e => setContenu(e.target.value)}
                placeholder="Écrivez votre note..." rows={4} autoFocus
                className="w-full bg-transparent text-sm text-gray-800 resize-none focus:outline-none placeholder-gray-500/50 leading-relaxed"
              />
            </div>
          </div>

          {/* Assigner à plusieurs personnes (public uniquement) */}
          {(type === "public") && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                Assigner à
                {assignedTo.length > 0 && (
                  <span className="ml-2 text-indigo-600 font-semibold">{assignedTo.length} sélectionné{assignedTo.length > 1 ? "s" : ""}</span>
                )}
              </label>
              {users.length > 0 ? (
                <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100 max-h-40 overflow-y-auto">
                  {users.filter(u => u.nom !== session.nom).map(u => {
                    const checked = assignedTo.includes(u.nom);
                    return (
                      <label key={u.nom}
                        className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors
                          ${checked ? "bg-indigo-50" : "hover:bg-gray-50"}`}>
                        <input type="checkbox" checked={checked} onChange={() => toggleAssigned(u.nom)}
                          className="rounded accent-indigo-600" />
                        <span className="text-sm font-medium text-gray-800">{u.nom}</span>
                        <span className="text-xs text-gray-400 ml-auto">{u.role}</span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <input type="text" value={assignedTo.join(", ")}
                  onChange={e => setAssignedTo(e.target.value.split(",").map(s => s.trim()).filter(Boolean))}
                  placeholder="Noms séparés par des virgules (optionnel)"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              )}
            </div>
          )}

          {/* ── Tâches cochables ── */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Tâches
              {taskList.length > 0 && (
                <span className="ml-2 text-gray-400 font-normal">
                  {taskList.filter(t => t.checked).length}/{taskList.length} ✅
                </span>
              )}
            </label>
            {taskList.length > 0 && (
              <div className="space-y-1 mb-2 max-h-36 overflow-y-auto">
                {taskList.map(t => (
                  <div key={t.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-2 py-1.5">
                    <span className="text-sm flex-shrink-0">{t.checked ? "✅" : "☐"}</span>
                    <span className={`text-sm flex-1 leading-snug ${t.checked ? "line-through text-gray-400" : "text-gray-700"}`}>
                      {t.text}
                    </span>
                    <button type="button" onClick={() => removeTask(t.id)}
                      className="text-gray-300 hover:text-red-400 text-xs transition-colors flex-shrink-0">✕</button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={newTask}
                onChange={e => setNewTask(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTask(); } }}
                placeholder="Nouvelle tâche… (Entrée pour ajouter)"
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <button type="button" onClick={addTask}
                disabled={!newTask.trim()}
                className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-30 transition-colors">
                +
              </button>
            </div>
          </div>

          {/* Légende emojis */}
          <div className="bg-gray-50 rounded-xl px-3 py-2 text-[11px] text-gray-500">
            <span className="font-semibold block mb-0.5">Signification des réactions :</span>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
              <span>❤️ Bien reçu</span>
              <span>🔥 Effectué / terminé</span>
              <span>❌ Problème / faute</span>
              <span>⛔ Important</span>
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 font-medium transition-colors">
              Annuler
            </button>
            <button type="submit" disabled={!contenu.trim()}
              className="flex-1 py-2.5 rounded-xl bg-gray-900 hover:bg-gray-700 text-white text-sm font-semibold disabled:opacity-40 transition-colors">
              {isEdit ? "Enregistrer" : "Créer la note"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Calendar Section ────────────────────────────────────────────────────────

function CalendarSection({ events, calDate, setCalDate, onAddEvent, onDeleteEvent, onToggleTerminee, onMoveEvent }) {
  const [calView, setCalView]     = useState("month"); // "month" | "day"
  const [dayDate, setDayDate]     = useState(new Date());

  const year  = calDate.getFullYear();
  const month = calDate.getMonth();
  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev  = new Date(year, month, 0).getDate();

  const today = new Date();
  const isToday = d => today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;

  function toDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }

  function getEventsForDate(date) {
    const dateStr = toDateStr(date);
    return events.filter(ev => {
      const debut = new Date(ev.date_debut + "T00:00:00");
      const fin   = ev.date_fin ? new Date(ev.date_fin + "T23:59:59") : debut;
      switch (ev.recurrence) {
        case "quotidienne":    return date >= debut;
        case "routine":        return date >= debut && date.getDay() === debut.getDay();
        case "mensuelle":      return date >= debut && date.getDate() === debut.getDate();
        case "dates_precises": return (ev.recurrence_data?.dates || []).includes(dateStr);
        default:               return date >= debut && date <= fin;
      }
    });
  }

  function getEventsForDay(day) {
    return getEventsForDate(new Date(year, month, day));
  }

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push({ day: daysInPrev - firstDay + 1 + i, current: false });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, current: true });
  const rem = 42 - cells.length;
  for (let i = 1; i <= rem; i++) cells.push({ day: i, current: false });

  function handleDayClick(date) {
    setDayDate(date);
    setCalView("day");
  }

  const dayEvents = getEventsForDate(dayDate);

  const fmtDayHeader = d => d.toLocaleDateString("fr-DZ", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });

  return (
    <div className="space-y-4 max-w-5xl">
      {/* ── Controls ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          {calView === "month" ? (
            <>
              <button onClick={() => setCalDate(new Date(year, month - 1, 1))}
                className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-700 font-bold text-xl transition-colors">‹</button>
              <h2 className="text-lg font-bold text-gray-900 w-52 text-center">{MOIS_FR[month]} {year}</h2>
              <button onClick={() => setCalDate(new Date(year, month + 1, 1))}
                className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-700 font-bold text-xl transition-colors">›</button>
            </>
          ) : (
            <>
              <button onClick={() => setDayDate(d => { const nd = new Date(d); nd.setDate(nd.getDate()-1); return nd; })}
                className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-700 font-bold text-xl transition-colors">‹</button>
              <h2 className="text-base font-bold text-gray-900 text-center capitalize" style={{ minWidth: 220 }}>
                {fmtDayHeader(dayDate)}
              </h2>
              <button onClick={() => setDayDate(d => { const nd = new Date(d); nd.setDate(nd.getDate()+1); return nd; })}
                className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-700 font-bold text-xl transition-colors">›</button>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 rounded-xl p-0.5">
            <button onClick={() => setCalView("month")}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${calView === "month" ? "bg-white shadow-sm text-gray-800" : "text-gray-500 hover:text-gray-700"}`}>
              📅 Mois
            </button>
            <button onClick={() => { setDayDate(new Date()); setCalView("day"); }}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${calView === "day" ? "bg-white shadow-sm text-gray-800" : "text-gray-500 hover:text-gray-700"}`}>
              📋 Jour
            </button>
          </div>
          <button onClick={() => onAddEvent(calView === "day" ? dayDate : new Date(year, month, today.getDate()))}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors shadow-sm">
            + Événement
          </button>
        </div>
      </div>

      {/* ── Vue Mois ── */}
      {calView === "month" && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="grid grid-cols-7 border-b border-gray-100">
            {JOURS_FR.map(j => (
              <div key={j} className="text-center text-[10px] font-semibold text-gray-400 uppercase py-2.5">{j}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((cell, i) => {
              const dayEvts = cell.current ? getEventsForDay(cell.day) : [];
              return (
                <div key={i}
                  onClick={() => cell.current && handleDayClick(new Date(year, month, cell.day))}
                  className={`min-h-[90px] p-1.5 border-r border-b border-gray-50 transition-colors ${
                    cell.current ? "cursor-pointer hover:bg-indigo-50/40" : "bg-gray-50/50 cursor-default"
                  }`}>
                  <span className={`text-xs font-semibold inline-flex items-center justify-center w-6 h-6 rounded-full mb-1 ${
                    cell.current && isToday(cell.day) ? "bg-indigo-600 text-white"
                    : cell.current ? "text-gray-700" : "text-gray-300"
                  }`}>
                    {cell.day}
                  </span>
                  <div className="space-y-0.5">
                    {dayEvts.slice(0, 3).map(ev => (
                      <EventBar key={ev.id + "-" + cell.day} event={ev} onDelete={onDeleteEvent}
                        dateStr={toDateStr(new Date(year, month, cell.day))} />
                    ))}
                    {dayEvts.length > 3 && (
                      <span className="text-[9px] text-gray-400 pl-1.5">+{dayEvts.length - 3}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Vue Jour ── */}
      {calView === "day" && (
        <DayTimeGrid
          events={dayEvents}
          date={dayDate}
          onAddEvent={onAddEvent}
          onDelete={onDeleteEvent}
          onToggleTerminee={onToggleTerminee}
          onMoveEvent={onMoveEvent}
        />
      )}

      {/* ── Légende ── */}
      {events.length > 0 && calView === "month" && (
        <div className="flex flex-wrap gap-2">
          {events.slice(0, 8).map(ev => (
            <div key={ev.id} className="flex items-center gap-1.5 text-xs text-gray-600">
              <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: ev.couleur }} />
              <span className="truncate max-w-[120px]">{ev.titre}</span>
              {ev.recurrence !== "aucune" && (
                <span className="text-[10px] bg-gray-100 px-1 rounded text-gray-400">↺</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Day Time Grid ─────────────────────────────────────────────────────────────

const HOUR_PX   = 64;
const DAY_START = 6;
const DAY_END   = 23;
const TOTAL_H   = (DAY_END - DAY_START) * HOUR_PX;

function timeToMinutes(t = "09:00") {
  const [h, m] = (t || "09:00").split(":").map(Number);
  return h * 60 + (m || 0);
}
function minutesToTime(min) {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
}
function snapTo15(min) { return Math.round(min / 15) * 15; }

function DayTimeGrid({ events, date, onAddEvent, onDelete, onToggleTerminee, onMoveEvent }) {
  const gridRef = useRef(null);
  const [dragging, setDragging] = useState(null);
  const [localPos, setLocalPos] = useState({});

  const startHour = DAY_START;
  const dateStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;

  function eventTop(ev) {
    const start = timeToMinutes(ev.heure_debut || "09:00");
    return ((start - startHour * 60) / 60) * HOUR_PX;
  }
  function eventHeight(ev) {
    const start = timeToMinutes(ev.heure_debut || "09:00");
    const end   = timeToMinutes(ev.heure_fin   || "10:00");
    const dur   = Math.max(end - start, 15);
    return (dur / 60) * HOUR_PX;
  }

  function onMouseDownMove(e, ev) {
    e.preventDefault();
    const top = eventTop(ev);
    const height = eventHeight(ev);
    setDragging({ id: ev.id, type: "move", startY: e.clientY, startTop: top, startHeight: height,
      origStart: timeToMinutes(ev.heure_debut || "09:00"),
      origEnd:   timeToMinutes(ev.heure_fin   || "10:00") });
    setLocalPos(p => ({ ...p, [ev.id]: { top, height } }));
  }
  function onMouseDownResize(e, ev) {
    e.preventDefault();
    e.stopPropagation();
    const top = eventTop(ev);
    const height = eventHeight(ev);
    setDragging({ id: ev.id, type: "resize", startY: e.clientY, startTop: top, startHeight: height,
      origStart: timeToMinutes(ev.heure_debut || "09:00"),
      origEnd:   timeToMinutes(ev.heure_fin   || "10:00") });
    setLocalPos(p => ({ ...p, [ev.id]: { top, height } }));
  }

  useEffect(() => {
    if (!dragging) return;
    function onMouseMove(e) {
      const dy = e.clientY - dragging.startY;
      if (dragging.type === "move") {
        const newTop = Math.max(0, Math.min(TOTAL_H - dragging.startHeight, dragging.startTop + dy));
        setLocalPos(p => ({ ...p, [dragging.id]: { top: newTop, height: dragging.startHeight } }));
      } else {
        const newHeight = Math.max(HOUR_PX / 4, dragging.startHeight + dy);
        setLocalPos(p => ({ ...p, [dragging.id]: { top: dragging.startTop, height: newHeight } }));
      }
    }
    function onMouseUp() {
      const pos = localPos[dragging.id];
      if (pos) {
        if (dragging.type === "move") {
          const newStartMin = snapTo15(Math.round((pos.top / HOUR_PX) * 60) + startHour * 60);
          const dur = dragging.origEnd - dragging.origStart;
          onMoveEvent(dragging.id, minutesToTime(newStartMin), minutesToTime(Math.min(newStartMin + dur, 23*60+45)));
        } else {
          const newEndMin = snapTo15(Math.round(((pos.top + pos.height) / HOUR_PX) * 60) + startHour * 60);
          onMoveEvent(dragging.id, minutesToTime(dragging.origStart), minutesToTime(Math.min(newEndMin, 23*60+45)));
        }
      }
      setDragging(null);
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => { window.removeEventListener("mousemove", onMouseMove); window.removeEventListener("mouseup", onMouseUp); };
  }, [dragging, localPos, onMoveEvent, startHour]);

  const hours = Array.from({ length: DAY_END - DAY_START }, (_, i) => DAY_START + i);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="flex items-center justify-end px-4 pt-3 pb-2 border-b border-gray-100">
        <button onClick={() => onAddEvent(date)}
          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1">
          <span className="text-sm">+</span> Ajouter un événement
        </button>
      </div>

      <div className="flex overflow-auto" style={{ maxHeight: "calc(100vh - 320px)" }}>
        <div className="flex-shrink-0 w-14 relative" style={{ height: TOTAL_H }}>
          {hours.map(h => (
            <div key={h} className="absolute flex items-start justify-end pr-2"
              style={{ top: (h - DAY_START) * HOUR_PX - 8, height: HOUR_PX, width: "100%" }}>
              <span className="text-[10px] text-gray-400 font-medium">{String(h).padStart(2,"0")}:00</span>
            </div>
          ))}
        </div>

        <div ref={gridRef} className="flex-1 relative border-l border-gray-100 select-none"
          style={{ height: TOTAL_H }}>
          {hours.map(h => (
            <div key={h} className="absolute left-0 right-0 border-t border-gray-100"
              style={{ top: (h - DAY_START) * HOUR_PX }}>
              <div className="absolute left-0 right-0 border-t border-gray-50"
                style={{ top: HOUR_PX / 2 }} />
            </div>
          ))}

          {events.map(ev => {
            const pos = localPos[ev.id];
            const top    = pos ? pos.top    : eventTop(ev);
            const height = pos ? pos.height : eventHeight(ev);
            const isDraggingThis = dragging?.id === ev.id;
            const startStr = ev.heure_debut || "09:00";
            const endStr   = ev.heure_fin   || "10:00";
            const done = isEventDone(ev, dateStr);

            return (
              <div key={ev.id}
                className={`absolute left-1 right-2 rounded-xl overflow-hidden shadow-sm group
                  ${isDraggingThis ? "opacity-90 shadow-lg z-20 ring-2 ring-indigo-400" : "z-10"}
                  ${done ? "opacity-50" : ""}`}
                style={{ top, height, backgroundColor: (ev.couleur || "#6366f1") + "22",
                  borderLeft: `3px solid ${ev.couleur || "#6366f1"}` }}
                onMouseDown={e => { if (e.target.closest("[data-resize]") || e.target.closest("[data-check]") || e.target.closest("[data-del]")) return; onMouseDownMove(e, ev); }}>

                <div className="px-2 pt-1 pb-5 h-full flex flex-col overflow-hidden cursor-grab active:cursor-grabbing">
                  <div className="flex items-start gap-1.5 min-w-0">
                    <button data-check
                      onClick={e => { e.stopPropagation(); onToggleTerminee(ev.id, !done, dateStr); }}
                      className="flex-shrink-0 mt-0.5 w-3.5 h-3.5 rounded-sm border border-current flex items-center justify-center transition-colors"
                      style={{ color: ev.couleur || "#6366f1", backgroundColor: done ? ev.couleur : "transparent" }}>
                      {done && <span className="text-white text-[8px] leading-none font-bold">✓</span>}
                    </button>
                    <span className={`font-semibold text-xs leading-tight truncate flex-1
                      ${done ? "line-through text-gray-400" : "text-gray-800"}`}>
                      {ev.titre}
                    </span>
                    <button data-del onClick={e => { e.stopPropagation(); onDelete(ev.id); }}
                      className="opacity-0 group-hover:opacity-100 flex-shrink-0 text-gray-400 hover:text-red-500 text-[10px] leading-none transition-all">
                      ✕
                    </button>
                  </div>
                  {height > 40 && (
                    <span className="text-[9px] text-gray-500 mt-0.5 leading-none pl-5">
                      {startStr} – {endStr}
                    </span>
                  )}
                  {height > 56 && ev.description && (
                    <p className="text-[9px] text-gray-400 mt-1 pl-5 line-clamp-2">{ev.description}</p>
                  )}
                </div>

                <div data-resize onMouseDown={e => onMouseDownResize(e, ev)}
                  className="absolute bottom-0 left-0 right-0 h-2 cursor-s-resize flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="w-8 h-0.5 rounded-full bg-gray-400" />
                </div>
              </div>
            );
          })}

          {events.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-300">
              <div className="text-center">
                <span className="text-3xl block mb-2 opacity-40">📋</span>
                <p className="text-xs">Aucun événement ce jour</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Event Bar ───────────────────────────────────────────────────────────────

function EventBar({ event, onDelete, dateStr }) {
  const [hovered, setHovered] = useState(false);
  const done = isEventDone(event, dateStr || "");
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={e => e.stopPropagation()}
      className="flex items-center gap-1 rounded px-1.5 py-0.5 text-white text-[9px] font-semibold truncate"
      style={{
        backgroundColor: event.couleur || "#6366f1",
        opacity: done ? 0.5 : 1,
      }}
      title={`${event.titre}${event.description ? "\n" + event.description : ""}${event.recurrence !== "aucune" ? "\n↺ " + event.recurrence : ""}${done ? "\n✓ Terminé" : ""}`}
    >
      {done && <span className="flex-shrink-0 text-[8px]">✓</span>}
      <span className={`flex-1 truncate ${done ? "line-through opacity-80" : ""}`}>{event.titre}</span>
      {hovered && (
        <button
          onClick={e => { e.stopPropagation(); onDelete(event.id); }}
          className="w-3 h-3 rounded-full bg-white/30 hover:bg-white/70 flex items-center justify-center flex-shrink-0 text-[8px]">
          ✕
        </button>
      )}
    </div>
  );
}

// ── Event Modal ─────────────────────────────────────────────────────────────

function EventModal({ initialDate, onClose, onCreate }) {
  const toStr = d => d instanceof Date && !isNaN(d)
    ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`
    : new Date().toISOString().slice(0,10);

  const [form, setForm] = useState({
    titre: "", description: "",
    couleur: COULEURS_EVENTS[0],
    date_debut:   toStr(initialDate),
    date_fin:     toStr(initialDate),
    heure_debut:  "09:00",
    heure_fin:    "10:00",
    recurrence:   "aucune",
  });
  // Pour dates_precises : liste de date strings (une par input)
  const [datesList, setDatesList] = useState([toStr(initialDate)]);
  const [saving, setSaving] = useState(false);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  function addDate() { setDatesList(p => [...p, toStr(new Date())]); }
  function removeDate(i) { setDatesList(p => p.filter((_, idx) => idx !== i)); }
  function setDate(i, v) { setDatesList(p => p.map((d, idx) => idx === i ? v : d)); }

  // date_debut = la plus ancienne des dates saisies (pour le tri DB)
  const computedDateDebut = form.recurrence === "dates_precises"
    ? (datesList.filter(Boolean).sort()[0] || form.date_debut)
    : form.date_debut;

  const canSubmit = form.titre.trim() &&
    (form.recurrence !== "dates_precises" || datesList.filter(Boolean).length > 0);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    await onCreate({
      titre:           form.titre.trim(),
      description:     form.description,
      couleur:         form.couleur,
      date_debut:      computedDateDebut,
      date_fin:        form.recurrence === "aucune" ? form.date_fin : computedDateDebut,
      heure_debut:     form.heure_debut,
      heure_fin:       form.heure_fin,
      recurrence:      form.recurrence,
      recurrence_data: form.recurrence === "dates_precises"
        ? { dates: datesList.filter(Boolean).sort() }
        : {},
    });
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 className="font-bold text-gray-900">Nouvel événement</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Titre *</label>
            <input type="text" value={form.titre} onChange={e => set("titre", e.target.value)}
              placeholder="Réunion, formation, objectif..." required autoFocus
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-2">Couleur de la ligne</label>
            <div className="flex gap-2 flex-wrap">
              {COULEURS_EVENTS.map(c => (
                <button key={c} type="button" onClick={() => set("couleur", c)}
                  className="w-7 h-7 rounded-lg transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c,
                    border: form.couleur === c ? "2.5px solid #1e293b" : "2px solid transparent",
                    boxShadow: form.couleur === c ? "0 0 0 1px #1e293b" : "0 1px 3px rgba(0,0,0,0.15)",
                  }} />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Type d&apos;événement</label>
            <select value={form.recurrence} onChange={e => set("recurrence", e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
              {RECURRENCES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>

          {/* ── Bandeau info Routine quotidienne ── */}
          {form.recurrence === "quotidienne" && (
            <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2 text-xs text-green-700 flex items-start gap-2">
              <span className="text-base leading-none">🔁</span>
              <div>
                <span className="font-semibold">Routine quotidienne</span> — cet événement apparaîtra chaque jour à partir de la date de début. Chaque journée peut être cochée indépendamment.
              </div>
            </div>
          )}

          {/* ── Sélecteur de dates précises (remplace le date_debut pour ce type) ── */}
          {form.recurrence === "dates_precises" ? (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-gray-600">
                  📅 Dates de l&apos;événement *
                  <span className="ml-2 text-indigo-600 font-semibold">
                    {datesList.filter(Boolean).length} date{datesList.filter(Boolean).length !== 1 ? "s" : ""}
                  </span>
                </label>
                <button type="button" onClick={addDate}
                  className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 rounded-lg font-semibold transition-colors">
                  + Ajouter
                </button>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {datesList.map((d, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input type="date" value={d} onChange={e => setDate(i, e.target.value)}
                      className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                    {datesList.length > 1 && (
                      <button type="button" onClick={() => removeDate(i)}
                        className="w-7 h-7 rounded-full bg-red-50 hover:bg-red-100 text-red-400 hover:text-red-600 flex items-center justify-center text-xs transition-colors flex-shrink-0">
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {datesList.filter(Boolean).length === 0 && (
                <p className="text-xs text-red-500 mt-1">⚠ Ajoutez au moins une date</p>
              )}
            </div>
          ) : (
            /* ── Date début / fin (pour tous les autres types) ── */
            <div className={`grid gap-3 ${form.recurrence === "aucune" ? "grid-cols-2" : "grid-cols-1"}`}>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  {form.recurrence === "aucune" ? "Date début" : "À partir du"}
                </label>
                <input type="date" value={form.date_debut} onChange={e => set("date_debut", e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
              {form.recurrence === "aucune" && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Date fin</label>
                  <input type="date" value={form.date_fin} min={form.date_debut} onChange={e => set("date_fin", e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                </div>
              )}
            </div>
          )}

          {/* ── Heures ── */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Heure début</label>
              <input type="time" value={form.heure_debut} onChange={e => set("heure_debut", e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Heure fin</label>
              <input type="time" value={form.heure_fin} onChange={e => set("heure_fin", e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Description (optionnel)</label>
            <textarea value={form.description} onChange={e => set("description", e.target.value)}
              placeholder="Détails..." rows={2}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 font-medium transition-colors">
              Annuler
            </button>
            <button type="submit" disabled={saving || !canSubmit}
              className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-40 transition-colors">
              {saving ? "Enregistrement..." : "Créer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
