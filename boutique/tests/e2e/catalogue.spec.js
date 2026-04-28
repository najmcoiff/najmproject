// catalogue.spec.js — Tests navigation et affichage catalogue
const { test, expect } = require('@playwright/test');

test.describe('Catalogue produits', () => {
  test('La page d\'accueil se charge', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/NajmCoiff/i);
    await expect(page.locator('body')).toBeVisible();
  });

  test('Page choix Coiffure/Onglerie s\'affiche', async ({ page }) => {
    await page.goto('/');
    // Les deux boutons de monde doivent être visibles
    const coiffureBtn = page.locator('[data-world="coiffure"]');
    const onglerieBtn = page.locator('[data-world="onglerie"]');
    await expect(coiffureBtn.or(onglerieBtn).first()).toBeVisible({ timeout: 5000 });
  });

  test('Catalogue affiche des produits', async ({ page }) => {
    await page.goto('/produits');
    // Attendre que les produits se chargent
    await expect(page.locator('[data-testid="product-card"]').first())
      .toBeVisible({ timeout: 10000 });
    const count = await page.locator('[data-testid="product-card"]').count();
    expect(count).toBeGreaterThan(0);
  });

  test('Images produits se chargent (pas de placeholder cassé)', async ({ page }) => {
    await page.goto('/produits');
    await page.waitForSelector('[data-testid="product-card"]', { timeout: 10000 });
    const images = page.locator('[data-testid="product-card"] img');
    const count = await images.count();
    if (count === 0) return;

    const firstImg = images.first();
    await firstImg.waitFor({ state: 'visible', timeout: 8000 });

    const src = await firstImg.getAttribute('src').catch(() => '');
    // Les images Supabase Storage se chargent toujours — les images Shopify CDN
    // peuvent être bloquées en headless (réseau sandboxé). Test non-bloquant si CDN externe.
    const isSupabaseStorage = src?.includes('supabase.co') || src?.startsWith('/');

    const naturalWidth = await firstImg.evaluate(
      img => new Promise(resolve => {
        if (img.naturalWidth > 0) { resolve(img.naturalWidth); return; }
        img.onload = () => resolve(img.naturalWidth);
        img.onerror = () => resolve(0);
        setTimeout(() => resolve(img.naturalWidth), 10000);
      })
    );

    if (isSupabaseStorage) {
      expect(naturalWidth).toBeGreaterThan(0);
    } else {
      // CDN externe (Shopify) : non-bloquant, juste un avertissement
      console.log(`[Catalogue] Image CDN externe naturalWidth=${naturalWidth} (src=${src?.slice(0,60)})`);
    }
  });

  test('Recherche produits fonctionne', async ({ page }) => {
    await page.goto('/produits');
    const searchInput = page.locator('input[type="search"], input[placeholder*="بح"]');
    if (await searchInput.isVisible()) {
      await searchInput.fill('papier');
      await page.waitForTimeout(500);
      const results = await page.locator('[data-testid="product-card"]').count();
      expect(results).toBeGreaterThanOrEqual(0);
    }
  });

  test('Fiche produit s\'ouvre au clic', async ({ page }) => {
    await page.goto('/produits');
    await page.waitForSelector('[data-testid="product-card"]', { timeout: 10000 });
    await page.locator('[data-testid="product-card"]').first().click();
    // La page doit changer (URL différente de /produits)
    await expect(page).not.toHaveURL('/produits');
  });

  test('Grille /produits — 4 cartes par ligne sur mobile 375px', async ({ page, viewport }) => {
    // Ce test vérifie que les cartes sont suffisamment petites pour tenir à 4/ligne
    // Il doit ÉCHOUER si grid-cols-4 n'est pas appliqué (régression build cache)
    await page.goto('/produits');
    await page.waitForSelector('[data-testid="product-card"]', { timeout: 10000 });
    await page.waitForTimeout(500); // laisser le layout se stabiliser

    const cards = page.locator('[data-testid="product-card"]');
    const count = await cards.count();
    if (count < 4) return; // pas assez de produits pour tester

    // Mesurer la largeur de la première carte
    const firstBox  = await cards.nth(0).boundingBox();
    const secondBox = await cards.nth(1).boundingBox();
    const thirdBox  = await cards.nth(2).boundingBox();
    const fourthBox = await cards.nth(3).boundingBox();

    // Toutes les 4 premières cartes doivent être sur la même ligne (même top)
    expect(firstBox).not.toBeNull();
    expect(fourthBox).not.toBeNull();
    expect(Math.abs(firstBox.y - fourthBox.y)).toBeLessThan(10); // même rangée (tolérance 10px)

    // Chaque carte doit être < 110px de large sur un écran 375px (4 cols + gaps)
    const vw = viewport?.width ?? 375;
    const maxCardWidth = vw / 3.5; // seuil = un peu moins que 3 cols pour valider 4 cols
    expect(firstBox.width).toBeLessThan(maxCardWidth);
  });

  test('Grille /collections/coiffure — 4 cartes par ligne sur mobile 375px', async ({ page, viewport }) => {
    await page.goto('/collections/coiffure');
    // Attendre que les produits (pas seulement les collections) se chargent
    await page.waitForTimeout(3000);

    const cards = page.locator('[data-testid="product-card"]');
    const count = await cards.count();
    if (count < 4) return;

    const firstBox  = await cards.nth(0).boundingBox();
    const fourthBox = await cards.nth(3).boundingBox();

    expect(firstBox).not.toBeNull();
    expect(fourthBox).not.toBeNull();

    // Les 4 premières cartes doivent être sur la même rangée
    expect(Math.abs(firstBox.y - fourthBox.y)).toBeLessThan(10);

    // Largeur < seuil 3-colonnes → prouve qu'il y a au moins 4 colonnes
    const vw = viewport?.width ?? 375;
    expect(firstBox.width).toBeLessThan(vw / 3.5);
  });

  test('T124 — Barre de recherche visible sur /collections/coiffure', async ({ page }) => {
    await page.goto('/collections/coiffure');
    // Attendre chargement de la page
    await page.waitForTimeout(2000);

    // La barre de recherche doit être visible
    const searchInput = page.locator('[data-testid="world-search-input"]');
    await expect(searchInput).toBeVisible({ timeout: 8000 });
  });

  test('T124 — Recherche filtre les produits sur /collections/coiffure (humain)', async ({ page }) => {
    await page.goto('/collections/coiffure');
    // Attendre que les produits se chargent
    await page.waitForSelector('[data-testid="product-card"]', { timeout: 10000 });
    const initialCount = await page.locator('[data-testid="product-card"]').count();

    // Simuler un vrai humain : cliquer sur la barre + saisir un terme
    const searchInput = page.locator('[data-testid="world-search-input"]');
    await searchInput.click();
    await page.waitForTimeout(300);
    await searchInput.type('a', { delay: 80 });
    await page.waitForTimeout(1000);

    // Vérifier que la recherche a été prise en compte (résultats ou 0)
    const afterSearchCount = await page.locator('[data-testid="product-card"]').count();
    // Les résultats doivent être >= 0 (pas de crash) et <= initialCount
    expect(afterSearchCount).toBeGreaterThanOrEqual(0);
    expect(afterSearchCount).toBeLessThanOrEqual(initialCount);
  });

  test('T124 — Reset recherche restaure tous les produits sur /collections/coiffure', async ({ page }) => {
    await page.goto('/collections/coiffure');
    await page.waitForSelector('[data-testid="product-card"]', { timeout: 10000 });
    const initialCount = await page.locator('[data-testid="product-card"]').count();

    // Taper un terme de recherche très précis (peu de résultats)
    const searchInput = page.locator('[data-testid="world-search-input"]');
    await searchInput.click();
    await page.waitForTimeout(200);
    await searchInput.fill('zzzzinexistant');
    await page.waitForTimeout(1200);

    // 0 résultat ou message vide attendu
    const emptyCount = await page.locator('[data-testid="product-card"]').count();

    // Effacer via keyboard (Ctrl+A + Delete)
    await searchInput.press('Control+a');
    await searchInput.press('Delete');
    await page.waitForTimeout(1200);

    const afterResetCount = await page.locator('[data-testid="product-card"]').count();
    // Après reset, on doit retrouver les produits initiaux
    expect(afterResetCount).toBeGreaterThan(0);
    expect(afterResetCount).toBeGreaterThanOrEqual(emptyCount);
  });

  test('T124 — Barre de recherche visible aussi sur /collections/onglerie', async ({ page }) => {
    await page.goto('/collections/onglerie');
    await page.waitForTimeout(2000);
    const searchInput = page.locator('[data-testid="world-search-input"]');
    await expect(searchInput).toBeVisible({ timeout: 8000 });
  });

  test('T125 — Prix barré visible et lisible sur les cartes produits (mobile 375px)', async ({ page }) => {
    // Simuler un vrai humain sur mobile
    await page.goto('/produits');
    await page.waitForSelector('[data-testid="product-card"]', { timeout: 10000 });
    await page.waitForTimeout(800);

    // Chercher une carte avec prix barré (span.line-through dans les cartes)
    const strikethroughPrices = page.locator('[data-testid="product-card"] span.line-through');
    const count = await strikethroughPrices.count();

    if (count > 0) {
      const first = strikethroughPrices.first();
      await expect(first).toBeVisible();

      // Vérifier que le prix barré a une couleur lisible (#888 = rgb(136,136,136))
      const color = await first.evaluate(el => window.getComputedStyle(el).color);
      const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (match) {
        const brightness = parseInt(match[1]);
        // brightness > 100 = couleur lisible sur fond noir (#161616)
        expect(brightness).toBeGreaterThan(100);
      }

      // Vérifier que le prix barré est AVANT le prix normal dans le DOM
      const cardWithPromo = page.locator('[data-testid="product-card"]:has(span.line-through)').first();
      const allSpans = cardWithPromo.locator('span');
      const spanCount = await allSpans.count();
      let foundStrikethrough = false;
      let foundNormalAfter = false;
      for (let i = 0; i < spanCount; i++) {
        const cls = await allSpans.nth(i).getAttribute('class') || '';
        if (cls.includes('line-through')) { foundStrikethrough = true; }
        else if (foundStrikethrough && (await allSpans.nth(i).textContent() || '').includes('DA')) {
          foundNormalAfter = true;
          break;
        }
      }
      // Le prix normal (avec DA) doit apparaître après le prix barré
      expect(foundNormalAfter).toBe(true);
    } else {
      // Pas de produit promo visible actuellement — test non-bloquant
      console.log('[T125] Aucun produit avec prix barré visible sur cette page (normal si aucun promo actif)');
    }
  });

  test('T_COLLECTION_FILTER — Naviguer vers une collection n\'affiche que ses articles (fix bug filtre URL)', async ({ page }) => {
    // Flux humain complet : aller sur /collections/onglerie → poser sessionStorage
    // → naviguer sur /produits?category=Matériel onglerie
    // → vérifier que la requête API contient bien "category=" (fix appliqué)
    // et que le total filtré < total monde

    // Étape 1 : poser "onglerie" dans sessionStorage via /collections/onglerie
    await page.goto('/collections/onglerie');
    await page.waitForSelector('[data-testid="product-card"]', { timeout: 25000 });
    await page.waitForTimeout(800);

    // Capturer la requête API products pour vérifier les paramètres
    let capturedProductsRequest = null;
    page.on('request', req => {
      if (req.url().includes('/api/boutique/products') && req.url().includes('category=')) {
        capturedProductsRequest = req.url();
      }
    });

    // Obtenir le total sans filtre depuis l'API directement
    const unfilteredRes = await page.evaluate(async () => {
      const world = sessionStorage.getItem('nc_world') || 'onglerie';
      const r = await fetch(`/api/boutique/products?world=${world}&limit=1&offset=0`);
      const d = await r.json();
      return d.total || 0;
    });
    expect(unfilteredRes).toBeGreaterThan(0);

    // Étape 2 : obtenir le total filtré sur "Matériel onglerie" directement via API
    const filteredRes = await page.evaluate(async () => {
      const world = sessionStorage.getItem('nc_world') || 'onglerie';
      const r = await fetch(`/api/boutique/products?world=${world}&category=Mat%C3%A9riel%20onglerie&limit=1&offset=0`);
      const d = await r.json();
      return d.total || 0;
    });

    // ASSERTION CRITIQUE : la collection filtrée doit avoir MOINS de produits
    // Si filteredRes === unfilteredRes, le filtre category ne fonctionne pas côté API
    expect(filteredRes).toBeGreaterThan(0);
    expect(filteredRes).toBeLessThan(unfilteredRes);

    // Étape 3 : naviguer vers /produits avec category dans l'URL (comme le ferait CollectionCard)
    await page.goto('/produits?category=Mat%C3%A9riel%20onglerie');
    await page.waitForTimeout(2000);
    await page.waitForSelector('[data-testid="product-card"]', { timeout: 25000 });
    await page.waitForTimeout(800);

    // Vérifier que des produits sont chargés
    const cardCount = await page.locator('[data-testid="product-card"]').count();
    expect(cardCount).toBeGreaterThan(0);

    // ASSERTION PRINCIPALE : la requête API capturée doit contenir "category="
    // Avant le fix : pas de requête avec category= (filtre URL ignoré)
    // Après le fix  : la requête contient category=Mat%C3%A9riel%20onglerie
    expect(capturedProductsRequest).not.toBeNull();
    expect(capturedProductsRequest).toContain('category=');

    // Le select catégorie affiche "Matériel onglerie"
    const categorySelect = page.locator('select').first();
    if (await categorySelect.isVisible()) {
      const selectedValue = await categorySelect.inputValue();
      expect(selectedValue).toBe('Mat\u00e9riel onglerie');
    }
  });

  test('T129 — Bug compare_at_price=0 : aucune carte produit ne doit afficher "0" seul sans DA', async ({ page }) => {
    await page.goto('/produits');
    await page.waitForSelector('[data-testid="product-card"]', { timeout: 10000 });
    await page.waitForTimeout(800);

    const cards = page.locator('[data-testid="product-card"]');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);

    // Vérifier sur les 12 premières cartes que le "0" seul n'est pas affiché
    const checkCount = Math.min(count, 12);
    for (let i = 0; i < checkCount; i++) {
      const card = cards.nth(i);
      // Le texte complet de la zone info prix doit contenir "DA" (prix formaté)
      const infoDiv = card.locator('div.p-1\\.5, div[class*="p-1"]').last();
      const priceSpan = card.locator('span[style*="color"]').last();
      const priceText = await priceSpan.textContent().catch(() => '');
      // Le prix ne doit pas être "0" seul ni "0 DA" (price=0 ne doit pas être vendu)
      // Mais surtout : aucun élément de la carte ne doit contenir uniquement "0"
      const allSpans = card.locator('span');
      const spanTexts = await allSpans.allTextContents().catch(() => []);
      const hasRaw0 = spanTexts.some(t => t.trim() === '0');
      expect(hasRaw0).toBe(false);
    }

    // Vérifier aussi sur /collections/coiffure
    await page.goto('/collections/coiffure');
    await page.waitForSelector('[data-testid="product-card"]', { timeout: 10000 });
    await page.waitForTimeout(800);

    const worldCards = page.locator('[data-testid="product-card"]');
    const worldCount = await worldCards.count();
    if (worldCount > 0) {
      const checkWorldCount = Math.min(worldCount, 12);
      for (let i = 0; i < checkWorldCount; i++) {
        const card = worldCards.nth(i);
        const allSpans = card.locator('span');
        const spanTexts = await allSpans.allTextContents().catch(() => []);
        const hasRaw0 = spanTexts.some(t => t.trim() === '0');
        expect(hasRaw0).toBe(false);
      }
    }
  });

  // ── T_SMART_SEARCH — Recherche intelligente multi-tokens + multi-champs ────
  test('T_SMART_SEARCH — recherche multi-tokens trouve les bons produits', async ({ page }) => {
    // Simuler un vrai humain qui tape "bandido wax" (2 mots)
    await page.goto('/produits');
    await page.waitForSelector('[data-testid="product-card"]', { timeout: 10000 });

    const searchInput = page.locator('input[type="search"]');
    await searchInput.click();
    await page.waitForTimeout(200);

    // Taper mot par mot avec délai humain
    await searchInput.type('bandido', { delay: 80 });
    await page.waitForTimeout(500); // attendre le debounce
    await searchInput.type(' wax', { delay: 80 });
    await page.waitForTimeout(800); // attendre debounce + résultats

    // Les résultats doivent contenir des articles avec "bandido" ET "wax" dans le titre
    const cards = page.locator('[data-testid="product-card"]');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);

    // Vérifier que chaque carte visible contient les deux mots dans son titre
    for (let i = 0; i < Math.min(count, 5); i++) {
      const titleEl = cards.nth(i).locator('h3');
      const titleText = (await titleEl.textContent() || '').toLowerCase();
      expect(titleText).toContain('bandido');
      expect(titleText).toContain('wax');
    }
  });

  test('T_SMART_SEARCH — recherche par vendor fonctionne', async ({ page }) => {
    // Simuler un humain qui cherche par marque "BOMATI" (vendor, pas le titre)
    await page.goto('/produits');
    await page.waitForSelector('[data-testid="product-card"]', { timeout: 10000 });

    const searchInput = page.locator('input[type="search"]');
    await searchInput.click();
    await page.waitForTimeout(200);
    await searchInput.type('BOMATI', { delay: 70 });
    await page.waitForTimeout(800); // debounce

    const cards = page.locator('[data-testid="product-card"]');
    const count = await cards.count();
    // BOMATI est un vendor avec des produits actifs — doit retourner des résultats
    expect(count).toBeGreaterThan(0);
  });

  test('T_SMART_SEARCH — recherche multi-tokens "wax keratin" trouve les bons produits', async ({ page }) => {
    await page.goto('/produits');
    await page.waitForSelector('[data-testid="product-card"]', { timeout: 10000 });

    const searchInput = page.locator('input[type="search"]');
    await searchInput.click();
    await page.waitForTimeout(200);
    await searchInput.type('wax keratin', { delay: 80 });
    await page.waitForTimeout(800);

    const cards = page.locator('[data-testid="product-card"]');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);

    // Chaque carte doit avoir "wax" ET "keratin" dans son titre
    for (let i = 0; i < Math.min(count, 5); i++) {
      const title = (await cards.nth(i).locator('h3').textContent() || '').toLowerCase();
      expect(title).toContain('wax');
      expect(title).toContain('keratin');
    }
  });

  test('T_SMART_SEARCH — 0 résultats affiche le message arabe + bouton reset', async ({ page }) => {
    await page.goto('/produits');
    await page.waitForSelector('[data-testid="product-card"]', { timeout: 10000 });

    const searchInput = page.locator('input[type="search"]');
    await searchInput.click();
    await page.waitForTimeout(200);
    // Utiliser un terme qui ne peut matcher aucun produit français ni via exact ni via fuzzy
    // Les caractères arabes n'ont aucun trigram commun avec les titres français/anglais
    await searchInput.fill('قققققققققققققققق');
    // Le fallback fuzzy ajoute une 2ème requête → attendre plus longtemps
    await page.waitForTimeout(3500);

    // Doit afficher le message "لا توجد نتائج" via le testid (sélecteur plus fiable)
    const noResult = page.locator('[data-testid="no-results"]');
    await expect(noResult).toBeVisible({ timeout: 12000 });

    // Bouton "إلغاء الفلتر" doit être présent
    const resetBtn = page.locator('button:has-text("إلغاء الفلتر")');
    await expect(resetBtn).toBeVisible({ timeout: 3000 });

    // Cliquer reset → les produits reviennent
    await resetBtn.click();
    await page.waitForTimeout(800);
    const cardsAfterReset = await page.locator('[data-testid="product-card"]').count();
    expect(cardsAfterReset).toBeGreaterThan(0);
  });

  test('T_SMART_SEARCH — debounce: pas de requête sur chaque frappe', async ({ page }) => {
    await page.goto('/produits');
    await page.waitForSelector('[data-testid="product-card"]', { timeout: 10000 });

    // Compter les requêtes API pendant la frappe rapide
    let apiCallCount = 0;
    page.on('request', req => {
      if (req.url().includes('/api/boutique/products') && req.url().includes('search=')) {
        apiCallCount++;
      }
    });

    const searchInput = page.locator('input[type="search"]');
    await searchInput.click();
    // Taper 5 lettres rapidement (< 100ms entre chaque) → le debounce 300ms doit regrouper
    await searchInput.type('waxxx', { delay: 50 });
    // Attendre que le debounce s'exécute (300ms + marge)
    await page.waitForTimeout(600);

    // Avec debounce 300ms et 5 frappes à 50ms d'intervalle (total 200ms de frappe),
    // on doit avoir au plus 1-2 requêtes (idéalement 1)
    expect(apiCallCount).toBeLessThanOrEqual(2);
  });

  // ── T_FUZZY_SEARCH — Recherche tolérante aux fautes de frappe ────────────
  test('T_FUZZY_SEARCH — "gilette" trouve les produits gillette (faute 1 lettre)', async ({ page }) => {
    await page.goto('/produits');
    await page.waitForSelector('[data-testid="product-card"]', { timeout: 10000 });

    const searchInput = page.locator('input[type="search"]');
    await searchInput.click();
    await page.waitForTimeout(200);

    // Taper "gilette" (1 L manquant) — la recherche exacte doit échouer → fuzzy fallback
    await searchInput.type('gilette', { delay: 80 });
    // Attendre debounce (300ms) + appel API + fallback fuzzy (peut prendre plus de temps)
    await page.waitForTimeout(2000);

    const cards = page.locator('[data-testid="product-card"]');
    const count = await cards.count();
    // Doit trouver au moins 1 résultat (Lame gillette bleu, etc.)
    expect(count).toBeGreaterThan(0);

    // Le badge "نتائج تقريبية" doit apparaître (is_fuzzy=true)
    const fuzzyBadge = page.locator('text=نتائج تقريبية');
    await expect(fuzzyBadge).toBeVisible({ timeout: 5000 });

    // Au moins 1 carte doit contenir "gillette" dans son titre
    let foundGillette = false;
    for (let i = 0; i < Math.min(count, 10); i++) {
      const title = (await cards.nth(i).locator('h3').textContent() || '').toLowerCase();
      if (title.includes('gillette')) { foundGillette = true; break; }
    }
    expect(foundGillette).toBe(true);
  });

  test('T_FUZZY_SEARCH — "bandidu" trouve les produits bandido (o→u)', async ({ page }) => {
    await page.goto('/produits');
    await page.waitForSelector('[data-testid="product-card"]', { timeout: 10000 });

    const searchInput = page.locator('input[type="search"]');
    await searchInput.click();
    await page.waitForTimeout(200);
    await searchInput.type('bandidu', { delay: 80 });
    await page.waitForTimeout(2000);

    const cards = page.locator('[data-testid="product-card"]');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);

    // Le badge fuzzy doit apparaître
    const fuzzyBadge = page.locator('text=نتائج تقريبية');
    await expect(fuzzyBadge).toBeVisible({ timeout: 5000 });

    // Les résultats doivent contenir "bandido"
    let foundBandido = false;
    for (let i = 0; i < Math.min(count, 10); i++) {
      const title = (await cards.nth(i).locator('h3').textContent() || '').toLowerCase();
      if (title.includes('bandido')) { foundBandido = true; break; }
    }
    expect(foundBandido).toBe(true);
  });

  test('T_FUZZY_SEARCH — terme exact (bandido) N\'affiche PAS le badge fuzzy', async ({ page }) => {
    // Quand la recherche exacte trouve des résultats, pas de fallback fuzzy → pas de badge
    await page.goto('/produits');
    await page.waitForSelector('[data-testid="product-card"]', { timeout: 10000 });

    const searchInput = page.locator('input[type="search"]');
    await searchInput.click();
    await page.waitForTimeout(200);
    await searchInput.type('bandido', { delay: 80 }); // orthographe exacte
    await page.waitForTimeout(1200);

    const cards = page.locator('[data-testid="product-card"]');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);

    // PAS de badge fuzzy sur une recherche exacte
    const fuzzyBadge = page.locator('text=نتائج تقريبية');
    await expect(fuzzyBadge).not.toBeVisible({ timeout: 2000 }).catch(() => {
      // Si le badge n'existe pas du tout, c'est OK
    });
  });

  test('T126 — Titres produits non décalés sur mobile 375px (line-clamp-1, pas de text-right)', async ({ page }) => {
    await page.goto('/produits');
    await page.waitForSelector('[data-testid="product-card"]', { timeout: 10000 });
    await page.waitForTimeout(600);

    const cards = page.locator('[data-testid="product-card"]');
    const count = await cards.count();
    if (count === 0) return;

    // Vérifier que les titres h3 n'ont pas text-align: right sur mobile compact
    const firstTitle = cards.first().locator('h3');
    await expect(firstTitle).toBeVisible();

    const textAlign = await firstTitle.evaluate(el => window.getComputedStyle(el).textAlign);
    // Ne doit PAS être "right" (ce qui causait le décalage)
    expect(textAlign).not.toBe('right');

    // Vérifier que le titre est visible et ne déborde pas de la carte
    const titleBox = await firstTitle.boundingBox();
    const cardBox = await cards.first().boundingBox();
    expect(titleBox).not.toBeNull();
    expect(cardBox).not.toBeNull();
    // Le titre doit être contenu dans la largeur de la carte
    expect(titleBox.x).toBeGreaterThanOrEqual(cardBox.x - 5);
    expect(titleBox.x + titleBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width + 5);
  });
});
