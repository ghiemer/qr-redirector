const mysql = require('mysql2/promise');
const debugLogger = require('./debug.js');

class MariaDB {
  constructor(config) {
    this.config = config;
    this.type = 'mariadb'; // Typ für die Unterscheidung
    this.connection = null;
  }

  async initialize() {
    try {
      // Verbindung zur Datenbank herstellen
      this.connection = await mysql.createConnection({
        host: this.config.host,
        port: this.config.port,
        user: this.config.user,
        password: this.config.password,
        database: this.config.database
      });

      debugLogger.startup('MariaDB connection established', {
        host: this.config.host,
        port: this.config.port,
        database: this.config.database
      });

      // Tabelle erstellen falls sie nicht existiert
      await this.createTables();
      
    } catch (error) {
      debugLogger.error('MariaDB connection failed:', error);
      throw error;
    }
  }

  async createTables() {
    const createRoutesTable = `
      CREATE TABLE IF NOT EXISTS routes (
        id VARCHAR(36) PRIMARY KEY,
        alias VARCHAR(255) UNIQUE NOT NULL,
        target TEXT NOT NULL,
        utm_source VARCHAR(255) DEFAULT NULL,
        utm_medium VARCHAR(255) DEFAULT NULL,
        utm_campaign VARCHAR(255) DEFAULT NULL,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        clicks INT DEFAULT 0
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `;

    const createClicksTable = `
      CREATE TABLE IF NOT EXISTS clicks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        route_id VARCHAR(36) NOT NULL,
        ip VARCHAR(45),
        user_agent TEXT,
        referer TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `;

    await this.connection.execute(createRoutesTable);
    await this.connection.execute(createClicksTable);
    
    debugLogger.startup('MariaDB tables created/verified');
  }

  async run(sql, params = []) {
    try {
      debugLogger.database('MariaDB Query', sql, params);
      
      // SQL-Anweisungen verarbeiten
      if (sql.trim().toUpperCase().startsWith('SELECT')) {
        const [rows] = await this.connection.execute(sql, params);
        return rows;
      } else if (sql.trim().toUpperCase().startsWith('INSERT')) {
        const [result] = await this.connection.execute(sql, params);
        return { insertId: result.insertId, affectedRows: result.affectedRows };
      } else if (sql.trim().toUpperCase().startsWith('UPDATE')) {
        const [result] = await this.connection.execute(sql, params);
        return { affectedRows: result.affectedRows };
      } else if (sql.trim().toUpperCase().startsWith('DELETE')) {
        const [result] = await this.connection.execute(sql, params);
        return { affectedRows: result.affectedRows };
      }
      
    } catch (error) {
      debugLogger.error('MariaDB Query Error:', { sql, params, error: error.message });
      throw error;
    }
  }

  // Kompatibilitätsmethoden für SimpleDB-Interface
  async get(sql, params = []) {
    const rows = await this.run(sql, params);
    return rows && rows.length > 0 ? rows[0] : null;
  }

  async all(sql, params = []) {
    return await this.run(sql, params);
  }

  async getAllRoutes() {
    return await this.run('SELECT * FROM routes ORDER BY created_at DESC');
  }

  async getRouteByAlias(alias) {
    const routes = await this.run('SELECT * FROM routes WHERE alias = ? LIMIT 1', [alias]);
    return routes[0] || null;
  }

  async getRouteById(id) {
    const routes = await this.run('SELECT * FROM routes WHERE id = ? LIMIT 1', [id]);
    return routes[0] || null;
  }

  async insertRoute(route) {
    const sql = `
      INSERT INTO routes (id, alias, target, utm_source, utm_medium, utm_campaign, active, created_at, updated_at, clicks)
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), 0)
    `;
    
    const params = [
      route.id,
      route.alias,
      route.target,
      route.utm_source || null,
      route.utm_medium || null,
      route.utm_campaign || null,
      route.active !== undefined ? route.active : true
    ];
    
    await this.run(sql, params);
    return route;
  }

  async updateRoute(id, updates) {
    const allowedFields = ['target', 'utm_source', 'utm_medium', 'utm_campaign', 'active'];
    const updateFields = [];
    const params = [];
    
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        updateFields.push(`${key} = ?`);
        params.push(value);
      }
    }
    
    if (updateFields.length === 0) {
      throw new Error('No valid fields to update');
    }
    
    updateFields.push('updated_at = NOW()');
    params.push(id);
    
    const sql = `UPDATE routes SET ${updateFields.join(', ')} WHERE id = ?`;
    const result = await this.run(sql, params);
    
    if (result.affectedRows === 0) {
      throw new Error('Route not found or no changes made');
    }
    
    return await this.getRouteById(id);
  }

  async deleteRoute(id) {
    const result = await this.run('DELETE FROM routes WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }

  async incrementClicks(alias) {
    await this.run('UPDATE routes SET clicks = clicks + 1 WHERE alias = ?', [alias]);
  }

  async logClick(routeId, clickData) {
    const sql = `
      INSERT INTO clicks (route_id, ip, user_agent, referer, timestamp)
      VALUES (?, ?, ?, ?, NOW())
    `;
    
    const params = [
      routeId,
      clickData.ip || null,
      clickData.userAgent || null,
      clickData.referer || null
    ];
    
    await this.run(sql, params);
  }

  async close() {
    if (this.connection) {
      await this.connection.end();
      debugLogger.startup('MariaDB connection closed');
    }
  }
}

module.exports = MariaDB;
