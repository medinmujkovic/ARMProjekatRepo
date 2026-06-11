# ARM Projekat – Deployment upute (AWS dio)

## Preduslovi

- AWS studentski nalog (AWS Academy / AWS Educate)
- Terraform instaliran lokalno (`terraform -v`)
- AWS CLI instaliran i konfiguriran (`aws configure`)
- SSH key pair kreiran

---

## Korak 1 – Kreiranje SSH ključa

```bash
# Na svom računaru (PowerShell ili Git Bash)
ssh-keygen -t rsa -b 4096 -f ~/.ssh/arm_key -N ""
```

---

## Korak 2 – AWS CLI konfiguracija

```bash
aws configure
# AWS Access Key ID: [tvoj ključ iz AWS Academy Lab]
# AWS Secret Access Key: [tajni ključ]
# Default region name: eu-central-1
# Default output format: json
```

> Napomena za AWS Academy: Access Key, Secret Key i Session Token preuzmi iz "AWS Details" u Vocareum-u.
> Ako koristiš session token, dodaj ga:
> ```bash
> aws configure set aws_session_token [TOKEN]
> ```

---

## Korak 3 – GitLab repozitorij

1. Idi na https://gitlab.com i kreiraj novi projekt (npr. `scenario-app`)
2. Pushuj kod:
```bash
cd c:\Users\Ajnur\Desktop\ScenarioProject
git remote add gitlab https://gitlab.com/TVOJ_USERNAME/scenario-app.git
git push gitlab main
```
3. U GitLab projektu idi na **Settings → CI/CD → Runners**
4. Kopij **registration token** (počinje s `glrt-`)

---

## Korak 4 – Terraform konfiguracija

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
```

Otvori `terraform.tfvars` i popuni:
```hcl
aws_region          = "us-east-1"          # ili eu-central-1
public_key_path     = "~/.ssh/arm_key.pub"
domain_name         = "scenario.arm.com"   # ili bilo koji .arm.com
db_name             = "wt26"
db_user             = "appuser"
db_password         = "TvojaLozinka123!"
gitlab_runner_token = "glrt-xxxxxxxxxxxx"  # iz GitLab Settings
```

> **Provjeri AMI ID!** Ubuntu 22.04 AMI se razlikuje po regionu.
> Za `us-east-1`: `ami-0c7217cdde317cfec`
> Za `eu-central-1`: `ami-0faab6bdbac9486fb`
> Provjeri aktuelni na: https://cloud-images.ubuntu.com/locator/ec2/

---

## Korak 5 – Deploy infrastrukture

```bash
cd terraform
terraform init
terraform plan
terraform apply
```

Nakon `apply` sačuvaj outpute:
- `web_public_ip` – IP adresa EC2 servera
- `ssh_command` – SSH komanda za pristup

---

## Korak 6 – SSL certifikat

### 6a) Generisanje privatnog ključa i CSR-a

```bash
# Na svom računaru
openssl genrsa -out ssl_key.pem 2048
openssl req -new -key ssl_key.pem -out ssl_csr.pem -subj "/CN=scenario.arm.com/O=ARM Tim/C=BA"
```

### 6b) Kreiranje certifikata na getacert.com

1. Otvori https://getacert.com/
2. Zalijep sadržaj `ssl_csr.pem` u polje
3. Preuzmi `cert.pem`

### 6c) Upload certifikata na EC2

```bash
WEB_IP=$(terraform output -raw web_public_ip)

scp -i ~/.ssh/arm_key ssl_key.pem ubuntu@$WEB_IP:/tmp/
scp -i ~/.ssh/arm_key cert.pem ubuntu@$WEB_IP:/tmp/

ssh -i ~/.ssh/arm_key ubuntu@$WEB_IP "
  sudo mv /tmp/ssl_key.pem /etc/apache2/ssl/key.pem
  sudo mv /tmp/cert.pem /etc/apache2/ssl/cert.pem
  sudo chmod 600 /etc/apache2/ssl/key.pem
  sudo apachectl configtest && sudo systemctl reload apache2
"
```

---

## Korak 7 – Inicijalni deploy aplikacije

```bash
WEB_IP=$(terraform output -raw web_public_ip)

# Kopiraj kod na EC2
rsync -av -e "ssh -i ~/.ssh/arm_key" \
  --exclude='.git' --exclude='node_modules' --exclude='terraform' \
  ./ ubuntu@$WEB_IP:/opt/app/

# Pokren deploy
ssh -i ~/.ssh/arm_key ubuntu@$WEB_IP "sudo /opt/deploy.sh"
```

---

## Korak 8 – Verifikacija GitLab Runner-a

```bash
ssh -i ~/.ssh/arm_key ubuntu@$WEB_IP "sudo gitlab-runner list"
```

Ako runner nije registriran:
```bash
ssh -i ~/.ssh/arm_key ubuntu@$WEB_IP "sudo /opt/register-runner.sh"
```

---

## Korak 9 – DNS konfiguracija (Windows Server)

Na Windows Server-u, u DNS Manager-u:

1. Kreiraj novu **Forward Lookup Zone**: `arm.com`
2. Dodaj **A record**: `scenario` → `[WEB_IP iz Terraform outputa]`
3. Dodaj **A record**: `www.scenario` → isti IP
4. Testiranje s Windows klijenta:
```
nslookup scenario.arm.com
ping scenario.arm.com
```

---

## Korak 10 – Test kontinuiranog deployementa

1. Napravi izmjenu u kodu (npr. promijeni tekst u `html/writing.html`)
2. Commituj i pušuj na GitLab:
```bash
git add .
git commit -m "Test CI/CD deploy"
git push gitlab main
```
3. U GitLab → CI/CD → Pipelines prati pipeline
4. Nakon što pipeline prođe, provjeri promjene na `https://scenario.arm.com`

---

## Struktura fajlova

```
ScenarioProject/
├── terraform/
│   ├── main.tf              # Glavna Terraform konfiguracija
│   ├── variables.tf         # Varijable
│   ├── outputs.tf           # Output vrijednosti
│   ├── terraform.tfvars     # Tvoje vrijednosti (NIJE u gitu!)
│   ├── userdata.sh          # EC2 setup skripta (web server)
│   └── userdata-db.sh       # EC2 setup skripta (DB server)
├── Dockerfile               # Docker image za Node.js app
├── docker-compose.yml       # Docker Compose za pokretanje app-a
├── .gitlab-ci.yml           # GitLab CI/CD pipeline
├── baza.js                  # DB konekcija (čita env varijable)
└── server.js                # Express server
```

---

## Uobičajeni problemi

### Problem: Terraform apply greška – "InvalidAMIID"
**Rješenje**: Provjeri AMI ID za tvoj region u `terraform.tfvars`.

### Problem: Apache vraća 502 Bad Gateway
**Rješenje**: App kontejner možda još nije pokrenut. Provjeri:
```bash
ssh -i ~/.ssh/arm_key ubuntu@$WEB_IP "docker ps && docker logs arm-app"
```

### Problem: GitLab Runner ne pokreće pipeline
**Rješenje**: Provjeri da je runner registriran i aktivan:
```bash
ssh -i ~/.ssh/arm_key ubuntu@$WEB_IP "sudo gitlab-runner verify"
```

### Problem: SSL certifikat ne radi
**Rješenje**: Provjeri da su fajlovi na pravim putanjama:
```bash
ssh -i ~/.ssh/arm_key ubuntu@$WEB_IP "ls -la /etc/apache2/ssl/"
sudo apachectl configtest
```
