// TYPO_AUDIT_OK
// =============================================================================
// Injection bon de commande → Shopify (stocks, coûts, prix, barcode, collections)
// Nom du fichier : préfixe 🔥🔥🔥🔥 (hors code). Journal : 🧾 | ✅ | ⚠️ | ❌
// =============================================================================

const SHOP_DOMAIN = "8fc262.myshopify.com";
const ADMIN_TOKEN = "REDACTED_LEGACY_TOKEN";
const SHOPIFY_API_VERSION = "2025-01";
const SHOP_CURRENCY = "DZD";
const GRAPHQL_ENDPOINT = `https://${SHOP_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

const PO_E = { INFO: "\uD83D\uDCC3", OK: "\u2705", WARN: "\u26A0\uFE0F", ERR: "\u274C" };

/**
 * @param {"info"|"ok"|"warn"|"err"} level
 * @param {string} fmt
 */
function poLog_(level, fmt) {
  const args = Array.prototype.slice.call(arguments, 2);
  const emoji = level === "ok" ? PO_E.OK : level === "warn" ? PO_E.WARN : level === "err" ? PO_E.ERR : PO_E.INFO;
  Logger.log("%s [PO] " + fmt, emoji, ...args);
}

function shopifyGraphQL(query, variables, idempotencyKey) {
  let resp;
  try {
    resp = UrlFetchApp.fetch(GRAPHQL_ENDPOINT, {
      method: "post",
      contentType: "application/json",
      headers: {
        "X-Shopify-Access-Token": ADMIN_TOKEN,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {})
      },
      payload: JSON.stringify({ query, variables }),
      muteHttpExceptions: true
    });
  } catch (fetchErr) {
    poLog_("err", "Appel réseau Shopify impossible : %s", String(fetchErr && fetchErr.message ? fetchErr.message : fetchErr));
    return { data: null, errors: [{ message: "NETWORK", body: String(fetchErr) }], userErrors: [], extensions: null };
  }
  const status = resp.getResponseCode();
  const contentText = resp.getContentText() || "";
  if (status !== 200) {
    poLog_("err", "HTTP %s — réponse tronquée : %s", status, contentText.slice(0, 500));
    return { data: null, errors: [{ message: "HTTP_" + status, body: contentText }], userErrors: [], extensions: null };
  }
  let json;
  try {
    json = JSON.parse(contentText || "{}");
  } catch (pe) {
    poLog_("err", "JSON Shopify illisible : %s", String(pe && pe.message ? pe.message : pe));
    return { data: null, errors: [{ message: "JSON_PARSE" }], userErrors: [], extensions: null };
  }
  const errors = (json && json.errors) || [];
  if (errors.length) poLog_("err", "Erreurs GraphQL : %s", JSON.stringify(errors));
  const data = (json && json.data) || null;
  const userErrors = extractUserErrors(data);
  if (userErrors && userErrors.length) {
    poLog_("warn", "userErrors Shopify : %s", JSON.stringify(userErrors.map(e => ({ field: e.field, message: e.message }))));
  }
  const ts = (((json || {}).extensions || {}).cost || {}).throttleStatus || {};
  const available = Number(ts.currentlyAvailable);
  const restoreRate = Number(ts.restoreRate);
  if (isFinite(available) && isFinite(restoreRate) && available < 100 && restoreRate > 0) {
    const deficit = Math.max(0, 100 - available);
    const sleepMs = Math.ceil((deficit / restoreRate) * 1000);
    poLog_("info", "Limitation API Shopify — jetons bas (dispo=%s, restauration=%s/s), pause %s ms", available, restoreRate, sleepMs);
    if (sleepMs > 0) Utilities.sleep(sleepMs);
  }
  return { data, errors, userErrors, extensions: json.extensions || null };
}

/**
 * Applique les lignes PO_LINES_V2 vers Shopify.
 * @returns {{
 *   ok: boolean,
 *   reason_code: string,
 *   message_fr: string,
 *   dry_run: boolean,
 *   pos_traites: number,
 *   pos_ignores_deja_ok: number,
 *   pos_en_echec: number,
 *   lignes_ok: number,
 *   lignes_ko: number,
 *   exception: (string|null)
 * }}
 */
function RUN_applyPO_toShopify() {
  const DRY_RUN = false;
  const out = {
    ok: false,
    reason_code: "INIT",
    message_fr: "",
    dry_run: DRY_RUN,
    pos_traites: 0,
    pos_ignores_deja_ok: 0,
    pos_en_echec: 0,
    lignes_ok: 0,
    lignes_ko: 0,
    exception: null
  };

  try {
    poLog_("info", "════════ Début injection bons de commande → Shopify ════════");
    poLog_("info", "Boutique : %s | devise stockée : %s | DRY_RUN = %s (%s)",
      SHOP_DOMAIN, SHOP_CURRENCY, DRY_RUN, DRY_RUN ? "aucune écriture Shopify" : "écriture réelle (push)");

    // Migré S6 : lecture depuis nc_po_lines (Supabase) — plus de feuille PO_LINES_V2
    let sbLines = [];
    try {
      const sbResp = UrlFetchApp.fetch(
        SB_URL_ + '/rest/v1/nc_po_lines?order=po_id.asc&limit=500&select=po_id,variant_id,quantite,prix_unitaire,fournisseur,statut,created_at&statut=neq.done',
        {
          method: 'get',
          headers: { 'apikey': SB_KEY_, 'Authorization': 'Bearer ' + SB_KEY_,
                     'Accept': 'application/json', 'Range-Unit': 'items', 'Range': '0-499' },
          muteHttpExceptions: true,
        }
      );
      sbLines = JSON.parse(sbResp.getContentText() || '[]');
    } catch (fetchErr) {
      out.reason_code = "SUPABASE_ERREUR";
      out.message_fr = "Impossible de lire nc_po_lines depuis Supabase : " + String(fetchErr);
      poLog_("err", "%s", out.message_fr);
      return out;
    }

    if (!sbLines || sbLines.length === 0) {
      out.ok = true;
      out.reason_code = "AUCUNE_DONNEE";
      out.message_fr = "nc_po_lines est vide ou toutes les lignes sont déjà traitées (statut=done) — rien à pousser.";
      poLog_("warn", "%s", out.message_fr);
      return out;
    }

    // Simuler les colonnes attendues par le reste du code
    const cPoId = 0; const cVariant = 1; const cQty = 2;
    const cCreated = 6; const cPurchase = -1; const cSell = 3;
    const cNote = -1; const cBarcode = -1; const cCollections = -1;

    const done = buildPoRunSuccessMap_();
    const data = sbLines.map(r => [
      r.po_id       || '',
      r.variant_id  || '',
      Number(r.quantite  || 0),
      Number(r.prix_unitaire || 0),
      r.fournisseur || '',
      r.statut      || '',
      r.created_at  || '',
    ]);

    const rowObjs = [];
    for (let i = 0; i < data.length; i++) {
      const r = data[i];
      const po = String(r[cPoId] || "").trim();
      const vRaw = String(r[cVariant] || "").trim();
      const qty = Number(r[cQty]);
      if (!po || !vRaw || !(qty > 0)) continue;
      let gid = vRaw;
      if (/^\d+$/.test(vRaw)) gid = `gid://shopify/ProductVariant/${vRaw}`;
      if (!gid.startsWith("gid://shopify/ProductVariant/")) {
        poLog_("warn", "Ligne %s (po_id=%s) : variant_id non reconnu (%s) — attendu GID ou ID numérique Shopify.", i + 1, po, vRaw);
      }
      rowObjs.push({ sheetRow: i + 1, cells: r, variantGid: gid });
    }

    if (!rowObjs.length) {
      out.ok = true;
      out.reason_code = "AUCUNE_LIGNE_VALIDE";
      out.message_fr = "Aucune ligne exploitable (po_id + variant_id + qty_add > 0 requis).";
      poLog_("warn", "%s", out.message_fr);
      return out;
    }

    poLog_("info", "%s ligne(s) valide(s) après filtrage — résolution des variantes Shopify…", rowObjs.length);

    const variantCache = new Map();
    const variantIds = [];
    rowObjs.forEach(o => {
      const gid = o.variantGid;
      if (!variantCache.has(gid)) {
        variantCache.set(gid, null);
        variantIds.push(gid);
      }
    });

    const gqlNodes = `
    query ($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on ProductVariant {
          id
          product { id }
          inventoryItem { id }
        }
      }
    }`;
    const batchSize = 50;
    for (let i = 0; i < variantIds.length; i += batchSize) {
      const batch = variantIds.slice(i, i + batchSize);
      const resp = shopifyGraphQL(gqlNodes, { ids: batch });
      const nodes = (resp.data && resp.data.nodes) || [];
      nodes.forEach(n => {
        if (!n || !n.id) return;
        const pid = n.product && n.product.id ? String(n.product.id) : "";
        const inv = n.inventoryItem && n.inventoryItem.id ? String(n.inventoryItem.id) : "";
        variantCache.set(n.id, { productId: pid, inventoryItemId: inv });
      });
    }

    const byPo = new Map();
    rowObjs.forEach(o => {
      const po = String(o.cells[cPoId]).trim();
      if (!byPo.has(po)) byPo.set(po, []);
      byPo.get(po).push(o);
    });

    let runFailed = false;

    byPo.forEach((list, poId) => {
      if (done.has(poId)) {
        out.pos_ignores_deja_ok++;
        poLog_("warn", "Bon po_id=%s déjà traité avec succès (Script Properties) — ignoré (idempotence).", poId);
        return;
      }

      out.pos_traites++;
      poLog_("info", "——— Bon po_id=%s | %s ligne(s) ———", poId, list.length);

      let stepFailed = false;
      const errTags = [];
      let successLines = 0;
      let failedLines = 0;

      list.forEach(o => {
        const rowIndex = o.sheetRow;
        const gid = o.variantGid;
        const r = o.cells;
        poLog_("info", "Ligne feuille %s | variante %s | qté +%s", rowIndex, gid, Number(r[cQty]) || 0);

        const payload = {
          po_id: poId,
          created_at: cCreated !== -1 ? r[cCreated] : "",
          variant_id: gid,
          qty_add: Number(r[cQty]) || 0,
          purchase_price: cPurchase !== -1 ? r[cPurchase] : "",
          sell_price: cSell !== -1 ? r[cSell] : "",
          note: cNote !== -1 ? r[cNote] : "",
          barcode: cBarcode !== -1 ? r[cBarcode] : "",
          collections_titles_pick: cCollections !== -1 ? r[cCollections] : "",
          meta: variantCache.get(gid) || {}
        };

        let lineFailed = false;

        if (payload.meta && payload.meta.inventoryItemId && payload.meta.productId) {
          poLog_("ok", "Étape 1/7 — Résolution IDs : productId=%s | inventoryItemId=%s", payload.meta.productId, payload.meta.inventoryItemId);
        } else {
          poLog_("err", "Étape 1/7 — Variante introuvable ou incomplète sur Shopify (product / inventoryItem manquant).");
          lineFailed = true;
          stepFailed = true;
          errTags.push("resolveVariantMeta");
        }

        let locationId;
        try {
          if (DRY_RUN) {
            locationId = "(DRY_RUN)";
            poLog_("ok", "Étape 2/7 — Emplacement : mode simulation (%s)", locationId);
          } else {
            locationId = getPrimaryLocationId();
            poLog_("ok", "Étape 2/7 — Emplacement principal Shopify : %s", locationId);
          }
        } catch (eLoc) {
          poLog_("err", "Étape 2/7 — Emplacement : %s", eLoc && eLoc.message ? eLoc.message : eLoc);
          lineFailed = true;
          stepFailed = true;
          errTags.push("getPrimaryLocationId");
          failedLines++;
          runFailed = true;
          out.lignes_ko++;
          poLog_("warn", "Ligne feuille %s : arrêt des étapes suivantes (stock impossible sans lieu).", rowIndex);
          return;
        }

        const invId = payload.meta.inventoryItemId;
        if (invId) {
          if (DRY_RUN) {
            poLog_("warn", "Étape 3/7 — Stock : DRY_RUN, delta prévu = %s", payload.qty_add);
          } else {
            try {
              const currentQty = getOnHandQty(invId, locationId);
              const delta = payload.qty_add;
              const newQty = Math.max(0, currentQty + (Number(delta) || 0));
              poLog_("ok", "Étape 3/7 — Stock : avant=%s | ajout=%s | cible on_hand=%s", currentQty, delta, newQty);
              const resStock = addStockDelta(invId, locationId, delta, "received", {
                po_id: poId,
                variant_id: gid,
                productId: payload.meta.productId || "",
                inventoryItemId: invId,
                locationId
              });
              if (resStock.userErrors.length || (resStock.errors && resStock.errors.length)) {
                poLog_("err", "Étape 3/7 — Stock : mutation refusée (voir détail mutation ci-dessus).");
                lineFailed = true;
                stepFailed = true;
                errTags.push("addStockDelta");
              }
            } catch (eSt) {
              poLog_("err", "Étape 3/7 — Stock : exception %s", eSt && eSt.message ? eSt.message : eSt);
              lineFailed = true;
              stepFailed = true;
              errTags.push("addStockDelta");
            }
          }

          if (DRY_RUN) {
            poLog_("warn", "Étape 4/7 — Coût d'achat : DRY_RUN, valeur feuille = %s", payload.purchase_price);
          } else {
            try {
              if (payload.purchase_price && Number(payload.purchase_price) > 0) {
                const resCost = updateInventoryItemCost(invId, payload.purchase_price, SHOP_CURRENCY, {
                  po_id: poId,
                  variant_id: gid,
                  productId: payload.meta.productId || "",
                  inventoryItemId: invId,
                  locationId
                });
                const hasNotImpl = (resCost.userErrors || []).some(u => u && u.message === "COST_UPDATE_NOT_IMPLEMENTED");
                if (hasNotImpl) {
                  poLog_("warn", "Étape 4/7 — Coût : non appliqué (fonction non disponible côté API pour ce compte).");
                } else if (resCost.userErrors.length || (resCost.errors && resCost.errors.length)) {
                  poLog_("err", "Étape 4/7 — Coût : erreur API.");
                  lineFailed = true;
                  stepFailed = true;
                  errTags.push("updateInventoryItemCost");
                } else {
                  poLog_("ok", "Étape 4/7 — Coût unitaire mis à jour : %s %s", payload.purchase_price, SHOP_CURRENCY);
                }
              } else {
                poLog_("warn", "Étape 4/7 — Coût : champ vide ou nul — étape ignorée.");
              }
            } catch (eC) {
              poLog_("err", "Étape 4/7 — Coût : %s", eC && eC.message ? eC.message : eC);
              lineFailed = true;
              stepFailed = true;
              errTags.push("updateInventoryItemCost");
            }
          }
        } else {
          poLog_("warn", "Étapes 3–4 — Pas d'inventoryItemId : stock et coût ignorés pour cette ligne.");
        }

        if (DRY_RUN) {
          const priceStr = formatPrice(payload.sell_price);
          poLog_("warn", "Étape 5/7 — Prix vente : DRY_RUN, valeur = %s", priceStr || "(invalide)");
        } else {
          try {
            const priceStr = formatPrice(payload.sell_price);
            if (!priceStr) {
              poLog_("warn", "Étape 5/7 — Prix vente : valeur invalide ou vide — ignoré.");
            } else if (Number(priceStr) > 0) {
              const resPrice = updateVariantSellPrice(gid, priceStr, {
                po_id: poId,
                variant_id: gid,
                productId: payload.meta.productId || "",
                inventoryItemId: invId || "",
                locationId
              });
              if (resPrice.userErrors.length || (resPrice.errors && resPrice.errors.length)) {
                poLog_("err", "Étape 5/7 — Prix vente : erreur API.");
                lineFailed = true;
                stepFailed = true;
                errTags.push("updateVariantSellPrice");
              } else {
                poLog_("ok", "Étape 5/7 — Prix vente public : %s", priceStr);
              }
            } else {
              poLog_("warn", "Étape 5/7 — Prix vente : nul ou négatif — ignoré.");
            }
          } catch (eP) {
            poLog_("err", "Étape 5/7 — Prix vente : %s", eP && eP.message ? eP.message : eP);
            lineFailed = true;
            stepFailed = true;
            errTags.push("updateVariantSellPrice");
          }
        }

        if (DRY_RUN) {
          poLog_("warn", "Étape 6/7 — Code-barres : DRY_RUN, valeur = %s", payload.barcode || "(vide)");
        } else {
          try {
            if (payload.barcode) {
              const resBc = updateVariantBarcodeIfNeeded(gid, String(payload.barcode), {
                po_id: poId,
                variant_id: gid,
                productId: payload.meta.productId || "",
                inventoryItemId: invId || "",
                locationId
              });
              if (resBc && (resBc.userErrors && resBc.userErrors.length || resBc.errors && resBc.errors.length)) {
                poLog_("err", "Étape 6/7 — Code-barres : erreur API.");
                lineFailed = true;
                stepFailed = true;
                errTags.push("updateVariantBarcode");
              } else {
                poLog_("ok", "Étape 6/7 — Code-barres : %s", payload.barcode);
              }
            } else {
              poLog_("warn", "Étape 6/7 — Code-barres : vide — ignoré.");
            }
          } catch (eB) {
            poLog_("err", "Étape 6/7 — Code-barres : %s", eB && eB.message ? eB.message : eB);
            lineFailed = true;
            stepFailed = true;
            errTags.push("updateVariantBarcode");
          }
        }

        if (DRY_RUN) {
          const titles = String(payload.collections_titles_pick || "").split(",").map(s => s.trim()).filter(Boolean);
          poLog_("warn", "Étape 7/7 — Collections : DRY_RUN, titres = [%s]", titles.join(", "));
        } else {
          try {
            if (payload.collections_titles_pick) {
              const titles = String(payload.collections_titles_pick).split(",").map(s => s.trim()).filter(Boolean);
              const colMap = resolveCollectionTitlesToIds(titles);
              const ids = [];
              colMap.forEach(v => {
                if (v && v.length) ids.push(...v);
              });
              if (payload.meta.productId && ids.length) {
                const resSync = syncProductCollections(payload.meta.productId, ids, {
                  po_id: poId,
                  variant_id: gid,
                  productId: payload.meta.productId || "",
                  inventoryItemId: invId || "",
                  locationId
                });
                if (resSync && resSync.userErrors && resSync.userErrors.length) {
                  poLog_("err", "Étape 7/7 — Collections : erreur lors de l'ajout/retrait.");
                  lineFailed = true;
                  stepFailed = true;
                  errTags.push("syncProductCollections");
                } else {
                  poLog_("ok", "Étape 7/7 — Collections synchronisées : %s", titles.join(" | "));
                }
              } else if (!ids.length && titles.length) {
                poLog_("warn", "Étape 7/7 — Collections : titres non résolus (ambigu ou introuvable) — ignoré.");
              } else {
                poLog_("warn", "Étape 7/7 — Collections : rien à appliquer.");
              }
            } else {
              poLog_("warn", "Étape 7/7 — Collections : colonne vide — ignoré.");
            }
          } catch (eCol) {
            poLog_("err", "Étape 7/7 — Collections : %s", eCol && eCol.message ? eCol.message : eCol);
            lineFailed = true;
            stepFailed = true;
            errTags.push("syncProductCollections");
          }
        }

        if (lineFailed) {
          failedLines++;
          runFailed = true;
          out.lignes_ko++;
          poLog_("warn", "Synthèse ligne feuille %s : ÉCHEC partiel ou total.", rowIndex);
        } else {
          successLines++;
          out.lignes_ok++;
          poLog_("ok", "Synthèse ligne feuille %s : OK.", rowIndex);
        }
      });

      if (stepFailed) out.pos_en_echec++;

      const status = stepFailed ? "FAILED" : "SUCCESS";
      const details = stepFailed ? errTags.filter((v, j, a) => a.indexOf(v) === j).join(" | ") : "ok";

      if (!stepFailed) {
        try {
          PropertiesService.getScriptProperties().setProperty("PO_OK_" + poId, new Date().toISOString());
        } catch (propErr) {
          poLog_("err", "Impossible d'écrire dans Script Properties pour po_id=%s : %s", poId, propErr && propErr.message ? propErr.message : propErr);
        }
      }

      poLog_(stepFailed ? "err" : "ok", "Bon po_id=%s : %s (%s ligne(s) OK, %s en échec). Détails : %s",
        poId, status, successLines, failedLines, details);
    });

    if (out.pos_traites === 0 && out.pos_ignores_deja_ok > 0) {
      out.ok = true;
      out.reason_code = "TOUS_DEJA_TRAITES";
      out.message_fr = "Tous les bons listés étaient déjà traités avec succès — aucun nouvel envoi.";
    } else if (out.pos_traites === 0) {
      out.ok = true;
      out.reason_code = "RIEN_A_TRAITER";
      out.message_fr = "Aucun bon de commande à traiter.";
    } else if (runFailed) {
      out.ok = false;
      out.reason_code = "ECHEC_PARTIEL";
      out.message_fr = "Au moins une ligne ou un bon a échoué — consulter les logs Apps Script.";
    } else {
      out.ok = true;
      out.reason_code = "SUCCESS";
      out.message_fr = "Injection terminée sans erreur signalée.";
    }

    poLog_("info", "════════ Fin injection ════════");
    poLog_(out.ok ? "ok" : "err", "Résumé : %s | bons poussés=%s | bons ignorés (déjà OK)=%s | bons avec échec=%s | lignes OK=%s | lignes KO=%s",
      out.message_fr, out.pos_traites, out.pos_ignores_deja_ok, out.pos_en_echec, out.lignes_ok, out.lignes_ko);

    return out;
  } catch (e) {
    out.ok = false;
    out.reason_code = "EXCEPTION";
    out.exception = String(e && e.stack ? e.stack : e);
    out.message_fr = "Exception inattendue pendant l'injection : " + (e && e.message ? e.message : String(e));
    poLog_("err", "%s", out.message_fr);
    return out;
  }
}

