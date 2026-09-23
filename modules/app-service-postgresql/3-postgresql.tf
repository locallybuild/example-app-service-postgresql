# ---------------------------------------------------------------------------
# Azure Database for PostgreSQL Flexible Server - the backing store for the
# Notes app.
#
# The server requires an administrator login, so Terraform generates a random
# password for it. The app never uses either: it signs in with its managed
# identity's Entra access token instead (see the Entra administrator below).
# Entra authentication is enabled alongside password auth.
# ---------------------------------------------------------------------------
resource "random_password" "pg_admin" {
  length           = 24
  special          = true
  override_special = "!#%*-_"
}

resource "azurerm_postgresql_flexible_server" "main" {
  name                   = "${var.name_prefix}-pg"
  resource_group_name    = azurerm_resource_group.main.name
  location               = azurerm_resource_group.main.location
  version                = "16"
  sku_name               = "B_Standard_B1ms"
  storage_mb             = 32768
  administrator_login    = "pgadmin"
  administrator_password = random_password.pg_admin.result
  tags                   = var.tags

  authentication {
    active_directory_auth_enabled = true
    password_auth_enabled         = true
    tenant_id                     = data.azurerm_client_config.current.tenant_id
  }
}

# ---------------------------------------------------------------------------
# Entra administrator - makes the app's managed identity the server's admin.
#
# The identity's name becomes its PostgreSQL login (the app's PGUSER), and the
# app presents an Entra access token for it in place of a password.
# ---------------------------------------------------------------------------
resource "azurerm_postgresql_flexible_server_active_directory_administrator" "app" {
  server_name         = azurerm_postgresql_flexible_server.main.name
  resource_group_name = azurerm_resource_group.main.name
  tenant_id           = data.azurerm_client_config.current.tenant_id
  object_id           = azurerm_user_assigned_identity.main.principal_id
  principal_name      = azurerm_user_assigned_identity.main.name
  principal_type      = "ServicePrincipal"
}

resource "azurerm_postgresql_flexible_server_database" "notes" {
  name      = "notes"
  server_id = azurerm_postgresql_flexible_server.main.id
}
