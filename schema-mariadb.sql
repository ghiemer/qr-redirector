-- QR-Redirector MariaDB Schema
-- Datenbank: db_qr-redirector
-- Server: localhost:3306 (MariaDB v10.11.13)
-- Version: 2.1 (erweitert um Click-Counter und Logging)

-- Datenbank erstellen (falls noch nicht vorhanden)
CREATE DATABASE IF NOT EXISTS `db_qr-redirector` 
  DEFAULT CHARACTER SET utf8mb4 
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE `db_qr-redirector`;

-- Users Tabelle für Admin-Authentifizierung
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY COMMENT 'User ID',
  `email` VARCHAR(255) NOT NULL UNIQUE COMMENT 'Email Adresse (Login)',
  `password` VARCHAR(255) NOT NULL COMMENT 'SHA256 gehashtes Passwort',
  `salt` VARCHAR(255) NOT NULL COMMENT 'Passwort Salt',
  `twofa_method` ENUM('email','app') DEFAULT 'email' COMMENT '2FA Methode',
  `twofa_secret` VARCHAR(255) DEFAULT NULL COMMENT '2FA Secret Key',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Erstellungsdatum',
  
  INDEX `idx_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Admin Users';

-- Routes Tabelle - Speichert alle Kurz-URLs
CREATE TABLE IF NOT EXISTS `routes` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY COMMENT 'UUID des Route-Eintrags',
  `alias` VARCHAR(255) NOT NULL UNIQUE COMMENT 'Kurz-URL Alias (eindeutig)',
  `target` TEXT NOT NULL COMMENT 'Ziel-URL wohin weitergeleitet wird',
  `utm_source` VARCHAR(255) DEFAULT NULL COMMENT 'UTM Source Parameter',
  `utm_medium` VARCHAR(255) DEFAULT NULL COMMENT 'UTM Medium Parameter', 
  `utm_campaign` VARCHAR(255) DEFAULT NULL COMMENT 'UTM Campaign Parameter',
  `active` BOOLEAN DEFAULT TRUE COMMENT 'Ist die Route aktiv?',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Erstellungsdatum',
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Letztes Update',
  
  INDEX `idx_alias` (`alias`),
  INDEX `idx_active` (`active`),
  INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='QR-Redirector Routes';

-- Click Counter Tabelle (Pseudonymisiert)
CREATE TABLE IF NOT EXISTS `clicks` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY COMMENT 'UUID des Click-Eintrags',
  `alias` VARCHAR(255) NOT NULL COMMENT 'Route Alias',
  `fingerprint` VARCHAR(16) NOT NULL COMMENT 'Pseudonymisierter User-Fingerprint',
  `ip_hash` VARCHAR(12) NOT NULL COMMENT 'Pseudonymisierte IP (12 Zeichen)',
  `timestamp` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Zeitpunkt des Klicks',
  `user_agent_hash` VARCHAR(8) NOT NULL COMMENT 'Pseudonymisierter User-Agent (8 Zeichen)',
  `referer` VARCHAR(8) DEFAULT NULL COMMENT 'Pseudonymisierter Referer (8 Zeichen)',
  
  INDEX `idx_alias` (`alias`),
  INDEX `idx_fingerprint` (`fingerprint`),
  INDEX `idx_timestamp` (`timestamp`),
  INDEX `idx_alias_fingerprint` (`alias`, `fingerprint`),
  INDEX `idx_fingerprint_timestamp` (`fingerprint`, `timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Pseudonymisierte Click Counter';

-- Legacy Tracking Tabelle (für Kompatibilität)
CREATE TABLE IF NOT EXISTS `scans` (
  `id` INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Legacy Scan ID',
  `ts` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Zeitstempel',
  `alias` VARCHAR(255) NOT NULL COMMENT 'Route Alias',
  `ip_hash` VARCHAR(64) NOT NULL COMMENT 'IP Hash',
  `ua` TEXT DEFAULT NULL COMMENT 'User Agent',
  
  INDEX `idx_alias` (`alias`),
  INDEX `idx_ts` (`ts`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Legacy Tracking (Kompatibilität)';

-- Benutzer für die Anwendung erstellen
-- WICHTIG: Diesen Befehl nur einmal ausführen!
-- CREATE USER IF NOT EXISTS 'qr_redirector'@'localhost' IDENTIFIED BY 'your-secure-password-here';
-- GRANT SELECT, INSERT, UPDATE, DELETE ON `db_qr-redirector`.* TO 'qr_redirector'@'localhost';
-- FLUSH PRIVILEGES;

-- Beispiel-Daten (optional)
-- INSERT INTO routes (id, alias, target, utm_source, utm_medium, utm_campaign, active) VALUES
-- ('550e8400-e29b-41d4-a716-446655440000', 'example', 'https://example.com', 'newsletter', 'email', 'campaign2024', TRUE);
