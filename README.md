# 🚀 QR-Redirector

A professional, production-ready QR Code URL redirector with comprehensive admin panel, analytics, and privacy-first tracking.

[![Node.js](https://img.shields.io/badge/Node.js-16%2B-green)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Production Ready](https://img.shields.io/badge/Status-Production%20Ready-success)](https://github.com/ghiemer/qr-redirector)

## ✨ Features

### 🔗 Core Functionality
- **QR Code Generation**: Automatic PNG & SVG generation with custom styling
- **Smart URL Redirection**: Fast, reliable redirects with fallback handling
- **Responsive Admin Panel**: Beautiful, mobile-friendly web interface
- **Flexible Database Support**: Choose between JSON file storage or MariaDB/MySQL

### 📊 Analytics & Privacy
- **Privacy-First Tracking**: GDPR-compliant analytics with SHA256 hashing
- **Smart Duplicate Detection**: Intelligent repeat visitor identification
- **Comprehensive Statistics**: Daily/weekly/monthly analytics dashboard
- **Click Heatmaps**: Detailed visitor behavior analysis

### 🔐 Enterprise Security
- **Multi-Layer Authentication**: Secure admin login with optional 2FA
- **Email-Based 2FA**: Two-factor authentication via SMTP
- **Session Security**: Secure session handling with configurable timeouts
- **Password Protection**: Industry-standard PBKDF2 hashing

### �️ Developer Experience
- **Debug Mode**: Comprehensive development logging with colored output
- **Auto-Restart**: Development server with automatic restart capabilities
- **Environment Config**: Flexible configuration via environment variables
- **Error Handling**: Detailed error tracking and reporting

## 🚀 Quick Start

### Prerequisites
- Node.js 16 or higher
- npm or yarn package manager
- MariaDB/MySQL (optional, falls back to JSON storage)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/ghiemer/qr-redirector.git
   cd qr-redirector
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Set up admin user**
   ```bash
   # Generate admin password hash
   npm run hash-admin your-secure-password
   # Copy the hash to your database or environment
   ```

5. **Start the application**
   ```bash
   # Development mode (with debug logging)
   npm run dev
   
   # Production mode
   npm start
   ```

### Docker Setup

```bash
# Build and run with Docker
docker build -t qr-redirector .
docker run -p 3000:3000 --env-file .env qr-redirector
```

## 📖 Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | Server port | `3000` | No |
| `HOST_URL` | Public URL of your application | `http://localhost:3000` | Yes |
| `SESSION_SECRET` | Session encryption key | - | Yes |
| `ADMIN_EMAIL` | Admin user email | - | Yes |
| `ADMIN_PASSWORD_HASH` | Hashed admin password | - | Yes |
| `TWO_FACTOR_ENABLED` | Enable 2FA authentication | `true` | No |
| `SMTP_HOST` | Email server host | - | If 2FA enabled |
| `SMTP_PORT` | Email server port | `587` | If 2FA enabled |
| `SMTP_USER` | Email username | - | If 2FA enabled |
| `SMTP_PASS` | Email password | - | If 2FA enabled |
| `DB_TYPE` | Database type (`mariadb` or `simple`) | `simple` | No |
| `DB_HOST` | Database host | `localhost` | If MariaDB |
| `DB_PORT` | Database port | `3306` | If MariaDB |
| `DB_NAME` | Database name | - | If MariaDB |
| `DB_USER` | Database username | - | If MariaDB |
| `DB_PASS` | Database password | - | If MariaDB |

### Database Setup

#### Option 1: JSON File Storage (Default)
No additional setup required. Data is stored in JSON files in the `data/` directory.

#### Option 2: MariaDB/MySQL
1. Create database and user:
   ```sql
   CREATE DATABASE qr_redirector;
   CREATE USER 'qr_user'@'localhost' IDENTIFIED BY 'your_secure_password';
   GRANT ALL PRIVILEGES ON qr_redirector.* TO 'qr_user'@'localhost';
   ```

2. Import schema:
   ```bash
   mysql -u qr_user -p qr_redirector < schema-mariadb.sql
   ```

## 🎯 Usage

### Creating QR Codes
1. Access the admin panel at `/admin`
2. Log in with your credentials
3. Click "New Route" to create a QR code
4. Enter your target URL and optional custom alias
5. Download generated QR codes (PNG/SVG formats)

### Admin Panel Features
- **Dashboard**: Overview of all routes and analytics
- **Route Management**: Create, edit, and delete redirects
- **Analytics**: Detailed click statistics and visitor data
- **Settings**: Configure application preferences
- **Logs**: Monitor application activity

### API Endpoints
- `GET /:alias` - Redirect to target URL
- `GET /admin` - Admin dashboard (requires authentication)
- `POST /admin/login` - Admin authentication
- `GET /debug/login` - Debug endpoint (development only)

## 🛠️ Technology Stack

- **Runtime**: Node.js 16+
- **Framework**: Express.js
- **Database**: JSON files or MariaDB/MySQL
- **Templates**: EJS templating engine
- **Styling**: Modern CSS with responsive design
- **Authentication**: Session-based with optional 2FA
- **Security**: PBKDF2 password hashing, SHA256 tracking anonymization
- **QR Generation**: Built-in QR code generation with PNG/SVG output

## � Development

### Project Structure
```
qr-redirector/
├── app.js                 # Main application file
├── package.json          # Dependencies and scripts
├── schema-mariadb.sql    # Database schema
├── controllers/          # Route controllers
├── lib/                  # Core libraries
├── services/             # Business logic
├── views/                # EJS templates
├── public/               # Static assets
└── data/                 # JSON storage (if using file DB)
```

### Available Scripts
- `npm start` - Start production server
- `npm run dev` - Start development server with debug logging
- `npm run hash-admin <password>` - Generate admin password hash
- `npm test` - Run test suite (if available)

### Debug Mode
Enable detailed logging by setting `DEBUG=true` in your environment:
```bash
DEBUG=true npm run dev
```

This provides colored console output with detailed information about:
- HTTP requests and responses
- Database operations
- Authentication attempts
- Session management
- Error details

## 🚀 Deployment

### Production Checklist
- [ ] Set `NODE_ENV=production`
- [ ] Configure secure `SESSION_SECRET`
- [ ] Set up proper database (MariaDB recommended for production)
- [ ] Configure HTTPS in reverse proxy
- [ ] Set strong admin password
- [ ] Configure SMTP for 2FA (recommended)
- [ ] Set appropriate file permissions
- [ ] Configure log rotation

### Hosting Platforms
- **Shared Hosting**: Compatible with Plesk and cPanel
- **VPS/Dedicated**: Full control over Node.js environment
- **Cloud Platforms**: Deploy to Heroku, DigitalOcean, AWS, etc.
- **Docker**: Containerized deployment ready

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Development Guidelines
- Follow existing code style
- Add tests for new features
- Update documentation as needed
- Ensure all tests pass before submitting

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- QR code generation powered by community libraries
- Icons and styling inspired by modern design principles
- Security best practices following OWASP guidelines

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/ghiemer/qr-redirector/issues)
- **Documentation**: Check the `docs/` directory for detailed guides
- **Community**: Join discussions in GitHub Discussions

---

**Made with ❤️ for the open source community**
