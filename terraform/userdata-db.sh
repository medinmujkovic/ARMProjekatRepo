#!/bin/bash
set -e

export DEBIAN_FRONTEND=noninteractive

# ─── Varijable (Popunjava Terraform) ──────────────────────────────────────────
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

# ─── Docker instalacija ───────────────────────────────────────────────────────
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

# ─── Apache2 instalacija i moduli ─────────────────────────────────────────────
apt-get install -y apache2
a2enmod proxy proxy_http ssl rewrite headers
systemctl enable apache2

# ─── GitLab Runner instalacija ────────────────────────────────────────────────
curl -L "https://packages.gitlab.com/install/repositories/runner/gitlab-runner/script.deb.sh" | bash
apt-get install -y gitlab-runner
usermod -aG docker gitlab-runner

# ─── Aplikacijski direktorij i permisije ──────────────────────────────────────
mkdir -p $APP_DIR
chown -R gitlab-runner:gitlab-runner $APP_DIR

# ─── SSL folder za svaki slučaj ───────────────────────────────────────────────
mkdir -p /etc/apache2/ssl

# ─── Apache VirtualHost konfiguracija ────────────────────────────────────────
cat > /etc/apache2/sites-available/www.conf << 'APACHEEOF'
# HTTP → HTTPS automatsko preusmjeravanje
<VirtualHost *:80>
    ServerName DOMAIN_PLACEHOLDER
    ServerAlias www.DOMAIN_PLACEHOLDER

    RewriteEngine On
    RewriteCond %{HTTPS} off
    RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [R=301,L]
</VirtualHost>

# HTTPS – Reverse Proxy na Node.js (Port 3000)
<VirtualHost *:443>
    ServerName DOMAIN_PLACEHOLDER
    ServerAlias www.DOMAIN_PLACEHOLDER

    SSLEngine on
    SSLCertificateFile    /etc/ssl/certs/www.local.arm.com.pem
    SSLCertificateKeyFile /etc/ssl/private/www.local.arm.com.key

    ProxyPreserveHost On
    ProxyPass        / http://127.0.0.1:3000/
    ProxyPassReverse / http://127.0.0.1:3000/

    ErrorLog  ${APACHE_LOG_DIR}/arm-error.log
    CustomLog ${APACHE_LOG_DIR}/arm-access.log combined
</VirtualHost>
APACHEEOF

sed -i "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" /etc/apache2/sites-available/www.conf
a2dissite 000-default default-ssl www.conf || true
a2ensite www.conf

# ─── Sačuvanje env varijabli za Node.js aplikaciju ────────────────────────────
cat > /etc/app.env << EOF
DB_HOST=$DB_HOST
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
NODE_ENV=production
PORT=3000
EOF
chmod 600 /etc/app.env

# ─── GitLab Runner automatizovana registracija ────────────────────────────────
cat > /opt/register-runner.sh << EOF
#!/bash
gitlab-runner unregister --all || true

# ISPRAVLJENO: Koristi se --token i tag je postavljen na arm-runner
gitlab-runner register \
  --non-interactive \
  --url "https://gitlab.com/" \
  --token "$GITLAB_TOKEN" \
  --executor "shell" \
  --description "arm-ec2-runner" \
  --tag-list "arm-runner" \
  --run-untagged="true" \
  --locked="false"
EOF
chmod +x /opt/register-runner.sh

if [ -n "$GITLAB_TOKEN" ] && [ "$GITLAB_TOKEN" != "glrt-xxxxxxxxxxxxxxxxxxxx" ]; then
  /opt/register-runner.sh || true
fi

# Dodavanje permisija za nesmetan deploy bez lozinke
usermod -aG sudo gitlab-runner
echo "gitlab-runner ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/gitlab-runner

# ─── Restartovanje servisa ───────────────────────────────────────────────────
systemctl restart apache2
systemctl restart gitlab-runner

echo "EC2 userdata setup uspješno završen!" >> /var/log/arm-setup.log