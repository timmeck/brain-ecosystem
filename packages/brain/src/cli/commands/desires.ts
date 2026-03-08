import { Command } from 'commander';
import { withIpc } from '../ipc-helper.js';
import { c, icons, header, divider } from '../colors.js';

export function desiresCommand(): Command {
  return new Command('desires')
    .description('Show Brain self-improvement desires and wishes')
    .option('-a, --all', 'Show all desires (not just top 5)')
    .action(async (opts) => {
      console.log(header('Brain Desires', icons.brain));
      console.log();

      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const desires = await client.request('desires.structured', {}) as any[];
        const limit = opts.all ? desires.length : 5;

        if (desires.length === 0) {
          console.log(`  ${c.green('All systems healthy — no improvement desires right now.')}`);
          console.log(`\n${divider()}`);
          return;
        }

        console.log(`  ${c.dim(`${desires.length} desire(s) found, showing top ${Math.min(limit, desires.length)}:`)}`);
        console.log();

        for (const desire of desires.slice(0, limit)) {
          const prio = desire.priority >= 8 ? c.red(`P${desire.priority}`)
            : desire.priority >= 5 ? c.orange(`P${desire.priority}`)
            : c.dim(`P${desire.priority}`);
          console.log(`  ${prio}  ${c.value(desire.suggestion)}`);
          if (desire.alternatives.length > 0) {
            console.log(`       ${c.dim(`Alternative: ${desire.alternatives[0]}`)}`);
          }
        }

        // Also show the text-form suggestions
        const textSuggestions = await client.request('desires.suggestions', {}) as string[];
        if (textSuggestions.length > 0) {
          console.log();
          console.log(`  ${icons.insight}  ${c.cyan.bold('Active Thought-Stream Desires:')}`);
          for (const s of textSuggestions.slice(0, 3)) {
            console.log(`     ${c.dim('→')} ${s.substring(0, 120)}${s.length > 120 ? '...' : ''}`);
          }
        }

        console.log(`\n${divider()}`);
      });
    });
}
