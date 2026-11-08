'use strict';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const fmtSize = b => b >= 1073741824 ? (b / 1073741824).toFixed(1) + ' GB' : Math.round(b / 1048576) + ' MB';
const fmtNum = n => (n || 0).toLocaleString();
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'fanoos';
const todayKey = () => new Date().toISOString().slice(0, 10);
const estTokens = s => Math.ceil(String(s || '').length / 4);
const fmtTime = ts => { try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
const hi = (text, q) => {
	const s = String(text ?? '');
	if (!q) return esc(s);
	const i = s.toLowerCase().indexOf(q.toLowerCase());
	if (i < 0) return esc(s);
	return esc(s.slice(0, i)) + '<mark>' + esc(s.slice(i, i + q.length)) + '</mark>' + esc(s.slice(i + q.length));
};
const snippet = (content, q) => {
	if (!q) return '';
	const s = stripMd(String(content || ''));
	const i = s.toLowerCase().indexOf(q.toLowerCase());
	if (i < 0) return '';
	const a = Math.max(0, i - 36);
	return (a > 0 ? '…' : '') + s.slice(a, i + q.length + 56).trim() + (i + q.length + 56 < s.length ? '…' : '');
};
const icon = (n, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="assets/sprites/sprites.svg#i-${n}"/></svg>`;
const logoSVG = (cls = '') => `<img class="logo ${cls}" src="assets/sprites/logo.svg" alt="Fanoos">`;
const UTM = u => u + (u.includes('?') ? '&' : '?') + 'utm_source=fanoos_ui&utm_medium=ollama_chat';
const DEVICE_ID = (() => {
	let id = localStorage.getItem('fanoos_device_id');
	if (!id) {
		id = 'dev-' + (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
		localStorage.setItem('fanoos_device_id', id);
	}
	return id;
})();
const DEVICE_NAME = (() => {
	const ua = navigator.userAgent;
	const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Unknown';
	const br = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
	return br + ' on ' + os;
})();

const FANOOS_SYSTEM =
	`You are Fanoos AI — the assistant built into Fanoos UI, a local-first, privacy-respecting interface running on the user's own machine via Ollama.
Personality: warm, precise, quietly confident — like a lantern lighting the way (fanoos means "lantern"). Be direct, never sycophantic.
Formatting: use Markdown. Use fenced code blocks with language tags. Use tables when comparing.
If you were given "remembered facts" about the user, use them naturally without announcing them.
You have tools available. USE them proactively whenever they improve your answer — search the web for current or factual questions, calculate instead of guessing math, check the weather when asked.
Research protocol: for research-style questions, run 2-4 searches covering different sub-aspects of the topic, then use read_page on the 1-2 most relevant results to get real content, and only then synthesize a structured answer.
Citations: ALWAYS output citations as clickable Markdown links — [Title](url) — never bare URLs and never bare [1] markers.`;

const LS_KEY = 'fanoos_db_v3';
const DEFAULT_SETTINGS = {
	host: 'http://127.0.0.1:11434',
	model: '',
	customInstructions: '',
	systemPromptOverride: '',
	temperature: 0.7,
	topP: 0.9,
	numCtx: 8192,
	seed: '',
	keepAlive: '5m',
	stream: true,
	autoTitle: true,
	enterToSend: true,
	autoContinue: true,
	autoSummarize: true,
	autoMemory: true,
	useMemory: true,
	deepThink: false,
	thinkEffort: 'med',
	searchMode: false,
	searchServer: 'http://127.0.0.1:8777',
	voiceURI: '',
	voiceRate: 1,
	theme: 'dark',
	userName: 'Shayan'
};

function normalizeStore(d) {
	if (Array.isArray(d.chats)) d.chats = Object.assign({}, d.chats);
	if (d.stats) {
		if (Array.isArray(d.stats.daily)) d.stats.daily = Object.assign({}, d.stats.daily);
		if (Array.isArray(d.stats.models)) d.stats.models = Object.assign({}, d.stats.models);
	}
	return d;
}
const DB = {
	data: null,
	_saveT: 0,
	_phpOk: null,
	fresh() {
		return {
			version: 3,
			profile: {
				name: 'Shayan'
			},
			settings: {
				...DEFAULT_SETTINGS
			},
			folders: [],
			memory: [],
			chats: {},
			stats: {
				daily: {},
				models: {}
			}
		};
	},
	async pingPHP() {
		try {
			const r = await fetch('api.php?action=ping', {
				cache: 'no-store',
				signal: AbortSignal.timeout(2500)
			});
			const j = await r.json();
			return j?.ok === true;
		} catch {
			return false;
		}
	},
	async load() {
		this._phpOk = await this.pingPHP();
		let shared = null;
		if (this._phpOk) {
			try {
				const r = await fetch('api.php?device=' + encodeURIComponent(DEVICE_ID), {
					cache: 'no-store'
				});
				const j = await r.json();
				if (j?.data?.chats) this.data = normalizeStore(j.data);
				shared = j?.shared || null;
			} catch {}
		}
		if (!this.data) {
			try {
				const raw = localStorage.getItem(LS_KEY);
				if (raw) this.data = normalizeStore(JSON.parse(raw));
			} catch {}
		}
		if (!this.data?.chats) this.data = this.fresh();
		this.data.settings = {
			...DEFAULT_SETTINGS,
			...this.data.settings
		};
		if (shared && 'systemPromptOverride' in shared) this.data.settings.systemPromptOverride = shared.systemPromptOverride;
	},
	cache() {
		try {
			localStorage.setItem(LS_KEY, JSON.stringify(this.data));
		} catch {}
	},
	save() {
		this.cache();
		clearTimeout(this._saveT);
		this._saveT = setTimeout(() => this.flushPHP(), 600);
	},
	async flushPHP() {
		if (!this._phpOk) return;
		try {
			await fetch('api.php?action=save', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					device: DEVICE_ID,
					device_name: DEVICE_NAME,
					data: this.data
				})
			});
		} catch {}
	},
	beacon() {
		this.cache();
		if (this._phpOk && navigator.sendBeacon) {
			try {
				navigator.sendBeacon('api.php?action=save', new Blob(
					[JSON.stringify({
						device: DEVICE_ID,
						device_name: DEVICE_NAME,
						data: this.data
					})], {
						type: 'application/json'
					}));
			} catch {}
		}
	}
};

function mergeDB(incoming, current) {
	const out = JSON.parse(JSON.stringify(current));
	for (const [id, c] of Object.entries(incoming.chats || {}))
		if (!out.chats[id] || (c.updatedAt || 0) > (out.chats[id].updatedAt || 0)) out.chats[id] = c;
	const ms = new Set(out.memory.map(m => m.text));
	(incoming.memory || []).forEach(m => {
		if (!ms.has(m.text)) out.memory.push(m);
	});
	const fs = new Set(out.folders.map(f => f.id));
	(incoming.folders || []).forEach(f => {
		if (!fs.has(f.id)) out.folders.push(f);
	});
	for (const [d, s] of Object.entries(incoming.stats?.daily || {})) {
		const c = out.stats.daily[d] || {
			tokens: 0,
			msgs: 0,
			words: 0
		};
		out.stats.daily[d] = {
			tokens: Math.max(c.tokens, s.tokens || 0),
			msgs: Math.max(c.msgs, s.msgs || 0),
			words: Math.max(c.words, s.words || 0)
		};
	}
	for (const [m, t] of Object.entries(incoming.stats?.models || {})) out.stats.models[m] = Math.max(out.stats.models[m] || 0, t);
	return out;
}
const S = () => DB.data.settings;
const hostClean = () => (S().host || DEFAULT_SETTINGS.host).replace(/\/+$/, '');
const save = () => DB.save();

let models = [],
	generating = false,
	abortCtrl = null,
	attachments = [];
let pinned = true,
	speakId = null,
	speakQueue = [];
let camStream = null,
	camPanel = null,
	pyodidePromise = null;
let composerRecog = null,
	composerListening = false,
	dictBase = '';
const synth = window.speechSynthesis;
const activeChat = () => DB.data.chats[DB.data.activeId];
const sortedChats = () => Object.values(DB.data.chats).sort((a, b) => b.updatedAt - a.updatedAt);
const currentModel = () => models.find(m => m.name === S().model);
const currentCaps = () => currentModel()?.capabilities || ['completion'];

function trackStats(msg) {
	const st = DB.data.stats,
		d = todayKey();
	const day = st.daily[d] ||= {
		tokens: 0,
		msgs: 0,
		words: 0
	};
	const toks = msg.stats?.tokens || 0;
	day.tokens += toks;
	day.msgs += 1;
	day.words += String(msg.content || '').trim().split(/\s+/).filter(Boolean).length;
	if (msg.model) st.models[msg.model] = (st.models[msg.model] || 0) + toks;
}

function mdInline(t) {
	t = esc(t);
	const codes = [];
	t = t.replace(/`([^`]+)`/g, (m, c) => {
		codes.push(c);
		return '\u0001' + (codes.length - 1) + '\u0001';
	});
	t = t.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
	t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
	t = t.replace(/(^|[\s(>])\*([^*\n]+)\*/g, '$1<em>$2</em>');
	t = t.replace(/~~([^~]+)~~/g, '<del>$1</del>');
	t = t.replace(/\u0001(\d+)\u0001/g, (m, i) => '<code class="inline">' + codes[i] + '</code>');
	return t;
}

function highlight(code, lang) {
	const l = (lang || '').toLowerCase();
	const hash = /^(py|python|bash|sh|shell|yaml|yml|ruby|toml|r|perl)$/.test(l);
	const comRe = hash ? /#[^\n]*/ : /(?<!:)\/\/[^\n]*|\/\*[\s\S]*?\*\//;
	const re = new RegExp('(' + comRe.source + ')|("(?:[^"\\\\\\n]|\\\\.)*"|\'(?:[^\'\\\\\\n]|\\\\.)*\'|`(?:[^`\\\\]|\\\\.)*`)|\\b(\\d+\\.?\\d*)\\b|\\b(function|const|let|var|return|if|else|elif|for|while|class|import|from|export|def|print|async|await|try|except|catch|finally|new|this|self|None|True|False|null|undefined|true|false|in|of|not|and|or|is|lambda|with|as|pass|break|continue|switch|case|default|typeof|instanceof|public|private|static|void|int|float|str|bool|raise|yield|struct|fn|mut|impl|use|match|echo|fi|done|esac|SELECT|FROM|WHERE)\\b|([A-Za-z_]\\w*)(?=\\()', 'g');
	return esc(code).replace(re, (m, com, str, num, kw, fn) => {
		if (com) return '<span class="tk-com">' + com + '</span>';
		if (str) return '<span class="tk-str">' + str + '</span>';
		if (num) return '<span class="tk-num">' + num + '</span>';
		if (kw) return '<span class="tk-kw">' + kw + '</span>';
		if (fn) return '<span class="tk-fn">' + fn + '</span>';
		return m;
	});
}
let LAST_BLOCKS = [];

function codeBlockHtml(b, idx) {
	const lang = (b.lang || 'code').toLowerCase();
	const canPrev = ['html', 'htm', 'svg'].includes(lang),
		canChart = lang === 'csv',
		canRun = ['python', 'py'].includes(lang);
	return `<div class="codeblock"><div class="code-head"><span>${esc(b.lang||'code')}</span><span class="cb-acts">` +
		(canPrev ? `<button class="cb-btn" data-cb="preview" data-i="${idx}">${icon('eye')}Preview</button>` : '') +
		(canChart ? `<button class="cb-btn" data-cb="chart" data-i="${idx}">${icon('chart')}Chart</button>` : '') +
		(canRun ? `<button class="cb-btn" data-cb="run" data-i="${idx}">${icon('play')}Run</button>` : '') +
		`<button class="cb-btn" data-cb="copy" data-i="${idx}">${icon('copy')}Copy</button></span></div>` +
		`<pre><code>${highlight(b.code.replace(/\n$/,''),lang)}</code></pre></div>`;
}
const parseAligns = l => l.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => {
	c = c.trim();
	return c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : 'left';
});
const splitRow = l => l.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());

function buildTable(rows) {
	const a = rows.aligns || [],
		al = i => a[i] ? ` style="text-align:${a[i]}"` : '';
	let h = '<div class="table-wrap"><table><thead><tr>';
	splitRow(rows[0]).forEach((c, i) => h += `<th${al(i)}>${mdInline(c)}</th>`);
	h += '</tr></thead><tbody>';
	for (let r = 1; r < rows.length; r++) {
		h += '<tr>';
		splitRow(rows[r]).forEach((c, i) => h += `<td${al(i)}>${mdInline(c)}</td>`);
		h += '</tr>';
	}
	return h + '</tbody></table></div>';
}

function renderMarkdown(src) {
	if (!src) return '';
	const blocks = [];
	const mathBlocks = [];
	src = String(src).replace(/\r\n?/g, '\n');
	
	src = src.replace(/```([^\n`]*)\n?([\s\S]*?)```/g, (m, lang, code) => {
		blocks.push({ lang: lang.trim(), code });
		return '\u0000' + (blocks.length - 1) + '\u0000';
	});

	src = src.replace(/\$\$([\s\S]*?)\$\$/g, (m, math) => {
		mathBlocks.push({ block: true, math: math.trim() });
		return '\n\n\u0002' + (mathBlocks.length - 1) + '\u0002\n\n';
	});

	src = src.replace(/(^|[^\$])\$([^\$\s\n](?:[^\$\n]*[^\$\s\n])?)\$(?!\$)/g, (m, p1, math) => {
		mathBlocks.push({ block: false, math: math.trim() });
		return p1 + '\u0003' + (mathBlocks.length - 1) + '\u0003';
	});

	LAST_BLOCKS = blocks;
	const lines = src.split('\n');
	let html = '',
		para = [],
		listType = null,
		quote = [],
		table = null;
	const fP = () => {
		if (para.length) {
			html += '<p>' + para.map(mdInline).join('<br>') + '</p>';
			para = [];
		}
	};
	const cL = () => {
		if (listType) {
			html += listType === 'ul' ? '</ul>' : '</ol>';
			listType = null;
		}
	};
	const cQ = () => {
		if (quote.length) {
			html += '<blockquote>' + quote.map(mdInline).join('<br>') + '</blockquote>';
			quote = [];
		}
	};
	const fT = () => {
		if (table) {
			html += buildTable(table);
			table = null;
		}
	};
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i],
			t = line.trim();
		if (!table && line.includes('|') && i + 1 < lines.length && lines[i + 1].includes('-') && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
			fP();
			cL();
			cQ();
			table = [line];
			table.aligns = parseAligns(lines[i + 1]);
			i++;
			continue;
		}
		if (table) {
			if (line.includes('|')) {
				table.push(line);
				continue;
			}
			fT();
		}
		if (!t) {
			fP();
			cL();
			cQ();
			continue;
		}
		if (/^\u0000\d+\u0000$/.test(t)) {
			fP();
			cL();
			cQ();
			html += codeBlockHtml(blocks[+t.slice(1, -1)], +t.slice(1, -1));
			continue;
		}
		let m;
		if ((m = t.match(/^(#{1,6})\s+(.*)/))) {
			fP();
			cL();
			cQ();
			const l = m[1].length;
			html += `<h${l}>${mdInline(m[2])}</h${l}>`;
			continue;
		}
		if (/^([-*_])\1{2,}$/.test(t)) {
			fP();
			cL();
			cQ();
			html += '<hr>';
			continue;
		}
		if ((m = t.match(/^>\s?(.*)/))) {
			fP();
			cL();
			quote.push(m[1]);
			continue;
		}
		if ((m = t.match(/^[-*+]\s+(.*)/))) {
			fP();
			cQ();
			if (listType !== 'ul') {
				cL();
				html += '<ul>';
				listType = 'ul';
			}
			html += '<li>' + mdInline(m[1]) + '</li>';
			continue;
		}
		if ((m = t.match(/^\d+[.)]\s+(.*)/))) {
			fP();
			cQ();
			if (listType !== 'ol') {
				cL();
				html += '<ol>';
				listType = 'ol';
			}
			html += '<li>' + mdInline(m[1]) + '</li>';
			continue;
		}
		para.push(line);
	}
	fP();
	cL();
	cQ();
	fT();
	
	let finalHtml = html.replace(/\u0000(\d+)\u0000/g, (m, i) => codeBlockHtml(blocks[+i], +i));
	
	finalHtml = finalHtml.replace(/\u0002(\d+)\u0002/g, (m, i) => {
		const math = mathBlocks[+i].math;
		if (typeof katex !== 'undefined') {
			try {
				return '<div class="math-block">' + katex.renderToString(math, { displayMode: true, throwOnError: false }) + '</div>';
			} catch (e) {
				return '<pre class="math-error">' + esc(math) + '</pre>';
			}
		}
		return '<pre class="math-raw">$$' + esc(math) + '$$</pre>';
	});
	
	finalHtml = finalHtml.replace(/\u0003(\d+)\u0003/g, (m, i) => {
		const math = mathBlocks[+i].math;
		if (typeof katex !== 'undefined') {
			try {
				return katex.renderToString(math, { displayMode: false, throwOnError: false });
			} catch (e) {
				return '<code class="math-error">' + esc(math) + '</code>';
			}
		}
		return '<code class="math-raw">$' + esc(math) + '$</code>';
	});

	return finalHtml;
}

function thinkHtml(text, done, s, tok) {
	const label = done ? `Thought for ${s||'?'}s${tok?` · ~${fmtNum(tok)} tokens`:''}` : 'Thinking…';
	return `<details class="thinking${done?'':' in-progress'}"${done?'':' open'}><summary><span class="chev">▶</span>${icon('brain','th-ic')}<span>${label}</span></summary><div class="think-body">${esc(text)}</div></details>`;
}

function renderWithThinking(content, m) {
	let out = '',
		last = 0;
	const re = /<think>([\s\S]*?)<\/think>/g;
	let mm;
	while ((mm = re.exec(content))) {
		out += renderMarkdown(content.slice(last, mm.index)) + thinkHtml(mm[1], true, m?.thinkS, m?.thinkTok);
		last = re.lastIndex;
	}
	const tail = content.slice(last),
		open = tail.indexOf('<think>');
	if (open !== -1) out += renderMarkdown(tail.slice(0, open)) + thinkHtml(tail.slice(open + 7), false);
	else out += renderMarkdown(tail);
	return out;
}

function renderStreaming(c, m) {
	let s = c;
	if ((s.match(/```/g) || []).length % 2) s += '\n```';
	return renderWithThinking(s, m) + '<span class="caret"></span>';
}

