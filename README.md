# 🚀 QR-Redirector v2.1.0

Professional QR Code URL Redirector with comprehensive admin panel, click tracking, and analytics.

## ✨ Features

### 🔗 Core Functionality
- **QR Code Generation**: Automatic PNG & SVG generation
- **URL Redirection**: Fast and reliable redirects
- **Admin Panel**: Beautiful, responsive web interface
- **Dual Database Support**: JSON (SimpleDB) or MariaDB/MySQL

### 📊 Analytics & Tracking
- **Click Counter**: Pseudonymized visitor tracking
- **Duplicate Detection**: Intelligent repeat visitor identification
- **Daily Statistics**: Comprehensive analytics dashboard
- **Privacy-First**: SHA256 hashing for all personal data

### 🔐 Security & Authentication
- **Admin Authentication**: Secure login system
- **Email 2FA**: Two-factor authentication via email
- **Session Management**: Secure session handling
- **Password Hashing**: Industry-standard security

### 📝 Logging & Monitoring
- **Comprehensive Logging**: Detailed redirect logs
- **Daily Log Files**: Automatic log rotation
- **Debug Mode**: Detailed development logging
- **Error Tracking**: Comprehensive error handling

## 🚀 Quick Start

### Local Development
```bash
npm install
cp .env.example .env
# Configure your .env file
npm run dev
```

### Production Deployment (Plesk)
```bash
# Generate admin hash
npm run hash-admin your-password

# Upload and deploy
unzip qr-redirector-plesk-deployment.zip
npm ci --only=production
npm run deploy

# Start application
npm start
```

## 📋 Documentation

- **[Quick Setup Guide](SCHNELL_SETUP.md)** - Fast deployment instructions
- **[Plesk Deployment](PLESK_DEPLOYMENT.md)** - Detailed hosting guide
- **[Admin Update Guide](ADMIN_UPDATE_README.md)** - Admin management
- **[Complete Analysis](VOLLSTAENDIGE_ANWENDUNGS_ANALYSE.md)** - Technical documentation

## 🛠️ Technology Stack

- **Backend**: Node.js, Express.js
- **Database**: SimpleDB (JSON) or MariaDB/MySQL
- **Frontend**: EJS Templates, Modern CSS
- **Authentication**: Session-based with 2FA
- **Security**: PBKDF2 hashing, pseudonymized tracking

## 📊 Project Status

- ✅ **Production Ready**: Fully tested and deployed
- ✅ **Plesk Compatible**: Optimized for shared hosting
- ✅ **Privacy Compliant**: GDPR-friendly tracking
- ✅ **Mobile Responsive**: Works on all devices
- ✅ **Performance Optimized**: Fast and lightweight

## 📄 License

MIT License - see LICENSE file for details.

---

**QR-Redirector v2.1.0** - Professional URL redirection with analytics
