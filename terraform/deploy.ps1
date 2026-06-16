terraform apply -replace="aws_instance.armprojekat_server_public" -auto-approve

$public_ip = (terraform output -raw public_ip).Trim()

Start-Sleep -Seconds 45

scp -o StrictHostKeyChecking=no -i ./armprojekat_ec2_access_key.pem -r ./ssl ubuntu@${public_ip}:/home/ubuntu/

ssh -o StrictHostKeyChecking=no -i ./armprojekat_ec2_access_key.pem ubuntu@${public_ip}

sudo tail -f /var/log/cloud-init-output.log