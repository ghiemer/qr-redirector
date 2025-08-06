// lib/simple-db.js - Pure JavaScript Database
const fs = require('fs').promises;
const path = require('path');
const debugLogger = require('./debug.js');

class SimpleDB {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.type = 'json'; // Typ für die Unterscheidung
    this.data = {
      users: [],
      routes: [],
      tracking: [],
      clicks: [] // Hinzufügen für Click-Counter
    };
    this.initialized = false;
  }

  async initialize() {
    try {
      // Versuche bestehende Daten zu laden
      if (await this.fileExists(this.dbPath)) {
        const content = await fs.readFile(this.dbPath, 'utf8');
        this.data = JSON.parse(content);
        debugLogger.startup('Database loaded from file');
      } else {
        // Erstelle Standardbenutzer falls keine Daten existieren
        await this.initializeDefaultData();
        debugLogger.startup('Database initialized with default data');
      }
      
      this.initialized = true;
      return this;
    } catch (error) {
      debugLogger.error('DB_INIT', error);
      // Fallback zu Default-Daten
      await this.initializeDefaultData();
      this.initialized = true;
      return this;
    }
  }

  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async initializeDefaultData() {
    // Erstelle Standardbenutzer (admin/admin)
    const crypto = require('crypto');
    const salt = crypto.randomBytes(32).toString('hex');
    const hashedPassword = crypto.pbkdf2Sync('admin', salt, 10000, 64, 'sha512').toString('hex');
    
    this.data = {
      users: [{
        id: 1,
        email: 'admin@example.com',
        password: hashedPassword,
        salt: salt,
        twofa_method: 'email',
        twofa_secret: null,
        created_at: new Date().toISOString()
      }],
      routes: [],
      tracking: []
    };
    
    await this.save();
  }

  async save() {
    try {
      await fs.writeFile(this.dbPath, JSON.stringify(this.data, null, 2), 'utf8');
      debugLogger.database('Data saved to file', { path: this.dbPath });
    } catch (error) {
      debugLogger.error('DB_SAVE', error);
    }
  }

  // Direkte Datenzugriffsmethoden für Tracking
  async loadData() {
    return this.data;
  }

  async saveData(data) {
    this.data = data;
    await this.save();
  }

  // User-Methoden
  async getUserByEmail(email) {
    const user = this.data.users.find(u => u.email === email);
    debugLogger.database('getUserByEmail', { email, found: !!user });
    return user || null;
  }

  async getUserById(id) {
    const user = this.data.users.find(u => u.id === id);
    debugLogger.database('getUserById', { id, found: !!user });
    return user || null;
  }

  // Routes-Methoden
  async getAllRoutes() {
    debugLogger.database('getAllRoutes', { count: this.data.routes.length });
    return this.data.routes;
  }

  async getRouteByAlias(alias) {
    const route = this.data.routes.find(r => r.alias === alias);
    debugLogger.database('getRouteByAlias', { 
      alias, 
      found: !!route,
      totalRoutes: this.data.routes.length,
      allAliases: this.data.routes.map(r => r.alias)
    });
    return route || null;
  }

  async addRoute(routeData) {
    const newRoute = {
      id: routeData.id || Math.max(0, ...this.data.routes.map(r => r.id || 0)) + 1,
      ...routeData,
      created_at: new Date().toISOString()
    };
    
    this.data.routes.push(newRoute);
    await this.save();
    debugLogger.database('addRoute', { alias: newRoute.alias, id: newRoute.id });
    return newRoute;
  }

  async updateRoute(identifier, routeData, searchBy = 'id') {
    const index = this.data.routes.findIndex(r => 
      searchBy === 'alias' ? r.alias === identifier : r.id === identifier
    );
    if (index === -1) return null;
    
    this.data.routes[index] = {
      ...this.data.routes[index],
      ...routeData,
      updated_at: new Date().toISOString()
    };
    
    await this.save();
    debugLogger.database('updateRoute', { identifier, alias: this.data.routes[index].alias, searchBy });
    return this.data.routes[index];
  }

  async deleteRoute(id) {
    const index = this.data.routes.findIndex(r => r.id === id);
    if (index === -1) return false;
    
    const deletedRoute = this.data.routes[index];
    this.data.routes.splice(index, 1);
    
    await this.save();
    debugLogger.database('deleteRoute', { id, alias: deletedRoute.alias });
    return true;
  }

  async deleteRoute(id) {
    const index = this.data.routes.findIndex(r => r.id === id);
    if (index === -1) return false;
    
    const removed = this.data.routes.splice(index, 1)[0];
    await this.save();
    debugLogger.database('deleteRoute', { id, alias: removed.alias });
    return true;
  }

  // Tracking-Methoden
  async addTracking(trackingData) {
    const newTracking = {
      id: Math.max(0, ...this.data.tracking.map(t => t.id)) + 1,
      ...trackingData,
      timestamp: new Date().toISOString()
    };
    
    this.data.tracking.push(newTracking);
    await this.save();
    debugLogger.database('addTracking', { route_id: newTracking.route_id });
    return newTracking;
  }

  async getTrackingByRouteId(routeId) {
    const tracking = this.data.tracking.filter(t => t.route_id === routeId);
    debugLogger.database('getTrackingByRouteId', { routeId, count: tracking.length });
    return tracking;
  }

  // SQL-ähnliche Methoden für Kompatibilität
  async get(sql, params = []) {
    debugLogger.database('SQL get', { sql, params, paramsLength: params?.length });
    
    if (sql.includes('SELECT * FROM users WHERE email = ?')) {
      return await this.getUserByEmail(params[0]);
    }
    if (sql.includes('SELECT * FROM routes WHERE alias = ?')) {
      const result = await this.getRouteByAlias(params[0]);
      debugLogger.database('SQL get result', { alias: params[0], found: !!result });
      return result;
    }
    if (sql.includes('SELECT id FROM routes WHERE alias = ?')) {
      const route = this.data.routes.find(r => r.alias === params[0]);
      return route ? { id: route.id } : null;
    }
    if (sql.includes('SELECT * FROM routes WHERE id = ?')) {
      return this.data.routes.find(r => r.id === params[0]) || null;
    }
    
    debugLogger.error('DB_UNKNOWN_QUERY', new Error('Unknown SQL query'), { sql });
    return null;
  }

  async all(sql, params = []) {
    debugLogger.database('SQL all', { sql, params });
    
    if (sql.includes('SELECT * FROM routes ORDER BY created_at DESC')) {
      return this.data.routes.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
    if (sql.includes('SELECT * FROM routes')) {
      return this.data.routes;
    }
    if (sql.includes('SELECT * FROM tracking WHERE route_id = ?')) {
      return await this.getTrackingByRouteId(params[0]);
    }
    
    debugLogger.error('DB_UNKNOWN_QUERY', new Error('Unknown SQL query'), { sql });
    return [];
  }

  async run(sql, params = []) {
    debugLogger.database('SQL run', { sql, params });
    
    // New route schema with target, utm_source, utm_medium, utm_campaign, active
    if (sql.includes('INSERT INTO routes') && sql.includes('target')) {
      // INSERT INTO routes (id,alias,target,utm_source,utm_medium,utm_campaign,active) VALUES (?,?,?,?,?,?,?)
      const [id, alias, target, utm_source, utm_medium, utm_campaign, active] = params;
      return await this.addRoute({ id, alias, target, utm_source, utm_medium, utm_campaign, active });
    }
    
    if (sql.includes('UPDATE routes SET') && sql.includes('target') && sql.includes('WHERE id=?')) {
      if (sql.includes('alias=?')) {
        // UPDATE routes SET alias=?,target=?,utm_source=?,utm_medium=?,utm_campaign=?,active=? WHERE id=?
        const [alias, target, utm_source, utm_medium, utm_campaign, active, id] = params;
        return await this.updateRoute(id, { alias, target, utm_source, utm_medium, utm_campaign, active }, 'id');
      } else {
        // UPDATE routes SET target=?,utm_source=?,utm_medium=?,utm_campaign=?,active=? WHERE id=?
        const [target, utm_source, utm_medium, utm_campaign, active, id] = params;
        return await this.updateRoute(id, { target, utm_source, utm_medium, utm_campaign, active }, 'id');
      }
    }
    
    if (sql.includes('UPDATE routes SET') && sql.includes('target')) {
      // UPDATE routes SET target=?,utm_source=?,utm_medium=?,utm_campaign=?,active=? WHERE alias=?
      const [target, utm_source, utm_medium, utm_campaign, active, alias] = params;
      return await this.updateRoute(alias, { target, utm_source, utm_medium, utm_campaign, active }, 'alias');
    }
    
    if (sql.includes('DELETE FROM routes WHERE id = ?')) {
      // DELETE FROM routes WHERE id = ?
      const [id] = params;
      return await this.deleteRoute(id);
    }
    
    // Legacy route schema (for backwards compatibility)
    if (sql.includes('INSERT INTO routes')) {
      // INSERT INTO routes (alias, url, title, description) VALUES (?, ?, ?, ?)
      const [alias, url, title, description] = params;
      return await this.addRoute({ alias, url, title, description });
    }
    
    if (sql.includes('UPDATE routes SET')) {
      // UPDATE routes SET alias = ?, url = ?, title = ?, description = ? WHERE id = ?
      const [alias, url, title, description, id] = params;
      return await this.updateRoute(id, { alias, url, title, description });
    }
    
    if (sql.includes('DELETE FROM routes WHERE id = ?')) {
      return await this.deleteRoute(params[0]);
    }
    
    if (sql.includes('INSERT INTO tracking')) {
      // INSERT INTO tracking (route_id, ip, user_agent, referer) VALUES (?, ?, ?, ?)
      const [route_id, ip, user_agent, referer] = params;
      return await this.addTracking({ route_id, ip, user_agent, referer });
    }
    
    debugLogger.error('DB_UNKNOWN_QUERY', new Error('Unknown SQL query'), { sql });
    return null;
  }
}

module.exports = SimpleDB;
