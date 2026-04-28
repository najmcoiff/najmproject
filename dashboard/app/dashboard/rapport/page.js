"use client";
import { useState, useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { getSession, getRawToken } from "@/lib/auth";
import { sendPushNotification } from "@/lib/push";
import { supabase } from "@/lib/supabase";
import { logRapport } from "@/lib/logsv2";
import { smartMatch } from "@/lib/smart-search";

// ── Helpers médias ────────────────────────────────────────────────
function parseMedia(raw) {
  if (!raw) return [];
  const s = String(raw).trim();
  if (!s) return [];
  // Nouveau format : JSON array
  if (s.startsWith("[")) {
    try { return JSON.parse(s); } catch {}
  }
  // Ancien format JSON objet
  if (s.startsWith("{")) {
    try { const obj = JSON.parse(s); return [obj]; } catch {}
  }
  // Plusieurs URLs séparées par virgule ou retour à la ligne
  const parts = s.split(/[,\n]+/).map(p => p.trim()).filter(p => p.startsWith("http"));
  if (parts.length > 1) {
    return parts.map(url => ({ url, type: mediaType(url) }));
  }
  // URL simple
  if (s.startsWith("http")) {
    return [{ url: s, type: mediaType(s) }];
  }
  return [];
}

function mediaType(url) {
  const u = (url || "").toLowerCase();
  if (u.includes("/vocaux/") || /\.(mp3|ogg|m4a|wav|aac)(\?|$)/.test(u)) return "audio";
  if (/\.(mp4|webm|mov|avi|mkv)(\?|$)/.test(u) || u.includes("/videos/")) return "video";
  return "image"; // tout le reste = image (Supabase Storage URLs)
}

async function uploadToSupabase(file, bucket) {
  const ext  = file.name.split(".").pop() || "bin";
  const path = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

// ── Composant : vignette d'un media ──────────────────────────────
function MediaThumb({ item, onRemove, size = "w-20 h-20" }) {
  const [err, setErr] = useState(false);
  const type = item.type || mediaType(item.url);
  return (
    <div className={`relative ${size} rounded-xl overflow-hidden border border-gray-200 flex-shrink-0 bg-gray-100`}>
      {type === "image"  && !err && <img src={item.url} alt="" className="w-full h-full object-cover" onError={() => setErr(true)} />}
      {type === "image"  && err  && <div className="w-full h-full flex items-center justify-center text-gray-400 text-lg">📎</div>}
      {type === "video"  && <video src={item.url} className="w-full h-full object-cover" muted />}
      {type === "audio"  && (
        <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-indigo-50">
          <span className="text-2xl">🎙️</span>
          <span className="text-[9px] text-indigo-600 font-medium">Vocal</span>
        </div>
      )}
      {onRemove && (
        <button onClick={onRemove}
          className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center hover:bg-red-600">✕</button>
      )}
    </div>
  );
}

// ── Composant : affichage media en plein (pour détail rapport) ────
function MediaViewer({ item }) {
  const [imgErr, setImgErr] = useState(false);
  const type = item.type || mediaType(item.url);

  if (type === "video") return (
    <video controls src={item.url} className="w-full max-h-64 rounded-xl bg-black object-contain" />
  );
  if (type === "audio") return (
    <div className="flex items-center gap-3 bg-indigo-50 rounded-xl p-3 border border-indigo-100">
      <span className="text-2xl">🎙️</span>
      <audio controls src={item.url} className="flex-1 h-8 min-w-0" />
    </div>
  );
  if (imgErr) return (
    <a href={item.url} target="_blank" rel="noopener noreferrer"
      className="flex items-center gap-2 bg-gray-50 rounded-xl p-3 border border-gray-100 text-sm text-indigo-600 hover:bg-gray-100 transition-colors">
      <span className="text-xl">📎</span>
      <span className="truncate underline">Voir la pièce jointe</span>
    </a>
  );
  return (
    <a href={item.url} target="_blank" rel="noopener noreferrer">
      <div className="w-full rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center">
        <img
          src={item.url}
          alt="pièce jointe"
          className="max-w-full max-h-80 object-contain hover:opacity-90 transition-opacity"
          onError={() => setImgErr(true)}
        />
      </div>
    </a>
  );
}

// ── Composant : upload de médias (image / vidéo / vocal) ──────────
function MediaUploader({ medias, onChange }) {
  const fileRef   = useRef(null);
  const [recording, setRecording] = useState(false);
  const [recSecs,   setRecSecs]   = useState(0);
  const [uploading, setUploading] = useState(false);
  const recRef    = useRef(null);
  const chunksRef = useRef([]);
  const timerRef  = useRef(null);

  async function handleFile(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      const newItems = await Promise.all(files.map(async f => {
        const isVideo = f.type.startsWith("video/");
        const bucket  = isVideo ? "medias" : "fichiers";
        const url     = await uploadToSupabase(f, bucket);
        return { url, type: isVideo ? "video" : "image" };
      }));
      onChange([...medias, ...newItems]);
    } catch (err) { alert("Upload échoué : " + err.message); }
    finally { setUploading(false); e.target.value = ""; }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        clearInterval(timerRef.current);
        setRecording(false);
        setRecSecs(0);
        if (!chunksRef.current.length) return;
        setUploading(true);
        try {
          const blob = new Blob(chunksRef.current, { type: "audio/webm" });
          const file = new File([blob], `vocal_${Date.now()}.webm`, { type: "audio/webm" });
          const url  = await uploadToSupabase(file, "vocaux");
          onChange([...medias, { url, type: "audio" }]);
        } catch (err) { alert("Upload vocal échoué : " + err.message); }
        finally { setUploading(false); }
      };
      mr.start();
      recRef.current = mr;
      setRecording(true);
      setRecSecs(0);
      timerRef.current = setInterval(() => setRecSecs(s => s + 1), 1000);
    } catch { alert("Microphone inaccessible"); }
  }

  function stopRecording() {
    recRef.current?.stop();
  }

  function removeMedia(idx) {
    onChange(medias.filter((_, i) => i !== idx));
  }

  return (
    <div>
      <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-2">
        Pièce jointe
      </label>
      {/* Vignettes */}
      {medias.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {medias.map((m, i) => (
            <MediaThumb key={i} item={m} onRemove={() => removeMedia(i)} />
          ))}
        </div>
      )}
      {/* Boutons ajout */}
      <div className="flex gap-2 flex-wrap">
        <button type="button" onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition disabled:opacity-50">
          📷 Image / Vidéo
        </button>
        <input ref={fileRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleFile} />

        {!recording ? (
          <button type="button" onClick={startRecording} disabled={uploading}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 border border-indigo-200 rounded-xl text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition disabled:opacity-50">
            🎙️ Enregistrer un vocal
          </button>
        ) : (
          <button type="button" onClick={stopRecording}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 border border-red-200 rounded-xl text-red-700 bg-red-50 hover:bg-red-100 transition animate-pulse">
            ⏹️ Arrêter ({recSecs}s)
          </button>
        )}

        {uploading && (
          <span className="flex items-center gap-1.5 text-xs text-gray-400">
            <span className="w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin inline-block" />
            Upload…
          </span>
        )}
      </div>
    </div>
  );
}