function getPrimaryLocationId() {
  const gql = `
    query {
      locations(first: 50, includeInactive: false) {
        nodes { id name isActive isPrimary }
      }
    }`;
  const resp = shopifyGraphQL(gql, {});
  const nodes = (((resp || {}).data || {}).locations || {}).nodes || [];
  const primary = nodes.find(n => n && n.isPrimary) || nodes.find(n => n && n.isActive);
  if (!primary || !primary.id) {
    poLog_("err", "Aucun emplacement actif ou principal trouvé sur Shopify.");
    throw new Error("No active Shopify location found");
  }
  return primary.id;
}

function RESET_primaryLocationCache() {}

function getOnHandQty(inventoryItemId, locationId) {
  const itemGid = String(inventoryItemId || "").startsWith("gid://") ? String(inventoryItemId) : `gid://shopify/InventoryItem/${inventoryItemId}`;
  const locGid = String(locationId || "").startsWith("gid://") ? String(locationId) : `gid://shopify/Location/${locationId}`;

  const parseQty = lvl => {
    const arr = (lvl && lvl.quantities) || [];
    const onHand = arr.find(q => q && q.name === "on_hand");
    const available = arr.find(q => q && q.name === "available");
    return onHand ? Number(onHand.quantity) : available ? Number(available.quantity) : 0;
  };

  const fetchLevel = () => {
    const q = `
      query ($iid: ID!, $lid: ID!) {
        inventoryItem(id: $iid) {
          inventoryLevel(locationId: $lid) {
            id
            quantities(names: ["available","on_hand"]) { name quantity }
          }
        }
      }`;
    const resp = shopifyGraphQL(q, { iid: itemGid, lid: locGid });
    const inv = resp.data && resp.data.inventoryItem;
    return (inv && inv.inventoryLevel) || null;
  };

  let lvl = fetchLevel();
  if (!lvl) {
    poLog_("info", "Article pas encore stocké à cet emplacement — activation inventoryItem=%s | lieu=%s", itemGid, locGid);
    const m = `
      mutation ($iid: ID!, $lid: ID!, $avail: Int!) {
        inventoryActivate(inventoryItemId: $iid, locationId: $lid, available: $avail) {
          inventoryLevel { id quantities(names:["available","on_hand"]){ name quantity } }
          userErrors { field message }
        }
      }`;
    const act = shopifyGraphQL(m, { iid: itemGid, lid: locGid, avail: 0 });
    const uerr = (((act || {}).data || {}).inventoryActivate || {}).userErrors || [];
    const alreadyActive = uerr.find(u => u && u.message === "Not allowed to set available quantity when the item is already active at the location.");
    if (alreadyActive) {
      poLog_("warn", "inventoryActivate ignoré : déjà actif sur ce lieu.");
    } else if (uerr.length) {
      poLog_("err", "inventoryActivate userErrors : %s", JSON.stringify(uerr));
    }
    lvl = (((act || {}).data || {}).inventoryActivate || {}).inventoryLevel || null;
    if (!lvl) lvl = fetchLevel();
    if (lvl) poLog_("ok", "Stock activé sur le lieu pour cet article.");
  }

  const qty = parseQty(lvl);
  return isFinite(qty) ? qty : 0;
}

