import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { verifyPassword, generateToken } from "@/lib/customer-auth";
import { isValidAlgerianPhone, normalizePhone } from "@/lib/utils";

/**
 * POST /api/boutique/auth/login
 * Body: { phone, password }
 */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const { phone, password } = body || {};

  if (!phone || !password) {
    return NextResponse.json(
      { error: "رقم الهاتف وكلمة المرور مطلوبان" },
      { status: 400 }
    );
  }

  if (!isValidAlgerianPhone(phone)) {
    return NextResponse.json(
      { error: "رقم هاتف غير صالح" },
      { status: 400 }
    );
  }

  const normalizedPhone = normalizePhone(phone);
  const sb = createServiceClient();

  const { data: customer } = await sb
    .from("nc_customers")
    .select("id, phone, full_name, wilaya, total_orders, password_hash, password_salt, is_blocked")
    .eq("phone", normalizedPhone)
    .maybeSingle();

  if (!customer) {
    return NextResponse.json(
      { error: "رقم الهاتف غير مسجل — قم بإنشاء حساب" },
      { status: 404 }
    );
  }

  if (customer.is_blocked) {
    return NextResponse.json(
      { error: "هذا الحساب موقوف — تواصل مع الدعم" },
      { status: 403 }
    );
  }

  if (!customer.password_hash || !customer.password_salt) {
    return NextResponse.json(
      { error: "الحساب غير مكتمل — أنشئ حسابًا جديدًا" },
      { status: 400 }
    );
  }

  const valid = verifyPassword(password, customer.password_salt, customer.password_hash);
  if (!valid) {
    return NextResponse.json(
      { error: "كلمة المرور غير صحيحة" },
      { status: 401 }
    );
  }

  // Mettre à jour last_login
  await sb
    .from("nc_customers")
    .update({ last_login: new Date().toISOString() })
    .eq("id", customer.id);

  const token = generateToken(customer.id);

  const { password_hash, password_salt, is_blocked, ...safeCustomer } = customer;

  return NextResponse.json({ token, customer: safeCustomer });
}
