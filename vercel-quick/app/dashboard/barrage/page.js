"use client";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { api, invalidateCache } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { logCorrectionBarrage, logExitBarrage, logNoteBarrage } from "@/lib/logsv2";

// ── Modal confirmation "Valider les corrections" ───────────────────
function ModalValider({ nbPending, onClose, onConfirm, running }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-gray-900 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-white font-bold text-base">⚡ Valider les corrections</h2>
            <p className="text-gray-400 text-xs mt-0.5">{nbPending} article(s) avec stock cible défini</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
            ⏳ Cette opération met à jour le stock directement dans <strong>Supabase</strong>. Elle prend quelques secondes.
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:border-gray-400">
              Annuler
            </button>
            <button onClick={onConfirm} disabled={running}
              className="flex-1 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-gray-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {running ? (
                <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Application…</>
              ) : "⚡ Confirmer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helper formatage date ────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("fr-DZ", { day: "2-digit", month: "short" }) + " " +
           d.toLocaleTimeString("fr-DZ", { hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

// ── Historique corrections pour une variante ────────────────────────
function CorrectionHistory({ events }) {
  const [open, setOpen] = useState(false);
  if (!events || events.length === 0) return null;
  const latest = events[0];
  return (
    <div className="border-t border-gray-100 mt-1">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
        data-testid="correction-history-toggle"
      >
        <span className="flex items-center gap-1.5">
          <span className="text-[10px]">📋</span>
          {events.length} correction{events.length > 1 ? "s" : ""} · dernier {fmtDate(latest.ts)}
        </span>
        <span>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-3 pb-2 space-y-1 max-h-40 overflow-y-auto">
          {events.map((ev) => (
            <div key={ev.event_id} className="py-0.5 border-b border-gray-50 last:border-0">
              <div className="flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className={
                    ev.log_type === "EXIT_BARRAGE"   ? "text-green-500" :
                    ev.log_type === "NOTE_BARRAGE"   ? "text-amber-500" :
                    "text-blue-500"
                  }>
                    {ev.log_type === "EXIT_BARRAGE" ? "✅" : ev.log_type === "NOTE_BARRAGE" ? "📝" : "✏️"}
                  </span>
                  <span className="text-gray-500 truncate">{ev.actor || "—"}</span>
                  {ev.ancien_statut && ev.nouveau_statut && (
                    <span className="text-gray-400">{ev.ancien_statut} → <strong className="text-gray-700">{ev.nouveau_statut}</strong></span>
                  )}
                </div>
                <span className="text-gray-300 flex-shrink-0 ml-1">{fmtDate(ev.ts)}</span>
              </div>
              {/* Afficher la note si présente */}
              {ev.note && (
                <div className="ml-5 mt-0.5 text-[10px] text-amber-700 bg-amber-50 rounded px-1.5 py-0.5 truncate">
                  📝 {ev.note}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Carte produit inline ────────────────────────────────────────────
function ProduitCard({ row, onSave, saving, correctionEvents }) {
  const [stockCible, setStockCible] = useState(row.stock_cible !== undefined && row.stock_cible !== "" ? String(row.stock_cible) : "");
  const [note,       setNote]       = useState(row.note_agent || "");
  const [verifie,    setVerifie]    = useState(!!row["verifié"]);
  const [dirty,      setDirty]      = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    setStockCible(row.stock_cible !== undefined && row.stock_cible !== "" ? String(row.stock_cible) : "");
    setNote(row.note_agent || "");
    setVerifie(!!row["verifié"]);
    setDirty(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.variant_id, row.stock_cible, row.note_agent, row["verifié"]]);

  const handleChange = (field, val) => {
    if (field === "stock") { setStockCible(val); setDirty(true); }
    if (field === "note")  { setNote(val);        setDirty(true); }
  };

  const handleVerifie = () => {
    const next = !verifie;
    setVerifie(next);
    setDirty(true);
    onSave(row.variant_id, { stock_cible: stockCible, note_agent: note, verifie: next });
    setDirty(false);
  };

  const handleSave = () => {
    onSave(row.variant_id, { stock_cible: stockCible, note_agent: note, verifie });
    setDirty(false);
  };

  const isOnglerie  = (row.balise || "").toLowerCase() === "onglerie" || (row.balise || "").toLowerCase().includes("ongl");
  const hasCible    = stockCible !== "" && !isNaN(Number(stockCible));
  const liveStock   = Number(row.liveStock ?? row.on_hand ?? row.available ?? 0);
  const horsBarrage = liveStock > 4;

  return (
    <div
      data-testid="barrage-card"
      className={`bg-white rounded-xl border transition-all
        ${verifie ? "border-green-200 opacity-60" : horsBarrage ? "border-yellow-200 opacity-70" : hasCible ? "border-blue-200" : "border-gray-200"}`}
    >

      <div className="flex items-start gap-3 p-3">
        {/* Case à cocher */}
        <div
          onClick={handleVerifie}
          className={`w-6 h-6 flex-shrink-0 mt-1 rounded-md border-2 flex items-center justify-center cursor-pointer transition-colors
            ${verifie ? "bg-green-500 border-green-500" : "border-gray-300 hover:border-green-400"}`}
        >
          {verifie && <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>}
        </div>

        {/* Image */}
        <div className="w-14 h-14 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center">
          {row.variant_image_url ? (
            <img src={row.variant_image_url} alt="" className="w-full h-full object-cover" onError={e => e.target.style.display="none"} />
          ) : <span className="text-gray-300 text-2xl">📦</span>}
        </div>

        {/* Titre + infos stock */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-semibold text-sm ${verifie ? "line-through text-gray-400" : "text-gray-900"}`}>
              {row.product_title || "—"}
            </span>
            {isOnglerie && (
              <span className="bg-pink-100 text-pink-700 text-xs px-2 py-0.5 rounded-full font-medium">Onglerie</span>
            )}
            {!isOnglerie && row.balise && (
              <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-medium">{row.balise}</span>
            )}
            {horsBarrage && (
              <span className="bg-yellow-100 text-yellow-700 text-[10px] px-2 py-0.5 rounded-full font-medium">hors barrage</span>
            )}
          </div>

          {/* Métriques stock */}
          <div className="flex flex-wrap gap-3 mt-1.5 text-xs">
            <span className={`font-semibold ${liveStock <= 1 ? "text-red-600" : liveStock <= 3 ? "text-orange-600" : liveStock <= 4 ? "text-yellow-600" : "text-green-600"}`}>
              Stock réel : <strong>{liveStock}</strong>
            </span>
            {Number(row.committed) > 0 && <span className="text-purple-600">Engagé : <strong>{row.committed}</strong></span>}
          </div>

          {/* Agent qui a mis stock_cible */}
          {row.agent && (
            <div className="text-xs text-gray-400 mt-1">👤 {row.agent}</div>
          )}

          {/* ── Note agent — toujours visible si renseignée ── */}
          {row.note_agent && (
            <div
              data-testid="barrage-note-display"
              className="mt-1.5 flex items-start gap-1 text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1"
            >
              <span className="flex-shrink-0">📝</span>
              <span className="break-words">{row.note_agent}</span>
            </div>
          )}
        </div>
      </div>

      {/* Zone édition */}
      {!verifie && (
        <div className="border-t border-gray-100 px-3 py-2.5 flex items-end gap-2">
          <div className="flex-shrink-0">
            <label className="text-xs text-gray-500 block mb-1">Stock cible</label>
            <input
              ref={inputRef}
              type="number"
              min="0"
              max="100"
              value={stockCible}
              onChange={e => handleChange("stock", e.target.value)}
              placeholder="ex: 10"
              data-testid="barrage-stock-input"
              className={`w-24 border rounded-lg px-2.5 py-1.5 text-sm text-center focus:outline-none focus:ring-2
                ${hasCible ? "border-blue-300 focus:ring-blue-400" : "border-gray-200 focus:ring-gray-900"}`}
            />
          </div>
          <div className="flex-1 min-w-0">
            <label className="text-xs text-gray-500 block mb-1">Note</label>
            <input
              type="text"
              value={note}
              onChange={e => handleChange("note", e.target.value)}
              placeholder="Note agent…"
              data-testid="barrage-note-input"
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
          {dirty && (
            <button
              onClick={handleSave}
              disabled={saving}
              data-testid="barrage-save-btn"
              className="flex-shrink-0 px-3 py-1.5 bg-gray-900 text-white rounded-lg text-xs font-semibold hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "…" : "✓"}
            </button>
          )}
        </div>
      )}

      {/* Historique corrections */}
      <CorrectionHistory events={correctionEvents} />
    </div>
  );
}

// ── Onglet Historique — articles sortis du barrage ─────────────────
function HistoriqueTab({ events, search }) {
  // Grouper les événements par variant_id
  const grouped = useMemo(() => {
    const map = {};
    events.forEach(ev => {
      const vid = String(ev.variant_id || "");
      if (!vid || vid === "null") return;
      if (!map[vid]) map[vid] = { label: "", events: [] };
      if (ev.label && !map[vid].label) map[vid].label = ev.label;
      map[vid].events.push(ev);
    });
    return map;
  }, [events]);

  const variantIds = useMemo(() => {
    let ids = Object.keys(grouped);
    // Filtrer par recherche texte
    if (search.trim()) {
      const q = search.toLowerCase();
      ids = ids.filter(vid => (grouped[vid].label || "").toLowerCase().includes(q) || vid.includes(q));
    }
    // Trier par date du dernier événement
    ids.sort((a, b) => {
      const ta = grouped[a].events[0]?.ts || "";
      const tb = grouped[b].events[0]?.ts || "";
      return tb.localeCompare(ta);
    });
    return ids;
  }, [grouped, search]);

  if (variantIds.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-gray-400">
        <div className="text-4xl mb-2">📋</div>
        <div className="text-sm">
          {Object.keys(grouped).length === 0 ? "Aucun historique disponible" : "Aucun résultat pour cette recherche"}
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 max-w-6xl mx-auto">
      {variantIds.map(vid => {
        const group = grouped[vid];
        const latestExit = group.events.find(e => e.log_type === "EXIT_BARRAGE");
        const totalEvents = group.events.length;

        return (
          <HistoriqueCard
            key={vid}
            vid={vid}
            group={group}
            latestExit={latestExit}
            totalEvents={totalEvents}
          />
        );
      })}
    </div>
  );
}

function HistoriqueCard({ vid, group, latestExit, totalEvents }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden" data-testid="historique-card">
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-sm text-gray-900 truncate">
              {group.label || vid}
            </div>
            {latestExit ? (
              <div className="text-xs text-green-600 mt-0.5 flex items-center gap-1">
                <span>✅</span>
                <span>
                  {latestExit.nouveau_statut === "hors_seuil"
                    ? "Sorti auto (stock OK)"
                    : "Sortie manuelle"
                  }
                  {" · "}{fmtDate(latestExit.ts)}
                </span>
              </div>
            ) : (
              <div className="text-xs text-gray-400 mt-0.5">Historique corrections</div>
            )}
          </div>
          <span className="flex-shrink-0 text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
            {totalEvents} événement{totalEvents > 1 ? "s" : ""}
          </span>
        </div>
      </div>

      <div className="border-t border-gray-100">
        <button
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          <span>Voir l'historique</span>
          <span>{open ? "▲" : "▼"}</span>
        </button>
        {open && (
          <div className="px-3 pb-3 space-y-1 max-h-48 overflow-y-auto">
            {group.events.map(ev => (
              <div key={ev.event_id} className="py-0.5 border-b border-gray-50 last:border-0">
                <div className="flex items-center justify-between text-[10px]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={
                      ev.log_type === "EXIT_BARRAGE"     ? "text-green-500" :
                      ev.log_type === "NOTE_BARRAGE"     ? "text-amber-500" :
                      "text-blue-500"
                    }>
                      {ev.log_type === "EXIT_BARRAGE" ? "✅" : ev.log_type === "NOTE_BARRAGE" ? "📝" : "✏️"}
                    </span>
                    <span className="text-gray-500 truncate">{ev.actor || "—"}</span>
                    {ev.ancien_statut && ev.nouveau_statut && ev.log_type !== "EXIT_BARRAGE" && (
                      <span className="text-gray-400">{ev.ancien_statut} → <strong className="text-gray-700">{ev.nouveau_statut}</strong></span>
                    )}
                    {ev.log_type === "EXIT_BARRAGE" && (
                      <span className="text-green-600 font-medium">
                        {ev.nouveau_statut === "hors_seuil" ? "Stock revenu OK" : "OUT_BARRAGE"}
                        {ev.qty != null ? ` (stock: ${ev.qty})` : ""}
                      </span>
                    )}
                  </div>
                  <span className="text-gray-300 flex-shrink-0 ml-1">{fmtDate(ev.ts)}</span>
                </div>
                {ev.note && (
                  <div className="ml-5 mt-0.5 text-[10px] text-amber-700 bg-amber-50 rounded px-1.5 py-0.5 break-words">
                    📝 {ev.note}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  PAGE BARRAGE PRODUITS
// ═══════════════════════════════════════════════════════════════════
export default function BarragePage() {
  const [rows,             setRows]             = useState([]);
  const [correctionEvents, setCorrectionEvents] = useState({});
  const [exitHistory,      setExitHistory]      = useState([]);
  const [loadingHist,      setLoadingHist]      = useState(false);
  const [loading,          setLoading]          = useState(true);
  const [search,           setSearch]           = useState("");
  const [filter,           setFilter]           = useState("tous"); // tous | coiffure | onglerie | historique
  const [saving,           setSaving]           = useState(null);
  const [showModal,        setShowModal]        = useState(false);
  const [running,          setRunning]          = useState(false);
  const [syncing,          setSyncing]          = useState(false);
  const [toast,            setToast]            = useState(null);
  const [agentName,        setAgentName]        = useState("");

  useEffect(() => {
    const s = getSession();
    setAgentName(s?.user?.nom || s?.nom || "agent");
  }, []);

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const syncBarrage = useCallback(async (silent = false) => {
    if (!silent) setSyncing(true);
    try {
      await api.lancerAnalyseBarrage();
    } catch (_) { /* fire-and-forget */ }
    finally { if (!silent) setSyncing(false); }
  }, []);

  const loadRows = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [barrageRes, variantsRes] = await Promise.all([
        api.getBarrage(),
        api.getVariantsCache(),
      ]);
      if (barrageRes.ok) {
        const stockMap = new Map();
        (variantsRes?.rows || []).forEach(v => {
          stockMap.set(String(v.variant_id), v.inventory_quantity ?? 0);
        });

        const newRows = (barrageRes.rows || []).map(r => ({
          ...r,
          liveStock: stockMap.has(String(r.variant_id))
            ? stockMap.get(String(r.variant_id))
            : (r.on_hand ?? r.available ?? 0),
        }));
        setRows(newRows);

        const ids = newRows.map(r => String(r.variant_id)).filter(Boolean);
        if (ids.length > 0) {
          api.getCorrectionEvents(ids).then(evRes => {
            if (evRes.ok) {
              const grouped = {};
              (evRes.rows || []).forEach(ev => {
                const vid = String(ev.variant_id || "");
                if (!grouped[vid]) grouped[vid] = [];
                grouped[vid].push(ev);
              });
              setCorrectionEvents(grouped);
            }
          }).catch(() => {});
        }
      }
    } catch (_) { showToast("Erreur chargement", "error"); }
    finally { setLoading(false); }
  }, [showToast]);

  // ── Charger l'historique "hors barrage" à la demande ──────────────
  const loadExitHistory = useCallback(async () => {
    setLoadingHist(true);
    try {
      const res = await api.getExitBarrageHistory();
      if (res.ok) setExitHistory(res.rows || []);
    } catch (_) { showToast("Erreur chargement historique", "error"); }
    finally { setLoadingHist(false); }
  }, [showToast]);

  useEffect(() => {
    syncBarrage(true).then(() => loadRows());
    const t = setInterval(() => loadRows(true), 30000);
    return () => clearInterval(t);
  }, [loadRows, syncBarrage]);

  // Charger l'historique quand on bascule sur l'onglet "historique"
  useEffect(() => {
    if (filter === "historique" && exitHistory.length === 0) {
      loadExitHistory();
    }
  }, [filter, exitHistory.length, loadExitHistory]);

  // ── Sauvegarder un article ──────────────────────────────────────
  const handleSave = useCallback(async (variantId, fields) => {
    setSaving(variantId);
    try {
      const row = rows.find(r => String(r.variant_id) === String(variantId));
      const ancienStock = row?.stock_cible;
      const ancienNote  = row?.note_agent;

      const stockVal = (fields.stock_cible !== "" && fields.stock_cible !== null && fields.stock_cible !== undefined)
        ? Number(fields.stock_cible)
        : null;
      const noteVal = (fields.note_agent && fields.note_agent.trim()) ? fields.note_agent.trim() : null;

      const res = await api.updateBarrage(variantId, {
        stock_cible: stockVal,
        note_agent:  noteVal,
        verifie:     fields.verifie,
      });
      if (res.ok) {
        showToast("Sauvegardé ✓");
        // Log changement de stock cible
        if (fields.stock_cible !== "" && fields.stock_cible !== ancienStock) {
          logCorrectionBarrage(
            agentName,
            String(variantId),
            row?.product_title || "",
            ancienStock != null ? String(ancienStock) : null,
            String(fields.stock_cible)
          );
        }
        // Log changement de note
        if (noteVal && noteVal !== ancienNote) {
          logNoteBarrage(agentName, String(variantId), row?.product_title || "", noteVal);
        }

        // ── Fix Bug 1 & 2 : mise à jour EN PLACE (pas de rechargement)
        //    → la note s'affiche immédiatement, la position reste stable
        invalidateCache("barrage");
        setRows(prev => prev.map(r =>
          String(r.variant_id) === String(variantId)
            ? { ...r, stock_cible: stockVal, note_agent: noteVal, verifie: fields.verifie ? "true" : "false" }
            : r
        ));

        // Rafraîchir l'historique de corrections pour cet article (fire-and-forget)
        const vid = String(variantId);
        api.getCorrectionEvents([vid]).then(evRes => {
          if (evRes.ok) {
            setCorrectionEvents(prev => ({
              ...prev,
              [vid]: evRes.rows || [],
            }));
          }
        }).catch(() => {});

      } else {
        showToast(res.error || "Erreur", "error");
      }
    } catch (_) { showToast("Erreur réseau", "error"); }
    finally { setSaving(null); }
  }, [rows, agentName, showToast]);

  // ── Actualiser ─────────────────────────────────────────────────
  const handleRefresh = useCallback(async () => {
    setSyncing(true);
    showToast("🔄 Synchronisation en cours…", "info");
    try {
      const res = await api.lancerAnalyseBarrage();
      if (res.ok) {
        showToast(`✅ ${res.added} ajoutés · ${res.removed} sortis`);
      }
      await loadRows(true);
      if (filter === "historique") await loadExitHistory();
    } catch (_) { showToast("Erreur réseau", "error"); }
    finally { setSyncing(false); }
  }, [loadRows, loadExitHistory, filter, showToast]);

  // ── Valider toutes les corrections ─────────────────────────────
  const handleRunGlobal = () => {
    setShowModal(false);
    setRunning(true);
    showToast("⏳ Corrections en cours…", "info");

    const pending = rows.filter(r => r.stock_cible != null && r.stock_cible !== "");

    api.runBarrageGlobal()
      .then(res => {
        if (res.ok) {
          showToast("✅ Corrections appliquées dans Supabase");
          pending.forEach(r => {
            logExitBarrage(agentName, String(r.variant_id), r.product_title || "", r.stock_cible);
          });
          loadRows(true);
        } else {
          showToast(res.error || "Erreur correction", "error");
        }
      })
      .catch(err => {
        const msg = err?.message || "";
        if (msg.includes("504") || msg.includes("timeout")) {
          showToast("⏳ Toujours en cours (rafraîchissement automatique dans 60s)", "info");
          setTimeout(() => loadRows(true), 60000);
        } else {
          showToast("Erreur : " + msg, "error");
        }
      })
      .finally(() => setRunning(false));
  };

  // ── Filtrage ───────────────────────────────────────────────────
  const inRange  = rows.filter(r => r.liveStock >= 1);
  const filtered = inRange.filter(r => {
    const balise = (r.balise || "").toLowerCase();
    const isOng = balise === "onglerie" || balise.includes("ongl");
    if (filter === "coiffure" && isOng) return false;
    if (filter === "onglerie" && !isOng) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (r.product_title || "").toLowerCase().includes(q);
    }
    return true;
  });

  const nbRupture  = rows.filter(r => r.liveStock < 1).length;
  const nbOnglerie = inRange.filter(r => { const b = (r.balise||"").toLowerCase(); return b === "onglerie" || b.includes("ongl"); }).length;
  const nbCoiffure = inRange.length - nbOnglerie;
  const nbPending  = inRange.filter(r => r.stock_cible !== "" && r.stock_cible !== undefined && r.stock_cible !== null).length;

  // Compter les articles uniques dans l'historique
  const nbHistorique = useMemo(() => {
    const vids = new Set(exitHistory.map(e => String(e.variant_id || "")).filter(Boolean));
    return vids.size;
  }, [exitHistory]);

  return (
    <div className="flex flex-col h-full bg-gray-50">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-40 px-4 py-3 rounded-lg shadow-lg text-sm font-medium max-w-sm
          ${toast.type === "error" ? "bg-red-600 text-white"
          : toast.type === "info"  ? "bg-gray-800 text-white"
          : "bg-green-600 text-white"}`}>
          {toast.msg}
        </div>
      )}

      {/* Modal valider */}
      {showModal && (
        <ModalValider
          nbPending={nbPending}
          onClose={() => setShowModal(false)}
          onConfirm={handleRunGlobal}
          running={running}
        />
      )}

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex-shrink-0">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="font-bold text-gray-900 text-base">🚧 Barrage produits</h1>
            <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
              {filter === "historique" ? (
                <span>Historique articles sortis du barrage</span>
              ) : (
                <>
                  <span>{inRange.length} article{inRange.length !== 1 ? "s" : ""} à vérifier</span>
                  {nbRupture > 0 && (
                    <span className="bg-gray-100 text-gray-400 text-[10px] px-2 py-0.5 rounded-full">
                      {nbRupture} rupture{nbRupture > 1 ? "s" : ""} masquée{nbRupture > 1 ? "s" : ""}
                    </span>
                  )}
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleRefresh}
              disabled={syncing}
              className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:border-gray-400 disabled:opacity-40 flex items-center gap-1"
            >
              {syncing
                ? <><svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Sync…</>
                : "↻ Actualiser"
              }
            </button>
            {filter !== "historique" && (
              <button
                onClick={() => setShowModal(true)}
                disabled={nbPending === 0}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                ⚡ Valider corrections
                {nbPending > 0 && (
                  <span className="bg-white text-gray-900 text-xs px-1.5 py-0.5 rounded-full font-bold">{nbPending}</span>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Filtres + recherche */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <div className="flex gap-1">
            {[
              { key: "tous",       label: "Tous",       count: inRange.length },
              { key: "coiffure",   label: "Coiffure",   count: nbCoiffure },
              { key: "onglerie",   label: "Onglerie",   count: nbOnglerie },
              { key: "historique", label: "📋 Historique", count: filter === "historique" && nbHistorique > 0 ? nbHistorique : null },
            ].map(t => (
              <button
                key={t.key}
                onClick={() => setFilter(t.key)}
                data-testid={`filter-${t.key}`}
                className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors
                  ${filter === t.key ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
              >
                {t.label}
                {t.count != null && <span className="opacity-70 ml-1">{t.count}</span>}
              </button>
            ))}
          </div>
          <input type="text" placeholder="Rechercher un produit…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-[160px] text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-gray-900" />
        </div>
      </div>

      {/* ── Liste / Historique ─────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {filter === "historique" ? (
          loadingHist ? (
            <div className="flex items-center justify-center h-40 text-gray-400 text-sm gap-2">
              <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
              Chargement historique…
            </div>
          ) : (
            <HistoriqueTab events={exitHistory} search={search} />
          )
        ) : loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm gap-2">
            <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
            Chargement…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400">
            <div className="text-4xl mb-2">✅</div>
            <div className="text-sm">
              {rows.length === 0 ? "Aucun produit en barrage" : "Aucun résultat pour cette recherche"}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 max-w-6xl mx-auto">
            {filtered.map(row => (
              <ProduitCard
                key={row.variant_id || row.inventory_item_id}
                row={row}
                onSave={handleSave}
                saving={saving === row.variant_id}
                correctionEvents={correctionEvents[String(row.variant_id)] || []}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
