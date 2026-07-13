const { test, expect } = require("@playwright/test");

// Reproduit : client tape un code coiffeur dans la case du checkout.
test("code coiffeur saisi au checkout → banner 'sous garantie', pas 'invalide'", async ({ page }) => {
  const logs = [];
  page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));

  // 1. Ouvrir le site puis seed un panier
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.setItem("nc_cart", JSON.stringify([
      { variant_id: "49000227701032", product_id: "9384030372136", qty: 1, price: 750, title: "Wax test", image_url: "", max_qty: 10 },
    ]));
    localStorage.removeItem("nc_ambassadeur");
  });

  // 2. Aller au checkout
  await page.goto("/commander", { waitUntil: "networkidle" });

  // 3. Taper le code coiffeur
  const input = page.getByPlaceholder("أدخل الكود");
  await input.scrollIntoViewIfNeeded();
  await expect(input).toBeVisible({ timeout: 8000 });
  await input.fill("KARIM-TEST");

  // 4. Cliquer le bouton تطبيق de la section code (action exacte de l'utilisateur)
  const codeBox = page.locator("div").filter({ has: page.getByPlaceholder("أدخل الكود") }).first();
  await codeBox.getByRole("button", { name: "تطبيق" }).click();

  // 5. Attendre le résultat
  await page.waitForTimeout(2500);
  const body = await page.locator("body").innerText();
  console.log("=== Console logs ===\n" + logs.join("\n"));
  console.log("=== Contient 'تحت ضمان' ? " + body.includes("تحت ضمان"));
  console.log("=== Contient 'غير صحيح' (invalide) ? " + body.includes("غير صحيح"));

  await page.screenshot({ path: "tests/e2e/_code-coiffeur.png", fullPage: true });

  // Le banner "sous garantie" doit apparaître, PAS l'erreur "invalide"
  await expect(page.getByText("تطلب تحت ضمان")).toBeVisible({ timeout: 4000 });
});
