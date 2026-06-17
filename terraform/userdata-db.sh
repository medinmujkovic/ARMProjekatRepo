#!/bash/db-setup
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

apt-get update -y
apt-get upgrade -y

apt-get install -y mysql-server

systemctl start mysql
systemctl enable mysql

sed -i "s/127.0.0.1/0.0.0.0/g" /etc/mysql/mysql.conf.d/mysqld.cnf
systemctl restart mysql

mysql -e "CREATE DATABASE IF NOT EXISTS `${DB_NAME}`;"
mysql -e "CREATE USER IF NOT EXISTS '${DB_USER}'@'%' IDENTIFIED BY '${DB_PASSWORD}';"
mysql -e "GRANT ALL PRIVILEGES ON `${DB_NAME}`.* TO '${DB_USER}'@'%';"
mysql -e "FLUSH PRIVILEGES;"

echo "Database userdata setup uspješno završen!" >> /var/log/arm-db-setup.log