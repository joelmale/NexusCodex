# NexusCodex - Google Cloud Platform Deployment Guide

This guide walks through deploying NexusCodex to Google Cloud Platform (GCP) using managed services for production workloads.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [GCP Services Setup](#gcp-services-setup)
  - [1. Cloud SQL for PostgreSQL](#1-cloud-sql-for-postgresql)
  - [2. Memorystore for Redis](#2-memorystore-for-redis)
  - [3. Google Cloud Storage](#3-google-cloud-storage)
  - [4. ElasticSearch](#4-elasticsearch)
- [Application Deployment](#application-deployment)
  - [Option A: Cloud Run (Recommended)](#option-a-cloud-run-recommended)
  - [Option B: Compute Engine](#option-b-compute-engine)
  - [Option C: GKE (Kubernetes)](#option-c-gke-kubernetes)
- [Environment Configuration](#environment-configuration)
- [Post-Deployment](#post-deployment)
- [Monitoring & Maintenance](#monitoring--maintenance)
- [Cost Optimization](#cost-optimization)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Google Cloud Platform                 │
│                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  doc-api     │  │doc-processor │  │doc-websocket │  │
│  │  (Cloud Run) │  │  (Cloud Run) │  │  (Cloud Run) │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         │                 │                  │           │
│         └─────────────────┼──────────────────┘           │
│                           │                              │
│         ┌─────────────────┼──────────────────┐           │
│         │                 │                  │           │
│         ▼                 ▼                  ▼           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Cloud SQL   │  │ Memorystore  │  │     GCS      │  │
│  │ (PostgreSQL) │  │   (Redis)    │  │   Bucket     │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │  ElasticSearch on Compute Engine / Elastic Cloud │   │
│  └──────────────────────────────────────────────────┘   │
│                                                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Cloud Load Balancer (HTTPS/WSS)                 │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**Benefits:**
- Fully managed services (no server management)
- Auto-scaling for API and processor workers
- High availability and disaster recovery
- S3-compatible storage (no code changes needed)

---

## Prerequisites

Before starting, ensure you have:

1. **GCP Account** with billing enabled
2. **gcloud CLI** installed and configured ([install guide](https://cloud.google.com/sdk/docs/install))
3. **Docker** installed locally for building images
4. **Project created** in GCP Console

```bash
# Install gcloud CLI (macOS)
brew install google-cloud-sdk

# Authenticate
gcloud auth login

# Set your project
gcloud config set project YOUR_PROJECT_ID

# Enable required APIs
gcloud services enable \
  sqladmin.googleapis.com \
  redis.googleapis.com \
  storage.googleapis.com \
  run.googleapis.com \
  compute.googleapis.com \
  artifactregistry.googleapis.com
```

---

## GCP Services Setup

### 1. Cloud SQL for PostgreSQL

**Create PostgreSQL instance:**

```bash
# Create Cloud SQL instance (production-ready config)
gcloud sql instances create nexuscodex-postgres \
  --database-version=POSTGRES_16 \
  --tier=db-custom-2-8192 \
  --region=us-central1 \
  --storage-type=SSD \
  --storage-size=100GB \
  --storage-auto-increase \
  --backup-start-time=03:00 \
  --enable-bin-log \
  --maintenance-window-day=SUN \
  --maintenance-window-hour=04

# Create database
gcloud sql databases create doclib \
  --instance=nexuscodex-postgres

# Create database user
gcloud sql users create nexus_user \
  --instance=nexuscodex-postgres \
  --password=STRONG_PASSWORD_HERE

# Get connection details
gcloud sql instances describe nexuscodex-postgres \
  --format="value(connectionName)"
```

**Connection String:**
```env
DATABASE_URL=postgresql://nexus_user:STRONG_PASSWORD_HERE@<CLOUD_SQL_IP>:5432/doclib

# For Cloud Run, use Unix socket:
DATABASE_URL=postgresql://nexus_user:STRONG_PASSWORD_HERE@/doclib?host=/cloudsql/<CONNECTION_NAME>
```

**Cost:** ~$100-200/month for db-custom-2-8192 (adjust tier based on usage)

---

### 2. Memorystore for Redis

**Create Redis instance:**

```bash
# Create Memorystore Redis (Standard Tier for HA)
gcloud redis instances create nexuscodex-redis \
  --size=5 \
  --region=us-central1 \
  --zone=us-central1-a \
  --redis-version=redis_7_0 \
  --tier=standard \
  --enable-auth

# Get connection details
gcloud redis instances describe nexuscodex-redis \
  --region=us-central1 \
  --format="value(host,port,authString)"
```

**Connection String:**
```env
REDIS_URL=redis://:<AUTH_STRING>@<REDIS_HOST>:6379
```

**Cost:** ~$50-100/month for 5GB Standard Tier

---

### 3. Google Cloud Storage

**Create GCS bucket with S3 interoperability:**

```bash
# Create bucket
gsutil mb -c STANDARD -l us-central1 gs://nexuscodex-documents

# Enable uniform bucket-level access (recommended)
gsutil uniformbucketlevelaccess set on gs://nexuscodex-documents

# Set lifecycle policy (optional - delete old processed files)
cat > lifecycle.json << EOF
{
  "lifecycle": {
    "rule": [
      {
        "action": {"type": "Delete"},
        "condition": {
          "age": 365,
          "matchesPrefix": ["thumbnails/"]
        }
      }
    ]
  }
}
EOF
gsutil lifecycle set lifecycle.json gs://nexuscodex-documents

# Enable S3 interoperability and generate HMAC keys
gsutil hmac create <SERVICE_ACCOUNT_EMAIL>
# Output:
# Access ID: GOOG1E...
# Secret: bGoa+V7g/yq...
```

**Environment Variables:**
```env
S3_ENDPOINT=https://storage.googleapis.com
S3_ACCESS_KEY=GOOG1E...  # HMAC Access ID
S3_SECRET_KEY=bGoa+V7g/yq...  # HMAC Secret
S3_BUCKET=nexuscodex-documents
S3_REGION=us-central1
S3_FORCE_PATH_STYLE=false  # GCS uses virtual-hosted-style URLs
```

**Cost:** ~$0.02/GB/month for Standard storage + data transfer costs

**Important:** The existing AWS SDK code works with GCS via S3 interoperability - **no code changes needed**.

---

### 4. ElasticSearch

**Option A: Elastic Cloud (Recommended)**

1. Sign up at [cloud.elastic.co](https://cloud.elastic.co)
2. Create deployment (choose GCP us-central1 for low latency)
3. Select tier: 8GB RAM, 240GB storage (~$200/month)
4. Copy Cloud ID and credentials

```env
ELASTICSEARCH_URL=https://<CLOUD_ID>.gcp.cloud.es.io:9243
ELASTICSEARCH_USERNAME=elastic
ELASTICSEARCH_PASSWORD=<your-password>
```

**Option B: Self-Managed on Compute Engine**

```bash
# Create VM for ElasticSearch
gcloud compute instances create nexuscodex-elasticsearch \
  --zone=us-central1-a \
  --machine-type=n2-standard-4 \
  --boot-disk-size=100GB \
  --boot-disk-type=pd-ssd \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --tags=elasticsearch

# SSH and install ElasticSearch
gcloud compute ssh nexuscodex-elasticsearch --zone=us-central1-a

# On the VM:
wget https://artifacts.elastic.co/downloads/elasticsearch/elasticsearch-8.11.0-linux-x86_64.tar.gz
tar -xzf elasticsearch-8.11.0-linux-x86_64.tar.gz
cd elasticsearch-8.11.0/

# Configure elasticsearch.yml for production
echo "network.host: 0.0.0.0" >> config/elasticsearch.yml
echo "xpack.security.enabled: true" >> config/elasticsearch.yml

# Start ElasticSearch
./bin/elasticsearch -d
```

```env
ELASTICSEARCH_URL=http://<ELASTICSEARCH_VM_INTERNAL_IP>:9200
```

**Cost:** ~$150-200/month for n2-standard-4 VM

---

## Application Deployment

### Option A: Cloud Run (Recommended)

Cloud Run is ideal for auto-scaling, serverless deployment.

**Step 1: Build and Push Docker Images**

```bash
# Authenticate Docker with Artifact Registry
gcloud auth configure-docker us-central1-docker.pkg.dev

# Create Artifact Registry repository
gcloud artifacts repositories create nexuscodex \
  --repository-format=docker \
  --location=us-central1

# Build and push images
PROJECT_ID=$(gcloud config get-value project)
REGION=us-central1

# doc-api
docker build -t $REGION-docker.pkg.dev/$PROJECT_ID/nexuscodex/doc-api:latest \
  ./services/doc-api
docker push $REGION-docker.pkg.dev/$PROJECT_ID/nexuscodex/doc-api:latest

# doc-processor
docker build -t $REGION-docker.pkg.dev/$PROJECT_ID/nexuscodex/doc-processor:latest \
  ./services/doc-processor
docker push $REGION-docker.pkg.dev/$PROJECT_ID/nexuscodex/doc-processor:latest

# doc-websocket
docker build -t $REGION-docker.pkg.dev/$PROJECT_ID/nexuscodex/doc-websocket:latest \
  ./services/doc-websocket
docker push $REGION-docker.pkg.dev/$PROJECT_ID/nexuscodex/doc-websocket:latest
```

**Step 2: Deploy to Cloud Run**

Create `.env.prod` file with all production environment variables:

```env
# .env.prod
NODE_ENV=production
DATABASE_URL=postgresql://nexus_user:PASSWORD@/doclib?host=/cloudsql/PROJECT:REGION:INSTANCE
REDIS_URL=redis://:AUTH_STRING@REDIS_HOST:6379
ELASTICSEARCH_URL=https://CLOUD_ID.gcp.cloud.es.io:9243
ELASTICSEARCH_INDEX=documents
QUEUE_NAME=document-processing
S3_ENDPOINT=https://storage.googleapis.com
S3_ACCESS_KEY=GOOG1E...
S3_SECRET_KEY=bGoa+V7g/yq...
S3_BUCKET=nexuscodex-documents
S3_REGION=us-central1
S3_FORCE_PATH_STYLE=false
UPLOAD_URL_EXPIRY=3600
DOWNLOAD_URL_EXPIRY=3600
MAX_FILE_SIZE=104857600
```

Deploy services:

```bash
# doc-api
gcloud run deploy doc-api \
  --image=$REGION-docker.pkg.dev/$PROJECT_ID/nexuscodex/doc-api:latest \
  --platform=managed \
  --region=$REGION \
  --env-vars-file=.env.prod \
  --add-cloudsql-instances=PROJECT:REGION:nexuscodex-postgres \
  --allow-unauthenticated \
  --memory=2Gi \
  --cpu=2 \
  --max-instances=10 \
  --port=3000

# doc-processor (background worker)
gcloud run deploy doc-processor \
  --image=$REGION-docker.pkg.dev/$PROJECT_ID/nexuscodex/doc-processor:latest \
  --platform=managed \
  --region=$REGION \
  --env-vars-file=.env.prod \
  --add-cloudsql-instances=PROJECT:REGION:nexuscodex-postgres \
  --no-allow-unauthenticated \
  --memory=4Gi \
  --cpu=4 \
  --max-instances=5

# doc-websocket
gcloud run deploy doc-websocket \
  --image=$REGION-docker.pkg.dev/$PROJECT_ID/nexuscodex/doc-websocket:latest \
  --platform=managed \
  --region=$REGION \
  --env-vars-file=.env.prod \
  --add-cloudsql-instances=PROJECT:REGION:nexuscodex-postgres \
  --allow-unauthenticated \
  --memory=1Gi \
  --cpu=1 \
  --max-instances=10 \
  --port=3002
```

**Get service URLs:**
```bash
gcloud run services describe doc-api --region=$REGION --format="value(status.url)"
gcloud run services describe doc-websocket --region=$REGION --format="value(status.url)"
```

**Cost:** Pay-per-use, ~$50-150/month for moderate traffic (1M requests/month)

---

### Option B: Compute Engine

Deploy using Docker Compose on a VM:

```bash
# Create VM
gcloud compute instances create nexuscodex-app \
  --zone=us-central1-a \
  --machine-type=n2-standard-4 \
  --boot-disk-size=100GB \
  --boot-disk-type=pd-ssd \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --tags=http-server,https-server

# SSH and setup
gcloud compute ssh nexuscodex-app --zone=us-central1-a

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Clone repo and configure
git clone https://github.com/your-org/NexusCodex.git
cd NexusCodex

# Create production .env files
# (copy .env.prod values to services/doc-api/.env, etc.)

# Start services
docker compose up -d
```

**Cost:** ~$150/month for n2-standard-4 VM

---

### Option C: GKE (Kubernetes)

For advanced scaling and orchestration, deploy to Google Kubernetes Engine (see GKE documentation).

---

## Environment Configuration

### Production .env Template

**services/doc-api/.env**
```env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://nexus_user:PASSWORD@<CLOUD_SQL_IP>:5432/doclib
REDIS_URL=redis://:AUTH_STRING@<REDIS_HOST>:6379
ELASTICSEARCH_URL=https://<CLOUD_ID>.gcp.cloud.es.io:9243
ELASTICSEARCH_INDEX=documents
QUEUE_NAME=document-processing
S3_ENDPOINT=https://storage.googleapis.com
S3_ACCESS_KEY=<GCS_HMAC_ACCESS_KEY>
S3_SECRET_KEY=<GCS_HMAC_SECRET>
S3_BUCKET=nexuscodex-documents
S3_REGION=us-central1
S3_FORCE_PATH_STYLE=false
UPLOAD_URL_EXPIRY=3600
DOWNLOAD_URL_EXPIRY=3600
MAX_FILE_SIZE=104857600
```

**services/doc-processor/.env**
```env
NODE_ENV=production
DATABASE_URL=postgresql://nexus_user:PASSWORD@<CLOUD_SQL_IP>:5432/doclib
REDIS_URL=redis://:AUTH_STRING@<REDIS_HOST>:6379
ELASTICSEARCH_URL=https://<CLOUD_ID>.gcp.cloud.es.io:9243
ELASTICSEARCH_INDEX=documents
QUEUE_NAME=document-processing
S3_ENDPOINT=https://storage.googleapis.com
S3_ACCESS_KEY=<GCS_HMAC_ACCESS_KEY>
S3_SECRET_KEY=<GCS_HMAC_SECRET>
S3_BUCKET=nexuscodex-documents
S3_REGION=us-central1
S3_FORCE_PATH_STYLE=false
```

**services/doc-websocket/.env**
```env
NODE_ENV=production
PORT=3002
DATABASE_URL=postgresql://nexus_user:PASSWORD@<CLOUD_SQL_IP>:5432/doclib
REDIS_URL=redis://:AUTH_STRING@<REDIS_HOST>:6379
SESSION_TTL=3600
```

---

## Post-Deployment

### 1. Run Database Migrations

```bash
# From your local machine (or Cloud Shell)
cd services/doc-api

# Set DATABASE_URL to Cloud SQL connection
export DATABASE_URL="postgresql://nexus_user:PASSWORD@<CLOUD_SQL_IP>:5432/doclib"

# Run Prisma migrations
npm run prisma:migrate deploy
```

### 2. Initialize ElasticSearch Index

```bash
# Create index mapping
curl -X PUT "https://<CLOUD_ID>.gcp.cloud.es.io:9243/documents" \
  -u elastic:PASSWORD \
  -H 'Content-Type: application/json' \
  -d '{
    "mappings": {
      "properties": {
        "title": { "type": "text" },
        "content": { "type": "text" },
        "tags": { "type": "keyword" },
        "type": { "type": "keyword" }
      }
    }
  }'
```

### 3. Test API Endpoints

```bash
# Health check
curl https://<doc-api-url>/health

# Upload a test document
curl -X POST https://<doc-api-url>/api/documents \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Document",
    "type": "rulebook",
    "format": "pdf",
    "uploadedBy": "test-user",
    "fileSize": 1024,
    "fileName": "test.pdf"
  }'
```

### 4. Configure Domain & SSL

```bash
# Map custom domain to Cloud Run
gcloud run domain-mappings create \
  --service=doc-api \
  --domain=api.nexuscodex.com \
  --region=$REGION

gcloud run domain-mappings create \
  --service=doc-websocket \
  --domain=ws.nexuscodex.com \
  --region=$REGION
```

---

## Monitoring & Maintenance

### Cloud Logging

View logs in Cloud Console or via CLI:

```bash
gcloud logging read "resource.type=cloud_run_revision" --limit=50
```

### Cloud Monitoring

Set up alerts for:
- API error rate > 5%
- Response time > 2s
- Database connection pool exhaustion
- Redis memory usage > 80%
- GCS bucket storage quota

### Backups

Cloud SQL backups are automatic (configured during setup). To restore:

```bash
gcloud sql backups list --instance=nexuscodex-postgres
gcloud sql backups restore <BACKUP_ID> --backup-instance=nexuscodex-postgres
```

---

## Cost Optimization

**Estimated Monthly Costs (moderate usage):**

| Service | Configuration | Estimated Cost |
|---------|--------------|----------------|
| Cloud SQL | db-custom-2-8192 | $150-200 |
| Memorystore Redis | 5GB Standard | $75 |
| GCS | 500GB storage + 1TB egress | $50 |
| Cloud Run (3 services) | 1M requests/month | $100 |
| ElasticSearch | Elastic Cloud 8GB | $200 |
| **Total** | | **~$575-625/month** |

**Cost Reduction Tips:**
1. Use Cloud SQL proxy for secure connections (avoid public IPs)
2. Enable GCS lifecycle policies to delete old thumbnails
3. Use Cloud Run min-instances=0 for low-traffic services
4. Use Committed Use Discounts for predictable workloads
5. Consider Basic Tier Redis ($30/month) for development environments

---

## Troubleshooting

### Cloud SQL Connection Issues

```bash
# Test connection from Cloud Shell
gcloud sql connect nexuscodex-postgres --user=nexus_user
```

### Redis Connection Issues

```bash
# Test from a GCE VM in the same VPC
redis-cli -h <REDIS_HOST> -a <AUTH_STRING> ping
```

### GCS S3 API Issues

```bash
# Verify HMAC keys
gsutil hmac list

# Test upload with AWS CLI
aws s3 cp test.pdf s3://nexuscodex-documents/ \
  --endpoint-url=https://storage.googleapis.com \
  --profile=gcs
```

---

## Security Checklist

- [ ] Enable VPC Service Controls for Cloud SQL
- [ ] Use Secret Manager for credentials (not env vars)
- [ ] Enable Cloud Armor for DDoS protection
- [ ] Configure IAM roles with least privilege
- [ ] Enable audit logging for all services
- [ ] Set up SSL/TLS for all endpoints
- [ ] Enable CORS only for trusted domains
- [ ] Implement rate limiting in doc-api
- [ ] Enable ElasticSearch authentication (`xpack.security.enabled=true`)

---

## Next Steps

1. Set up CI/CD with Cloud Build for automated deployments
2. Implement Cloud CDN for static asset caching
3. Configure Cloud Pub/Sub for event-driven processing
4. Add Cloud Tasks for scheduled jobs (document cleanup, etc.)
5. Implement OpenTelemetry for distributed tracing

---

## Support

For issues or questions:
- **GCP Documentation**: [cloud.google.com/docs](https://cloud.google.com/docs)
- **NexusCodex GitHub**: [github.com/your-org/NexusCodex](https://github.com/your-org/NexusCodex)
- **CLAUDE.md**: Architecture and development guide

---

**Last Updated:** 2025-10-19