function addStockDelta(inventoryItemId, locationId, delta, reason, ctx) {
  const itemGid = String(inventoryItemId || "").startsWith("gid://") ? String(inventoryItemId) : `gid://shopify/InventoryItem/${inventoryItemId}`;
  const locGid = String(locationId || "").startsWith("gid://") ? String(locationId) : `gid://shopify/Location/${locationId}`;
  const current = getOnHandQty(itemGid, locGid);
  const newQty = Math.max(0, current + (Number(delta) || 0));
  const quantityInput = {
    name: "on_hand",
    quantities: [{ inventoryItemId: itemGid, locationId: locGid, quantity: newQty }],
    reason: "correction",
    ignoreCompareQuantity: true
  };
  const m = `
    mutation ($input: InventorySetQuantitiesInput!) {
      inventorySetQuantities(input: $input) {
        inventoryAdjustmentGroup { createdAt reason referenceDocumentUri changes { name delta quantityAfterChange } }
        userErrors { field message code }
      }
    }`;
  const resp = shopifyGraphQL(m, { input: quantityInput });
  const userErrors = (((resp || {}).data || {}).inventorySetQuantities || {}).userErrors || [];
  logMutation_("inventorySetQuantities", { ...ctx, payload: { delta, newQty, input: quantityInput } }, userErrors, resp.errors || []);
  return { newQty, userErrors, errors: resp.errors || [] };
}

