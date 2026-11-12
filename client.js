window.__ModuleLoader__.load({
  id: 'dsh-chat-to-article',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const PREFIX = 'dsh-chat-to-article:marks:'
    const defaults = { provider: 'deepseek', openai: { model: 'gpt-4.1-mini', hasKey: false }, deepseek: { model: 'deepseek-chat', hasKey: false } }
    let dockSessionId = ''

    function styles() {
      if (document.getElementById('dsh-chat-to-article-css')) return
      const style = document.createElement('style')
      style.id = 'dsh-chat-to-article-css'
      style.textContent = `
        .cta-launch{position:fixed;right:18px;bottom:18px;z-index:10000;pointer-events:auto;border:1px solid var(--dsw-alias-border-l2,#bbb);border-radius:999px;padding:9px 14px;background:var(--dsw-alias-button-floating-fill,#fff);color:var(--dsw-alias-label-primary,#222);box-shadow:0 5px 24px #0002;cursor:pointer;font:13px system-ui}
        .cta-pop{position:fixed;z-index:10002;display:flex;gap:4px;padding:5px;border:1px solid var(--dsw-alias-border-l2,#bbb);border-radius:9px;background:var(--dsw-alias-button-floating-fill,#fff);box-shadow:0 8px 26px #0003;pointer-events:auto}
        .cta-pop button,.cta-panel button{font:inherit;cursor:pointer}
        .cta-pop button{border:0;border-radius:6px;padding:6px 10px;background:transparent;color:var(--dsw-alias-label-primary,#222)}
        .cta-pop button:hover{background:var(--dsw-alias-interactive-bg-hover,#eee)}
        .cta-panel{position:fixed;z-index:10001;top:18px;right:18px;bottom:18px;width:min(420px,calc(100vw - 36px));box-sizing:border-box;display:flex;flex-direction:column;gap:12px;padding:18px;border:1px solid var(--dsw-alias-border-l2,#bbb);border-radius:14px;background:var(--dsw-alias-button-floating-fill,#fff);color:var(--dsw-alias-label-primary,#222);box-shadow:0 12px 40px #0003;font:13px system-ui;pointer-events:auto;overflow:auto}
        .cta-head,.cta-row{display:flex;align-items:center;justify-content:space-between;gap:8px}
        .cta-head h2{font-size:17px;margin:0}.cta-panel h3{font-size:14px;margin:0 0 7px}.cta-panel p{margin:0;line-height:1.5}
        .cta-muted{color:var(--dsw-alias-label-tertiary,#666)}.cta-error{color:#bc3545}.cta-ok{color:#16824b}
        .cta-panel section{border-top:1px solid var(--dsw-alias-border-l2,#ddd);padding-top:12px}
        .cta-panel input,.cta-panel select,.cta-panel textarea{box-sizing:border-box;width:100%;padding:8px;border:1px solid var(--dsw-alias-border-l2,#bbb);border-radius:7px;background:var(--dsw-alias-interactive-bg-hover-solid,#fff);color:var(--dsw-alias-label-primary,#222);font:inherit}
        .cta-panel label{display:block;margin:8px 0 4px}.cta-panel textarea{min-height:180px;resize:vertical;font-family:ui-monospace,SFMono-Regular,monospace;line-height:1.5}
        .cta-btns{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}.cta-btns button,.cta-close{border:1px solid var(--dsw-alias-border-l2,#bbb);border-radius:7px;padding:7px 10px;background:var(--dsw-alias-interactive-bg-hover-solid,#f5f5f5);color:inherit}
        .cta-btns button:disabled{opacity:.5;cursor:default}.cta-primary{background:#2168d9!important;border-color:#2168d9!important;color:white!important}
        .cta-mark{display:flex;gap:7px;align-items:flex-start;padding:7px 0;border-bottom:1px solid var(--dsw-alias-border-l2,#eee)}
        .cta-mark span{min-width:0;flex:1;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;white-space:pre-wrap}
        .cta-mark button{border:0;background:transparent;color:var(--dsw-alias-label-tertiary,#666)}
      `
      document.head.append(style)
    }
    function getMarks(sessionId) {
      if (!sessionId) return []
      try {
        const value = JSON.parse(localStorage.getItem(PREFIX + sessionId) || '[]')
        return Array.isArray(value) ? value.filter(m => m && ['keep', 'omit'].includes(m.kind) && typeof m.quote === 'string' && typeof m.key === 'string') : []
      } catch { return [] }
    }
    function setStoredMarks(sessionId, marks) {
      if (!sessionId) throw Error('当前会话 ID 尚未就绪。')
      localStorage.setItem(PREFIX + sessionId, JSON.stringify(marks))
    }
    function getFlow(preferred) {
      if (preferred && preferred.isConnected) return preferred
      return document.querySelector('[data-chat-flow]')
    }
    function legacySource(row, kind) {
      return kind === 'user' || kind === 'steering'
        ? row.querySelector('[class$="_bubble"]')
        : row.querySelector('[class$="_body"]')
    }
    function sourceText(source, legacy) {
      if (!legacy) return String(source.innerText || source.textContent || '').trim()
      const copy = source.cloneNode(true)
      copy.querySelectorAll('button,input,textarea,nav,aside,footer,[role="button"],[data-variant="think"],[data-message-attachments],[class$="_actions"],[class$="_stopped"]').forEach(el => el.remove())
      return String(copy.innerText || copy.textContent || '').trim()
    }
    function rowsIn(flow) {
      if (!flow) return []
      const rows = []
      const flowRows = [...flow.querySelectorAll('[data-chat-flow-kind]')]
      for (const row of flowRows) {
        if (!row || row.hasAttribute('hidden') || row.closest('[hidden]')) continue
        const kind = row.getAttribute('data-chat-flow-kind')
        if (!['user', 'steering', 'assistant', 'assistant-step'].includes(kind)) continue
        const modern = [...row.querySelectorAll('[data-text-interaction-source]')].filter(source => !source.parentElement?.closest('[data-text-interaction-source]'))
        const sources = modern.length ? modern : [legacySource(row, kind)].filter(Boolean)
        const rowKey = row.getAttribute('data-chat-node-key') || row.getAttribute('data-chat-flow-key') || ''
        for (let ordinal = 0; ordinal < sources.length; ordinal++) {
          const source = sources[ordinal]
          const text = sourceText(source, !modern.length)
          if (!text) continue
          const key = `${rowKey || `row-${flowRows.indexOf(row)}`}:${ordinal}`
          rows.push({ key, role: kind === 'user' || kind === 'steering' ? 'user' : 'assistant', text, source })
        }
      }
      return rows
    }
    function selectionIn(flow) {
      const selection = document.getSelection()
      if (!selection || selection.isCollapsed || !selection.rangeCount) return null
      const start = selection.anchorNode?.nodeType === 1 ? selection.anchorNode : selection.anchorNode?.parentElement
      const end = selection.focusNode?.nodeType === 1 ? selection.focusNode : selection.focusNode?.parentElement
      if (!start || !end || start.closest('input,textarea,[contenteditable="true"],[data-composer-card]')) return null
      let source = start.closest('[data-text-interaction-source]')
      if (!source) {
        const row = start.closest('[data-chat-flow-kind]')
        source = row && legacySource(row, row.getAttribute('data-chat-flow-kind'))
      }
      if (!source || !flow?.contains(source) || !source.contains(start) || !source.contains(end)) return null
      if (start.closest('[data-variant="think"],[data-message-attachments],button,[role="button"]') || end.closest('[data-variant="think"],[data-message-attachments],button,[role="button"]')) return null
      const rows = rowsIn(flow)
      const row = rows.find(x => x.source === source)
      if (!row) return null
      const quote = selection.toString().trim()
      if (!quote || quote.length > 10000 || !row.text.includes(quote)) return null
      const rect = selection.getRangeAt(0).getBoundingClientRect()
      if (!rect || (!rect.width && !rect.height)) return null
      return { key: row.key, sourceText: row.text, quote, left: Math.max(8, Math.min(rect.left, innerWidth - 190)), top: Math.max(8, rect.top - 45) }
    }
    function DockBridge(props) {
      React.useEffect(() => {
        dockSessionId = typeof props.sessionId === 'string' ? props.sessionId : ''
        window.dispatchEvent(new Event('dsh-chat-to-article-session'))
        return () => {
          if (dockSessionId === props.sessionId) {
            dockSessionId = ''
            window.dispatchEvent(new Event('dsh-chat-to-article-session'))
          }
        }
      }, [props.sessionId])
      return null
    }
    function App(props) {
      const [, setDockVersion] = React.useState(0)
      React.useEffect(() => {
        const changed = () => setDockVersion(v => v + 1)
        window.addEventListener('dsh-chat-to-article-session', changed)
        return () => window.removeEventListener('dsh-chat-to-article-session', changed)
      }, [])
      const fromStore = props.useSessions(s => s.current)
      const sessionId = typeof fromStore === 'string' && fromStore ? fromStore : dockSessionId
      const [open, setOpen] = React.useState(false)
      const [popup, setPopup] = React.useState(null)
      const [marks, setMarks] = React.useState([])
      const [settings, setSettings] = React.useState(defaults)
      const [provider, setProvider] = React.useState('deepseek')
      const [model, setModel] = React.useState(defaults.deepseek.model)
      const [apiKey, setApiKey] = React.useState('')
      const [article, setArticle] = React.useState('')
      const [busy, setBusy] = React.useState('')
      const [status, setStatus] = React.useState('')
      const [error, setError] = React.useState('')
      const flowRef = React.useRef(null)
      const popupRef = React.useRef(null)
      const interactingRef = React.useRef(false)
      const revisionRef = React.useRef(0)
      const sessionRef = React.useRef(sessionId)
      sessionRef.current = sessionId

      React.useEffect(() => {
        setMarks(getMarks(sessionId))
        setPopup(null)
        setArticle('')
        setError('')
        setStatus('')
        flowRef.current = null
        revisionRef.current++
      }, [sessionId])
      React.useEffect(() => {
        let alive = true
        props.rpc('settings').then(value => {
          if (!alive) return
          setSettings(value)
          setProvider(value.provider)
          setModel(value[value.provider].model)
        }).catch(e => { if (alive) setError(e.message) })
        return () => { alive = false }
      }, [])
      React.useEffect(() => {
        let dragging = false
        const update = () => {
          if (dragging || interactingRef.current) return
          const flow = getFlow(flowRef.current)
          if (flow) flowRef.current = flow
          setPopup(selectionIn(flow))
        }
        const down = e => {
          if (popupRef.current?.contains(e.target)) { interactingRef.current = true; return }
          dragging = true
          setPopup(null)
        }
        const up = e => {
          dragging = false
          if (popupRef.current?.contains(e.target)) return
          interactingRef.current = false
          update()
        }
        const hide = () => { if (!interactingRef.current) setPopup(null) }
        document.addEventListener('selectionchange', update)
        document.addEventListener('pointerdown', down, true)
        document.addEventListener('pointerup', up, true)
        document.addEventListener('scroll', hide, true)
        window.addEventListener('resize', hide)
        return () => {
          document.removeEventListener('selectionchange', update)
          document.removeEventListener('pointerdown', down, true)
          document.removeEventListener('pointerup', up, true)
          document.removeEventListener('scroll', hide, true)
          window.removeEventListener('resize', hide)
        }
      }, [sessionId])

      function changeMarks(next) {
        setStoredMarks(sessionId, next)
        setMarks(next)
        revisionRef.current++
      }
      function addMark(kind) {
        try {
          if (!popup) return
          const rows = rowsIn(getFlow(flowRef.current))
          if (!rows.some(r => r.key === popup.key && r.text === popup.sourceText && r.text.includes(popup.quote))) throw Error('消息内容已经变化，请重新选中文字。')
          changeMarks([...marks.filter(m => !(m.key === popup.key && m.quote === popup.quote)), { kind, key: popup.key, quote: popup.quote, sourceText: popup.sourceText }])
          setStatus(kind === 'keep' ? '已标记重点。' : '已排除这段文字。')
          setError('')
          setPopup(null)
          interactingRef.current = false
          document.getSelection()?.removeAllRanges()
        } catch (e) { setError(e.message); setOpen(true) }
      }
      function removeMark(i) {
        try { changeMarks(marks.filter((_, n) => n !== i)); setError(''); setStatus('标记已移除。') }
        catch (e) { setError(e.message) }
      }
      function changeProvider(next) {
        setProvider(next)
        setModel(settings[next].model)
        setApiKey('')
        setError('')
      }
      async function save() {
        setBusy('save'); setStatus(''); setError('')
        try {
          const value = await props.rpc('save-settings', { provider, model, apiKey })
          setSettings(value); setModel(value[provider].model); setApiKey(''); setStatus('配置已保存。')
        } catch (e) { setError(e.message) }
        finally { setBusy('') }
      }
      async function test() {
        setBusy('test'); setStatus(''); setError('')
        try {
          if (provider !== settings.provider || model !== settings[provider].model || apiKey) throw Error('请先保存当前配置，再测试连接。')
          await props.rpc('test'); setStatus('连接成功。')
        } catch (e) { setError(e.message) }
        finally { setBusy('') }
      }
      async function generate() {
        setBusy('generate'); setStatus(''); setError(''); setArticle('')
        try {
          if (!sessionId) throw Error('当前会话 ID 尚未就绪。')
          if (provider !== settings.provider || model !== settings[provider].model || apiKey) throw Error('请先保存当前模型配置。')
          const rows = rowsIn(getFlow(flowRef.current))
          if (!rows.length) throw Error('当前页面没有已加载的文本消息。')
          const snapshot = JSON.stringify(rows.map(({ key, role, text }) => ({ key, role, text })))
          const marked = marks.map(mark => {
            const index = rows.findIndex(row => row.key === mark.key)
            if (index < 0 || rows[index].text !== mark.sourceText || !mark.sourceText.includes(mark.quote)) throw Error('标记对应的消息已变化或未加载，请更新标记后再生成。')
            return { kind: mark.kind, quote: mark.quote, sourceText: mark.sourceText, index }
          })
          const initialRevision = revisionRef.current
          const initialSession = sessionId
          const result = await props.rpc('generate', { messages: rows.map(({ role, text }) => ({ role, text })), marks: marked })
          const now = JSON.stringify(rowsIn(getFlow(flowRef.current)).map(({ key, role, text }) => ({ key, role, text })))
          if (initialSession !== sessionRef.current || initialRevision !== revisionRef.current || snapshot !== now) throw Error('生成期间会话消息或标记发生变化，结果已拦截。')
          setArticle(result.article)
          setStatus('文章已生成，可直接编辑。')
        } catch (e) { setError(e.message) }
        finally { setBusy('') }
      }
      async function copy() {
        try { await navigator.clipboard.writeText(article); setStatus('Markdown 已复制。'); setError('') }
        catch (e) { setError('复制失败：' + e.message) }
      }
      function download() {
        const blob = new Blob([article], { type: 'text/markdown;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = 'chat-to-article.md'; a.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
      const keepCount = marks.filter(m => m.kind === 'keep').length
      const omitCount = marks.filter(m => m.kind === 'omit').length
      return h(React.Fragment, null,
        h('button', { className: 'cta-launch', type: 'button', onClick: () => setOpen(v => !v), 'aria-label': '打开对话成文' }, `对话成文 · ${keepCount}/${omitCount}`),
        popup && sessionId ? h('div', { ref: popupRef, className: 'cta-pop', style: { left: popup.left, top: popup.top }, onPointerDown: e => e.preventDefault() },
          h('button', { type: 'button', onClick: () => addMark('keep') }, '标记重点'),
          h('button', { type: 'button', onClick: () => addMark('omit') }, '排除内容')) : null,
        open ? h('aside', { className: 'cta-panel', 'aria-label': '对话成文面板' },
          h('div', { className: 'cta-head' }, h('h2', null, '对话成文'), h('button', { className: 'cta-close', type: 'button', onClick: () => setOpen(false) }, '关闭')),
          h('p', { className: 'cta-muted' }, sessionId ? '选中聊天消息中的文字，点击弹出的“标记重点”或“排除内容”。' : '请先打开一个会话。'),
          error ? h('p', { className: 'cta-error', role: 'alert' }, error) : null,
          status ? h('p', { className: 'cta-ok', role: 'status' }, status) : null,
          h('section', null,
            h('h3', null, `本会话标记 · 重点 ${keepCount} / 排除 ${omitCount}`),
            marks.length ? marks.map((mark, i) => h('div', { className: 'cta-mark', key: `${i}-${mark.key}` },
              h('b', null, mark.kind === 'keep' ? '重点' : '排除'),
              h('span', { title: mark.quote }, mark.quote),
              h('button', { type: 'button', onClick: () => removeMark(i), 'aria-label': '移除标记' }, '移除'))) : h('p', { className: 'cta-muted' }, '还没有标记。')),
          h('section', null,
            h('h3', null, '模型配置'),
            h('label', null, '服务商'),
            h('select', { value: provider, onChange: e => changeProvider(e.target.value) }, h('option', { value: 'deepseek' }, 'DeepSeek'), h('option', { value: 'openai' }, 'OpenAI')),
            h('label', null, '模型'),
            h('input', { value: model, onChange: e => setModel(e.target.value), spellCheck: false }),
            h('label', null, `API Key ${settings[provider]?.hasKey ? '（已保存；留空保持）' : '（未保存）'}`),
            h('input', { type: 'password', value: apiKey, onChange: e => setApiKey(e.target.value), placeholder: '输入 API Key', autoComplete: 'off' }),
            h('div', { className: 'cta-btns' }, h('button', { type: 'button', disabled: !!busy, onClick: save }, '保存配置'), h('button', { type: 'button', disabled: !!busy, onClick: test }, '测试连接'))),
          h('section', null,
            h('h3', null, '生成文章'),
            h('p', { className: 'cta-muted' }, '仅使用当前页面已加载的文字。排除原文会在发送给模型前删除。'),
            h('div', { className: 'cta-btns' }, h('button', { className: 'cta-primary', type: 'button', disabled: !!busy || !sessionId, onClick: generate }, busy === 'generate' ? '正在生成…' : '生成文章'))),
          article ? h('section', null,
            h('h3', null, 'Markdown 文章'),
            h('textarea', { value: article, onChange: e => setArticle(e.target.value), 'aria-label': '编辑文章 Markdown' }),
            h('div', { className: 'cta-btns' }, h('button', { type: 'button', onClick: copy }, '复制 Markdown'), h('button', { type: 'button', onClick: download }, '下载 .md'))) : null
        ) : null
      )
    }
    function apply(ctx) {
      styles()
      const slots = ctx.get('slots')
      const connection = ctx.get('connection')
      const rpc = async (op, payload = {}) => {
        const result = await connection.rpc.call('/api', 'chat-to-article', { op, ...payload })
        if (result?.ok) return result.value
        throw Error(result?.error?.message || '插件请求失败。')
      }
      slots.inject('conversation.input.dock', () => slots.register({ name: 'conversation.input.dock', id: 'chat-to-article-session' }, props => h(DockBridge, { sessionId: props.sessionId })))
      slots.inject('shell.overlay', () => slots.register({ name: 'shell.overlay', id: 'chat-to-article' }, props => h(App, { useSessions: props.useSessions, rpc })))
    }
    return { inject: ['slots', 'sessions', 'connection'], apply }
  }
})
