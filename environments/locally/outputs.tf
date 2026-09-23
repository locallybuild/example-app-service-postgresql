output "application_url" {
  description = "Where to reach the application in a browser."
  value       = module.app-service-postgresql.application_url
}

output "postgresql_fqdn" {
  description = "The PostgreSQL Flexible Server hostname the application connects to."
  value       = module.app-service-postgresql.postgresql_fqdn
}
