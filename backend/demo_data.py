"""
Realistic demo dataset — no Azure connection required.
Showcases all dashboard features: scores, trends, orphans,
Advisor recs, AI analysis, sparklines, carbon, right-sizing, tag compliance.
"""
from __future__ import annotations

import math
import random
from datetime import datetime, timedelta, timezone

random.seed(42)

def _sparkline(base: float, trend: str, days: int = 30) -> list[float]:
    vals = []
    v = base / 30
    for i in range(days):
        noise = random.uniform(0.85, 1.15)
        if trend == "rising":   v *= 1.015
        elif trend == "falling":v *= 0.985
        elif trend == "idle":   v  = max(0, v * 0.97)
        vals.append(round(v * noise, 4))
    return vals

DEMO_RESOURCES = [
    # ─── CRITICAL ───────────────────────────────────────────────────────────
    {
        "resource_id":   "/subscriptions/demo/resourceGroups/prod-rg/providers/Microsoft.Compute/virtualMachines/prod-legacy-vm",
        "resource_name": "prod-legacy-vm",
        "resource_type": "microsoft.compute/virtualmachines",
        "resource_group":"prod-rg",
        "location":      "eastus",
        "sku":           "Standard_D16s_v3",
        "cost_current_month":  487.20, "cost_previous_month": 491.00, "cost_delta_pct": -0.8,
        "avg_cpu_pct": 2.1, "avg_memory_pct": 11.0, "avg_disk_pct": 3.0, "avg_network_pct": 1.5,
        "primary_utilization_pct": 4.4,
        "has_any_activity": False, "base_score": 8.0, "advisor_score_delta": -20,
        "trend_modifier": -20, "ai_score_adjustment": -15, "final_score": 5.0,
        "score_label": "Not Used", "trend": "idle",
        "advisor_recommendations": [{"category":"cost","impact":"High","short_description":"Shut down or resize underutilized VM","score_impact":-20,"potential_savings":389.76}],
        "ai_confidence":"high","ai_action":"downsize","ai_explanation":"VM has averaged 2.1% CPU over 30 days with no traffic. Strongly recommend resizing to Standard_D4s_v3 or enabling auto-shutdown.",
        "estimated_monthly_savings": 389.76, "recommendation":"Downsize to Standard_D4s_v3",
        "is_orphan":False, "orphan_reason":None,
        "last_active_date":"2026-02-28","days_since_active":26,"activity_log_count":1,"idle_confirmed":False,
        "rightsize_sku":"Standard_D4s_v3","rightsize_savings_pct":75.0,
        "ri_1yr_monthly_savings":0.0,"missing_tags":["owner","cost-center"],
        "carbon_kg_per_month":68.1,"portal_url":"https://portal.azure.com/#resource/subscriptions/demo/resourceGroups/prod-rg/providers/Microsoft.Compute/virtualMachines/prod-legacy-vm",
        "is_anomaly":False,"daily_costs":_sparkline(487.20,"stable"),"cost_7d_trend_pct":-2.1,
        "tags":{"env":"prod"},"cli_delete_cmd":"az vm deallocate --resource-group prod-rg --name prod-legacy-vm",
        "cli_resize_cmd":"az vm resize --resource-group prod-rg --name prod-legacy-vm --size Standard_D4s_v3",
    },
    {
        "resource_id":   "/subscriptions/demo/resourceGroups/data-rg/providers/Microsoft.Sql/servers/sql-srv/databases/analytics-db",
        "resource_name": "analytics-db",
        "resource_type": "microsoft.sql/servers/databases",
        "resource_group":"data-rg",
        "location":      "westeurope",
        "sku":           "P2",
        "cost_current_month":  930.00, "cost_previous_month": 930.00, "cost_delta_pct": 0.0,
        "avg_cpu_pct": 4.8, "avg_memory_pct": None, "avg_disk_pct": 9.0, "avg_network_pct": None,
        "primary_utilization_pct": 6.9,
        "has_any_activity": True, "base_score": 9.0, "advisor_score_delta": -20,
        "trend_modifier": 0, "ai_score_adjustment": -12, "final_score": 8.0,
        "score_label": "Not Used", "trend": "stable",
        "advisor_recommendations": [{"category":"cost","impact":"High","short_description":"Right-size premium SQL database","score_impact":-20,"potential_savings":697.50}],
        "ai_confidence":"high","ai_action":"downsize","ai_explanation":"P2 database running at <5% DTU. Downgrade to S3 tier saves ~75% with identical performance for this workload.",
        "estimated_monthly_savings": 697.50, "recommendation":"Downgrade to S3 service tier",
        "is_orphan":False, "orphan_reason":None,
        "last_active_date":"2026-03-20","days_since_active":6,"activity_log_count":3,"idle_confirmed":False,
        "rightsize_sku":"S3","rightsize_savings_pct":75.0,
        "ri_1yr_monthly_savings":325.5,"missing_tags":["owner","project"],
        "carbon_kg_per_month":18.4,"portal_url":"https://portal.azure.com/#resource/subscriptions/demo/resourceGroups/data-rg/providers/Microsoft.Sql/servers/sql-srv/databases/analytics-db",
        "is_anomaly":False,"daily_costs":_sparkline(930.00,"stable"),"cost_7d_trend_pct":0.0,
        "tags":{"env":"prod","team":"data"},"cli_delete_cmd":"","cli_resize_cmd":"az sql db update --resource-group data-rg --server sql-srv --name analytics-db --service-objective S3",
    },
    {
        "resource_id":   "/subscriptions/demo/resourceGroups/dev-rg/providers/Microsoft.Compute/virtualMachines/dev-buildserver",
        "resource_name": "dev-buildserver",
        "resource_type": "microsoft.compute/virtualmachines",
        "resource_group":"dev-rg",
        "location":      "eastus",
        "sku":           "Standard_E32s_v3",
        "cost_current_month":  1248.00, "cost_previous_month": 1248.00, "cost_delta_pct": 0.0,
        "avg_cpu_pct": 6.2, "avg_memory_pct": 18.0, "avg_disk_pct": 5.0, "avg_network_pct": 3.0,
        "primary_utilization_pct": 8.0,
        "has_any_activity": True, "base_score": 12.0, "advisor_score_delta": -20,
        "trend_modifier": 0, "ai_score_adjustment": -10, "final_score": 14.0,
        "score_label": "Not Used", "trend": "stable",
        "advisor_recommendations": [{"category":"cost","impact":"High","short_description":"VM severely underutilized","score_impact":-20,"potential_savings":936.0}],
        "ai_confidence":"high","ai_action":"downsize","ai_explanation":"Dev build server running 24/7 at 6% CPU. Auto-shutdown during nights/weekends would save ~65%. Resize to E8s_v3 for dev workloads.",
        "estimated_monthly_savings": 936.0, "recommendation":"Add auto-shutdown schedule + resize to Standard_E8s_v3",
        "is_orphan":False, "orphan_reason":None,
        "last_active_date":"2026-03-26","days_since_active":0,"activity_log_count":12,"idle_confirmed":False,
        "rightsize_sku":"Standard_E8s_v3","rightsize_savings_pct":75.0,
        "ri_1yr_monthly_savings":0.0,"missing_tags":["cost-center"],
        "carbon_kg_per_month":174.3,"portal_url":"https://portal.azure.com/#resource/subscriptions/demo/resourceGroups/dev-rg/providers/Microsoft.Compute/virtualMachines/dev-buildserver",
        "is_anomaly":False,"daily_costs":_sparkline(1248.00,"stable"),"cost_7d_trend_pct":0.1,
        "tags":{"env":"dev","owner":"platform-team"},"cli_delete_cmd":"","cli_resize_cmd":"az vm resize --resource-group dev-rg --name dev-buildserver --size Standard_E8s_v3",
    },
    # ─── WARNING ────────────────────────────────────────────────────────────
    {
        "resource_id":   "/subscriptions/demo/resourceGroups/prod-rg/providers/Microsoft.Web/sites/api-gateway",
        "resource_name": "api-gateway",
        "resource_type": "microsoft.web/sites",
        "resource_group":"prod-rg",
        "location":      "eastus",
        "sku":           "P3v3",
        "cost_current_month":  312.50, "cost_previous_month": 280.00, "cost_delta_pct": 11.6,
        "avg_cpu_pct": 18.0, "avg_memory_pct": 31.0, "avg_disk_pct": None, "avg_network_pct": 22.0,
        "primary_utilization_pct": 23.7,
        "has_any_activity": True, "base_score": 28.0, "advisor_score_delta": -6,
        "trend_modifier": 10, "ai_score_adjustment": -5, "final_score": 37.0,
        "score_label": "Rarely Used", "trend": "rising",
        "advisor_recommendations": [{"category":"performance","impact":"Low","short_description":"Consider enabling auto-scaling","score_impact":-6,"potential_savings":0}],
        "ai_confidence":"medium","ai_action":"monitor","ai_explanation":"Cost rising 11.6% MoM but utilization remains low. Investigate recent deployment changes before resizing.",
        "estimated_monthly_savings": 156.25, "recommendation":"Review auto-scaling policy; consider P2v3",
        "is_orphan":False, "orphan_reason":None,
        "last_active_date":"2026-03-26","days_since_active":0,"activity_log_count":28,"idle_confirmed":False,
        "rightsize_sku":"P2v3","rightsize_savings_pct":33.0,
        "ri_1yr_monthly_savings":109.4,"missing_tags":["cost-center"],
        "carbon_kg_per_month":3.1,"portal_url":"https://portal.azure.com/#resource/subscriptions/demo/resourceGroups/prod-rg/providers/Microsoft.Web/sites/api-gateway",
        "is_anomaly":True,"daily_costs":_sparkline(312.50,"rising"),"cost_7d_trend_pct":18.4,
        "tags":{"env":"prod","owner":"backend-team","project":"platform"},"cli_delete_cmd":"","cli_resize_cmd":"",
    },
    {
        "resource_id":   "/subscriptions/demo/resourceGroups/data-rg/providers/Microsoft.Cache/Redis/session-cache",
        "resource_name": "session-cache",
        "resource_type": "microsoft.cache/redis",
        "resource_group":"data-rg",
        "location":      "eastus",
        "sku":           "Premium/P3",
        "cost_current_month":  578.00, "cost_previous_month": 578.00, "cost_delta_pct": 0.0,
        "avg_cpu_pct": 12.0, "avg_memory_pct": 19.0, "avg_disk_pct": None, "avg_network_pct": None,
        "primary_utilization_pct": 15.5,
        "has_any_activity": True, "base_score": 22.0, "advisor_score_delta": -12,
        "trend_modifier": 0, "ai_score_adjustment": -5, "final_score": 42.0,
        "score_label": "Rarely Used", "trend": "stable",
        "advisor_recommendations": [{"category":"cost","impact":"Medium","short_description":"Downsize Redis cache to C2 Standard","score_impact":-12,"potential_savings":404.6}],
        "ai_confidence":"medium","ai_action":"downsize","ai_explanation":"Redis at 12% CPU and 19% memory. Premium P3 is 10× the needed capacity. Downsize to Standard C2.",
        "estimated_monthly_savings": 404.6, "recommendation":"Downsize to Standard C2",
        "is_orphan":False, "orphan_reason":None,
        "last_active_date":"2026-03-25","days_since_active":1,"activity_log_count":4,"idle_confirmed":False,
        "rightsize_sku":"Standard/C2","rightsize_savings_pct":70.0,
        "ri_1yr_monthly_savings":202.3,"missing_tags":["owner","project","cost-center"],
        "carbon_kg_per_month":17.2,"portal_url":"https://portal.azure.com/#resource/subscriptions/demo/resourceGroups/data-rg/providers/Microsoft.Cache/Redis/session-cache",
        "is_anomaly":False,"daily_costs":_sparkline(578.00,"stable"),"cost_7d_trend_pct":0.2,
        "tags":{"env":"prod"},"cli_delete_cmd":"","cli_resize_cmd":"",
    },
    {
        "resource_id":   "/subscriptions/demo/resourceGroups/net-rg/providers/Microsoft.Network/applicationGateways/app-gw-01",
        "resource_name": "app-gw-01",
        "resource_type": "microsoft.network/applicationgateways",
        "resource_group":"net-rg",
        "location":      "eastus",
        "sku":           "WAF_v2",
        "cost_current_month":  420.00, "cost_previous_month": 460.00, "cost_delta_pct": -8.7,
        "avg_cpu_pct": 22.0, "avg_memory_pct": None, "avg_disk_pct": None, "avg_network_pct": 28.0,
        "primary_utilization_pct": 25.0,
        "has_any_activity": True, "base_score": 32.0, "advisor_score_delta": 0,
        "trend_modifier": -10, "ai_score_adjustment": 0, "final_score": 45.0,
        "score_label": "Rarely Used", "trend": "falling",
        "advisor_recommendations": [],
        "ai_confidence":"low","ai_action":"monitor","ai_explanation":"Cost trending down while utilization is moderate. Worth monitoring for another month before action.",
        "estimated_monthly_savings": 210.0, "recommendation":"Evaluate autoscale settings — cost can be reduced by 50%",
        "is_orphan":False, "orphan_reason":None,
        "last_active_date":"2026-03-26","days_since_active":0,"activity_log_count":9,"idle_confirmed":False,
        "rightsize_sku":None,"rightsize_savings_pct":0,
        "ri_1yr_monthly_savings":147.0,"missing_tags":["owner"],
        "carbon_kg_per_month":7.3,"portal_url":"https://portal.azure.com/#resource/subscriptions/demo/resourceGroups/net-rg/providers/Microsoft.Network/applicationGateways/app-gw-01",
        "is_anomaly":False,"daily_costs":_sparkline(420.00,"falling"),"cost_7d_trend_pct":-12.1,
        "tags":{"env":"prod","project":"networking"},"cli_delete_cmd":"","cli_resize_cmd":"",
    },
    # ─── FAIR ───────────────────────────────────────────────────────────────
    {
        "resource_id":   "/subscriptions/demo/resourceGroups/prod-rg/providers/Microsoft.Compute/virtualMachines/prod-web-01",
        "resource_name": "prod-web-01",
        "resource_type": "microsoft.compute/virtualmachines",
        "resource_group":"prod-rg",
        "location":      "eastus",
        "sku":           "Standard_D4s_v3",
        "cost_current_month":  140.16, "cost_previous_month": 135.00, "cost_delta_pct": 3.8,
        "avg_cpu_pct": 41.0, "avg_memory_pct": 55.0, "avg_disk_pct": 28.0, "avg_network_pct": 35.0,
        "primary_utilization_pct": 39.8,
        "has_any_activity": True, "base_score": 53.0, "advisor_score_delta": 0,
        "trend_modifier": 0, "ai_score_adjustment": 0, "final_score": 58.0,
        "score_label": "Actively Used", "trend": "stable",
        "advisor_recommendations": [],
        "ai_confidence":"medium","ai_action":"reserve","ai_explanation":"Moderate utilization and stable cost. Good candidate for 1-year reserved instance to save ~35%.",
        "estimated_monthly_savings": 49.06, "recommendation":"Purchase 1-year Reserved Instance for ~35% savings",
        "is_orphan":False, "orphan_reason":None,
        "last_active_date":"2026-03-26","days_since_active":0,"activity_log_count":45,"idle_confirmed":False,
        "rightsize_sku":None,"rightsize_savings_pct":0,
        "ri_1yr_monthly_savings":49.06,"missing_tags":["cost-center"],
        "carbon_kg_per_month":26.3,"portal_url":"https://portal.azure.com/#resource/subscriptions/demo/resourceGroups/prod-rg/providers/Microsoft.Compute/virtualMachines/prod-web-01",
        "is_anomaly":False,"daily_costs":_sparkline(140.16,"stable"),"cost_7d_trend_pct":2.1,
        "tags":{"env":"prod","owner":"web-team","project":"storefront"},"cli_delete_cmd":"","cli_resize_cmd":"",
    },
    {
        "resource_id":   "/subscriptions/demo/resourceGroups/data-rg/providers/Microsoft.DocumentDB/databaseAccounts/cosmos-main",
        "resource_name": "cosmos-main",
        "resource_type": "microsoft.documentdb/databaseaccounts",
        "resource_group":"data-rg",
        "location":      "westeurope",
        "sku":           "Standard",
        "cost_current_month":  890.00, "cost_previous_month": 820.00, "cost_delta_pct": 8.5,
        "avg_cpu_pct": None, "avg_memory_pct": None, "avg_disk_pct": None, "avg_network_pct": None,
        "primary_utilization_pct": 48.0,
        "has_any_activity": True, "base_score": 55.0, "advisor_score_delta": -6,
        "trend_modifier": 0, "ai_score_adjustment": 5, "final_score": 64.0,
        "score_label": "Actively Used", "trend": "stable",
        "advisor_recommendations": [{"category":"cost","impact":"Low","short_description":"Review provisioned throughput (RUs)","score_impact":-6,"potential_savings":89.0}],
        "ai_confidence":"medium","ai_action":"monitor","ai_explanation":"RU consumption is moderate. Consider autoscale throughput to reduce costs during off-peak hours.",
        "estimated_monthly_savings": 89.0, "recommendation":"Enable autoscale on containers",
        "is_orphan":False, "orphan_reason":None,
        "last_active_date":"2026-03-26","days_since_active":0,"activity_log_count":18,"idle_confirmed":False,
        "rightsize_sku":None,"rightsize_savings_pct":0,
        "ri_1yr_monthly_savings":311.5,"missing_tags":["cost-center"],
        "carbon_kg_per_month":13.0,"portal_url":"https://portal.azure.com/#resource/subscriptions/demo/resourceGroups/data-rg/providers/Microsoft.DocumentDB/databaseAccounts/cosmos-main",
        "is_anomaly":False,"daily_costs":_sparkline(890.00,"rising"),"cost_7d_trend_pct":9.4,
        "tags":{"env":"prod","owner":"data-team","project":"analytics","cost-center":"cc-001"},"cli_delete_cmd":"","cli_resize_cmd":"",
    },
    {
        "resource_id":   "/subscriptions/demo/resourceGroups/prod-rg/providers/Microsoft.ContainerService/managedClusters/aks-prod",
        "resource_name": "aks-prod",
        "resource_type": "microsoft.containerservice/managedclusters",
        "resource_group":"prod-rg",
        "location":      "eastus",
        "sku":           "Standard",
        "cost_current_month":  1840.00, "cost_previous_month": 1780.00, "cost_delta_pct": 3.4,
        "avg_cpu_pct": 52.0, "avg_memory_pct": 68.0, "avg_disk_pct": None, "avg_network_pct": None,
        "primary_utilization_pct": 60.0,
        "has_any_activity": True, "base_score": 68.0, "advisor_score_delta": 0,
        "trend_modifier": 0, "ai_score_adjustment": 5, "final_score": 73.0,
        "score_label": "Actively Used", "trend": "stable",
        "advisor_recommendations": [],
        "ai_confidence":"medium","ai_action":"reserve","ai_explanation":"AKS cluster well-utilized. Consider reserved instances for the node pool VMs to reduce costs by ~35%.",
        "estimated_monthly_savings": 368.0, "recommendation":"Purchase Reserved Instances for node pool",
        "is_orphan":False, "orphan_reason":None,
        "last_active_date":"2026-03-26","days_since_active":0,"activity_log_count":62,"idle_confirmed":False,
        "rightsize_sku":None,"rightsize_savings_pct":0,
        "ri_1yr_monthly_savings":644.0,"missing_tags":["cost-center"],
        "carbon_kg_per_month":225.1,"portal_url":"https://portal.azure.com/#resource/subscriptions/demo/resourceGroups/prod-rg/providers/Microsoft.ContainerService/managedClusters/aks-prod",
        "is_anomaly":False,"daily_costs":_sparkline(1840.00,"stable"),"cost_7d_trend_pct":1.8,
        "tags":{"env":"prod","owner":"platform-team","project":"microservices","cost-center":"cc-002"},"cli_delete_cmd":"","cli_resize_cmd":"",
    },
    # ─── GOOD ────────────────────────────────────────────────────────────────
    {
        "resource_id":   "/subscriptions/demo/resourceGroups/prod-rg/providers/Microsoft.Compute/virtualMachines/prod-api-01",
        "resource_name": "prod-api-01",
        "resource_type": "microsoft.compute/virtualmachines",
        "resource_group":"prod-rg",
        "location":      "eastus",
        "sku":           "Standard_D8s_v3",
        "cost_current_month":  280.32, "cost_previous_month": 272.00, "cost_delta_pct": 3.1,
        "avg_cpu_pct": 74.0, "avg_memory_pct": 81.0, "avg_disk_pct": 55.0, "avg_network_pct": 62.0,
        "primary_utilization_pct": 68.0,
        "has_any_activity": True, "base_score": 80.0, "advisor_score_delta": 0,
        "trend_modifier": 0, "ai_score_adjustment": 0, "final_score": 82.0,
        "score_label": "Fully Used", "trend": "stable",
        "advisor_recommendations": [],
        "ai_confidence":"high","ai_action":"reserve","ai_explanation":"VM is well-utilized. Consider a 1-year reserved instance to reduce costs by 35% ($98/mo savings).",
        "estimated_monthly_savings": 98.11, "recommendation":"Purchase 1-year Reserved Instance",
        "is_orphan":False, "orphan_reason":None,
        "last_active_date":"2026-03-26","days_since_active":0,"activity_log_count":78,"idle_confirmed":False,
        "rightsize_sku":None,"rightsize_savings_pct":0,
        "ri_1yr_monthly_savings":98.11,"missing_tags":[],
        "carbon_kg_per_month":52.1,"portal_url":"https://portal.azure.com/#resource/subscriptions/demo/resourceGroups/prod-rg/providers/Microsoft.Compute/virtualMachines/prod-api-01",
        "is_anomaly":False,"daily_costs":_sparkline(280.32,"stable"),"cost_7d_trend_pct":1.2,
        "tags":{"env":"prod","owner":"backend-team","project":"api","cost-center":"cc-001"},"cli_delete_cmd":"","cli_resize_cmd":"",
    },
    {
        "resource_id":   "/subscriptions/demo/resourceGroups/prod-rg/providers/Microsoft.Sql/servers/sql-srv/databases/orders-db",
        "resource_name": "orders-db",
        "resource_type": "microsoft.sql/servers/databases",
        "resource_group":"prod-rg",
        "location":      "eastus",
        "sku":           "S3",
        "cost_current_month":  150.00, "cost_previous_month": 148.00, "cost_delta_pct": 1.4,
        "avg_cpu_pct": 68.0, "avg_memory_pct": None, "avg_disk_pct": 41.0, "avg_network_pct": None,
        "primary_utilization_pct": 54.5,
        "has_any_activity": True, "base_score": 76.0, "advisor_score_delta": 0,
        "trend_modifier": 0, "ai_score_adjustment": 0, "final_score": 80.0,
        "score_label": "Fully Used", "trend": "stable",
        "advisor_recommendations": [],
        "ai_confidence":"medium","ai_action":"none","ai_explanation":"Database running at healthy utilization levels. No action required.",
        "estimated_monthly_savings": 0.0, "recommendation":"Resource is well-utilised. No immediate action required.",
        "is_orphan":False, "orphan_reason":None,
        "last_active_date":"2026-03-26","days_since_active":0,"activity_log_count":91,"idle_confirmed":False,
        "rightsize_sku":None,"rightsize_savings_pct":0,
        "ri_1yr_monthly_savings":52.5,"missing_tags":[],
        "carbon_kg_per_month":9.2,"portal_url":"https://portal.azure.com/#resource/subscriptions/demo/resourceGroups/prod-rg/providers/Microsoft.Sql/servers/sql-srv/databases/orders-db",
        "is_anomaly":False,"daily_costs":_sparkline(150.00,"stable"),"cost_7d_trend_pct":0.4,
        "tags":{"env":"prod","owner":"backend-team","project":"ecommerce","cost-center":"cc-001"},"cli_delete_cmd":"","cli_resize_cmd":"",
    },
    # ─── ORPHANS ─────────────────────────────────────────────────────────────
    {
        "resource_id":   "/subscriptions/demo/resourceGroups/old-rg/providers/Microsoft.Compute/disks/leftover-disk-01",
        "resource_name": "leftover-disk-01",
        "resource_type": "microsoft.compute/disks",
        "resource_group":"old-rg",
        "location":      "eastus",
        "sku":           "Premium_LRS/P30",
        "cost_current_month":  18.60, "cost_previous_month": 18.60, "cost_delta_pct": 0.0,
        "avg_cpu_pct": None, "avg_memory_pct": None, "avg_disk_pct": 0.0, "avg_network_pct": None,
        "primary_utilization_pct": 0.0,
        "has_any_activity": False, "base_score": 5.0, "advisor_score_delta": 0,
        "trend_modifier": -20, "ai_score_adjustment": 0, "final_score": 5.0,
        "score_label": "Not Used", "trend": "idle",
        "advisor_recommendations": [],
        "ai_confidence":"high","ai_action":"delete","ai_explanation":"Disk has been unattached for 30+ days. Delete immediately to stop charges.",
        "estimated_monthly_savings": 18.60, "recommendation":"Delete orphaned disk to eliminate all costs.",
        "is_orphan":True, "orphan_reason":"Unattached disk (state: Unattached)",
        "last_active_date":None,"days_since_active":None,"activity_log_count":0,"idle_confirmed":True,
        "rightsize_sku":None,"rightsize_savings_pct":0,
        "ri_1yr_monthly_savings":0.0,"missing_tags":["owner","environment","project","cost-center"],
        "carbon_kg_per_month":0.5,"portal_url":"https://portal.azure.com/#resource/subscriptions/demo/resourceGroups/old-rg/providers/Microsoft.Compute/disks/leftover-disk-01",
        "is_anomaly":False,"daily_costs":_sparkline(18.60,"stable"),"cost_7d_trend_pct":0.0,
        "tags":{},"cli_delete_cmd":"az disk delete --resource-group old-rg --name leftover-disk-01 --yes","cli_resize_cmd":"",
    },
    {
        "resource_id":   "/subscriptions/demo/resourceGroups/old-rg/providers/Microsoft.Network/publicIPAddresses/unused-pip-01",
        "resource_name": "unused-pip-01",
        "resource_type": "microsoft.network/publicipaddresses",
        "resource_group":"old-rg",
        "location":      "eastus",
        "sku":           "Standard",
        "cost_current_month":  3.65, "cost_previous_month": 3.65, "cost_delta_pct": 0.0,
        "avg_cpu_pct": None, "avg_memory_pct": None, "avg_disk_pct": None, "avg_network_pct": 0.0,
        "primary_utilization_pct": 0.0,
        "has_any_activity": False, "base_score": 5.0, "advisor_score_delta": 0,
        "trend_modifier": -20, "ai_score_adjustment": 0, "final_score": 5.0,
        "score_label": "Not Used", "trend": "idle",
        "advisor_recommendations": [],
        "ai_confidence":"high","ai_action":"delete","ai_explanation":"Public IP not associated with any resource. Standard SKU IPs are charged even when idle.",
        "estimated_monthly_savings": 3.65, "recommendation":"Delete orphaned resource to eliminate all costs.",
        "is_orphan":True, "orphan_reason":"Public IP not assigned to any resource",
        "last_active_date":None,"days_since_active":None,"activity_log_count":0,"idle_confirmed":True,
        "rightsize_sku":None,"rightsize_savings_pct":0,
        "ri_1yr_monthly_savings":0.0,"missing_tags":["owner","environment","project","cost-center"],
        "carbon_kg_per_month":0.1,"portal_url":"https://portal.azure.com/#resource/subscriptions/demo/resourceGroups/old-rg/providers/Microsoft.Network/publicIPAddresses/unused-pip-01",
        "is_anomaly":False,"daily_costs":_sparkline(3.65,"stable"),"cost_7d_trend_pct":0.0,
        "tags":{},"cli_delete_cmd":"az network public-ip delete --resource-group old-rg --name unused-pip-01","cli_resize_cmd":"",
    },
    {
        "resource_id":   "/subscriptions/demo/resourceGroups/test-rg/providers/Microsoft.Compute/virtualMachines/test-vm-forgotten",
        "resource_name": "test-vm-forgotten",
        "resource_type": "microsoft.compute/virtualmachines",
        "resource_group":"test-rg",
        "location":      "eastus",
        "sku":           "Standard_D8s_v3",
        "cost_current_month":  62.40, "cost_previous_month": 280.32, "cost_delta_pct": -77.7,
        "avg_cpu_pct": 0.1, "avg_memory_pct": 2.0, "avg_disk_pct": 0.0, "avg_network_pct": 0.0,
        "primary_utilization_pct": 0.5,
        "has_any_activity": False, "base_score": 5.0, "advisor_score_delta": 0,
        "trend_modifier": -20, "ai_score_adjustment": 0, "final_score": 5.0,
        "score_label": "Not Used", "trend": "idle",
        "advisor_recommendations": [],
        "ai_confidence":"high","ai_action":"delete","ai_explanation":"VM is deallocated (still incurring disk and IP costs). Delete to eliminate remaining charges.",
        "estimated_monthly_savings": 62.40, "recommendation":"Delete orphaned resource to eliminate all costs.",
        "is_orphan":True, "orphan_reason":"VM is deallocated (still incurring disk/IP costs)",
        "last_active_date":"2026-02-01","days_since_active":53,"activity_log_count":0,"idle_confirmed":True,
        "rightsize_sku":None,"rightsize_savings_pct":0,
        "ri_1yr_monthly_savings":0.0,"missing_tags":["owner","environment","project","cost-center"],
        "carbon_kg_per_month":5.8,"portal_url":"https://portal.azure.com/#resource/subscriptions/demo/resourceGroups/test-rg/providers/Microsoft.Compute/virtualMachines/test-vm-forgotten",
        "is_anomaly":False,"daily_costs":_sparkline(62.40,"falling"),"cost_7d_trend_pct":-80.0,
        "tags":{},"cli_delete_cmd":"az vm delete --resource-group test-rg --name test-vm-forgotten --yes","cli_resize_cmd":"",
    },
    # ─── STORAGE ACCOUNTS ────────────────────────────────────────────────────
    {
        "resource_id":   "/subscriptions/demo/resourceGroups/data-rg/providers/Microsoft.Storage/storageAccounts/datalakeprod",
        "resource_name": "datalakeprod",
        "resource_type": "microsoft.storage/storageaccounts",
        "resource_group":"data-rg",
        "location":      "eastus",
        "sku":           "Standard_LRS",
        "cost_current_month":  420.00, "cost_previous_month": 390.00, "cost_delta_pct": 7.7,
        "avg_cpu_pct": None, "avg_memory_pct": None, "avg_disk_pct": 71.0, "avg_network_pct": 58.0,
        "primary_utilization_pct": 64.5,
        "has_any_activity": True, "base_score": 72.0, "advisor_score_delta": 0,
        "trend_modifier": 0, "ai_score_adjustment": 0, "final_score": 72.0,
        "score_label": "Actively Used", "trend": "stable",
        "advisor_recommendations": [],
        "ai_confidence":"medium","ai_action":"reserve","ai_explanation":"Storage well-utilized with growing data. Enable lifecycle management to move cold blobs to Cool tier.",
        "estimated_monthly_savings": 84.0, "recommendation":"Enable lifecycle management — move blobs >30d to Cool tier",
        "is_orphan":False, "orphan_reason":None,
        "last_active_date":"2026-03-26","days_since_active":0,"activity_log_count":33,"idle_confirmed":False,
        "rightsize_sku":None,"rightsize_savings_pct":0,
        "ri_1yr_monthly_savings":0.0,"missing_tags":["cost-center"],
        "carbon_kg_per_month":1.9,"portal_url":"https://portal.azure.com/#resource/subscriptions/demo/resourceGroups/data-rg/providers/Microsoft.Storage/storageAccounts/datalakeprod",
        "is_anomaly":False,"daily_costs":_sparkline(420.00,"rising"),"cost_7d_trend_pct":8.1,
        "tags":{"env":"prod","owner":"data-team","project":"datalake"},"cli_delete_cmd":"","cli_resize_cmd":"",
    },
    {
        "resource_id":   "/subscriptions/demo/resourceGroups/old-rg/providers/Microsoft.Storage/storageAccounts/archivestore2021",
        "resource_name": "archivestore2021",
        "resource_type": "microsoft.storage/storageaccounts",
        "resource_group":"old-rg",
        "location":      "eastus",
        "sku":           "Standard_LRS",
        "cost_current_month":  88.00, "cost_previous_month": 88.50, "cost_delta_pct": -0.6,
        "avg_cpu_pct": None, "avg_memory_pct": None, "avg_disk_pct": 8.0, "avg_network_pct": 0.5,
        "primary_utilization_pct": 4.3,
        "has_any_activity": False, "base_score": 8.0, "advisor_score_delta": -12,
        "trend_modifier": -20, "ai_score_adjustment": -10, "final_score": 5.0,
        "score_label": "Not Used", "trend": "idle",
        "advisor_recommendations": [{"category":"cost","impact":"Medium","short_description":"Move blobs to Archive tier","score_impact":-12,"potential_savings":70.4}],
        "ai_confidence":"high","ai_action":"downsize","ai_explanation":"Storage account with near-zero transaction activity. Move data to Archive tier or delete if no longer needed.",
        "estimated_monthly_savings": 70.4, "recommendation":"Move to Archive storage tier or delete",
        "is_orphan":False, "orphan_reason":None,
        "last_active_date":"2026-01-15","days_since_active":70,"activity_log_count":0,"idle_confirmed":True,
        "rightsize_sku":None,"rightsize_savings_pct":0,
        "ri_1yr_monthly_savings":0.0,"missing_tags":["owner","environment","project","cost-center"],
        "carbon_kg_per_month":0.4,"portal_url":"https://portal.azure.com/#resource/subscriptions/demo/resourceGroups/old-rg/providers/Microsoft.Storage/storageAccounts/archivestore2021",
        "is_anomaly":False,"daily_costs":_sparkline(88.00,"stable"),"cost_7d_trend_pct":-0.5,
        "tags":{},"cli_delete_cmd":"az storage account delete --resource-group old-rg --name archivestore2021 --yes","cli_resize_cmd":"",
    },
    # ─── FUNCTION APP ────────────────────────────────────────────────────────
    {
        "resource_id":   "/subscriptions/demo/resourceGroups/prod-rg/providers/Microsoft.Web/sites/event-processor-fn",
        "resource_name": "event-processor-fn",
        "resource_type": "microsoft.web/sites",
        "resource_group":"prod-rg",
        "location":      "eastus",
        "sku":           "EP1",
        "cost_current_month":  98.50, "cost_previous_month": 89.00, "cost_delta_pct": 10.7,
        "avg_cpu_pct": 31.0, "avg_memory_pct": 44.0, "avg_disk_pct": None, "avg_network_pct": 29.0,
        "primary_utilization_pct": 34.7,
        "has_any_activity": True, "base_score": 48.0, "advisor_score_delta": 0,
        "trend_modifier": 10, "ai_score_adjustment": 0, "final_score": 48.0,
        "score_label": "Rarely Used", "trend": "rising",
        "advisor_recommendations": [],
        "ai_confidence":"medium","ai_action":"monitor","ai_explanation":"Function app cost rising 10.7% MoM. Review invocation patterns — Consumption plan might be cheaper.",
        "estimated_monthly_savings": 49.25, "recommendation":"Evaluate Consumption vs Premium plan trade-off",
        "is_orphan":False, "orphan_reason":None,
        "last_active_date":"2026-03-26","days_since_active":0,"activity_log_count":22,"idle_confirmed":False,
        "rightsize_sku":None,"rightsize_savings_pct":0,
        "ri_1yr_monthly_savings":0.0,"missing_tags":["cost-center"],
        "carbon_kg_per_month":1.0,"portal_url":"https://portal.azure.com/#resource/subscriptions/demo/resourceGroups/prod-rg/providers/Microsoft.Web/sites/event-processor-fn",
        "is_anomaly":True,"daily_costs":_sparkline(98.50,"rising"),"cost_7d_trend_pct":15.3,
        "tags":{"env":"prod","owner":"backend-team","project":"events"},"cli_delete_cmd":"","cli_resize_cmd":"",
    },
    # ─── KEY VAULT ───────────────────────────────────────────────────────────
    {
        "resource_id":   "/subscriptions/demo/resourceGroups/shared-rg/providers/Microsoft.KeyVault/vaults/kv-shared-01",
        "resource_name": "kv-shared-01",
        "resource_type": "microsoft.keyvault/vaults",
        "resource_group":"shared-rg",
        "location":      "eastus",
        "sku":           "Standard",
        "cost_current_month":  4.20, "cost_previous_month": 4.15, "cost_delta_pct": 1.2,
        "avg_cpu_pct": None, "avg_memory_pct": None, "avg_disk_pct": None, "avg_network_pct": None,
        "primary_utilization_pct": 62.0,
        "has_any_activity": True, "base_score": 70.0, "advisor_score_delta": 0,
        "trend_modifier": 0, "ai_score_adjustment": 0, "final_score": 78.0,
        "score_label": "Fully Used", "trend": "stable",
        "advisor_recommendations": [],
        "ai_confidence":None,"ai_action":None,"ai_explanation":None,
        "estimated_monthly_savings": 0.0, "recommendation":"Resource is well-utilised. No immediate action required.",
        "is_orphan":False, "orphan_reason":None,
        "last_active_date":"2026-03-26","days_since_active":0,"activity_log_count":105,"idle_confirmed":False,
        "rightsize_sku":None,"rightsize_savings_pct":0,
        "ri_1yr_monthly_savings":0.0,"missing_tags":["cost-center"],
        "carbon_kg_per_month":0.1,"portal_url":"https://portal.azure.com/#resource/subscriptions/demo/resourceGroups/shared-rg/providers/Microsoft.KeyVault/vaults/kv-shared-01",
        "is_anomaly":False,"daily_costs":_sparkline(4.20,"stable"),"cost_7d_trend_pct":0.3,
        "tags":{"env":"prod","owner":"platform-team","project":"security"},"cli_delete_cmd":"","cli_resize_cmd":"",
    },
    # ─── EVENT HUB ───────────────────────────────────────────────────────────
    {
        "resource_id":   "/subscriptions/demo/resourceGroups/data-rg/providers/Microsoft.EventHub/namespaces/eh-ingestion",
        "resource_name": "eh-ingestion",
        "resource_type": "microsoft.eventhub/namespaces",
        "resource_group":"data-rg",
        "location":      "eastus",
        "sku":           "Standard",
        "cost_current_month":  210.00, "cost_previous_month": 185.00, "cost_delta_pct": 13.5,
        "avg_cpu_pct": None, "avg_memory_pct": None, "avg_disk_pct": None, "avg_network_pct": 78.0,
        "primary_utilization_pct": 78.0,
        "has_any_activity": True, "base_score": 85.0, "advisor_score_delta": 0,
        "trend_modifier": 10, "ai_score_adjustment": 0, "final_score": 88.0,
        "score_label": "Fully Used", "trend": "rising",
        "advisor_recommendations": [],
        "ai_confidence":None,"ai_action":None,"ai_explanation":None,
        "estimated_monthly_savings": 0.0, "recommendation":"Resource is well-utilised. No immediate action required.",
        "is_orphan":False, "orphan_reason":None,
        "last_active_date":"2026-03-26","days_since_active":0,"activity_log_count":41,"idle_confirmed":False,
        "rightsize_sku":None,"rightsize_savings_pct":0,
        "ri_1yr_monthly_savings":0.0,"missing_tags":["cost-center"],
        "carbon_kg_per_month":3.8,"portal_url":"https://portal.azure.com/#resource/subscriptions/demo/resourceGroups/data-rg/providers/Microsoft.EventHub/namespaces/eh-ingestion",
        "is_anomaly":True,"daily_costs":_sparkline(210.00,"rising"),"cost_7d_trend_pct":18.7,
        "tags":{"env":"prod","owner":"data-team","project":"streaming"},"cli_delete_cmd":"","cli_resize_cmd":"",
    },
]


