// smart-sort.spec.js — Test tri intelligent boutique (sort_order + health_score)
// Simule un vrai utilisateur humain + vérifie la DB après chaque action UI
const { test, expect } = require('@playwright/test');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://alyxejkdtkdmluvgfnqk.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PAT          = 'sbp_b875d6d5cf2859909e5b5c1ffb9fa24cc8a155ea';

async function sbQuery(sql) {
  const res = await fetch('https://api.supabase.com/v1/projects/alyxejkdtkdmluvgfnqk/database/query', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  return res.json();
}

test.describe('T_SMART_SORT — Tri intelligent boutique (pin + health_score)', () => {

  // ── Test 6 : Le meilleur health_score est bien en 1ère position (sort fix) ─
  test('T_SMART_6 : le produit TOP health_score apparaît en #1 en boutique (tri health_score avant is_new)', async ({ page }) => {
    // 1. Trouver le vrai top produit coiffure dans la DB (ignore is_new, sans pin)
    const topRows = await sbQuery(
      "SELECT s.variant_id, v.product_title, v.display_name, s.health_score, v.is_new, v.sort_order " +
      "FROM nc_ai_product_scores s " +
      "JOIN nc_variants v ON v.variant_id::text = s.variant_id " +
      "WHERE s.score_date = (SELECT MAX(score_date) FROM nc_ai_product_scores) " +
      "AND v.status = 'active' AND v.inventory_quantity > 0 AND v.world = 'coiffure' " +
      "AND v.sort_order = 999 AND v.image_url IS NOT NULL AND v.image_url != '' " +
      "ORDER BY s.health_score DESC LIMIT 1"
    );
    expect(Array.isArray(topRows) && topRows.length > 0).toBe(true);
    const topProduct = topRows[0];
    console.log(`[SmartSort] Attendu en #1: "${topProduct.display_name || topProduct.product_title}" health=${topProduct.health_score} is_new=${topProduct.is_new}`);

    // 2. Vérifier via l'API que ce produit est bien en position 1
    const apiRes = await page.request.get('/api/boutique/products?world=coiffure&sort=smart&limit=5');
    expect(apiRes.status()).toBe(200);
    const apiData = await apiRes.json();
    expect(apiData.products.length).toBeGreaterThan(0);

    const firstProduct = apiData.products[0];
    console.log(`[SmartSort] #1 API: "${firstProduct.display_name || firstProduct.product_title}" health=${firstProduct.health_score} is_new=${firstProduct.is_new}`);

    // Le #1 API doit avoir le même health_score que le top DB
    expect(Number(firstProduct.health_score)).toBeCloseTo(Number(topProduct.health_score), 1);
    console.log(`✅ Top health_score en #1 (health=${firstProduct.health_score})`);

    // 3. Humain : naviguer sur la page collections coiffure
    await page.goto('/collections/coiffure');
    await page.waitForTimeout(1000);
    await expect(page.locator('[data-testid="product-card"]').first()).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(600);

    // 4. Vérifier que le 1er article affiché est bien le top health
    const firstCardText = await page.locator('[data-testid="product-card"]').first().innerText();
    const expectedTitle = (topProduct.display_name || topProduct.product_title).toLowerCase().slice(0, 15);
    console.log(`[SmartSort] Premier article affiché: "${firstCardText.trim().slice(0, 60)}"`);
    console.log(`[SmartSort] Titre attendu (15 chars): "${expectedTitle}"`);
    // Le titre du premier article doit correspondre (au moins les 10 premiers caractères)
    expect(firstCardText.toLowerCase()).toContain(expectedTitle.slice(0, 10));
    console.log(`✅ Organisation boutique basée sur health_score réel — tri dynamique confirmé`);
  });

  // ── Test 7 : is_new ne bloque plus les bestsellers ────────────────────────
  test('T_SMART_7 : les produits is_new ne bloquent plus les bestsellers (health_score prioritaire)', async ({ request }) => {
    const res = await request.get('/api/boutique/products?world=coiffure&sort=smart&limit=20');
    const data = await res.json();
    expect(data.products.length).toBeGreaterThan(0);

    // Vérifier que le 1er produit a le health_score le plus élevé parmi les non-pinnés
    const notPinned = data.products.filter(p => Number(p.sort_order) === 999);
    if (notPinned.length >= 2) {
      const first = notPinned[0];
      const second = notPinned[1];
      expect(Number(first.health_score)).toBeGreaterThanOrEqual(Number(second.health_score));
      console.log(`✅ health_score décroissant: #1=${first.health_score} ≥ #2=${second.health_score}`);
    }

    // Vérifier que is_new ne domine pas (les premiers articles ne sont pas TOUS is_new)
    const isNewCount = data.products.slice(0, 10).filter(p => p.is_new).length;
    const allIsNew = isNewCount === 10;
    expect(allIsNew).toBe(false);
    console.log(`✅ is_new parmi les 10 premiers: ${isNewCount}/10 (pas de domination is_new)`);

    // Afficher le top 5 pour validation visuelle
    console.log('[SmartSort] Top 5 articles après fix:');
    data.products.slice(0, 5).forEach((p, i) => {
      console.log(`  #${i+1}: ${p.product_title || p.display_name} | health=${p.health_score} | is_new=${p.is_new}`);
    });
  });

  // ── Test 0 : scores Supabase sont bien à jour aujourd'hui (cron fix) ──
  test('T_SMART_0 : scores nc_ai_product_scores mis à jour aujourd\'hui (cron GET fix)', async ({ request }) => {
    const today = new Date().toISOString().split('T')[0];
    const rows = await sbQuery(
      `SELECT score_date, COUNT(*) as cnt FROM nc_ai_product_scores WHERE score_date = '${today}' GROUP BY score_date`
    );
    console.log(`[SmartSort] Scores today (${today}):`, JSON.stringify(rows));
    expect(Array.isArray(rows) && rows.length > 0).toBe(true);
    const cnt = Number(rows[0].cnt);
    expect(cnt).toBeGreaterThan(100);
    console.log(`✅ ${cnt} scores insérés aujourd'hui ${today}`);

    // Vérifier aussi que le cron répond en GET (fix principal)
    const CRON_SECRET = process.env.CRON_SECRET || 'm5KjAbNWudGHFcZpY4heMtJrz2wskq3D';
    const cronRes = await fetch('https://najmcoiffdashboard.vercel.app/api/ai/catalog-intelligence', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${CRON_SECRET}` },
    });
    // Doit retourner 200 (pas 405 Method Not Allowed)
    expect(cronRes.status).toBe(200);
    const cronData = await cronRes.json();
    expect(cronData).toHaveProperty('ok', true);
    console.log(`✅ GET /api/ai/catalog-intelligence retourne 200, scored=${cronData.scored}`);
  });

  // ── Test 1 : l'API retourne bien sort=smart par défaut ────────────────
  test('T_SMART_1 : API /api/boutique/products retourne sort smart par défaut', async ({ request }) => {
    const res = await request.get('/api/boutique/products?world=coiffure&limit=5');
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.products.length).toBeGreaterThan(0);
    // Vérifie que les champs de scoring sont bien présents (viennent de nc_variants_boutique)
    const first = data.products[0];
    expect(first).toHaveProperty('sort_order');
    expect(first).toHaveProperty('health_score');
    console.log(`[SmartSort] Premier article API: ${first.display_name || first.product_title} (sort_order=${first.sort_order}, health=${first.health_score})`);
  });

  // ── Test 2 : article piné (sort_order < 999) apparaît en premier ─────
  test('T_SMART_2 : article piné (sort_order < 999) apparaît en premier dans la boutique', async ({ page }) => {
    // 1. Trouver l'article piné dans la DB
    const pinned = await sbQuery(
      "SELECT variant_id, display_name, product_title, sort_order FROM nc_variants " +
      "WHERE world='coiffure' AND status='active' AND inventory_quantity > 0 " +
      "AND sort_order < 999 AND image_url IS NOT NULL AND image_url != '' " +
      "ORDER BY sort_order ASC LIMIT 1"
    );

    if (!pinned || pinned.length === 0) {
      console.log('[SmartSort] Aucun article piné trouvé — test ignoré (pin un article via le dashboard)');
      test.skip();
      return;
    }

    const pinnedName = pinned[0].display_name || pinned[0].product_title;
    const pinnedOrder = pinned[0].sort_order;
    console.log(`[SmartSort] Article piné attendu en 1er: "${pinnedName}" (sort_order=${pinnedOrder})`);

    // 2. Humain : aller sur la page collections coiffure
    await page.goto('/collections/coiffure');
    await page.waitForTimeout(800);

    // 3. Attendre que les produits se chargent
    await expect(page.locator('[data-testid="product-card"]').first()).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(500);

    // 4. Récupérer le nom du PREMIER produit affiché
    const firstCard = page.locator('[data-testid="product-card"]').first();
    const firstCardText = await firstCard.innerText();
    console.log(`[SmartSort] Premier article affiché en boutique: "${firstCardText.trim().slice(0, 60)}"`);

    // 5. Vérifier via l'API que le premier produit retourné est bien le piné
    const apiRes = await page.request.get('/api/boutique/products?world=coiffure&limit=1&sort=smart');
    const apiData = await apiRes.json();
    expect(apiData.products.length).toBeGreaterThan(0);
    const firstApiProduct = apiData.products[0];

    console.log(`[SmartSort] Premier produit API (sort=smart): "${firstApiProduct.display_name || firstApiProduct.product_title}" sort_order=${firstApiProduct.sort_order}`);
    expect(Number(firstApiProduct.sort_order)).toBeLessThan(999);
    expect(String(firstApiProduct.variant_id)).toBe(String(pinned[0].variant_id));
    console.log(`✅ Article piné #${pinnedOrder} bien en première position`);
  });

  // ── Test 3 : l'API NE renvoie PAS sort=newest par défaut ─────────────
  test('T_SMART_3 : la page /collections/coiffure charge sort=smart (pas newest)', async ({ page }) => {
    // Intercepter les requêtes API pour vérifier le paramètre sort
    let capturedSortParam = null;
    page.on('request', req => {
      if (req.url().includes('/api/boutique/products') && !req.url().includes('is_new=true')) {
        const url = new URL(req.url());
        capturedSortParam = url.searchParams.get('sort');
        console.log(`[SmartSort] Requête API interceptée: sort=${capturedSortParam}`);
      }
    });

    await page.goto('/collections/coiffure');
    await expect(page.locator('[data-testid="product-card"]').first()).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(500);

    // Vérifier que la requête a bien utilisé sort=smart
    expect(capturedSortParam).toBe('smart');
    console.log(`✅ Sort param correct: sort=${capturedSortParam}`);
  });

  // ── Test 4 : pin via SQL → article en 1er dans boutique → cleanup ────
  test('T_SMART_4 : pinner un article via SQL → premier en boutique (vérifié via API) → cleanup', async ({ page }) => {
    // 1. Trouver un article non-piné actif coiffure (exclure sort_order=1 déjà pris)
    const candidates = await sbQuery(
      "SELECT variant_id, display_name, product_title, sort_order FROM nc_variants " +
      "WHERE world='coiffure' AND status='active' AND inventory_quantity > 0 " +
      "AND sort_order = 999 AND image_url IS NOT NULL AND image_url != '' " +
      "ORDER BY variant_id ASC LIMIT 1"
    );
    if (!candidates || !Array.isArray(candidates) || candidates.length === 0) {
      console.log('[SmartSort] Pas d\'article non-piné disponible pour le test');
      test.skip();
      return;
    }

    const testVariant = candidates[0];
    const variantId   = String(testVariant.variant_id);
    console.log(`[SmartSort] Article test à pinner: "${testVariant.display_name || testVariant.product_title}" (id=${variantId})`);

    // 2. Pinner avec sort_order=1 via SQL (cast TEXT si nécessaire)
    await sbQuery(`UPDATE nc_variants SET sort_order = 1 WHERE variant_id::text = '${variantId}'`);
    await page.waitForTimeout(800);
    console.log(`[SmartSort] Pin SQL appliqué pour ${variantId}`);

    // 3. Vérifier via l'API boutique que cet article est en 1ère position
    const apiRes  = await page.request.get(`/api/boutique/products?world=coiffure&limit=5&sort=smart`);
    const apiData = await apiRes.json();
    expect(apiData.products.length).toBeGreaterThan(0);

    // L'article piné (sort_order=1) doit être dans les 5 premiers (plusieurs peuvent avoir sort_order=1)
    const foundPinned = apiData.products.some(p => String(p.variant_id) === variantId);
    console.log(`[SmartSort] Article ${variantId} trouvé dans les 5 premiers: ${foundPinned}`);

    // Au moins le 1er doit avoir sort_order = 1
    const firstProduct = apiData.products[0];
    expect(Number(firstProduct.sort_order)).toBe(1);
    console.log(`✅ Premier en boutique: "${firstProduct.display_name || firstProduct.product_title}" sort_order=${firstProduct.sort_order}`);

    // 4. Humain : vérifier visuellement sur la page collections
    await page.goto('/collections/coiffure');
    await expect(page.locator('[data-testid="product-card"]').first()).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(500);
    const firstCardText = await page.locator('[data-testid="product-card"]').first().innerText();
    console.log(`[SmartSort] Premier article affiché en boutique: "${firstCardText.trim().slice(0, 50)}"`);
    // Le premier article affiché doit exister (non vide)
    expect(firstCardText.trim().length).toBeGreaterThan(0);

    // 5. Cleanup : remettre sort_order à 999
    await sbQuery(`UPDATE nc_variants SET sort_order = 999 WHERE variant_id::text = '${variantId}'`);
    await page.waitForTimeout(300);
    console.log(`[SmartSort] ✅ Cleanup: sort_order remis à 999 pour ${variantId}`);
  });

  // ── Test 5 : l'ordre API respecte sort_order → health_score → is_new (nouveau comportement)
  test('T_SMART_5 : vérifier que l\'ordre API respecte sort_order → health_score DESC → is_new (tiebreaker)', async ({ request }) => {
    const res = await request.get('/api/boutique/products?world=coiffure&limit=20&sort=smart');
    const data = await res.json();
    expect(data.products.length).toBeGreaterThan(0);

    // Grouper par catégories de tri
    const pinned    = data.products.filter(p => Number(p.sort_order) < 999);
    const notPinned = data.products.filter(p => Number(p.sort_order) === 999);

    console.log(`[SmartSort] Pinés: ${pinned.length} | Non-pinés: ${notPinned.length}`);

    // 1. Tous les pinés viennent avant les non-pinés
    if (pinned.length > 0 && notPinned.length > 0) {
      const lastPinnedIdx    = data.products.findLastIndex(p => Number(p.sort_order) < 999);
      const firstUnpinnedIdx = data.products.findIndex(p => Number(p.sort_order) === 999);
      expect(lastPinnedIdx).toBeLessThan(firstUnpinnedIdx);
      console.log(`✅ Pinés (idx 0-${lastPinnedIdx}) avant non-pinés (idx ${firstUnpinnedIdx}+)`);
    }

    // 2. Parmi les non-pinés, health_score est décroissant (critère principal)
    if (notPinned.length >= 3) {
      let prevScore = Number(notPinned[0].health_score);
      let violations = 0;
      for (let i = 1; i < Math.min(notPinned.length, 15); i++) {
        const cur = Number(notPinned[i].health_score);
        if (cur > prevScore + 0.5) violations++; // tolérance de 0.5 pour le tiebreaker is_new
        prevScore = cur;
      }
      expect(violations).toBe(0);
      console.log(`✅ health_score décroissant parmi les non-pinés (0 violations)`);
    }

    // 3. health_score est le critère PRINCIPAL — pas is_new (contrairement à l'ancien comportement)
    // Le 1er non-pinné doit avoir le health_score le plus élevé de tous les non-pinnés
    if (notPinned.length >= 2) {
      const maxHealthScore = Math.max(...notPinned.map(p => Number(p.health_score)));
      expect(Number(notPinned[0].health_score)).toBeCloseTo(maxHealthScore, 1);
      console.log(`✅ Premier non-pinné a le max health_score (${notPinned[0].health_score})`);
    }
  });

});
