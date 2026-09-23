output "application_url" {
  description = "Where to reach the application in a browser."
  value       = "https://${azurerm_linux_web_app.main.default_hostname}"
}

output "resource_group" {
  description = "The resource group containing the deployed resources."
  value       = azurerm_resource_group.main.name
}

output "postgresql_fqdn" {
  description = "The PostgreSQL Flexible Server hostname the application connects to."
  value       = azurerm_postgresql_flexible_server.main.fqdn
}