def build_demo_dashboard():
    """Assemble the full DashboardData-compatible dict from demo resources."""
    from models.schemas import (
        DashboardData, KPIData, ScoreDistribution, ResourceTypeSummary,
        ResourceMetrics, OrphanResource, SavingsRecommendation,
        AdvisorRecommendation, ScoreLabel, TrendDirection, CostAnomaly,
        RightSizeOpportunity, AppSettings,
    )
    from datetime import datetime, timezone

    from main import _resource_category
    from services.scoring_service import is_infrastructure_resource, get_safe_action_steps

    resources = []
    for rd in DEMO_RESOURCES:
        advisor_recs = [AdvisorRecommendation(**a) for a in rd.get("advisor_recommendations", [])]
        rm = ResourceMetrics(
            **{k: v for k, v in rd.items() if k != "advisor_recommendations"},
            advisor_recommendations=advisor_recs,
        )
        rm.resource_category = _resource_category(rm.resource_type)
        rm.is_infrastructure  = is_infrastructure_resource(rm.resource_type)
        rm.subscription_id    = rm.subscription_id or "demo-subscription"
        rm.safe_action_steps  = get_safe_action_steps(
            resource_type=rm.resource_type,
            score_label=rm.score_label,
            is_orphan=rm.is_orphan,
            orphan_reason=rm.orphan_reason or "",
            ai_action=rm.ai_action or "",
        )
        resources.append(rm)

    orphans = [
        OrphanResource(
            resource_id=r.resource_id, resource_name=r.resource_name,
            resource_type=r.resource_type, resource_group=r.resource_group,
            orphan_reason=r.orphan_reason or "", monthly_cost=r.cost_current_month,
            estimated_savings=r.estimated_monthly_savings,
        )
        for r in resources if r.is_orphan
    ]

    total_curr  = sum(r.cost_current_month  for r in resources)
    total_prev  = sum(r.cost_previous_month for r in resources)
    mom_delta   = total_curr - total_prev
    mom_pct     = (mom_delta / total_prev * 100) if total_prev > 0 else 0.0
    orphan_cost = sum(r.cost_current_month for r in resources if r.is_orphan)
    avg_score   = sum(r.final_score for r in resources) / len(resources)
    total_save  = sum(r.estimated_monthly_savings for r in resources)
    total_adv   = sum(len(r.advisor_recommendations) for r in resources)
    ai_reviewed = sum(1 for r in resources if r.ai_explanation)
    total_carbon = sum(r.carbon_kg_per_month for r in resources)
    untagged     = sum(1 for r in resources if len(r.missing_tags) > 0)
    tag_pct      = round((len(resources) - untagged) / len(resources) * 100, 1)

    # Health metrics (exclude infrastructure from scorable pool)
    infra_list    = [r for r in resources if r.is_infrastructure]
    scorable      = [r for r in resources if not r.is_infrastructure and not r.is_orphan]
    not_used_list = [r for r in scorable if r.score_label == ScoreLabel.NOT_USED]
    healthy_list  = [r for r in scorable if r.score_label in (ScoreLabel.ACTIVELY_USED, ScoreLabel.FULLY_USED)]
    health_pct    = round(len(healthy_list) / len(scorable) * 100, 1) if scorable else 100.0

    from main import _compute_cost_score
    _not_used_cost = round(sum(r.cost_current_month for r in not_used_list), 2)
    _cs, _cg, _cl, _cc = _compute_cost_score(
        orphan_cost   = orphan_cost,
        not_used_cost = _not_used_cost,
        total_curr    = total_curr,
        health_pct    = health_pct,
        resources     = resources,
    )

    kpi = KPIData(
        total_cost_current_month=round(total_curr, 2),
        total_cost_previous_month=round(total_prev, 2),
        mom_cost_delta=round(mom_delta, 2),
        mom_cost_delta_pct=round(mom_pct, 2),
        total_resources=len(resources),
        avg_optimization_score=round(avg_score, 1),
        total_potential_savings=round(total_save, 2),
        orphan_count=len(orphans),
        orphan_cost=round(orphan_cost, 2),
        advisor_total_recs=total_adv,
        ai_reviewed_count=ai_reviewed,
        not_used_count=len(not_used_list),
        not_used_cost=_not_used_cost,
        infrastructure_count=len(infra_list),
        health_score_pct=health_pct,
        subscription_count=1,
        cost_score=_cs,
        cost_grade=_cg,
        cost_score_label=_cl,
        cost_score_components=_cc,
    )

    score_dist_map = {l: {"count":0,"total_cost":0.0} for l in ScoreLabel}
    SCORE_COLORS   = {"Not Used":"#ef4444","Rarely Used":"#f97316","Actively Used":"#eab308","Fully Used":"#22c55e"}
    for r in resources:
        score_dist_map[r.score_label]["count"] += 1
        score_dist_map[r.score_label]["total_cost"] += r.cost_current_month
    score_dist = [
        {"label":l.value,"count":d["count"],"total_cost":round(d["total_cost"],2),"color":SCORE_COLORS[l.value]}
        for l, d in score_dist_map.items() if d["count"] > 0
    ]

    type_map = {}
    for r in resources:
        t = r.resource_type
        if t not in type_map:
            type_map[t] = {"count":0,"cost_curr":0.0,"cost_prev":0.0,"scores":[],"advisor_recs":0}
        type_map[t]["count"] += 1
        type_map[t]["cost_curr"] += r.cost_current_month
        type_map[t]["cost_prev"] += r.cost_previous_month
        type_map[t]["scores"].append(r.final_score)
        type_map[t]["advisor_recs"] += len(r.advisor_recommendations)

    from main import RESOURCE_TYPE_DISPLAY
    type_summary = [
        {"resource_type":t,"display_name":RESOURCE_TYPE_DISPLAY.get(t,t.split("/")[-1].title()),
         "count":d["count"],"cost_current_month":round(d["cost_curr"],2),
         "cost_previous_month":round(d["cost_prev"],2),
         "avg_score":round(sum(d["scores"])/len(d["scores"]),1),
         "advisor_rec_count":d["advisor_recs"]}
        for t, d in sorted(type_map.items(), key=lambda x:-x[1]["cost_curr"])
    ]

    savings_recs = sorted(
        [{"resource_id":r.resource_id,"resource_name":r.resource_name,
          "resource_type":r.resource_type,"resource_group":r.resource_group,
          "current_monthly_cost":r.cost_current_month,
          "estimated_monthly_savings":r.estimated_monthly_savings,
          "savings_pct":round(r.estimated_monthly_savings/r.cost_current_month*100 if r.cost_current_month>0 else 0,1),
          "recommendation":r.recommendation or "","ai_explanation":r.ai_explanation,
          "ai_action":r.ai_action,
          "priority":"High" if r.final_score<=25 else "Medium" if r.final_score<=50 else "Low",
          "score":r.final_score,"advisor_count":len(r.advisor_recommendations)}
         for r in resources if r.estimated_monthly_savings > 0],
        key=lambda x: -x["estimated_monthly_savings"],
    )

    anomalies = [
        {"resource_id":r.resource_id,"resource_name":r.resource_name,
         "resource_type":r.resource_type,"resource_group":r.resource_group,
         "avg_daily_cost_30d":round(r.cost_current_month/30,4),
         "latest_daily_cost":round(r.daily_costs[-1] if r.daily_costs else 0,4),
         "anomaly_factor":round((r.daily_costs[-1]/(r.cost_current_month/30)) if r.daily_costs and r.cost_current_month>0 else 1,2)}
        for r in resources if r.is_anomaly
    ]

    rightsize_opps = [
        {"resource_id":r.resource_id,"resource_name":r.resource_name,
         "resource_type":r.resource_type,"resource_group":r.resource_group,
         "current_sku":r.sku or "","suggested_sku":r.rightsize_sku or "",
         "current_cost":r.cost_current_month,"estimated_savings":round(r.cost_current_month*r.rightsize_savings_pct/100,2),
         "savings_pct":r.rightsize_savings_pct,
         "reason":r.recommendation or "","cpu_pct":r.avg_cpu_pct}
        for r in resources if r.rightsize_sku
    ]

    # Distinct resource groups for FilterBar
    rg_list = sorted({r.resource_group for r in resources if r.resource_group})

    return {
        "kpi": kpi.model_dump(),
        "score_distribution": score_dist,
        "resource_type_summary": type_summary,
        "resources": [r.model_dump() for r in resources],
        "orphans": [o.model_dump() for o in orphans],
        "savings_recommendations": savings_recs,
        "last_refreshed": datetime.now(tz=timezone.utc).isoformat(),
        "ai_enabled": True,
        "demo_mode": True,
        "total_carbon_kg": round(total_carbon, 1),
        "tag_compliance_pct": tag_pct,
        "total_untagged": untagged,
        "cost_anomalies": anomalies,
        "rightsize_opportunities": rightsize_opps,
        "subscriptions": [{"subscription_id": "demo-subscription",
                           "cost_current": round(total_curr, 2),
                           "cost_previous": round(total_prev, 2),
                           "resource_count": len(resources),
                           "orphan_count": len(orphans),
                           "advisor_rec_count": total_adv}],
        "resource_groups": rg_list,
        "ai_narrative": None,
        "ai_provider": "none",
    }