function updateVariantSellPrice(variantId, newPrice, ctx) {
  const priceStr = formatPrice(newPrice);
  const m = `
    mutation ($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        product { id }
        userErrors { field message }
      }
    }`;
  const resp = shopifyGraphQL(m, { productId: ctx.productId, variants: [{ id: variantId, price: priceStr }] });
  const userErrors = (((resp || {}).data || {}).productVariantsBulkUpdate || {}).userErrors || [];
  logMutation_("productVariantsBulkUpdate.price", { ...ctx, payload: { price: priceStr } }, userErrors, resp.errors || []);
  return { userErrors, errors: resp.errors || [] };
}

function updateVariantBarcodeIfNeeded(variantId, newBarcode, ctx) {
  const q = `query ($id: ID!) { productVariant(id: $id) { id barcode } }`;
  const current = shopifyGraphQL(q, { id: variantId });
  const variant = (current.data && current.data.productVariant) || null;
  const existing = variant && variant.barcode ? String(variant.barcode) : "";
  if (existing === String(newBarcode)) return { userErrors: [], errors: [] };
  const m = `
    mutation ($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        product { id }
        userErrors { field message }
      }
    }`;
  const resp = shopifyGraphQL(m, { productId: ctx.productId, variants: [{ id: variantId, barcode: String(newBarcode) }] });
  const userErrors = (((resp || {}).data || {}).productVariantsBulkUpdate || {}).userErrors || [];
  logMutation_("productVariantsBulkUpdate.barcode", { ...ctx, payload: { barcode: String(newBarcode) } }, userErrors, resp.errors || []);
  return { userErrors, errors: resp.errors || [] };
}

