import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

export const name = 'dsh-chat-to-article'
export const inject = ['connection']
const ROUTE = '/api/chat-to-article'
const DEFAULTS = { provider: 'deepseek', openai: { model: 'gpt-4.1-mini', apiKey: '' }, deepseek: { model: 'deepseek-chat', apiKey: '' } }
const file = path.join(process.env.DSH_HOME || path.join(homedir(), '.dsh'), 'chat-to-article', 'settings.json')

async function readSettings() {
  try {
    const raw = JSON.parse(await readFile(file, 'utf8'))
    return { provider: raw.provider === 'openai' ? 'openai' : 'deepseek', openai: { ...DEFAULTS.openai, ...raw.openai }, deepseek: { ...DEFAULTS.deepseek, ...raw.deepseek } }
  } catch { return structuredClone(DEFAULTS) }
}
async function saveSettings(settings) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
  const temp = `${file}.${process.pid}.tmp`
  await writeFile(temp, JSON.stringify(settings), { encoding: 'utf8', mode: 0o600 })
  await rename(temp, file)
}
function publicSettings(s) {
  return { provider: s.provider, openai: { model: s.openai.model, hasKey: !!s.openai.apiKey }, deepseek: { model: s.deepseek.model, hasKey: !!s.deepseek.apiKey } }
}
function validateProvider(x) { if (x !== 'openai' && x !== 'deepseek') throw Error('未知服务商。'); return x }
function response(rpcId, result) { return Response.json({ type: 'server-response', rpcId, result }) }
function fail(rpcId, message) { return response(rpcId, { ok: false, error: { code: 'article/error', message, details: {} } }) }
async function callProvider(settings, instructions, input, isTest = false) {
  const provider = settings.provider
  const { apiKey, model } = settings[provider]
  if (!apiKey) throw Error(`请先保存 ${provider === 'openai' ? 'OpenAI' : 'DeepSeek'} API Key。`)
  const url = provider === 'openai' ? 'https://api.openai.com/v1/responses' : 'https://api.deepseek.com/chat/completions'
  const body = provider === 'openai'
    ? { model, instructions, input, store: false, ...(isTest ? { max_output_tokens: 16 } : {}) }
    : { model, messages: [{ role: 'system', content: instructions }, { role: 'user', content: input }], stream: false, ...(isTest ? { max_tokens: 16 } : {}) }
  const reply = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(isTest ? 20000 : 120000) })
  const data = await reply.json().catch(() => ({}))
  if (!reply.ok) throw Error(data.error?.message || `API 请求失败（HTTP ${reply.status}）`)
  return provider === 'openai'
    ? (data.output || []).filter(x => x.type === 'message').flatMap(x => x.content || []).filter(x => x.type === 'output_text').map(x => x.text).join('\n').trim()
    : String(data.choices?.[0]?.message?.content || '').trim()
}
function prepare(payload) {
  const messages = payload?.messages
  const marks = payload?.marks
  if (!Array.isArray(messages) || !Array.isArray(marks) || messages.length > 500 || marks.length > 300) throw Error('对话材料或标记格式不正确。')
  const rows = messages.map((m, i) => {
    if (!m || typeof m.text !== 'string' || m.text.length > 100000 || !m.text.trim()) throw Error(`第 ${i + 1} 条消息无效。`)
    return { role: m.role === 'user' ? 'user' : 'assistant', text: m.text }
  })
  if (!rows.length || JSON.stringify(rows).length > 800000) throw Error('当前可见的文本消息过多，请缩小范围。')
  for (const mark of marks) {
    if (!mark || !['keep','omit'].includes(mark.kind) || !Number.isInteger(mark.index) || typeof mark.quote !== 'string' || !mark.quote.trim() || mark.quote.length > 10000 || typeof mark.sourceText !== 'string') throw Error('标记数据无效。')
    if (rows[mark.index]?.text !== mark.sourceText || !mark.sourceText.includes(mark.quote)) throw Error('标记对应的消息已经变化，请更新标记后再生成。')
  }
  const excluded = [...new Set(marks.filter(m => m.kind === 'omit').map(m => m.quote))]
  const cleaned = rows.map(m => ({ ...m, text: excluded.reduce((t, q) => t.split(q).join(''), m.text).trim() })).filter(m => m.text)
  const required = [...new Set(marks.filter(m => m.kind === 'keep').map(m => m.quote))]
  if (required.some(q => !cleaned.some(m => m.text.includes(q)))) throw Error('有重点与排除内容冲突，请调整标记。')
  if (!cleaned.length) throw Error('排除后没有可生成文章的文本。')
  return { cleaned, required, excluded }
}
async function operate(payload) {
  const settings = await readSettings()
  switch (payload?.op) {
    case 'settings': return publicSettings(settings)
    case 'save-settings': {
      const provider = validateProvider(payload.provider)
      const model = String(payload.model || '').trim()
      if (!model || model.length > 120) throw Error('请输入有效的模型名称。')
      const key = String(payload.apiKey || '').trim()
      if (key.length > 500) throw Error('API Key 过长。')
      settings.provider = provider
      settings[provider].model = model
      if (key) settings[provider].apiKey = key
      await saveSettings(settings)
      return publicSettings(settings)
    }
    case 'test': { await callProvider(settings, '只回复 OK。', '回复 OK。', true); return { provider: settings.provider, model: settings[settings.provider].model } }
    case 'generate': {
      const { cleaned, required, excluded } = prepare(payload)
      const instructions = [
        '你是一位严谨的中文编辑。将聊天对话整理成独立、流畅、有标题和小标题的 Markdown 文章。',
        '必须融入所有【必须纳入】内容，每条重点原文须在正文中完整出现至少一次。',
        '【对话材料】已经删除用户排除的片段。不要臆测、恢复、提及或影射被排除的内容。',
        '只使用所给材料，不杜撰事实、出处或引文。清理重复和过程性话语。直接输出文章。'
      ].join('\n')
      // Excluded quotes are intentionally absent from the provider request.
      const article = await callProvider(settings, instructions, JSON.stringify({ '对话材料': cleaned, '必须纳入': required }))
      if (!article) throw Error('模型没有返回文章。')
      if (required.some(q => !article.includes(q))) throw Error('模型漏写了重点原文，文章已拦截。')
      if (excluded.some(q => article.includes(q))) throw Error('文章包含排除原文，文章已拦截。')
      return { article }
    }
    default: throw Error('未知操作。')
  }
}
export function apply(ctx) {
  ctx.effect(() => ctx.connection.fetch.register({
    path: ROUTE, methods: ['POST'], requestBody: 'buffered',
    fetch: async request => {
      let body
      try { body = await request.json() } catch { return new Response('invalid JSON', { status: 400 }) }
      const id = typeof body?.rpcId === 'string' ? body.rpcId : 'invalid-request'
      if (body?.type !== 'client-request' || body.method !== 'chat-to-article') return fail(id, '请求格式不正确。')
      try { return response(id, { ok: true, value: await operate(body.payload) }) }
      catch (error) { return fail(id, error instanceof Error ? error.message : String(error)) }
    }
  }))
}
