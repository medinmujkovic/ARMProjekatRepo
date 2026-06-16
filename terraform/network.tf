resource "aws_vpc" "armprojekat_vpc" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true

  tags = {
    Name = "armprojekat_vpc"
  }
}

resource "aws_subnet" "armprojekat_subnet_private" {
  vpc_id     = aws_vpc.armprojekat_vpc.id
  cidr_block = var.private_subnet

  tags = {
    Name = "armprojekat_subnet_private"
  }
}

resource "aws_subnet" "armprojekat_subnet_public" {
  vpc_id                  = aws_vpc.armprojekat_vpc.id
  cidr_block              = var.public_subnet
  map_public_ip_on_launch = true

  tags = {
    Name = "armprojekat_subnet_public"
  }
}

resource "aws_internet_gateway" "armprojekat_igw" {
  vpc_id = aws_vpc.armprojekat_vpc.id
}

resource "aws_route_table" "armprojekat_public_rt" {
  vpc_id = aws_vpc.armprojekat_vpc.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.armprojekat_igw.id
  }
}

resource "aws_route_table_association" "armprojekat_rt_public_subnet" {
  subnet_id      = aws_subnet.armprojekat_subnet_public.id
  route_table_id = aws_route_table.armprojekat_public_rt.id
}

resource "aws_eip" "armprojekat_eip" {
  vpc = true
}

resource "aws_nat_gateway" "armprojekat_nat_gateway" {
  allocation_id = aws_eip.armprojekat_eip.id
  subnet_id      = aws_subnet.armprojekat_subnet_public.id

  depends_on = [
    aws_internet_gateway.armprojekat_igw
  ]
}

resource "aws_route_table" "armprojekat_private_rt" {
  vpc_id = aws_vpc.armprojekat_vpc.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.armprojekat_nat_gateway.id
  }
}

resource "aws_route_table_association" "armprojekat_rt_private_subnet" {
  subnet_id      = aws_subnet.armprojekat_subnet_private.id
  route_table_id = aws_route_table.armprojekat_private_rt.id
}

resource "aws_security_group" "armprojekat_security_group" {
  name        = "armprojekat_security_group"
  description = "Security group for armprojekat EC2 instance"
  vpc_id      = aws_vpc.armprojekat_vpc.id

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow SSH ingress from anywhere to prevent timeout"
  }

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow HTTP ingress"
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow HTTPS ingress"
  }

  ingress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    self        = true
    description = "Allow traffic within security group"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound traffic for updates and installations"
  }
}