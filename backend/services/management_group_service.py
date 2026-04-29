"""
Management Group discovery — walks the MG hierarchy to resolve subscription scope.

The tenant root group is fetched with recurse=True, giving the full tree in
one API call. The result is a flat list of MG nodes with parent/child references
so the frontend can render the tree and resolve subscriptions for any selected node.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional


def _walk_children(children, parent_id: str, nodes: List[Dict]) -> None:
    """Recursively walk ManagementGroupChildInfo objects and append to nodes."""
    for child in children or []:
        child_type = (child.type or "").lower()
        is_subscription = "/subscriptions" in child_type

        if is_subscription:
            # Subscriptions are leaves — they live inside parent MG's subscription list
            # and are already collected by the caller; skip adding a separate node
            continue

        # It's a management group — build its node
        sub_children = []
        mg_child_ids = []

        for grandchild in child.children or []:
            gc_type = (grandchild.type or "").lower()
            if "/subscriptions" in gc_type:
                sub_children.append({
                    "subscription_id": grandchild.name,
                    "display_name": grandchild.display_name or grandchild.name,
                })
            else:
                mg_child_ids.append(grandchild.name)

        nodes.append({
            "id": child.name,
            "display_name": child.display_name or child.name,
            "parent_id": parent_id,
            "child_mg_ids": mg_child_ids,
            "subscriptions": sub_children,
        })

        # Recurse into grandchildren
        _walk_children(child.children or [], child.name, nodes)


def discover_management_groups(auth_method: Optional[str] = None) -> Dict[str, Any]:
    """
    Return the full management group hierarchy the credential can see.

    Makes 2 API calls:
      1. Tenant list (to find the tenant root MG ID if not in settings)
      2. management_groups.get(tenant_id, expand=children, recurse=True)

    Returns:
      {
        "management_groups": [
          {
            "id": str,
            "display_name": str,
            "parent_id": str | null,
            "child_mg_ids": [str],
            "subscriptions": [{"subscription_id": str, "display_name": str}]
          }
        ],
        "tenant_root_id": str
      }
    """
    from azure.mgmt.managementgroups import ManagementGroupsAPI
    from azure.mgmt.subscription import SubscriptionClient
    from services.azure_auth import get_credential

    if auth_method == "az_login":
        from azure.identity import AzureCliCredential
        cred = AzureCliCredential()
    else:
        cred = get_credential()

    # Resolve tenant ID from settings first, fall back to tenant list
    from services import settings_service
    tenant_id = settings_service.get_value("AZURE_TENANT_ID", "").strip()
    if not tenant_id:
        tenants = list(SubscriptionClient(cred).tenants.list())
        if not tenants:
            raise EnvironmentError("Could not determine tenant ID — ensure credentials have Tenant Reader access.")
        tenant_id = tenants[0].tenant_id

    mg_client = ManagementGroupsAPI(cred)

    # Single call: full recursive tree rooted at the tenant root group
    root = mg_client.management_groups.get(
        group_id=tenant_id,
        expand="children",
        recurse=True,
    )

    # Build root node
    root_sub_children = []
    root_mg_child_ids = []
    for child in root.children or []:
        child_type = (child.type or "").lower()
        if "/subscriptions" in child_type:
            root_sub_children.append({
                "subscription_id": child.name,
                "display_name": child.display_name or child.name,
            })
        else:
            root_mg_child_ids.append(child.name)

    nodes: List[Dict] = [{
        "id": tenant_id,
        "display_name": root.display_name or "Tenant Root Group",
        "parent_id": None,
        "child_mg_ids": root_mg_child_ids,
        "subscriptions": root_sub_children,
    }]

    # Walk the rest of the tree
    _walk_children(root.children or [], tenant_id, nodes)

    return {
        "management_groups": nodes,
        "tenant_root_id": tenant_id,
    }


def get_subscriptions_under(mg_id: str, management_groups: List[Dict]) -> List[str]:
    """
    Resolve all subscription IDs under a given management group (recursively).
    Works entirely client-side from the already-fetched tree data.
    """
    by_id = {mg["id"]: mg for mg in management_groups}
    result: List[str] = []
    visited: set = set()
    queue = [mg_id]

    while queue:
        current = queue.pop(0)
        if current in visited:
            continue
        visited.add(current)
        node = by_id.get(current)
        if not node:
            continue
        result.extend(s["subscription_id"] for s in node["subscriptions"])
        queue.extend(node["child_mg_ids"])

    return list(dict.fromkeys(result))  # deduplicate, preserve order
