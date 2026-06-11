#!/bin/bash
set -e

export DEBIAN_FRONTEND=noninteractive

# ─── Varijable ────────────────────────────────────────────────────────────────
DB_HOST="${db_host}"
DB_NAME="${db_name}"
DB_USER="${db_user}"
DB_PASSWORD="${db_password}"
DOMAIN="${domain_name}"
GITLAB_TOKEN="${gitlab_token}"
APP_DIR="/opt/app"

# ─── System update ────────────────────────────────────────────────────────────
apt-get update -y
apt-get upgrade -y

# ─── Docker ───────────────────────────────────────────────────────────────────
apt-get install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

systemctl enable docker
systemctl start docker
usermod -aG docker ubuntu

# ─── Apache2 ──────────────────────────────────────────────────────────────────
apt-get install -y apache2
a2enmod proxy proxy_http ssl rewrite headers
systemctl enable apache2

# ─── GitLab Runner ────────────────────────────────────────────────────────────
curl -L "https://packages.gitlab.com/install/repositories/runner/gitlab-runner/script.deb.sh" | bash
apt-get install -y gitlab-runner
usermod -aG docker gitlab-runner

# ─── Aplikacijski direktorij ──────────────────────────────────────────────────
mkdir -p $APP_DIR
chown -R ubuntu:ubuntu $APP_DIR

# ─── SSL direktorij ───────────────────────────────────────────────────────────
mkdir -p /etc/apache2/ssl

# ─── Apache VirtualHost konfiguracija ────────────────────────────────────────
cat > /etc/apache2/sites-available/www.conf << 'APACHEEOF'
# HTTP → HTTPS redirect
<VirtualHost *:80>
    ServerName DOMAIN_PLACEHOLDER
    ServerAlias www.DOMAIN_PLACEHOLDER

    RewriteEngine On
    RewriteRule ^(.*)$ https://%%{HTTP_HOST}$1 [R=301,L]
</VirtualHost>

# HTTPS – reverse proxy na Node.js kontejner (port 3000)
<VirtualHost *:443>
    ServerName DOMAIN_PLACEHOLDER
    ServerAlias www.DOMAIN_PLACEHOLDER

    SSLEngine on
    SSLCertificateFile    /etc/apache2/ssl/cert.pem
    SSLCertificateKeyFile /etc/apache2/ssl/key.pem

    ProxyPreserveHost On
    ProxyPass        / http://127.0.0.1:3000/
    ProxyPassReverse / http://127.0.0.1:3000/

    ErrorLog  $${APACHE_LOG_DIR}/arm-error.log
    CustomLog $${APACHE_LOG_DIR}/arm-access.log combined
</VirtualHost>
APACHEEOF

# Zamijeni placeholder s pravim domenom
sed -i "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" /etc/apache2/sites-available/www.conf

a2dissite 000-default.conf
a2ensite www.conf

# ─── Sačuvaj env varijable za app ─────────────────────────────────────────────
cat > /etc/app.env << EOF
DB_HOST=$DB_HOST
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
NODE_ENV=production
PORT=3000
EOF

chmod 600 /etc/app.env

# ─── GitLab Runner registracija ───────────────────────────────────────────────
# Runner se registrira nakon što korisnik postavi gitlab-ci.yml i token
cat > /opt/register-runner.sh << EOF
#!/bin/bash
gitlab-runner register \
  --non-interactive \
  --url "https://gitlab.com/" \
  --registration-token "$GITLAB_TOKEN" \
  --executor "shell" \
  --description "arm-ec2-runner" \
  --tag-list "arm,deploy" \
  --run-untagged="true" \
  --locked="false"
EOF
chmod +x /opt/register-runner.sh

# Pokusaj registracije (moze biti da token jos nije validan)
if [ -n "$GITLAB_TOKEN" ] && [ "$GITLAB_TOKEN" != "glrt-xxxxxxxxxxxxxxxxxxxx" ]; then
  /opt/register-runner.sh || true
fi

# ─── Deploy skripta (poziva se iz CI/CD pipeline-a) ──────────────────────────
cat > /opt/deploy.sh << 'DEPLOYEOF'
#!/bin/bash
set -e

APP_DIR="/opt/app"
source /etc/app.env

cd $APP_DIR

# Pull najnovijeg koda (runner to radi, ovdje samo pokrecemo Docker)
docker compose down --remove-orphans || true
docker compose up -d --build

echo "Deploy završen: $(date)"
DEPLOYEOF
chmod +x /opt/deploy.sh

# Dozvoli gitlab-runner da pokrenuti deploy skriptu bez lozinke
echo "gitlab-runner ALL=(ALL) NOPASSWD: /opt/deploy.sh" >> /etc/sudoers.d/gitlab-runner

# ─── Restart servisa ──────────────────────────────────────────────────────────
systemctl restart apache2
systemctl restart gitlab-runner

echo "EC2 userdata setup završen!" >> /var/log/arm-setup.log
