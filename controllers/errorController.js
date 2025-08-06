const debugLogger = require('../lib/debug.js');

function show404(req, res) {
  const defaultUrl = process.env.DEFAULT_REDIRECT_URL;
  
  debugLogger.error('404_PAGE', new Error('Page not found'), {
    url: req.url,
    method: req.method,
    userAgent: req.headers['user-agent'],
    ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress
  });
  
  res.status(404).render('404', { 
    defaultUrl: defaultUrl || null 
  });
}

module.exports = {
  show404
};