function updateInventoryItemCost(inventoryItemId, costAmount, currencyCode, ctx) {
  const invGid = String(inventoryItemId || "").startsWith("gid://") ? String(inventoryItemId) : `gid://shopify/InventoryItem/${inventoryItemId}`;
  const cost = Number(costAmount);
  if (!isFinite(cost) || cost <= 0) {
    logMutation_("inventoryItemUpdate.unitCost", { ...ctx, inventoryItemId: invGid, payload: { cost } }, [], []);
    return { userErrors: [], errors: [] };
  }
  const m = `
    mutation inventoryItemUpdate($id: ID!, $input: InventoryItemInput!) {
      inventoryItemUpdate(id: $id, input: $input) {
        inventoryItem { id unitCost { amount currencyCode } tracked }
        userErrors { field message }
      }
    }`;
  const resp = shopifyGraphQL(m, { id: invGid, input: { cost } });
  const userErrors = (((resp || {}).data || {}).inventoryItemUpdate || {}).userErrors || [];
  const inv = (((resp || {}).data || {}).inventoryItemUpdate || {}).inventoryItem || null;
  logMutation_("inventoryItemUpdate.unitCost", { ...ctx, inventoryItemId: invGid, payload: { cost } }, userErrors, resp.errors || []);
  if (!userErrors.length && !(resp.errors || []).length) {
    const uc = inv && inv.unitCost;
    if (uc && typeof uc.amount !== "undefined" && uc.currencyCode) {
      poLog_("ok", "Coût unitaire confirmé par Shopify : %s %s", uc.amount, uc.currencyCode);
    }
  }
  return { userErrors, errors: resp.errors || [] };
}

