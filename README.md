# ARM Project - Automated Deployment System

This project represents a complete infrastructure and application solution based on the **AWS (Amazon Web Services)** platform. The system uses **Terraform** for infrastructure provisioning, **Docker** for application and database containerization, **Apache** as a reverse proxy with SSL encryption, and **GitLab Runner** for the CI/CD pipeline.

The entire process of setting up the infrastructure, waiting for server configuration, packaging, and sending the code is fully automated through a PowerShell script that eliminates *race condition* issues.

## Running the Application:

1. Add AWS credentials to your local machine
Write in terminal:
2. cd terraform
3. ./deploy.ps1

---

## 🏗 System Architecture

The system is divided into two main components within the AWS VPC:

1. **Public Instance (App Server - EC2):**
   * **Apache Web Server:** Serves as a Reverse Proxy that redirects traffic from port `80` (HTTP) to `443` (HTTPS), and then proxies requests to local port `3000`.
   * **Docker Container (`arm-app`):** Runs the application on port `3000`.
   * **GitLab Runner:** Shell executor prepared for automated CI/CD deployment via `/opt/deploy.sh`.
   * **SSL:** Self-signed certificate for the `local.arm.com` domain.

2. **Private Instance (Database Server - EC2):**
   * Isolated within a private subnet (Access is only possible from the application subnet).
   * Connects to the internet via a **NAT Gateway** for package installations.
   * Runs **MySQL 8.0** within a Docker container (`arm-db-container`) on port `3306`.

---

## 📂 Configuration File Structure

### 1. Apache Configuration (`www.conf`)
Configured to automatically redirect to HTTPS and proxy traffic to the Node.js/external application:

```apache
<VirtualHost *:80>
    ServerName local.arm.com
    ServerAlias [www.local.arm.com](https://www.local.arm.com)
    RewriteEngine On
    RewriteCond %{HTTPS} off
    RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [R=301,L]
</VirtualHost>

<VirtualHost *:443>
    ServerName local.arm.com
    ServerAlias [www.local.arm.com](https://www.local.arm.com)

    SSLEngine on
    SSLCertificateFile /etc/ssl/certs/[www.local.arm.com](https://www.local.arm.com).pem
    SSLCertificateKeyFile /etc/ssl/private/[www.local.arm.com](https://www.local.arm.com).key

    ProxyPreserveHost On
    ProxyPass / [http://127.0.0.1:3000/](http://127.0.0.1:3000/)
    ProxyPassReverse / [http://127.0.0.1:3000/](http://127.0.0.1:3000/)
</VirtualHost>