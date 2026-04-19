# Azure Cost Optimizer

> **Preview** - Early release. Features and data accuracy are actively being improved.

A self-hosted Azure cost intelligence tool that connects directly to your subscription, pulls real cost and utilisation data, scores every resource 0-100 on actual efficiency, and surfaces savings opportunities in an interactive dashboard. No third-party SaaS, no data leaving your environment.

---

## What it does

Pulls 2 months of real billing data from Azure Cost Management and 30-day utilisation metrics from Azure Monitor for every resource. Each resource gets a 0-100 score based on actual CPU, memory, network, storage, and AI token usage.

The tool flags orphaned resources such as unattached disks, unused IPs, and deallocated VMs. It estimates monthly savings per resource with actionable right-sizing steps and surfaces Azure Advisor recommendations alongside your own scoring. You can export everything to PDF for stakeholder reporting.

The tool runs entirely on your own machine using a read-only service principal. It has no write permissions and no data leaves your environment.

---

## Step 1 - Install the required software

You need four free tools installed before you start. Download and install each one:

| Tool | Download link | Notes |
|------|--------------|-------|
| **Python 3.11 or 3.12** | [python.org/downloads](https://www.python.org/downloads/) | Download **3.12.x** (not 3.13 or 3.14). On the installer, tick **"Add Python to PATH"** before clicking Install |
| **Node.js 18+** | [nodejs.org](https://nodejs.org) | Download the LTS version |
| **Git** | [git-scm.com](https://git-scm.com) | Accept all defaults during install |
| **Azure CLI** | [aka.ms/installazurecliwindows](https://aka.ms/installazurecliwindows) | Used to create the Azure service principal |

After installing, open a new Command Prompt and verify each tool is working:

```
python --version
node --version
git --version
az --version
```

Each command should print a version number. If any of them says "not recognised", restart your PC and try again.

---

## Step 2 - Download the tool

Open Command Prompt and run:

```bat
git clone https://github.com/MoeKinani/azure-cost-optimizer.git
cd azure-cost-optimizer
install.bat
```

`install.bat` sets everything up automatically. It creates a Python environment, installs all packages, and builds the frontend. This takes 2-3 minutes and only needs to be run once.

---

## Step 3 - Create an Azure service principal

The tool needs read-only access to your Azure subscription. You do this by creating a service principal, which is a service account with limited permissions.

In Command Prompt, log in to Azure:

```bat
az login
```

A browser window will open. Sign in with your Azure admin account, then come back to the terminal.

Now run the command below. Replace `YOUR_SUBSCRIPTION_ID` with your actual subscription ID. You can find this in Azure Portal under Subscriptions.

```bat
az ad sp create-for-rbac --name "cost-optimizer-sp" --role "Reader" --scopes "/subscriptions/YOUR_SUBSCRIPTION_ID"
```

The output will look like this:

```json
{
  "appId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "password": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "tenant": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

Copy and save all three values. You will need them in Step 5.

---

## Step 4 - Assign the required roles

The service principal needs two more roles to read billing and metrics data. Run each command separately, replacing `YOUR_APP_ID` with the `appId` from Step 3 and `YOUR_SUBSCRIPTION_ID` with your subscription ID.

```bat
az role assignment create --assignee YOUR_APP_ID --role "Cost Management Reader" --scope "/subscriptions/YOUR_SUBSCRIPTION_ID"
```

```bat
az role assignment create --assignee YOUR_APP_ID --role "Monitoring Reader" --scope "/subscriptions/YOUR_SUBSCRIPTION_ID"
```

Wait 2-5 minutes after running these before launching the tool. Azure needs a few minutes to apply the roles.

| Role | What it allows |
|------|---------------|
| **Reader** | List all resources in the subscription |
| **Cost Management Reader** | Read billing and cost data |
| **Monitoring Reader** | Read CPU, memory, and usage metrics |

---

## Step 5 - Start the tool

Every time you want to use the tool, run:

```bat
start.bat
```

Your browser will open automatically at `http://localhost:8000`.

On the first run you will see a setup wizard. Fill in the values from Step 3:

| Field | Where it comes from |
|-------|-------------------|
| **Tenant ID** | The `tenant` value from Step 3 |
| **Client ID** | The `appId` value from Step 3 |
| **Client Secret** | The `password` value from Step 3 |
| **Subscription ID** | Azure Portal > Subscriptions > copy the ID |

Click Launch and the tool will connect to your subscription and run the first scan.

---

## Dashboard tabs

| Tab | What it shows |
|-----|--------------|
| **Dashboard** | KPI cards, score distribution, cost trends, resource table, orphans, savings |
| **App Services** | Plans, web apps, function apps with right-size recommendations and idle detection |
| **Storage** | Storage accounts with access patterns, lifecycle policies, and last-access tracking |
| **Reservations** | Reserved Instance coverage, utilisation rates, and right-sizing recommendations |
| **AI Costs** | Cognitive Services and Azure OpenAI / AI Foundry token usage, model requests, per-deployment breakdown |
| **Resource Map** | Visual map of all resources grouped by resource group with connections between them |

---

## Scoring

Each resource receives a 0-100 optimization score calculated from real Azure Monitor metrics.

| Score | Label | Meaning |
|-------|-------|---------|
| 76-100 | **Fully Used** | Well utilised, no action needed |
| 51-75 | **Actively Used** | In use, consider reserved pricing |
| 26-50 | **Likely Waste** | Low activity, review and right-size |
| 0-25 | **Confirmed Waste** | Near-zero activity, candidate for deletion |
| N/A | **Unknown** | No metrics available (diagnostics not enabled) |

Resources with locks, backups, private endpoints, or active reservations are flagged as protected and excluded from waste recommendations regardless of score.

---

## Security

The service principal uses read-only roles only. It has no write access and cannot modify or delete any Azure resources. Credentials are stored locally on your machine and never transmitted anywhere. All API calls go directly from your machine to Azure with no intermediary servers.

---

## Troubleshooting

**Scan returns no resources**

Check that the service principal has the Reader role at subscription scope and that the tenant ID and subscription ID are correct.

**All resources show "Unknown" score**

The service principal is missing the Monitoring Reader role, or Azure Monitor diagnostics are not enabled on your resources.

**Cost data shows $0 for everything**

The service principal is missing the Cost Management Reader role. Cost data can also take 24-48 hours to appear for new subscriptions.

**Token metrics empty on AI Costs tab**

Make sure Monitoring Reader is assigned. Azure AI Foundry metrics use InputTokens and OutputTokens and become available automatically once the role is in place.

**403 errors on first scan**

Role propagation takes 2-5 minutes after creation. Wait a few minutes and click Refresh.

**install.bat fails with "Building wheel for pydantic-core" or "linker link.exe not found"**

Python 3.13 or 3.14 is installed and has no pre-built packages for some dependencies. Install Python 3.12.x from python.org and re-run `install.bat`. The script will automatically detect and use 3.12 even if a newer version is also installed.

---

## Contributing

Issues and PRs are welcome. Please open an issue before starting significant work.

---

## License

MIT
