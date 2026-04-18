# Azure Cost Optimizer

> **Preview** - Early release. Features and data accuracy are actively being improved.

A self-hosted Azure cost intelligence tool that connects directly to your subscription, pulls real cost and utilisation data, scores every resource 0-100 on actual efficiency, and surfaces savings opportunities in an interactive dashboard. No third-party SaaS, no data leaving your environment.

---

## What it does

- Pulls **2 months of real billing data** from Azure Cost Management
- Fetches **30-day utilisation metrics** from Azure Monitor for every resource
- Scores each resource **0-100** based on actual CPU, memory, network, storage, and AI token usage
- Flags **orphaned resources** (unattached disks, unused IPs, deallocated VMs)
- Estimates **monthly savings** per resource with actionable right-sizing steps
- Surfaces **Azure Advisor recommendations** alongside your own scoring
- Tabs for **App Services**, **Storage**, **Reservations**, and **AI Costs** (Cognitive Services / Azure OpenAI)
- **Export to PDF** for stakeholder reporting
- Runs entirely **on your own machine** with a read-only service principal and no write permissions

---

## Prerequisites

| Requirement | Minimum version |
|-------------|----------------|
| Windows 10 / 11 | |
| Python | 3.11+ |
| Node.js | 18+ |
| Git | Any |
| Azure CLI (`az`) | Any (for SP setup) |

