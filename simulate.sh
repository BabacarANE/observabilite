#!/bin/bash
# ─────────────────────────────────────────────
# Simulation de charge et d'incidents
# Usage: ./simulate.sh [normal|slow|error|all]
# ─────────────────────────────────────────────

BASE_URL="${BASE_URL:-http://localhost:3000}"
MODE="${1:-all}"

echo "🚀 Démarrage de la simulation — mode: $MODE"
echo "Base URL: $BASE_URL"
echo ""

normal_traffic() {
  echo "📦 Génération de trafic normal..."
  for i in $(seq 1 20); do
    curl -s "$BASE_URL/orders" > /dev/null
    curl -s "$BASE_URL/orders/1" > /dev/null
    curl -s "$BASE_URL/orders/2" > /dev/null
    sleep 0.3
  done
  echo "✅ Trafic normal terminé"
}

slow_traffic() {
  echo "🐢 Simulation de latence (appels lents)..."
  for i in $(seq 1 5); do
    echo "  Appel lent $i/5..."
    curl -s "$BASE_URL/orders/slow" > /dev/null
    sleep 1
  done
  echo "✅ Simulation latence terminée"
}

error_traffic() {
  echo "💥 Simulation d'erreurs..."
  for i in $(seq 1 10); do
    curl -s "$BASE_URL/orders/error" > /dev/null
    curl -s "$BASE_URL/orders/999" > /dev/null
    sleep 0.5
  done
  echo "✅ Simulation erreurs terminée"
}

case $MODE in
  normal) normal_traffic ;;
  slow)   slow_traffic ;;
  error)  error_traffic ;;
  all)
    normal_traffic
    slow_traffic
    error_traffic
    normal_traffic
    ;;
  *)
    echo "Usage: $0 [normal|slow|error|all]"
    exit 1
    ;;
esac

echo ""
echo "📊 Résultats:"
echo "  - Jaeger:     http://localhost:16686"
echo "  - Prometheus: http://localhost:9090"
echo "  - Grafana:    http://localhost:3003 (admin/admin)"
