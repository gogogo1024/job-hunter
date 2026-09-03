#!/usr/bin/env tsx
/*
  Batch integration tests for MCP `search_jobs` over HTTP.
  Sends multiple JSON-RPC tools/call requests to the MCP HTTP server and
  asserts the response shape. Exits non-zero on any failing case.
*/

async function wait(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchWithRetries(url: string, opts: any, retries = 10, delay = 500) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fetch(url, opts);
    } catch (err) {
      if (i === retries - 1) throw err;
      await wait(delay);
    }
  }
  throw new Error('unreachable');
}

(async function main() {
  const serverUrl = process.env.MCP_URL ?? 'http://localhost:8787/';
  console.log('MCP server URL:', serverUrl);

  const testCases: Array<{ name?: string; arguments: any }> = [
    { name: 'city + technologies', arguments: { city: 'Toronto', technologies: ['TypeScript', 'Node.js'], limit: 3 } },
    { name: 'city Berlin + Go', arguments: { city: 'Berlin', technologies: ['Go'], limit: 2 } },
    { name: 'cities Islamabad', arguments: { cities: ['Islamabad'], technologies: ['Go'], limit: 3 } },
    { name: 'workModes onsite', arguments: { workModes: ['onsite'], limit: 5 } },
    { name: 'level mid', arguments: { levels: ['mid'], limit: 5 } },
    { name: 'exclude recruiters', arguments: { preferredTechnologies: ['Go'], excludeRecruiters: true, limit: 3 } },
    { name: 'minSalary', arguments: { minSalary: { currency: 'USD', amount: 100000 }, limit: 3 } },
    { name: 'country Pakistan', arguments: { countries: ['Pakistan'], limit: 5 } },
  ];

  let pass = 0;
  const results: any[] = [];

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    console.log(`\n--- Test ${i + 1}: ${tc.name ?? ''} ---`);
    console.log('arguments =', tc.arguments);

    const payload = { jsonrpc: '2.0', id: i + 1, method: 'tools/call', params: { name: 'search_jobs', arguments: tc.arguments } };

    let res: Response;
    try {
      res = await fetchWithRetries(serverUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
        body: JSON.stringify(payload),
      }, 20, 300);
    } catch (err: any) {
      console.error('request failed:', err?.message ?? String(err));
      results.push({ ok: false, error: String(err) });
      continue;
    }

    const text = await res.text();
    let parsed: any = null;

    // Handle SSE or plain JSON
    if (text.startsWith('event:') || res.headers.get('content-type')?.includes('text/event-stream')) {
      // Find last "data: " line
      const dataLines = text.split(/\r?\n/).filter((l) => l.startsWith('data: '));
      if (dataLines.length === 0) {
        console.error('no data lines in SSE response');
        results.push({ ok: false, raw: text });
        continue;
      }
      const lastData = dataLines[dataLines.length - 1].slice(6);
      const obj = JSON.parse(lastData);
      const resultPart = obj.result ?? obj;
      const contentArr = resultPart.content ?? [];
      const first = contentArr[0];
      if (!first) {
        console.error('no content in result', resultPart);
        results.push({ ok: false, parsed: resultPart });
        continue;
      }
      // Support both legacy text responses and structured resource payloads
      try {
        let payloadText: any = undefined;
        if (first.type === 'text' && typeof first.text === 'string') payloadText = first.text;
        else if (first.type === 'resource' && first.resource && first.resource.mimeType === 'application/json' && typeof first.resource.blob === 'string') payloadText = Buffer.from(first.resource.blob, 'base64').toString('utf8');
        else if (first.type === 'application/json' && typeof first.text === 'string') payloadText = first.text; // backward compat
        if (payloadText != null) parsed = JSON.parse(payloadText);
        else parsed = first;
      } catch (e) {
        parsed = first;
      }
    } else {
      // Assume JSON-RPC or JSON
      try {
        const j = JSON.parse(text);
        const resObj = j.result ?? j;
        const contentArr = resObj.content ?? [];
        const first = contentArr[0];
        if (first) {
          try {
            let payloadText: any = undefined;
            if (first.type === 'text' && typeof first.text === 'string') payloadText = first.text;
            else if (first.type === 'resource' && first.resource && first.resource.mimeType === 'application/json' && typeof first.resource.blob === 'string') payloadText = Buffer.from(first.resource.blob, 'base64').toString('utf8');
            else if (first.type === 'application/json' && typeof first.text === 'string') payloadText = first.text; // backward compat
            if (payloadText != null) parsed = JSON.parse(payloadText);
            else parsed = first;
          } catch (e) {
            parsed = first;
          }
        } else {
          parsed = resObj;
        }
      } catch (e) {
        console.error('failed to parse response body as JSON', e);
        results.push({ ok: false, raw: text });
        continue;
      }
    }

    // Validate parsed payload
    if (parsed && parsed.status === 'ok' && Array.isArray(parsed.results)) {
      const ok = parsed.results.every((r: any) => r && r.id && r.title && r.url);
      if (ok) {
        console.log(`✅ pass — results=${parsed.results.length}`);
        pass++;
        results.push({ ok: true, count: parsed.results.length });
      } else {
        console.error('❌ fail — missing fields in results', parsed.results.slice(0, 5));
        results.push({ ok: false, reason: 'missing fields', sample: parsed.results.slice(0, 5) });
      }
    } else {
      console.error('❌ fail — bad response', parsed);
      results.push({ ok: false, parsed });
    }

    // gentle throttle
    await wait(150);
  }

  console.log('\n=== Batch Summary ===');
  console.log(`passed ${pass} / ${testCases.length}`);
  console.log(JSON.stringify(results, null, 2));

  if (pass !== testCases.length) process.exitCode = 2;
  else process.exitCode = 0;
})();
