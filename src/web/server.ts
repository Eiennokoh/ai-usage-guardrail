/**
 * 簡易画面（外部ライブラリなし）。 npm run web → http://127.0.0.1:3000
 * APIキーがなければ自動で模擬モードになる。
 * 社内ネットワークの他の端末から使われないよう、このPCからだけ接続できるようにしている（127.0.0.1）。
 */
import { readFileSync } from 'node:fs';
import { createServer, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { getConfig, PROJECT_ROOT } from '../config';
import { loadTestCases } from '../evaluation';
import { createGuardrail } from '../index';
import { JsonlUsageLogger, summarizeByDepartment } from '../usage';

const config = getConfig();
const logger = new JsonlUsageLogger(config.logPath);
const guardrail = createGuardrail({ logger });
const html = readFileSync(join(PROJECT_ROOT, 'src/web/index.html'), 'utf8');
const samples = loadTestCases(config.testCasesPath).map(({ id, title, user, department, input }) => ({ id, title, user, department, input }));
const port = Number(process.env.PORT ?? 3000);
const HOST = '127.0.0.1';
/** 受け付けるリクエスト本文の上限（入力上限の文字数に余裕を持たせたバイト数） */
const MAX_BODY_BYTES = config.maxInputChars * 4 + 1024;

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

const send = (res: ServerResponse, status: number, body: unknown, type = 'application/json') => {
  res.writeHead(status, { 'content-type': `${type}; charset=utf-8` });
  res.end(type === 'application/json' ? JSON.stringify(body) : String(body));
};

async function readBody(req: AsyncIterable<Buffer>): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, '入力が大きすぎます');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/') return send(res, 200, html, 'text/html');
    if (req.method === 'GET' && req.url === '/api/samples') return send(res, 200, samples);
    if (req.method === 'GET' && req.url === '/api/summary') return send(res, 200, summarizeByDepartment(logger.readAll()));
    if (req.method === 'GET' && req.url === '/api/info') return send(res, 200, { mode: guardrail.mode, model: guardrail.mode === 'live' ? config.model : 'mock' });
    if (req.method === 'POST' && req.url === '/api/run') {
      let parsed: { user?: string; department?: string; prompt?: string };
      try {
        parsed = JSON.parse((await readBody(req)) || '{}');
      } catch (e) {
        if (e instanceof HttpError) throw e;
        throw new HttpError(400, 'リクエストの形式が正しくありません');
      }
      const { user, department, prompt } = parsed;
      if (typeof prompt !== 'string' || !prompt.trim()) return send(res, 400, { error: '依頼文を入力してください' });
      const result = await guardrail.run({ user: user || 'web-user', department: department || '未設定', prompt });
      return send(res, 200, result);
    }
    send(res, 404, { error: 'not found' });
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.message });
    send(res, 500, { error: e instanceof Error ? e.message : String(e) });
  }
}).listen(port, HOST, () => {
  console.log(`ai-usage-guardrail: http://${HOST}:${port}  （モード: ${guardrail.mode === 'live' ? 'Claude API' : '模擬'}）`);
});
