#!/bin/bash
set -e
export DEBIAN_FRONTEND=noninteractive

DB_NAME="${db_name}"
DB_USER="${db_user}"
DB_PASSWORD="${db_password}"

echo "Čekam internet konekciju preko NAT Gateway-a..."
until curl -s --connect-timeout 5 https://www.google.com > /dev/null; do
  echo "Internet još nije dostupan na privatnoj instanci, čekam 5 sekundi..."
  sleep 5
done
echo "Internet dostupan! Nastavljam instalaciju baze..."

echo "Čekam da se oslobodi apt lock na bazi..."
while fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1 ; do
  echo "Apt lock je zauzet, čekam 5 sekundi..."
  sleep 5
done

apt-get update -y && apt-get upgrade -y
apt-get install -y ca-certificates curl gnupg openssl


install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu jammy stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io

systemctl enable docker && systemctl start docker

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