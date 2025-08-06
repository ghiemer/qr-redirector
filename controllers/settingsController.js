const { validateLogin } = require('../lib/auth.js');
const { resetAllCounters, cleanupLogs } = require('../lib/tracking.js');
const fs = require('fs-extra');
const path = require('path');
const debugLogger = require('../lib/debug.js');

async function showSettings(req, res, db) {
  const currentSettings = {
    defaultRedirectUrl: process.env.DEFAULT_REDIRECT_URL || '',
    dbType: process.env.DB_TYPE || 'json',
    dbHost: process.env.DB_HOST || 'localhost',
    dbPort: process.env.DB_PORT || '3306',
    dbName: process.env.DB_NAME || 'db_qr-redirector',
    dbUser: process.env.DB_USER || 'qr_redirector',
    smtpEnabled: process.env.SMTP_ENABLED !== 'false',
    smtpHost: process.env.SMTP_HOST || '',
    smtpPort: process.env.SMTP_PORT || '587',
    smtpUser: process.env.SMTP_USER || '',
    twoFactorEnabled: process.env.TWO_FACTOR_ENABLED !== 'false',
    clickCounterEnabled: process.env.CLICK_COUNTER_ENABLED !== 'false',
    loggingEnabled: process.env.LOGGING_ENABLED !== 'false',
    logRetentionDays: process.env.LOG_RETENTION_DAYS || '30'
  };
  
  res.render('settings', { 
    settings: currentSettings,
    user: req.session.user,
    error: null,
    success: null
  });
}

async function updateSettings(req, res, db) {
  try {
    const { 
      password, 
      twoFactorCode,
      defaultRedirectUrl,
      dbType,
      dbHost,
      dbPort,
      dbName,
      dbUser,
      dbPassword,
      smtpEnabled,
      smtpHost,
      smtpPort,
      smtpUser,
      smtpPassword,
      twoFactorEnabled,
      clickCounterEnabled,
      loggingEnabled,
      logRetentionDays
    } = req.body;

    // Passwort-Validierung
    const user = await validateLogin(req.session.user.email, password, db);
    if (!user) {
      return res.render('settings', {
        settings: getCurrentSettings(),
        user: req.session.user,
        error: 'Ungültiges Passwort',
        success: null
      });
    }

    // 2FA-Validierung (falls aktiviert)
    if (process.env.TWO_FACTOR_ENABLED !== 'false') {
      if (!req.session.settingsOtp || req.session.settingsOtp !== twoFactorCode) {
        return res.render('settings', {
          settings: getCurrentSettings(),
          user: req.session.user,
          error: '2FA-Code ungültig oder abgelaufen',
          success: null
        });
      }
      // OTP aufräumen
      delete req.session.settingsOtp;
      delete req.session.settingsOtpExpiry;
    }

    // .env-Datei aktualisieren
    const envPath = path.join(__dirname, '..', '.env');
    let envContent = '';
    
    if (await fs.pathExists(envPath)) {
      envContent = await fs.readFile(envPath, 'utf8');
    }

    // Neue Werte setzen
    const newSettings = {
      DEFAULT_REDIRECT_URL: defaultRedirectUrl,
      DB_TYPE: dbType,
      DB_HOST: dbHost,
      DB_PORT: dbPort,
      DB_NAME: dbName,
      DB_USER: dbUser,
      ...(dbPassword && { DB_PASSWORD: dbPassword }),
      SMTP_ENABLED: smtpEnabled ? 'true' : 'false',
      SMTP_HOST: smtpHost,
      SMTP_PORT: smtpPort,
      SMTP_USER: smtpUser,
      ...(smtpPassword && { SMTP_PASS: smtpPassword }),
      TWO_FACTOR_ENABLED: twoFactorEnabled ? 'true' : 'false',
      CLICK_COUNTER_ENABLED: clickCounterEnabled ? 'true' : 'false',
      LOGGING_ENABLED: loggingEnabled ? 'true' : 'false',
      LOG_RETENTION_DAYS: logRetentionDays || '30'
    };

    // .env aktualisieren
    let updatedEnv = envContent;
    for (const [key, value] of Object.entries(newSettings)) {
      if (value !== undefined) {
        const regex = new RegExp(`^${key}=.*$`, 'm');
        const line = `${key}=${value}`;
        
        if (regex.test(updatedEnv)) {
          updatedEnv = updatedEnv.replace(regex, line);
        } else {
          updatedEnv += `\n${line}`;
        }
      }
    }

    await fs.writeFile(envPath, updatedEnv);
    
    // Process.env aktualisieren (für aktuelle Session)
    Object.assign(process.env, newSettings);

    debugLogger.startup('Settings updated by admin', { user: req.session.user.email });

    res.render('settings', {
      settings: getCurrentSettings(),
      user: req.session.user,
      error: null,
      success: 'Einstellungen erfolgreich gespeichert! Server-Neustart empfohlen für vollständige Aktivierung.'
    });

  } catch (error) {
    debugLogger.error('SETTINGS_UPDATE', error, { user: req.session.user?.email });
    res.render('settings', {
      settings: getCurrentSettings(),
      user: req.session.user,
      error: 'Fehler beim Speichern der Einstellungen: ' + error.message,
      success: null
    });
  }
}

