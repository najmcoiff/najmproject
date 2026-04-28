"use client";

import { useState, useEffect, useCallback } from "react";

function fmt(n, dec = 0) {
  if (n === undefined || n === null || n === "") return "—";
  const num = Number(n);
  if (isNaN(num)) return "—";
  return num.toLocaleString("fr-DZ", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtDate(d) {
  if (!d) return "";
  try { return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return ""; }
}

function ProductThumb({ title }) {
  return (
    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center flex-shrink-0 text-indigo-600 font-bold text-sm">
      {(title || "?")[0].toUpperCase()}
    </div>
  );
}

export default function PortailFournisseur({ params }) {
  const [token, setToken] = useState(null);
  const [data, setData]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  // Prix saisis par le fournisseur : { [po_id_variant_id]: { prix, delai, disponible, note } }
  const [devisForm, setDevisForm] = useState({});
  const [submitting, setSubmitting] = useState({});
  const [submitted, setSubmitted]   = useState({});

  useEffect(() => {
    params.then ? params.then(p => setToken(p.token)) : setToken(params.token);
  }, [params]);

  const load = useCallback(async (t) => {
    if (!t) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/fournisseur/${t}`);
      const json = await res.json();
      if (!json.ok) { setError(json.error || "Erreur chargement"); return; }
      setData(json);

      // Pré-remplir les devis déjà soumis
      const prefill = {};
      json.bons?.forEach(bc => {
        bc.lines.forEach(l => {
          const key = `${bc.po_id}_${l.variant_id}`;
          if (l.devis) {
            prefill[key] = {
              prix:       l.devis.prix_unitaire ?? "",
              delai:      l.devis.delai_jours   ?? "",
              disponible: l.devis.disponible !== false,
              note:       l.devis.note          ?? "",
            };
          } else {
            prefill[key] = { prix: "", delai: "", disponible: true, note: "" };
          }
        });
      });
      setDevisForm(prefill);
    } catch (e) {
      setError("Erreur réseau : " + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (token) load(token); }, [token, load]);

  function updateDevis(poId, variantId, field, val) {
    const key = `${poId}_${variantId}`;
    setDevisForm(prev => ({ ...prev, [key]: { ...prev[key], [field]: val } }));
  }

  async function submitDevis(po_id, lines) {
    setSubmitting(p => ({ ...p, [po_id]: true }));
    try {
      const payload = lines.map(l => {
        const key = `${po_id}_${l.variant_id}`;
        const d = devisForm[key] || {};
        return {
          variant_id:    l.variant_id,
          product_title: l.product_title,
          prix_unitaire: Number(d.prix) || 0,
          delai_jours:   Number(d.delai) || null,
          disponible:    d.disponible !== false,
          note:          d.note || "",
        };
      });

      const res = await fetch(`/api/fournisseur/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ po_id, lines: payload }),
      });
      const json = await res.json();
      if (json.ok) {
        setSubmitted(p => ({ ...p, [po_id]: true }));
      } else {
        alert("Erreur : " + (json.error || "Réessayer"));
      }
    } catch (e) {
      alert("Erreur réseau : " + e.message);
    } finally {
      setSubmitting(p => ({ ...p, [po_id]: false }));
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Chargement…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-8 text-center max-w-sm w-full">
          <div className="text-4xl mb-3">🔒</div>
          <h1 className="font-bold text-gray-800 mb-2">Lien invalide</h1>
          <p className="text-sm text-gray-500">{error}</p>
          <p className="text-xs text-gray-400 mt-4">Contactez NajmCoiff pour obtenir un nouveau lien.</p>
        </div>
      </div>
    );
  }

  const { fournisseur, bons = [] } = data || {};

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            N
          </div>
          <div>
            <p className="font-bold text-gray-900 text-sm">NajmCoiff — Portail Fournisseur</p>
            <p className="text-xs text-gray-500">Bienvenue, <span className="font-semibold text-indigo-600">{fournisseur?.nom}</span></p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        {bons.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <div className="text-4xl mb-3">📋</div>
            <p className="font-semibold text-gray-700">Aucun bon de commande en attente</p>
            <p className="text-sm text-gray-400 mt-1">Revenez quand NajmCoiff vous envoie une demande de devis.</p>
          </div>
        )}

        {bons.map(bc => {
          const isSubmitted = submitted[bc.po_id];
          const isSubmitting = submitting[bc.po_id];

          return (
            <div key={bc.po_id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
              {/* BC Header */}
              <div className={`px-5 py-3.5 border-b border-gray-100 flex items-center justify-between ${isSubmitted ? "bg-green-50" : "bg-indigo-50"}`}>
                <div>
                  <span className="font-bold text-sm text-gray-800">{bc.po_id}</span>
                  <span className="text-xs text-gray-400 ml-3">📅 {fmtDate(bc.created_at)}</span>
                </div>
                {isSubmitted ? (
                  <span className="text-xs font-semibold text-green-700 bg-green-100 px-3 py-1 rounded-full border border-green-200">
                    ✅ Devis envoyé
                  </span>
                ) : (
                  <span className="text-xs font-semibold text-indigo-700 bg-white px-3 py-1 rounded-full border border-indigo-200">
                    ⏳ En attente de devis
                  </span>
                )}
              </div>

              {/* Instructions */}
              {!isSubmitted && (
                <div className="px-5 py-3 bg-amber-50 border-b border-amber-100 text-xs text-amber-700">
                  💡 Renseignez votre <strong>prix unitaire</strong>, le <strong>délai de livraison</strong> (en jours), et cochez si l'article est disponible.
                </div>
              )}

              {/* Lignes articles */}
              <div className="divide-y divide-gray-50">
                {bc.lines.map(line => {
                  const key = `${bc.po_id}_${line.variant_id}`;
                  const d = devisForm[key] || { prix: "", delai: "", disponible: true, note: "" };

                  return (
                    <div key={line.variant_id} className="px-5 py-4">
                      <div className="flex gap-3 mb-3">
                        <ProductThumb title={line.product_title} />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-gray-800 line-clamp-2">{line.product_title}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Quantité demandée : <strong className="text-gray-700">{fmt(line.qty_add)} unités</strong>
                          </p>
                        </div>
                      </div>

                      {isSubmitted ? (
                        <div className="bg-gray-50 rounded-xl px-3 py-2.5 text-xs text-gray-600 flex flex-wrap gap-x-4 gap-y-1">
                          <span>💰 Prix : <strong>{fmt(d.prix)} DA</strong></span>
                          <span>⏱ Délai : <strong>{d.delai ? `${d.delai} j` : "—"}</strong></span>
                          <span>{d.disponible ? "✅ Disponible" : "❌ Indisponible"}</span>
                          {d.note && <span>📝 {d.note}</span>}
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs text-gray-500 mb-1 block">Prix unitaire (DA) *</label>
                            <input
                              type="number"
                              min="0"
                              value={d.prix}
                              onChange={e => updateDevis(bc.po_id, line.variant_id, "prix", e.target.value)}
                              placeholder="0"
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 bg-white font-semibold"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 mb-1 block">Délai (jours)</label>
                            <input
                              type="number"
                              min="0"
                              value={d.delai}
                              onChange={e => updateDevis(bc.po_id, line.variant_id, "delai", e.target.value)}
                              placeholder="ex: 3"
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 bg-white"
                            />
                          </div>
                          <div className="col-span-2 flex items-center gap-3">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={d.disponible !== false}
                                onChange={e => updateDevis(bc.po_id, line.variant_id, "disponible", e.target.checked)}
                                className="w-4 h-4 accent-indigo-600"
                              />
                              <span className="text-xs text-gray-600 font-medium">Article disponible</span>
                            </label>
                          </div>
                          <div className="col-span-2">
                            <label className="text-xs text-gray-500 mb-1 block">Note (optionnel)</label>
                            <input
                              type="text"
                              value={d.note}
                              onChange={e => updateDevis(bc.po_id, line.variant_id, "note", e.target.value)}
                              placeholder="Variante disponible, délai variable…"
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 bg-white"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Footer submit */}
              {!isSubmitted && (
                <div className="px-5 py-4 border-t border-gray-100 bg-gray-50">
                  <button
                    onClick={() => submitDevis(bc.po_id, bc.lines)}
                    disabled={isSubmitting}
                    className="w-full bg-indigo-600 text-white font-semibold py-3 rounded-xl text-sm hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Envoi en cours…</>
                    ) : (
                      <>✅ Envoyer mon devis ({bc.lines.length} article{bc.lines.length > 1 ? "s" : ""})</>
                    )}
                  </button>
                </div>
              )}
            </div>
          );
        })}

        <p className="text-center text-xs text-gray-300 pb-4">
          Portail sécurisé NajmCoiff · Lien à usage unique
        </p>
      </div>
    </div>
  );
}
