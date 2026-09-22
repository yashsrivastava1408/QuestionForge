variable "aws_region" {
  description = "The AWS region to deploy to"
  type        = string
  default     = "ap-south-1"
}

variable "instance_type" {
  description = "The EC2 instance type"
  type        = string
  default     = "t3.small"
}

variable "key_name" {
  description = "The name of the SSH Key Pair to use for the EC2 instance"
  type        = string
  default     = "launch-wizard-2"
}
