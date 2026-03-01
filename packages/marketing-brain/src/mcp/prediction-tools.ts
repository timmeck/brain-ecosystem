import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { IpcClient } from '@timmeck/brain-core';
import type { IpcRouter } from '../ipc/router.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyResult = any;
type BrainCall = (method: string, params?: unknown) => Promise<unknown> | unknown;

function textResult(data: unknown): { content: Array<{ type: 'text'; text: string }> } {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: 'text' as const, text }] };
}

/** Register prediction tools using IPC client (for stdio MCP transport) */
export function registerPredictionTools(server: McpServer, ipc: IpcClient): void {
  registerPredictionToolsWithCaller(server, (method, params) => ipc.request(method, params));
}

/** Register prediction tools using router directly (for HTTP MCP transport inside daemon) */
export function registerPredictionToolsDirect(server: McpServer, router: IpcRouter): void {
  registerPredictionToolsWithCaller(server, (method, params) => router.handle(method, params));
}

function registerPredictionToolsWithCaller(server: McpServer, call: BrainCall): void {

  server.tool(
    'marketing_predict',
    'Generate a marketing prediction for a specific metric. Forecasts post counts, engagement rates, reach trends using Holt-Winters / EWMA.',
    {
      metric: z.string().describe('Metric name (e.g. "post_count", "engagement_rate", "reach")'),
      domain: z.enum(['error', 'trade', 'engagement', 'metric', 'custom']).optional().describe('Prediction domain (default: engagement)'),
      reasoning: z.string().optional().describe('Human-readable reason for the prediction'),
    },
    async (params) => {
      const result: AnyResult = await call('predict.make', {
        domain: params.domain ?? 'engagement',
        metric: params.metric,
        reasoning: params.reasoning,
      });
      if (!result) return textResult('Not enough data to generate prediction (need ≥ 2 data points).');
      const lines = [
        `Marketing Prediction: ${result.metric}`,
        `  Direction: ${result.predicted_direction}`,
        `  Value: ${result.predicted_value?.toFixed?.(4) ?? result.predicted_value}`,
        `  Confidence: ${((result.confidence ?? 0) * 100).toFixed(1)}%`,
        `  Method: ${result.method}`,
        `  Horizon: ${((result.horizon_ms ?? 0) / 60_000).toFixed(0)} min`,
        `  ID: ${result.prediction_id}`,
      ];
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'marketing_prediction_accuracy',
    'Get marketing prediction accuracy statistics: hit rate, mean error, calibration. Shows forecasting quality for engagement metrics.',
    {
      domain: z.enum(['error', 'trade', 'engagement', 'metric', 'custom']).optional().describe('Filter by domain'),
    },
    async (params) => {
      const accuracy: AnyResult[] = await call('predict.accuracy', { domain: params.domain }) as AnyResult[];
      if (!accuracy?.length) return textResult('No resolved predictions yet.');
      const lines = ['Marketing Prediction Accuracy:\n'];
      for (const a of accuracy) {
        lines.push(`  ${a.domain}: ${((a.accuracy_rate ?? 0) * 100).toFixed(1)}% accuracy (${a.correct}/${a.total - (a.expired ?? 0)} resolved)`);
        lines.push(`    Direction: ${((a.direction_accuracy ?? 0) * 100).toFixed(1)}% | MAE: ${(a.mean_absolute_error ?? 0).toFixed(4)} | Calibration: ${((a.calibration_score ?? 0) * 100).toFixed(1)}%`);
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'marketing_predictions_list',
    'List recent marketing predictions with status (pending/correct/wrong/partial/expired).',
    {
      domain: z.enum(['error', 'trade', 'engagement', 'metric', 'custom']).optional(),
      status: z.enum(['pending', 'correct', 'wrong', 'expired', 'partial']).optional(),
      limit: z.number().optional().describe('Max results (default: 20)'),
    },
    async (params) => {
      const predictions: AnyResult[] = await call('predict.list', {
        domain: params.domain,
        status: params.status,
        limit: params.limit ?? 20,
      }) as AnyResult[];
      if (!predictions?.length) return textResult('No predictions yet.');
      const lines = [`Marketing Predictions (${predictions.length}):\n`];
      for (const p of predictions) {
        const tag = p.status === 'correct' ? 'OK' : p.status === 'wrong' ? 'WRONG' : p.status === 'partial' ? 'PARTIAL' : p.status === 'expired' ? 'EXPIRED' : 'PENDING';
        lines.push(`  [${tag}] ${p.metric}: ${p.predicted_direction} to ${p.predicted_value?.toFixed?.(4) ?? p.predicted_value} (${((p.confidence ?? 0) * 100).toFixed(0)}%)`);
        if (p.actual_value != null) lines.push(`    Actual: ${p.actual_value?.toFixed?.(4) ?? p.actual_value} | Error: ${((p.error ?? 0) * 100).toFixed(1)}%`);
      }
      return textResult(lines.join('\n'));
    },
  );
}
