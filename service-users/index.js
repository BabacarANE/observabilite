'use strict';

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const { ExpressInstrumentation } = require('@opentelemetry/instrumentation-express');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'service-users',
  }),
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://jaeger:4318/v1/traces',
  }),
  instrumentations: [new HttpInstrumentation(), new ExpressInstrumentation()],
});

sdk.start();

const express = require('express');
const promClient = require('prom-client');

const app = express();
const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

const httpRequestsTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code', 'service'],
  registers: [register],
});

const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code', 'service'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [register],
});

const httpErrorsTotal = new promClient.Counter({
  name: 'http_errors_total',
  help: 'Total number of HTTP errors',
  labelNames: ['method', 'route', 'service'],
  registers: [register],
});

const USERS = [
  { id: '1', name: 'Alice Martin', email: 'alice@example.com', role: 'admin' },
  { id: '2', name: 'Bob Dupont', email: 'bob@example.com', role: 'user' },
  { id: '3', name: 'Charlie Durand', email: 'charlie@example.com', role: 'user' },
];

function metricsMiddleware(req, res, next) {
  if (req.path === '/metrics') return next();
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    const labels = { method: req.method, route: req.path, status_code: res.statusCode, service: 'service-users' };
    httpRequestsTotal.inc(labels);
    end(labels);
    if (res.statusCode >= 400) httpErrorsTotal.inc({ method: req.method, route: req.path, service: 'service-users' });
  });
  next();
}

app.use(metricsMiddleware);

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'service-users' }));

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.get('/users', (req, res) => res.json(USERS));

app.get('/users/:id', (req, res) => {
  const user = USERS.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log(`Service Users running on :${PORT}`));

process.on('SIGTERM', async () => { await sdk.shutdown(); process.exit(0); });