async function requestSettingsOtp(req, res, db) {
  try {
    if (process.env.TWO_FACTOR_ENABLED === 'false') {
      return res.json({ success: false, message: '2FA ist deaktiviert' });
    }

    const { issueSecondFactor } = require('../lib/auth.js');
    
    // OTP für Settings generieren
    const code = String(Math.floor(100000 + Math.random() * 900000));
    req.session.settingsOtp = code;
    req.session.settingsOtpExpiry = Date.now() + (10 * 60 * 1000); // 10 Minuten

    // E-Mail senden (mit Fallback zu Console)
    console.log(`\n${'='.repeat(50)}`);
    console.log(`🔐 SETTINGS 2FA CODE für ${req.session.user.email}`);
    console.log(`📱 Code: ${code}`);
    console.log(`⏰ Gültig bis: ${new Date(req.session.settingsOtpExpiry).toLocaleString('de-DE')}`);
    console.log(`${'='.repeat(50)}\n`);

    res.json({ 
      success: true, 
      message: '2FA-Code generiert. Prüfe deine E-Mail oder Konsole.' 
    });

  } catch (error) {
    debugLogger.error('SETTINGS_OTP', error, { user: req.session.user?.email });
    res.json({ 
      success: false, 
      message: 'Fehler beim Generieren des 2FA-Codes' 
    });
  }
}

function getCurrentSettings() {
  return {
    defaultRedirectUrl: process.env.DEFAULT_REDIRECT_URL || '',
    dbType: process.env.DB_TYPE || 'json',
    dbHost: process.env.DB_HOST || 'localhost',
    dbPort: process.env.DB_PORT || '3306',
    dbName: process.env.DB_NAME || 'db_qr-redirector',
    dbUser: process.env.DB_USER || 'qr_redirector',
    smtpEnabled: process.env.SMTP_ENABLED !== 'false',
    smtpHost: process.env.SMTP_HOST || '',
    smtpPort: process.env.SMTP_PORT || '587',
    smtpUser: process.env.SMTP_USER || '',
    twoFactorEnabled: process.env.TWO_FACTOR_ENABLED !== 'false',
    clickCounterEnabled: process.env.CLICK_COUNTER_ENABLED !== 'false',
    loggingEnabled: process.env.LOGGING_ENABLED !== 'false',
    logRetentionDays: process.env.LOG_RETENTION_DAYS || '30'
  };
}

// Klick-Counter zurücksetzen
async function resetCounters(req, res, db) {
  try {
    const { password } = req.body;

    // Passwort-Validierung
    const user = await validateLogin(req.session.user.email, password, db);
    if (!user) {
      return res.render('settings', {
        settings: getCurrentSettings(),
        user: req.session.user,
        error: 'Ungültiges Passwort für Counter-Reset',
        success: null
      });
    }

    // Counter zurücksetzen
    const result = await resetAllCounters(db);
    
    if (result.success) {
      debugLogger.startup('All click counters reset by admin', { user: req.session.user.email });
      res.render('settings', {
        settings: getCurrentSettings(),
        user: req.session.user,
        error: null,
        success: 'Alle Klick-Counter wurden erfolgreich zurückgesetzt'
      });
    } else {
      res.render('settings', {
        settings: getCurrentSettings(),
        user: req.session.user,
        error: 'Fehler beim Zurücksetzen der Counter: ' + (result.error || 'Unbekannter Fehler'),
        success: null
      });
    }
  } catch (error) {
    debugLogger.error('RESET_COUNTERS', error, { user: req.session.user?.email });
    res.render('settings', {
      settings: getCurrentSettings(),
      user: req.session.user,
      error: 'Fehler beim Zurücksetzen der Counter: ' + error.message,
      success: null
    });
  }
}

// Log-Dateien bereinigen
async function cleanupLogsAction(req, res, db) {
  try {
    const { password } = req.body;

    // Passwort-Validierung
    const user = await validateLogin(req.session.user.email, password, db);
    if (!user) {
      return res.render('settings', {
        settings: getCurrentSettings(),
        user: req.session.user,
        error: 'Ungültiges Passwort für Log-Bereinigung',
        success: null
      });
    }

    // Logs bereinigen
    const result = await cleanupLogs();
    
    if (result.success) {
      debugLogger.startup('Log files cleaned up by admin', { user: req.session.user.email });
      res.render('settings', {
        settings: getCurrentSettings(),
        user: req.session.user,
        error: null,
        success: 'Alte Log-Dateien wurden erfolgreich bereinigt'
      });
    } else {
      res.render('settings', {
        settings: getCurrentSettings(),
        user: req.session.user,
        error: 'Fehler beim Bereinigen der Logs: ' + (result.error || 'Unbekannter Fehler'),
        success: null
      });
    }
  } catch (error) {
    debugLogger.error('CLEANUP_LOGS', error, { user: req.session.user?.email });
    res.render('settings', {
      settings: getCurrentSettings(),
      user: req.session.user,
      error: 'Fehler beim Bereinigen der Logs: ' + error.message,
      success: null
    });
  }
}

module.exports = {
  showSettings,
  updateSettings,
  requestSettingsOtp,
  resetCounters,
  cleanupLogsAction
};
