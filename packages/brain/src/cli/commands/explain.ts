import { Command } from 'commander';
import { withIpc } from '../ipc-helper.js';
import { c, icons } from '../colors.js';

export function explainCommand(): Command {
  return new Command('explain')
    .description('Show everything Brain knows about an error')
    .argument('<errorId>', 'Error ID to explain')
    .action(async (errorId) => {
      const id = parseInt(errorId, 10);
      if (isNaN(id)) {
        console.error(`${icons.error} Invalid error ID: ${errorId}`);
        process.exit(1);
      }

      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: any = await client.request('analytics.explain', { errorId: id });

        if (!result.error) {
          console.error(`${icons.error} Error #${id} not found.`);
          return;
        }

        const err = result.error;
        console.log();
        console.log(`${icons.brain}  ${c.heading(`Error #${err.id} — ${err.type}`)}`);
        console.log(`${c.dim('─'.repeat(60))}`);
        console.log(`  ${c.label('Message:')}   ${err.message}`);
        console.log(`  ${c.label('File:')}      ${err.file_path ?? 'unknown'}`);
        console.log(`  ${c.label('Context:')}   ${err.context ?? 'none'}`);
        console.log(`  ${c.label('Seen:')}      ${err.occurrence_count}x (first: ${err.first_seen}, last: ${err.last_seen})`);
        console.log(`  ${c.label('Resolved:')}  ${err.resolved ? c.success('Yes') : c.error('No')}`);
        console.log(`  ${c.label('Synapses:')}  ${result.synapseConnections} connections`);

        // Error Chain
        if (result.chain.parents.length > 0 || result.chain.children.length > 0) {
          console.log();
          console.log(`  ${c.heading('Error Chain:')}`);
          for (const p of result.chain.parents) {
            console.log(`    ${c.dim('↑')} Caused by: #${p.id} ${p.type}: ${p.message.slice(0, 60)}`);
          }
          console.log(`    ${c.info('→')} #${err.id} ${err.type}`);
          for (const ch of result.chain.children) {
            console.log(`    ${c.dim('↓')} Led to: #${ch.id} ${ch.type}: ${ch.message.slice(0, 60)}`);
          }
        }

        // Solutions
        if (result.solutions.length > 0) {
          console.log();
          console.log(`  ${c.heading('Solutions:')}`);
          for (const s of result.solutions) {
            const rate = `${Math.round(s.successRate * 100)}%`;
            console.log(`    ${icons.ok} #${s.id}: ${s.description.slice(0, 80)} (success: ${rate}, confidence: ${s.confidence.toFixed(2)})`);
          }
        } else {
          console.log();
          console.log(`  ${c.dim('No solutions found.')}`);
        }

        // Related Errors
        if (result.relatedErrors.length > 0) {
          console.log();
          console.log(`  ${c.heading('Related Errors:')}`);
          for (const r of result.relatedErrors.slice(0, 5)) {
            console.log(`    ${c.dim('~')} #${r.id} ${r.type}: ${r.message.slice(0, 60)} (${Math.round(r.similarity * 100)}%)`);
          }
        }

        // Rules
        if (result.rules.length > 0) {
          console.log();
          console.log(`  ${c.heading('Applicable Rules:')}`);
          for (const r of result.rules) {
            console.log(`    ${icons.gear} #${r.id}: ${r.action} (confidence: ${r.confidence.toFixed(2)})`);
          }
        }

        console.log();
      });
    });
}
