// Debug-Konfiguration und Utility-Funktionen
const chalk = require('chalk');

const DEBUG = process.env.DEBUG === 'true' || false;

class DebugLogger {
    constructor() {
        this.startTime = Date.now();
        this.requestCounter = 0;
    }

    log(category, message, data = null) {
        if (!DEBUG) return;
        
        const timestamp = new Date().toISOString();
        const uptime = ((Date.now() - this.startTime) / 1000).toFixed(2);
        
        console.log(chalk.gray(`[${timestamp}]`), 
                   chalk.blue(`[${uptime}s]`),
                   chalk.green(`[${category}]`), 
                   message);
        
        if (data) {
            console.log(chalk.yellow('Data:'), JSON.stringify(data, null, 2));
        }
    }

    request(req, res, next) {
        if (!DEBUG) return next();
        
        const reqId = ++this.requestCounter;
        const start = Date.now();
        
        console.log(chalk.cyan(`\n--- REQUEST #${reqId} START ---`));
        this.log('HTTP', `${req.method} ${req.url}`, {
            headers: req.headers,
            query: req.query,
            body: req.method === 'POST' ? req.body : 'N/A',
            session: req.session ? {
                user: req.session.user ? 'authenticated' : 'anonymous',
                sessionId: req.sessionID
            } : 'no session'
        });

        res.on('finish', () => {
            const duration = Date.now() - start;
            this.log('HTTP', `${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
            console.log(chalk.cyan(`--- REQUEST #${reqId} END ---\n`));
        });

        next();
    }

    error(category, error, context = null) {
        if (!DEBUG) {
            console.error(`[${category}] Error:`, error.message);
            return;
        }

        console.log(chalk.red('\n🔴 ERROR DETECTED 🔴'));
        console.log(chalk.red(`Category: ${category}`));
        console.log(chalk.red(`Message: ${error.message}`));
        console.log(chalk.red(`Stack: ${error.stack}`));
        
        if (context) {
            console.log(chalk.yellow('Context:'), JSON.stringify(context, null, 2));
        }
        console.log(chalk.red('🔴 ERROR END 🔴\n'));
    }

    database(operation, query, params = null, result = null) {
        if (!DEBUG) return;
        
        this.log('DB', `${operation}: ${query}`, {
            parameters: params,
            result: result ? `${Array.isArray(result) ? result.length : 1} row(s)` : 'no result'
        });
    }

    auth(step, user = null, success = null, details = null) {
        if (!DEBUG) return;
        
        this.log('AUTH', `${step}${success !== null ? (success ? ' ✅' : ' ❌') : ''}`, {
            user: user ? { 
                id: user.id, 
                email: user.email,
                twofa_method: user.twofa_method 
            } : 'no user',
            details: details
        });
    }

    http(action, data = null) {
        if (!DEBUG) return;
        
        this.log('HTTP', action, data);
    }

    session(action, sessionData = null) {
        if (!DEBUG) return;
        
        this.log('SESSION', action, {
            sessionId: sessionData?.sessionID,
            user: sessionData?.user ? 'authenticated' : 'anonymous',
            tmpUser: sessionData?.tmpUser ? 'temp user set' : 'no temp user'
        });
    }

    qr(action, alias = null, data = null) {
        if (!DEBUG) return;
        
        this.log('QR', `${action}${alias ? ` (${alias})` : ''}`, data);
    }

    startup(message, data = null) {
        console.log(chalk.magenta('🚀 STARTUP:'), message);
        if (data && DEBUG) {
            console.log(chalk.yellow('Config:'), JSON.stringify(data, null, 2));
        }
    }
}

const debugLogger = new DebugLogger();

module.exports = debugLogger;
module.exports.DEBUG = DEBUG;
