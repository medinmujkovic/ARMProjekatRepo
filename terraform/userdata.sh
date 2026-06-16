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

apt-get update -y
apt-get upgrade -y

apt-get install -y ca-certificates curl gnupg openssl
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

apt-get install -y apache2
a2enmod proxy proxy_http ssl rewrite headers
systemctl enable apache2

# Generisanje samopotpisanih SSL sertifikata koje Apache očekuje ispod
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/ssl/private/www.local.arm.com.key \
  -out /etc/ssl/certs/www.local.arm.com.pem \
  -subj "/C=BA/L=Sarajevo/O=ETF/OU=ARM/CN=local.arm.com"

curl -L "https://packages.gitlab.com/install/repositories/runner/gitlab-runner/script.deb.sh" | bash
apt-get install -y gitlab-runner
usermod -aG docker gitlab-runner

mkdir -p $APP_DIR
chown -R gitlab-runner:gitlab-runner $APP_DIR

mkdir -p /etc/apache2/ssl

cat > /etc/apache2/sites-available/www.conf << 'APACHEEOF'
<VirtualHost *:80>
    ServerName DOMAIN_PLACEHOLDER
    ServerAlias www.DOMAIN_PLACEHOLDER

    RewriteEngine On
    RewriteCond %%{HTTPS} off
    RewriteRule ^(.*)$ https://%%{HTTP_HOST}%%{REQUEST_URI} [R=301,L]
</VirtualHost>

<VirtualHost *:443>
    ServerName DOMAIN_PLACEHOLDER
    ServerAlias www.DOMAIN_PLACEHOLDER

    SSLEngine on
    SSLCertificateFile    /etc/ssl/certs/www.local.arm.com.pem
    SSLCertificateKeyFile /etc/ssl/private/www.local.arm.com.key

    ProxyPreserveHost On
    ProxyPass        / http://127.0.0.1:3000/
    ProxyPassReverse / http://127.0.0.1:3000/

    ErrorLog  $${APACHE_LOG_DIR}/arm-error.log
    CustomLog $${APACHE_LOG_DIR}/arm-access.log combined
</VirtualHost>
APACHEEOF

sed -i "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" /etc/apache2/sites-available/www.conf

a2dissite 000-default default-ssl www.conf || true
a2ensite www.conf

cat > /etc/app.env << EOF
export DB_HOST=$DB_HOST
export DB_NAME=$DB_NAME
export DB_USER=$DB_USER
export DB_PASSWORD=$DB_PASSWORD
export NODE_ENV=production
export PORT=3000
EOF

chmod 600 /etc/app.env

# Nova sintaksa za moderne GitLab tokene i brisanje po imenu
cat > /opt/register-runner.sh << EOF
#!/bin/bash
gitlab-runner unregister --name "arm-ec2-runner" || true

gitlab-runner register \
  --non-interactive \
  --url "https://gitlab.com/" \
  --token "$GITLAB_TOKEN" \
  --executor "shell" \
  --description "arm-ec2-runner"
EOF
chmod +x /opt/register-runner.sh

if [ -n "$GITLAB_TOKEN" ] && [ "$GITLAB_TOKEN" != "glrt-xxxxxxxxxxxxxxxxxxxx" ]; then
  /opt/register-runner.sh || true
fi

usermod -aG sudo gitlab-runner
echo "gitlab-runner ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/gitlab-runner

cat > /opt/deploy.sh << 'DEPLOYEOF'
#!/bin/bash
set -e

APP_DIR="/opt/app"
source /etc/app.env

cd $APP_DIR

docker compose down --remove-orphans || true
docker compose up -d --build

echo "Deploy završen: $(date)"
DEPLOYEOF
chmod +x /opt/deploy.sh

systemctl restart apache2
systemctl restart gitlab-runner

echo "EC2 userdata setup uspješno završen!" >> /var/log/arm-setup.log

# =========================================================================
# DODANO: Pametni SSH Banner koji ti rješava problem praćenja stanja aplikacije
# =========================================================================
cat >> /home/ubuntu/.bashrc << 'BASHRCEOF'

echo "=================================================================="
echo "                   ARM EC2 SERVER STATUS BANNED                   "
echo "=================================================================="
if [ -f /var/log/arm-setup.log ] && grep -q "uspješno završen" /var/log/arm-setup.log; then
    echo -e "\e[32m[STATUS]\e[0m Sistem i GitLab Runner su USPIJEŠNO instalirani!"
    echo "------------------------------------------------------------------"
    echo "Trenutno stanje Docker kontejnera na serveru:"
    sudo docker ps
    echo "------------------------------------------------------------------"
    echo -e "Ako je gornja lista prazna (vidiš 503 grešku), to je \e[33mNORMALNO\e[0m."
    echo "Sada idi na GitLab -> Build -> Pipelines i pokreni ručno vaš Pipeline!"
else
    echo -e "\e[33m[STATUS]\e[0m Skripta još uvijek instalira Docker, Apache i Runner u pozadini..."
    echo "Za praćenje instalacije uživo ukucaj komandu:"
    echo "sudo tail -f /var/log/cloud-init-output.log"
fi
echo "=================================================================="
BASHRCEOF