function stripMd(s) {
	return String(s).replace(/```[\s\S]*?```/g, ' ').replace(/`([^`]*)`/g, '$1').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/<think>[\s\S]*?<\/think>/g, ' ').replace(/[*_#>~|=-]+/g, ' ').replace(/\s+/g, ' ');
}

function fancyDialog({
	title,
	message,
	html,
	inputValue,
	inputPlaceholder,
	inputType,
	confirmText = 'Confirm',
	cancelText = 'Cancel',
	danger = false
}) {
	return new Promise(resolve => {
		const ov = document.createElement('div');
		ov.className = 'modal-overlay fancy-dialog';
		ov.innerHTML = `<div class="modal" style="width:min(430px,92vw)">
      <div class="modal-head"><h2>${esc(title)}</h2></div>
      <div class="modal-body" style="padding-top:6px">
        ${message?`<p class="dialog-msg">${esc(message)}</p>`:''}${html||''}
        ${inputValue!==undefined?`<input type="${inputType||'text'}" class="dialog-input pop-input" value="${esc(inputValue)}" placeholder="${esc(inputPlaceholder||'')}" style="margin-top:10px">`:''}
      </div>
      <div class="modal-foot"><button class="btn ghost dlg-cancel">${esc(cancelText)}</button>
      <button class="btn ${danger?'danger':'primary'} dlg-ok">${esc(confirmText)}</button></div></div>`;
		document.body.appendChild(ov);
		requestAnimationFrame(() => ov.classList.add('open'));
		const inp = ov.querySelector('.dialog-input');
		if (inp) {
			inp.focus();
			inp.select();
		}
		const close = v => {
			ov.classList.remove('open');
			setTimeout(() => ov.remove(), 220);
			resolve(v);
		};
		ov.querySelector('.dlg-cancel').onclick = () => close(inputValue !== undefined ? null : false);
		ov.querySelector('.dlg-ok').onclick = () => close(inputValue !== undefined ? (inp?.value ?? '') : true);
		ov.addEventListener('click', e => {
			if (e.target === ov) close(inputValue !== undefined ? null : false);
		});
		const onKey = e => {
			if (e.key === 'Escape') {
				document.removeEventListener('keydown', onKey);
				close(inputValue !== undefined ? null : false);
			}
			if (e.key === 'Enter' && inp && document.activeElement === inp) {
				document.removeEventListener('keydown', onKey);
				close(inp.value);
			}
		};
		document.addEventListener('keydown', onKey);
	});
}
const fancyConfirm = (t, m, o = {}) => fancyDialog({
	title: t,
	message: m,
	confirmText: o.confirmText || 'Confirm',
	cancelText: o.cancelText || 'Cancel',
	danger: o.danger !== false
});
const fancyPrompt = (t, ph = '', def = '', o = {}) => fancyDialog({
	title: t,
	inputValue: def,
	inputPlaceholder: ph,
	confirmText: o.confirmText || 'Save'
});

function toast(msg, type = 'ok') {
	const el = document.createElement('div');
	el.className = 'toast ' + type;
	el.textContent = msg;
	$('#toasts').appendChild(el);
	setTimeout(() => {
		el.classList.add('out');
		setTimeout(() => el.remove(), 260);
	}, 2800);
}
let popEl = null,
	popAnchor = null,
	slashState = null;

function closePopover() {
	if (popEl) {
		popEl.remove();
		popEl = null;
		popAnchor = null;
	}
	slashState = null;
}

function popover(anchor, html, cls = '') {
	closePopover();
	popEl = document.createElement('div');
	popEl.className = 'popover ' + cls;
	popEl.innerHTML = html;
	document.body.appendChild(popEl);
	const r = anchor.getBoundingClientRect(),
		pw = popEl.offsetWidth,
		ph = popEl.offsetHeight;
	popEl.style.left = clamp(r.left, 8, innerWidth - pw - 8) + 'px';
	let top = r.bottom + 8;
	if (top + ph > innerHeight - 8) top = Math.max(8, r.top - ph - 8);
	popEl.style.top = top + 'px';
	requestAnimationFrame(() => popEl?.classList.add('open'));
	popAnchor = anchor;
	return popEl;
}
document.addEventListener('click', e => {
	if (popEl && document.contains(e.target) && !popEl.contains(e.target) &&
		e.target !== popAnchor && !popAnchor?.contains(e.target)) closePopover();
});
addEventListener('resize', closePopover);

function applyTheme(t) {
	document.documentElement.dataset.theme = t;
	S().theme = t;
	DB.save();
}

async function quickAsk(messages, opts = {}) {
	const body = {
		model: opts.model || S().model,
		stream: false,
		keep_alive: opts.keepAlive ?? 0,
		options: {
			temperature: opts.temperature ?? 0.3,
			num_ctx: +S().numCtx
		},
		messages
	};
	if (currentCaps().includes('thinking')) body.think = false;
	const res = await fetch(hostClean() + '/api/chat', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(body)
	});
	if (!res.ok) throw new Error('Ollama ' + res.status);
	return (await res.json()).message?.content || '';
}

function buildSystemMsg() {
	let sys = S().systemPromptOverride?.trim() || FANOOS_SYSTEM;
	if (S().customInstructions?.trim()) sys += '\n\nUser custom instructions:\n' + S().customInstructions.trim();
	if (S().useMemory && DB.data.memory.length) sys += '\n\nRemembered facts about the user:\n' + DB.data.memory.map(m => '• ' + m.text).join('\n');
	if (S().deepThink && currentCaps().includes('thinking')) {
		const eff = {
			low: 'Keep reasoning brief.',
			med: 'Reason carefully and thoroughly.',
			high: 'Reason as deeply and exhaustively as possible; explore edge cases.'
		} [S().thinkEffort];
		sys += '\n\nThinking instruction: ' + eff;
	}
	if (S().searchMode) sys += '\n\nIMPORTANT: Use the web_search tool to verify factual claims before answering. Always ground answers in fresh sources.';
	return sys;
}

function apiMessages(chat, extra = []) {
	const msgs = [{
		role: 'system',
		content: buildSystemMsg()
	}];
	if (chat.summary) msgs.push({
		role: 'system',
		content: 'Summary of the earlier conversation:\n' + chat.summary
	});
	const cutoff = chat.summarizedUpTo ?? -1;
	chat.messages.forEach((m, i) => {
		if (i <= cutoff || m.pending || m.error) return;
		let content = m.content;
		if (m.files?.length) content += '\n\n' + m.files.map(f => `[Attached file: ${f.name} (${f.type})]\n\`\`\`\n${f.textPreview}\n\`\`\``).join('\n\n');
		const o = {
			role: m.role,
			content
		};
		if (m.images?.length) o.images = m.images;
		msgs.push(o);
	});
	return msgs.concat(extra);
}

