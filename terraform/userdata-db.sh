#!/bin/bash
set -e

export DEBIAN_FRONTEND=noninteractive

DB_NAME="${db_name}"
DB_USER="${db_user}"
DB_PASSWORD="${db_password}"

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

# ─── MySQL kontejner ─────────────────────────────────────────────────────────
mkdir -p /opt/db
cat > /opt/db/docker-compose.yml << COMPOSEEOF
services:
  mysql:
    image: mysql:8.0
    container_name: arm-mysql
    restart: always
    environment:
      MYSQL_ROOT_PASSWORD: ${db_password}root
      MYSQL_DATABASE: ${db_name}
      MYSQL_USER: ${db_user}
      MYSQL_PASSWORD: ${db_password}
    ports:
      - "3306:3306"
    volumes:
      - mysql_data:/var/lib/mysql
    command: --default-authentication-plugin=mysql_native_password

volumes:
  mysql_data:
COMPOSEEOF

cd /opt/db
docker compose up -d

echo "DB kontejner pokrenut: $(date)" >> /var/log/arm-db-setup.log
