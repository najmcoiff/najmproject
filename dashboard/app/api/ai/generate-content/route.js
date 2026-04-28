import { NextResponse } from "next/server";
import { getServiceClient, cronGuard, logDecision } from "@/lib/ai-helpers";

export const dynamic = "force-dynamic";

const BRAND_SYSTEM_PROMPT = `Tu es le rédacteur marketing expert de NajmCoiff, une marque algérienne de vente en gros de produits de coiffure professionnelle et d'onglerie.

IDENTITÉ DE MARQUE :
- Nom : NajmCoiff (نجم كواف)
- Positionnement : grossiste professionnel pour salons de coiffure et d'onglerie en Algérie
- Clientèle : 85% B2B (salons de coiffure, ongleristes professionnels), 15% B2C
- Deux univers : Coiffure (masculin/neutre) et Onglerie (féminin, nail art)
- Ton : professionnel mais accessible, chaleureux et direct
- Livraison : partout en Algérie via ZR Express, COD
- Prix en DA (Dinar Algérien)
- WhatsApp : 0798 52 28 20
- Site : nc-boutique.vercel.app

RÈGLES :
- Arabe dialectal algérien (دارجة) pour les réseaux sociaux et WhatsApp
- Arabe standard (فصحى) pour les descriptions produits
- Noms de produits en français (jamais traduits)
- Ne jamais mélanger coiffure et onglerie dans le même post`;

async function callLLM(systemPrompt, userPrompt) {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) return null;

  const provider = process.env.AI_PROVIDER || "openai";
  const model = process.env.AI_MODEL || "gpt-4o";

  if (provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    const data = await res.json();
    return data.content?.[0]?.text || null;
  }

  // Default: OpenAI
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 1000,
    }),
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content || null;
}

export async function GET(req) { return POST(req); }

export async function POST(req) {
  if (!cronGuard(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const sb = getServiceClient();

  try {
    let body = {};
    try {
      body = await req.json();
    } catch {
      // Cron call with no body
    }

    const contentType = body.content_type || "social_post";
    const variantId = body.variant_id || null;
    const world = body.world || "coiffure";

    // Get products needing descriptions or best-sellers for social posts
    let products = [];
    if (contentType === "product_description" && variantId) {
      const { data } = await sb
        .from("nc_variants")
        .select("variant_id, product_title, price, world, collections_titles, description")
        .eq("variant_id", variantId)
        .single();
      if (data) products = [data];
    } else if (contentType === "product_description") {
      const { data } = await sb
        .from("nc_variants")
        .select("variant_id, product_title, price, world, collections_titles, description")
        .eq("status", "active")
        .or("description.is.null,description.eq.")
        .eq("world", world)
        .limit(10);
      products = data || [];
    } else {
      // Social posts — use top-scoring products
      const { data } = await sb
        .from("nc_ai_product_scores")
        .select("variant_id, health_score, sales_30d")
        .eq("score_date", new Date().toISOString().split("T")[0])
        .eq("world", world)
        .order("health_score", { ascending: false })
        .limit(3);

      if (data && data.length > 0) {
        const ids = data.map((d) => d.variant_id);
        const { data: variants } = await sb
          .from("nc_variants")
          .select("variant_id, product_title, price, world, image_url")
          .in("variant_id", ids);
        products = variants || [];
      }
    }

    if (products.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No products to generate content for",
      });
    }

    const generated = [];
    const llmModel = process.env.AI_MODEL || "gpt-4o";

    for (const product of products) {
      let userPrompt;
      if (contentType === "product_description") {
        userPrompt = `Génère une description de produit en arabe standard (فصحى) pour le site e-commerce.

PRODUIT :
- Nom : ${product.product_title}
- Prix : ${product.price} DA
- Catégorie : ${product.world} (${product.collections_titles || ""})
- Description existante : ${product.description || "aucune"}

FORMAT : 2-3 phrases, avantage principal, qualité professionnelle, appel à l'action subtil. Ne PAS mentionner le prix. Ne PAS traduire le nom du produit.`;
      } else {
        userPrompt = `Crée un post Instagram/Facebook en arabe dialectal algérien (دارجة) pour un produit.

PRODUIT :
- Nom : ${product.product_title}
- Prix : ${product.price} DA
- Univers : ${product.world}

FORMAT : Hook accrocheur (1 ligne avec emoji), 2-3 lignes description, CTA (lien site ou WhatsApp), 3-5 hashtags. Ton enthousiaste et professionnel.`;
      }

      const result = await callLLM(BRAND_SYSTEM_PROMPT, userPrompt);

      if (result) {
        const contentRow = {
          content_type: contentType,
          world: product.world || world,
          variant_id: product.variant_id,
          title: product.product_title,
          body_ar: result,
          body_fr: null,
          status: contentType === "product_description" ? "approved" : "draft",
          platform:
            contentType === "product_description" ? "boutique" : "instagram",
          llm_model: llmModel,
          prompt_used: userPrompt.slice(0, 500),
        };

        const { data: inserted } = await sb
          .from("nc_ai_content_queue")
          .insert(contentRow)
          .select("id")
          .single();

        // Auto-apply product descriptions
        if (
          contentType === "product_description" &&
          inserted &&
          result
        ) {
          await sb
            .from("nc_variants")
            .update({ description: result })
            .eq("variant_id", product.variant_id);
        }

        generated.push({
          id: inserted?.id,
          variant_id: product.variant_id,
          type: contentType,
        });
      }
    }

    await logDecision(sb, {
      agent: "content",
      decision_type: "generate_content",
      description: `Generated ${generated.length} ${contentType} pieces`,
      output_data: { generated: generated.length, type: contentType },
      impact: generated.length > 0 ? "medium" : "low",
    });

    return NextResponse.json({
      ok: true,
      generated: generated.length,
      items: generated,
    });
  } catch (err) {
    await logDecision(sb, {
      agent: "content",
      decision_type: "generate_content",
      description: "Content generation failed",
      error_message: err.message,
      success: false,
    });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
