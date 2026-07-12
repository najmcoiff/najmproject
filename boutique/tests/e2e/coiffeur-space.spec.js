const { test, expect } = require("@playwright/test");

const CODE = "KARIM-TEST";

test.describe("Espace coiffeur (ambassadeur)", () => {
  test("affiche la cagnotte, le code, l'historique masqué — sans fuiter % ni marge", async ({ page }) => {
    await page.goto(`/coiffeur/${CODE}`, { waitUntil: "networkidle" });

    // Cagnotte affichée (970 après animation)
    await expect(page.getByText("رصيد أرباحك")).toBeVisible();
    await expect(page.locator("body")).toContainText("970", { timeout: 5000 });

    // En attente
    await expect(page.locator("body")).toContainText("675");

    // Le code perso + partage
    await expect(page.getByText(CODE, { exact: false })).toBeVisible();
    await expect(page.getByText("شارك كودك على واتساب")).toBeVisible();

    // Historique : numéro MASQUÉ visible, numéro complet JAMAIS
    await expect(page.locator("body")).toContainText("0793•••••5");
    const body = await page.locator("body").innerText();
    expect(body).not.toContain("0793296415"); // numéro complet interdit

    // 🔒 RÈGLE ABSOLUE : ni %, ni marge exposés au coiffeur
    expect(body).not.toContain("%");
    expect(body).not.toContain("1350"); // marge de la 1ère commission
    expect(body).not.toContain("1080");
    expect(body).not.toContain("860");

    await page.screenshot({ path: "tests/e2e/_coiffeur-space.png", fullPage: true });
  });

  test("code invalide → espace introuvable", async ({ page }) => {
    await page.goto(`/coiffeur/NEXISTE-PAS`, { waitUntil: "networkidle" });
    await expect(page.getByText("هذا الفضاء غير متوفّر")).toBeVisible();
  });
});