// ── Schéma des catégories / cas / types ────────────────────────────
const SCHEMA = {
  "PRODUIT / COLIS": {
    cas: [
      "Produit endommagé au retour","Produit manquant dans la quota",
      "Produit manquant dans le colis","Produit différent de la commande",
      "Emballage abîmé","Colis ouvert à la livraison",
      "Produit souvent retourné","Produit souvent refusé",
      "Problème qualité produit","Problème fournisseur",
    ],
    types: [],
  },
  "PRODUITS / STOCK / DEMANDE": {
    cas: [
      "Article demandé fréquemment (non dispo)",
      "Demande récurrente d'un nouveau produit",
      "Rupture fréquente d'un article",
    ],
    types: [],
  },
  "LIVRAISON / INCIDENT CLIENT": {
    cas: [
      "Problème dans une livraison (client / livraison)",
      "Client demande remboursement",
      "Client demande échange",
    ],
    types: [],
  },
  "OPS / PROCESS": {
    cas: [
      "Erreur de préparation commande","Process trop lent",
      "Mauvaise organisation interne","Problème planning / surcharge",
      "Problème de communication interne",
    ],
    types: [],
  },
  "IT / MATÉRIEL": {
    cas: [
      "Outil manquant (chargeur, câble, etc.)","Imprimante en panne",
      "Problème internet","Problème logiciel / Google Sheets",
      "Incident matériel (PC, téléphone, etc.)",
    ],
    types: [],
  },
  "AMÉLIORATION / SUGGESTIONS": {
    cas: [
      "Suggestion d'amélioration process","Suggestion nouveau produit",
      "Suggestion outil / matériel","Observation terrain importante",
    ],
    types: [],
  },
  "CAISSE_OPERATION": {
    cas: ["ENTRÉE","SORTIE","AJUSTEMENT","APPROVISIONNEMENT","DECLARATION DETTE"],
    types: {
      "ENTRÉE":  ["Encaissement client (vente directe)","Paiement société de livraison","Remboursement reçu (fournisseur, erreur)"],
      "SORTIE":  ["Paiement fournisseur","Dépense opérationnelle (carburant, internet, fournitures)","Remboursement client","Retrait de caisse (responsable)","Charges salariales"],
      "AJUSTEMENT": ["Régularisation positive (surplus constaté)","Régularisation négative (manque, perte, erreur)"],
      "APPROVISIONNEMENT": [],
      "DECLARATION DETTE": [],
    },
  },
  "DÉPÔT RECETTE": {
    cas: ["Dépôt de recette journalière POS"],
    types: [],
  },
};

const FOURNISSEURS = ["BLIDI","BILAL EULMA","MOULOUD FRAMS","AUTRE"];

// Cas nécessitant un champ tracking
const CAS_TRACKING = new Set([
  "Produit endommagé au retour","Produit manquant dans le colis",
  "Produit différent de la commande","Emballage abîmé","Colis ouvert à la livraison",
  "Problème dans une livraison (client / livraison)",
  "Client demande remboursement","Client demande échange",
  "Erreur de préparation commande",
]);
// Cas nécessitant un produit
const CAS_PRODUIT = new Set([
  "Produit endommagé au retour","Produit manquant dans la quota",
  "Produit manquant dans le colis","Produit différent de la commande",
  "Produit souvent retourné","Produit souvent refusé","Problème qualité produit",
  "Article demandé fréquemment (non dispo)","Demande récurrente d'un nouveau produit",
  "Rupture fréquente d'un article","Suggestion nouveau produit",
]);
// Cas nécessitant un fournisseur
const CAS_FOURNISSEUR = new Set([
  "Problème fournisseur","Paiement fournisseur","APPROVISIONNEMENT","DECLARATION DETTE",
]);
// Rôles managers
const MANAGER_ROLES = new Set(["responsable","owner","drh","chef d'equipe"]);

