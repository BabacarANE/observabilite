'use strict';

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const { ExpressInstrumentation } = require('@opentelemetry/instrumentation-express');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'api-gateway',
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

const ORDERS_URL = process.env.ORDERS_URL || 'http://service-orders:3001';

function metricsMiddleware(req, res, next) {
  if (req.path === '/metrics') return next();
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    const labels = { method: req.method, route: req.path, status_code: res.statusCode, service: 'api-gateway' };
    httpRequestsTotal.inc(labels);
    end(labels);
    if (res.statusCode >= 400) httpErrorsTotal.inc({ method: req.method, route: req.path, service: 'api-gateway' });
  });
  next();
}

app.use(metricsMiddleware);

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'api-gateway' }));

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.get('/orders', async (req, res) => {
  try {
    const response = await axios.get(`${ORDERS_URL}/orders`);
    res.json({ source: 'api-gateway', data: response.data });
  } catch (err) {
    res.status(502).json({ error: 'Orders service unavailable', detail: err.message });
  }
});

app.get('/orders/:id', async (req, res) => {
  try {
    const response = await axios.get(`${ORDERS_URL}/orders/${req.params.id}`);
    res.json({ source: 'api-gateway', data: response.data });
  } catch (err) {
    const status = err.response?.status || 502;
    res.status(status).json({ error: err.response?.data || 'Orders service error' });
  }
});

app.get('/orders/slow', async (req, res) => {
  try {
    const response = await axios.get(`${ORDERS_URL}/orders/slow`);
    res.json({ source: 'api-gateway', data: response.data });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get('/orders/error', async (req, res) => {
  try {
    const response = await axios.get(`${ORDERS_URL}/orders/error`);
    res.json({ source: 'api-gateway', data: response.data });
  } catch (err) {
    const status = err.response?.status || 502;
    res.status(status).json({ error: err.response?.data || 'Orders service error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API Gateway running on :${PORT}`));

process.on('SIGTERM', async () => { await sdk.shutdown(); process.exit(0); });
