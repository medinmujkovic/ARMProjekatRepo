# 1. Pokretanje Terraform-a
terraform init
terraform plan -out terraform.tfplan
terraform apply "terraform.tfplan"

$public_ip = (terraform output -raw public_ip).Trim()

# 2. Pametno čekanje da SSH port 22 postane aktivan
Write-Host "Čekam da SSH port 22 na $public_ip postane dostupan..." -ForegroundColor Yellow
while ($true) {
    try {
        $connection = New-Object System.Net.Sockets.TcpClient($public_ip, 22)
        if ($connection.Connected) {
            $connection.Close()
            Write-Host "SSH port je otvoren!" -ForegroundColor Green
            break
        }
    } catch {
        # Čekaj sekundu prije novog pokušaja
    }
    Start-Sleep -Seconds 2
}

# 3. ČEKANJE DA AWS ZAVRŠI INSTALACIJU DOCKER-A I APACHE-A (Rješava race condition!)
Write-Host "Čekam da AWS završi instalaciju Dockera, Apache-a i GitLab Runnera (ovo može trajati 2-3 minute)..." -ForegroundColor Yellow
while ($true) {
    try {
        $setup_status = ssh -o StrictHostKeyChecking=no -i ./armprojekat_ec2_access_key.pem ubuntu@${public_ip} "if [ -f /var/lib/cloud/instance/boot-finished ]; then echo 'GOTOVO'; else echo 'CEKAJ'; fi"
        if ($setup_status -match "GOTOVO") {
            Write-Host "AWS pozadinska instalacija je u potpunosti završena!" -ForegroundColor Green
            break
        }
    } catch {
        # Ako se SSH nakratko prekine, čekamo ponovo
    }
    Start-Sleep -Seconds 10
}

# 4. Pakovanje lokalnog koda (izuzimamo terraform, .git i node_modules)
Write-Host "Pakujem lokalni kod aplikacije..." -ForegroundColor Cyan
if (Test-Path .\app.tar.gz) { Remove-Item .\app.tar.gz -Force }
tar -czf app.tar.gz --exclude='terraform' --exclude='.git' --exclude='node_modules' --exclude='app.tar.gz' -C .. .

# 5. Kopiranje arhive, SSL foldera i privatnog ključa na server
Write-Host "Kopiram arhivu i ključeve na server..." -ForegroundColor Cyan
scp -o StrictHostKeyChecking=no -i ./armprojekat_ec2_access_key.pem .\app.tar.gz ubuntu@${public_ip}:/home/ubuntu/
scp -o StrictHostKeyChecking=no -i ./armprojekat_ec2_access_key.pem -r ./ssl ubuntu@${public_ip}:/home/ubuntu/
# Kopiramo ključ na javni server kako biste sa njega mogli SSH-ovati na privatni server baze
scp -o StrictHostKeyChecking=no -i ./armprojekat_ec2_access_key.pem ./armprojekat_ec2_access_key.pem ubuntu@${public_ip}:/home/ubuntu/

Remove-Item .\app.tar.gz -Force

# 6. Inicijalizacija aplikacije na serveru (Sada kada su i Docker i /opt/app 100% spremni!)
Write-Host "Pokrećem aplikaciju i konfiguraciju na serveru..." -ForegroundColor Green
ssh -o StrictHostKeyChecking=no -i ./armprojekat_ec2_access_key.pem ubuntu@${public_ip} "
  sudo mkdir -p /opt/app &&
  sudo tar -xzf /home/ubuntu/app.tar.gz -C /opt/app/ &&
  sudo chown -R gitlab-runner:gitlab-runner /opt/app &&
  sudo chmod -R 775 /opt/app &&
  sudo cp /etc/app.env /opt/app/.env &&
  sudo /opt/deploy.sh &&
  if [ -f '/opt/app/www.conf' ]; then
    sudo cp /opt/app/www.conf /etc/apache2/sites-available/www.conf
    sudo a2ensite www.conf
    sudo a2dissite 000-default.conf
    sudo systemctl restart apache2
  fi
"

Write-Host "Aplikacija je uspješno podignuta i spremna za rad!" -ForegroundColor Green
ssh -o StrictHostKeyChecking=no -i ./armprojekat_ec2_access_key.pem ubuntu@${public_ip}