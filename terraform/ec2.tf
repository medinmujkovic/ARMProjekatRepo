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

resource "aws_launch_template" "armprojekat_launch_template" {
  name_prefix            = "armprojekat_launch_template"
  image_id               = data.aws_ami.ubuntu.id
  instance_type          = "t2.micro"
  key_name               = aws_key_pair.armprojekat_ec2_access_key.key_name
  vpc_security_group_ids = [aws_security_group.armprojekat_security_group.id]
  update_default_version = true

  user_data = base64encode(templatefile("./templates/user_data.tpl", {
    cluster_name = aws_ecs_cluster.armprojekat_ecs_cluster.name
  }))

  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      delete_on_termination = true
      encrypted             = true
      kms_key_id            = aws_kms_key.ebs_encryption_key.arn
      volume_size           = 30
    }
  }

  iam_instance_profile {
    name = data.aws_iam_instance_profile.lab_instance_profile.name
  }

  depends_on = [aws_kms_key.ebs_encryption_key]

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "armprojekat_PublicServer"
  }
}

resource "aws_autoscaling_group" "armprojekat_autoscaling_group" {
  name_prefix             = "armprojekat_autoscaling_group"
  max_size                = 2
  min_size                = 1
  vpc_zone_identifier     = [aws_subnet.armprojekat_subnet_public.id]
  wait_for_capacity_timeout = "2m"

  launch_template {
    id      = aws_launch_template.armprojekat_launch_template.id
    version = "$Latest"
  }

  tag {
    key                 = "Name"
    value               = "armprojekat_PublicServer"
    propagate_at_launch = true
  }

  depends_on = [aws_launch_template.armprojekat_launch_template]
}

resource "aws_instance" "armprojekat_server_private" {
  ami                    = data.aws_ami.ubuntu.id
  iam_instance_profile   = data.aws_iam_instance_profile.lab_instance_profile.name
  instance_type          = "t2.micro"
  vpc_security_group_ids = [aws_security_group.armprojekat_security_group.id]
  subnet_id              = aws_subnet.armprojekat_subnet_private.id
  key_name = aws_key_pair.armprojekat_ec2_access_key.key_name

  user_data_base64 = base64encode(templatefile("./templates/user_data.tpl", {
    cluster_name = aws_ecs_cluster.armprojekat_ecs_cluster.name
  }))

  root_block_device {
    encrypted  = true
    kms_key_id = aws_kms_key.ebs_encryption_key.arn
  }

  tags = {
    Name = "armprojekat_PrivateServer"
  }
}