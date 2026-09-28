import http from 'node:http';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4173);
const sshConfig = existsSync(path.join(os.homedir(), '.ssh', 'config')) ? path.join(os.homedir(), '.ssh', 'config') : '/dev/null';
const ptyBridge = path.join(root, 'pty_bridge.py');
const pairCode = crypto.randomBytes(4).toString('hex').toUpperCase();
const sessions = new Map();
const sockets = new Set();
let pairFailures = [];
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };

function send(res, status, data, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(JSON.stringify(data));
}

function sessionFrom(req) {
  const value = req.headers.cookie?.split(';').map(x => x.trim()).find(x => x.startsWith('sshsid='))?.slice(7);
  return value && sessions.has(value) ? value : null;
}

function lanAddresses() {
  return Object.values(os.networkInterfaces()).flat().filter(n => n && n.family === 'IPv4' && !n.internal).map(n => n.address);
}

function isLoopbackAddress(address = '') {
  return address === '127.0.0.1' || address === '::1' || address.startsWith('::ffff:127.');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/api/status') return send(res, 200, { addresses: lanAddresses(), port, paired: Boolean(sessionFrom(req)) });
  if (req.method === 'POST' && url.pathname === '/api/pair') {
    pairFailures = pairFailures.filter(time => Date.now() - time < 60_000);
    if (pairFailures.length >= 8) return send(res, 429, { error: 'Too many attempts. Wait one minute and try again.' });
    let body = '';
    for await (const chunk of req) body += chunk;
    let entered = '';
    try { entered = JSON.parse(body).code || ''; } catch {}
    const a = Buffer.from(String(entered).toUpperCase());
    const b = Buffer.from(pairCode);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) { pairFailures.push(Date.now()); return send(res, 401, { error: 'That pairing code did not match.' }); }
    const id = crypto.randomBytes(32).toString('hex');
    sessions.set(id, Date.now());
    return send(res, 200, { ok: true }, { 'set-cookie': `sshsid=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200` });
  }
  if (req.method === 'POST' && url.pathname === '/api/logout') {
    const id = sessionFrom(req);
    if (id) sessions.delete(id);
    return send(res, 200, { ok: true }, { 'set-cookie': 'sshsid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
  }
  const filePath = path.resolve(root, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
  if (!filePath.startsWith(root + path.sep)) return send(res, 403, { error: 'Forbidden' });
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { 'content-type': mime[path.extname(filePath)] || 'application/octet-stream', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'cache-control': 'no-store' });
    res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
});

function websocketFrame(payload, opcode = 1) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  let header;
  if (body.length < 126) header = Buffer.from([0x80 | opcode, body.length]);
  else if (body.length < 65536) { header = Buffer.alloc(4); header[0] = 0x80 | opcode; header[1] = 126; header.writeUInt16BE(body.length, 2); }
  else { header = Buffer.alloc(10); header[0] = 0x80 | opcode; header[1] = 127; header.writeBigUInt64BE(BigInt(body.length), 2); }
  return Buffer.concat([header, body]);
}

function readFrame(buffer) {
  if (buffer.length < 2) return null;
  const opcode = buffer[0] & 15;
  let length = buffer[1] & 127;
  let offset = 2;
  if (length === 126) { if (buffer.length < 4) return null; length = buffer.readUInt16BE(2); offset = 4; }
  else if (length === 127) { if (buffer.length < 10) return null; length = Number(buffer.readBigUInt64BE(2)); offset = 10; }
  const masked = Boolean(buffer[1] & 128);
  const maskOffset = offset;
  if (masked) offset += 4;
  if (buffer.length < offset + length) return null;
  let payload = buffer.subarray(offset, offset + length);
  if (masked) { payload = Buffer.from(payload); for (let i = 0; i < length; i++) payload[i] ^= buffer[maskOffset + (i % 4)]; }
  return { opcode, payload, rest: buffer.subarray(offset + length) };
}

