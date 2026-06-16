#!/bin/bash
set -e
export DEBIAN_FRONTEND=noninteractive

DB_HOST="${db_host}"
DB_NAME="${db_name}"
DB_USER="${db_user}"
DB_PASSWORD="${db_password}"
DOMAIN="${domain_name}"
GITLAB_TOKEN="${gitlab_token}"
APP_DIR="/opt/app"

apt-get update -y && apt-get upgrade -y
apt-get install -y ca-certificates curl gnupg openssl git

# Docker instalacija
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

systemctl enable docker && systemctl start docker
usermod -aG docker ubuntu

# Apache instalacija
apt-get install -y apache2
a2enmod proxy proxy_http ssl rewrite headers
systemctl enable apache2

# SSL
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/ssl/private/www.local.arm.com.key \
  -out /etc/ssl/certs/www.local.arm.com.pem \
  -subj "/C=BA/L=Sarajevo/O=ETF/OU=ARM/CN=local.arm.com"

# GitLab Runner
curl -L "https://packages.gitlab.com/install/repositories/runner/gitlab-runner/script.deb.sh" | bash
apt-get install -y gitlab-runner
usermod -aG docker gitlab-runner

# Setup foldera
mkdir -p $APP_DIR
chown -R gitlab-runner:gitlab-runner $APP_DIR
chmod -R 775 $APP_DIR

# Apache Config
cat > /etc/apache2/sites-available/www.conf << APACHEEEOF
<VirtualHost *:80>
    ServerName $DOMAIN
    RewriteEngine On
    RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [R=301,L]
</VirtualHost>
<VirtualHost *:443>
    ServerName $DOMAIN
    SSLEngine on
    SSLCertificateFile /etc/ssl/certs/www.local.arm.com.pem
    SSLCertificateKeyFile /etc/ssl/private/www.local.arm.com.key
    ProxyPreserveHost On
    ProxyPass / http://127.0.0.1:3000/
    ProxyPassReverse / http://127.0.0.1:3000/
</VirtualHost>
APACHEEEOF

a2dissite 000-default default-ssl || true
a2ensite www.conf

# Env file
cat > /etc/app.env << EOF
DB_HOST=$DB_HOST
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
NODE_ENV=production
PORT=3000
EOF
chmod 600 /etc/app.env

# Runner register
cat > /opt/register-runner.sh << EOF
#!/bin/bash
gitlab-runner register --non-interactive --url "https://gitlab.com/" --token "$GITLAB_TOKEN" --executor "shell" --description "arm-ec2-runner"
EOF
chmod +x /opt/register-runner.sh
/opt/register-runner.sh || true

# Git Clone (Ako repo nije javan, koristi Deploy Token format u URL-u)
git clone https://glrt-8ggXm8vG5TFRIpBKyn2mQmM6MQpvOjEKcDoxZGhnbTAKdDozCnU6bjNyOWoc.01.1o0r6g0e6@gitlab.com/arm-group2/arm.git $APP_DIR || true
chown -R gitlab-runner:gitlab-runner $APP_DIR

# Deploy skripta
cat > /opt/deploy.sh << 'DEPLOYEOF'
#!/bin/bash
set -e
source /etc/app.env
cd /opt/app
docker compose down --remove-orphans || true
docker compose up -d --build
DEPLOYEOF
chmod +x /opt/deploy.sh

# Prvi deploy
sudo -u gitlab-runner /opt/deploy.sh || true

systemctl restart apache2
systemctl restart gitlab-runner

echo "EC2 setup završen: $(date)" >> /var/log/arm-setup.log