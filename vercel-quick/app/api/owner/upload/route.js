import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { verifyToken } from "@/lib/server-auth";

const BUCKET = "product-images";

function userGuard(req) {
  const auth  = req.headers.get("authorization") || "";
  const token = auth.replace("Bearer ", "").trim() || req.nextUrl?.searchParams.get("token");
  return verifyToken(token);
}

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * POST /api/owner/upload
 * Body: FormData avec champ "file" (image/jpeg|png|webp|gif)
 * Retourne: { url: "https://..." }
 */
export async function POST(req) {
  if (!userGuard(req)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  let formData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Impossible de lire le formulaire" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Champ 'file' manquant" }, { status: 400 });
  }

  const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: "Type de fichier non autorisé (jpg/png/webp/gif uniquement)" }, { status: 400 });
  }

  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "Fichier trop volumineux (max 5 Mo)" }, { status: 400 });
  }

  // Nom de fichier unique : timestamp + slug du nom original
  const folder = ["articles", "collections"].includes(req.nextUrl?.searchParams.get("folder"))
    ? req.nextUrl.searchParams.get("folder")
    : "articles";
  const ext   = file.name.split(".").pop().toLowerCase();
  const slug  = file.name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9]/gi, "-").slice(0, 40).toLowerCase();
  const path  = `${folder}/${Date.now()}-${slug}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await sb()
    .storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType:  file.type,
      cacheControl: "3600",
      upsert:       false,
    });

  if (error) {
    console.error("[upload] Supabase Storage error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data } = sb().storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ ok: true, url: data.publicUrl, path });
}