const TOOLS = [{
		type: 'function',
		function: {
			name: 'web_search',
			description: 'Search the web for current information. Returns titles, snippets, URLs and extracted page content. Use for any factual, recent, or uncertain question.',
			parameters: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						description: 'Search query'
					},
					num_results: {
						type: 'integer',
						description: 'Number of results (default 5)'
					}
				},
				required: ['query']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'read_page',
			description: 'Fetch and read the full text content of a specific web page URL. Use to go deeper than search snippets.',
			parameters: {
				type: 'object',
				properties: {
					url: {
						type: 'string'
					}
				},
				required: ['url']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'calculator',
			description: 'Evaluate a mathematical expression precisely. Use instead of mental math.',
			parameters: {
				type: 'object',
				properties: {
					expression: {
						type: 'string',
						description: 'e.g. (12+8)*3.5 or 2**10'
					}
				},
				required: ['expression']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'current_datetime',
			description: 'Get the current date and time, optionally in a specific timezone.',
			parameters: {
				type: 'object',
				properties: {
					timezone: {
						type: 'string',
						description: 'IANA timezone e.g. Asia/Tehran'
					}
				}
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'unit_convert',
			description: 'Convert a value between units.',
			parameters: {
				type: 'object',
				properties: {
					value: {
						type: 'number'
					},
					from_unit: {
						type: 'string'
					},
					to_unit: {
						type: 'string'
					},
					category: {
						type: 'string',
						enum: ['length', 'weight', 'temperature', 'volume', 'speed', 'data']
					}
				},
				required: ['value', 'from_unit', 'to_unit']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'dice_roll',
			description: 'Roll dice or flip a coin. Notation: 2d20, 1d6, coin.',
			parameters: {
				type: 'object',
				properties: {
					notation: {
						type: 'string'
					}
				},
				required: ['notation']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'generate_uuid',
			description: 'Generate a random UUID v4.',
			parameters: {
				type: 'object',
				properties: {}
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'wikipedia_search',
			description: 'Search Wikipedia for encyclopedic information. Returns summaries and article URLs.',
			parameters: {
				type: 'object',
				properties: {
					query: {
						type: 'string'
					}
				},
				required: ['query']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'weather',
			description: 'Get current weather for a city name.',
			parameters: {
				type: 'object',
				properties: {
					city: {
						type: 'string'
					}
				},
				required: ['city']
			}
		}
	}
];

const CALC_FN = {
	sqrt: 'Math.sqrt', cbrt: 'Math.cbrt', abs: 'Math.abs',
	sin: 'Math.sin', cos: 'Math.cos', tan: 'Math.tan',
	asin: 'Math.asin', acos: 'Math.acos', atan: 'Math.atan',
	log10: 'Math.log10', log: 'Math.log10', ln: 'Math.log', exp: 'Math.exp',
	round: 'Math.round', floor: 'Math.floor', ceil: 'Math.ceil', sign: 'Math.sign',
	min: 'Math.min', max: 'Math.max', pow: 'Math.pow',
	pi: 'Math.PI', PI: 'Math.PI', tau: '(2*Math.PI)', e: 'Math.E'
};

function safeCalc(expr) {
	const raw = String(expr || '').trim();
	if (!raw) return 'Empty expression';
	if (raw.length > 400) return 'Expression too long';
	let js = raw.replace(/\^/g, '**').replace(/×/g, '*').replace(/÷/g, '/');
	for (const [k, v] of Object.entries(CALC_FN)) js = js.replace(new RegExp('\\b' + k + '\\b', 'g'), v);
	const stripped = js.replace(/Math\s*\.\s*(sqrt|cbrt|abs|sin|cos|tan|asin|acos|atan|log10|log|exp|round|floor|ceil|sign|min|max|pow|PI|E)/g, '');
	if (/[a-zA-Z_$]/.test(stripped)) return 'Invalid expression — only numbers and math functions are allowed';
	try {
		const v = Function('"use strict";return(' + js + ')')();
		if (typeof v !== 'number' || !isFinite(v)) return 'No finite result for: ' + raw;
		return String(+(+v).toFixed(10));
	} catch {
		return 'Could not evaluate: ' + raw;
	}
}
const UNITS = {
	length: {
		m: 1,
		km: 1000,
		cm: .01,
		mm: .001,
		mi: 1609.344,
		yd: .9144,
		ft: .3048,
		in: .0254
	},
	weight: {
		kg: 1,
		g: .001,
		mg: 1e-6,
		lb: .453592,
		oz: .0283495,
		t: 1000
	},
	volume: {
		L: 1,
		mL: .001,
		gal: 3.78541,
		pt: .473176,
		cup: .24
	},
	speed: {
		'm/s': 1,
		'km/h': .277778,
		mph: .44704,
		knot: .514444
	},
	data: {
		B: 1,
		KB: 1024,
		MB: 1048576,
		GB: 1073741824,
		TB: 1099511627776
	}
};

function convertUnit(a) {
	const cat = a.category || Object.keys(UNITS).find(k => UNITS[k][a.from_unit] && UNITS[k][a.to_unit]);
	if (cat === 'temperature') {
		const c = a.from_unit === 'C' ? a.value : a.from_unit === 'F' ? (a.value - 32) * 5 / 9 : a.value - 273.15;
		const r = a.to_unit === 'C' ? c : a.to_unit === 'F' ? c * 9 / 5 + 32 : c + 273.15;
		return `${a.value} ${a.from_unit} = ${+r.toFixed(4)} ${a.to_unit}`;
	}
	const u = UNITS[cat];
	if (!u || !u[a.from_unit] || !u[a.to_unit]) return `Unknown units. Available: ${Object.keys(UNITS).map(k=>k+': '+Object.keys(UNITS[k]).join(',')).join(' | ')}`;
	return `${a.value} ${a.from_unit} = ${+(a.value*u[a.from_unit]/u[a.to_unit]).toFixed(6)} ${a.to_unit}`;
}

function rollDice(n) {
	if (/^coin$/i.test(n)) return '🪙 ' + (Math.random() < .5 ? 'Heads' : 'Tails');
	const m = String(n).match(/^(\d*)d(\d+)$/i);
	if (!m) return 'Use NdM format (e.g. 2d20) or "coin"';
	const cnt = clamp(+m[1] || 1, 1, 100),
		sides = clamp(+m[2], 2, 1000);
	const rolls = Array.from({
		length: cnt
	}, () => 1 + Math.floor(Math.random() * sides));
	return `🎲 ${rolls.join(' + ')}${cnt>1?' = '+rolls.reduce((a,b)=>a+b,0):''}`;
}
async function getWeather(city) {
	try {
		const g = await (await fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&name=' + encodeURIComponent(city))).json();
		if (!g.results?.length) return 'City not found: ' + city;
		const {
			latitude: la,
			longitude: lo,
			name,
			country
		} = g.results[0];
		const w = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}&current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code`)).json();
		const c = w.current;
		const desc = {
			0: 'clear sky',
			1: 'mostly clear',
			2: 'partly cloudy',
			3: 'overcast',
			45: 'fog',
			51: 'drizzle',
			61: 'rain',
			63: 'moderate rain',
			71: 'snow',
			80: 'showers',
			95: 'thunderstorm'
		} [c.weather_code] || '—';
		return `${name}, ${country}: ${c.temperature_2m}°C (feels like ${c.apparent_temperature}°C), ${desc}, wind ${c.wind_speed_10m} km/h, humidity ${c.relative_humidity_2m}%`;
	} catch (e) {
		return 'Weather lookup failed: ' + e.message;
	}
}
async function wikiSearchFull(q) {
	try {
		const sUrl = 'https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=4&srprop=snippet&srsearch=' + encodeURIComponent(q);
		const sj = await (await fetch(sUrl, {
			signal: AbortSignal.timeout(12000)
		})).json();
		const hits = sj.query?.search || [];
		if (!hits.length) return {
			text: 'No Wikipedia results for: ' + q,
			results: []
		};
		const tops = await Promise.all(hits.slice(0, 2).map(async h => {
			try {
				const r = await fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(h.title.replace(/ /g, '_')));
				const j = await r.json();
				return j.extract || '';
			} catch {
				return '';
			}
		}));
		const clean = s => String(s).replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&').trim();
		const results = hits.map(h => ({
			title: h.title,
			url: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(h.title.replace(/ /g, '_'))
		}));
		const text = hits.map((h, i) => {
			const url = results[i].url;
			return `[${i+1}] ${h.title}\n${clean(h.snippet||'')}${i<2&&tops[i]?'\nSummary: '+tops[i].slice(0,1200):''}\nURL: ${url}`;
		}).join('\n\n');
		return {
			text,
			results
		};
	} catch (e) {
		return {
			text: 'Wikipedia search failed: ' + e.message,
			results: []
		};
	}
}
async function pySearchFull(q, n = 5) {
	const base = (S().searchServer || 'http://127.0.0.1:8777').replace(/\/+$/, '');
	try {
		const r = await fetch(`${base}/search?q=${encodeURIComponent(q)}&n=${n}`, {
			signal: AbortSignal.timeout(35000)
		});
		const j = await r.json();
		if (j.error) return {
			text: 'Search server error: ' + j.error,
			results: []
		};
		if (!j.results?.length) return {
			text: 'No results found for: ' + q,
			results: []
		};
		const text = j.results.map((r, i) => `[${i+1}] ${r.title}\n${r.snippet}\nURL: ${r.url}${r.content?'\nPage content: '+String(r.content).slice(0,2500):''}`).join('\n\n');
		return {
			text,
			results: j.results.map(r => ({
				title: r.title,
				url: r.url
			}))
		};
	} catch {
		return await wikiSearchFull(q);
	}
}
async function pyReadPage(url) {
	const base = (S().searchServer || 'http://127.0.0.1:8777').replace(/\/+$/, '');
	try {
		const r = await fetch(`${base}/read?url=${encodeURIComponent(url)}`, {
			signal: AbortSignal.timeout(25000)
		});
		const j = await r.json();
		return j.text?.slice(0, 6000) || '[Empty page]';
	} catch (e) {
		return 'Could not read page: ' + e.message + ' — is search_server.py running?';
	}
}
async function executeTool(name, args, ctx) {
	switch (name) {
		case 'web_search': {
			const r = await pySearchFull(args.query, args.num_results || 5);
			r.results.forEach(s => ctx.sources.push(s));
			return r.text;
		}
		case 'read_page':
			return await pyReadPage(args.url);
		case 'calculator':
			return safeCalc(args.expression);
		case 'current_datetime':
			try {
				return new Date().toLocaleString('en-US', {
					timeZone: args.timezone || undefined,
					dateStyle: 'full',
					timeStyle: 'long'
				});
			} catch {
				return new Date().toString();
			}
		case 'unit_convert':
			return convertUnit(args);
		case 'dice_roll':
			return rollDice(args.notation);
		case 'generate_uuid':
			return crypto.randomUUID();
		case 'wikipedia_search': {
			const r = await wikiSearchFull(args.query);
			r.results.forEach(s => ctx.sources.push(s));
			return r.text;
		}
		case 'weather':
			return await getWeather(args.city);
		default:
			return 'Unknown tool: ' + name;
	}
}
function appendSources(msg, sources) {
	const seen = new Set(),
		uniq = [];
	sources.forEach(s => {
		if (s.url && !seen.has(s.url)) {
			seen.add(s.url);
			uniq.push(s);
		}
	});
	const missing = uniq.filter(s => !msg.content.includes(s.url.replace(/^https?:\/\//, '')));
	if (!missing.length) return;
	msg.content += '\n\n---\n### 📚 Sources\n' + missing.map((s, i) => `${i+1}. [${(s.title||s.url).slice(0,90)}](${UTM(s.url)})`).join('\n');
}

const messagesEl = () => $('#messages');
const msgEl = id => $('#messages').querySelector(`.msg[data-id="${id}"]`);

function setSendState() {
	const btn = $('#sendBtn');
	btn.classList.toggle('stop', generating);
	btn.title = generating ? 'Stop generating' : 'Send';
	btn.disabled = !generating && !$('#promptInput').value.trim() && !attachments.length;
}
function safePaint(msg, el) {
	paintAssistant(el, msg);
	requestAnimationFrame(() => {
		if (!msg.pending) {
			const t = msgEl(msg.id);
			if (t) paintAssistant(t, msg);
		}
	});
}
async function maybeSummarize(chat) {
	if (!S().autoSummarize || chat.messages.length < 8) return;
	const total = chat.messages.reduce((a, m) => a + estTokens(m.content), 0) + estTokens(buildSystemMsg());
	if (total < (+S().numCtx) * 0.72) return;
	toast('Context getting full — summarizing older turns…', 'warn');
	const keep = 6,
		old = chat.messages.slice(0, -keep);
	try {
		const sum = await quickAsk([{
			role: 'user',
			content: 'Summarize this conversation compactly but completely (~200 words):\n\n' + old.map(m => m.role.toUpperCase() + ': ' + String(m.content).slice(0, 1500)).join('\n\n').slice(0, 12000)
		}], {
			temperature: 0.2
		});
		if (sum.trim()) {
			chat.summary = (chat.summary ? chat.summary + '\n' : '') + sum.trim();
			chat.summarizedUpTo = chat.messages.length - keep - 1;
			old.forEach(m => m.summarized = true);
			save();
			renderChat();
			toast('Older turns summarized');
		}
	} catch {}
}

function sendMessage(opts = {}) {
	if (generating) return;
	const input = $('#promptInput');
	const text = opts.text ?? input.value.trim();
	if (!text && !attachments.length) return;
	let chat = activeChat();
	if (!chat) {
		createChat(true);
		chat = activeChat();
	}
	const m = {
		id: uid(),
		role: 'user',
		content: text,
		ts: Date.now()
	};
	if (attachments.length) {
		m.images = attachments.filter(a => a.kind === 'image').map(a => a.b64);
		m.files = attachments.filter(a => a.kind !== 'image').map(a => ({
			name: a.name,
			type: a.type,
			textPreview: a.textPreview
		}));
		if (!m.images.length) delete m.images;
		if (!m.files.length) delete m.files;
	}
	chat.messages.push(m);
	chat.updatedAt = Date.now();
	if (!opts.keepInput) {
		input.value = '';
		resizeInput();
		clearAttachments();
		updateTokCount();
		setSendState();
	}
	if (chat.title === 'New chat' && S().autoTitle) autoTitle(chat);
	maybeExtractMemory(text);
	$('#main').classList.remove('empty');
	messagesEl().appendChild(buildMessage(m));
	save();
	renderSidebar();
	pinned = true;
	scrollToBottom();
	generate(opts);
}
async function generate(opts = {}) {
	const chat = activeChat();
	if (!chat || generating) return;
	if (!S().model) return toast('Pick a model from the top bar first', 'warn');
	await maybeSummarize(chat);
	const msg = opts.continueMsg || {
		id: uid(),
		role: 'assistant',
		content: '',
		ts: Date.now(),
		pending: true,
		toolLog: []
	};
	const ctx = msg._ctx || {
		sources: []
	};
	Object.defineProperty(msg, '_ctx', {
		value: ctx,
		writable: true,
		enumerable: false,
		configurable: true
	});
	msg._sourcesAppended = false;
	if (!opts.continueMsg) {
		chat.messages.push(msg);
		messagesEl().appendChild(buildMessage(msg));
	}
	const el = msgEl(msg.id);
	pinned = true;
	scrollToBottom();
	generating = true;
	setSendState();
	abortCtrl = new AbortController();
	const caps = currentCaps(),
		useTools = caps.includes('tools');
	let apiMsgs = apiMessages(chat, opts.extra || []);
	if (S().searchMode && !useTools && !opts.skipSearch && !opts.continueMsg) {
		const lastUser = [...chat.messages].reverse().find(m => m.role === 'user');
		if (lastUser) {
			toast('Searching the web…');
			msg.toolLog.push({
				name: 'web_search',
				args: JSON.stringify({
					query: lastUser.content.slice(0, 120)
				}),
				result: undefined
			});
			paintAssistant(el, msg);
			if (pinned) scrollToBottom();
			const r = await pySearchFull(lastUser.content.slice(0, 200), 4);
			r.results.forEach(s => ctx.sources.push(s));
			msg.toolLog[msg.toolLog.length - 1].result = r.results.length ?
				`${r.results.length} result(s):\n` + r.results.map(s => '• ' + (s.title || s.url)).join('\n').slice(0, 400) :
				String(r.text).slice(0, 300);
			paintAssistant(el, msg);
			if (pinned) scrollToBottom();
			apiMsgs.splice(1, 0, {
				role: 'system',
				content: 'Web search results. Cite them as clickable markdown links [Title](url):\n' + r.text
			});
		}
	}
	try {
		await toolLoop(chat, msg, el, apiMsgs, useTools, opts, 0, ctx);
	} catch (err) {
		if (err.name === 'AbortError') {
			msg.pending = false;
			if (!msg.content && !msg.thinkContent) msg.content = '*(generation stopped)*';
			msg.model = S().model;
			generating = false;
			setSendState();
			safePaint(msg, el);
			save();
		} else {
			msg.pending = false;
			msg.error = true;
			msg.errorText = err.message || String(err);
			msg.isCors = /failed to fetch|networkerror|typeerror|load failed/i.test(msg.errorText);
			generating = false;
			setSendState();
			safePaint(msg, el);
			save();
			if (pinned) scrollToBottom();
		}
	}
}
async function toolLoop(chat, msg, el, apiMsgs, useTools, opts, depth, ctx) {
	if (depth > 8) {
		finishMsg(msg, el, chat, null, opts);
		return;
	}
	if (depth > 0) {
		msg.content = '';
		msg.thinkContent = '';
		msg.thinkS = null;
		msg.thinkTok = null;
		msg.thinkStart = null;
	}
	const body = {
		model: S().model,
		stream: S().stream,
		keep_alive: S().keepAlive,
		messages: apiMsgs,
		options: {
			temperature: +S().temperature,
			top_p: +S().topP,
			num_ctx: +S().numCtx
		}
	};
	if (S().seed !== '' && S().seed != null) body.options.seed = +S().seed;
	if (useTools) body.tools = TOOLS;
	if (currentCaps().includes('thinking')) {
		body.think = S().deepThink ? ({
			low: 'low',
			med: 'medium',
			high: 'high'
		} [S().thinkEffort] || true) : false;
	}
	const t0 = performance.now();
	const {
		toolCalls,
		lastJ
	} = await streamOnce(body, msg, el, t0);
	if (toolCalls.length && useTools) {
		apiMsgs.push({
			role: 'assistant',
			content: msg.content || '',
			tool_calls: toolCalls
		});
		for (const tc of toolCalls) {
			const fn = tc.function?.name || tc.name;
			let args;
			try {
				args = typeof(tc.function?.arguments ?? tc.arguments) === 'string' ? JSON.parse(tc.function?.arguments || tc.arguments || '{}') : (tc.function?.arguments || tc.arguments || {});
			} catch {
				args = {};
			}
			msg.toolLog.push({
				name: fn,
				args: JSON.stringify(args).slice(0, 300),
				result: undefined
			});
			paintAssistant(el, msg);
			if (pinned) scrollToBottom();
			let result;
			try {
				result = await executeTool(fn, args, ctx);
			} catch (e) {
				result = 'Tool error: ' + e.message;
			}
			msg.toolLog[msg.toolLog.length - 1].result = String(result).slice(0, 3000);
			paintAssistant(el, msg);
			if (pinned) scrollToBottom();
			apiMsgs.push({
				role: 'tool',
				content: String(result).slice(0, 8000)
			});
		}
		save();
		return toolLoop(chat, msg, el, apiMsgs, useTools, opts, depth + 1, ctx);
	}
	finishMsg(msg, el, chat, lastJ, opts);
}
async function streamOnce(body, msg, el, t0) {
	const res = await fetch(hostClean() + '/api/chat', {
		method: 'POST',
		signal: abortCtrl.signal,
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(body)
	});
	if (!res.ok) {
		let d = '';
		try {
			d = (await res.text()).slice(0, 220);
		} catch {}
		throw new Error('Ollama returned ' + res.status + (d ? ' — ' + d : ''));
	}
	if (!body.stream) {
		const j = await res.json();
		msg.content = j.message?.content || '';
		if (j.message?.thinking) {
			msg.thinkContent = j.message.thinking;
			msg.thinkS = Math.round((performance.now() - t0) / 1000);
			msg.thinkTok = estTokens(msg.thinkContent);
		}
		paintAssistant(el, msg);
		return {
			toolCalls: j.message?.tool_calls || [],
			lastJ: j
		};
	}
	const reader = res.body.getReader(),
		dec = new TextDecoder();
	let buf = '',
		toolCalls = [],
		lastJ = null,
		liveRaf = 0,
		lastSave = 0;
	const queueLive = () => {
		if (!msg.pending) return;
		if (liveRaf) return;
		liveRaf = requestAnimationFrame(() => {
			liveRaf = 0;
			if (!msg.pending) return;
			const t = msgEl(msg.id);
			if (t) paintAssistant(t, msg);
			if (pinned) scrollToBottom();
			const n = Date.now();
			if (n - lastSave > 1200) {
				lastSave = n;
				save();
			}
		});
	};
	try {
		while (true) {
			const {
				done,
				value
			} = await reader.read();
			if (done) break;
			buf += dec.decode(value, {
				stream: true
			});
			let i;
			while ((i = buf.indexOf('\n')) >= 0) {
				const line = buf.slice(0, i).trim();
				buf = buf.slice(i + 1);
				if (!line) continue;
				let j;
				try {
					j = JSON.parse(line);
				} catch {
					continue;
				}
				if (j.error) throw new Error(j.error);
				if (j.message?.thinking) {
					if (!msg.thinkStart) msg.thinkStart = performance.now();
					msg.thinkContent = (msg.thinkContent || '') + j.message.thinking;
					msg.thinkTok = estTokens(msg.thinkContent);
					queueLive();
				}
				if (j.message?.content) {
					if (msg.thinkStart && !msg.thinkS) msg.thinkS = Math.max(1, Math.round((performance.now() - msg.thinkStart) / 1000));
					msg.content += j.message.content;
					queueLive();
				}
				if (j.message?.tool_calls) toolCalls.push(...j.message.tool_calls);
				if (j.done) lastJ = j;
			}
		}
	} finally {
		if (liveRaf) {
			cancelAnimationFrame(liveRaf);
			liveRaf = 0;
		}
	}
	return {
		toolCalls,
		lastJ
	};
}

function finishMsg(msg, el, chat, lastJ, opts = {}) {
	msg.pending = false;
	const wall = msg.thinkStart ? (performance.now() - msg.thinkStart) / 1000 : 0;
	const dur = lastJ?.eval_duration ? lastJ.eval_duration / 1e9 : wall;
	const tps = lastJ?.eval_count && lastJ?.eval_duration ? (lastJ.eval_count / (lastJ.eval_duration / 1e9)).toFixed(1) : null;
	msg.stats = {
		tokens: lastJ?.eval_count || 0,
		prompt: lastJ?.prompt_eval_count || 0,
		dur: dur.toFixed(1),
		tps
	};
	msg.model = S().model;
	const continuing = lastJ?.done_reason === 'length' && S().autoContinue && (opts.contDepth || 0) < 3;
	if (!continuing && msg._ctx?.sources?.length && !msg._sourcesAppended) {
		appendSources(msg, msg._ctx.sources);
		msg._sourcesAppended = true;
	}
	generating = false;
	abortCtrl = null;
	setSendState();
	safePaint(msg, el);
	trackStats(msg);
	save();
	renderSidebar();
	updateCtxMeter();
	if (pinned) scrollToBottom();
	if (continuing) {
		toast('Response hit token limit — auto-continuing…', 'warn');
		const apiMsgs2 = apiMessages(chat);
		msg.pending = true;
		apiMsgs2.push({
			role: 'user',
			content: 'Your reply was cut off mid-sentence. Continue EXACTLY where you stopped — no preamble, no repetition.'
		});
		setTimeout(() => {
			generating = true;
			setSendState();
			abortCtrl = new AbortController();
			toolLoop(chat, msg, msgEl(msg.id) || el, apiMsgs2, currentCaps().includes('tools'), {
				...opts,
				contDepth: (opts.contDepth || 0) + 1
			}, 0, msg._ctx).catch(() => {});
		}, 250);
	} else {
		opts.onDone?.(msg);
	}
}

function stopGeneration() {
	abortCtrl?.abort();
}

function regenerate() {
	const chat = activeChat();
	if (!chat || generating) return;
	const lastA = [...chat.messages].reverse().find(m => m.role === 'assistant');
	if (lastA) {
		lastA.alts ||= [];
		if (lastA.content && !lastA.error) lastA.alts.push({
			content: lastA.content,
			stats: lastA.stats
		});
		lastA.content = '';
		lastA.thinkContent = '';
		lastA.error = false;
		lastA.pending = true;
		lastA.stats = null;
		lastA.toolLog = [];
		lastA._sourcesAppended = false;
		lastA._ctx = null;
		paintAssistant(msgEl(lastA.id), lastA);
		generate({
			continueMsg: lastA
		});
		return;
	}
	generate();
}

function cycleAlt(m, dir) {
	if (!m.alts?.length) return;
	const versions = [...m.alts, {
		content: m.content,
		stats: m.stats
	}];
	m.altIdx = ((m.altIdx ?? versions.length - 1) + dir + versions.length) % versions.length;
	const v = versions[m.altIdx];
	m.content = v.content;
	m.stats = v.stats;
	m._altCount = versions.length;
	paintAssistant(msgEl(m.id), m);
	save();
}
async function autoTitle(chat) {
	const first = chat.messages.find(m => m.role === 'user');
	if (!first?.content) return;
	try {
		let t = (await quickAsk([{
			role: 'user',
			content: `Write a very short title (3-6 words, no quotes) for a chat beginning with:\n\n${first.content.slice(0,400)}`
		}])).trim().replace(/^["'`*_\s]+|["'`*_.!\s]+$/g, '').split('\n')[0].slice(0, 60);
		if (t && DB.data.chats[chat.id]) {
			chat.title = t;
			save();
			renderSidebar($('#chatSearch').value);
		}
	} catch {}
}

function addMemory(text, source = 'manual') {
	text = text.trim();
	if (!text) return;
	if (DB.data.memory.some(m => m.text.toLowerCase() === text.toLowerCase())) return;
	DB.data.memory.push({
		id: uid(),
		text,
		createdAt: Date.now(),
		source
	});
	save();
	toast('Remembered: "' + text.slice(0, 48) + (text.length > 48 ? '…' : '') + '"');
}
async function maybeExtractMemory(text) {
	if (!S().autoMemory || !text || text.length < 12) return;
	if (text.startsWith('/remember ')) {
		addMemory(text.slice(10), 'command');
		return;
	}
	if (text.startsWith('/forget ')) {
		const q = text.slice(8).toLowerCase(),
			before = DB.data.memory.length;
		DB.data.memory = DB.data.memory.filter(m => !m.text.toLowerCase().includes(q));
		save();
		toast(`Forgot ${before-DB.data.memory.length} memory(ies)`);
		return;
	}
	if (!/\b(i prefer|i like|i love|i hate|my name|i am|i'm|i work|i use|my favou?rite|remember|always use|never use|my (?:job|role|stack))\b/i.test(text)) return;
	try {
		const out = await quickAsk([{
			role: 'user',
			content: `Extract 0-3 concise durable facts about the user. One per line, plain text. If none, reply NONE.\nMessage: "${text.slice(0,600)}"`
		}]);
		out.split('\n').map(l => l.replace(/^[-•\d.\s]+/, '').trim()).filter(l => l && l !== 'NONE' && l.length < 140).slice(0, 3).forEach(f => addMemory(f, 'auto'));
	} catch {}
}

function openMemoryModal() {
	const list = $('#memoryList');
	const paint = () => {
		list.innerHTML = DB.data.memory.length ?
			DB.data.memory.map(m => `<div class="mem-item" data-id="${m.id}"><div class="mem-text" contenteditable="true" spellcheck="false">${esc(m.text)}</div><div class="mem-side"><span class="mem-src">${esc(m.source)}</span><button class="icon-btn sm" data-mact="del" title="Forget">${icon('trash')}</button></div></div>`).join('') :
			'<div class="mem-empty">Nothing remembered yet.<br>Say <b>"I prefer Python"</b> or use <code>/remember …</code></div>';
	};
	paint();
	$('#memoryModal').classList.add('open');
	list.onclick = e => {
		const b = e.target.closest('[data-mact]');
		if (!b) return;
		DB.data.memory = DB.data.memory.filter(m => m.id !== b.closest('.mem-item').dataset.id);
		save();
		paint();
		toast('Memory deleted');
	};
	list.onfocusout = e => {
		if (!e.target.classList.contains('mem-text')) return;
		const m = DB.data.memory.find(x => x.id === e.target.closest('.mem-item').dataset.id);
		const v = e.target.textContent.trim();
		if (m && v && v !== m.text) {
			m.text = v;
			save();
			toast('Memory updated');
		}
	};
	$('#memoryAddBtn').onclick = () => {
		const inp = $('#memoryAddInput');
		if (inp.value.trim()) {
			addMemory(inp.value, 'manual');
			inp.value = '';
			paint();
		}
	};
}

function createChat(activate = true) {
	const id = uid();
	DB.data.chats[id] = {
		id,
		title: 'New chat',
		folderId: null,
		pinned: false,
		archived: false,
		tags: [],
		createdAt: Date.now(),
		updatedAt: Date.now(),
		messages: []
	};
	if (activate) {
		DB.data.activeId = id;
		renderChat();
	}
	save();
	renderSidebar();
	return id;
}

function openChat(id) {
	if (!DB.data.chats[id]) return;
	DB.data.activeId = id;
	save();
	renderSidebar($('#chatSearch').value);
	renderChat();
	$('#app').classList.remove('side-open');
}
async function deleteChat(id) {
	if (!await fancyConfirm('Delete chat', 'Delete "' + DB.data.chats[id]?.title + '" permanently?', {
			confirmText: 'Delete'
		})) return;
	delete DB.data.chats[id];
	if (DB.data.activeId === id) {
		const rest = sortedChats();
		if (rest.length) DB.data.activeId = rest[0].id;
		else createChat(false);
	}
	save();
	renderSidebar();
	renderChat();
	toast('Chat deleted');
}

function forkChat(chat, uptoIdx = null) {
	const id = uid();
	const msgs = JSON.parse(JSON.stringify(uptoIdx == null ? chat.messages : chat.messages.slice(0, uptoIdx + 1)));
	msgs.forEach(m => {
		delete m.pending;
		delete m.error;
	});
	DB.data.chats[id] = {
		id,
		title: '⑂ ' + chat.title.slice(0, 48),
		folderId: chat.folderId,
		pinned: false,
		archived: false,
		tags: [...chat.tags],
		createdAt: Date.now(),
		updatedAt: Date.now(),
		messages: msgs,
		forkOf: chat.id
	};
	save();
	renderSidebar();
	toast('Forked into a new timeline');
	return id;
}

function editCreatesBranch(m) {
	const chat = activeChat();
	const idx = chat.messages.findIndex(x => x.id === m.id);
	if (idx < chat.messages.length - 1) {
		const id = forkChat(chat, idx - 1);
		const nc = DB.data.chats[id];
		nc.messages.push({
			...m,
			id: uid()
		});
		nc.title = '⑂ ' + chat.title.slice(0, 48);
		save();
		openChat(id);
		toast('Created an alternate timeline — original untouched');
		return true;
	}
	return false;
}
let tagFilter = null,
	showArchived = false;

function renderSidebar(filter = '') {
	const q = filter.trim().toLowerCase();
	const all = sortedChats().filter(c => {
		if (c.archived !== showArchived) return false;
		if (tagFilter && !c.tags?.includes(tagFilter)) return false;
		if (q) return c.title.toLowerCase().includes(q) || c.tags?.some(t => t.toLowerCase().includes(q)) || c.messages.some(m => (m.content || '').toLowerCase().includes(q));
		return true;
	});
	const pinnedC = all.filter(c => c.pinned),
		rest = all.filter(c => !c.pinned);
	const item = c => {
		const snip = q ? c.messages.map(m => m.content).find(t => t && stripMd(t).toLowerCase().includes(q)) : null;
		return `<div class="chat-item${c.id===DB.data.activeId?' active':''}${c.archived?' archived':''}" data-id="${c.id}">
    <div class="chat-main"><span class="chat-title">${hi(c.title,q)}</span>${snip?`<span class="chat-snippet">${hi(snippet(snip,q),q)}</span>`:''}</div>
    <span class="chat-badges">${c.forkOf?icon('fork','bdg'):''}${c.summary?icon('spark','bdg'):''}${c.pinned?icon('pin','bdg pin-b'):''}</span>
    <button class="chat-more" data-more="${c.id}" title="More">${icon('dots')}</button></div>`;
	};
	let html = '';
	if (q && all.length) html += `<div class="group-label">${all.length} result${all.length!==1?'s':''} for “${esc(filter.trim())}”</div>`;
	if (pinnedC.length) html += '<div class="group-label">' + icon('pin') + ' Pinned</div>' + pinnedC.map(item).join('');
	const inFolders = new Set();
	DB.data.folders.forEach(f => {
		const fc = rest.filter(c => c.folderId === f.id);
		fc.forEach(c => inFolders.add(c.id));
		html += `<div class="group-label folder-row" data-folder="${f.id}"><span class="chev${f.collapsed?'':' open'}">▶</span>${icon('folder')} ${esc(f.name)} <span class="cnt">${fc.length}</span>
      <button class="folder-edit" data-fedit="${f.id}" title="Rename">${icon('edit')}</button>
      <button class="folder-edit folder-del" data-fdel="${f.id}" title="Delete folder">${icon('trash')}</button></div>`;
		if (!f.collapsed) html += fc.map(item).join('');
	});
	const loose = rest.filter(c => !inFolders.has(c.id));
	if (loose.length) {
		const ts = new Date().setHours(0, 0, 0, 0);
		const groups = {
			'Today': [],
			'Yesterday': [],
			'Previous 7 days': [],
			'Previous 30 days': [],
			'Older': []
		};
		loose.forEach(c => {
			const d = Math.round((ts - new Date(c.updatedAt).setHours(0, 0, 0, 0)) / 864e5);
			(d <= 0 ? groups.Today : d === 1 ? groups.Yesterday : d < 7 ? groups['Previous 7 days'] : d < 30 ? groups['Previous 30 days'] : groups.Older).push(c);
		});
		for (const [label, chats] of Object.entries(groups))
			if (chats.length) html += `<div class="group-label">${label}</div>` + chats.map(item).join('');
	}
	if (!html) html = `<div class="list-empty">${q?`Nothing matches “${esc(filter.trim())}”`:(showArchived?'No archived chats':'No chats found')}</div>`;
	$('#chatList').innerHTML = html;
	const allTags = [...new Set(Object.values(DB.data.chats).flatMap(c => c.tags || []))];
	$('#tagRow').innerHTML = allTags.length ? `<button class="tag-chip${!tagFilter?' on':''}" data-tag="">all</button>` + allTags.map(t => `<button class="tag-chip${tagFilter===t?' on':''}" data-tag="${esc(t)}">#${esc(t)}</button>`).join('') : '';
	$('#archToggle').innerHTML = icon('archive') + (showArchived ? 'Hide archived' : `Archived <span class="cnt">${Object.values(DB.data.chats).filter(c=>c.archived).length}</span>`);
	$('#archToggle').classList.toggle('on', showArchived);
}

function chatItemMenu(anchor, id) {
	const c = DB.data.chats[id];
	if (!c) return;
	const folders = DB.data.folders.map(f => `<button data-pact="folder" data-fid="${f.id}">${icon('folder')} ${esc(f.name)}</button>`).join('');
	const p = popover(anchor, `<div class="pop-title">${esc(c.title)}</div>
    <button data-pact="rename">${icon('edit')} Rename</button>
    <button data-pact="pin">${icon('pin')} ${c.pinned?'Unpin':'Pin to top'}</button>
    <button data-pact="arch">${icon('archive')} ${c.archived?'Unarchive':'Archive'}</button>
    <button data-pact="fork">${icon('fork')} Fork from here</button>
    <button data-pact="share">${icon('share')} Share…</button>
    <div class="pop-sep"></div><div class="pop-label">${icon('folder')} Move to folder</div>
    ${folders||'<div class="pop-hint">No folders yet</div>'}
    <button data-pact="newfolder">${icon('plus')} New folder…</button>
    <div class="pop-sep"></div><div class="pop-label">${icon('tag')} Tags</div>
    <div class="pop-tags">${(c.tags||[]).map(t=>`<span class="tag-chip on">#${esc(t)}<button data-untag="${esc(t)}">${icon('x','mini')}</button></span>`).join('')}</div>
    <input class="pop-input" id="popTagInput" placeholder="Add tag + Enter">
    <div class="pop-sep"></div>
    <button data-pact="del" class="danger">${icon('trash')} Delete chat</button>`, 'chat-menu');
	p.addEventListener('click', async e => {
		const untag = e.target.closest('[data-untag]');
		if (untag) {
			c.tags = c.tags.filter(t => t !== untag.dataset.untag);
			save();
			renderSidebar($('#chatSearch').value);
			closePopover();
			return;
		}
		const b = e.target.closest('[data-pact]');
		if (!b) return;
		const act = b.dataset.pact;
		if (act === 'rename') {
			closePopover();
			startRename(id);
		} else if (act === 'pin') {
			c.pinned = !c.pinned;
			save();
			renderSidebar($('#chatSearch').value);
			closePopover();
		} else if (act === 'arch') {
			c.archived = !c.archived;
			save();
			renderSidebar($('#chatSearch').value);
			closePopover();
			toast(c.archived ? 'Archived' : 'Restored');
		} else if (act === 'fork') {
			const nid = forkChat(c);
			closePopover();
			openChat(nid);
		} else if (act === 'share') {
			closePopover();
			shareChat(c, anchor);
		} else if (act === 'folder') {
			c.folderId = b.dataset.fid;
			c.updatedAt = Date.now();
			save();
			renderSidebar($('#chatSearch').value);
			closePopover();
		} else if (act === 'newfolder') {
			const name = await fancyPrompt('New folder', 'Folder name…');
			if (!name?.trim()) return;
			const f = {
				id: uid(),
				name: name.trim(),
				collapsed: false
			};
			DB.data.folders.push(f);
			c.folderId = f.id;
			save();
			renderSidebar($('#chatSearch').value);
			closePopover();
		} else if (act === 'del') {
			closePopover();
			deleteChat(id);
		}
	});
	p.querySelector('#popTagInput').addEventListener('keydown', e => {
		if (e.key !== 'Enter') return;
		const v = e.target.value.trim().toLowerCase().replace(/^#/, '').replace(/\s+/g, '-');
		if (v) {
			c.tags = [...new Set([...(c.tags || []), v])];
			save();
			renderSidebar($('#chatSearch').value);
		}
		closePopover();
	});
}

function startRename(id) {
	const item = $('#chatList').querySelector(`.chat-item[data-id="${id}"]`);
	if (!item) return;
	const c = DB.data.chats[id],
		t = item.querySelector('.chat-title');
	t.outerHTML = `<input class="chat-rename" value="${esc(c.title)}">`;
	const inp = item.querySelector('.chat-rename');
	inp.focus();
	inp.select();
	inp.onkeydown = e => {
		if (e.key === 'Enter') inp.blur();
		if (e.key === 'Escape') {
			inp.value = c.title;
			inp.blur();
		}
	};
	inp.onblur = () => {
		c.title = inp.value.trim() || 'Untitled';
		save();
		renderSidebar($('#chatSearch').value);
	};
}

function shareChat(c, anchor) {
	const md = chatToMarkdown(c);
	popover(anchor, `<div class="pop-title">${icon('share')} Share "${esc(c.title)}"</div>
    <button data-sact="md">${icon('copy')} Copy as Markdown</button>
    <button data-sact="html">${icon('download')} Download HTML snapshot</button>
    <button data-sact="native">${icon('zap')} System share…</button>`).addEventListener('click', e => {
		const b = e.target.closest('[data-sact]');
		if (!b) return;
		if (b.dataset.sact === 'md') navigator.clipboard.writeText(md).then(() => toast('Markdown copied'));
		else if (b.dataset.sact === 'html') {
			download(slug(c.title) + '.html', chatToHtml(c), 'text/html');
			toast('Snapshot downloaded');
		} else if (b.dataset.sact === 'native') {
			if (navigator.share) navigator.share({
				title: c.title,
				text: md.slice(0, 1800)
			}).catch(() => {});
			else toast('Not available here', 'warn');
		}
		closePopover();
	});
}

function chatToMarkdown(c) {
	let md = '# ' + c.title + '\n\n_Shared from Fanoos UI · ' + new Date().toLocaleString() + '_\n\n---\n\n';
	c.messages.forEach(m => {
		if (m.error) return;
		md += '**' + (m.role === 'user' ? 'You' : 'Fanoos AI') + '**\n\n' + (m.content || '') + '\n\n---\n\n';
	});
	return md;
}

function chatToHtml(c) {
	return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(c.title)}</title><style>body{font-family:system-ui;max-width:760px;margin:40px auto;padding:0 20px;background:#161311;color:#f3ede2;line-height:1.6}h1{color:#ffb347}.m{margin:18px 0;padding:14px 18px;border-radius:14px}.u{background:#2a221a;margin-left:15%}.a{background:#1f1913;border-left:3px solid #ffb347}.who{font-size:12px;font-weight:700;color:#ffb347;margin-bottom:6px}</style></head><body><h1>🏮 ${esc(c.title)}</h1>` + c.messages.filter(m => !m.error).map(m => `<div class="m ${m.role==='user'?'u':'a'}"><div class="who">${m.role==='user'?'You':'Fanoos AI'}</div>${esc(m.content).replace(/\n/g,'<br>')}</div>`).join('') + '</body></html>';
}
const download = (name, content, type) => {
	const a = document.createElement('a');
	a.href = URL.createObjectURL(new Blob([content], {
		type
	}));
	a.download = name;
	a.click();
	setTimeout(() => URL.revokeObjectURL(a.href), 3000);
};

const findMsg = id => activeChat()?.messages.find(m => m.id === id);
const actionBtn = (act, icn, label, on = false) => `<button data-act="${act}" title="${label}" aria-label="${label}" class="${on?'on':''}">${icon(icn)}</button>`;

function toolLogHtml(m) {
	if (!m.toolLog?.length) return '';
	return `<details class="tool-log"${m.pending?' open':''}><summary>${icon('zap')} ${m.toolLog.length} tool call${m.toolLog.length>1?'s':''}</summary><div class="tl-body">` +
		m.toolLog.map(t => `<div class="tl-item"><div class="tl-head">${icon('play','mini')} <b>${esc(t.name)}</b> <code>${esc(t.args)}</code></div>` +
			(t.result !== undefined ? `<div class="tl-result">${esc(String(t.result).slice(0,400))}${String(t.result).length>400?'…':''}</div>` : '<div class="tl-running">running…</div>') + '</div>').join('') + '</div></details>';
}

function buildMessage(m) {
	const el = document.createElement('div');
	el.className = 'msg ' + m.role + (m.summarized ? ' summarized' : '');
	el.dataset.id = m.id;
	if (m.role === 'user') {
		let media = '';
		if (m.images?.length) media += '<div class="attach-thumbs">' + m.images.map(b => `<img src="data:image/jpeg;base64,${b}" alt="attachment">`).join('') + '</div>';
		if (m.files?.length) media += '<div class="file-chips">' + m.files.map(f => `<span class="file-chip">${icon('file')} ${esc(f.name)}</span>`).join('') + '</div>';
		const sentAt = m.ts ? ` title="Sent at ${new Date(m.ts).toLocaleString()}"` : '';
		el.innerHTML = `<div class="bubble"${sentAt}>${media}<div class="bubble-text">${esc(m.content)}</div></div>
      <div class="msg-actions">${actionBtn('edit','edit','Edit')}${actionBtn('copy','copy','Copy')}${actionBtn('fork','fork','Fork from here')}${actionBtn('del','trash','Delete')}</div>`;
	} else {
		el.innerHTML = `<div class="avatar">${logoSVG()}</div><div class="msg-body"><div class="md"></div><div class="msg-meta"></div>
      <div class="msg-actions">${actionBtn('copy','copy','Copy')}${actionBtn('regen','refresh','Regenerate')}${actionBtn('speak','speak','Read aloud')}
      ${actionBtn('up','up','Good',m.feedback==='up')}${actionBtn('down','down','Bad',m.feedback==='down')}
      ${actionBtn('fork','fork','Fork')}${actionBtn('del','trash','Delete')}</div></div>`;
		paintAssistant(el, m);
	}
	return el;
}

function paintAssistant(el, m) {
	if (!el) return;
	const md = el.querySelector('.md'),
		meta = el.querySelector('.msg-meta');
	if (m.error) {
		meta.innerHTML = '';
		md.innerHTML = `<div class="error-box"><div class="e-title">${icon('alert')} Request failed</div><div class="e-msg">${esc(m.errorText||'Unknown error')}</div>
      ${m.isCors?'<div class="e-hint">Host unreachable or blocked. Click <b>Troubleshoot</b> — usually Ollama needs <code>OLLAMA_HOST=0.0.0.0</code> + <code>OLLAMA_ORIGINS=*</code>.</div>':''}
      <div class="e-acts"><button class="e-btn primary" data-act="retry">Retry</button><button class="e-btn" data-act="connhelp">Troubleshoot</button><button class="e-btn" data-act="dismiss">Dismiss</button></div></div>`;
		return;
	}
	if (m.pending && !m.content && !m.thinkContent && !m.toolLog?.length) {
		md.innerHTML = '<div class="typing"><span></span><span></span><span></span></div>';
		meta.innerHTML = '';
		return;
	}
	let html = toolLogHtml(m);
	if (m.thinkContent) html += thinkHtml(m.thinkContent, !m.pending, m.thinkS, m.thinkTok);
	if (m.pending && m.content) html += renderStreaming(m.content, m);
	else if (m.content) html += renderWithThinking(m.content, m);
	else if (m.pending) html += '<div class="typing"><span></span><span></span><span></span></div>';
	md.innerHTML = html;
	const parts = [];
	if (m.ts) parts.push(`<span class="m-ts">${fmtTime(m.ts)}</span>`);
	if (m.model) parts.push(m.model);
	if (m.stats) {
		if (m.stats.tps) parts.push(m.stats.tps + ' tok/s');
		parts.push(m.stats.dur + 's', fmtNum(m.stats.tokens) + ' tok');
	}
	if (m._altCount || m.alts?.length) {
		const total = (m.alts?.length || 0) + 1,
			cur = (m.altIdx ?? total - 1) + 1;
		parts.push(`<span class="alt-nav"><button data-act="alt-prev">‹</button> ${cur}/${total} <button data-act="alt-next">›</button></span>`);
	}
	meta.innerHTML = parts.join(' · ');
}
document.addEventListener('click', e => {
	const cb = e.target.closest('[data-cb]');
	if (cb) {
		handleCodeAction(cb);
		return;
	}
	const btn = e.target.closest('[data-act]');
	if (!btn) return;
	const el = btn.closest('.msg');
	if (!el) return;
	const m = findMsg(el.dataset.id);
	if (!m) return;
	const chat = activeChat();
	switch (btn.dataset.act) {
		case 'copy':
			navigator.clipboard.writeText(m.content).then(() => toast('Copied'));
			break;
		case 'del':
			chat.messages = chat.messages.filter(x => x.id !== m.id);
			chat.updatedAt = Date.now();
			save();
			renderChat();
			renderSidebar();
			toast('Message deleted');
			break;
		case 'up':
		case 'down': {
			const a = btn.dataset.act;
			m.feedback = m.feedback === a ? null : a;
			save();
			el.querySelector('[data-act="up"]').classList.toggle('on', m.feedback === 'up');
			el.querySelector('[data-act="down"]').classList.toggle('on', m.feedback === 'down');
			if (m.feedback) toast('Thanks for the feedback!');
			break;
		}
		case 'speak':
			speakMessage(m, btn);
			break;
		case 'regen':
		case 'retry':
			regenerate();
			break;
		case 'dismiss':
			chat.messages = chat.messages.filter(x => x.id !== m.id);
			save();
			renderChat();
			break;
		case 'connhelp':
			openConnHelp();
			break;
		case 'edit':
			startEdit(m, el);
			break;
		case 'fork': {
			const idx = chat.messages.findIndex(x => x.id === m.id);
			openChat(forkChat(chat, idx));
			break;
		}
		case 'alt-prev':
			cycleAlt(m, -1);
			break;
		case 'alt-next':
			cycleAlt(m, 1);
			break;
	}
});

function startEdit(m, el) {
	const bubble = el.querySelector('.bubble');
	if (!bubble) return;
	bubble.outerHTML = `<textarea class="edit-box">${esc(m.content)}</textarea><div class="edit-acts"><button class="e-btn" data-eact="cancel">Cancel</button><button class="e-btn primary" data-eact="save">Save</button></div>`;
	const box = el.querySelector('.edit-box');
	box.style.height = box.scrollHeight + 'px';
	box.focus();
	el.querySelectorAll('[data-eact]').forEach(b => b.addEventListener('click', () => {
		if (b.dataset.eact === 'cancel') return renderChat();
		const v = box.value.trim();
		if (!v) return;
		if (editCreatesBranch(m)) {
			const nm = activeChat().messages[activeChat().messages.length - 1];
			nm.content = v;
			save();
			renderChat();
			generate();
			return;
		}
		m.content = v;
		save();
		renderChat();
		if (m.role === 'user') generate();
	}));
}

function handleCodeAction(btn) {
	const block = btn.closest('.codeblock');
	const code = block.querySelector('pre').textContent;
	const lang = (block.querySelector('.code-head span')?.textContent || 'code').toLowerCase();
	const act = btn.dataset.cb;
	if (act === 'copy') {
		navigator.clipboard.writeText(code).then(() => {
			const s = btn.lastChild,
				o = s.textContent;
			s.textContent = 'Copied!';
			setTimeout(() => s.textContent = o, 1300);
		});
	} else if (act === 'preview') openPreview(code, lang);
	else if (act === 'chart') openCsvChart(code);
	else if (act === 'run') runPythonBlock(btn, code);
}

function renderChat() {
	const chat = activeChat(),
		mel = messagesEl();
	mel.innerHTML = '';
	const empty = !chat || chat.messages.length === 0;
	$('#main').classList.toggle('empty', empty);
	if (chat) chat.messages.forEach(m => mel.appendChild(buildMessage(m)));
	pinned = true;
	hidePill();
	updateCtxMeter();
	requestAnimationFrame(scrollToBottom);
	document.title = (chat && !empty ? chat.title + ' · ' : '') + 'Fanoos UI';
}

function scrollToBottom() {
	const sc = $('#chatScroll');
	sc.scrollTop = sc.scrollHeight;
}

function hidePill() {
	$('#scrollPill').classList.remove('show');
}

const input = () => $('#promptInput');

function resizeInput() {
	const i = input();
	i.style.height = 'auto';
	i.style.height = Math.min(i.scrollHeight, 220) + 'px';
}

function updateTokCount() {
	const n = input().value.length;
	$('#tokCount').textContent = n ? '~' + estTokens(input().value) + ' tok' : '';
	updateCtxMeter();
}

function updateCtxMeter() {
	const m = $('#ctxMeter');
	if (!m) return;
	const chat = activeChat();
	if (!chat || !chat.messages.length) {
		m.hidden = true;
		return;
	}
	let t = estTokens(buildSystemMsg());
	chat.messages.forEach(x => t += estTokens(x.content));
	const pct = clamp(Math.round(t / Math.max(1, +S().numCtx) * 100), 0, 100);
	m.hidden = false;
	m.querySelector('i').style.width = pct + '%';
	m.classList.toggle('hot', pct > 70);
	m.title = `Context: ~${fmtNum(t)} / ${fmtNum(+S().numCtx)} tokens (${pct}%)`;
}
const TEXT_EXT = /\.(txt|md|markdown|csv|json|py|js|ts|jsx|tsx|html|css|svg|yml|yaml|sh|bash|c|cpp|h|java|go|rs|rb|php|sql|toml|ini|log|xml)$/i;
async function ingestFile(f) {
	if (f.type.startsWith('image/')) {
		if (f.size > 12 * 1024 * 1024) return toast('Image too large (max 12 MB)', 'warn');
		const dataUrl = await new Promise(res => {
			const r = new FileReader();
			r.onload = () => res(r.result);
			r.readAsDataURL(f);
		});
		attachments.push({
			kind: 'image',
			name: f.name,
			dataUrl,
			b64: dataUrl.split(',')[1]
		});
	} else if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
		const buf = await f.arrayBuffer();
		const text = naivePdfText(new Uint8Array(buf));
		attachments.push({
			kind: 'doc',
			name: f.name,
			type: 'pdf',
			textPreview: text.slice(0, 8000)
		});
		if (text.length < 40) toast('PDF: best-effort extraction (scanned PDFs unsupported)', 'warn');
	} else if (f.type.startsWith('audio/')) {
		attachments.push({
			kind: 'audio',
			name: f.name,
			type: 'audio',
			textPreview: `[Audio file: ${f.name}, ${(f.size/1048576).toFixed(1)} MB — Ollama models cannot listen to audio]`
		});
		toast('Audio attached as reference only', 'warn');
	} else if (TEXT_EXT.test(f.name) || f.type.startsWith('text/') || f.type === 'application/json') {
		if (f.size > 2 * 1024 * 1024) return toast('File too large (max 2 MB)', 'warn');
		attachments.push({
			kind: 'doc',
			name: f.name,
			type: 'text',
			textPreview: (await f.text()).slice(0, 20000)
		});
	} else return toast('Unsupported file type', 'warn');
	renderAttachments();
	setSendState();
}

function naivePdfText(bytes) {
	let s = '';
	for (let i = 0; i < bytes.length; i++) {
		const c = bytes[i];
		if (c >= 32 && c < 127 || c === 10) s += String.fromCharCode(c);
		else if (s.length && s[s.length - 1] !== ' ') s += ' ';
	}
	const parts = s.match(/\(([^\(\)]{3,})\)/g) || [];
	return (parts.map(p => p.slice(1, -1)).join(' ').replace(/\\[nrt]/g, ' ').trim() || s.replace(/\s{3,}/g, '\n')).slice(0, 12000);
}

function renderAttachments() {
	$('#attachRow').innerHTML = attachments.map((a, i) => a.kind === 'image' ?
		`<div class="attach-chip"><img src="${a.dataUrl}" alt="${esc(a.name)}"><button data-i="${i}" title="Remove">${icon('x','mini')}</button></div>` :
		`<div class="attach-chip doc">${icon(a.kind==='audio'?'audio':'file')}<span>${esc(a.name)}</span><button data-i="${i}">${icon('x','mini')}</button></div>`).join('');
}

function clearAttachments() {
	attachments = [];
	renderAttachments();
}
$('#attachRow').addEventListener('click', e => {
	const b = e.target.closest('button[data-i]');
	if (!b) return;
	attachments.splice(+b.dataset.i, 1);
	renderAttachments();
	setSendState();
});

function openLightbox(src) {
	const lb = document.createElement('div');
	lb.className = 'lightbox';
	lb.innerHTML = `<img src="${src}" alt="Preview">`;
	document.body.appendChild(lb);
	requestAnimationFrame(() => lb.classList.add('open'));
	const close = () => {
		lb.classList.remove('open');
		setTimeout(() => lb.remove(), 200);
		document.removeEventListener('keydown', onKey);
	};
	const onKey = e => {
		if (e.key === 'Escape') close();
	};
	lb.addEventListener('click', close);
	document.addEventListener('keydown', onKey);
}
document.addEventListener('click', e => {
	const img = e.target.closest('.attach-thumbs img');
	if (img) openLightbox(img.src);
});
let dragDepth = 0;
['dragenter', 'dragover'].forEach(ev => document.addEventListener(ev, e => {
	if (![...e.dataTransfer.types].includes('Files')) return;
	e.preventDefault();
	dragDepth++;
	$('#dropOverlay').classList.add('show');
}));
document.addEventListener('dragleave', e => {
	e.preventDefault();
	if (--dragDepth <= 0) {
		dragDepth = 0;
		$('#dropOverlay').classList.remove('show');
	}
});
document.addEventListener('drop', e => {
	e.preventDefault();
	dragDepth = 0;
	$('#dropOverlay').classList.remove('show');
	[...e.dataTransfer.files].forEach(ingestFile);
});

function openToolsMenu(anchor) {
	popover(anchor, `<div class="pop-title">${icon('zap')} Powers</div>
    <button data-tool="screen">${icon('screen')} Capture my screen</button>
    <button data-tool="camera">${icon('camera')} Live camera</button>
    <button data-tool="voice">${icon('mic')} Voice conversation</button>
    <button data-tool="canvas">${icon('canvas')} Canvas editor</button>
    <div class="pop-sep"></div>
    <div class="pop-hint">Calculator, web search, weather, Wikipedia, dice, units & more are <b>automatic</b> — Fanoos AI uses them as tools when needed.</div>
  `, 'tools-pop').addEventListener('click', e => {
		const b = e.target.closest('[data-tool]');
		if (!b) return;
		closePopover();
		if (b.dataset.tool === 'screen') captureScreen();
		else if (b.dataset.tool === 'camera') openCamera();
		else if (b.dataset.tool === 'voice') openVoiceMode();
		else if (b.dataset.tool === 'canvas') toggleCanvas(true);
	});
}

async function captureScreen() {
	if (!navigator.mediaDevices?.getDisplayMedia) return toast('Screen capture not supported', 'warn');
	try {
		toast('Pick a screen/window — one frame is captured instantly');
		const stream = await navigator.mediaDevices.getDisplayMedia({
			video: true
		});
		const video = document.createElement('video');
		video.srcObject = stream;
		await video.play();
		await new Promise(r => setTimeout(r, 350));
		const c = document.createElement('canvas');
		c.width = video.videoWidth;
		c.height = video.videoHeight;
		c.getContext('2d').drawImage(video, 0, 0);
		stream.getTracks().forEach(t => t.stop());
		const dataUrl = c.toDataURL('image/jpeg', .82);
		attachments.push({
			kind: 'image',
			name: 'screen-capture.jpg',
			dataUrl,
			b64: dataUrl.split(',')[1]
		});
		renderAttachments();
		setSendState();
		toast('Screen frame attached — ask Fanoos about it');
	} catch {
		toast('Screen capture cancelled', 'warn');
	}
}

function openCamera() {
	if (camPanel) {
		camPanel.classList.add('open');
		return;
	}
	camPanel = document.createElement('div');
	camPanel.className = 'cam-panel';
	camPanel.innerHTML = `<div class="cam-head">${icon('camera')} Live camera<button class="icon-btn sm" id="camClose">${icon('x')}</button></div>
    <video id="camVideo" autoplay playsinline muted></video>
    <div class="cam-acts"><button class="e-btn primary" id="camSnap">${icon('screen')} Send frame to Fanoos</button></div>`;
	document.body.appendChild(camPanel);
	navigator.mediaDevices.getUserMedia({
			video: {
				facingMode: 'environment'
			}
		}).then(s => {
			camStream = s;
			camPanel.querySelector('#camVideo').srcObject = s;
			camPanel.classList.add('open');
		})
		.catch(() => {
			toast('Camera unavailable', 'error');
			camPanel.remove();
			camPanel = null;
		});
	camPanel.querySelector('#camClose').onclick = closeCamera;
	camPanel.querySelector('#camSnap').onclick = () => {
		const v = camPanel.querySelector('#camVideo'),
			c = document.createElement('canvas');
		c.width = v.videoWidth;
		c.height = v.videoHeight;
		c.getContext('2d').drawImage(v, 0, 0);
		const dataUrl = c.toDataURL('image/jpeg', .82);
		attachments.push({
			kind: 'image',
			name: 'camera-frame.jpg',
			dataUrl,
			b64: dataUrl.split(',')[1]
		});
		renderAttachments();
		setSendState();
		if (!input().value) {
			input().value = 'What do you see in this camera frame?';
			resizeInput();
			updateTokCount();
		}
		toast('Frame captured — press send');
	};
}

function closeCamera() {
	camStream?.getTracks().forEach(t => t.stop());
	camStream = null;
	camPanel?.classList.remove('open');
	setTimeout(() => {
		camPanel?.remove();
		camPanel = null;
	}, 200);
}

function openPreview(code, lang) {
	$('#previewTitle').textContent = lang === 'svg' ? 'SVG artifact' : 'HTML artifact';
	const doc = lang === 'svg' ? `<!DOCTYPE html><html><body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#1c1712">${code}</body></html>` :
		(/<html[\s>]/i.test(code) ? code : `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:system-ui;padding:16px}</style></head><body>${code}</body></html>`);
	$('#previewFrame').srcdoc = doc;
	$('#previewPanel').classList.add('open');
	$('#app').classList.add('preview-open');
}

function openCsvChart(csv) {
	try {
		const rows = csv.trim().split(/\r?\n/).map(r => r.split(/[,;\t]/).map(c => c.trim().replace(/^"|"$/g, '')));
		const head = rows[0],
			body = rows.slice(1).filter(r => r.length > 1);
		const numCols = head.map((h, i) => body.every(r => !isNaN(parseFloat(r[i])) || r[i] === '') ? i : -1).filter(i => i >= 0);
		if (!numCols.length) return toast('No numeric columns in CSV', 'warn');
		const labelCol = head.findIndex((h, i) => !numCols.includes(i));
		const labels = body.map((r, i) => labelCol >= 0 ? r[labelCol] : '#' + (i + 1));
		const valCol = numCols[0],
			vals = body.map(r => parseFloat(r[valCol]) || 0);
		const max = Math.max(...vals, 1),
			min = Math.min(...vals, 0),
			W = 560,
			H = 280,
			P = 36,
			bw = (W - P * 2) / vals.length;
		let bars = '',
			axis = '';
		vals.forEach((v, i) => {
			const h = (v - min) / (max - min || 1) * (H - P * 2),
				x = P + i * bw + bw * .15,
				y = H - P - h;
			bars += `<rect x="${x}" y="${y}" width="${bw*.7}" height="${h}" rx="4" fill="url(#g)"><title>${esc(labels[i])}: ${v}</title></rect><text x="${x+bw*.35}" y="${H-P+16}" font-size="10" fill="#b8a88f" text-anchor="middle">${esc(String(labels[i]).slice(0,8))}</text>`;
		});
		for (let g = 0; g <= 4; g++) {
			const y = P + g * (H - P * 2) / 4;
			axis += `<line x1="${P}" y1="${y}" x2="${W-P}" y2="${y}" stroke="#3a2f24" stroke-dasharray="3 4"/><text x="${P-6}" y="${y+3}" font-size="10" fill="#8d7c66" text-anchor="end">${(max-g*(max-min)/4).toFixed(0)}</text>`;
		}
		$('#previewTitle').textContent = 'Chart · ' + (head[valCol] || 'CSV');
		$('#previewFrame').srcdoc = `<!DOCTYPE html><html><body style="margin:0;background:#1c1712;display:grid;place-items:center;min-height:100vh;padding:20px;box-sizing:border-box"><svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffc65c"/><stop offset="1" stop-color="#ff8a3d"/></linearGradient></defs>${axis}${bars}<text x="${P}" y="18" font-size="13" font-weight="700" fill="#f3ede2">${esc(head[valCol])} by ${esc(labelCol>=0?head[labelCol]:'index')}</text></svg></body></html>`;
		$('#previewPanel').classList.add('open');
		$('#app').classList.add('preview-open');
	} catch (e) {
		toast('CSV parse error: ' + e.message, 'error');
	}
}
$('#previewClose').addEventListener('click', () => {
	$('#previewPanel').classList.remove('open');
	$('#app').classList.remove('preview-open');
});

function loadPyodideOnce() {
	if (pyodidePromise) return pyodidePromise;
	pyodidePromise = (async () => {
		if (!window.loadPyodide) await new Promise((res, rej) => {
			const s = document.createElement('script');
			s.src = 'https://cdn.jsdelivr.net/pyodide/v0.25.1/full/pyodide.js';
			s.onload = res;
			s.onerror = () => rej(new Error('Pyodide CDN unreachable'));
			document.head.appendChild(s);
		});
		return await loadPyodide({
			indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.25.1/full/'
		});
	})().catch(e => {
		pyodidePromise = null;
		throw e;
	});
	return pyodidePromise;
}
async function runPythonBlock(btn, code) {
	const block = btn.closest('.codeblock');
	let out = block.querySelector('.py-out');
	if (!out) {
		out = document.createElement('pre');
		out.className = 'py-out';
		block.appendChild(out);
	}
	out.textContent = '⏳ Loading Python runtime (~6 MB first time)…';
	btn.disabled = true;
	try {
		const py = await loadPyodideOnce();
		out.textContent = '⏳ Running…';
		let stdout = '';
		py.setStdout({
			batched: s => stdout += s + '\n'
		});
		py.setStderr({
			batched: s => stdout += s + '\n'
		});
		await py.runPythonAsync(code);
		out.textContent = stdout.trim() || '✓ finished (no output)';
		out.classList.add('ok');
	} catch (e) {
		out.textContent = '✗ ' + String(e.message || e).split('\n').slice(-3).join('\n');
		out.classList.add('err');
	} finally {
		btn.disabled = false;
	}
}

let canvasBusy = false;

function toggleCanvas(force) {
	const panel = $('#canvasPanel'),
		open = force ?? !panel.classList.contains('open');
	panel.classList.toggle('open', open);
	$('#app').classList.toggle('canvas-open', open);
	if (open) {
		const c = activeChat();
		if (c && $('#canvasArea').value === '' && c.canvas) $('#canvasArea').value = c.canvas;
		$('#canvasArea').focus();
	}
}
$('#canvasClose').addEventListener('click', () => toggleCanvas(false));
$('#canvasArea').addEventListener('input', () => {
	const c = activeChat();
	if (c) {
		c.canvas = $('#canvasArea').value;
		DB.save();
	}
});
$('#canvasTools').addEventListener('click', async e => {
	const b = e.target.closest('[data-cact]');
	if (!b || canvasBusy) return;
	const area = $('#canvasArea'),
		doc = area.value;
	if (!doc.trim() && b.dataset.cact !== 'continue') return toast('Write something first', 'warn');
	if (!S().model) return toast('Pick a model first', 'warn');
	const sel = area.value.slice(area.selectionStart, area.selectionEnd),
		target = sel || doc;
	const instr = {
		improve: 'Improve the writing (clarity, flow, tone). Keep meaning similar.',
		grammar: 'Fix grammar, spelling and punctuation only.',
		summarize: 'Summarize compactly.',
		continue: 'Continue writing naturally from where it stops. Match style.',
		custom: await fancyPrompt('Canvas instruction', 'Tell Fanoos what to do…') || ''
	} [b.dataset.cact];
	if (!instr) return;
	canvasBusy = true;
	$('#canvasStatus').textContent = 'Fanoos is writing…';
	try {
		const out = await quickAsk([{
			role: 'system',
			content: buildSystemMsg() + '\n\nYou are editing a document. Return ONLY the rewritten text — no preamble, no fences.'
		}, {
			role: 'user',
			content: instr + '\n\n---\n' + target.slice(0, 12000)
		}], {
			temperature: 0.5
		});
		const clean = out.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '');
		area.value = sel ? doc.replace(sel, clean) : b.dataset.cact === 'continue' ? doc + '\n' + clean : clean;
		const c = activeChat();
		if (c) {
			c.canvas = area.value;
			DB.save();
		}
		$('#canvasStatus').textContent = 'Done ✓';
		setTimeout(() => $('#canvasStatus').textContent = '', 2500);
	} catch (err) {
		toast('Canvas failed: ' + err.message, 'error');
		$('#canvasStatus').textContent = '';
	}
	canvasBusy = false;
});

let voices = [];

function refreshVoices() {
	voices = synth?.getVoices() || [];
}
if (synth) {
	refreshVoices();
	synth.onvoiceschanged = refreshVoices;
}
const pickVoice = () => voices.find(v => v.voiceURI === S().voiceURI) || voices.find(v => v.default) || voices[0];

function chunkText(text, max) {
	const sentences = String(text).split(/(?<=[.!?؟。])\s+|\n+/).filter(s => s.trim()),
		out = [];
	let cur = '';
	for (const s of sentences) {
		if ((cur + ' ' + s).length > max && cur) {
			out.push(cur.trim());
			cur = s;
		} else cur += ' ' + s;
		while (cur.length > max) {
			out.push(cur.slice(0, max));
			cur = cur.slice(max);
		}
	}
	if (cur.trim()) out.push(cur.trim());
	return out;
}

function speakMessage(m, btn) {
	if (speakId === m.id && synth.speaking) {
		stopSpeak();
		return;
	}
	stopSpeak();
	const chunks = chunkText(stripMd(m.content), 210);
	if (!chunks.length) return;
	speakId = m.id;
	btn?.classList.add('on');
	speakQueue = chunks;
	speakNext(btn);
}

function speakNext(btn) {
	if (!speakQueue.length) {
		speakId = null;
		btn?.classList.remove('on');
		return;
	}
	const u = new SpeechSynthesisUtterance(speakQueue.shift());
	const v = pickVoice();
	if (v) u.voice = v;
	u.rate = +S().voiceRate || 1;
	u.onend = () => speakNext(btn);
	u.onerror = () => {
		speakId = null;
		btn?.classList.remove('on');
	};
	synth.speak(u);
}

function stopSpeak() {
	synth?.cancel();
	speakQueue = [];
	speakId = null;
	$$('.msg-actions [data-act="speak"]').forEach(b => b.classList.remove('on'));
}
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SR) {
	$('#micBtn').hidden = false;
	$('#micBtn').addEventListener('click', () => {
		if (composerListening && composerRecog) {
			composerRecog.stop();
			return;
		}
		composerRecog = new SR();
		composerRecog.lang = navigator.language || 'en-US';
		composerRecog.continuous = true;
		composerRecog.interimResults = true;
		dictBase = input().value ? input().value.replace(/\s+$/, '') + ' ' : '';
		composerRecog.onresult = e => {
			let t = '';
			for (const r of e.results) t += r[0].transcript;
			input().value = (dictBase + t).replace(/\s+/g, ' ');
			resizeInput();
			updateTokCount();
			setSendState();
		};
		composerRecog.onend = () => {
			composerListening = false;
			$('#micBtn').classList.remove('listening');
		};
		composerRecog.onerror = () => {
			composerListening = false;
			$('#micBtn').classList.remove('listening');
		};
		try {
			composerRecog.start();
			composerListening = true;
			$('#micBtn').classList.add('listening');
		} catch {}
	});
}

let vmListening = false,
	vmContinuous = false,
	vmRecog = null;

function openVoiceMode() {
	$('#voiceModal').classList.add('open');
	paintVoiceState('idle');
	if (!SR) {
		$('#voiceBig').disabled = true;
		paintVoiceState('unsupported');
	}
}
$('#voiceClose').addEventListener('click', () => {
	$('#voiceModal').classList.remove('open');
	vmRecog?.abort?.();
	stopSpeak();
	vmListening = false;
});

function paintVoiceState(s) {
	const map = {
		idle: 'Tap the lantern and speak',
		listening: 'Listening…',
		thinking: 'Fanoos is thinking…',
		speaking: 'Speaking…',
		unsupported: 'Speech recognition not supported in this browser'
	};
	$('#voiceState').textContent = map[s] || s;
	$('#voiceBig').classList.toggle('listening', s === 'listening');
	$('#voiceBig').classList.toggle('thinking', s === 'thinking');
}
$('#voiceCont').addEventListener('change', e => vmContinuous = e.target.checked);
$('#voiceBig').addEventListener('click', () => {
	if (vmListening) {
		vmRecog?.stop();
		return;
	}
	if (!SR) return;
	stopSpeak();
	vmRecog = new SR();
	vmRecog.lang = navigator.language || 'en-US';
	vmRecog.interimResults = false;
	vmRecog.onresult = e => {
		const text = [...e.results].map(r => r[0].transcript).join(' ').trim();
		if (!text) return paintVoiceState('idle');
		paintVoiceState('thinking');
		sendMessage({
			text,
			onDone: msg => {
				paintVoiceState('speaking');
				const chunks = chunkText(stripMd(msg.content), 210);
				speakQueue = chunks;
				speakId = msg.id;
				const finish = () => {
					speakId = null;
					if (vmContinuous && $('#voiceModal').classList.contains('open')) vmListen();
					else paintVoiceState('idle');
				};
				if (!speakQueue.length) return finish();
				const next = () => {
					if (!speakQueue.length) return finish();
					const u = new SpeechSynthesisUtterance(speakQueue.shift());
					const v = pickVoice();
					if (v) u.voice = v;
					u.rate = +S().voiceRate || 1;
					u.onend = next;
					u.onerror = finish;
					synth.speak(u);
				};
				next();
			}
		});
	};
	vmRecog.onend = () => {
		vmListening = false;
	};
	vmRecog.onerror = () => {
		vmListening = false;
		paintVoiceState('idle');
	};
	vmListen();
});

function vmListen() {
	if (!SR) return;
	try {
		vmRecog = vmRecog || new SR();
		vmRecog.lang = navigator.language || 'en-US';
		vmRecog.start();
		vmListening = true;
		paintVoiceState('listening');
	} catch {}
}

function openStats() {
	const st = DB.data.stats,
		daily = st.daily || {};
	const days = [...Array(14)].map((_, i) => {
		const d = new Date();
		d.setDate(d.getDate() - (13 - i));
		return d.toISOString().slice(0, 10);
	});
	const vals = days.map(d => daily[d]?.tokens || 0),
		max = Math.max(...vals, 1);
	const W = 560,
		H = 190,
		P = 30,
		bw = W / days.length;
	let bars = '';
	vals.forEach((v, i) => {
		const h = v / max * (H - P - 24);
		bars += `<rect x="${i*bw+6}" y="${H-P-h}" width="${bw-12}" height="${Math.max(h,v?3:1)}" rx="3" fill="${v?'url(#sg)':'#3a2f24'}"><title>${days[i]}: ${fmtNum(v)}</title></rect>`;
		if (i % 2 === 0) bars += `<text x="${i*bw+bw/2}" y="${H-8}" font-size="9" fill="#8d7c66" text-anchor="middle">${days[i].slice(8)}</text>`;
	});
	let streak = 0;
	for (let i = 0;; i++) {
		const d = new Date();
		d.setDate(d.getDate() - i);
		const k = d.toISOString().slice(0, 10);
		if (daily[k]?.tokens > 0) streak++;
		else if (i === 0) continue;
		else break;
		if (i > 400) break;
	}
	const totTok = Object.values(daily).reduce((a, d) => a + (d.tokens || 0), 0);
	const totMsg = Object.values(daily).reduce((a, d) => a + (d.msgs || 0), 0);
	const totWord = Object.values(daily).reduce((a, d) => a + (d.words || 0), 0);
	const modelRows = Object.entries(st.models || {}).sort((a, b) => b[1] - a[1]).slice(0, 5),
		mMax = modelRows[0]?.[1] || 1;
	$('#statsBody').innerHTML = `<div class="stat-cards">
    <div class="stat-card"><div class="sc-num">${fmtNum(totTok)}</div><div class="sc-lab">total tokens</div></div>
    <div class="stat-card"><div class="sc-num">${fmtNum(totMsg)}</div><div class="sc-lab">replies</div></div>
    <div class="stat-card"><div class="sc-num">${fmtNum(totWord)}</div><div class="sc-lab">words</div></div>
    <div class="stat-card flame"><div class="sc-num">🔥 ${streak}</div><div class="sc-lab">day streak</div></div></div>
    <h3 class="stat-h">Tokens · last 14 days</h3>
    <svg viewBox="0 0 ${W} ${H}" class="stat-chart"><defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffc65c"/><stop offset="1" stop-color="#ff8a3d"/></linearGradient></defs>${bars}</svg>
    <h3 class="stat-h">Model usage</h3>
    ${modelRows.length?modelRows.map(([m,t])=>`<div class="mu-row"><span class="mu-name">${esc(m)}</span><div class="mu-bar"><i style="width:${(t/mMax*100).toFixed(1)}%"></i></div><span class="mu-val">${fmtNum(t)}</span></div>`).join(''):'<div class="mem-empty">No usage yet</div>'}`;
	$('#statsModal').classList.add('open');
}

function exportBackup() {
	download('fanoos-backup-' + todayKey() + '.json', JSON.stringify(DB.data, null, 2), 'application/json');
	toast('Full backup downloaded');
}

function importBackupViaPopover(incoming, anchor) {
	popover(anchor, `<div class="pop-title">${icon('db')} Import backup</div>
    <div class="pop-hint">${Object.keys(incoming.chats).length} chat(s), ${(incoming.memory||[]).length} memories found.</div>
    <button data-iact="merge" class="primary-pop">${icon('merge')} Merge with current data</button>
    <button data-iact="replace">${icon('alert')} Replace everything</button>`).addEventListener('click', e => {
		const b = e.target.closest('[data-iact]');
		if (!b) return;
		if (b.dataset.iact === 'merge') DB.data = mergeDB(incoming, DB.data);
		else DB.data = incoming;
		DB.data.settings = {
			...DEFAULT_SETTINGS,
			...DB.data.settings
		};
		DB.save();
		renderSidebar();
		renderChat();
		refreshSettingsUI();
		toast(b.dataset.iact === 'merge' ? 'Backup merged' : 'Data replaced');
		closePopover();
	});
}

function updateModelBtn() {
	$('#modelName').textContent = S().model || 'Select a model';
	$('#modelBtn').classList.toggle('placeholder', !S().model);
}
async function loadModels() {
	try {
		const j = await (await fetch(hostClean() + '/api/tags')).json();
		models = (j.models || []).sort((a, b) => a.name.localeCompare(b.name));
		if (!S().model && models[0]) {
			S().model = models[0].name;
			DB.save();
		}
		updateModelBtn();
		paintToggles();
	} catch {
		models = [];
	}
}
const capBadge = c => `<span class="cap-badge cap-${c}">${c}</span>`;

function openModelMenu(anchor) {
	const items = models.map(m => {
		const d = m.details || {},
			caps = (m.capabilities || []).filter(c => ['thinking', 'tools', 'vision'].includes(c));
		return `<button class="model-item${m.name===S().model?' selected':''}" data-name="${esc(m.name)}">
      <div><div class="mi-name">${esc(m.name)}</div>
      <div class="mi-meta">${fmtSize(m.size)}${d.parameter_size?' · '+esc(d.parameter_size):''}${d.family?' · '+esc(d.family):''}</div>
      ${caps.length?'<div class="mi-caps">'+caps.map(capBadge).join('')+'</div>':''}</div>
      <span class="mi-check">${icon('check')}</span></button>`;
	}).join('');
	const p = popover(anchor, `<div class="menu-head"><span>Models on this machine</span><button class="icon-btn sm" id="mmRefresh" title="Refresh">${icon('refresh')}</button></div>
    <input class="pop-input" id="mmFilter" placeholder="Filter models…">
    <div class="model-list">${items||'<div class="pop-hint">No models — pull one in the <a href="admin.html">Admin panel</a></div>'}</div>`, 'model-pop');
	p.querySelector('#mmFilter').addEventListener('input', e => {
		const q = e.target.value.toLowerCase();
		p.querySelectorAll('.model-item').forEach(it => it.style.display = it.dataset.name.toLowerCase().includes(q) ? '' : 'none');
	});
	p.querySelector('#mmRefresh').addEventListener('click', async e => {
		e.currentTarget.classList.add('spin');
		await loadModels();
		closePopover();
		openModelMenu(anchor);
	});
	p.querySelector('.model-list').addEventListener('click', e => {
		const it = e.target.closest('.model-item');
		if (!it) return;
		S().model = it.dataset.name;
		DB.save();
		updateModelBtn();
		paintToggles();
		closePopover();
		toast('Model: ' + S().model);
	});
}

function setConn(ok, text) {
	$('#connDot').className = 'conn-dot ' + (ok ? 'ok' : 'bad');
	$('#connText').textContent = text;
}
async function checkConnection() {
	try {
		const r = await fetch(hostClean() + '/api/version', {
			cache: 'no-store',
			signal: AbortSignal.timeout(5000)
		});
		const j = await r.json();
		setConn(true, 'Ollama v' + j.version);
	} catch (e) {
		const cors = /failed to fetch|typeerror|load failed/i.test(e.message);
		setConn(false, cors ? 'Blocked / unreachable — click for help' : 'Not connected — click for help');
	}
}
function openConnHelp() {
	const ov = document.createElement('div');
	ov.className = 'modal-overlay fancy-dialog';
	ov.innerHTML = `<div class="modal" style="width:min(580px,94vw)">
    <div class="modal-head"><h2>Connection troubleshooter</h2><button class="icon-btn ch-x" aria-label="Close">${icon('x')}</button></div>
    <div class="modal-body">
      <p class="dialog-msg">Host: <code>${esc(hostClean())}</code> — <span id="chStatus">testing…</span></p>
      <h3>1 · Ollama must listen on all network interfaces</h3>
      <p class="hint">By default Ollama only accepts connections from <b>localhost</b> — that's why another device can't reach it even with the right IP. Fix:</p>
      <p class="hint"><b>Windows:</b> run these, then fully restart Ollama from the system tray:<br><code>setx OLLAMA_HOST 0.0.0.0</code><br><code>setx OLLAMA_ORIGINS *</code></p>
      <p class="hint"><b>Linux:</b> <code>OLLAMA_HOST=0.0.0.0 OLLAMA_ORIGINS=* ollama serve</code></p>
      <p class="hint"><b>macOS:</b> <code>launchctl setenv OLLAMA_HOST 0.0.0.0</code> and <code>launchctl setenv OLLAMA_ORIGINS *</code>, then restart the Ollama app.</p>
      <h3>2 · Firewall</h3>
      <p class="hint">Allow TCP port <code>11434</code> through your OS firewall for the Ollama process.</p>
      <h3>3 · The host URL in Settings</h3>
      <p class="hint">From another device use <code>http://YOUR-PC-LAN-IP:11434</code> (find it with <code>ipconfig</code> / <code>ip a</code>). On the PC itself use <code>http://127.0.0.1:11434</code>.</p>
    </div>
    <div class="modal-foot"><button class="btn ghost ch-x2">Close</button><button class="btn primary ch-test">${icon('refresh')} Test connection</button></div>
  </div>`;
	document.body.appendChild(ov);
	requestAnimationFrame(() => ov.classList.add('open'));
	const close = () => {
		ov.classList.remove('open');
		setTimeout(() => ov.remove(), 220);
	};
	ov.querySelectorAll('.ch-x,.ch-x2').forEach(b => b.onclick = close);
	ov.addEventListener('click', e => {
		if (e.target === ov) close();
	});
	const runTest = async () => {
		const st = ov.querySelector('#chStatus');
		st.textContent = 'testing…';
		try {
			const t0 = performance.now();
			const r = await fetch(hostClean() + '/api/version', {
				cache: 'no-store',
				signal: AbortSignal.timeout(6000)
			});
			const j = await r.json();
			st.innerHTML = `<b style="color:var(--green)">✓ Connected — Ollama v${esc(j.version)} · ${Math.round(performance.now()-t0)}ms</b>`;
			checkConnection();
		} catch (e) {
			const cors = /failed to fetch|typeerror|load failed/i.test(e.message);
			st.innerHTML = `<b style="color:var(--danger)">✗ ${cors?'Unreachable or blocked — apply steps 1 & 2, then restart Ollama':'Timeout — check the IP, port and firewall'}</b>`;
		}
	};
	ov.querySelector('.ch-test').onclick = runTest;
	runTest();
}

const greetingText = () => {
	const h = new Date().getHours();
	const part = h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
	return `${part}, ${S().userName}`;
};

function refreshSettingsUI() {
	const s = S();
	$('#setHost').value = s.host;
	$('#setName').value = s.userName;
	$('#setSystem').value = s.customInstructions;
	$('#setStream').checked = s.stream;
	$('#setTitle').checked = s.autoTitle;
	$('#setEnter').checked = s.enterToSend;
	$('#setCont').checked = s.autoContinue;
	$('#setAutoSum').checked = s.autoSummarize;
	$('#setAutoMem').checked = s.autoMemory;
	$('#setUseMem').checked = s.useMemory;
	$('#setTemp').value = s.temperature;
	$('#tempVal').textContent = (+s.temperature).toFixed(1);
	$('#setTopP').value = s.topP;
	$('#topPVal').textContent = (+s.topP).toFixed(2);
	$('#setCtx').value = String(s.numCtx);
	$('#setKeep').value = s.keepAlive;
	$('#setSeed').value = s.seed;
	$('#setSearchServer').value = s.searchServer;
	$('#setRate').value = s.voiceRate;
	const vs = $('#setVoice');
	vs.innerHTML = '<option value="">System default voice</option>' + voices.map(v => `<option value="${esc(v.voiceURI)}"${v.voiceURI===s.voiceURI?' selected':''}>${esc(v.name)} (${esc(v.lang)})</option>`).join('');
}

function openSettings() {
	refreshSettingsUI();
	$('#settingsModal').classList.add('open');
}

function saveSettingsForm() {
	const s = S();
	s.host = $('#setHost').value.trim() || DEFAULT_SETTINGS.host;
	s.userName = $('#setName').value.trim() || 'there';
	s.customInstructions = $('#setSystem').value;
	s.stream = $('#setStream').checked;
	s.autoTitle = $('#setTitle').checked;
	s.enterToSend = $('#setEnter').checked;
	s.autoContinue = $('#setCont').checked;
	s.autoSummarize = $('#setAutoSum').checked;
	s.autoMemory = $('#setAutoMem').checked;
	s.useMemory = $('#setUseMem').checked;
	s.temperature = +$('#setTemp').value;
	s.topP = +$('#setTopP').value;
	s.numCtx = +$('#setCtx').value;
	s.keepAlive = $('#setKeep').value;
	s.seed = $('#setSeed').value;
	s.searchServer = $('#setSearchServer').value.trim() || DEFAULT_SETTINGS.searchServer;
	s.voiceURI = $('#setVoice').value;
	s.voiceRate = +$('#setRate').value;
	DB.save();
	$('#greeting').textContent = greetingText();
	checkConnection();
	loadModels();
	toast('Settings saved');
}

function paintToggles() {
	const caps = currentCaps(),
		canThink = caps.includes('thinking');
	if (!canThink && S().deepThink) {
		S().deepThink = false;
		DB.save();
	}
	$('#deepThinkBtn').classList.toggle('on', S().deepThink);
	$('#deepThinkBtn').classList.toggle('unsupported', !canThink);
	$('#deepThinkBtn').title = canThink ?
		(S().deepThink ? 'DeepThink ON — reasoning visible (Ollama think param)' : 'DeepThink OFF — reasoning suppressed (Ollama think param)') :
		'This model lacks the "thinking" capability';
	$('#effortBtn').style.display = canThink ? '' : 'none';
	$('#effortBadge').textContent = S().thinkEffort;
	$('#searchModeBtn').classList.toggle('on', S().searchMode);
}

const SUGGESTIONS = [{
		i: '✍️',
		t: 'Help me write',
		s: 'emails, docs, messages',
		p: 'Help me write a polite, concise email asking my professor for a deadline extension.'
	},
	{
		i: '🌤',
		t: 'Weather check',
		s: 'uses tools automatically',
		p: 'What\'s the weather in Isfahan right now?'
	},
	{
		i: '🧑‍💻',
		t: 'Write code',
		s: 'scripts & functions',
		p: 'Write a Python function that checks whether a string is a palindrome, with docstring and tests.'
	},
	{
		i: '🔬',
		t: 'Research something',
		s: 'multi-source, cited',
		p: 'Research the history of windcatchers (badgirs) in Yazd — search multiple sources, read the best pages, and cite everything.'
	},
	{
		i: '🧮',
		t: 'Quick math',
		s: 'calculator tool',
		p: 'If I invest $500/month at 11% annual return, how much will I have after 15 years? Show the calculation.'
	},
	{
		i: '🏮',
		t: 'Surprise me',
		s: 'something lantern-lit',
		p: 'Tell me a fascinating obscure fact about the city of Yazd, then a 4-line poem about its windcatchers.'
	}
];

const SLASH_COMMANDS = [{
		cmd: '/remember',
		desc: 'Save a fact to permanent memory',
		ins: '/remember '
	},
	{
		cmd: '/forget',
		desc: 'Delete matching memories',
		ins: '/forget '
	},
	{
		cmd: '/model',
		desc: 'Switch the active model',
		act: () => $('#modelBtn').click()
	},
	{
		cmd: '/new',
		desc: 'Start a fresh chat',
		act: () => {
			createChat(true);
			input().focus();
		}
	},
	{
		cmd: '/canvas',
		desc: 'Open the canvas editor',
		act: () => toggleCanvas(true)
	},
	{
		cmd: '/voice',
		desc: 'Voice conversation mode',
		act: openVoiceMode
	},
	{
		cmd: '/memory',
		desc: 'What Fanoos remembers about you',
		act: openMemoryModal
	},
	{
		cmd: '/stats',
		desc: 'Usage statistics',
		act: openStats
	},
	{
		cmd: '/settings',
		desc: 'Preferences & parameters',
		act: openSettings
	},
	{
		cmd: '/export',
		desc: 'Download this chat',
		act: () => $('#exportBtn').click()
	},
	{
		cmd: '/search',
		desc: 'Toggle web search mode',
		act: () => $('#searchModeBtn').click()
	},
	{
		cmd: '/theme',
		desc: 'Toggle light / dark theme',
		act: () => $('#themeToggle').click()
	},
	{
		cmd: '/shortcuts',
		desc: 'Keyboard shortcuts',
		act: () => $('#shortcutsModal').classList.add('open')
	}
];

function slashMatches(q) {
	q = q.toLowerCase();
	return SLASH_COMMANDS.filter(x => x.cmd.slice(1).startsWith(q) || x.desc.toLowerCase().includes(q));
}

function paintSlash() {
	if (!slashState) return;
	const its = slashState.items;
	slashState.el.querySelectorAll('.slash-item').forEach((el, i) => el.classList.toggle('sel', i === slashState.idx));
	const cur = slashState.el.querySelector('.slash-item.sel');
	cur?.scrollIntoView({
		block: 'nearest'
	});
}

function openSlash() {
	const val = input().value;
	if (!val.startsWith('/')) return closeSlash();
	const items = slashMatches(val.slice(1));
	closePopover();
	if (!items.length) return;
	const p = popover($('#composer'),
		`<div class="pop-title">${icon('zap')} Commands — Enter to run</div>` +
		items.map((x, i) => `<button type="button" class="slash-item${i===0?' sel':''}" data-i="${i}"><b>${x.cmd}</b><span>${x.desc}</span></button>`).join(''),
		'slash-pop');
	p.addEventListener('click', e => {
		const b = e.target.closest('.slash-item');
		if (b) pickSlash(+b.dataset.i);
	});
	slashState = {
		items,
		idx: 0,
		el: p
	};
}

function closeSlash() {
	if (slashState) closePopover();
}

function pickSlash(i) {
	const x = slashState?.items[i];
	if (!x) return;
	const inp = input();
	inp.value = '';
	resizeInput();
	updateTokCount();
	setSendState();
	closeSlash();
	if (x.ins) {
		inp.value = x.ins;
		inp.focus();
		inp.setSelectionRange(x.ins.length, x.ins.length);
	} else x.act?.();
	resizeInput();
	updateTokCount();
	setSendState();
}

function slashKeydown(e) {
	if (!slashState) return false;
	if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
		e.preventDefault();
		const n = slashState.items.length;
		slashState.idx = (slashState.idx + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
		paintSlash();
		return true;
	}
	if (e.key === 'Enter' || e.key === 'Tab') {
		e.preventDefault();
		pickSlash(slashState.idx);
		return true;
	}
	return false;
}

function bind() {
	$('#newChatBtn').addEventListener('click', () => {
		createChat(true);
		input().focus();
	});
	$('#chatSearch').addEventListener('input', e => renderSidebar(e.target.value));
	$('#chatList').addEventListener('click', async e => {
		const more = e.target.closest('[data-more]');
		if (more) {
			e.stopPropagation();
			chatItemMenu(more, more.dataset.more);
			return;
		}
		const fedit = e.target.closest('[data-fedit]');
		if (fedit) {
			e.stopPropagation();
			const f = DB.data.folders.find(x => x.id === fedit.dataset.fedit);
			const name = await fancyPrompt('Rename folder', 'Folder name…', f.name);
			if (name?.trim()) {
				f.name = name.trim();
				DB.save();
				renderSidebar($('#chatSearch').value);
			}
			return;
		}
		const fdel = e.target.closest('[data-fdel]');
		if (fdel) {
			e.stopPropagation();
			const f = DB.data.folders.find(x => x.id === fdel.dataset.fdel);
			if (await fancyConfirm('Delete folder', 'Delete "' + f.name + '"? Chats inside move to the main list.', {
					confirmText: 'Delete'
				})) {
				DB.data.folders = DB.data.folders.filter(x => x.id !== f.id);
				Object.values(DB.data.chats).forEach(c => {
					if (c.folderId === f.id) c.folderId = null;
				});
				DB.save();
				renderSidebar($('#chatSearch').value);
				toast('Folder deleted');
			}
			return;
		}
		const frow = e.target.closest('[data-folder]');
		if (frow) {
			const f = DB.data.folders.find(x => x.id === frow.dataset.folder);
			f.collapsed = !f.collapsed;
			DB.save();
			renderSidebar($('#chatSearch').value);
			return;
		}
		const item = e.target.closest('.chat-item');
		if (item) openChat(item.dataset.id);
	});
	$('#tagRow').addEventListener('click', e => {
		const t = e.target.closest('[data-tag]');
		if (!t) return;
		tagFilter = t.dataset.tag || null;
		renderSidebar($('#chatSearch').value);
	});
	$('#archToggle').addEventListener('click', () => {
		showArchived = !showArchived;
		renderSidebar($('#chatSearch').value);
	});
	$('#settingsBtn').addEventListener('click', openSettings);
	$('#memoryBtn').addEventListener('click', openMemoryModal);
	const connRow = document.querySelector('.conn');
	if (connRow) {
		connRow.style.cursor = 'pointer';
		connRow.title = 'Click to troubleshoot the Ollama connection';
		connRow.addEventListener('click', openConnHelp);
	}
	$('#modelBtn').addEventListener('click', e => {
		e.stopPropagation();
		openModelMenu(e.currentTarget);
	});
	$('#deepThinkBtn').addEventListener('click', () => {
		if (!currentCaps().includes('thinking')) return toast('This model doesn\'t have the "thinking" capability', 'warn');
		S().deepThink = !S().deepThink;
		DB.save();
		paintToggles();
		toast(S().deepThink ? 'DeepThink on — reasoning shown & timed (think=true)' : 'DeepThink off — reasoning suppressed (think=false)');
	});
	$('#effortBtn').addEventListener('click', () => {
		const o = ['low', 'med', 'high'];
		S().thinkEffort = o[(o.indexOf(S().thinkEffort) + 1) % 3];
		DB.save();
		paintToggles();
		toast('Thinking effort: ' + S().thinkEffort);
	});
	$('#searchModeBtn').addEventListener('click', () => {
		S().searchMode = !S().searchMode;
		DB.save();
		paintToggles();
		toast(S().searchMode ? 'Search mode on — answers grounded in live sources' : 'Search mode off');
	});
	$('#voiceModeBtn').addEventListener('click', openVoiceMode);
	$('#statsBtn').addEventListener('click', openStats);
	$('#helpBtn').addEventListener('click', () => $('#shortcutsModal').classList.add('open'));
	$('#themeToggle').addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
	$('#exportBtn').addEventListener('click', e => {
		const c = activeChat();
		if (!c?.messages.length) return toast('Nothing to export', 'warn');
		popover(e.currentTarget, `<button data-x="md">${icon('file')} Markdown (.md)</button><button data-x="json">${icon('jsont')} JSON (.json)</button><button data-x="html">${icon('share')} HTML snapshot</button>`).addEventListener('click', ev => {
			const b = ev.target.closest('[data-x]');
			if (!b) return;
			if (b.dataset.x === 'md') download(slug(c.title) + '.md', chatToMarkdown(c), 'text/markdown');
			if (b.dataset.x === 'json') download(slug(c.title) + '.json', JSON.stringify(c, null, 2), 'application/json');
			if (b.dataset.x === 'html') download(slug(c.title) + '.html', chatToHtml(c), 'text/html');
			toast('Exported');
			closePopover();
		});
	});
	$('#clearChatBtn').addEventListener('click', async () => {
		const c = activeChat();
		if (!c?.messages.length) return;
		if (!await fancyConfirm('Clear chat', 'Clear all messages in "' + c.title + '"?', {
				confirmText: 'Clear'
			})) return;
		c.messages = [];
		c.title = 'New chat';
		c.summary = null;
		c.summarizedUpTo = null;
		c.updatedAt = Date.now();
		DB.save();
		renderChat();
		renderSidebar();
	});
	const i = input();
	i.addEventListener('input', () => {
		resizeInput();
		updateTokCount();
		setSendState();
		if (i.value.startsWith('/')) openSlash();
		else if (slashState) closeSlash();
	});
	i.addEventListener('keydown', e => {
		if (slashKeydown(e)) return;
		if (e.key === 'Enter' && !e.shiftKey && S().enterToSend && !e.isComposing) {
			e.preventDefault();
			sendMessage();
		}
	});
	document.addEventListener('paste', e => {
		if (e.target.closest('#canvasArea')) return;
		const files = [...(e.clipboardData?.files || [])];
		if (!files.length) return;
		e.preventDefault();
		files.forEach(ingestFile);
		toast('Pasted file attached');
	});
	$('#sendBtn').addEventListener('click', () => generating ? stopGeneration() : sendMessage());
	$('#attachBtn').addEventListener('click', () => $('#fileInput').click());
	$('#fileInput').addEventListener('change', e => {
		[...e.target.files].forEach(ingestFile);
		e.target.value = '';
	});
	$('#toolsBtn').addEventListener('click', e => {
		e.stopPropagation();
		openToolsMenu(e.currentTarget);
	});
	$('#suggestions').innerHTML = SUGGESTIONS.map((s, idx) => `<button class="chip" data-i="${idx}"><span class="c-icon">${s.i}</span><span><span class="c-title">${s.t}</span><span class="c-sub">${s.s}</span></span></button>`).join('');
	$('#suggestions').addEventListener('click', e => {
		const chip = e.target.closest('.chip');
		if (!chip) return;
		input().value = SUGGESTIONS[+chip.dataset.i].p;
		resizeInput();
		updateTokCount();
		sendMessage();
	});
	$('#chatScroll').addEventListener('scroll', () => {
		const sc = $('#chatScroll');
		pinned = sc.scrollHeight - sc.scrollTop - sc.clientHeight < 90;
		$('#scrollPill').classList.toggle('show', !pinned && !$('#main').classList.contains('empty'));
	});
	$('#scrollPill').addEventListener('click', () => {
		$('#chatScroll').scrollTo({
			top: $('#chatScroll').scrollHeight,
			behavior: 'smooth'
		});
		hidePill();
	});
	const app = $('#app');
	$('#sideToggle').addEventListener('click', () => {
		if (matchMedia('(max-width:860px)').matches) app.classList.toggle('side-open');
		else app.classList.toggle('side-hidden');
	});
	$('#sideClose').addEventListener('click', () => {
		if (matchMedia('(max-width:860px)').matches) app.classList.remove('side-open');
		else app.classList.add('side-hidden');
	});
	$('#backdrop').addEventListener('click', () => app.classList.remove('side-open'));
	[
		['#settingsModal', '#settingsClose'],
		['#memoryModal', '#memoryClose'],
		['#statsModal', '#statsClose'],
		['#shortcutsModal', '#shortcutsClose']
	].forEach(([m, c]) => {
		$(m).addEventListener('click', e => {
			if (e.target === $(m)) $(m).classList.remove('open');
		});
		$(c).addEventListener('click', () => $(m).classList.remove('open'));
	});
	$('#settingsSave').addEventListener('click', () => {
		saveSettingsForm();
		$('#settingsModal').classList.remove('open');
	});
	$('#settingsReset').addEventListener('click', () => {
		DB.data.settings = {
			...DEFAULT_SETTINGS,
			theme: S().theme
		};
		refreshSettingsUI();
		toast('Defaults restored — press Save', 'warn');
	});
	$('#setTemp').addEventListener('input', e => $('#tempVal').textContent = (+e.target.value).toFixed(1));
	$('#setTopP').addEventListener('input', e => $('#topPVal').textContent = (+e.target.value).toFixed(2));
	$('#backupExportBtn').addEventListener('click', exportBackup);
	$('#backupImportBtn').addEventListener('click', () => $('#backupFile').click());
	$('#backupFile').addEventListener('change', async e => {
		const f = e.target.files[0];
		if (!f) return;
		const anchor = e.target;
		e.target.value = '';
		try {
			const incoming = JSON.parse(await f.text());
			if (!incoming?.chats) throw new Error('Not a Fanoos backup');
			importBackupViaPopover(incoming, anchor);
		} catch (err) {
			toast('Import failed: ' + err.message, 'error');
		}
	});
	document.addEventListener('keydown', e => {
		const mod = e.ctrlKey || e.metaKey;
		if (mod && e.shiftKey && e.key.toLowerCase() === 'o') {
			e.preventDefault();
			createChat(true);
			input().focus();
		} else if (mod && e.key.toLowerCase() === 'k') {
			e.preventDefault();
			$('#chatSearch').focus();
			$('#chatSearch').select();
		} else if (mod && e.key.toLowerCase() === 'b') {
			e.preventDefault();
			if (matchMedia('(max-width:860px)').matches) app.classList.toggle('side-open');
			else app.classList.toggle('side-hidden');
		} else if (mod && e.shiftKey && e.key.toLowerCase() === 'm') {
			e.preventDefault();
			openMemoryModal();
		} else if (mod && e.shiftKey && e.key.toLowerCase() === 'u') {
			e.preventDefault();
			openStats();
		} else if (mod && e.key === '/') {
			e.preventDefault();
			$('#shortcutsModal').classList.toggle('open');
		} else if (e.key === 'Escape') {
			closeSlash();
			closePopover();
			['#settingsModal', '#memoryModal', '#statsModal', '#shortcutsModal', '#voiceModal'].forEach(m => $(m).classList.remove('open'));
			$('#app').classList.remove('side-open');
		}
	});
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'hidden') DB.flushPHP();
	});
	addEventListener('beforeunload', () => DB.beacon());
}
async function init() {
	await DB.load();
	applyTheme(S().theme || 'dark');
	$('#greeting').textContent = greetingText();
	if (!Object.keys(DB.data.chats).length) createChat(false);
	if (!DB.data.activeId || !DB.data.chats[DB.data.activeId]) DB.data.activeId = sortedChats()[0]?.id || createChat(false);
	bind();
	updateModelBtn();
	paintToggles();
	renderSidebar();
	renderChat();
	setSendState();
	loadModels();
	checkConnection();
	setInterval(checkConnection, 30000);
	setInterval(() => DB.flushPHP(), 15000);
	input().focus();
}
init();