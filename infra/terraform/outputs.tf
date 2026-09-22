output "instance_public_ip" {
  description = "The public IP address of the EC2 instance"
  value       = aws_instance.qforge_api.public_ip
}

output "instance_id" {
  description = "The ID of the EC2 instance"
  value       = aws_instance.qforge_api.id
}

output "ssh_command" {
  description = "Command to SSH into the instance"
  value       = "ssh -i ~/.ssh/${var.key_name}.pem ubuntu@${aws_instance.qforge_api.public_ip}"
}
