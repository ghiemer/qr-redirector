const { listRoutes, upsertRoute, deleteRoute, buildUrl } = require('../services/routeService.js');
const { ensureQr } = require('../services/qrService.js');
const fs = require('fs-extra');

async function dashboard(req, res, db) {
  const routes = await listRoutes(db);
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  
  for (const r of routes) {
    r.fullUrl = buildUrl(r);
    await ensureQr(r, baseUrl);  // Pass the whole route object
    r.shortUrl = `${baseUrl}/${r.alias}`;
    r.qrPngUrl = `/qrs/${r.id}.png`;
    r.qrSvgUrl = `/qrs/${r.id}.svg`;
  }
  res.render('dashboard', { routes });
}

async function editRoute(req, res, db) {
  if (req.method === 'POST') {
    let formData;
    
    // If we have an id parameter in the URL, this is an edit operation
    if (req.params.id) {
      // For editing: Only allow specific fields to be changed
      formData = {
        id: req.params.id,
        alias: req.body.alias, // Keep alias unchanged (but pass through for validation)
        target: req.body.target,
        utm_source: req.body.utm_source || '',
        utm_medium: req.body.utm_medium || '',
        utm_campaign: req.body.utm_campaign || '',
        active: !!req.body.active
      };
    } else {
      // For creating: Allow all fields
      formData = { 
        ...req.body, 
        active: !!req.body.active 
      };
    }
    
    await upsertRoute(formData, db);
    return res.redirect('/admin/dashboard');
  }
  
  const id = req.params.id || '';
  const alias = req.params.alias || '';
  
  let route = null;
  if (id) {
    // Find by ID (preferred)
    route = (await listRoutes(db)).find(x => x.id === id);
  } else if (alias) {
    // Find by alias (legacy)
    route = (await listRoutes(db)).find(x => x.alias === alias);
  }
  
  res.render('edit', { route });
}

async function confirmDeleteRoute(req, res, db) {
  const id = req.params.id;
  const route = (await listRoutes(db)).find(x => x.id === id);
  
  if (!route) {
    return res.redirect('/admin/dashboard');
  }
  
  res.render('delete', { route });
}

async function handleDeleteRoute(req, res, db) {
  const id = req.params.id;
  const confirmText = req.body.confirmText;
  const route = (await listRoutes(db)).find(x => x.id === id);
  
  if (!route) {
    return res.redirect('/admin/dashboard');
  }
  
  const expectedText = `DELETE-${route.alias}`;
  
  if (confirmText !== expectedText) {
    return res.render('delete', { 
      route, 
      error: `Bitte gib "${expectedText}" ein, um das Löschen zu bestätigen.` 
    });
  }
  
  // Delete QR code files
  const fs = require('fs-extra');
  const path = require('path');
  try {
    await fs.remove(path.join(__dirname, '..', 'public', 'qrs', `${id}.png`));
    await fs.remove(path.join(__dirname, '..', 'public', 'qrs', `${id}.svg`));
  } catch (error) {
    // Ignore file deletion errors
  }
  
  await deleteRoute(id, db);
  return res.redirect('/admin/dashboard');
}

module.exports = {
  dashboard,
  editRoute,
  confirmDeleteRoute,
  handleDeleteRoute
};
