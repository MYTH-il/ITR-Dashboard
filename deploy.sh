#!/bin/bash
# ITR Dashboard — Complete self-hosted deployment script.
# Run this on a fresh EC2 Ubuntu instance. Handles everything from system
# setup to running the app, start to finish.

set -e

REPO_URL="https://github.com/MYTH-il/ITR-Dashboard.git"
APP_DIR="$HOME/ITR-Dashboard"

echo "=========================================="
echo "ITR Dashboard — Complete Deployment"
echo "=========================================="
echo
echo "This script will:"
echo "  1. Install system dependencies"
echo "  2. Clone the repo"
echo "  3. Generate .env files and get your configuration"
echo "  4. Build backend + frontend"
echo "  5. Set up systemd service + Nginx + HTTPS"
echo
echo "Prerequisites:"
echo "  - Allocated + associated an Elastic IP with this EC2 instance"
echo "  - Registered a free DuckDNS subdomain pointed at that IP"
echo "  - Created a MongoDB Atlas M0 cluster + database user"
echo "  - Configured this instance's security group (22/80/443)"
echo
read -p "Ready to proceed? (yes/no): " PROCEED
if [ "$PROCEED" != "yes" ]; then
    echo "Aborted."
    exit 0
fi

# ============================================================================
# STEP 1: System Setup
# ============================================================================
echo
echo ">>> STEP 1: Installing system dependencies"
sudo apt-get update
sudo apt-get upgrade -y
sudo apt-get install -y \
    curl wget zip unzip \
    git build-essential \
    python3 python3-venv python3-pip \
    nodejs dnsutils \
    nginx certbot python3-certbot-nginx

sudo npm install -g yarn
echo "✓ System packages installed"

# ============================================================================
# STEP 2: Clone repo
# ============================================================================
echo
echo ">>> STEP 2: Cloning repository"
if [ -d "$APP_DIR" ]; then
    read -p "$APP_DIR already exists. Proceed anyway? (yes/no): " CONTINUE
    if [ "$CONTINUE" != "yes" ]; then
        echo "Aborted."
        exit 1
    fi
else
    git clone "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"
echo "✓ Repository cloned"

# ============================================================================
# STEP 3: DuckDNS + DNS verification
# ============================================================================
echo
echo ">>> STEP 3: DNS verification"
read -p "Enter your DuckDNS subdomain (e.g. itr-dashboard.duckdns.org): " DOMAIN
if [ -z "$DOMAIN" ]; then
    echo "No domain entered. Aborting."
    exit 1
fi

