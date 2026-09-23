terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 5.0"
    }
  }
}

provider "azurerm" {
  features {}
}

module "app-service-postgresql" {
  source = "../../modules/app-service-postgresql"

  name_prefix = "locally-example-postgresql"
  location    = "berlin"
  tags = {
    ProvisionedVia = "Terraform"
  }
}