function syncProductCollections(productId, targetCollectionIds, ctx) {
  if (!productId) return { userErrors: [], errors: [] };
  const pid = String(productId).startsWith("gid://") ? String(productId) : `gid://shopify/Product/${productId}`;
  const cleanTargets = Array.from(new Set((targetCollectionIds || []).map(c => {
    const v = String(c || "").trim();
    if (!v) return "";
    return v.startsWith("gid://") ? v : `gid://shopify/Collection/${v}`;
  }).filter(Boolean)));

  const q = `
    query ($id: ID!) {
      product(id: $id) {
        id
        collections(first: 250) { nodes { id } }
      }
    }`;
  const resp = shopifyGraphQL(q, { id: pid });
  const currentIds = new Set(((resp?.data?.product?.collections?.nodes) || []).map(n => n.id).filter(Boolean));

  const targetSet = new Set(cleanTargets);
  const toAdd = cleanTargets.filter(id => !currentIds.has(id));
  const toRemove = Array.from(currentIds).filter(id => !targetSet.has(id));

  if (!toAdd.length && !toRemove.length) return { userErrors: [], errors: [] };

  if (toAdd.length) {
    const mAdd = `
      mutation ($id: ID!, $pids: [ID!]!) {
        collectionAddProducts(id: $id, productIds: $pids) { userErrors { field message } }
      }`;
    toAdd.forEach(colId => {
      const addResp = shopifyGraphQL(mAdd, { id: colId, pids: [pid] });
      const u = addResp?.data?.collectionAddProducts?.userErrors || [];
      logMutation_("collectionAddProducts", { ...ctx, productId: pid, payload: { collectionId: colId } }, u, addResp.errors || []);
    });
  }

  if (toRemove.length) {
    const mRem = `
      mutation ($id: ID!, $pids: [ID!]!) {
        collectionRemoveProducts(id: $id, productIds: $pids) { userErrors { field message } }
      }`;
    toRemove.forEach(colId => {
      const smartCheck = shopifyGraphQL(
        `query ($id: ID!) { collection(id: $id) { id ruleSet { rules { column relation condition } } } }`,
        { id: colId }
      );
      const isSmart = !!(smartCheck?.data?.collection?.ruleSet?.rules?.length);
      if (isSmart) {
        poLog_("warn", "Retrait collection intelligente ignoré (règles automatiques) : %s", colId);
        return;
      }
      const remResp = shopifyGraphQL(mRem, { id: colId, pids: [pid] });
      const u = remResp?.data?.collectionRemoveProducts?.userErrors || [];
      logMutation_("collectionRemoveProducts", { ...ctx, productId: pid, payload: { collectionId: colId } }, u, remResp.errors || []);
    });
  }
  return { userErrors: [], errors: [] };
}

