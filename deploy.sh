#!/usr/bin/env bash
# =============================================================================
# Manhattan - Deploy Script
# Target: Ubuntu 22.04 LTS
# Usage: sudo ./deploy.sh [domain]
# Example: sudo ./deploy.sh ricoo.dev
# =============================================================================

set -e

DOMAIN="${1:-ricoo.dev}"
APP_DIR="/opt/manhattan"
DB_NAME="manhattan"
DB_USER="manhattan"
DB_PASS="manhattan"
SERVER_PORT=8080

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

info() { echo -e "${CYAN}[INFO]${NC} $1"; }
ok() { echo -e "${GREEN}[OK]${NC} $1"; }
err() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# --- Root check ---
[ "$EUID" -ne 0 ] && err "Run as root: sudo ./deploy.sh $DOMAIN"

echo ""
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}  Manhattan Deploy → ${DOMAIN}${NC}"
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo ""

# =============================================================================
# 1. System packages
# =============================================================================
info "Updating system packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl wget unzip nginx mysql-server certbot python3-certbot-nginx
ok "System packages"

# =============================================================================
# 2. Java 21 (Eclipse Temurin)
# =============================================================================
if java -version 2>&1 | grep -q "21\|23\|25"; then
    ok "Java already installed"
else
    info "Installing Java 21..."
    mkdir -p /etc/apt/keyrings
    wget -qO /etc/apt/keyrings/adoptium.asc https://packages.adoptium.net/artifactory/api/gpg/key/public
    echo "deb [signed-by=/etc/apt/keyrings/adoptium.asc] https://packages.adoptium.net/artifactory/deb $(lsb_release -cs) main" > /etc/apt/sources.list.d/adoptium.list
    apt-get update -qq
    apt-get install -y -qq temurin-21-jdk
    ok "Java 21 installed"
fi

# =============================================================================
# 3. Node.js 20 LTS
# =============================================================================
if node --version 2>/dev/null | grep -q "v20\|v22"; then
    ok "Node.js already installed"
else
    info "Installing Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
    apt-get install -y -qq nodejs
    ok "Node.js 20 installed"
fi

# =============================================================================
# 4. MySQL setup
# =============================================================================
info "Configuring MySQL..."
systemctl start mysql 2>/dev/null || true
systemctl enable mysql 2>/dev/null || true
mysql -e "CREATE DATABASE IF NOT EXISTS ${DB_NAME} CHARACTER SET utf8mb4;" 2>/dev/null || true
mysql -e "CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';" 2>/dev/null || true
mysql -e "ALTER USER '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';" 2>/dev/null || true
mysql -e "GRANT ALL ON ${DB_NAME}.* TO '${DB_USER}'@'localhost'; FLUSH PRIVILEGES;" 2>/dev/null || true
ok "MySQL database '${DB_NAME}' ready"

# =============================================================================
# 5. Deploy application files
# =============================================================================
info "Deploying to ${APP_DIR}..."
pkill java 2>/dev/null || true
sleep 2

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
rm -rf "${APP_DIR}"
mkdir -p "${APP_DIR}"
rsync -a --exclude='node_modules' --exclude='.git' --exclude='server/build' --exclude='server/.gradle' --exclude='client/dist' "${SCRIPT_DIR}/" "${APP_DIR}/"
chown -R ubuntu:ubuntu "${APP_DIR}"
ok "Files deployed"

# =============================================================================
# 6. Fix Java version compatibility (use 21 if 23 not available)
# =============================================================================
JAVA_MAJOR=$(java -version 2>&1 | head -1 | grep -oP '\d+' | head -1)
if [ "$JAVA_MAJOR" -lt 23 ]; then
    info "Adjusting build for Java ${JAVA_MAJOR}..."
    sed -i "s/JavaVersion.VERSION_23/JavaVersion.VERSION_${JAVA_MAJOR}/g" "${APP_DIR}/server/build.gradle.kts"
    sed -i "s/options.release.set(23)/options.release.set(${JAVA_MAJOR})/g" "${APP_DIR}/server/build.gradle.kts"
fi

