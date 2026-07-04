#!/bin/bash
# ITR Dashboard — Complete self-hosted deployment script.
# Run this on a fresh EC2 Ubuntu instance. Handles everything from system
# setup to running the app, start to finish.

set -e

REPO_URL="https://github.com/MYTH-il/ITR-Dashboard.git"
APP_DIR="$HOME/ITR-Dashboard"
SWAP_FILE="/swapfile"
SWAP_SIZE="3G"
NODE_BUILD_MEMORY_MB="768"

ensure_swap() {
    if swapon --show=NAME | grep -qx "$SWAP_FILE"; then
        echo "  Swap already active at $SWAP_FILE"
        return
    fi

    if [ -f "$SWAP_FILE" ]; then
        echo "  Enabling existing swap file at $SWAP_FILE"
        sudo chmod 600 "$SWAP_FILE"
        sudo mkswap -f "$SWAP_FILE" >/dev/null
        sudo swapon "$SWAP_FILE"
    else
        echo "  Creating $SWAP_SIZE swap file at $SWAP_FILE"
        sudo fallocate -l "$SWAP_SIZE" "$SWAP_FILE" || sudo dd if=/dev/zero of="$SWAP_FILE" bs=1M count=3072 status=progress
        sudo chmod 600 "$SWAP_FILE"
        sudo mkswap "$SWAP_FILE" >/dev/null
        sudo swapon "$SWAP_FILE"
    fi

    if ! grep -q "^$SWAP_FILE " /etc/fstab; then
        echo "$SWAP_FILE none swap sw 0 0" | sudo tee -a /etc/fstab >/dev/null
    fi

    echo "  Active memory/swap:"
    free -h
}

normalize_mongo_url() {
    MONGO_URL="$MONGO_URL" python3 - <<'PY'
import os
import sys
from urllib.parse import quote_plus, unquote_plus

url = os.environ["MONGO_URL"].strip()

if "<" in url or ">" in url:
    print("ERROR: Replace <db_user> and <pwd> with your actual MongoDB Atlas database user credentials.", file=sys.stderr)
    print("Do not include angle brackets in MONGO_URL.", file=sys.stderr)
    sys.exit(1)

if not (url.startswith("mongodb://") or url.startswith("mongodb+srv://")):
    print("ERROR: MONGO_URL must start with mongodb:// or mongodb+srv://", file=sys.stderr)
    sys.exit(1)

scheme, rest = url.split("://", 1)
if "@" not in rest:
    print("ERROR: MONGO_URL must include username and password before the cluster host.", file=sys.stderr)
    sys.exit(1)

userinfo, host_and_path = rest.rsplit("@", 1)
if ":" not in userinfo:
    print("ERROR: MONGO_URL credentials must use username:password before the @ sign.", file=sys.stderr)
    sys.exit(1)

username, password = userinfo.split(":", 1)
if not username or not password:
    print("ERROR: MongoDB username and password cannot be empty.", file=sys.stderr)
    sys.exit(1)

encoded_username = quote_plus(unquote_plus(username))
encoded_password = quote_plus(unquote_plus(password))
print(f"{scheme}://{encoded_username}:{encoded_password}@{host_and_path}")
PY
}

validate_mongo_url() {
    set +e
    MONGO_URL="$MONGO_URL" python - <<'PY'
import os
import sys
from pymongo.uri_parser import parse_uri

try:
    parse_uri(os.environ["MONGO_URL"])
except Exception as exc:
    print(f"ERROR: Invalid MongoDB connection string: {exc}", file=sys.stderr)
    print("", file=sys.stderr)
    print("MongoDB usernames and passwords must be URL-encoded in MONGO_URL.", file=sys.stderr)
    print("If your password contains characters such as @ # / ? : % &, encode it first.", file=sys.stderr)
    print("Example encoder:", file=sys.stderr)
    print("  python3 -c 'from urllib.parse import quote_plus; print(quote_plus(\"your-password\"))'", file=sys.stderr)
    sys.exit(1)
PY
    local status=$?
    set -e
    return "$status"
}

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
    ca-certificates gnupg \
    curl wget zip unzip \
    git build-essential \
    python3 python3-venv python3-pip \
    dnsutils \
    nginx certbot python3-certbot-nginx

echo ">>> Installing Node.js 20 + npm"
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

echo ">>> Installing Yarn 1.x"
sudo npm install -g yarn@1.22.22

command -v node >/dev/null || { echo "ERROR: node was not installed"; exit 1; }
command -v npm >/dev/null || { echo "ERROR: npm was not installed"; exit 1; }
command -v yarn >/dev/null || { echo "ERROR: yarn was not installed"; exit 1; }

echo "  Node: $(node --version)"
echo "  npm: $(npm --version)"
echo "  Yarn: $(yarn --version)"
echo "✓ System packages installed"

echo
echo ">>> Configuring swap for low-memory EC2 builds"
ensure_swap
echo "✓ Swap configured"

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
NORMALIZED_MONGO_URL=$(normalize_mongo_url)
if [ "$NORMALIZED_MONGO_URL" != "$MONGO_URL" ]; then
    echo "  ✓ URL-encoded MongoDB username/password in MONGO_URL"
fi
MONGO_URL="$NORMALIZED_MONGO_URL"

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
echo ">>> Validating MongoDB connection string"
validate_mongo_url
deactivate
echo "✓ Backend venv created and dependencies installed"

# ============================================================================
# STEP 6: Frontend build
# ============================================================================
echo
echo ">>> STEP 6: Frontend build (Node + yarn)"
cd "$APP_DIR/frontend"
rm -rf node_modules package-lock.json build
yarn install --frozen-lockfile -q
export NODE_OPTIONS="--max-old-space-size=$NODE_BUILD_MEMORY_MB"
export GENERATE_SOURCEMAP=false
echo "  NODE_OPTIONS=$NODE_OPTIONS"
echo "  GENERATE_SOURCEMAP=$GENERATE_SOURCEMAP"
echo "  Memory before build:"
free -h
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
