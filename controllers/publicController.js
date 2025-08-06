const { buildUrl } = require('../services/routeService.js');
const { track } = require('../lib/tracking.js');
const debugLogger = require('../lib/debug.js');

async function redirect(req, res, db) {
  const alias = req.params.alias;
  debugLogger.qr('Redirect request', alias, { 
    ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
    userAgent: req.headers['user-agent']
  });
  
  try {
    const r = await db.get('SELECT * FROM routes WHERE alias = ?', [alias]);
    
    if (!r) {
      debugLogger.qr('Route not found', alias, null);
      return res.status(404).send('Link nicht gefunden.');
    }
    
    if (!r.active) {
      debugLogger.qr('Route inactive', alias, { active: r.active });
      return res.status(404).send('Link deaktiviert.');
    }
    
    const url = buildUrl(r);
    debugLogger.qr('URL built', alias, { 
      originalUrl: r.target,
      builtUrl: url,
      hasUtmParams: !!(r.utm_source || r.utm_medium || r.utm_campaign)
    });
    
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const ua = req.headers['user-agent'] || '';
    const ref = req.headers.referer || '';
    
    // Tracking asynchron
    track(alias, ip, ua, ref, db).catch((error) => {
      debugLogger.error('TRACKING', error, { alias, ip });
    });
    
    debugLogger.qr('Redirect executed', alias, { 
      targetUrl: url,
      statusCode: 302
    });
    
    res.redirect(302, url);
    
  } catch (error) {
    debugLogger.error('REDIRECT', error, { alias });
    res.status(500).send('Server Fehler');
  }
}

module.exports = { redirect };
