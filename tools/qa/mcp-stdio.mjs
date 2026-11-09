import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

// MCP stdio: newline-delimited JSON-RPC, no shell or browser launcher fallback.
// https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
export class StdioClient {
  #next = 0;
  #pending = new Map();
  #closed = false;
  constructor(command, args) {
    this.process = spawn(command, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.diagnostic = '';
    this.process.stderr.setEncoding('utf8');
    this.process.stderr.on('data', chunk => { this.diagnostic = (this.diagnostic + chunk).slice(-4000); });
    const fail = error => {
      this.#closed = true;
      for (const { reject, timer } of this.#pending.values()) { clearTimeout(timer); reject(error); }
      this.#pending.clear();
    };
    this.process.on('error', fail);
    this.process.stdin.on('error', fail);
    this.process.on('close', code => fail(Error(`MCP closed (${code}). ${this.diagnostic}`)));
    this.lines = createInterface({ input: this.process.stdout });
    this.lines.on('line', line => {
      let message;
      try { message = JSON.parse(line); } catch { fail(Error('Invalid MCP stdio response')); return; }
      const request = this.#pending.get(message.id);
      if (!request) return;
      this.#pending.delete(message.id); clearTimeout(request.timer);
      if (message.error) request.reject(Error(message.error.message));
      else request.resolve(message.result);
    });
  }
  notify(method, params = {}) {
    if (this.#closed) throw Error('MCP closed');
    this.process.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  }
  request(method, params, timeout = 60000) {
    if (this.#closed) return Promise.reject(Error('MCP closed'));
    const id = ++this.#next;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.#pending.delete(id); reject(Error(`MCP ${method} timed out`)); }, timeout);
      this.#pending.set(id, { resolve, reject, timer });
      this.process.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }
  async close() {
    // EOF disconnects this MCP client; never call browser_close or kill Chrome.
    this.process.stdin.end();
    if (this.#closed) return;
    await new Promise(resolve => {
      const timer = setTimeout(() => { this.process.kill(); resolve(); }, 3000);
      this.process.once('close', () => { clearTimeout(timer); resolve(); });
    });
    this.lines.close();
  }
}

export function toolJSON(result) {
  const text = (result?.content ?? []).filter(item => item.type === 'text').map(item => item.text).join('\n');
  if (result?.isError) throw Error(text.split('### Ran Playwright code')[0].slice(0, 5000));
  const match = text.match(/### Result\s*\n([\s\S]*?)(?:\n### |$)/);
  if (!match) throw Error('Missing JSON tool result');
  try { return JSON.parse(match[1]); } catch { throw Error('Invalid JSON tool result'); }
}
