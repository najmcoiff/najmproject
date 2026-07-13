const { test, expect } = require("@playwright/test");

// Reproduit EXACTEMENT le cas de l'utilisateur : code coiffeur tapé dans le
// PANIER LATÉRAL (CartDrawer), pas la page /commander.
test("code coiffeur dans le panier latéral → banner 'sous garantie'", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.setItem("nc_cart", JSON.stringify([
      { variant_id: "49000227701032", product_id: "9384030372136", qty: 1, price: 750, title: "Wax test", image_url: "", max_qty: 10 },
    ]));
    localStorage.removeItem("nc_ambassadeur");
  });
  await page.reload({ waitUntil: "networkidle" });

  // Ouvrir le panier latéral
  await page.evaluate(() => window.dispatchEvent(new Event("nc_open_cart")));

  const input = page.getByPlaceholder("PARTNER-CODE");
  await expect(input).toBeVisible({ timeout: 6000 });
  await input.fill("KARIM-TEST");
  await input.press("Enter");

  await page.waitForTimeout(2000);
  const body = await page.locator("body").innerText();
  console.log("Contient 'تحت ضمان' ? " + body.includes("تحت ضمان"));
  console.log("Contient 'غير صحيح' ? " + body.includes("غير صحيح"));

  await expect(page.getByText("تطلب تحت ضمان")).toBeVisible({ timeout: 4000 });
});
