import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import {
  generateSalt,
  hashPassword,
  generateToken,
} from "@/lib/customer-auth";
import { isValidAlgerianPhone, normalizePhone } from "@/lib/utils";

/**
 * POST /api/boutique/auth/register
 * Body: { phone, full_name, password, wilaya? }
 */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const { phone, full_name, password, wilaya } = body || {};

  if (!phone || !full_name || !password) {
    return NextResponse.json(
      { error: "Champs requis : phone, full_name, password" },
      { status: 400 }
    );
  }

  if (!isValidAlgerianPhone(phone)) {
    return NextResponse.json(
      { error: "رقم هاتف غير صالح (يجب أن يبدأ بـ 05 أو 06 أو 07)" },
      { status: 400 }
    );
  }

  if (password.length < 6) {
    return NextResponse.json(
      { error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" },
      { status: 400 }
    );
  }

  const normalizedPhone = normalizePhone(phone);
  const sb = createServiceClient();

  // Vérifier si le téléphone est déjà utilisé
  const { data: existing } = await sb
    .from("nc_customers")
    .select("id")
    .eq("phone", normalizedPhone)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: "رقم الهاتف مسجل بالفعل — حاول تسجيل الدخول" },
      { status: 409 }
    );
  }

  const salt = generateSalt();
  const hash = hashPassword(password, salt);

  const { data: customer, error } = await sb
    .from("nc_customers")
    .insert({
      phone: normalizedPhone,
      full_name: full_name.trim(),
      wilaya: wilaya || null,
      password_hash: hash,
      password_salt: salt,
    })
    .select("id, phone, full_name, wilaya, total_orders, created_at")
    .single();

  if (error) {
    console.error("register error:", error);
    return NextResponse.json(
      { error: "خطأ في إنشاء الحساب" },
      { status: 500 }
    );
  }

  const token = generateToken(customer.id);

  return NextResponse.json({ token, customer }, { status: 201 });
}
