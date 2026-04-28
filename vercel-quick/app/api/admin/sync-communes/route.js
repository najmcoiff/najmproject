/**
 * GET /api/admin/sync-communes?token=DASHBOARD_TOKEN
 *
 * Peuple nc_communes depuis l'API ZR Express.
 * - Récupère toutes les wilayas (level=city)
 * - Pour chaque wilaya, récupère ses communes (level=district)
 * - Insère/met à jour dans nc_communes via UPSERT
 * - À appeler UNE SEULE FOIS (ou pour mettre à jour le référentiel)
 *
 * Owner only.
 */

import { createClient } from "@supabase/supabase-js";
import { NextResponse }  from "next/server";
import { verifyToken }   from "@/lib/server-auth";
import { ZR_BASE }       from "@/lib/zr-express";
import { COMMUNES_DZ, WILAYAS_DZ_INFO } from "@/lib/communes-dz";

const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function zrH() {
  return {
    "X-API-KEY":    process.env.ZR_API_KEY   || "",
    "X-Tenant":     process.env.ZR_TENANT_ID || "",
    "Content-Type": "application/json",
  };
}

async function zrSearch(keyword, pageSize = 100, pageNumber = 1) {
  const res = await fetch(`${ZR_BASE}/territories/search`, {
    method:  "POST",
    headers: zrH(),
    body:    JSON.stringify({ keyword: String(keyword), pageSize, pageNumber }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`ZR HTTP ${res.status}: ${errText.slice(0, 300)}`);
  }
  return await res.json();
}

export async function GET(request) {
  try {
    const token = new URL(request.url).searchParams.get("token") || "";
    const session = verifyToken(token);
    if (!session || session.role?.toLowerCase() !== "owner") {
      return NextResponse.json({ ok: false, error: "Owner only" }, { status: 401 });
    }

    const sb = createClient(SB_URL, SB_SKEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ── 1. Construire la liste depuis le dataset statique ─────────
    //    + enrichir avec les IDs ZR quand disponibles
    const rows = [];
    const errors = [];

    // Map ZR : commune_name_lower → { zr_wilaya_id, zr_commune_id }
    const zrMap = {};

    // Récupérer les zones ZR pour enrichir le dataset statique
    for (const [code, name] of WILAYAS_DZ_INFO) {
      try {
        const data = await zrSearch(name, 100, 1);
        const all  = data?.items || [];
        const wilayaItem = all.find(t => t.level === "city" && (Number(t.code) === code || t.name.toLowerCase() === name.toLowerCase()))
          || all.find(t => t.level === "city");
        const districts = all.filter(t => t.level === "district");

        if (wilayaItem && districts.length > 0) {
          for (const d of districts) {
            zrMap[d.name.toLowerCase().trim()] = {
              zr_wilaya_id:  wilayaItem.id,
              zr_commune_id: d.id,
            };
          }
        }
      } catch (e) {
        errors.push(`ZR W${code} ${name}: ${e.message.slice(0, 60)}`);
      }
    }

    // ── 2. Construire les lignes depuis le dataset statique ────────
    for (const [code, name] of WILAYAS_DZ_INFO) {
      const communes = COMMUNES_DZ[code] || [name];
      for (const communeName of communes) {
        const zr = zrMap[communeName.toLowerCase().trim()] || {};
        rows.push({
          wilaya_code:   code,
          wilaya_name:   name,
          commune_name:  communeName,
          zr_wilaya_id:  zr.zr_wilaya_id  || null,
          zr_commune_id: zr.zr_commune_id || null,
        });
      }
    }

    if (!rows.length) {
      return NextResponse.json({ ok: false, error: "Aucune commune récupérée" }, { status: 502 });
    }

    // ── 3. Vider la table puis insérer ────────────────────────────
    await sb.from("nc_communes").delete().neq("id", 0);

    // Insérer par batch de 500
    const BATCH = 500;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const { error } = await sb.from("nc_communes").insert(rows.slice(i, i + BATCH));
      if (error) {
        console.error("[sync-communes] Insert error:", error.message);
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }
      inserted += Math.min(BATCH, rows.length - i);
    }

    return NextResponse.json({
      ok:       true,
      wilayas:  58,
      communes: inserted,
      errors:   errors.slice(0, 10),
      msg:      `${inserted} communes insérées pour 58 wilayas`,
    });

  } catch (err) {
    console.error("[sync-communes] Error:", err.message);
    return NextResponse.json({ ok: false, error: String(err.message) }, { status: 500 });
  }
}
