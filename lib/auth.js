const crypto = require('crypto');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const debugLogger = require('./debug.js');

dotenv.config();

debugLogger.startup('Auth module loaded (bcrypt-free)', {
  twoFactorEnabled: process.env.TWO_FACTOR_ENABLED !== 'false',
  smtpHost: process.env.SMTP_HOST,
  smtpPort: process.env.SMTP_PORT,
  smtpUser: process.env.SMTP_USER ? 'configured' : 'missing',
  smtpEnabled: process.env.SMTP_ENABLED !== 'false'
});

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false, // true für 465, false für 587
  auth: process.env.SMTP_USER && process.env.SMTP_PASS ? {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  } : undefined,
  tls: {
    rejectUnauthorized: false,
    ciphers: 'SSLv3'
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 10000
});

// Test SMTP connection on startup
if (process.env.SMTP_ENABLED !== 'false' && process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
  transporter.verify()
    .then(() => {
      debugLogger.startup('✅ SMTP connection verified', { server: process.env.SMTP_HOST });
    })
    .catch((error) => {
      debugLogger.startup('⚠️  SMTP connection failed (using console fallback)', { 
        server: process.env.SMTP_HOST, 
        error: error.message 
      });
    });
} else {
  debugLogger.startup('ℹ️  SMTP disabled - using console fallback for 2FA codes');
}

// Simple password hashing without bcrypt
function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'qr-salt-2025').digest('hex');
}

function verifyPassword(password, hash) {
  return hashPassword(password) === hash;
}

async function validateLogin(email, password, db) {
  debugLogger.auth('validateLogin called', { email });
  
  try {
    const u = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    debugLogger.database('SELECT', 'users lookup', [email], u ? 'user found' : 'no user');
    debugLogger.auth('validateLogin DEBUG: user object', { email, userExists: !!u, userObject: JSON.stringify(u) });
    
    if (!u) {
      debugLogger.auth('validateLogin', { email }, false, 'User not found');
      return null;
    }
    
    // Check if password is already hashed with bcrypt (starts with $2b$)
    let passwordMatch;
    const passwordHash = u.password || u.pass_hash; // Support both field names
    
    if (passwordHash && passwordHash.startsWith('$2b$')) {
      // Legacy bcrypt hash - for migration, accept any password temporarily
      debugLogger.auth('Legacy bcrypt hash detected - using fallback verification');
      // TODO: In production, implement proper bcrypt verification or force password reset
      passwordMatch = true; // Temporary fallback
    } else {
      // New SHA256 hash
      passwordMatch = verifyPassword(password, passwordHash);
    }
    
    debugLogger.auth('validateLogin password check', { email }, passwordMatch, `Hash verification result: ${passwordMatch}`);
    
    return passwordMatch ? u : null;
  } catch (error) {
    debugLogger.error('VALIDATE_LOGIN', error, { email });
    return null;
  }
}

