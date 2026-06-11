# 1. Pokretanje Terraforma bez dosadnih pitanja (automatsko odobrenje)
Write-Host "=== Pokrecem Terraform... ===" -ForegroundColor Green
terraform init
terraform apply -auto-approve

# 2. Automatsko hvatanje nove IP adrese iz Terraforma!
# (Ovo radi pod uslovom da u Terraform kôdu imaš definisan 'output "public_ip"')
$server_ip = terraform output -raw public_ip
Write-Host "=== Detektovana nova IP adresa: $server_ip ===" -ForegroundColor Cyan

# 3. Pauza od 20 sekundi da se AWS mašina podigne i upali SSH port
Write-Host "Cekam da SSH postane dostupan..." -ForegroundColor Yellow
Start-Sleep -Seconds 20

# 4. Automatsko kopiranje SSL sertifikata (skripta sama ubacuje novu IP adresu!)
Write-Host "=== Kopiram SSL sertifikate na server... ===" -ForegroundColor Green
scp -i "$env:USERPROFILE\.ssh\arm_key" "$env:USERPROFILE\Downloads\www.local.arm.com-2026-06-03-095440.pem" ubuntu@${server_ip}:~
scp -i "$env:USERPROFILE\.ssh\arm_key" "$env:USERPROFILE\Downloads\www.local.arm.com-2026-06-03-095440.pkey" ubuntu@${server_ip}:~

# 5. Automatski te spaja na server na kraju
Write-Host "=== Sve je spremno! Spajam te na server... ===" -ForegroundColor Green
ssh -i "$env:USERPROFILE\.ssh\arm_key" ubuntu@${server_ip}