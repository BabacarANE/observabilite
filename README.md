# 🔭 Observability TP — Microservices avec OpenTelemetry

Projet de TP sur l'observabilité d'une architecture microservices distribuée.
Stack : **Node.js / Express · OpenTelemetry · Prometheus · Grafana · Jaeger**

---

## Architecture

```
Client
  └── API Gateway :3000
        └── Service Orders :3001
              └── Service Users :3002

Observabilité :
  ├── Jaeger     :16686  (traces distribuées)
  ├── Prometheus :9090   (métriques)
  └── Grafana    :3003   (dashboards)
```

### Flux de données

```
Client ──► API Gateway ──► Service Orders ──► Service Users
                │                │                  │
                ▼                ▼                  ▼
           OTLP traces      OTLP traces        OTLP traces
                │                │                  │
                └────────────────┴──────────► Jaeger
                
           /metrics          /metrics           /metrics
                │                │                  │
                └────────────────┴──────────► Prometheus ──► Grafana
```

---

## Démarrage rapide

### Prérequis

- Docker ≥ 24
- Docker Compose ≥ 2

### Lancer le projet

```bash
git clone https://github.com/<your-username>/observability-tp.git
cd observability-tp
docker compose up --build
```

### Accès aux interfaces

| Interface  | URL                       | Identifiants  |
|------------|---------------------------|---------------|
| API        | http://localhost:3000     | —             |
| Jaeger     | http://localhost:16686    | —             |
| Prometheus | http://localhost:9090     | —             |
| Grafana    | http://localhost:3003     | admin / admin |

---

## Endpoints disponibles

### API Gateway (port 3000)

| Méthode | Route           | Description                       |
|---------|-----------------|-----------------------------------|
| GET     | `/health`       | Health check                      |
| GET     | `/metrics`      | Métriques Prometheus              |
| GET     | `/orders`       | Liste des commandes + utilisateurs|
| GET     | `/orders/:id`   | Commande par ID                   |
| GET     | `/orders/slow`  | Réponse lente (3s) — simulation   |
| GET     | `/orders/error` | Erreur 500 — simulation           |

Les services Orders et Users exposent les mêmes patterns sur leurs ports respectifs.

---

## Parties du TP

### Partie 1 — Architecture

Trois microservices Express communiquant en chaîne :
- **API Gateway** — point d'entrée unique, proxy vers Orders
- **Service Orders** — gestion des commandes, appelle Users pour enrichissement
- **Service Users** — référentiel utilisateurs

### Partie 2 — Infrastructure

Docker Compose orchestre 6 conteneurs : 3 services applicatifs + Jaeger + Prometheus + Grafana. Le réseau `observability` isole la communication inter-services.

### Partie 3 — Instrumentation OpenTelemetry

Chaque service initialise le SDK OpenTelemetry **avant** tout autre `require`. L'`HttpInstrumentation` et l'`ExpressInstrumentation` génèrent automatiquement des spans et propagent le contexte W3C TraceContext entre services via les headers HTTP. Les traces sont exportées vers Jaeger en OTLP/HTTP.

### Partie 4 — Métriques

Chaque service expose `/metrics` au format Prometheus :
- `http_requests_total` — counter par méthode, route, status, service
- `http_request_duration_seconds` — histogram (buckets de 10ms à 5s)
- `http_errors_total` — counter sur status ≥ 400

### Partie 5 — Dashboard Grafana

Dashboard provisionné automatiquement (`grafana/provisioning/`) avec :
- Requests/sec par service (timeseries)
- Taux d'erreur en % (timeseries)
- Latence moyenne en ms (timeseries)
- P95 latence par service (timeseries)
- Requests par endpoint (timeseries)
- Stats globales (stat panels)

### Partie 6 — Simulation d'incident

```bash
# Trafic normal
./simulate.sh normal

# Simulation latence artificielle (3s sur service-orders)
./simulate.sh slow

# Simulation erreurs HTTP 500
./simulate.sh error

# Séquence complète
./simulate.sh all
```

### Partie 7 — Analyse

L'incident de latence est visible dans Jaeger via le span `GET /orders/slow` affiché en rouge (durée > seuil). La root cause est localisée sur `service-orders` via la cascade des spans. Les métriques Prometheus confirment l'augmentation de `http_request_duration_seconds` et Grafana visualise l'anomalie sur le panel P95.

### Partie 8 — Alertes Prometheus (optionnel)

Règles d'alerte à ajouter dans `prometheus/alerts.yml` :

```yaml
groups:
  - name: microservices
    rules:
      - alert: HighLatency
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 1
        for: 1m
        labels:
          severity: warning
        annotations:
          summary: "Latence P95 > 1s sur {{ $labels.service }}"

      - alert: HighErrorRate
        expr: rate(http_errors_total[5m]) / rate(http_requests_total[5m]) > 0.1
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Taux d'erreur > 10% sur {{ $labels.service }}"
```

---

## Structure du projet

```
observability-tp/
├── api-gateway/
│   ├── index.js
│   ├── package.json
│   └── Dockerfile
├── service-orders/
│   ├── index.js
│   ├── package.json
│   └── Dockerfile
├── service-users/
│   ├── index.js
│   ├── package.json
│   └── Dockerfile
├── prometheus/
│   └── prometheus.yml
├── grafana/
│   └── provisioning/
│       ├── datasources/prometheus.yml
│       └── dashboards/
│           ├── dashboard.yml
│           └── microservices.json
├── simulate.sh
├── docker-compose.yml
└── README.md
```

---

## Technologies

| Outil            | Rôle                              |
|------------------|-----------------------------------|
| Node.js / Express| Runtime & framework HTTP          |
| OpenTelemetry    | Instrumentation & propagation     |
| Jaeger           | Collecte et visualisation traces  |
| Prometheus       | Scraping et stockage métriques    |
| Grafana          | Dashboards et alertes             |
| Docker Compose   | Orchestration locale              |