function buildPoRunSuccessMap_() {
  const map = new Set();
  try {
    const all = PropertiesService.getScriptProperties().getProperties();
    Object.keys(all).forEach(function(k) {
      if (k.indexOf("PO_OK_") === 0) {
        const poId = k.slice(6);
        if (poId) map.add(poId);
      }
    });
  } catch (e) {
    poLog_("err", "Lecture Script Properties impossible : %s", e && e.message ? e.message : e);
  }
  return map;
}

function logMutation_(operationName, ctx, userErrors, errors) {
  const errList = [];
  if (Array.isArray(errors) && errors.length) errList.push(...errors.map(e => ({ message: e.message || e })));
  if (Array.isArray(userErrors) && userErrors.length) errList.push(...userErrors.map(e => ({ field: e.field, message: e.message })));
  const prefix = errList.length ? PO_E.ERR + " [mutation]" : PO_E.OK + " [mutation]";
  Logger.log("%s | po=%s | variante=%s | produit=%s | inventoryItem=%s | lieu=%s | charge=%s | erreurs=%s",
    prefix,
    operationName,
    ctx.po_id || "",
    ctx.variant_id || "",
    ctx.productId || "",
    ctx.inventoryItemId || "",
    ctx.locationId || "",
    JSON.stringify(ctx.payload || {}),
    JSON.stringify(errList));
}

