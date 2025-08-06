const crypto = require('crypto');
const fetch = require('node-fetch');
const fs = require('fs').promises;
const path = require('path');
const dotenv = require('dotenv');
dotenv.config();

/**
 * Erstellt einen pseudonymisierten Hash aus IP und User Agent
 * für die Erkennung von mehrfachen Scans derselben Person
 */
function createUserFingerprint(ip, userAgent) {
  const combined = `${ip}:${userAgent}`;
  return crypto.createHash('sha256').update(combined).digest('hex').substring(0, 16);
}

/**
 * Erstellt einen pseudonymisierten IP-Hash
 */
function hashIP(ip) {
  return crypto.createHash('sha256').update(ip).digest('hex').substring(0, 12);
}

/**
 * Tracking-Funktion für Klick-Counter
 */
async function trackClick(alias, ip, userAgent, referer, db) {
  const isCounterEnabled = process.env.CLICK_COUNTER_ENABLED === 'true';
  
  if (!isCounterEnabled) {
    return { tracked: false, reason: 'Counter disabled' };
  }

  try {
    const fingerprint = createUserFingerprint(ip, userAgent);
    const timestamp = new Date().toISOString();
    const ipHash = hashIP(ip);

    // Prüfe ob derselbe User (Fingerprint) in den letzten 5 Minuten bereits gescannt hat
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    
    let recentScan = false;
    if (db.type === 'json') {
      // Für SimpleDB: Lade direkt die Daten
      const data = await db.loadData();
      recentScan = data.clicks?.some(click => 
        click.alias === alias && 
        click.fingerprint === fingerprint && 
        click.timestamp > fiveMinutesAgo
      ) || false;
    } else {
      const result = await db.get(
        'SELECT id FROM clicks WHERE alias = ? AND fingerprint = ? AND timestamp > ?',
        [alias, fingerprint, fiveMinutesAgo]
      );
      recentScan = !!result;
    }

    // Nur zählen wenn nicht kürzlich gescannt
    if (!recentScan) {
      const clickData = {
        id: crypto.randomUUID(),
        alias,
        fingerprint,
        ip_hash: ipHash,
        timestamp,
        user_agent_hash: crypto.createHash('sha256').update(userAgent).digest('hex').substring(0, 8),
        referer: referer ? crypto.createHash('sha256').update(referer).digest('hex').substring(0, 8) : null
      };

      if (db.type === 'json') {
        // Für SimpleDB: Verwende die interne Methode
        const data = await db.loadData();
        if (!data.clicks) data.clicks = [];
        data.clicks.push(clickData);
        await db.saveData(data);
      } else {
        await db.run(
          `INSERT INTO clicks (id, alias, fingerprint, ip_hash, timestamp, user_agent_hash, referer) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [clickData.id, clickData.alias, clickData.fingerprint, clickData.ip_hash, 
           clickData.timestamp, clickData.user_agent_hash, clickData.referer]
        );
      }

      return { tracked: true, unique: true, clickData };
    } else {
      return { tracked: false, unique: false, reason: 'Recent scan detected' };
    }
  } catch (error) {
    console.error('Click tracking error:', error);
    return { tracked: false, error: error.message };
  }
}

/**
 * Vollständiges Logging aller Weiterleitungen
 */
async function logRedirect(alias, target, ip, userAgent, referer, clickResult) {
  const isLoggingEnabled = process.env.LOGGING_ENABLED === 'true';
  
  if (!isLoggingEnabled) {
    return { logged: false, reason: 'Logging disabled' };
  }

  try {
    const logEntry = {
      timestamp: new Date().toISOString(),
      alias,
      target,
      ip_hash: hashIP(ip),
      user_agent_hash: crypto.createHash('sha256').update(userAgent).digest('hex').substring(0, 8),
      referer_hash: referer ? crypto.createHash('sha256').update(referer).digest('hex').substring(0, 8) : null,
      fingerprint: createUserFingerprint(ip, userAgent),
      click_tracked: clickResult.tracked,
      unique_visit: clickResult.unique || false
    };

    // Log in Datei schreiben
    const logDir = path.join(__dirname, '..', 'logs');
    await fs.mkdir(logDir, { recursive: true });
    
    const today = new Date().toISOString().split('T')[0];
    const logFile = path.join(logDir, `redirects-${today}.log`);
    
    const logLine = JSON.stringify(logEntry) + '\n';
    await fs.appendFile(logFile, logLine, 'utf8');

    return { logged: true, logEntry };
  } catch (error) {
    console.error('Redirect logging error:', error);
    return { logged: false, error: error.message };
  }
}

/**
 * Klick-Statistiken abrufen
 */
async function getClickStats(alias, db) {
  try {
    if (db.type === 'json') {
      const data = await db.loadData();
      const clicks = data.clicks || [];
      const routeClicks = clicks.filter(click => click.alias === alias);
      
      return {
        total: routeClicks.length,
        unique: new Set(routeClicks.map(click => click.fingerprint)).size,
        today: routeClicks.filter(click => 
          click.timestamp.startsWith(new Date().toISOString().split('T')[0])
        ).length
      };
    } else {
      const total = await db.get('SELECT COUNT(*) as count FROM clicks WHERE alias = ?', [alias]);
      const unique = await db.get('SELECT COUNT(DISTINCT fingerprint) as count FROM clicks WHERE alias = ?', [alias]);
      const today = await db.get(
        'SELECT COUNT(*) as count FROM clicks WHERE alias = ? AND DATE(timestamp) = DATE(?)',
        [alias, new Date().toISOString()]
      );
      
      return {
        total: total?.count || 0,
        unique: unique?.count || 0,
        today: today?.count || 0
      };
    }
  } catch (error) {
    console.error('Error getting click stats:', error);
    // Fallback für Fehler
    return { total: 0, unique: 0, today: 0 };
  }
}

/**
 * Alle Klick-Counter zurücksetzen
 */
async function resetAllCounters(db) {
  try {
    if (db.type === 'json') {
      const data = await db.loadData();
      data.clicks = [];
      await db.saveData(data);
    } else {
      await db.run('DELETE FROM clicks');
    }
    return { success: true };
  } catch (error) {
    console.error('Error resetting counters:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Klick-Counter für spezifische Route zurücksetzen
 */
async function resetCounterForRoute(alias, db) {
  try {
    if (db.type === 'json') {
      const data = await db.loadData();
      data.clicks = (data.clicks || []).filter(click => click.alias !== alias);
      await db.saveData(data);
    } else {
      await db.run('DELETE FROM clicks WHERE alias = ?', [alias]);
    }
    return { success: true };
  } catch (error) {
    console.error('Error resetting counter for route:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Log-Dateien bereinigen (alte Logs löschen)
 */
async function cleanupLogs() {
  try {
    const retentionDays = parseInt(process.env.LOG_RETENTION_DAYS) || 30;
    const logDir = path.join(__dirname, '..', 'logs');
    
    try {
      const files = await fs.readdir(logDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      
      for (const file of files) {
        if (file.startsWith('redirects-') && file.endsWith('.log')) {
          const dateStr = file.replace('redirects-', '').replace('.log', '');
          const fileDate = new Date(dateStr);
          
          if (fileDate < cutoffDate) {
            await fs.unlink(path.join(logDir, file));
            console.log(`Deleted old log file: ${file}`);
          }
        }
      }
    } catch (error) {
      // Log-Verzeichnis existiert nicht oder ist leer
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error cleaning up logs:', error);
    return { success: false, error: error.message };
  }
}

// Legacy Support für bestehende track-Funktion
async function track(alias, ip, ua, ref, db) {
  // Nur für Rückwärtskompatibilität - wird durch neue Funktionen ersetzt
  const clickResult = await trackClick(alias, ip, ua, ref, db);
  return clickResult;
}

module.exports = { 
  track,
  trackClick,
  logRedirect,
  getClickStats,
  resetAllCounters,
  resetCounterForRoute,
  cleanupLogs,
  createUserFingerprint,
  hashIP
};
