import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StdioClient, toolJSON } from './mcp-stdio.mjs';

const server = String.raw`process.stdin.setEncoding('utf8');let input='';process.stdin.on('data',chunk=>{input+=chunk;let i;while((i=input.indexOf('\n'))>=0){const line=input.slice(0,i);input=input.slice(i+1);const r=JSON.parse(line);if(!r.id)continue;if(r.method==='never')continue;if(r.method==='exit')process.exit(2);const response=r.method==='fail'?{error:{message:'rejected'}}:{result:{method:r.method,params:r.params}};process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:r.id,...response})+'\n');}});`;

test('stdio correlates requests, propagates remote errors and times out missing replies', async () => {
  const client = new StdioClient(process.execPath, ['-e', server]);
  try {
    const results = await Promise.all([client.request('first', { value: 7 }), client.request('second', {})]);
    assert.deepEqual(results[0], { method: 'first', params: { value: 7 } });
    assert.equal(results[1].method, 'second');
    await assert.rejects(client.request('fail', {}), /rejected/);
    await assert.rejects(client.request('never', {}, 25), /timed out/);
    await assert.rejects(client.request('exit', {}), /closed/);
  } finally { await client.close(); }
});

test('tool failures and malformed results cannot be counted as a passing suite', () => {
  assert.deepEqual(toolJSON({ content: [{ type: 'text', text: '### Result\n{"passed":1}\n### Ran Playwright code\nignored' }] }), { passed: 1 });
  assert.throws(() => toolJSON({ isError: true, content: [{ type: 'text', text: '### Error\nfailed' }] }), /failed/);
  assert.throws(() => toolJSON({ content: [{ type: 'text', text: 'not JSON' }] }), /result/);
});