# =============================================================================
# 7. Apply database schema
# =============================================================================
info "Applying database schema..."
mysql -u "${DB_USER}" -p"${DB_PASS}" "${DB_NAME}" < "${APP_DIR}/server/src/main/resources/schema.sql"
ok "Schema applied"

# =============================================================================
# 8. Build server
# =============================================================================
info "Building server (Gradle)..."
cd "${APP_DIR}/server"
chmod +x gradlew
sudo -u ubuntu ./gradlew bootJar --no-daemon -x test > /tmp/manhattan-build.log 2>&1 || { cat /tmp/manhattan-build.log; err "Server build failed"; }
ok "Server JAR built"

# =============================================================================
# 9. Build client
# =============================================================================
info "Building client..."
cd "${APP_DIR}/client"
sudo -u ubuntu npm install --silent 2>/dev/null
# Fix WebSocket URL for production (auto-detect protocol)
sed -i "s|window.location.hostname|window.location.host|g" src/main.js 2>/dev/null || true
sudo -u ubuntu npx esbuild src/main.js --bundle --outfile=dist/bundle.js --format=esm --platform=browser --minify --drop:console
sudo -u ubuntu npx tailwindcss -i src/input.css -o dist/output.css --minify
ok "Client built"

# =============================================================================
# 10. Nginx config
# =============================================================================
info "Configuring Nginx..."
cat > /etc/nginx/sites-available/manhattan.conf << NGINX
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name ${DOMAIN};

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name ${DOMAIN};

    ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;

    root ${APP_DIR}/client;
    index index.html;

    gzip on;
    gzip_types text/plain text/css application/javascript application/json;

    location /ws {
        proxy_pass http://127.0.0.1:${SERVER_PORT}/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
NGINX

rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/manhattan.conf /etc/nginx/sites-enabled/manhattan.conf

# Get SSL cert if not exists
if [ ! -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
    info "Getting SSL certificate from Let's Encrypt..."
    # Temporarily serve plain HTTP for ACME challenge
    cat > /etc/nginx/sites-available/manhattan.conf << TMPNGINX
server {
    listen 80 default_server;
    server_name ${DOMAIN};
    root /var/www/html;
    location / { return 200 'ok'; }
}
TMPNGINX
    nginx -t && systemctl restart nginx
    certbot certonly --webroot -w /var/www/html -d "${DOMAIN}" --non-interactive --agree-tos --email "admin@${DOMAIN}"
    # Re-write full config
    cat > /etc/nginx/sites-available/manhattan.conf << NGINX2
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name ${DOMAIN};
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://\$host\$request_uri; }
}
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name ${DOMAIN};
    ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    root ${APP_DIR}/client;
    index index.html;
    gzip on;
    gzip_types text/plain text/css application/javascript application/json;
    location /ws {
        proxy_pass http://127.0.0.1:${SERVER_PORT}/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
    location / { try_files \$uri \$uri/ /index.html; }
}
NGINX2
fi

nginx -t && systemctl restart nginx
ok "Nginx configured with HTTPS"

# =============================================================================
# 11. Systemd service
# =============================================================================
info "Creating systemd service..."
SERVER_JAR=$(find "${APP_DIR}/server/build/libs" -name "*.jar" -not -name "*-plain.jar" | head -1)

cat > /etc/systemd/system/manhattan.service << EOF
[Unit]
Description=Manhattan E2EE Chat
After=network.target mysql.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=${APP_DIR}/server
ExecStart=/usr/bin/java -jar ${SERVER_JAR}
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable manhattan
systemctl restart manhattan
ok "Service started"

# =============================================================================
# 12. Verify
# =============================================================================
info "Waiting for server to start..."
sleep 8
if ss -tlnp | grep -q ":${SERVER_PORT}"; then
    ok "Spring Boot running on port ${SERVER_PORT}"
else
    err "Server failed to start. Check: journalctl -u manhattan -f"
fi

echo ""
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✓ Manhattan deployed successfully!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo ""
echo -e "  URL:     ${CYAN}https://${DOMAIN}${NC}"
echo -e "  Logs:    journalctl -u manhattan -f"
echo -e "  Restart: sudo systemctl restart manhattan"
echo -e "  Status:  sudo systemctl status manhattan"
echo ""
