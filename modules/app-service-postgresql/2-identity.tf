# ---------------------------------------------------------------------------
# User-Assigned Managed Identity - the identity the app authenticates as.
#
# A user-assigned identity exists independently of the web app, so it can be
# made the PostgreSQL Entra administrator *before* the web app is created - the
# app's first connection at cold start doesn't race a grant that lands later.
# ---------------------------------------------------------------------------
resource "azurerm_user_assigned_identity" "main" {
  name                = "${var.name_prefix}-id"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  tags                = var.tags
}

# The tenant the identity lives in, needed to register it as the PostgreSQL
# Entra administrator.
data "azurerm_client_config" "current" {}
