variable "aws_region" {
  type        = string
  description = "AWS Region"
}

variable "vpc_cidr" {
  type        = string
  description = "VPC CIDR Block"
}

variable "private_subnet" {
  type        = string
  description = "Private subnet"
}

variable "public_subnet" {
  type        = string
  description = "Public subnet"
}

variable "user_source_ip" {
  type        = string
  description = "User's source IP used for security group whitelist"
}

variable "ssh_pubkey" {
  type        = string
  description = "SSH public key used to access EC2 instances"
}

# ─── NOVE VARIJABLE ZA BAZU I GITLAB (DODATO) ──────────────────────────────────

variable "db_name" {
  type        = string
  description = "Naziv baze podataka za aplikaciju"
  default     = "sudski_sistem"
}

variable "db_user" {
  type        = string
  description = "Korisnicko ime za pristup bazi podataka"
  default     = "arm_user"
}

variable "db_password" {
  type        = string
  description = "Lozinka za bazu podataka"
  sensitive   = true
}

variable "gitlab_token" {
  type        = string
  description = "GitLab Registration Token za Runner"
  sensitive   = true
}