#!/usr/bin/env node
/**
 * FlowPilot dev orchestrator.
 *
 * Starts all three services at once, prefixes each one's output with its name,
 * and tears everything down on Ctrl+C (or as soon as any single service exits).
 *
 *   node dev.mjs
 *
 * Services and ports:
 *   ai-backend  :3000   node --watch server.js
 *   backend     :4000   npm run dev        (node --watch src/server.js)
 *   frontend    :3100   npm run dev        (next dev; 3000 is taken by ai-backend)
 *
 * No dependencies — just Node 20+.
 */

import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const isWindows = process.platform === 'win32';
const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';

const services = [
  {
    name: 'ai-backend',
    color: '\x1b[35m', // magenta
    cwd: 'ai-backend',
    port: 3000,
    command: 'node --watch server.js',
  },
  {
    name: 'backend',
    color: '\x1b[36m', // cyan
    cwd: 'backend',
    port: 4000,
    command: 'npm run dev',
  },
  {
    name: 'frontend',
    color: '\x1b[32m', // green
    cwd: 'frontend',
    port: 3100,
    command: 'npm run dev',
    // `next dev` reads PORT (verified in the bundled Next 16 CLI docs).
    env: { PORT: '3100' },
  },
];

const children = [];
let shuttingDown = false;

function log(name, color, message) {
  for (const line of String(message).split(/\r?\n/)) {
    if (!line.trim()) continue;
    process.stdout.write(`${color}[${name}]${RESET} ${line}\n`);
  }
}

function start(service) {
  const child = spawn(service.command, {
    cwd: path.join(ROOT, service.cwd),
    env: { ...process.env, FORCE_COLOR: '1', ...(service.env || {}) },
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (data) => log(service.name, service.color, data));
  child.stderr.on('data', (data) => log(service.name, service.color, data));

  child.on('error', (error) => {
    log(service.name, RED, `failed to start: ${error.message}`);
  });

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    const how = signal ? `signal ${signal}` : `code ${code ?? '-'}`;
    log(service.name, RED, `exited (${how})`);
    shutdown(typeof code === 'number' ? code : 1);
  });

  children.push({ child, service });
  log(service.name, service.color, `starting: ${service.command}`);
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  process.stdout.write('\nStopping all services...\n');

  for (const { child } of children) {
    if (!child.pid || child.killed) continue;
    if (isWindows) {
      // /T kills the whole tree (cmd -> npm -> node), /F forces it.
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      child.kill('SIGTERM');
    }
  }

  setTimeout(() => process.exit(code), 1000).unref();
}

function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    const finish = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(400, () => finish(false));
  });
}

async function preflight() {
  const busy = [];
  for (const service of services) {
    if (await portInUse(service.port)) {
      busy.push(`${service.name} (port ${service.port})`);
    }
  }
  if (busy.length) {
    process.stdout.write(
      `${YELLOW}Warning:${RESET} these ports are already in use, so the services may fail to bind:\n` +
        busy.map((item) => `  - ${item}`).join('\n') +
        '\n\n'
    );
  }
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

await preflight();

for (const service of services) {
  start(service);
}

process.stdout.write(
  '\n' +
    'ai-backend  -> http://localhost:3000\n' +
    'backend     -> http://localhost:4000\n' +
    'frontend    -> http://localhost:3100\n' +
    'Press Ctrl+C to stop everything.\n\n'
);