server.on('upgrade', (req, socket) => {
  const origin = req.headers.origin;
  if (!sessionFrom(req) || (origin && new URL(origin).host !== req.headers.host)) return socket.destroy();
  const key = req.headers['sec-websocket-key'];
  if (!key || req.url !== '/terminal') return socket.destroy();
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  sockets.add(socket);
  let terminal;
  let input = Buffer.alloc(0);
  let bridgeOutput = '';
  const write = (data, opcode = 1) => { if (!socket.destroyed) socket.write(websocketFrame(data, opcode)); };
  const closeTerminal = () => { if (terminal && !terminal.killed) terminal.kill('SIGTERM'); terminal = null; };
  socket.on('data', chunk => {
    input = Buffer.concat([input, chunk]);
    while (true) {
      const frame = readFrame(input);
      if (!frame) break;
      input = frame.rest;
      if (frame.opcode === 8) { socket.end(); return; }
      if (frame.opcode !== 1) continue;
      let message;
      try { message = JSON.parse(frame.payload.toString()); } catch { continue; }
      if (message.type === 'connect' && !terminal) {
        const localBrowser = isLoopbackAddress(socket.remoteAddress);
        const host = String(message.host || '').trim();
        if (!/^[a-zA-Z0-9._:@+-]{1,255}$/.test(host)) { write(JSON.stringify({ type: 'error', data: 'Use a host alias, hostname, or IP address.' })); continue; }
        const user = String(message.user || '').trim();
        const identity = String(message.identity || '').trim();
        if (user && !/^[a-zA-Z_][a-zA-Z0-9_.-]{0,62}\$?$/.test(user)) { write(JSON.stringify({ type: 'error', data: 'Login user contains unsupported characters.' })); continue; }
        if (user && host.includes('@')) { write(JSON.stringify({ type: 'error', data: 'Set the login user in one place: the User field or the host alias.' })); continue; }
        if (identity.length > 512 || identity.includes('\0')) { write(JSON.stringify({ type: 'error', data: 'Identity file path is invalid.' })); continue; }
        const timeout = Number(message.timeout);
        const keepalive = Number(message.keepalive);
        const connectTimeout = Number.isInteger(timeout) && timeout >= 5 && timeout <= 120 ? timeout : 15;
        const serverAliveInterval = Number.isInteger(keepalive) && keepalive >= 0 && keepalive <= 120 ? keepalive : 30;
        const args = ['-F', sshConfig, '-tt', '-o', `BatchMode=${localBrowser ? 'no' : 'yes'}`, '-o', 'StrictHostKeyChecking=yes', '-o', `ConnectTimeout=${connectTimeout}`, '-o', 'ConnectionAttempts=1'];
        if (serverAliveInterval) args.push('-o', `ServerAliveInterval=${serverAliveInterval}`, '-o', 'ServerAliveCountMax=3');
        if (message.verbose === true) args.push('-vv');
        if (user) args.push('-l', user);
        if (identity) args.push('-i', identity);
        if (message.port) {
          const sshPort = Number(message.port);
          if (!Number.isInteger(sshPort) || sshPort < 1 || sshPort > 65535) { write(JSON.stringify({ type: 'error', data: 'Port must be between 1 and 65535.' })); continue; }
          args.push('-p', String(sshPort));
        }
        args.push('--', host);
        write(JSON.stringify({ type: 'auth-capability', passwordPrompt: localBrowser }));
        write(JSON.stringify({ type: 'status', data: `Connecting to ${host}...` }));
        const cols = Math.min(300, Math.max(20, Number(message.cols) || 100));
        const rows = Math.min(120, Math.max(5, Number(message.rows) || 30));
        terminal = spawn('python3', ['-u', ptyBridge, JSON.stringify(args), String(cols), String(rows)], {
          cwd: os.homedir(),
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env, TERM: 'xterm-256color' }
        });
        terminal.stdout.on('data', data => {
          bridgeOutput += data.toString('utf8');
          let end;
          while ((end = bridgeOutput.indexOf('\n')) >= 0) {
            const line = bridgeOutput.slice(0, end);
            bridgeOutput = bridgeOutput.slice(end + 1);
            try {
              const event = JSON.parse(line);
              if (event.type === 'data') write(JSON.stringify({ type: 'output', data: Buffer.from(event.data, 'base64').toString('utf8') }));
              else if (event.type === 'exit') write(JSON.stringify({ type: 'status', data: `Connection closed (exit ${event.code}).` }));
              else if (event.type === 'started') write(JSON.stringify({ type: 'status', data: `SSH process started for ${host}` }));
            } catch { write(JSON.stringify({ type: 'error', data: 'Terminal bridge sent an invalid event.' })); }
          }
        });
        terminal.stderr.on('data', data => write(JSON.stringify({ type: 'error', data: data.toString('utf8') })));
        terminal.on('error', err => write(JSON.stringify({ type: 'error', data: `Could not start terminal bridge: ${err.message}` })));
        terminal.on('close', code => { terminal = null; bridgeOutput = ''; if (!socket.destroyed) write(JSON.stringify({ type: 'status', data: `Terminal bridge closed (exit ${code ?? 'unknown'}).` })); });
      } else if (message.type === 'input' && terminal) {
        const value = String(message.data || '');
        if (value.length <= 4096) terminal.stdin.write(`${JSON.stringify({ type: 'input', data: value })}\n`);
      } else if (message.type === 'resize' && terminal) {
        const cols = Math.min(300, Math.max(20, Number(message.cols) || 100));
        const rows = Math.min(120, Math.max(5, Number(message.rows) || 30));
        terminal.stdin.write(`${JSON.stringify({ type: 'resize', cols, rows })}\n`);
      } else if (message.type === 'disconnect') closeTerminal();
    }
  });
  socket.on('close', () => { sockets.delete(socket); closeTerminal(); });
  socket.on('error', () => { sockets.delete(socket); closeTerminal(); });
});

server.listen(port, '0.0.0.0', () => {
  console.log('\n  SSH STUDIO  |  Secure local console\n');
  console.log(`  Pairing code: ${pairCode}`);
  console.log(`  Local:       http://localhost:${port}`);
  for (const address of lanAddresses()) console.log(`  Network:     http://${address}:${port}`);
  console.log('\n  Keep this terminal open. Ctrl+C stops the server.\n');
});

function shutdown() { for (const socket of sockets) socket.destroy(); server.close(() => process.exit(0)); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