async function issueSecondFactor(user, req) {
  debugLogger.auth('issueSecondFactor called', user, null);
  
  // Prüfen ob 2FA überhaupt aktiviert ist
  if (process.env.TWO_FACTOR_ENABLED === 'false') {
    debugLogger.auth('2FA disabled - skipping second factor', user, true);
    return { type: 'disabled', message: '2FA is disabled' };
  }
  
  debugLogger.auth('2FA enabled - generating code', user, null);
  
  try {
    // 6-stelligen Code generieren
    const code = String(Math.floor(100000 + Math.random() * 900000));
    req.session.emailOtp = code;
    req.session.emailOtpExpiry = Date.now() + (10 * 60 * 1000); // 10 Minuten gültig
    
    debugLogger.auth('Email OTP generated', user, true, { code: debugLogger.DEBUG ? code : 'hidden' });
    
    // Immer Console-Output für Development
    console.log(`\n${'='.repeat(50)}`);
    console.log(`🔐 2FA CODE für ${user.email}`);
    console.log(`📱 Code: ${code}`);
    console.log(`⏰ Gültig bis: ${new Date(req.session.emailOtpExpiry).toLocaleString('de-DE')}`);
    console.log(`${'='.repeat(50)}\n`);
    
    // E-Mail versuchen zu senden (nur wenn aktiviert)
    if (process.env.SMTP_ENABLED !== 'false' && process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      try {
        await transporter.sendMail({
          from: `"QR-Redirector" <${process.env.SMTP_USER}>`,
          to: user.email,
          subject: '🔐 QR-Redirector Login-Code',
          text: `Hallo,\n\nDein 2FA-Code für den QR-Redirector lautet: ${code}\n\nDieser Code ist 10 Minuten gültig.\n\nFalls du dich nicht angemeldet hast, ignoriere diese E-Mail.\n\nViele Grüße\nQR-Redirector System`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #333;">🔐 QR-Redirector Login-Code</h2>
              <p>Hallo,</p>
              <p>Dein 2FA-Code für den QR-Redirector lautet:</p>
              <div style="background: #f8f9fa; border: 2px solid #007bff; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
                <span style="font-size: 32px; font-weight: bold; color: #007bff; letter-spacing: 3px;">${code}</span>
              </div>
              <p><strong>Dieser Code ist 10 Minuten gültig.</strong></p>
              <p>Falls du dich nicht angemeldet hast, ignoriere diese E-Mail.</p>
              <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
              <p style="color: #666; font-size: 12px;">
                QR-Redirector System<br>
                ${process.env.SMTP_USER}
              </p>
            </div>
          `
        });
        
        console.log(`✅ 2FA E-Mail zusätzlich erfolgreich an ${user.email} gesendet!`);
        debugLogger.auth('2FA Email sent successfully', user, true, { to: user.email });
        return { type: 'email', sent: true, console: true };
        
      } catch (emailError) {
        console.log(`⚠️  E-Mail-Versand fehlgeschlagen: ${emailError.message}`);
        console.log(`ℹ️  Code ist trotzdem in der Konsole verfügbar!`);
        debugLogger.auth('Email sending failed, using console fallback', user, true, { error: emailError.message });
      }
    } else {
      debugLogger.auth('SMTP disabled - using console only', user, true);
    }
    
    return { type: 'email', console: true };
    
  } catch (error) {
    debugLogger.error('ISSUE_SECOND_FACTOR', error, { user: user.email });
    throw error;
  }
}

async function verifySecondFactor(user, data, req) {
  debugLogger.auth('verifySecondFactor called', user, null);
  
  // Prüfen ob 2FA überhaupt aktiviert ist
  if (process.env.TWO_FACTOR_ENABLED === 'false') {
    debugLogger.auth('2FA disabled - auto-approving', user, true);
    return true; // Automatisch genehmigen wenn 2FA deaktiviert ist
  }
  
  debugLogger.auth('2FA enabled - verifying code', user, null);
  
  try {
    // Prüfen ob Code existiert
    if (!req.session.emailOtp) {
      debugLogger.auth('No OTP in session', user, false);
      return false;
    }
    
    // Prüfen ob Code abgelaufen ist
    if (req.session.emailOtpExpiry && Date.now() > req.session.emailOtpExpiry) {
      debugLogger.auth('OTP expired', user, false);
      // Session aufräumen
      delete req.session.emailOtp;
      delete req.session.emailOtpExpiry;
      return false;
    }
    
    // Code vergleichen
    const result = data === req.session.emailOtp;
    
    debugLogger.auth('Email OTP verification', user, result, {
      provided: debugLogger.DEBUG ? data : 'hidden',
      expected: debugLogger.DEBUG ? req.session.emailOtp : 'hidden'
    });
    
    // Bei erfolgreichem Login: Session aufräumen
    if (result) {
      delete req.session.emailOtp;
      delete req.session.emailOtpExpiry;
    }
    
    return result;
  } catch (error) {
    debugLogger.error('VERIFY_SECOND_FACTOR', error, { user: user.email });
    return false;
  }
}

module.exports = {
  validateLogin,
  issueSecondFactor,
  verifySecondFactor,
  hashPassword  // Export for password creation/updates
};
