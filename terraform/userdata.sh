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

# 1. Čekanje stabilne internet konekcije (da paketi ne puknu tokom Terraform apply)
until curl -s --connect-timeout 5 https://www.google.com > /dev/null; do
  sleep 3
done

apt-get update -y && apt-get upgrade -y
apt-get install -y ca-certificates curl gnupg openssl git rsync

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

# SSL samopotpisani certifikat
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/ssl/private/www.local.arm.com.key \
  -out /etc/ssl/certs/www.local.arm.com.pem \
  -subj "/C=BA/L=Sarajevo/O=ETF/OU=ARM/CN=local.arm.com"

# GitLab Runner instalacija
curl -L "https://packages.gitlab.com/install/repositories/runner/gitlab-runner/script.deb.sh" | bash
apt-get install -y gitlab-runner
usermod -aG docker gitlab-runner

# >>> OVDJE UBACUJEMO DOZVOLU ZA SUDO BEZ LOZINKE <<<
echo "gitlab-runner ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/gitlab-runner

# Čišćenje i postavljanje direktorija aplikacije
rm -rf $APP_DIR
mkdir -p $APP_DIR
chown -R gitlab-runner:gitlab-runner $APP_DIR
chmod -R 775 $APP_DIR

# Env file za aplikaciju
cat > /etc/app.env << EOF
DB_HOST=$DB_HOST
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
NODE_ENV=production
PORT=3000
EOF
chmod 600 /etc/app.env

# Čišćenje starih registracija runnera i ponovna registracija
rm -f /etc/gitlab-runner/config.toml
gitlab-runner register \
  --non-interactive \
  --url "https://gitlab.com/" \
  --token "$GITLAB_TOKEN" \
  --executor "shell" \
  --description "arm-ec2-runner" || true

# Kloniranje repozitorija
git clone https://gitlab-ci-token:$GITLAB_TOKEN@gitlab.com/arm-group2/arm.git $APP_DIR || true
chown -R gitlab-runner:gitlab-runner $APP_DIR

# Deploy skripta na hostu
cat > /opt/deploy.sh << 'DEPLOYEOF'
#!/bin/bash
set -e
source /etc/app.env
cd /opt/app
docker compose down --remove-orphans || true
docker compose up -d --build
DEPLOYEOF
chmod +x /opt/deploy.sh

cp /etc/app.env $APP_DIR/.env

# Prvi deploy
/opt/deploy.sh || true

# Apache konfiguracija iz povučenog koda (da se izbjegne dupliranje)
if [ -f "$APP_DIR/www.conf" ]; then
  cp $APP_DIR/www.conf /etc/apache2/sites-available/www.conf
  a2dissite 000-default default-ssl || true
  a2ensite www.conf
fi

systemctl restart apache2
systemctl restart gitlab-runner

echo "EC2 setup završen: $(date)" >> /var/log/arm-setup.log