'use strict';

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const { ExpressInstrumentation } = require('@opentelemetry/instrumentation-express');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'service-orders',
  }),
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://jaeger:4318/v1/traces',
  }),
  instrumentations: [new HttpInstrumentation(), new ExpressInstrumentation()],
});

sdk.start();

const express = require('express');
const axios = require('axios');
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

const USERS_URL = process.env.USERS_URL || 'http://service-users:3002';

const ORDERS = [
  { id: '1', product: 'Laptop', amount: 1299, userId: '1' },
  { id: '2', product: 'Mouse', amount: 29, userId: '2' },
  { id: '3', product: 'Keyboard', amount: 89, userId: '1' },
  { id: '4', product: 'Monitor', amount: 399, userId: '3' },
];

function metricsMiddleware(req, res, next) {
  if (req.path === '/metrics') return next();
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    const labels = { method: req.method, route: req.path, status_code: res.statusCode, service: 'service-orders' };
    httpRequestsTotal.inc(labels);
    end(labels);
    if (res.statusCode >= 400) httpErrorsTotal.inc({ method: req.method, route: req.path, service: 'service-orders' });
  });
  next();
}

app.use(metricsMiddleware);

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'service-orders' }));

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.get('/orders', async (req, res) => {
  try {
    const usersRes = await axios.get(`${USERS_URL}/users`);
    const usersMap = Object.fromEntries(usersRes.data.map(u => [u.id, u]));
    const enriched = ORDERS.map(o => ({ ...o, user: usersMap[o.userId] || null }));
    res.json(enriched);
  } catch (err) {
    res.status(502).json({ error: 'Users service unavailable', detail: err.message });
  }
});

app.get('/orders/slow', async (req, res) => {
  await new Promise(r => setTimeout(r, 3000)); // artificial latency
  res.json({ message: 'Slow response after 3s', orders: ORDERS });
});

app.get('/orders/error', (req, res) => {
  res.status(500).json({ error: 'Simulated internal server error' });
});

app.get('/orders/:id', async (req, res) => {
  const order = ORDERS.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  try {
    const userRes = await axios.get(`${USERS_URL}/users/${order.userId}`);
    res.json({ ...order, user: userRes.data });
  } catch (err) {
    res.status(502).json({ error: 'Users service unavailable', detail: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Service Orders running on :${PORT}`));

process.on('SIGTERM', async () => { await sdk.shutdown(); process.exit(0); });
