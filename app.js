// app.js
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config();

const { dashboard, editRoute, confirmDeleteRoute, handleDeleteRoute } = require('./controllers/adminController.js');
const { redirect } = require('./controllers/publicController.js');
const settingsController = require('./controllers/settingsController.js');
const { show404 } = require('./controllers/errorController.js');
const routeService = require('./services/routeService.js');
const { validateLogin, issueSecondFactor, verifySecondFactor } = require('./lib/auth.js');
const debugLogger = require('./lib/debug.js');
const { initializeDatabase } = require('./lib/db.js');

const app = express();

// Database initialisieren
let db;

async function startServer() {
  try {
    // Debug-Startup Information
    debugLogger.startup('QR-Redirector wird gestartet...', {
      nodeVersion: process.version,
      platform: process.platform,
      env: process.env.NODE_ENV || 'development',
      debug: debugLogger.DEBUG,
      port: process.env.PORT,
      __dirname: __dirname
    });

    // Database initialisieren
    db = await initializeDatabase();
    debugLogger.startup('Database initialized');

    // Middleware Setup
    
    // Trust proxy for Plesk/nginx setup
    app.set('trust proxy', true);
    
    // Proxy headers middleware for production
    if (process.env.NODE_ENV === 'production') {
      app.use((req, res, next) => {
        // Protokoll aus Headers ableiten
        if (req.headers['x-forwarded-proto']) {
          req.protocol = req.headers['x-forwarded-proto'];
        }
        
        // Host aus Headers ableiten
        if (req.headers['x-forwarded-host']) {
          req.host = req.headers['x-forwarded-host'];
        }
        
        // Debug-Informationen für Proxy Headers
        if (process.env.DEBUG === 'true') {
          debugLogger.http('Proxy Headers', {
            'x-forwarded-proto': req.headers['x-forwarded-proto'],
            'x-forwarded-host': req.headers['x-forwarded-host'],
            'x-forwarded-for': req.headers['x-forwarded-for'],
            'host': req.headers.host,
            'protocol': req.protocol,
            'secure': req.secure,
            'originalUrl': req.originalUrl
          });
        }
        
        next();
      });
    }
    
    app.use(express.static(path.join(__dirname, 'public')));
    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, 'views'));
    app.use(bodyParser.urlencoded({ extended: true }));

    // Debug Middleware - muss vor anderen Middlewares stehen
    app.use(debugLogger.request.bind(debugLogger));

    app.use(session({
      secret: process.env.SESSION_SECRET || 'development-fallback-secret-key-change-in-production',
      resave: false,
      saveUninitialized: false,
      cookie: { 
        secure: process.env.NODE_ENV === 'production' && process.env.HOST_URL?.startsWith('https'), // HTTPS in Produktion
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        httpOnly: true,
        sameSite: 'lax'
      }
    }));

    debugLogger.startup('Session Store konfiguriert');

    function ensureAuth(req, res, next) {
      debugLogger.session('Auth Check', req.session);
      
      if (req.session.user) {
        debugLogger.auth('Authorization', req.session.user, true);
        return next();
      }
      
      debugLogger.auth('Authorization', null, false, 'Redirecting to admin login');
      res.redirect('/admin/login');
    }

    function ensureAdminAuth(req, res, next) {
      debugLogger.session('Admin Auth Check', req.session);
      
      if (req.session.user) {
        // Prüfe ob der Benutzer admin@otmarkastner.com ist
        if (req.session.user.email === 'admin@otmarkastner.com') {
          debugLogger.auth('Admin Authorization', req.session.user, true, 'Access granted to admin user');
          return next();
        } else {
          debugLogger.auth('Admin Authorization', req.session.user, false, 'Access denied - not admin user');
          return res.status(403).render('404', { 
            error: 'Zugriff verweigert: Diese Seite ist nur für den Hauptadministrator verfügbar.',
            user: req.session.user 
          });
        }
      }
      
      debugLogger.auth('Admin Authorization', null, false, 'Redirecting to admin login');
      res.redirect('/admin/login');
    }

    app.get('/login', (req, res) => {
      debugLogger.auth('Login page accessed');
      res.render('login', { step: 1, method: null, error: null, passkey: null });
    });

    app.post('/login', async (req, res) => {
      debugLogger.auth('Login attempt', { email: req.body.email });
      
      try {
        const { email, password } = req.body;
        const user = await validateLogin(email, password, db);
        
        if (!user) {
          debugLogger.auth('Login failed', { email }, false, 'Invalid credentials');
          return res.render('login', { step: 1, error: 'Ungültige Daten', method: null, passkey: null });
        }

        // Prüfen ob 2FA deaktiviert ist
        if (process.env.TWO_FACTOR_ENABLED === 'false') {
          debugLogger.auth('2FA disabled - direct login', user, true);
          req.session.user = user;
          debugLogger.auth('Login complete (2FA bypassed)', req.session.user, true);
          debugLogger.session('User authenticated without 2FA', req.session);
          return res.redirect('/');
        }

        req.session.tmpUser = user;
        debugLogger.session('Temp user set', req.session);
        
        const info = await issueSecondFactor(user, req);
        debugLogger.auth('2FA issued', user, true, { type: info.type });
        
        res.render('login', {
          step: 2,
          method: info.type,
          passkey: info.options || null,
          error: null
        });
      } catch (error) {
        debugLogger.error('LOGIN', error, { email: req.body.email });
        res.render('login', { step: 1, error: 'Server Fehler', method: null, passkey: null });
      }
    });

    app.post('/login/verify', async (req, res) => {
      debugLogger.auth('2FA verification attempt', req.session.tmpUser);
      
      try {
        const ok = await verifySecondFactor(
          req.session.tmpUser,
          req.body.code || req.body,
          req
        );
        
        if (!ok) {
          debugLogger.auth('2FA verification failed', req.session.tmpUser, false);
          return res.render('login', {
            step: 2,
            method: req.session.tmpUser.twofa_method,
            error: '2FA falsch',
            passkey: null
          });
        }
        
        req.session.user = req.session.tmpUser;
        delete req.session.tmpUser;
        debugLogger.auth('Login complete', req.session.user, true);
        debugLogger.session('User authenticated', req.session);
        
        res.redirect('/');
      } catch (error) {
        debugLogger.error('2FA_VERIFY', error, { tmpUser: req.session.tmpUser });
        res.render('login', {
          step: 2,
          method: req.session.tmpUser?.twofa_method || 'unknown',
          error: 'Server Fehler',
          passkey: null
        });
      }
    });

    // Route Wrapper für DB-Parameter
    const withDb = (handler) => (req, res, next) => handler(req, res, db, next);

    // Root Route - Weiterleitung basierend auf Konfiguration
    app.get('/', (req, res) => {
      // Prüfe ob eine Default-Weiterleitung konfiguriert ist
      const defaultRedirect = process.env.DEFAULT_REDIRECT_URL;
      if (defaultRedirect) {
        debugLogger.startup('Root redirect to:', defaultRedirect);
        return res.redirect(302, defaultRedirect);
      }
      // Standard: 404-Seite anzeigen
      debugLogger.startup('Root showing 404 page (default behavior)');
      return show404(req, res);
    });

    // Favicon-Route (Fallback für /favicon.ico)
    app.get('/favicon.ico', (req, res) => {
      res.redirect(301, '/favicon.svg');
    });

        // Debug-Endpunkt (nur im Debug-Modus)
    if (debugLogger.DEBUG) {
      app.get('/debug/login', async (req, res) => {
        try {
          const testUser = await db.get('SELECT * FROM users WHERE email = ?', ['admin@otmarkastner.com']);
          res.json({
            status: 'OK',
            database: db.type,
            userFound: !!testUser,
            userEmail: testUser?.email,
            hasPassword: !!testUser?.password,
            environment: process.env.NODE_ENV,
            twoFactorEnabled: process.env.TWO_FACTOR_ENABLED
          });
        } catch (error) {
          res.json({
            status: 'ERROR',
            error: error.message
          });
        }
      });
    }

    // Admin routes
    app.get('/admin', ensureAuth, (req, res) => res.redirect('/admin/dashboard'));
    app.get('/admin/login', (req, res) => {
      debugLogger.auth('Admin login page accessed');
      res.render('login', { step: 1, method: null, error: null, passkey: null });
    });
    app.post('/admin/login', async (req, res) => {
      debugLogger.http('POST /admin/login', { 
        headers: req.headers, 
        query: req.query, 
        body: req.body,
        session: req.session?.user ? 'authenticated' : 'no session'
      });
      debugLogger.auth('Admin login attempt', { email: req.body.email });
      
      try {
        const { email, password } = req.body;
        
        if (!email || !password) {
          debugLogger.auth('Login failed', { email }, false, 'Missing email or password');
          return res.render('login', { step: 1, error: 'E-Mail und Passwort erforderlich', method: null, passkey: null });
        }
        
        const user = await validateLogin(email, password, db);
        
        if (!user) {
          debugLogger.auth('Login failed', { email }, false, 'Invalid credentials');
          return res.render('login', { step: 1, error: 'Ungültige Daten', method: null, passkey: null });
        }

        // Prüfen ob 2FA deaktiviert ist
        if (process.env.TWO_FACTOR_ENABLED === 'false') {
          debugLogger.auth('2FA disabled - direct login', user, true);
          req.session.user = user;
          debugLogger.auth('Login complete (2FA bypassed)', req.session.user, true);
          debugLogger.session('User authenticated without 2FA', req.session);
          return res.redirect('/admin/dashboard');
        }

        req.session.tmpUser = user;
        debugLogger.session('Temp user set', req.session);
        
        const info = await issueSecondFactor(user, req);
        debugLogger.auth('2FA issued', user, true, { type: info.type });
        
        res.render('login', {
          step: 2,
          method: info.type,
          passkey: info.options || null,
          error: null
        });
      } catch (error) {
        debugLogger.error('LOGIN', error, { email: req.body.email, stack: error.stack });
        res.render('login', { step: 1, error: 'Server Fehler', method: null, passkey: null });
      }
    });
    app.post('/admin/login/verify', async (req, res) => {
      debugLogger.auth('2FA verification attempt', req.session.tmpUser);
      
      try {
        const ok = await verifySecondFactor(
          req.session.tmpUser,
          req.body.code || req.body,
          req
        );
        
        if (!ok) {
          debugLogger.auth('2FA verification failed', req.session.tmpUser, false);
          return res.render('login', {
            step: 2,
            method: req.session.tmpUser.twofa_method,
            error: '2FA falsch',
            passkey: null
          });
        }
        
        req.session.user = req.session.tmpUser;
        delete req.session.tmpUser;
        debugLogger.auth('Login complete', req.session.user, true);
        debugLogger.session('User authenticated', req.session);
        
        res.redirect('/admin/dashboard');
      } catch (error) {
        debugLogger.error('2FA_VERIFY', error, { tmpUser: req.session.tmpUser });
        res.render('login', {
          step: 2,
          method: req.session.tmpUser?.twofa_method || 'unknown',
          error: 'Server Fehler',
          passkey: null
        });
      }
    });

    app.get('/admin/dashboard', ensureAuth, withDb(dashboard));
    app.route('/admin/routes/new').get(ensureAuth, withDb(editRoute)).post(ensureAuth, withDb(editRoute));
    app.route('/admin/routes/edit/:id').get(ensureAuth, withDb(editRoute)).post(ensureAuth, withDb(editRoute));
    app.get('/admin/routes/delete/:id', ensureAuth, withDb(confirmDeleteRoute));
    app.post('/admin/routes/delete/:id', ensureAuth, withDb(handleDeleteRoute));
    
        // Settings-Routen (nur für admin@otmarkastner.com)
    app.get('/admin/settings', ensureAdminAuth, withDb(settingsController.showSettings));
    app.post('/admin/settings', ensureAdminAuth, withDb(settingsController.updateSettings));
    app.post('/admin/settings/otp', ensureAdminAuth, withDb(settingsController.requestSettingsOtp));
    app.post('/admin/settings/reset-counters', ensureAdminAuth, withDb(settingsController.resetCounters));
    app.post('/admin/settings/cleanup-logs', ensureAdminAuth, withDb(settingsController.cleanupLogsAction));
    
    // Logout
    app.post('/admin/logout', (req, res) => {
      req.session.destroy((err) => {
        if (err) {
          debugLogger.error('LOGOUT', err);
        }
        res.redirect('/admin/login');
      });
    });
    
    // Legacy Support für alte URLs (Redirect zu neuen Admin-URLs)
    app.get('/new', ensureAuth, (req, res) => res.redirect('/admin/routes/new'));
    app.get('/edit/:id', ensureAuth, (req, res) => res.redirect(`/admin/routes/edit/${req.params.id}`));
    app.get('/delete/:id', ensureAuth, (req, res) => res.redirect(`/admin/routes/delete/${req.params.id}`));

    // QR-Code Redirect Route (öffentlich) - muss vor dem 404 Handler stehen
    app.get('/:alias', withDb(async (req, res, db) => {
      try {
        await routeService.redirectById(req, res, db);
      } catch (error) {
        debugLogger.error('REDIRECT_ERROR', error, { alias: req.params.alias });
        return show404(req, res);
      }
    }));

    // 404 Catch-All Handler (muss am Ende stehen)
    app.use('*', (req, res) => {
      debugLogger.error('404_CATCHALL', new Error('Page not found'), { url: req.originalUrl });
      return show404(req, res);
    });

    // Global Error Handler
    app.use((error, req, res, next) => {
      debugLogger.error('EXPRESS', error, {
        url: req.url,
        method: req.method,
        user: req.session?.user?.email || 'anonymous'
      });
      
      res.status(500).json({ 
        error: 'Internal Server Error',
        ...(debugLogger.DEBUG && { details: error.message, stack: error.stack })
      });
    });

    app.listen(process.env.PORT || 3000, () => {
      const hostUrl = process.env.HOST_URL || `http://localhost:${process.env.PORT || 3000}`;
      debugLogger.startup(`Server läuft auf Port ${process.env.PORT || 3000}`, {
        url: hostUrl,
        debug: debugLogger.DEBUG
      });
      console.log(`➡️  QR-Redirector läuft auf ${hostUrl}`);
      
      if (debugLogger.DEBUG) {
        console.log('🐛 DEBUG MODE AKTIVIERT - Detaillierte Logs werden angezeigt');
      }
    });

  } catch (error) {
    debugLogger.error('STARTUP', error);
    process.exit(1);
  }
}

// Server starten
startServer();