var _collectionTitleCache = new Map();

function resolveCollectionTitlesToIds(titles) {
  if (!Array.isArray(titles)) return new Map();
  const cleaned = Array.from(new Set(titles.map(t => String(t || "").trim()).filter(Boolean)));
  const result = new Map();
  const toFetch = [];
  cleaned.forEach(t => {
    if (_collectionTitleCache.has(t)) {
      result.set(t, _collectionTitleCache.get(t));
    } else {
      toFetch.push(t);
    }
  });
  if (toFetch.length) {
    const queryStr = toFetch.map(t => `title:'${t.replace(/'/g, "\\'")}'`).join(" OR ");
    const q = `
      query ($q: String!) {
        collections(first: 250, query: $q) {
          nodes { id title handle }
        }
      }`;
    const resp = shopifyGraphQL(q, { q: queryStr });
    const nodes = (((resp || {}).data || {}).collections || {}).nodes || [];
    const grouped = new Map();
    nodes.forEach(n => {
      const tt = String(n.title || "").trim();
      if (!grouped.has(tt)) grouped.set(tt, []);
      grouped.get(tt).push(n);
    });
    toFetch.forEach(t => {
      const matches = grouped.get(t) || [];
      if (matches.length === 1) {
        const ids = [matches[0].id];
        _collectionTitleCache.set(t, ids);
        result.set(t, ids);
      } else if (matches.length > 1) {
        poLog_("warn", "Titre de collection ambigu « %s » — %s correspondances (précisez le handle ou l'ID).", t, matches.length);
        _collectionTitleCache.set(t, []);
        result.set(t, []);
      } else {
        _collectionTitleCache.set(t, []);
        result.set(t, []);
      }
    });
  }
  return result;
}

function extractUserErrors(data) {
  const acc = [];
  function walk(val) {
    if (!val) return;
    if (Array.isArray(val)) {
      val.forEach(walk);
      return;
    }
    if (typeof val === "object") {
      if (Array.isArray(val.userErrors)) acc.push(...val.userErrors.filter(Boolean));
      Object.keys(val).forEach(k => walk(val[k]));
    }
  }
  walk(data);
  return acc;
}

// RUN_PO_SELFTEST supprimé (S7) — plus de feuille PO_LINES_V2, lecture depuis nc_po_lines (Supabase)

function formatPrice(value) {
  const clean = String(value || "").trim().replace(",", ".");
  const num = Number(clean);
  if (!isFinite(num)) return "";
  return num.toFixed(2);
}
