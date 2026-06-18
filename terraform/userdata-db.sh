#!/bin/bash
set -e
export DEBIAN_FRONTEND=noninteractive

DB_NAME="${db_name}"
DB_USER="${db_user}"
DB_PASSWORD="${db_password}"

# 1. Čekanje stabilne internet konekcije preko NAT Gateway-a (ključno za privatne podreže)
echo "Čekam internet konekciju preko NAT Gateway-a..."
until curl -s --connect-timeout 5 https://www.google.com > /dev/null; do
  echo "Internet još nije dostupan na privatnoj instanci, čekam 5 sekundi..."
  sleep 5
done
echo "Internet dostupan! Nastavljam instalaciju baze..."

# 2. Instalacija Docker-a na privatnoj instanci
apt-get update -y && apt-get upgrade -y
apt-get install -y ca-certificates curl gnupg openssl

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io

systemctl enable docker && systemctl start docker

# 3. AUTOMATSKO pokretanje baze u Docker kontejneru sa svim postavkama (baza, user, lozinka i skip-name-resolve)
echo "Pokrećem MySQL Docker kontejner sa automatskom konfiguracijom..."
docker run -d \
  --name arm-db-container \
  --restart always \
  -p 3306:3306 \
  -e MYSQL_DATABASE="$DB_NAME" \
  -e MYSQL_USER="$DB_USER" \
  -e MYSQL_PASSWORD="$DB_PASSWORD" \
  -e MYSQL_ROOT_PASSWORD="$DB_PASSWORD" \
  mysql:8.0 \
  --default-authentication-plugin=mysql_native_password \
  --skip-name-resolve

echo "MySQL kontejner na privatnoj instanci uspješno pokrenut i konfigurisan!" >> /var/log/arm-db-setup.log