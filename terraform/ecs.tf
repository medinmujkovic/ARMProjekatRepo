resource "aws_ecs_cluster" "armprojekat_ecs_cluster" {
  name = "armprojekat_ecs_cluster"

  setting {
    name  = "containerInsights"
    value = "disabled"
  }
}

resource "aws_ecs_task_definition" "armprojekat_frontend_task" {
  family = "armprojekat-frontend-task"
  requires_compatibilities = ["EC2"]
  execution_role_arn       = data.aws_iam_role.lab_role.arn
  task_role_arn            = data.aws_iam_role.lab_role.arn

  container_definitions = jsonencode([
    {
      name        = "armprojekat-frontend-task"
      image       = "nginx:latest"
      cpu         = 256
      memory      = 512
      essential   = true
      command     = []
      entryPoint  = []
      mountPoints = []
      volumesFrom = []
      environment = [
        {
          name  = "MYSQL_DB"
          value = aws_instance.armprojekat_server_private.private_dns
        }
      ]
      portMappings = [
        {
          containerPort = 80
          hostPort      = 80
          protocol      = "tcp"
        },
	{
	  containerPort = 443
	  hostPort = 443
	  protocol = "tcp"
	}
      ]
    }
  ])

  placement_constraints {
    type       = "memberOf"
    expression = "attribute:ecs.subnet-id in [${aws_subnet.armprojekat_subnet_public.id}]"
  }
}

resource "aws_ecs_service" "armprojekat_frontend_service" {
  name                               = "armprojekat-frontend-service"
  cluster                            = aws_ecs_cluster.armprojekat_ecs_cluster.id
  task_definition                    = aws_ecs_task_definition.armprojekat_frontend_task.arn
  desired_count                      = 1
  deployment_maximum_percent         = 100
  deployment_minimum_healthy_percent = 0
}

resource "aws_ecs_task_definition" "armprojekat_database_task" {
  family = "armprojekat-database-task"
  requires_compatibilities = ["EC2"]
  execution_role_arn       = data.aws_iam_role.lab_role.arn
  task_role_arn            = data.aws_iam_role.lab_role.arn

  container_definitions = jsonencode([
    {
      name        = "armprojekat-database"
      image       = "mysql"
      cpu         = 256
      memory      = 512
      essential   = true
      command     = []
      entryPoint  = []
      mountPoints = []
      volumesFrom = []
      environment = [
        {
          name  = "MYSQL_DATABASE"
          value = "DBWT19"
        },
        {
          name  = "MYSQL_ROOT_PASSWORD"
          value = "root"
        }
      ]
      healthCheck = {
        command  = ["CMD-SHELL", "mysqladmin ping -h localhost"]
        interval = 30
        retries  = 10
        timeout  = 20
      }
      portMappings = [
        {
          containerPort = 3306
          hostPort      = 3306
          protocol      = "tcp"
        }
      ]
    }
  ])

  placement_constraints {
    type       = "memberOf"
    expression = "attribute:ecs.subnet-id in [${aws_subnet.armprojekat_subnet_private.id}]"
  }
}

resource "aws_ecs_service" "armprojekat_database_service" {
  name                               = "armprojekat-database-service"
  cluster                            = aws_ecs_cluster.armprojekat_ecs_cluster.id
  task_definition                    = aws_ecs_task_definition.armprojekat_database_task.arn
  desired_count                      = 1
  deployment_maximum_percent         = 100
  deployment_minimum_healthy_percent = 0
}