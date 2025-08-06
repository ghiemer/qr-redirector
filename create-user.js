#!/usr/bin/env node

require('dotenv').config();
const { initializeDatabase } = require('./lib/db.js');
const { hashPassword } = require('./lib/auth.js');
const readline = require('readline');

function question(prompt) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function securePassword(prompt) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    // Überschreibe die _writeToOutput Methode um Eingabe zu maskieren
    rl._writeToOutput = function _writeToOutput(stringToWrite) {
      if (rl.stdoutMuted) {
        rl.output.write('*');
      } else {
        rl.output.write(stringToWrite);
      }
    };
    
    rl.question(prompt, (password) => {
      rl.close();
      console.log(''); // Neue Zeile nach der Passwort-Eingabe
      resolve(password);
    });
    
    rl.stdoutMuted = true; // Aktiviere die Maskierung
  });
}

async function createUser() {
  console.log('🔧 QR-Redirector Benutzer erstellen\n');
  
  try {
    // Datenbank initialisieren
    const db = await initializeDatabase();
    console.log('✅ Datenbank verbunden\n');
    
    // Benutzerdaten erfragen mit Validierung
    let email, password, name;
    
    // E-Mail mit Validierung
    do {
      email = await question('📧 E-Mail Adresse: ');
      if (!email || email.trim().length === 0) {
        console.error('❌ E-Mail-Adresse ist erforderlich!');
        continue;
      }
      
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        console.error('❌ Bitte geben Sie eine gültige E-Mail-Adresse ein!');
        email = null; // Reset für nächste Iteration
        continue;
      }
      break;
    } while (true);
    
    // Passwort mit Validierung
    do {
      password = await securePassword('🔒 Passwort (min. 6 Zeichen): ');
      if (!password || password.trim().length === 0) {
        console.error('❌ Passwort ist erforderlich!');
        continue;
      }
      
      if (password.length < 6) {
        console.error('❌ Das Passwort muss mindestens 6 Zeichen lang sein!');
        continue;
      }
      break;
    } while (true);
    
    // Name (optional)
    name = await question('👤 Name (optional): ') || 'Admin User';
    
    // Prüfen ob Benutzer bereits existiert
    const existingUser = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (existingUser) {
      console.error(`❌ Benutzer mit E-Mail ${email} existiert bereits!`);
      process.exit(1);
    }
    
    // Passwort hashen
    const hashedPassword = await hashPassword(password);
    
    // Salt generieren (wie in der bestehenden Implementierung)
    const crypto = require('crypto');
    const salt = crypto.randomBytes(32).toString('hex');
    
    // Benutzer erstellen
    const result = await db.run(
      'INSERT INTO users (email, password, salt, twofa_method, created_at) VALUES (?, ?, ?, ?, NOW())',
      [email, hashedPassword, salt, 'email']
    );
    
    console.log('\n✅ Benutzer erfolgreich erstellt!');
    console.log(`📧 E-Mail: ${email}`);
    console.log(`🆔 User ID: ${result.lastID || result.insertId || 'N/A'}`);
    console.log(`🔐 2FA Methode: email`);
    
    // Statistiken anzeigen
    const userCount = await db.get('SELECT COUNT(*) as count FROM users');
    console.log(`\n📊 Gesamt Benutzer: ${userCount.count}`);
    
    if (db.close) {
      await db.close();
    }
    
  } catch (error) {
    console.error('❌ Fehler beim Erstellen des Benutzers:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Script starten
if (require.main === module) {
  createUser();
}

module.exports = { createUser };
