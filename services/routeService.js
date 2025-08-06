const { v4: uuid } = require('uuid');
const { trackClick, logRedirect, getClickStats } = require('../lib/tracking');

async function listRoutes(db) {
  const routes = await db.all('SELECT * FROM routes');
  
  // Klick-Statistiken zu jeder Route hinzufügen
  for (const route of routes) {
    route.stats = await getClickStats(route.alias, db);
  }
  
  return routes;
}

async function upsertRoute(r, db) {
  // If we have an ID, this is an UPDATE operation
  if (r.id) {
    // For updates: Only update target, UTM parameters and active status
    // Alias remains unchanged to protect QR codes and existing links
    await db.run(
      'UPDATE routes SET target=?,utm_source=?,utm_medium=?,utm_campaign=?,active=? WHERE id=?',
      [r.target, r.utm_source, r.utm_medium, r.utm_campaign, r.active ? 1 : 0, r.id]
    );
  } else {
    // No ID means this is a CREATE operation
    await db.run(
      'INSERT INTO routes (id,alias,target,utm_source,utm_medium,utm_campaign,active) VALUES (?,?,?,?,?,?,?)',
      [uuid(), r.alias, r.target, r.utm_source, r.utm_medium, r.utm_campaign, r.active ? 1 : 0]
    );
  }
}

async function deleteRoute(id, db) {
  await db.run('DELETE FROM routes WHERE id = ?', [id]);
}

function buildUrl(r) {
  if (!r.target) {
    console.warn('Route target is empty for alias:', r.alias);
    return '#';
  }
  
  try {
    const u = new URL(r.target);
    if (r.utm_source) u.searchParams.set('utm_source', r.utm_source);
    if (r.utm_medium) u.searchParams.set('utm_medium', r.utm_medium);
    if (r.utm_campaign) u.searchParams.set('utm_campaign', r.utm_campaign);
    return u.toString();
  } catch (error) {
    console.warn('Invalid target URL for alias:', r.alias, 'target:', r.target);
    return r.target || '#';
  }
}

/**
 * Führt die Weiterleitung durch und protokolliert den Zugriff
 */
async function redirectById(req, res, db) {
  const alias = req.params.id || req.params.alias;
  
  try {
    // Route aus Datenbank laden
    const route = await db.get('SELECT * FROM routes WHERE alias = ? AND active = 1', [alias]);
    
    if (!route) {
      console.log(`Route not found: ${alias}`);
      return res.status(404).render('404', { 
        title: 'QR-Code nicht gefunden',
        message: `Der QR-Code "${alias}" wurde nicht gefunden oder ist nicht aktiv.`
      });
    }

    // Client-Informationen sammeln
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.get('User-Agent') || 'unknown';
    const referer = req.get('Referer') || null;

    // Ziel-URL erstellen
    const targetUrl = buildUrl(route);

    // Click-Tracking (wenn aktiviert)
    const clickResult = await trackClick(alias, ip, userAgent, referer, db);

    // Vollständiges Logging (wenn aktiviert)
    const logResult = await logRedirect(alias, targetUrl, ip, userAgent, referer, clickResult);

    // Debug-Informationen
    console.log(`Redirect: ${alias} -> ${targetUrl}`, {
      click_tracked: clickResult.tracked,
      unique: clickResult.unique,
      logged: logResult.logged
    });

    // Weiterleitung durchführen
    return res.redirect(302, targetUrl);

  } catch (error) {
    console.error('Error in redirectById:', error);
    return res.status(500).render('404', {
      title: 'Fehler beim Weiterleiten',
      message: 'Es ist ein Fehler beim Weiterleiten aufgetreten.'
    });
  }
}

/**
 * Holt Klick-Statistiken für eine Route
 */
async function getRouteStats(alias, db) {
  return await getClickStats(alias, db);
}

module.exports = {
  listRoutes,
  upsertRoute,
  deleteRoute,
  buildUrl,
  redirectById,
  getRouteStats
};
