import net from 'node:net';

const pipePath = String.raw`\\.\pipe\brain`;
const socket = net.createConnection(pipePath, () => {
  const req = JSON.stringify({ id: '1', method: 'orchestrator.feedback', params: {} }) + '\n';
  socket.write(req);
  console.log('Feedback cycle triggered via orchestrator.feedback...');
});

let data = '';
socket.on('data', d => {
  data += d.toString();
  if (data.includes('\n')) {
    console.log('Done!', data.trim());
    socket.destroy();
    process.exit(0);
  }
});
socket.on('error', e => { console.error('Error:', e.message); process.exit(1); });

setTimeout(() => {
  console.log('Timeout — check dashboard.');
  socket.destroy();
  process.exit(0);
}, 30000);