Download Python and Node.js from [python.org](https://python.org) and [nodejs.org](https://nodejs.org) if not already installed. Make sure both are on your PATH.

---

## Quick start (Windows)

```bat
git clone https://github.com/MoeKinani/azure-cost-optimizer.git
cd azure-cost-optimizer
install.bat
```

`install.bat` creates the Python virtual environment, installs all dependencies, and builds the frontend. Run it once.

Then every time you want to use the tool:

```bat
start.bat
```

This builds the latest frontend and starts the backend. Your browser opens automatically at `http://localhost:8000`.

On first run you will see a **setup wizard** where you enter your Azure credentials and click Launch.

---

## Azure setup

### 1. Create a service principal

Open a terminal and log in to Azure CLI:

```bash
az login
```

Create the service principal (replace `YOUR_SUBSCRIPTION_ID`):

```bash
az ad sp create-for-rbac \
  --name "cost-optimizer-sp" \
  --role "Reader" \
  --scopes "/subscriptions/YOUR_SUBSCRIPTION_ID"
```

Copy the output. You will need `appId`, `password`, and `tenant`.

### 2. Assign the required roles

```bash
# Cost Management Reader - billing data
az role assignment create \
  --assignee YOUR_APP_ID \
  --role "Cost Management Reader" \
  --scope "/subscriptions/YOUR_SUBSCRIPTION_ID"

# Monitoring Reader - utilisation metrics
az role assignment create \
  --assignee YOUR_APP_ID \
  --role "Monitoring Reader" \
  --scope "/subscriptions/YOUR_SUBSCRIPTION_ID"
```

| Role | Purpose |
|------|---------|
| **Reader** | List all resources |
| **Cost Management Reader** | Read billing and cost data |
| **Monitoring Reader** | Read Azure Monitor metrics |

Role propagation can take 2-5 minutes. If you see 403 errors on first scan, wait a few minutes and refresh.

### 3. Enter credentials in the setup wizard

When you open the app for the first time, the setup wizard asks for:

| Field | Where to find it |
|-------|-----------------|
| **Tenant ID** | `tenant` from the SP output, or Azure Portal > Entra ID > Overview |
| **Client ID** | `appId` from the SP output |
| **Client Secret** | `password` from the SP output |
| **Subscription ID** | Azure Portal > Subscriptions |

Credentials are saved locally to `backend/config/.env` on your machine and never transmitted anywhere.

---

## Manual configuration (alternative to wizard)

Copy the example file and fill in your values:

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env`:

```env
AZURE_CLIENT_ID=your-client-id
AZURE_CLIENT_SECRET=your-client-secret
AZURE_TENANT_ID=your-tenant-id
AZURE_SUBSCRIPTION_ID=your-subscription-id
```

---

## Dashboard tabs

| Tab | What it shows |
|-----|--------------|
| **Dashboard** | KPI cards, score distribution, cost trends, resource table, orphans, savings |
| **App Services** | Plans, web apps, function apps with right-size recommendations and idle detection |
| **Storage** | Storage accounts with access patterns, lifecycle policies, and last-access tracking |
| **Reservations** | Reserved Instance coverage, utilisation rates, and right-sizing recommendations. Shows which reservations are underused and where on-demand spend could be converted to reserved pricing |
| **AI Costs** | Cognitive Services and Azure OpenAI / AI Foundry with input tokens, output tokens, total tokens, model request counts, per-deployment breakdown, and 30-day usage trends from Azure Monitor |

---

## Scoring

Each resource receives a **0-100 optimization score** from real Azure Monitor metrics.

| Score | Label | Meaning |
|-------|-------|---------|
| 76-100 | **Fully Used** | Well utilised, no action needed |
| 51-75 | **Actively Used** | In use, consider reserved pricing |
| 26-50 | **Likely Waste** | Low activity, review and right-size |
| 0-25 | **Confirmed Waste** | Near-zero activity, candidate for deletion |
| N/A | **Unknown** | No metrics available (diagnostics not enabled) |

Resources with locks, backups, private endpoints, or active reservations are flagged as **protected** and excluded from waste recommendations regardless of score.

---

## Architecture

```
azure-cost-optimizer/
├── backend/                    # FastAPI + Azure SDK (Python)
│   ├── main.py                 # API routes and dashboard assembly
│   ├── models/schemas.py       # Pydantic response models
│   ├── services/
│   │   ├── azure_auth.py       # Credential management
│   │   ├── cost_service.py     # Azure Cost Management queries
│   │   ├── metrics_service.py  # Azure Monitor metric fetch
│   │   ├── resource_service.py # Resource discovery and orphan detection
│   │   ├── scoring_service.py  # 0-100 scoring engine
│   │   ├── advisor_service.py  # Azure Advisor recommendations
│   │   └── ai_service.py       # AI scoring adjustments
│   └── requirements.txt
├── frontend/                   # React + Vite + Tailwind CSS
│   ├── src/
│   │   ├── App.jsx             # Root layout and data loading
│   │   ├── api/client.js       # API fetch wrapper
│   │   └── components/         # Dashboard panels and UI components
│   └── package.json
├── install.bat                 # One-time setup script
├── start.bat                   # Daily launch script
└── docker-compose.yml          # Docker deployment (optional)
```

---

## Docker (optional)

For server deployments:

```bash
docker compose up -d
```

The app will be available at `http://your-server:8000`.

Configure credentials via the setup wizard on first launch, or mount a pre-filled `config/.env` file.

---

## Security

- The service principal uses **read-only roles only** with no write access and no ability to modify or delete Azure resources
- Credentials are stored locally in `backend/config/.env` (gitignored)
- No data is sent to any external service except Azure APIs
- All API calls go directly from your machine to Azure with no intermediary servers

---

## Troubleshooting

**Scan returns no resources**
- Verify the service principal has **Reader** role at subscription scope
- Check the tenant ID and subscription ID are correct

**All resources show "Unknown" score**
- The service principal is missing **Monitoring Reader** role
- Azure Monitor diagnostics may not be enabled on your resources

**Cost data shows $0 for everything**
- The service principal is missing **Cost Management Reader** role
- Cost data can take 24-48 hours to appear for new subscriptions

**Token metrics empty on AI Costs tab**
- Ensure **Monitoring Reader** is assigned
- Azure AI Foundry metrics use `InputTokens` and `OutputTokens`, available automatically once the role is assigned

---

## Contributing

Issues and PRs are welcome. Please open an issue before starting significant work.

---

## License

MIT
