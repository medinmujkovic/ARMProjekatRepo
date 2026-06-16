# 1. Pronalaženje najnovijeg Ubuntu AMI-ja
data "aws_ami" "ubuntu" {
  most_recent = true
  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }
  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
  owners = ["099720109477"] # Canonical
}

# 2. PRIVATNI SERVER: MySQL Baza Podataka
resource "aws_instance" "armprojekat_server_private" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = "t2.micro"
  subnet_id              = aws_subnet.armprojekat_subnet_private.id
  vpc_security_group_ids = [aws_security_group.armprojekat_security_group.id]
  key_name               = aws_key_pair.armprojekat_ec2_access_key.key_name
  iam_instance_profile   = data.aws_iam_instance_profile.lab_instance_profile.name

  # Korištenje base64encode da izbjegnemo greške pri parsiranju
  user_data = base64encode(<<-EOF
#!/bin/bash
echo "Povezivanje baze: ${var.db_name}"
HTTPS_VAR="neki_tekst"
echo $HTTPS_VAR
EOF
  )

  root_block_device {
    volume_size = 8
    encrypted   = true
    kms_key_id  = aws_kms_key.ebs_encryption_key.arn
  }

  tags = {
    Name = "armprojekat_PrivateServer"
  }
}

# 3. JAVNI SERVER: Apache Web Server + Node.js App + GitLab Runner
resource "aws_instance" "armprojekat_server_public" {
  ami                         = data.aws_ami.ubuntu.id
  instance_type               = "t2.micro"
  subnet_id                   = aws_subnet.armprojekat_subnet_public.id
  vpc_security_group_ids      = [aws_security_group.armprojekat_security_group.id]
  key_name                    = aws_key_pair.armprojekat_ec2_access_key.key_name
  iam_instance_profile        = data.aws_iam_instance_profile.lab_instance_profile.name
  associate_public_ip_address = true

  # Pokretanje userdata.sh skripte
  user_data = templatefile("${path.module}/userdata.sh", {
    db_host      = aws_instance.armprojekat_server_private.private_ip
    db_name      = var.db_name
    db_user      = var.db_user
    db_password  = var.db_password
    domain_name  = "local.arm.com"
    gitlab_token = var.gitlab_token
  })

  root_block_device {
    volume_size = 30
    encrypted   = true
    kms_key_id  = aws_kms_key.ebs_encryption_key.arn
  }

  tags = {
    Name = "armprojekat_PublicServer"
  }
}

# 4. IZLAZNI PODATAK
output "public_ip" {
  value       = aws_instance.armprojekat_server_public.public_ip
  description = "Javna IP adresa tvog Web Servera. Unesi je u Windows Server DNS!"
}