#!/bin/bash
set -e
export DEBIAN_FRONTEND=noninteractive

DB_NAME="${db_name}"
DB_USER="${db_user}"
DB_PASSWORD="${db_password}"

# 1. Čekanje stabilne internet konekcije preko NAT Gateway-a
echo "Čekam internet konekciju preko NAT Gateway-a..."
until curl -s --connect-timeout 5 https://www.google.com > /dev/null; do
  echo "Internet još nije dostupan na privatnoj instanci, čekam 5 sekundi..."
  sleep 5
done
echo "Internet dostupan! Instaliram Docker na privatnu instancu baze..."

apt-get update -y && apt-get upgrade -y
apt-get install -y ca-certificates curl gnupg openssl

# Instalacija Dockera
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \$(. /etc/os-release && echo \"\$VERSION_CODENAME\") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

systemctl enable docker && systemctl start docker
usermod -aG docker ubuntu

# 2. Pokretanje baze unutar Docker kontejnera (Container DB instanca)
echo "Pokrećem MySQL Docker kontejner..."
docker run -d \
  --name arm-db-container \
  --restart always \
  -p 3306:3306 \
  -e MYSQL_DATABASE=${DB_NAME} \
  -e MYSQL_USER=${DB_USER} \
  -e MYSQL_PASSWORD=${DB_PASSWORD} \
  -e MYSQL_ROOT_PASSWORD=${DB_PASSWORD} \
  mysql:8.0 \
  --default-authentication-plugin=mysql_native_password

echo "MySQL kontejner na privatnoj instanci uspješno pokrenut!" >> /var/log/arm-db-setup.log