RESOLVED_IP=$(dig +short "$DOMAIN" | tail -n1)
MY_IP=$(curl -s https://checkip.amazonaws.com)
echo "  $DOMAIN resolves to: $RESOLVED_IP"
echo "  This instance's public IP: $MY_IP"
if [ "$RESOLVED_IP" != "$MY_IP" ]; then
    echo "  WARNING: These don't match!"
    read -p "  Fix DNS at duckdns.org and press Enter to continue..."
fi

# ============================================================================
# STEP 4: Generate .env files + get user input
# ============================================================================
echo
echo ">>> STEP 4: Environment configuration"

BACKEND_ENV="$APP_DIR/backend/.env"
FRONTEND_ENV="$APP_DIR/frontend/.env"

JWT_SECRET=$(openssl rand -hex 32)

# Prompt for admin email
read -p "  Admin email (default: admin@itrdashboard.local): " ADMIN_EMAIL
if [ -z "$ADMIN_EMAIL" ]; then
    ADMIN_EMAIL="admin@itrdashboard.local"
fi

# Prompt for admin password
read -sp "  Admin password (will not be echoed): " ADMIN_PASSWORD
echo
if [ -z "$ADMIN_PASSWORD" ]; then
    echo "  ERROR: Admin password cannot be empty."
    exit 1
fi

# Prompt for MongoDB URL
read -p "  MongoDB Atlas connection string (MONGO_URL): " MONGO_URL
if [ -z "$MONGO_URL" ]; then
    echo "  ERROR: MONGO_URL cannot be empty."
    exit 1
fi

cat > "$BACKEND_ENV" << BACKENDEOF
# MongoDB Atlas connection
MONGO_URL=$MONGO_URL
DB_NAME=itr_dashboard

# Auth
JWT_SECRET=$JWT_SECRET

# Admin user (change password immediately after first login)
ADMIN_EMAIL=$ADMIN_EMAIL
ADMIN_PASSWORD=$ADMIN_PASSWORD

# CORS (frontend origin)
CORS_ORIGINS=https://$DOMAIN

# Email escalations (Resend API) -- optional
RESEND_API_KEY=
ESCALATION_CHECK_INTERVAL_MINUTES=30
BACKENDEOF

cat > "$FRONTEND_ENV" << FRONTENDEOF
REACT_APP_BACKEND_URL=https://$DOMAIN
FRONTENDEOF

echo
echo "  ✓ Generated backend/.env and frontend/.env"
echo "  ✓ JWT_SECRET generated automatically"
echo "  ✓ CORS_ORIGINS set to: https://$DOMAIN"
echo "  ✓ Admin email set to: $ADMIN_EMAIL"
echo "  ✓ MongoDB URL configured"
echo "✓ Environment files configured"

# ============================================================================
# STEP 5: Backend setup
# ============================================================================
echo
echo ">>> STEP 5: Backend setup (Python venv + dependencies)"
cd "$APP_DIR/backend"
rm -rf venv
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip -q
pip install -r requirements.txt -q
deactivate
echo "✓ Backend venv created and dependencies installed"

# ============================================================================
# STEP 6: Frontend build
# ============================================================================
echo
echo ">>> STEP 6: Frontend build (Node + yarn)"
cd "$APP_DIR/frontend"
rm -rf node_modules package-lock.json build
yarn install -q
CI=false yarn build -q
echo "✓ Frontend built successfully"

# ============================================================================
# STEP 7: Systemd service
# ============================================================================
echo
echo ">>> STEP 7: Setting up backend systemd service"

cat | sudo tee /etc/systemd/system/itr-backend.service > /dev/null << SYSTEMDEOF
[Unit]
Description=ITR Dashboard FastAPI backend
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=$APP_DIR/backend
Environment="PATH=$APP_DIR/backend/venv/bin"
ExecStart=$APP_DIR/backend/venv/bin/uvicorn server:app --host 0.0.0.0 --port 8001
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SYSTEMDEOF

sudo systemctl daemon-reload
sudo systemctl enable itr-backend
sudo systemctl start itr-backend
sleep 2

if sudo systemctl is-active --quiet itr-backend; then
    echo "✓ Backend service running"
else
    echo "✗ Backend service failed to start. Check logs:"
    echo "    sudo journalctl -u itr-backend -n 30 --no-pager"
    read -p "  Continue anyway? (yes/no): " CONTINUE_BACKEND
    if [ "$CONTINUE_BACKEND" != "yes" ]; then
        exit 1
    fi
fi

# ============================================================================
# STEP 8: Nginx configuration
# ============================================================================
echo
echo ">>> STEP 8: Nginx configuration"

cat | sudo tee /etc/nginx/sites-available/itr-dashboard > /dev/null << NGINXEOF
server {
    listen 80;
    server_name $DOMAIN;

    root $APP_DIR/frontend/build;
    index index.html;

    location / {
        try_files \$uri /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8001/api/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINXEOF

sudo ln -sf /etc/nginx/sites-available/itr-dashboard /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
echo "✓ Nginx configured"

# ============================================================================
# STEP 9: HTTPS with Let's Encrypt
# ============================================================================
echo
echo ">>> STEP 9: Setting up HTTPS (Let's Encrypt + Certbot)"
echo "  Running certbot to request SSL certificate for $DOMAIN"
sudo certbot --nginx -d "$DOMAIN"

echo "✓ HTTPS certificate installed and configured"

# ============================================================================
# FINAL: Verification
# ============================================================================
echo
echo "=========================================="
echo "✓ DEPLOYMENT COMPLETE"
echo "=========================================="
echo
echo "Your app is now running at:"
echo "  https://$DOMAIN"
echo
echo "Initial login credentials:"
echo "  Email: $(grep ADMIN_EMAIL $BACKEND_ENV | cut -d= -f2)"
echo "  Password: (what you set in backend/.env)"
echo
echo "Useful commands:"
echo "  Backend status: sudo systemctl status itr-backend"
echo "  Backend logs: sudo journalctl -u itr-backend -n 50 --no-pager"
echo "  Restart backend: sudo systemctl restart itr-backend"
echo "  Restart nginx: sudo systemctl restart nginx"
echo
echo "First steps:"
echo "  1. Log in at https://$DOMAIN"
echo "  2. Change admin password immediately"
echo "  3. Configure escalation recipients at /masters/stages"
echo
