const SimpleDB = require('./simple-db.js');
const MariaDB = require('./mariadb.js');
const path = require('path');
const debugLogger = require('./debug.js');

debugLogger.startup('Database module loading...');

async function initializeDatabase() {
  const dbType = process.env.DB_TYPE || 'json';
  
  if (dbType === 'mariadb') {
    // MariaDB konfigurieren
    const config = {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'qr_redirector',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'db_qr-redirector'
    };
    
    const db = new MariaDB(config);
    await db.initialize();
    debugLogger.startup('MariaDB Database initialized', config);
    return db;
    
  } else {
    // SimpleDB (JSON) verwenden
    const dbPath = path.join(__dirname, '..', 'data', 'qr-data.json');
    const db = new SimpleDB(dbPath);
    
    await db.initialize();
    debugLogger.startup('Simple JavaScript Database initialized', { path: dbPath });
    return db;
  }
}

module.exports = { initializeDatabase };
