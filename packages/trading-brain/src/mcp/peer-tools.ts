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

export function registerPeerTools(server: McpServer, ipc: IpcClient): void {
  registerPeerToolsWithCaller(server, (method, params) => ipc.request(method, params));
}

export function registerPeerToolsDirect(server: McpServer, router: IpcRouter): void {
  registerPeerToolsWithCaller(server, (method, params) => router.handle(method, params));
}

function registerPeerToolsWithCaller(server: McpServer, call: BrainCall): void {

  server.tool(
    'trading_peer_status',
    'Get Trading Brain peer network status: discovery state, online/offline peers, knowledge summaries',
    {},
    async () => {
      const status: AnyResult = await call('peer.status', {});
      const lines = [
        '# Trading Peer Network Status',
        `**Brain:** ${status.brainName} | **Discovery:** ${status.discoveryActive ? 'Active' : 'Inactive'}`,
        `**Online:** ${status.onlinePeers} | **Offline:** ${status.offlinePeers} | **Total Discovered:** ${status.totalDiscovered}`,
        '',
      ];
      if (status.peers?.length > 0) {
        lines.push('## Discovered Peers');
        lines.push('| Name | Status | Version | Principles | Hypotheses | Experiments | Last Seen |');
        lines.push('|------|--------|---------|------------|------------|-------------|-----------|');
        for (const p of status.peers) {
          const ago = Math.round((Date.now() - p.lastSeen) / 1000);
          lines.push(`| ${p.name} | ${p.status === 'online' ? 'Online' : 'Offline'} | ${p.packageVersion} | ${p.knowledgeSummary?.principles ?? 0} | ${p.knowledgeSummary?.hypotheses ?? 0} | ${p.knowledgeSummary?.experiments ?? 0} | ${ago}s ago |`);
        }
      } else {
        lines.push('*No peers discovered yet*');
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'trading_peer_list',
    'List all discovered Trading Brain peers with connection details',
    {},
    async () => {
      const peers: AnyResult = await call('peer.list', {});
      const lines = ['# Trading Discovered Peers', ''];
      if (peers?.length > 0) {
        for (const p of peers) {
          const ago = Math.round((Date.now() - p.lastSeen) / 1000);
          lines.push(`## ${p.name} (${p.status})`);
          lines.push(`- **Version:** ${p.packageVersion}`);
          lines.push(`- **HTTP Port:** ${p.httpPort}`);
          lines.push(`- **Pipe:** ${p.pipeName}`);
          lines.push(`- **Knowledge:** ${p.knowledgeSummary?.principles ?? 0} principles, ${p.knowledgeSummary?.hypotheses ?? 0} hypotheses, ${p.knowledgeSummary?.experiments ?? 0} experiments`);
          lines.push(`- **Last Seen:** ${ago}s ago`);
          lines.push(`- **Discovered:** ${new Date(p.discoveredAt).toISOString()}`);
          lines.push('');
        }
      } else {
        lines.push('*No peers discovered yet*');
      }
      return textResult(lines.join('\n'));
    },
  );
}
