import { Command } from 'commander';
import { withIpc } from '../ipc-helper.js';
import { c, header, keyValue, divider } from '../colors.js';

export function guardrailCommand(): Command {
  const cmd = new Command('guardrail')
    .description('Guardrail Engine — self-protection: parameter bounds, circuit breaker, health checks');

  cmd.command('status')
    .description('Show guardrail engine status')
    .action(async () => {
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const status: any = await client.request('guardrail.status');

        console.log(header('Guardrail Status', '\u{1F6E1}\u{FE0F}'));
        console.log(keyValue('Circuit Breaker', status.circuitBreakerTripped ? c.red('TRIPPED') : c.green('OK')));
        if (status.circuitBreakerTripped && status.circuitBreakerReason) {
          console.log(keyValue('Reason', c.red(status.circuitBreakerReason)));
        }
        console.log(keyValue('Protected Paths', String(status.protectedPaths ?? 0)));
        console.log(keyValue('Parameter Bounds', String(status.parameterBounds ?? 0)));
        console.log(keyValue('Rollback History', String(status.rollbackCount ?? 0)));
        console.log(divider());
      });
    });

  cmd.command('health')
    .description('Run guardrail health check')
    .action(async () => {
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const health: any = await client.request('guardrail.health');

        console.log(header('Guardrail Health Report', '\u{1F3E5}'));
        const score = health.score ?? health.healthScore ?? 0;
        const color = score > 0.8 ? c.green : score > 0.5 ? c.orange : c.red;
        console.log(keyValue('Health Score', color(`${(score * 100).toFixed(1)}%`)));
        if (health.issues?.length) {
          console.log(keyValue('Issues', ''));
          for (const issue of health.issues) {
            console.log(`  ${c.red('\u{2022}')} ${issue}`);
          }
        } else {
          console.log(keyValue('Issues', c.green('None')));
        }
        console.log(divider());
      });
    });

  cmd.command('rollback')
    .description('Rollback parameter changes')
    .argument('[steps]', 'Number of steps to rollback', '1')
    .action(async (steps) => {
      await withIpc(async (client) => {
        const result = await client.request('guardrail.rollback', { steps: parseInt(steps, 10) });
        console.log(`  ${c.green('Rolled back')} ${steps} step(s)`);
        console.log(`  ${c.dim(JSON.stringify(result))}`);
      });
    });

  cmd.command('reset')
    .description('Reset the circuit breaker')
    .action(async () => {
      await withIpc(async (client) => {
        await client.request('guardrail.resetBreaker');
        console.log(`  ${c.green('Circuit breaker reset')}`);
      });
    });

  // Default action: status
  cmd.action(async () => {
    await cmd.commands.find(c => c.name() === 'status')!.parseAsync([], { from: 'user' });
  });

  return cmd;
}
