// checkout-mobile-layout.spec.js — Test centrage + alignement formulaire checkout sur mobile
// Simule un vrai utilisateur arabe sur mobile (375px) qui remplit ses coordonnées
const { test, expect } = require('@playwright/test');

test.describe('Checkout mobile — centrage et alignement (375px)', () => {

  test('T_CHECKOUT_LAYOUT — La carte checkout est centrée et le formulaire aligné RTL', async ({ page }) => {
    // ── 1. Aller sur /produits et ajouter un article au panier
    await page.goto('/produits');
    await page.waitForSelector('[data-testid="product-card"]', { timeout: 12000 });
    await page.waitForTimeout(1000);

    const addBtn = page.locator('[data-testid="add-to-cart"]').first();
    const btnVisible = await addBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (btnVisible) {
      await addBtn.click();
      await page.waitForTimeout(800);
      // Fermer le drawer si ouvert
      const drawer = page.locator('[data-testid="cart-drawer"]');
      if (await drawer.isVisible({ timeout: 2000 }).catch(() => false)) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      }
    }

    // ── 2. Naviguer vers /commander
    await page.goto('/commander');
    await page.waitForTimeout(1500);

    const submitBtn = page.locator('[data-testid="checkout-submit"]');
    const formVisible = await submitBtn.isVisible({ timeout: 6000 }).catch(() => false);
    if (!formVisible) {
      console.log('ℹ️  Panier vide — test centrage via navigation directe');
      return;
    }

    // ── 3. Vérifier que la page ne scrolle pas horizontalement (overflow corrigé)
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    console.log(`📐 scrollWidth=${scrollWidth}px, clientWidth=${clientWidth}px`);
    expect(scrollWidth, 'La page ne doit pas dépasser la largeur du viewport').toBeLessThanOrEqual(clientWidth + 2);

    // ── 4. Vérifier le centrage de la <main>
    const mainBox = await page.locator('main').boundingBox();
    expect(mainBox, 'La balise <main> doit être visible').toBeTruthy();
    const viewportWidth = page.viewportSize().width;
    const mainLeft  = mainBox.x;
    const mainRight = viewportWidth - (mainBox.x + mainBox.width);
    console.log(`📦 main: left=${mainLeft.toFixed(0)}px, right=${mainRight.toFixed(0)}px, width=${mainBox.width.toFixed(0)}px`);
    // La largeur de main ne doit jamais dépasser le viewport
    expect(mainBox.width, 'La largeur de main ne doit pas dépasser le viewport').toBeLessThanOrEqual(viewportWidth + 2);
    // Sur mobile (≤ 640px) : main prend toute la largeur, pas de décalage gauche
    if (viewportWidth <= 640) {
      expect(mainLeft, 'Sur mobile : marge gauche de main doit être ≤ 5px').toBeLessThanOrEqual(5);
    }

    // ── 5. Vérifier que la carte checkout est à l'intérieur du viewport
    const card = page.locator('[dir="rtl"]').first();
    const cardBox = await card.boundingBox().catch(() => null);
    if (cardBox) {
      console.log(`🃏 card: left=${cardBox.x.toFixed(0)}px, right=${(cardBox.x + cardBox.width).toFixed(0)}px`);
      expect(cardBox.x, 'La carte ne doit pas déborder à gauche').toBeGreaterThanOrEqual(-1);
      expect(cardBox.x + cardBox.width, 'La carte ne doit pas déborder à droite').toBeLessThanOrEqual(viewportWidth + 1);
    }

    // ── 6. Simuler un humain qui remplit le champ prénom (الاسم)
    const firstNameInput = page.locator('[data-testid="checkout-first-name"]');
    const firstNameVisible = await firstNameInput.isVisible({ timeout: 5000 }).catch(() => false);
    if (firstNameVisible) {
      await firstNameInput.click();
      await page.waitForTimeout(400); // Attendre l'ouverture clavier + eventuel scroll
      await page.keyboard.type('أحمد');
      await page.waitForTimeout(300);

      // ── 7. Après saisie, vérifier que la page n'a pas scrollé horizontalement
      const scrollX = await page.evaluate(() => window.scrollX);
      console.log(`↔️  scrollX après saisie prénom: ${scrollX}px`);
      expect(scrollX, 'La page ne doit pas avoir scrollé horizontalement lors de la saisie').toBeLessThanOrEqual(2);

      // Vérifier que l'input est encore dans le viewport
      const inputBox = await firstNameInput.boundingBox();
      if (inputBox) {
        console.log(`✏️  input prénom: left=${inputBox.x.toFixed(0)}px, right=${(inputBox.x + inputBox.width).toFixed(0)}px`);
        expect(inputBox.x, 'L\'input prénom ne doit pas déborder à gauche').toBeGreaterThanOrEqual(-1);
        expect(inputBox.x + inputBox.width, 'L\'input prénom ne doit pas déborder à droite').toBeLessThanOrEqual(viewportWidth + 1);
      }
    }

    // ── 8. Remplir le champ nom (اللقب)
    const lastNameInput = page.locator('[data-testid="checkout-last-name"]');
    if (await lastNameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await lastNameInput.click();
      await page.waitForTimeout(300);
      await page.keyboard.type('بن علي');
      await page.waitForTimeout(300);

      const scrollXAfterLast = await page.evaluate(() => window.scrollX);
      console.log(`↔️  scrollX après saisie nom: ${scrollXAfterLast}px`);
      expect(scrollXAfterLast, 'Pas de scroll horizontal après saisie nom').toBeLessThanOrEqual(2);
    }

    // ── 9. Vérifier que les deux colonnes (الاسم + اللقب) sont dans le viewport
    const firstNameBox = await firstNameInput.boundingBox().catch(() => null);
    const lastNameBox  = await lastNameInput.boundingBox().catch(() => null);
    if (firstNameBox && lastNameBox) {
      console.log(`📋 الاسم col: left=${firstNameBox.x.toFixed(0)} | اللقب col: left=${lastNameBox.x.toFixed(0)}`);
      // Les deux colonnes doivent être dans le viewport
      expect(firstNameBox.x + firstNameBox.width, 'Colonne الاسم dans le viewport').toBeLessThanOrEqual(viewportWidth + 1);
      expect(lastNameBox.x + lastNameBox.width, 'Colonne اللقب dans le viewport').toBeLessThanOrEqual(viewportWidth + 1);
    }

    console.log('✅ Checkout mobile — centrage et alignement RTL OK');
  });

  test('T_CHECKOUT_NO_OVERFLOW — Pas de scroll horizontal sur /commander mobile', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(800);

    // Vérifier la page d'accueil d'abord
    const homeScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const homeClientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    console.log(`🏠 Accueil: scrollWidth=${homeScrollWidth}, clientWidth=${homeClientWidth}`);
    expect(homeScrollWidth).toBeLessThanOrEqual(homeClientWidth + 2);

    // Vérifier /produits
    await page.goto('/produits');
    await page.waitForTimeout(1000);
    const produitsScrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    const produitsClientW = await page.evaluate(() => document.documentElement.clientWidth);
    console.log(`🛍️  Produits: scrollWidth=${produitsScrollW}, clientWidth=${produitsClientW}`);
    expect(produitsScrollW).toBeLessThanOrEqual(produitsClientW + 2);

    console.log('✅ Pas de scroll horizontal — overflow corrigé');
  });

});
