const { test, expect } = require("@playwright/test");

test("landing partenaire — rendu + formulaire + accès", async ({ page }) => {
  await page.goto("/partenaire", { waitUntil: "networkidle" });

  await expect(page.getByRole("heading", { name: /سبونسور/ })).toBeVisible();
  await expect(page.getByText("كيفاش يخدم؟")).toBeVisible();
  await expect(page.getByText("اطلب انضمامك")).toBeVisible();

  // Le formulaire existe
  await expect(page.getByPlaceholder("مثال: كريم بن علي")).toBeVisible();

  // Accès partenaire
  await page.getByText("دخول الشركاء").click();
  await expect(page.getByPlaceholder("06 00 00 00 00").first()).toBeVisible();

  await page.screenshot({ path: "tests/e2e/_partenaire.png", fullPage: true });
});
