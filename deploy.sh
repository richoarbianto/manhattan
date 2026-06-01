#!/bin/bash
set -e

SERVER_HOST="ubuntu@43.133.141.218"
SSH_KEY="~/.ssh/id_ok"
DOMAIN="ricoo.dev"
MONGODB_URI="mongodb+srv://username:9J4PUui2X4MQMeAi@manhattan.2wyxkav.mongodb.net/?appName=manhattan"

echo "=== Manhattan Deployment Script ==="
echo "Target: $SERVER_HOST"
echo "Domain: $DOMAIN"
echo ""

# Step 1: Install Java on server
echo "[1/8] Installing Java..."
ssh -i $SSH_KEY $SERVER_HOST << 'EOF'
if ! command -v java &> /dev/null; then
    sudo apt-get update
    sudo apt-get install -y openjdk-21-jdk
fi
java -version
EOF

# Step 2: Create manhattan user and directories
echo "[2/8] Setting up directories and user..."
ssh -i $SSH_KEY $SERVER_HOST << 'EOF'
if ! id -u manhattan &> /dev/null; then
    sudo useradd -r -s /bin/false manhattan
fi
sudo mkdir -p /opt/manhattan/{server/build/libs,client}
sudo chown -R manhattan:manhattan /opt/manhattan
EOF

# Step 3: Upload server JAR
echo "[3/8] Uploading server application..."
scp -i $SSH_KEY server/build/libs/manhattan-0.0.1-SNAPSHOT.jar $SERVER_HOST:/tmp/
ssh -i $SSH_KEY $SERVER_HOST "sudo mv /tmp/manhattan-0.0.1-SNAPSHOT.jar /opt/manhattan/server/build/libs/ && sudo chown manhattan:manhattan /opt/manhattan/server/build/libs/manhattan-0.0.1-SNAPSHOT.jar"

# Step 4: Upload client files
echo "[4/8] Uploading client files..."
scp -i $SSH_KEY -r client/dist/* $SERVER_HOST:/tmp/client-dist/
scp -i $SSH_KEY client/index.html $SERVER_HOST:/tmp/client/
ssh -i $SSH_KEY $SERVER_HOST "sudo rm -rf /opt/manhattan/client/* && sudo mkdir -p /opt/manhattan/client/dist && sudo mv /tmp/client-dist/* /opt/manhattan/client/dist/ && sudo mv /tmp/client/* /opt/manhattan/client/ && sudo chown -R manhattan:manhattan /opt/manhattan/client"

# Step 5: Create environment file
echo "[5/8] Creating environment configuration..."
ssh -i $SSH_KEY $SERVER_HOST << EOF
sudo tee /opt/manhattan/.env > /dev/null << 'ENVEOF'
MONGODB_URI=$MONGODB_URI
ENVEOF
sudo chown manhattan:manhattan /opt/manhattan/.env
sudo chmod 600 /opt/manhattan/.env
EOF

# Step 6: Install and configure systemd service
echo "[6/8] Installing systemd service..."
scp -i $SSH_KEY deploy/manhattan.service $SERVER_HOST:/tmp/
ssh -i $SSH_KEY $SERVER_HOST << 'EOF'
sudo mv /tmp/manhattan.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable manhattan
sudo systemctl restart manhattan
sleep 3
sudo systemctl status manhattan --no-pager
EOF

# Step 7: Configure nginx
echo "[7/8] Configuring nginx..."
scp -i $SSH_KEY deploy/manhattan.conf $SERVER_HOST:/tmp/
ssh -i $SSH_KEY $SERVER_HOST << 'EOF'
sudo mv /tmp/manhattan.conf /etc/nginx/conf.d/
sudo nginx -t
sudo systemctl reload nginx
EOF

# Step 8: Setup SSL with certbot
echo "[8/8] Setting up SSL certificate..."
ssh -i $SSH_KEY $SERVER_HOST << EOF
if ! command -v certbot &> /dev/null; then
    sudo apt-get update
    sudo apt-get install -y certbot python3-certbot-nginx
fi

# Stop nginx temporarily for certbot standalone mode
sudo systemctl stop nginx

# Get certificate
sudo certbot certonly --standalone -d $DOMAIN --non-interactive --agree-tos --email admin@$DOMAIN || true

# Start nginx
sudo systemctl start nginx

# Setup auto-renewal
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
EOF

echo ""
echo "=== Deployment Complete ==="
echo "Application: https://$DOMAIN"
echo ""
echo "Useful commands:"
echo "  Check logs: ssh -i $SSH_KEY $SERVER_HOST 'sudo journalctl -u manhattan -f'"
echo "  Restart app: ssh -i $SSH_KEY $SERVER_HOST 'sudo systemctl restart manhattan'"
echo "  Check status: ssh -i $SSH_KEY $SERVER_HOST 'sudo systemctl status manhattan'"
