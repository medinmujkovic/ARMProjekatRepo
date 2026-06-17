terraform init
terraform plan -out terraform.tfplan
terraform apply "terraform.tfplan"

$public_ip = (terraform output -raw public_ip).Trim()

# Pametno čekanje da se SSH port otvori, umjesto nasumičnog Start-Sleep
Write-Host "Čekam da SSH port 22 na $public_ip postane dostupan..." -ForegroundColor Yellow
while ($true) {
    try {
        $connection = New-Object System.Net.Sockets.TcpClient($public_ip, 22)
        if ($connection.Connected) {
            $connection.Close()
            Write-Host "SSH port je otvoren! Nastavljam..." -ForegroundColor Green
            break
        }
    } catch {
        # Port još nije otvoren, sačekaj 2 sekunde
    }
    Start-Sleep -Seconds 2
}

# Malo dodatno vrijeme za stabilizaciju SSH servisa
Start-Sleep -Seconds 5

Write-Host "Kopiram SSL ključeve..." -ForegroundColor Cyan
scp -o StrictHostKeyChecking=no -i ./armprojekat_ec2_access_key.pem -r ./ssl ubuntu@${public_ip}:/home/ubuntu/

Write-Host "Uspješno! Povezujem se na EC2..." -ForegroundColor Green
ssh -o StrictHostKeyChecking=no -i ./armprojekat_ec2_access_key.pem ubuntu@${public_ip}