// Couleurs par catégorie
const CAT_COLORS = {
  "PRODUIT / COLIS":            { bg: "bg-red-50",    border: "border-red-200",    text: "text-red-700",    dot: "bg-red-500" },
  "PRODUITS / STOCK / DEMANDE": { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700", dot: "bg-orange-500" },
  "LIVRAISON / INCIDENT CLIENT":{ bg: "bg-blue-50",   border: "border-blue-200",   text: "text-blue-700",   dot: "bg-blue-500" },
  "OPS / PROCESS":              { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-700", dot: "bg-purple-500" },
  "IT / MATÉRIEL":              { bg: "bg-cyan-50",   border: "border-cyan-200",   text: "text-cyan-700",   dot: "bg-cyan-500" },
  "AMÉLIORATION / SUGGESTIONS": { bg: "bg-green-50",  border: "border-green-200",  text: "text-green-700",  dot: "bg-green-500" },
  "CAISSE_OPERATION":           { bg: "bg-amber-50",  border: "border-amber-200",  text: "text-amber-700",  dot: "bg-amber-500" },
  "DÉPÔT RECETTE":              { bg: "bg-emerald-50",border: "border-emerald-200",text: "text-emerald-700",dot: "bg-emerald-500" },
};
function catColor(cat) {
  return CAT_COLORS[cat] || { bg: "bg-gray-50", border: "border-gray-200", text: "text-gray-700", dot: "bg-gray-400" };
}

// Couleurs sévérité
const SEV_BADGE = { haute: "bg-red-100 text-red-700", moyenne: "bg-amber-100 text-amber-800", basse: "bg-green-100 text-green-700" };

function fmt(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("fr-DZ", { day:"2-digit", month:"short", year:"numeric" }) + " " +
         d.toLocaleTimeString("fr-DZ", { hour:"2-digit", minute:"2-digit" });
}
function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("fr-DZ", { day:"2-digit", month:"short", year:"numeric" });
}

// ── Toast ──────────────────────────────────────────────────────────
function Toast({ msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, [onClose]);
  const cls = type === "ok" ? "bg-green-600" : "bg-red-600";
  return (
    <div className={`fixed bottom-6 right-6 z-50 ${cls} text-white text-sm px-4 py-3 rounded-xl shadow-lg flex items-center gap-2`}>
      <span>{msg}</span>
      <button onClick={onClose} className="ml-1 opacity-70 hover:opacity-100">✕</button>
    </div>
  );
}

// ── Spinner ────────────────────────────────────────────────────────
function Spinner() {
  return <div className="animate-spin rounded-full h-5 w-5 border-2 border-gray-300 border-t-gray-700 mx-auto" />;
}

// ── Helpers ───────────────────────────────────────────────────────
function fmtHour(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleTimeString("fr-DZ", { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}

// ── Formulaire de création ─────────────────────────────────────────
function CreateModal({ onClose, onCreated, variants }) {
  const EMPTY = {
    categorie:"", cas:"", type:"", severity:"moyenne",
    order_id:"", tracking:"", product_name:"", product_variant_id:"",
    description:"", action_taken:"", action_needed:"",
    valeur:"", fournisseur:"",
  };
  const [form, setForm] = useState(EMPTY);
  const [medias, setMedias] = useState([]);
  const [saving, setSaving] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [productOpen, setProductOpen] = useState(false);
  const prodRef = useRef(null);

  // POS order search
  const [posSearch, setPosSearch] = useState("");
  const [posOrders, setPosOrders] = useState([]);
  const [posLoading, setPosLoading] = useState(false);
  const [posOpen, setPosOpen] = useState(false);
  const posRef = useRef(null);
  const posTimer = useRef(null);

  const currentSchema = SCHEMA[form.categorie] || { cas: [], types: [] };
  const currentTypes  = Array.isArray(currentSchema.types)
    ? currentSchema.types
    : (currentSchema.types?.[form.cas] || []);

  const needTracking   = CAS_TRACKING.has(form.cas);
  const needProduit    = CAS_PRODUIT.has(form.cas);
  const needFournisseur= CAS_FOURNISSEUR.has(form.cas);
  const isCaisse       = form.categorie === "CAISSE_OPERATION";
  const isDepotRecette = form.categorie === "DÉPÔT RECETTE";
  const needValeur     = isCaisse || isDepotRecette;

  function setF(k, v) { setForm(p => ({ ...p, [k]: v })); }

  function handleCategorie(v) {
    setForm(p => ({ ...EMPTY, categorie: v, severity: p.severity }));
  }
  function handleCas(v) {
    setForm(p => ({ ...p, cas: v, type: "", product_name: "", product_variant_id: "", tracking: "", fournisseur: "" }));
  }

  // Recherche commandes POS avec debounce
  function handlePosSearch(val) {
    setPosSearch(val);
    setPosOpen(true);
    clearTimeout(posTimer.current);
    posTimer.current = setTimeout(async () => {
      setPosLoading(true);
      try {
        const res = await api.getPosOrders(val);
        setPosOrders(res.rows || []);
      } catch { setPosOrders([]); }
      finally { setPosLoading(false); }
    }, 400);
  }

  function selectPosOrder(order) {
    setF("order_id", order.order_id);
    setF("valeur", order.order_total || "");
    setPosSearch(`${order.order_id} — ${order.customer_name} (${Number(order.order_total || 0).toLocaleString("fr-DZ")} DA)`);
    setPosOpen(false);
  }

  // Charger les commandes POS dès qu'on arrive sur le champ recette
  const needOrderId = form.type === "déposer une recette";
  useEffect(() => {
    if (needOrderId && posOrders.length === 0 && !posLoading) {
      setPosLoading(true);
      api.getPosOrders("").then(r => { setPosOrders(r.rows || []); }).catch(() => {}).finally(() => setPosLoading(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needOrderId]);

  const filteredProducts = (productSearch.length >= 2)
    ? variants.filter(v =>
        smartMatch(productSearch, [v.display_name, v.product_title, v.vendor, v.sku, v.barcode])
      ).slice(0, 12)
    : [];

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.categorie || !form.cas) return;
    if (isDepotRecette && (!form.valeur || Number(form.valeur) <= 0)) {
      alert("Montant déclaré requis (> 0 DA)");
      return;
    }
    setSaving(true);
    try {
      const session = getSession();
      const agentNom = session?.user?.nom || "agent";
      const payload = { ...form, agent: agentNom };
      if (payload.valeur !== "") payload.valeur = Number(payload.valeur) || 0;
      if (medias.length > 0) payload.piece_jointe = JSON.stringify(medias);
      const res = await api.addRapport(payload);
      if (res.ok) {
        // DÉPÔT RECETTE → aussi créer dans nc_recettes_v2
        if (isDepotRecette) {
          const today = new Date().toLocaleDateString("fr-CA", { timeZone: "Africa/Algiers" });
          try {
            await fetch("/api/recettes", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                token:          getRawToken() || "",
                agent:          agentNom,
                date_recette:   today,
                montant_declare: Number(form.valeur),
                notes:          form.description || null,
              }),
            });
          } catch (syncErr) {
            console.warn("[DÉPÔT RECETTE] sync nc_recettes_v2 failed:", syncErr.message);
          }
        }
        logRapport(
          agentNom,
          form.product_name || form.categorie,
          form.cas,
          form.description,
          form.order_id || ""
        );
        onCreated(res.report_id);
        onClose();
      } else alert(res.error || "Erreur");
    } catch { alert("Erreur réseau"); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white w-full sm:max-w-2xl max-h-[95vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between z-10">
          <h3 className="font-semibold text-gray-900">Nouveau rapport</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4">
          {/* Catégorie */}
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">Catégorie *</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.keys(SCHEMA).map(cat => {
                const c = catColor(cat);
                return (
                  <button key={cat} type="button"
                    onClick={() => handleCategorie(cat)}
                    className={`text-left px-3 py-2 rounded-xl border text-xs font-medium transition
                      ${form.categorie === cat ? `${c.bg} ${c.border} ${c.text} ring-2 ring-offset-1 ring-current` : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                    <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${c.dot}`} />
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cas */}
          {form.categorie && (
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">Cas *</label>
              <select value={form.cas} onChange={e => handleCas(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300">
                <option value="">— choisir —</option>
                {currentSchema.cas.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}

          {/* Type (CAISSE_OPERATION) */}
          {isCaisse && form.cas && currentTypes.length > 0 && (
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">Type</label>
              <select value={form.type} onChange={e => setF("type", e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300">
                <option value="">— choisir —</option>
                {currentTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          )}

          {/* Sévérité */}
          {!isCaisse && (
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">Sévérité</label>
              <div className="flex gap-2">
                {["basse","moyenne","haute"].map(s => (
                  <button key={s} type="button" onClick={() => setF("severity", s)}
                    className={`flex-1 py-1.5 rounded-xl text-xs font-semibold border transition
                      ${form.severity === s ? (s==="haute" ? "bg-red-100 border-red-300 text-red-700" : s==="moyenne" ? "bg-amber-100 border-amber-300 text-amber-800" : "bg-green-100 border-green-300 text-green-700") : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                    {s.charAt(0).toUpperCase()+s.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Produit (recherche) */}
          {needProduit && (
            <div className="relative" ref={prodRef}>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">Produit concerné</label>
              <input type="text" placeholder="Rechercher un produit…" value={productSearch}
                onChange={e => { setProductSearch(e.target.value); setProductOpen(true); }}
                onFocus={() => setProductOpen(true)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300" />
              {form.product_name && (
                <div className="mt-1 text-xs text-green-700 font-medium flex items-center gap-1">
                  <span>✓</span> <span>{form.product_name}</span>
                  <button type="button" onClick={() => { setF("product_name",""); setF("product_variant_id",""); setProductSearch(""); }}
                    className="ml-auto text-gray-400 hover:text-red-500">✕</button>
                </div>
              )}
              {productOpen && filteredProducts.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-20 bg-white border border-gray-200 rounded-xl shadow-lg mt-1 max-h-48 overflow-y-auto">
                  {filteredProducts.map(v => (
                    <button key={v.variant_id} type="button"
                      onClick={() => { setF("product_name", v.display_name); setF("product_variant_id", v.variant_id); setProductSearch(v.display_name); setProductOpen(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left">
                      {v.image_url && <img src={v.image_url} alt="" className="w-8 h-8 object-cover rounded-lg shrink-0" />}
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-800 truncate">{v.display_name}</p>
                        <p className="text-[10px] text-gray-400">Stock: {v.inventory_quantity}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tracking */}
          {needTracking && (
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">N° Tracking</label>
              <input type="text" value={form.tracking} onChange={e => setF("tracking", e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300" />
            </div>
          )}

          {/* Recherche commande POS (recette) */}
          {needOrderId && (
            <div className="relative" ref={posRef}>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">
                Numéro de la dernière commande POS
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Rechercher par N° commande ou nom client…"
                  value={posSearch}
                  onChange={e => handlePosSearch(e.target.value)}
                  onFocus={() => { setPosOpen(true); if (!posOrders.length) handlePosSearch(""); }}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 pr-8"
                />
                {posLoading && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                )}
              </div>
              {form.order_id && (
                <div className="mt-1 text-xs text-green-700 font-medium flex items-center gap-1">
                  <span>✓ Sélectionné :</span>
                  <span className="font-mono">{form.order_id}</span>
                  {form.valeur && <span className="ml-1 text-gray-500">— {Number(form.valeur).toLocaleString("fr-DZ")} DA</span>}
                  <button type="button" onClick={() => { setF("order_id",""); setF("valeur",""); setPosSearch(""); }}
                    className="ml-auto text-gray-400 hover:text-red-500">✕</button>
                </div>
              )}
              {posOpen && !form.order_id && (
                <div className="absolute top-full left-0 right-0 z-30 bg-white border border-gray-200 rounded-xl shadow-xl mt-1 max-h-60 overflow-y-auto">
                  {posOrders.length === 0 && !posLoading && (
                    <div className="px-4 py-3 text-xs text-gray-400 text-center">Aucune commande POS trouvée</div>
                  )}
                  {posOrders.map(order => (
                    <button key={order.order_id} type="button"
                      onClick={() => selectPosOrder(order)}
                      className="w-full flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-gray-50 text-left border-b border-gray-50 last:border-0">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-gray-800 font-mono">{order.order_id}</p>
                        <p className="text-[11px] text-gray-500 truncate">{order.customer_name || "—"}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs font-semibold text-green-700">{Number(order.order_total || 0).toLocaleString("fr-DZ")} DA</p>
                        <p className="text-[10px] text-gray-400">{fmtHour(order.order_date)}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Fournisseur */}
          {needFournisseur && (
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">Fournisseur</label>
              <select value={form.fournisseur} onChange={e => setF("fournisseur", e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300">
                <option value="">— choisir —</option>
                {FOURNISSEURS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          )}

          {/* Valeur (caisse / dépôt recette) */}
          {needValeur && (
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">
                {isDepotRecette ? "Montant déclaré (DA) *" : "Montant (DA)"}
              </label>
              {isDepotRecette && (
                <p className="text-[11px] text-emerald-600 mb-1.5">
                  Saisissez le total d'argent que vous avez encaissé aujourd'hui via le POS.
                </p>
              )}
              <input type="number" min="0" step="any" value={form.valeur}
                onChange={e => setF("valeur", e.target.value)}
                required={isDepotRecette}
                placeholder={isDepotRecette ? "ex: 45000" : ""}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300" />
            </div>
          )}

          {/* Description */}
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">Description *</label>
            <textarea rows={3} value={form.description} onChange={e => setF("description", e.target.value)} required
              placeholder="Décrivez le problème ou la suggestion…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 resize-none" />
          </div>

          {/* Action taken */}
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">Action déjà prise</label>
            <textarea rows={2} value={form.action_taken} onChange={e => setF("action_taken", e.target.value)}
              placeholder="Ce que vous avez déjà fait…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 resize-none" />
          </div>

          {/* Action needed */}
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">Action requise</label>
            <textarea rows={2} value={form.action_needed} onChange={e => setF("action_needed", e.target.value)}
              placeholder="Ce que vous demandez…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 resize-none" />
          </div>

          {/* Pièces jointes */}
          <MediaUploader medias={medias} onChange={setMedias} />

          {/* Footer */}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 text-sm text-gray-600 rounded-xl hover:bg-gray-50 transition">
              Annuler
            </button>
            <button type="submit" disabled={saving || !form.categorie || !form.cas || !form.description}
              className="flex-1 py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 disabled:opacity-50 transition">
              {saving ? "Envoi…" : "Soumettre le rapport"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Panneau de détail d'un rapport ─────────────────────────────────
function DetailPanel({ rapport, onClose, user, onUpdated, variants }) {
  const [mgNote, setMgNote] = useState(String(rapport.manager_note || ""));
  const [saving, setSaving] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);
  const isManager = MANAGER_ROLES.has(user?.role);
  const c = catColor(rapport.categorie);

  // Recherche du variant pour afficher l'image
  const matchedVariant = rapport.product_name
    ? variants.find(v => v.display_name === rapport.product_name || v.variant_id === rapport.product_variant_id)
    : null;

  // Marquer comme lu à l'ouverture
  useEffect(() => {
    const readers = String(rapport.status || "").split(",").map(s => s.trim()).filter(Boolean);
    if (!readers.includes(user?.nom)) {
      setMarkingRead(true);
      api.updateRapport(rapport.report_id, { mark_read: true })
        .then(r => { if (r.ok) onUpdated(rapport.report_id, { status: [...readers, user.nom].join(",") }); })
        .finally(() => setMarkingRead(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rapport.report_id]);

  async function handleVerify(v) {
    setSaving(true);
    const res = await api.updateRapport(rapport.report_id, { verified: v }).catch(() => null);
    if (res?.ok) onUpdated(rapport.report_id, { verified: v });
    setSaving(false);
  }

  async function saveNote() {
    setSaving(true);
    const res = await api.updateRapport(rapport.report_id, { manager_note: mgNote }).catch(() => null);
    if (res?.ok) onUpdated(rapport.report_id, { manager_note: mgNote });
    setSaving(false);
  }

  const Field = ({ label, value, mono }) => value ? (
    <div>
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
      <p className={`text-sm text-gray-800 ${mono ? "font-mono" : ""}`}>{String(value)}</p>
    </div>
  ) : null;

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex justify-end" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white w-full sm:w-[480px] h-full overflow-y-auto shadow-2xl flex flex-col">
        {/* Header */}
        <div className={`${c.bg} border-b ${c.border} px-5 py-4`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className={`inline-block w-2.5 h-2.5 rounded-full ${c.dot}`} />
              <span className={`text-xs font-semibold ${c.text}`}>{rapport.categorie}</span>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700">✕</button>
          </div>
          <p className="text-sm font-bold text-gray-900">{rapport.cas}</p>
          {rapport.type && <p className="text-xs text-gray-500 mt-0.5">{rapport.type}</p>}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {rapport.severity && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${SEV_BADGE[rapport.severity] || "bg-gray-100 text-gray-600"}`}>
                {rapport.severity}
              </span>
            )}
            {rapport.verified && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">✓ Vérifié</span>
            )}
            {markingRead && <span className="text-[10px] text-gray-400">lecture…</span>}
          </div>
        </div>

        {/* Corps */}
        <div className="flex-1 px-5 py-5 space-y-4">
          {/* Médias pièces jointes */}
          {(() => {
            const items = parseMedia(rapport.piece_jointe || rapport["piece jointe"] || "");
            if (!items.length) return null;
            return (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Pièces jointes ({items.length})</p>
                <div className="space-y-2">
                  {items.map((item, i) => <MediaViewer key={i} item={item} />)}
                </div>
              </div>
            );
          })()}

          {/* Image produit si disponible (fallback) */}
          {matchedVariant?.image_url && !parseMedia(rapport.piece_jointe || rapport["piece jointe"] || "").length && (
            <div className="w-full rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center">
              <img src={matchedVariant.image_url} alt={rapport.product_name}
                className="max-w-full max-h-56 object-contain" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field label="Agent" value={rapport.agent} />
            <Field label="Date" value={fmtDate(rapport.created_at)} />
            {rapport.order_id  && <Field label="Commande"   value={rapport.order_id}  mono />}
            {rapport.tracking  && <Field label="Tracking"   value={rapport.tracking}  mono />}
            {rapport.product_name && <Field label="Produit" value={rapport.product_name} />}
            {rapport.fournisseur  && <Field label="Fournisseur" value={rapport.fournisseur} />}
            {rapport.valeur !== "" && rapport.valeur !== undefined && (
              <Field label="Montant" value={Number(rapport.valeur).toLocaleString("fr-DZ") + " DA"} />
            )}
          </div>

          {rapport.description && (
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Description</p>
              <p className="text-sm text-gray-800 whitespace-pre-wrap bg-gray-50 rounded-xl p-3">{rapport.description}</p>
            </div>
          )}
          {rapport.action_taken && (
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Action prise</p>
              <p className="text-sm text-green-700 whitespace-pre-wrap bg-green-50 rounded-xl p-3">{rapport.action_taken}</p>
            </div>
          )}
          {rapport.action_needed && (
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Action requise</p>
              <p className="text-sm text-orange-700 whitespace-pre-wrap bg-orange-50 rounded-xl p-3">{rapport.action_needed}</p>
            </div>
          )}

          {/* Note manager */}
          {rapport.manager_note && !isManager && (
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Note responsable</p>
              <p className="text-sm text-gray-800 whitespace-pre-wrap bg-blue-50 rounded-xl p-3 border border-blue-100">{rapport.manager_note}</p>
            </div>
          )}

          {/* Actions manager */}
          {isManager && (
            <div className="border border-gray-100 rounded-2xl p-4 bg-gray-50 space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Zone responsable</p>
              <textarea rows={3} value={mgNote} onChange={e => setMgNote(e.target.value)}
                placeholder="Ajouter une note…"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 resize-none bg-white" />
              <div className="flex gap-2">
                <button onClick={saveNote} disabled={saving}
                  className="flex-1 bg-gray-900 text-white text-xs font-semibold py-2 rounded-xl hover:bg-gray-700 disabled:opacity-50 transition">
                  {saving ? "…" : "Sauvegarder la note"}
                </button>
                <button onClick={() => handleVerify(!rapport.verified)} disabled={saving}
                  className={`flex-1 text-xs font-semibold py-2 rounded-xl transition disabled:opacity-50
                    ${rapport.verified ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-amber-100 text-amber-800 hover:bg-amber-200"}`}>
                  {rapport.verified ? "✓ Vérifié" : "Marquer vérifié"}
                </button>
              </div>
            </div>
          )}

          {/* Lecteurs */}
          {rapport.status && (
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Lu par</p>
              <div className="flex flex-wrap gap-1">
                {String(rapport.status).split(",").map(s => s.trim()).filter(Boolean).map(nom => (
                  <span key={nom} className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{nom}</span>
                ))}
              </div>
            </div>
          )}

          <p className="text-[10px] text-gray-300 text-right">{rapport.report_id}</p>
        </div>
      </div>
    </div>
  );
}

// ── Carte rapport ──────────────────────────────────────────────────
function RapportCard({ rapport, user, onClick, onDelete, onUpdated, variants }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting,      setDeleting]      = useState(false);
  const [editingNote,   setEditingNote]   = useState(false);
  const [noteText,      setNoteText]      = useState(rapport.manager_note || "");
  const [savingNote,    setSavingNote]    = useState(false);
  const isOwner   = (user?.role || "").toLowerCase() === "owner";
  const isManager = MANAGER_ROLES.has((user?.role || "").toLowerCase());
  const c = catColor(rapport.categorie);
  const readers = String(rapport.status || "").split(",").map(s => s.trim()).filter(Boolean);
  const isUnread = !readers.includes(user?.nom);
  const matchedVariant = rapport.product_name
    ? variants.find(v => v.display_name === rapport.product_name)
    : null;

  useEffect(() => {
    setNoteText(rapport.manager_note || "");
  }, [rapport.manager_note]);

  async function handleSaveNote(e) {
    e.stopPropagation();
    setSavingNote(true);
    try {
      const res = await api.updateRapport(rapport.report_id, { manager_note: noteText });
      if (res?.ok) {
        onUpdated?.(rapport.report_id, { manager_note: noteText });
        setEditingNote(false);
      }
    } catch {}
    setSavingNote(false);
  }

  async function handleDelete(e) {
    e.stopPropagation();
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    try {
      const res = await api.deleteRapport(rapport.report_id);
      if (res.ok) {
        onDelete(rapport.report_id);
      } else {
        alert(res.error || "Erreur suppression");
        setConfirmDelete(false);
      }
    } catch { alert("Erreur réseau"); setConfirmDelete(false); }
    finally { setDeleting(false); }
  }

  return (
    <div onClick={onClick}
      className={`relative rounded-2xl border cursor-pointer transition hover:shadow-md hover:-translate-y-0.5 overflow-hidden
        ${isUnread ? "ring-2 ring-blue-400 ring-offset-1" : ""}
        ${c.border} bg-white`}>
      {/* Bande couleur catégorie */}
      <div className={`h-1 ${c.dot}`} />

      {/* Image / média */}
      {(() => {
        const items = parseMedia(rapport.piece_jointe || rapport["piece jointe"] || "");
        const firstImg = items.find(m => (m.type || mediaType(m.url)) === "image");
        const hasAudio = items.some(m => (m.type || mediaType(m.url)) === "audio");
        const hasVideo = items.some(m => (m.type || mediaType(m.url)) === "video");
        if (firstImg) return (
          <div className="relative bg-gray-100" style={{ aspectRatio: "4/3" }}>
            <img src={firstImg.url} alt=""
              className="w-full h-full object-contain"
              loading="lazy" />
            {items.length > 1 && (
              <span className="absolute bottom-1.5 right-1.5 bg-black/60 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                +{items.length - 1}
              </span>
            )}
          </div>
        );
        if (hasVideo) return (
          <div className={`h-20 ${c.bg} flex items-center justify-center gap-2`}>
            <span className="text-2xl">🎬</span>
            <span className={`text-xs font-medium ${c.text}`}>Vidéo jointe</span>
          </div>
        );
        if (hasAudio) return (
          <div className={`h-20 ${c.bg} flex items-center justify-center gap-2`}>
            <span className="text-2xl">🎙️</span>
            <span className={`text-xs font-medium ${c.text}`}>Vocal joint</span>
          </div>
        );
        if (matchedVariant?.image_url) return (
          <div className="bg-gray-50" style={{ aspectRatio: "4/3" }}>
            <img src={matchedVariant.image_url} alt=""
              className="w-full h-full object-contain"
              loading="lazy" />
          </div>
        );
        return (
          <div className={`h-20 ${c.bg} flex items-center justify-center`}>
            <span className="text-3xl opacity-30">{getCatEmoji(rapport.categorie)}</span>
          </div>
        );
      })()}

      {/* Contenu */}
      <div className="p-3">
        {/* Badges */}
        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${c.bg} ${c.text}`}>{rapport.categorie}</span>
          {rapport.severity && (
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${SEV_BADGE[rapport.severity] || ""}`}>{rapport.severity}</span>
          )}
          {rapport.verified && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">✓</span>}
          {isUnread && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">Nouveau</span>}
        </div>

        <p className="text-xs font-semibold text-gray-800 leading-tight mb-1 line-clamp-1">{rapport.cas}</p>
        {rapport.description && (
          <p className="text-[11px] text-gray-500 line-clamp-2 mb-2">{rapport.description}</p>
        )}
        {rapport.action_taken && (
          <p className="text-[10px] text-green-700 bg-green-50 rounded-lg px-2 py-1 line-clamp-1 mb-1">✓ {rapport.action_taken}</p>
        )}

        {/* Note manager — affichée sur la carte, style distinct */}
        {rapport.manager_note && !editingNote && (
          <div className="mt-2 bg-indigo-50 border border-indigo-200 rounded-xl p-2">
            <div className="flex items-center gap-1 mb-0.5">
              <span className="text-[9px] font-bold text-indigo-600 uppercase tracking-wider">✍ Note responsable</span>
              {isManager && (
                <button
                  onClick={e => { e.stopPropagation(); setEditingNote(true); }}
                  className="ml-auto text-[9px] text-indigo-400 hover:text-indigo-700 px-1 py-0.5 rounded hover:bg-indigo-100 transition">
                  Modifier
                </button>
              )}
            </div>
            <p className="text-[11px] text-indigo-900 font-medium line-clamp-3 whitespace-pre-wrap">{rapport.manager_note}</p>
          </div>
        )}

        {/* Édition inline note manager */}
        {isManager && editingNote && (
          <div className="mt-2" onClick={e => e.stopPropagation()}>
            <textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              rows={3}
              autoFocus
              placeholder="Correction / note responsable…"
              className="w-full border border-indigo-300 rounded-xl px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none bg-indigo-50"
              onClick={e => e.stopPropagation()}
            />
            <div className="flex gap-1.5 mt-1.5">
              <button onClick={handleSaveNote} disabled={savingNote}
                className="flex-1 bg-indigo-600 text-white text-[10px] font-semibold py-1 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition">
                {savingNote ? "…" : "Sauvegarder"}
              </button>
              <button
                onClick={e => { e.stopPropagation(); setEditingNote(false); setNoteText(rapport.manager_note || ""); }}
                className="flex-1 bg-gray-100 text-gray-600 text-[10px] font-semibold py-1 rounded-lg hover:bg-gray-200 transition">
                Annuler
              </button>
            </div>
          </div>
        )}

        {/* Bouton ajout note manager (si pas encore de note) */}
        {isManager && !rapport.manager_note && !editingNote && (
          <button
            onClick={e => { e.stopPropagation(); setEditingNote(true); }}
            className="mt-2 w-full text-[10px] text-indigo-500 border border-dashed border-indigo-200 rounded-xl py-1 hover:bg-indigo-50 transition">
            + Ajouter une correction
          </button>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-1.5">
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded-full bg-gray-200 flex items-center justify-center text-[9px] font-bold text-gray-600">
              {(rapport.agent || "?")[0].toUpperCase()}
            </div>
            <span className="text-[10px] text-gray-500">{rapport.agent}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-gray-400">{fmtDate(rapport.created_at)}</span>
            {isOwner && (
              confirmDelete ? (
                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition">
                    {deleting ? "…" : "Confirmer"}
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); setConfirmDelete(false); }}
                    className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 transition">
                    Annuler
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleDelete}
                  className="text-[10px] text-gray-300 hover:text-red-500 transition px-1"
                  title="Supprimer ce rapport">
                  🗑
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function getCatEmoji(cat) {
  const MAP = {
    "PRODUIT / COLIS":"📦","PRODUITS / STOCK / DEMANDE":"📊",
    "LIVRAISON / INCIDENT CLIENT":"🚚","OPS / PROCESS":"⚙️",
    "IT / MATÉRIEL":"💻","AMÉLIORATION / SUGGESTIONS":"💡","CAISSE_OPERATION":"💰",
  };
  return MAP[cat] || "📋";
}

// ── Page principale ────────────────────────────────────────────────
export default function RapportsPage() {
  const [rapports, setRapports]     = useState([]);
  const [variants, setVariants]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected]     = useState(null);
  const [toast, setToast]           = useState(null);
  const [user, setUser]             = useState(null);

  // Filtres
  const [filterCat,           setFilterCat]           = useState("");
  const [filterAgent,         setFilterAgent]         = useState("");
  const [filterDate,          setFilterDate]          = useState("");
  const [filterUnread,        setFilterUnread]        = useState(false);
  const [search,              setSearch]              = useState("");
  // Filtre par défaut : masque CAISSE_OPERATION + "Produit manquant dans la quota"
  const [excludeDefault,      setExcludeDefault]      = useState(true);

  const EXCLUDED_CATS = new Set(["CAISSE_OPERATION", "DÉPÔT RECETTE"]);
  const EXCLUDED_CAS  = "Produit manquant dans la quota";

  useEffect(() => {
    const s = getSession();
    setUser(s?.user || null);
    load();
    // Charger les variants en cache pour les images/recherche produit
    api.getVariantsCache().then(r => { if (r.ok) setVariants(r.rows || []); }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await api.getRapports();
      if (res.ok) setRapports(res.rows || []);
    } catch { setToast({ msg: "Erreur de chargement", type: "err" }); }
    finally { setLoading(false); }
  }

  function handleCreated(report_id) {
    setToast({ msg: "Rapport soumis ✓", type: "ok" });
    load();
  }

  function handleUpdated(report_id, fields) {
    setRapports(prev => prev.map(r => r.report_id === report_id ? { ...r, ...fields } : r));
    if (selected?.report_id === report_id) setSelected(prev => ({ ...prev, ...fields }));
  }

  function handleDeleted(report_id) {
    setRapports(prev => prev.filter(r => r.report_id !== report_id));
    if (selected?.report_id === report_id) setSelected(null);
    setToast({ msg: "Rapport supprimé ✓", type: "ok" });
  }

  // Agents uniques pour le filtre
  const agents = [...new Set(rapports.map(r => r.agent).filter(Boolean))].sort();

  // Filtrage
  const filtered = rapports.filter(r => {
    // Filtre par défaut : exclure CAISSE_OPERATION et "Produit manquant dans la quota"
    // sauf si l'utilisateur a explicitement sélectionné cette catégorie
    if (excludeDefault && !filterCat) {
      if (EXCLUDED_CATS.has(r.categorie)) return false;
      if (r.cas === EXCLUDED_CAS) return false;
    }
    if (filterCat   && r.categorie !== filterCat) return false;
    if (filterAgent && String(r.agent || "") !== filterAgent) return false;
    if (filterDate) {
      const d = r.created_at ? new Date(r.created_at).toISOString().slice(0,10) : "";
      if (d !== filterDate) return false;
    }
    if (filterUnread) {
      const readers = String(r.status || "").split(",").map(s => s.trim()).filter(Boolean);
      if (readers.includes(user?.nom)) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      if (!smartMatch(q, [r.cas, r.description, r.agent, r.product_name, r.categorie])) return false;
    }
    return true;
  });

  const unreadCount = rapports.filter(r => {
    const readers = String(r.status || "").split(",").map(s => s.trim()).filter(Boolean);
    return !readers.includes(user?.nom);
  }).length;

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Rapports</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {rapports.length} rapport{rapports.length !== 1 ? "s" : ""}
            {unreadCount > 0 && (
              <span className="ml-2 bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full">
                {unreadCount} non lu{unreadCount > 1 ? "s" : ""}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-500 transition" title="Rafraîchir">
            ↻
          </button>
          {["owner","chef d'equipe","responsable"].includes((user?.role||"").toLowerCase()) && (
            <button
              onClick={() => sendPushNotification({
                title: "📊 Nouveau rapport disponible",
                body: `${user?.nom || "Un responsable"} a publié un rapport. Consultez la section Rapports.`,
                url: "/dashboard/rapport",
                tag: "nouveau-rapport",
                excludeUser: user?.nom,
                fromUser: user?.nom,
                type: "rapport",
              })}
              className="border border-blue-200 text-blue-700 text-sm font-medium px-3 py-2 rounded-xl hover:bg-blue-50 transition"
              title="Notifier l'équipe qu'un rapport est disponible">
              🔔 Notifier
            </button>
          )}
          <button onClick={() => setShowCreate(true)}
            className="bg-gray-900 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-gray-700 transition">
            + Nouveau rapport
          </button>
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-6 space-y-3">
        <div className="flex flex-wrap gap-3">
          <input type="text" placeholder="🔍 Rechercher…" value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-[160px] border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300" />
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300">
            <option value="">Toutes catégories</option>
            {Object.keys(SCHEMA).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filterAgent} onChange={e => setFilterAgent(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300">
            <option value="">Tous les agents</option>
            {agents.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300" />
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={filterUnread} onChange={e => setFilterUnread(e.target.checked)}
              className="rounded" />
            <span className="text-sm text-gray-700">Afficher uniquement les non lus</span>
          </label>
          {/* Bouton filtre par défaut */}
          <button
            onClick={() => setExcludeDefault(v => !v)}
            className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg border transition
              ${excludeDefault
                ? "bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100"
                : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"}`}>
            {excludeDefault ? "🔒" : "🔓"}
            {excludeDefault ? "Caisse, recette & quota masqués" : "Tout afficher"}
          </button>
          {(filterCat || filterAgent || filterDate || search) && (
            <button onClick={() => { setFilterCat(""); setFilterAgent(""); setFilterDate(""); setSearch(""); setExcludeDefault(true); }}
              className="text-xs text-red-500 hover:text-red-700 underline">
              Réinitialiser les filtres
            </button>
          )}
          <span className="ml-auto text-xs text-gray-400">{filtered.length} résultat{filtered.length !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {/* Grille */}
      {loading ? (
        <div className="flex items-center justify-center py-24"><Spinner /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-24 text-gray-400">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-sm font-medium">
            {filterUnread && unreadCount === 0 ? "Tous les rapports ont été lus ✓" : "Aucun rapport trouvé"}
          </p>
          {filterUnread && unreadCount === 0 && (
            <button onClick={() => setFilterUnread(false)} className="mt-2 text-xs text-blue-600 underline">
              Afficher tous les rapports
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map(r => (
            <RapportCard key={r.report_id} rapport={r} user={user} variants={variants}
              onClick={() => setSelected(r)}
              onDelete={handleDeleted}
              onUpdated={handleUpdated} />
          ))}
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
          variants={variants}
        />
      )}
      {selected && (
        <DetailPanel
          rapport={selected}
          user={user}
          variants={variants}
          onClose={() => setSelected(null)}
          onUpdated={handleUpdated}
        />
      )}
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
