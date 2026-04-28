/**
 * fixtures.js — Playwright fixtures NajmCoiff
 *
 * authedPage : page avec session nc_session injectée dans localStorage
 * sb         : client Supabase service-role pour vérifier la DB dans les tests
 */
import { test as base, expect } from "@playwright/test";
import fs   from "fs";
import path from "path";

const SESSION_FILE = path.join(process.cwd(), ".playwright-auth", "session.json");

const SB_URL = process.env.SB_URL || "https://alyxejkdtkdmluvgfnqk.supabase.co";
const SB_KEY = process.env.SB_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFseXhlamtkdGtkbWx1dmdmbnFrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTY1Mjk1NCwiZXhwIjoyMDkxMjI4OTU0fQ.WkNdrxkT1FNsqR1WuOY1XqviLnmEy0UCc9PhBnnqJOo";

function loadSession() {
  try {
    return JSON.parse(fs.readFileSync(SESSION_FILE, "utf-8"));
  } catch {
    throw new Error("Auth session not found. Run: npx playwright test --project=setup");
  }
}

/** Supabase REST helper — usable in any test */
export async function sbQuery(table, qs = "") {
  const res = await fetch(`${SB_URL}/rest/v1/${table}${qs ? "?" + qs : ""}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  return res.json();
}
export async function sbInsert(table, body) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json", Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });
  return res.json();
}
export async function sbPatch(table, filter, body) {
  await fetch(`${SB_URL}/rest/v1/${table}?${filter}`, {
    method: "PATCH",
    headers: {
      apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json", Prefer: "return=minimal",
    },
    body: JSON.stringify(body),
  });
}
export async function sbDelete(table, filter) {
  await fetch(`${SB_URL}/rest/v1/${table}?${filter}`, {
    method: "DELETE",
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
}

export const test = base.extend({
  authedPage: async ({ page }, use) => {
    const session = loadSession();
    await page.addInitScript((s) => {
      // localStorage en priorité (nouveau comportement), sessionStorage en fallback
      try { localStorage.setItem("nc_session", JSON.stringify(s)); } catch {}
      try { sessionStorage.setItem("nc_session", JSON.stringify(s)); } catch {}
    }, session);
    await use(page);
  },

  /** token JWT de la session courante */
  token: async ({}, use) => {
    const session = loadSession();
    await use(session.token);
  },
});

export { expect };
