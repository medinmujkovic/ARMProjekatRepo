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
  owners = ["099720109477"]
}

resource "aws_instance" "armprojekat_server_private" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = "t2.micro"
  subnet_id              = aws_subnet.armprojekat_subnet_private.id
  vpc_security_group_ids = [aws_security_group.armprojekat_security_group.id]
  key_name               = aws_key_pair.armprojekat_ec2_access_key.key_name
  iam_instance_profile   = data.aws_iam_instance_profile.lab_instance_profile.name

  user_data = templatefile("${path.module}/userdata-db.sh", {
    DB_NAME     = var.db_name
    DB_USER     = var.db_user
    DB_PASSWORD = var.db_password
  })

  root_block_device {
    volume_size = 8
    encrypted   = true
    kms_key_id  = aws_kms_key.ebs_encryption_key.arn
  }

  tags = {
    Name = "armprojekat_PrivateServer"
  }
}

resource "aws_instance" "armprojekat_server_public" {
  ami                         = data.aws_ami.ubuntu.id
  instance_type               = "t2.micro"
  subnet_id                   = aws_subnet.armprojekat_subnet_public.id
  vpc_security_group_ids      = [aws_security_group.armprojekat_security_group.id]
  key_name                    = aws_key_pair.armprojekat_ec2_access_key.key_name
  iam_instance_profile        = data.aws_iam_instance_profile.lab_instance_profile.name
  associate_public_ip_address = true

  user_data = templatefile("${path.module}/userdata.sh", {
    db_host      = aws_instance.armprojekat_server_private.private_ip
    DB_NAME     = var.db_name
    DB_USER     = var.db_user
    DB_PASSWORD = var.db_password
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

output "public_ip" {
  value       = aws_instance.armprojekat_server_public.public_ip
  description = "Javna IP adresa tvog Web Servera. Unesi je u Windows Server DNS!"
}