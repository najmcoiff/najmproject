import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyToken } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

function adminSB() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function authGuard(req) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  return await verifyToken(token);
}

// ─── GET /api/ai/wati-campaigns ──────────────────────────────────────────────
// Retourne : campaigns + templates + stats agrégés
export async function GET(req) {
  const user = await authGuard(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = adminSB();
  const { searchParams } = new URL(req.url);
  const view = searchParams.get("view") || "campaigns"; // campaigns | templates | stats

  try {
    if (view === "templates") {
      const { data: templates, error } = await sb
        .from("nc_wati_templates")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return NextResponse.json({ ok: true, templates });
    }

    if (view === "stats") {
      // Stats globales des campagnes
      const { data: campaigns } = await sb
        .from("nc_wati_campaigns")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      const { data: log_stats } = await sb
        .from("nc_wati_message_log")
        .select("campaign_id, status, converted_at, revenue_da, ab_variant")
        .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString());

      return NextResponse.json({ ok: true, campaigns: campaigns || [], log_stats: log_stats || [] });
    }

    // Vue par défaut : campaigns avec leurs stats
    const { data: campaigns, error } = await sb
      .from("nc_wati_campaigns")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;

    return NextResponse.json({ ok: true, campaigns: campaigns || [] });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─── POST /api/ai/wati-campaigns ─────────────────────────────────────────────
// Actions : create_campaign | create_template | launch | pause | end | ab_test | send_test
export async function POST(req) {
  const user = await authGuard(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["owner", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "Owner only" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { action } = body;
  const sb = adminSB();

  try {
    // ── Créer un nouveau template (proposé par le owner) ──────────────────────
    if (action === "create_template") {
      const { name, display_name, body_text, category, language, target_segment, world, notes } = body;
      if (!name || !body_text) {
        return NextResponse.json({ error: "name et body_text obligatoires" }, { status: 400 });
      }
      const templateName = name.toLowerCase().replace(/[^a-z0-9_]/g, "_");
      const { data, error } = await sb
        .from("nc_wati_templates")
        .insert({
          name: templateName,
          display_name: display_name || templateName,
          body_text,
          category: category || "MARKETING",
          language: language || "ar",
          target_segment,
          world,
          notes,
          proposed_by: user.nom || "owner",
          wati_status: "pending_creation",
        })
        .select()
        .single();
      if (error) throw error;
      return NextResponse.json({ ok: true, template: data });
    }

    // ── Créer une campagne WhatsApp ───────────────────────────────────────────
    if (action === "create_campaign") {
      const { name, description, template_a, template_b, is_ab_test, ab_split_pct, target_segment, world, test_mode } = body;
      if (!name || !template_a) {
        return NextResponse.json({ error: "name et template_a obligatoires" }, { status: 400 });
      }
      const { data, error } = await sb
        .from("nc_wati_campaigns")
        .insert({
          name,
          description,
          template_a,
          template_b: is_ab_test ? template_b : null,
          is_ab_test: !!is_ab_test,
          ab_split_pct: ab_split_pct || 50,
          target_segment,
          world,
          test_mode: test_mode !== false,
          created_by: user.nom || "owner",
        })
        .select()
        .single();
      if (error) throw error;
      return NextResponse.json({ ok: true, campaign: data });
    }

    // ── Envoyer un message test sur le numéro owner ───────────────────────────
    if (action === "send_test") {
      const { template_name, test_phone } = body;
      if (!template_name) return NextResponse.json({ error: "template_name requis" }, { status: 400 });

      const phone = (test_phone || "213542186574").replace(/\D/g, "");
      const watiUrl = process.env.WATI_API_URL?.trim();
      const watiToken = process.env.WATI_API_TOKEN?.trim();

      if (!watiUrl || !watiToken) {
        return NextResponse.json({ error: "WATI_API_URL ou WATI_API_TOKEN manquant" }, { status: 500 });
      }

      // Récupérer le template depuis WATI
      const listRes = await fetch(`${watiUrl}/api/v1/templates?pageSize=100&pageNumber=1`, {
        headers: { Authorization: `Bearer ${watiToken}` },
      });
      const listData = await listRes.json();
      const templates = listData?.result?.items || listData?.result || [];
      // Chercher avec ou sans le préfixe najm_
      const found = templates.find((t) =>
        t.elementName === template_name ||
        t.elementName === `najm_${template_name}` ||
        t.elementName === template_name.replace(/^najm_/, "")
      );

      if (!found) {
        return NextResponse.json({
          ok: false,
          error: `Template '${template_name}' introuvable dans WATI. Statut: non créé ou en attente d'approbation Meta.`,
          tip: "Crée d'abord le template dans WATI Dashboard puis attends l'approbation Meta (24-48h).",
        });
      }

      if (found.status !== "APPROVED") {
        return NextResponse.json({
          ok: false,
          error: `Template '${template_name}' non approuvé (statut: ${found.status}).`,
          tip: "Attends l'approbation Meta.",
        });
      }

      // Envoyer le message test avec paramètres fictifs
      const params = [
        { name: "1", value: "محمد بن علي (اختبار)" },
        { name: "2", value: "NC-TEST-001" },
        { name: "3", value: "test123" },
      ];
      const watiTemplateName = found.elementName; // nom exact dans WATI (ex: najm_order_followup)
      const sendRes = await fetch(`${watiUrl}/api/v1/sendTemplateMessage?whatsappNumber=${phone}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${watiToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ template_name: watiTemplateName, broadcast_name: `test_${watiTemplateName}`, parameters: params }),
      });
      const sendData = await sendRes.json();

      // Logger dans nc_wati_message_log
      await sb.from("nc_wati_message_log").insert({
        phone,
        template_name,
        params: { test: true, params },
        status: sendData.result ? "sent" : "failed",
        sent_at: new Date().toISOString(),
        error_message: sendData.result ? null : JSON.stringify(sendData),
      });

      return NextResponse.json({ ok: !!sendData.result, wati_response: sendData });
    }

    // ── Lancer une campagne (passe en 'active') ───────────────────────────────
    if (action === "launch") {
      const { campaign_id } = body;
      const { data, error } = await sb
        .from("nc_wati_campaigns")
        .update({ status: "active", launched_at: new Date().toISOString() })
        .eq("id", campaign_id)
        .select()
        .single();
      if (error) throw error;
      return NextResponse.json({ ok: true, campaign: data });
    }

    // ── Pauser une campagne ───────────────────────────────────────────────────
    if (action === "pause") {
      const { campaign_id } = body;
      const { data, error } = await sb
        .from("nc_wati_campaigns")
        .update({ status: "paused" })
        .eq("id", campaign_id)
        .select()
        .single();
      if (error) throw error;
      return NextResponse.json({ ok: true, campaign: data });
    }

    // ── Terminer une campagne + déclarer le gagnant A/B ───────────────────────
    if (action === "end") {
      const { campaign_id, winner } = body;
      const { data, error } = await sb
        .from("nc_wati_campaigns")
        .update({ status: "completed", ended_at: new Date().toISOString(), winner: winner || null })
        .eq("id", campaign_id)
        .select()
        .single();
      if (error) throw error;

      // Si gagnant déclaré → marquer le template comme winner
      if (winner) {
        const winnerTemplate = winner === "A" ? data.template_a : data.template_b;
        if (winnerTemplate) {
          await sb
            .from("nc_wati_templates")
            .update({ is_winner: true, is_active: true, updated_at: new Date().toISOString() })
            .eq("name", winnerTemplate);
        }
      }
      return NextResponse.json({ ok: true, campaign: data });
    }

    // ── Supprimer + Recréer les 6 templates avec UTF-8 correct ───────────────
    if (action === "recreate_templates") {
      const watiUrl = process.env.WATI_API_URL?.trim();
      const watiToken = process.env.WATI_API_TOKEN?.trim();
      if (!watiUrl || !watiToken) {
        return NextResponse.json({ error: "WATI_API_URL ou WATI_API_TOKEN manquant" }, { status: 500 });
      }

      // Corps exacts des 6 templates (UTF-8 natif Node.js)
      const TEMPLATES = [
        {
          name: "najm_order_followup",
          category: "UTILITY",
          body: "سلام {{1}}! 🚚\nطلبيتك رقم {{2}} راهي في الطريق 🚚\nتقدر تتبعها من هنا:\nhttps://www.najmcoiff.com/suivi/{{3}}\n\nإذا احتجت مساعدة رد على الرسالة.\nNAJMCOIFF — شكراً لثقتك 💪",
          example: { "1": "أحمد", "2": "NC-260416-001", "3": "ZR-2025-123456" },
        },
        {
          name: "najm_delivery_confirm",
          category: "UTILITY",
          body: "سلام {{1}}! 📦\nوصلتلك طلبيتك {{2}}؟ كلش مليح؟\nرد علينا:\n⭐ راضي\n❌ كاين مشكل\nرأيك يهمنا 🙏",
          example: { "1": "فاطمة", "2": "NC-260416-001" },
        },
        {
          name: "najm_reactivation_30",
          category: "MARKETING",
          body: "{{1}} رجعنا بعرض قوي 💪\n-15% على كامل الموقع\nكود: REACT30\nالعرض 7 أيام فقط\nwww.najmcoiff.com",
          example: { "1": "محمد" },
        },
        {
          name: "najm_reactivation_60",
          category: "MARKETING",
          body: "{{1}} رجعنا بعرض قوي 💪\n-15% على كامل الموقع\nكود: REACT60\nالعرض 7 أيام فقط\nwww.najmcoiff.com",
          example: { "1": "محمد" },
        },
        {
          name: "najm_cart_reminder",
          category: "MARKETING",
          body: "سلام {{1}}! 🛒\nالمنتجات لي حطيتهم مازالو في السلة.\nكمل الطلب من هنا:\nhttps://www.najmcoiff.com/commander",
          example: { "1": "سارة" },
        },
        {
          name: "najm_vip_exclusive",
          category: "MARKETING",
          body: "{{1}} 👑 أنت من زبائننا VIP\nعرض خاص:\n🎁 الكود VIPGOLDEN يعطيك تخفيض لمدة 48ساعة على كل منتجات الموقع",
          example: { "1": "أحمد" },
        },
      ];

      // Récupérer les IDs internes WATI pour chaque template
      const listRes2 = await fetch(`${watiUrl}/api/v1/templates?pageSize=100&pageNumber=1`, {
        headers: { Authorization: `Bearer ${watiToken}` },
      });
      const listData2 = await listRes2.json();
      const existingTemplates = listData2?.result?.items || listData2?.result || [];
      const idMap = {};
      for (const t of existingTemplates) {
        if (t.elementName) idMap[t.elementName] = t.id;
      }

      const results = [];

      for (const tmpl of TEMPLATES) {
        // 1. Supprimer l'ancien template par son ID interne WATI
        const watiId = idMap[tmpl.name];
        if (watiId) {
          try {
            // Essayer plusieurs endpoints de suppression
            const delRes = await fetch(`${watiUrl}/api/v1/deleteTemplate?templateId=${watiId}`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${watiToken}` },
            });
            if (!delRes.ok) {
              // Essayer avec le nom
              await fetch(`${watiUrl}/api/v1/deleteTemplate?templateName=${tmpl.name}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${watiToken}` },
              });
            }
            await new Promise(r => setTimeout(r, 1500));
          } catch (_) {}
        }

        // 2. Recréer avec UTF-8 correct
        const createBody = {
          elementName: tmpl.name,
          category: tmpl.category,
          languageCode: "ar",
          body: tmpl.body,
          customParams: Object.entries(tmpl.example).map(([k, v]) => ({ paramName: k, paramValue: v })),
          allowTemplateCategoryChange: true,
        };

        const createRes = await fetch(`${watiUrl}/api/v1/whatsApp/templates`, {
          method: "POST",
          headers: { Authorization: `Bearer ${watiToken}`, "Content-Type": "application/json" },
          body: JSON.stringify(createBody),
        });
        const createData = await createRes.json();

        // 3. Mettre à jour Supabase
        await sb.from("nc_wati_templates")
          .update({
            wati_status: "pending",
            meta_status: "pending",
            is_active: false,
            body_text: tmpl.body,
            updated_at: new Date().toISOString(),
          })
          .eq("name", tmpl.name);

        results.push({
          name: tmpl.name,
          ok: createData.ok !== false,
          wati_response: createData,
        });
      }

      return NextResponse.json({ ok: true, results, note: "Templates recréés — attendre approbation Meta 24-48h" });
    }

    // ── Créer les 6 templates v2 avec textes arabes corrects (UTF-8 natif) ─────
    if (action === "create_v2_templates") {
      const watiUrl = process.env.WATI_API_URL?.trim();
      const watiToken = process.env.WATI_API_TOKEN?.trim();
      if (!watiUrl || !watiToken) return NextResponse.json({ error: "WATI credentials manquants" }, { status: 500 });

      const V2_TEMPLATES = [
        {
          name: "najm_order_v2",
          category: "UTILITY",
          body: "سلام {{1}}! 🚚\nطلبيتك رقم {{2}} راهي في الطريق\nتقدر تتبعها من هنا:\nhttps://www.najmcoiff.com/suivi/{{3}}\n\nإذا احتجت مساعدة رد على الرسالة.\nNAJMCOIFF — شكراً لثقتك",
          customParams: [{ paramName: "1", paramValue: "أحمد بن علي" }, { paramName: "2", paramValue: "NC-260416-001" }, { paramName: "3", paramValue: "31-7FQDY4XDU5-ZR" }],
        },
        {
          name: "najm_delivery_v2",
          category: "UTILITY",
          body: "سلام {{1}}! 📦\nوصلتلك طلبيتك {{2}}؟ كلش مليح؟\nرد علينا:\n⭐ راضي\n❌ كاين مشكل\nرأيك يهمنا",
          customParams: [{ paramName: "1", paramValue: "فاطمة الزهراء" }, { paramName: "2", paramValue: "NC-260416-001" }],
        },
        {
          name: "najm_react30_v2",
          category: "MARKETING",
          body: "{{1}} رجعنا بعرض قوي\nتخفيضات على كامل الموقع\nكود: REACT30\nالعرض 7 أيام فقط\nwww.najmcoiff.com",
          customParams: [{ paramName: "1", paramValue: "محمد بن عمر" }],
        },
        {
          name: "najm_react60_v2",
          category: "MARKETING",
          body: "{{1}} رجعنا بعرض قوي\nتخفيضات على كامل الموقع\nكود: REACT60\nالعرض 7 أيام فقط\nwww.najmcoiff.com",
          customParams: [{ paramName: "1", paramValue: "محمد بن عمر" }],
        },
        {
          name: "najm_cart_v2",
          category: "MARKETING",
          body: "سلام {{1}}! 🛒\nالمنتجات لي حطيتهم مازالو في السلة.\nكمل الطلب من هنا:\nhttps://www.najmcoiff.com/commander",
          customParams: [{ paramName: "1", paramValue: "سارة بن عيسى" }],
        },
        {
          name: "najm_vip_v2",
          category: "MARKETING",
          body: "{{1}} أنت من زبائننا VIP 👑\nعرض خاص:\nالكود VIPGOLDEN يعطيك تخفيض لمدة 48 ساعة على كل منتجات الموقع\nwww.najmcoiff.com",
          customParams: [{ paramName: "1", paramValue: "أحمد بن علي" }],
        },
      ];

      // Supprimer les DRAFT v2 existants avant de recréer
      const lrClean = await fetch(`${watiUrl}/api/v1/templates?pageSize=100&pageNumber=1`, { headers: { Authorization: `Bearer ${watiToken}` } });
      const ldClean = await lrClean.json();
      const existingV2 = (ldClean?.result?.items || ldClean?.result || []).filter(t => t.elementName?.endsWith("_v2") && t.status === "DRAFT");

      for (const old of existingV2) {
        // Essayer de supprimer le DRAFT
        for (const delUrl of [
          `${watiUrl}/api/v1/whatsApp/templates/${old.id}`,
          `${watiUrl}/api/v1/whatsApp/templates?id=${old.id}`,
          `${watiUrl}/api/v1/template/${old.id}`,
        ]) {
          const dr = await fetch(delUrl, { method: "DELETE", headers: { Authorization: `Bearer ${watiToken}` } });
          if (dr.ok) break;
        }
        await new Promise(r => setTimeout(r, 800));
      }

      const createResults = [];
      for (const tmpl of V2_TEMPLATES) {
        // Format minimal qui a fonctionné lors de la création initiale
        const createPayload = {
          elementName: tmpl.name,
          category: tmpl.category,
          languageCode: "ar",
          body: tmpl.body,
          customParams: tmpl.customParams,
        };

        const createRes = await fetch(`${watiUrl}/api/v1/whatsApp/templates`, {
          method: "POST",
          headers: { Authorization: `Bearer ${watiToken}`, "Content-Type": "application/json" },
          body: JSON.stringify(createPayload),
        });

        const rawText = await createRes.text();
        let createData = {};
        try { createData = JSON.parse(rawText); } catch (_) { createData = { raw: rawText.substring(0, 300) }; }

        // Insérer/mettre à jour dans Supabase
        await sb.from("nc_wati_templates").upsert({
          name: tmpl.name,
          display_name: tmpl.name.replace(/_v2$/, "").replace(/_/g, " ") + " (v2)",
          body_text: tmpl.body,
          category: tmpl.category,
          language: "ar",
          wati_status: "pending",
          meta_status: "pending",
          is_active: false,
          proposed_by: "owner",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: "name" });

        createResults.push({
          name: tmpl.name,
          http_status: createRes.status,
          ok: createRes.ok,
          wati_response: createData,
        });
      }

      return NextResponse.json({ ok: true, createResults, note: "Templates v2 soumis à Meta — approbation 24-48h" });
    }

    // ── Éditer le contenu des templates DRAFT v2 ──────────────────────────────
    if (action === "edit_draft_v2") {
      const watiUrl = process.env.WATI_API_URL?.trim();
      const watiToken = process.env.WATI_API_TOKEN?.trim();
      if (!watiUrl || !watiToken) return NextResponse.json({ error: "WATI credentials manquants" }, { status: 500 });

      const CORRECT_BODIES_V2 = {
        najm_order_v2:    { body: "سلام {{1}}! 🚚\nطلبيتك رقم {{2}} راهي في الطريق\nتقدر تتبعها من هنا:\nhttps://www.najmcoiff.com/suivi/{{3}}\n\nإذا احتجت مساعدة رد على الرسالة.\nNAJMCOIFF — شكراً لثقتك", category: "UTILITY", params: [{ paramName: "1", paramValue: "أحمد بن علي" }, { paramName: "2", paramValue: "NC-260416-001" }, { paramName: "3", paramValue: "31-7FQDY4XDU5-ZR" }] },
        najm_delivery_v2: { body: "سلام {{1}}! 📦\nوصلتلك طلبيتك {{2}}؟ كلش مليح؟\nرد علينا:\n⭐ راضي\n❌ كاين مشكل\nرأيك يهمنا", category: "UTILITY", params: [{ paramName: "1", paramValue: "فاطمة الزهراء" }, { paramName: "2", paramValue: "NC-260416-001" }] },
        najm_react30_v2:  { body: "{{1}} رجعنا بعرض قوي\nتخفيضات على كامل الموقع\nكود: REACT30\nالعرض 7 أيام فقط\nwww.najmcoiff.com", category: "MARKETING", params: [{ paramName: "1", paramValue: "محمد بن عمر" }] },
        najm_react60_v2:  { body: "{{1}} رجعنا بعرض قوي\nتخفيضات على كامل الموقع\nكود: REACT60\nالعرض 7 أيام فقط\nwww.najmcoiff.com", category: "MARKETING", params: [{ paramName: "1", paramValue: "محمد بن عمر" }] },
        najm_cart_v2:     { body: "سلام {{1}}! 🛒\nالمنتجات لي حطيتهم مازالو في السلة.\nكمل الطلب من هنا:\nhttps://www.najmcoiff.com/commander", category: "MARKETING", params: [{ paramName: "1", paramValue: "سارة بن عيسى" }] },
        najm_vip_v2:      { body: "{{1}} أنت من زبائننا VIP 👑\nعرض خاص:\nالكود VIPGOLDEN يعطيك تخفيض لمدة 48 ساعة على كل منتجات الموقع\nwww.najmcoiff.com", category: "MARKETING", params: [{ paramName: "1", paramValue: "أحمد بن علي" }] },
      };

      // Récupérer les IDs WATI des DRAFT v2
      const lr = await fetch(`${watiUrl}/api/v1/templates?pageSize=100&pageNumber=1`, { headers: { Authorization: `Bearer ${watiToken}` } });
      const ld = await lr.json();
      const draftV2 = (ld?.result?.items || ld?.result || []).filter(t => CORRECT_BODIES_V2[t.elementName]);

      const editResults = [];
      for (const wt of draftV2) {
        const correct = CORRECT_BODIES_V2[wt.elementName];
        const payload = {
          id: wt.id,
          elementName: wt.elementName,
          category: correct.category,
          languageCode: "ar",
          body: correct.body,
          customParams: correct.params,
        };

        // Essayer plusieurs méthodes d'édition pour DRAFT
        let editOk = false;
        let lastResp = null;
        const attempts = [
          { m: "PUT",   u: `${watiUrl}/api/v1/whatsApp/templates/${wt.id}` },
          { m: "PATCH", u: `${watiUrl}/api/v1/whatsApp/templates/${wt.id}` },
          { m: "PUT",   u: `${watiUrl}/api/v1/whatsApp/templates` },
        ];
        for (const att of attempts) {
          const r = await fetch(att.u, {
            method: att.m,
            headers: { Authorization: `Bearer ${watiToken}`, "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const txt = await r.text();
          let d = {}; try { d = JSON.parse(txt); } catch (_) { d = { raw: txt.substring(0, 200) }; }
          lastResp = { method: att.m, url: att.u, status: r.status, data: d };
          if (r.ok && d.ok !== false) { editOk = true; break; }
        }
        editResults.push({ name: wt.elementName, id: wt.id, editOk, lastResp });
      }

      return NextResponse.json({ ok: true, editResults, found: draftV2.length });
    }

    // ── Soumettre les templates DRAFT à Meta pour approbation ─────────────────
    if (action === "submit_v2_templates") {
      const watiUrl = process.env.WATI_API_URL?.trim();
      const watiToken = process.env.WATI_API_TOKEN?.trim();
      if (!watiUrl || !watiToken) return NextResponse.json({ error: "WATI credentials manquants" }, { status: 500 });

      // Récupérer les IDs des templates DRAFT v2
      const lr = await fetch(`${watiUrl}/api/v1/templates?pageSize=100&pageNumber=1`, { headers: { Authorization: `Bearer ${watiToken}` } });
      const ld = await lr.json();
      const allTpls = ld?.result?.items || ld?.result || [];
      const draftV2 = allTpls.filter(t => t.elementName?.includes("_v2") && t.status === "DRAFT");

      const submitResults = [];
      for (const tmpl of draftV2) {
        // Essayer plusieurs endpoints de soumission
        const attempts = [
          { method: "POST", url: `${watiUrl}/api/v1/submitTemplate`, body: { id: tmpl.id, elementName: tmpl.elementName } },
          { method: "POST", url: `${watiUrl}/api/v1/whatsApp/templates/submit`, body: { templateId: tmpl.id } },
          { method: "PUT",  url: `${watiUrl}/api/v1/whatsApp/templates`, body: { id: tmpl.id, elementName: tmpl.elementName, status: "PENDING", body: tmpl.body, category: tmpl.category, languageCode: "ar", customParams: tmpl.customParams } },
        ];

        let submitOk = false;
        let lastResp = null;
        for (const att of attempts) {
          try {
            const r = await fetch(att.url, {
              method: att.method,
              headers: { Authorization: `Bearer ${watiToken}`, "Content-Type": "application/json" },
              body: JSON.stringify(att.body),
            });
            const txt = await r.text();
            let d = {}; try { d = JSON.parse(txt); } catch (_) { d = { raw: txt.substring(0, 200) }; }
            lastResp = { endpoint: att.url, method: att.method, status: r.status, data: d };
            if (r.ok && d.ok !== false && !d.error) { submitOk = true; break; }
          } catch (_) {}
        }
        submitResults.push({ name: tmpl.elementName, id: tmpl.id, submitOk, lastResp });
      }

      return NextResponse.json({ ok: true, submitResults, draftCount: draftV2.length });
    }

    // ── Tenter d'éditer le corps d'un template WATI existant ──────────────────
    if (action === "fix_templates_body") {
      const watiUrl = process.env.WATI_API_URL?.trim();
      const watiToken = process.env.WATI_API_TOKEN?.trim();
      if (!watiUrl || !watiToken) return NextResponse.json({ error: "WATI credentials manquants" }, { status: 500 });

      const CORRECT_BODIES = {
        najm_order_followup:  "سلام {{1}}! 🚚\nطلبيتك رقم {{2}} راهي في الطريق 🚚\nتقدر تتبعها من هنا:\nhttps://www.najmcoiff.com/suivi/{{3}}\n\nإذا احتجت مساعدة رد على الرسالة.\nNAJMCOIFF — شكراً لثقتك 💪",
        najm_delivery_confirm: "سلام {{1}}! 📦\nوصلتلك طلبيتك {{2}}؟ كلش مليح؟\nرد علينا:\n⭐ راضي\n❌ كاين مشكل\nرأيك يهمنا 🙏",
        najm_reactivation_30:  "{{1}} رجعنا بعرض قوي 💪\n-15% على كامل الموقع\nكود: REACT30\nالعرض 7 أيام فقط\nwww.najmcoiff.com",
        najm_reactivation_60:  "{{1}} رجعنا بعرض قوي 💪\n-15% على كامل الموقع\nكود: REACT60\nالعرض 7 أيام فقط\nwww.najmcoiff.com",
        najm_cart_reminder:    "سلام {{1}}! 🛒\nالمنتجات لي حطيتهم مازالو في السلة.\nكمل الطلب من هنا:\nhttps://www.najmcoiff.com/commander",
        najm_vip_exclusive:    "{{1}} 👑 أنت من زبائننا VIP\nعرض خاص:\n🎁 الكود VIPGOLDEN يعطيك تخفيض لمدة 48ساعة على كل منتجات الموقع",
      };

      // Récupérer les IDs
      const lr = await fetch(`${watiUrl}/api/v1/templates?pageSize=100&pageNumber=1`, { headers: { Authorization: `Bearer ${watiToken}` } });
      const ld = await lr.json();
      const tpls = ld?.result?.items || ld?.result || [];
      const idMap = {};
      for (const t of tpls) { if (t.elementName) idMap[t.elementName] = t.id; }

      const editResults = [];
      for (const [name, correctBody] of Object.entries(CORRECT_BODIES)) {
        const watiId = idMap[name];
        if (!watiId) { editResults.push({ name, error: "ID non trouvé" }); continue; }

        // Essayer plusieurs endpoints d'édition
        const endpoints = [
          { method: "PUT",   url: `${watiUrl}/api/v1/whatsApp/templates` },
          { method: "PUT",   url: `${watiUrl}/api/v1/template` },
          { method: "POST",  url: `${watiUrl}/api/v1/editTemplate` },
          { method: "POST",  url: `${watiUrl}/api/v1/whatsApp/templates/edit` },
        ];

        let editOk = false;
        let lastResp = null;
        for (const ep of endpoints) {
          try {
            const r = await fetch(ep.url, {
              method: ep.method,
              headers: { Authorization: `Bearer ${watiToken}`, "Content-Type": "application/json" },
              body: JSON.stringify({ id: watiId, elementName: name, body: correctBody, bodyOriginal: correctBody }),
            });
            const d = await r.json().catch(() => ({}));
            lastResp = { endpoint: ep.url, status: r.status, data: d };
            if (r.ok && d.ok !== false) { editOk = true; break; }
          } catch (_) {}
        }
        editResults.push({ name, watiId, editOk, lastResp });
      }

      return NextResponse.json({ ok: true, editResults });
    }

    // ── Synchroniser les statuts WATI → Supabase ──────────────────────────────
    if (action === "sync_wati_status") {
      const watiUrl = process.env.WATI_API_URL?.trim();
      const watiToken = process.env.WATI_API_TOKEN?.trim();
      if (!watiUrl || !watiToken) {
        return NextResponse.json({ error: "WATI_API_URL ou WATI_API_TOKEN manquant" }, { status: 500 });
      }

      // Récupérer tous les templates depuis WATI
      const listRes = await fetch(`${watiUrl}/api/v1/templates?pageSize=100&pageNumber=1`, {
        headers: { Authorization: `Bearer ${watiToken}` },
      });
      const listData = await listRes.json();
      const watiTemplates = listData?.result?.items || listData?.templates || listData?.items || [];

      // Mettre à jour nc_wati_templates selon ce qu'on trouve dans WATI
      const syncResults = [];
      for (const wt of watiTemplates) {
        const elementName = wt.elementName || wt.name || wt.template_name;
        const watiStatus = wt.status === "APPROVED" ? "approved" : wt.status === "REJECTED" ? "rejected" : "pending";
        const metaStatus = wt.status?.toLowerCase() || "pending";

        // Mettre à jour si existe dans notre table
        const { data: updated } = await sb
          .from("nc_wati_templates")
          .update({
            wati_status: watiStatus,
            meta_status: metaStatus,
            is_active: wt.status === "APPROVED",
            updated_at: new Date().toISOString(),
          })
          .eq("name", elementName)
          .select("id, name, wati_status")
          .single();

        syncResults.push({
          wati_name: elementName,
          wati_status: wt.status,
          updated_in_db: !!updated,
        });
      }

      return NextResponse.json({
        ok: true,
        wati_templates_count: watiTemplates.length,
        wati_templates: watiTemplates.map(t => ({
          name: t.elementName || t.name,
          status: t.status,
          category: t.category,
          language: t.language,
        })),
        sync_results: syncResults,
      });
    }

    // ── Lister les templates WATI bruts (sans modification DB) ────────────────
    if (action === "list_wati_raw") {
      const watiUrl = process.env.WATI_API_URL?.trim();
      const watiToken = process.env.WATI_API_TOKEN?.trim();
      if (!watiUrl || !watiToken) {
        return NextResponse.json({ error: "WATI_API_URL ou WATI_API_TOKEN manquant" }, { status: 500 });
      }
      const listRes = await fetch(`${watiUrl}/api/v1/templates?pageSize=100&pageNumber=1`, {
        headers: { Authorization: `Bearer ${watiToken}` },
      });
      const listData = await listRes.json();
      return NextResponse.json({ ok: true, raw: listData });
    }

    // ── Enregistrer le résultat d'un message (webhook WATI) ───────────────────
    if (action === "update_message_status") {
      const { wati_message_id, status, order_id, revenue_da } = body;
      const updateData = { status };
      if (status === "delivered") updateData.delivered_at = new Date().toISOString();
      if (status === "read") updateData.read_at = new Date().toISOString();
      if (status === "replied") updateData.replied_at = new Date().toISOString();
      if (status === "converted") {
        updateData.converted_at = new Date().toISOString();
        updateData.order_id = order_id;
        updateData.revenue_da = revenue_da || 0;
      }
      await sb.from("nc_wati_message_log").update(updateData).eq("wati_message_id", wati_message_id);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: `Action inconnue: ${action}` }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
