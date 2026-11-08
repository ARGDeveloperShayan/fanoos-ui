'use strict';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ic = n => `<svg class="ic"><use href="assets/sprites/sprites.svg#i-${n}"/></svg>`;
const LS_KEY = 'fanoos_db_v3';
const API = 'api.php';
const fmtNum = n => (n || 0).toLocaleString();
const fmtB = b => b >= 1e12 ? (b / 1e12).toFixed(2) + ' TB' : b >= 1e9 ? (b / 1e9).toFixed(1) + ' GB' : (b / 1e6).toFixed(0) + ' MB';
const estTok = s => Math.ceil(String(s || '').length / 4);
const nameHue = s => {
	let h = 0;
	for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360;
	return h;
};

function rel(ts) {
	const s = (Date.now() - new Date(ts).getTime()) / 1000;
	if (s < 60) return 'just now';
	if (s < 3600) return Math.max(1, Math.round(s / 60)) + ' min ago';
	if (s < 86400) return Math.round(s / 3600) + ' h ago';
	return Math.round(s / 86400) + ' days ago';
}

function toast(msg, type = 'ok') {
	const el = document.createElement('div');
	el.className = 'toast ' + type;
	el.textContent = msg;
	$('#toasts').appendChild(el);
	setTimeout(() => {
		el.classList.add('out');
		setTimeout(() => el.remove(), 260);
	}, 3000);
}

/* ---------- local db mirror ---------- */
function readDB() {
	try {
		return JSON.parse(localStorage.getItem(LS_KEY));
	} catch {
		return null;
	}
}
function writeDB(d) {
	try {
		localStorage.setItem(LS_KEY, JSON.stringify(d));
	} catch {}
}
function readHost() {
	return readDB()?.settings?.host || 'http://localhost:11434';
}
function writeHost(h) {
	const d = readDB() || {
		settings: {}
	};
	d.settings = {
		...(d.settings || {}),
		host: h
	};
	writeDB(d);
}
let HOST = readHost();
const base = () => HOST.replace(/\/+$/, '');

async function req(path, opts = {}) {
	const res = await fetch(base() + path, opts);
	if (!res.ok) {
		let d = '';
		try {
			d = (await res.text()).slice(0, 220);
		} catch {}
		throw new Error('Ollama ' + res.status + (d ? ' — ' + d : ''));
	}
	return res;
}
const post = (path, body, signal) => req(path, {
	method: 'POST',
	signal,
	headers: {
		'Content-Type': 'application/json'
	},
	body: JSON.stringify(body)
});
async function* ndjson(res) {
	const reader = res.body.getReader(),
		dec = new TextDecoder();
	let buf = '';
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
			if (line) {
				try {
					yield JSON.parse(line);
				} catch {}
			}
		}
	}
}

/* ---------- auth ---------- */
async function hashPw(s) {
	try {
		const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('fanoos::' + s));
		return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
	} catch {
		let h = 5381;
		for (const c of s) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0;
		return 'djb2_' + h.toString(16);
	}
}
const Auth = {
	php: null,
	ADMIN_PASS: null,
	async detect() {
		try {
			const r = await fetch(API + '?action=admin_check', {
				signal: AbortSignal.timeout(2000)
			});
			const j = await r.json();
			this.php = j?.ok === true;
		} catch {
			this.php = false;
		}
		return this.php;
	},
	async has() {
		if (this.php) {
			try {
				return (await (await fetch(API + '?action=admin_check')).json()).has_password;
			} catch {
				this.php = false;
			}
		}
		return !!localStorage.getItem('fanoos_admin_hash');
	},
	async verify(p) {
		if (this.php) {
			try {
				return (await (await fetch(API + '?action=admin_verify', {
					method: 'POST',
					body: JSON.stringify({
						password: p
					})
				})).json()).ok;
			} catch {
				this.php = false;
			}
		}
		return await hashPw(p) === localStorage.getItem('fanoos_admin_hash');
	},
	async set(p) {
		if (this.php) {
			await fetch(API + '?action=admin_set_pass', {
				method: 'POST',
				body: JSON.stringify({
					password: p
				})
			});
		} else localStorage.setItem('fanoos_admin_hash', await hashPw(p));
	},
	async getSystem() {
		if (this.php) {
			try {
				return (await (await fetch(API + '?action=admin_get_system')).json()).system_prompt || '';
			} catch {
				this.php = false;
			}
		}
		return readDB()?.settings?.systemPromptOverride || '';
	},
	async setSystem(txt) {
		if (this.php) {
			const r = await fetch(API + '?action=admin_set_system', {
				method: 'POST',
				body: JSON.stringify({
					password: this.ADMIN_PASS || '',
					system_prompt: txt
				})
			});
			const j = await r.json();
			if (!j.ok) throw new Error(j.error || 'failed');
			return true;
		}
		const d = readDB() || {
			settings: {}
		};
		d.settings.systemPromptOverride = txt;
		writeDB(d);
		return true;
	}
};

/* ---------- dialog ---------- */
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
      </div><div class="modal-foot"><button class="btn ghost dlg-cancel">${esc(cancelText)}</button>
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
	danger: o.danger !== false
});
const fancyPrompt = (t, ph = '', def = '', o = {}) => fancyDialog({
	title: t,
	inputValue: def,
	inputPlaceholder: ph,
	confirmText: o.confirmText || 'Save'
});

/* ---------- view router ---------- */
const VIEW_META = {
	overview: ['Overview', 'Server health, loaded models and quick actions'],
	pull: ['Pull & Create', 'Download catalog models or build custom variants'],
	prompt: ['System Prompt', 'The Fanoos AI identity applied to every chat'],
	models: ['Installed Models', 'Everything on this machine — inspect, rename, delete'],
	bench: ['Test Bench', 'Fire raw prompts at any model and watch tokens stream'],
	security: ['Security', 'Admin password & storage mode']
};

function switchView(v) {
	if (!VIEW_META[v]) v = 'overview';
	$$('.rail-nav button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
	$$('.adm-view').forEach(s => s.classList.toggle('on', s.dataset.v === v));
	$('#viewTitle').textContent = VIEW_META[v][0];
	$('#viewSub').textContent = VIEW_META[v][1];
	sessionStorage.setItem('fanoos_adm_view', v);
	closePopoverMenu();
}
$$('.rail-nav button').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));
document.addEventListener('click', e => {
	const g = e.target.closest('[data-goto]');
	if (g) switchView(g.dataset.goto);
});

let popMenuEl = null;

function closePopoverMenu() {
	popMenuEl?.remove();
	popMenuEl = null;
}
document.addEventListener('click', e => {
	if (popMenuEl && !popMenuEl.contains(e.target)) closePopoverMenu();
});

/* ---------- gate ---------- */
let GATE_MODE = 'unlock';
async function initGate() {
	if (sessionStorage.getItem('fanoos_admin') === '1') {
		enterAdmin(true);
		return;
	}
	await Auth.detect();
	const has = await Auth.has();
	GATE_MODE = has ? 'unlock' : 'set';
	$('#gateTitle').textContent = has ? 'Unlock Fanoos Admin' : 'Light the lantern';
	$('#gateSub').textContent = has ?
		'Enter your admin password to manage models and the Fanoos AI system prompt.' :
		'First run — choose a password to protect the admin panel. Stored ' + (Auth.php ? 'bcrypt-hashed on the server.' : 'hashed in this browser (PHP backend not detected).');
	$('#gatePass2').hidden = has;
	$('#gateBtn').textContent = has ? 'Unlock' : 'Create password & unlock';
	$('#gatePass').focus();
}
$('#gateForm').addEventListener('submit', async e => {
	e.preventDefault();
	const p = $('#gatePass').value,
		p2 = $('#gatePass2').value,
		err = $('#gateErr');
	err.textContent = '';
	if (GATE_MODE === 'set') {
		if (p.length < 4) {
			err.textContent = 'Password must be at least 4 characters.';
			shake();
			return;
		}
		if (p !== p2) {
			err.textContent = 'Passwords do not match.';
			shake();
			return;
		}
		await Auth.set(p);
		Auth.ADMIN_PASS = p;
		sessionStorage.setItem('fanoos_admin', '1');
		toast('Admin password created');
		enterAdmin();
	} else {
		const ok = await Auth.verify(p);
		if (ok) {
			Auth.ADMIN_PASS = p;
			sessionStorage.setItem('fanoos_admin', '1');
			enterAdmin();
		} else {
			err.textContent = 'Wrong password.';
			shake();
			$('#gatePass').value = '';
			$('#gatePass').focus();
		}
	}
});

function shake() {
	const f = $('#gateForm');
	f.classList.remove('shake');
	void f.offsetWidth;
	f.classList.add('shake');
}

function enterAdmin(instant = false) {
	switchView(sessionStorage.getItem('fanoos_adm_view') || 'overview');
	const gate = $('#gate');
	if (instant) {
		gate.style.display = 'none';
		$('#adminRoot').hidden = false;
		loadAll();
		return;
	}
	gate.classList.add('unlocked');
	setTimeout(() => {
		gate.classList.add('gone');
		$('#adminRoot').hidden = false;
		loadAll();
	}, 450);
}
$('#lockBtn').addEventListener('click', () => {
	sessionStorage.removeItem('fanoos_admin');
	Auth.ADMIN_PASS = null;
	location.reload();
});

/* ---------- version / connection ---------- */
async function loadVersion() {
	try {
		const t0 = performance.now();
		const j = await (await fetch(base() + '/api/version', {
			cache: 'no-store',
			signal: AbortSignal.timeout(5000)
		})).json();
		const ms = Math.round(performance.now() - t0);
		['#admConn', '#admConnDot'].forEach(id => $(id).className = 'conn-dot ok');
		$('#admConnText').textContent = 'ollama v' + j.version;
		$('#admVer').textContent = 'v' + j.version + ' · ' + ms + 'ms';
		$('#stVersion').textContent = 'v' + j.version;
		$('#stLatency').textContent = ms + 'ms';
	} catch {
		['#admConn', '#admConnDot'].forEach(id => $(id).className = 'conn-dot bad');
		$('#admConnText').textContent = 'unreachable';
		$('#admVer').textContent = 'unreachable';
		$('#stVersion').textContent = '—';
		$('#stLatency').textContent = 'offline';
	}
}
$('#admConnRow').addEventListener('click', loadVersion);

async function loadDevices() {
	try {
		const j = await (await fetch(API + '?action=ping', {
			cache: 'no-store',
			signal: AbortSignal.timeout(2500)
		})).json();
		$('#stDevices').textContent = j?.devices ? `· ${j.devices} synced device${j.devices !== 1 ? 's' : ''}` : '';
	} catch {}
}

/* ---------- installed models ---------- */
let LIB = [];
let SORT = sessionStorage.getItem('fanoos_adm_sort') || 'name';
const capBadge = c => `<span class="cap-badge cap-${c}">${c}</span>`;

async function loadTags() {
	try {
		LIB = (await (await req('/api/tags')).json()).models || [];
	} catch (e) {
		LIB = [];
		toast('Could not list models: ' + e.message, 'error');
	}
	LIB.sort((a, b) => a.name.localeCompare(b.name));
	paintLib($('#libFilter').value);
	$('#stModels').textContent = LIB.length;
	$('#stDisk').textContent = fmtB(LIB.reduce((a, m) => a + (m.size || 0), 0));
	$('#testModel').innerHTML = LIB.map(m => `<option value="${esc(m.name)}">${esc(m.name)}</option>`).join('') || '<option>—</option>';
}

function paintLib(filter = '') {
	const q = filter.toLowerCase();
	let shown = LIB.filter(m => m.name.toLowerCase().includes(q));
	if (SORT === 'size') shown = [...shown].sort((a, b) => (b.size || 0) - (a.size || 0));
	else if (SORT === 'date') shown = [...shown].sort((a, b) => new Date(b.modified_at || 0) - new Date(a.modified_at || 0));
	else shown = [...shown].sort((a, b) => a.name.localeCompare(b.name));
	$('#libList').innerHTML = shown.length ? shown.map(m => {
		const d = m.details || {},
			caps = (m.capabilities || []).filter(c => ['thinking', 'tools', 'vision'].includes(c)),
			hue = nameHue(m.name),
			letter = esc((m.name.replace(/^(.*?):/, '$1')[0] || '?').toUpperCase());
		return `<div class="lib-card" data-name="${esc(m.name)}">
      <div class="lib-head">
        <span class="lib-avatar" style="--hue:${hue}">${letter}</span>
        <div class="lib-main">
          <div class="lib-name">${esc(m.name)}</div>
          <div class="lib-meta">${fmtB(m.size)}${d.parameter_size?' · '+esc(d.parameter_size):''}${d.quantization_level?' · '+esc(d.quantization_level):''}</div>
        </div>
      </div>
      <div class="lib-meta">updated ${m.modified_at?rel(m.modified_at):'?'}${d.family?' · '+esc(d.family):''}</div>
      ${caps.length?`<div class="lib-caps">${caps.map(capBadge).join('')}</div>`:''}
      <div class="lib-acts">
        <button class="icon-btn sm" data-act="chat" title="Chat with it">${ic('send')}</button>
        <button class="icon-btn sm" data-act="inspect" title="Inspect">${ic('eye')}</button>
        <button class="icon-btn sm" data-act="dup" title="Duplicate">${ic('copy')}</button>
        <button class="icon-btn sm" data-act="rename" title="Rename">${ic('edit')}</button>
        <button class="icon-btn sm danger-hover" data-act="del" title="Delete">${ic('trash')}</button>
      </div></div>`;
	}).join('') : `<div class="lib-empty">No models ${q?'match your filter':'installed yet'}.<br>Pull one in the <b>Pull &amp; Create</b> tab, or run <code>ollama pull llama3.2</code></div>`;
}
$('#libSort').value = SORT;
$('#libSort').addEventListener('change', e => {
	SORT = e.target.value;
	sessionStorage.setItem('fanoos_adm_sort', SORT);
	paintLib($('#libFilter').value);
});
$('#libFilter').addEventListener('input', e => paintLib(e.target.value));
$('#libRefresh').addEventListener('click', loadTags);
$('#libList').addEventListener('click', async e => {
	const card = e.target.closest('.lib-card');
	if (!card) return;
	const name = card.dataset.name;
	if (!e.target.closest('[data-act]')) return inspect(name);
	const act = e.target.closest('[data-act]').dataset.act;
	if (act === 'chat') {
		const d = readDB() || {
			settings: {}
		};
		d.settings = {
			...(d.settings || {}),
			model: name
		};
		writeDB(d);
		location.href = 'index.html';
	} else if (act === 'inspect') inspect(name);
	else if (act === 'dup') {
		const t = await fancyPrompt('Duplicate model', 'New model name…', name + '-copy');
		if (!t?.trim()) return;
		try {
			await post('/api/copy', {
				source: name,
				target: t.trim(),
				model: name
			});
			toast('Duplicated → ' + t.trim());
			loadTags();
		} catch (err) {
			toast('Copy failed: ' + err.message, 'error');
		}
	} else if (act === 'rename') {
		const t = await fancyPrompt('Rename model', 'New name…', name + '-renamed');
		if (!t?.trim() || t.trim() === name) return;
		try {
			await post('/api/copy', {
				source: name,
				target: t.trim(),
				model: name
			});
			await post('/api/delete', {
				model: name,
				name
			});
			toast('Renamed → ' + t.trim());
			loadTags();
		} catch (err) {
			toast('Rename failed: ' + err.message, 'error');
		}
	} else if (act === 'del') {
		const size = fmtB(LIB.find(m => m.name === name)?.size || 0);
		if (!await fancyConfirm('Delete model', `Delete "${name}" permanently? This frees ${size}.`, {
				confirmText: 'Delete'
			})) return;
		try {
			await post('/api/delete', {
				model: name,
				name
			});
			toast('Model deleted');
			loadTags();
		} catch (err) {
			toast('Delete failed: ' + err.message, 'error');
		}
	}
});

async function inspect(name) {
	$('#inspTitle').textContent = name;
	$('#inspBody').innerHTML = '<div class="ps-empty">Loading…</div>';
	$('#inspModal').classList.add('open');
	try {
		const j = await (await post('/api/show', {
			model: name,
			name
		})).json();
		const d = j.details || {},
			caps = j.capabilities || LIB.find(m => m.name === name)?.capabilities || [];
		$('#inspBody').innerHTML = `
      ${caps.length?`<div class="insp-sec"><h3>Capabilities</h3><div class="insp-caps">${caps.map(capBadge).join('')}</div></div>`:''}
      <div class="insp-sec"><h3>Details</h3><dl class="insp-kv">
        <dt>Family</dt><dd>${esc(d.family||'?')}</dd>
        <dt>Parameters</dt><dd>${esc(d.parameter_size||'?')}</dd>
        <dt>Quantization</dt><dd>${esc(d.quantization_level||'?')}</dd>
        <dt>Format</dt><dd>${esc(d.format||'?')}</dd>
        <dt>Context length</dt><dd>${d.context_length?fmtNum(d.context_length):'?'}</dd>
        <dt>Modified</dt><dd>${j.modified_at?rel(j.modified_at):'?'}</dd>
      </dl></div>
      ${j.parameters?`<div class="insp-sec"><h3>Parameters</h3><pre class="insp-pre">${esc(j.parameters)}</pre></div>`:''}
      ${j.template?`<div class="insp-sec"><h3>Chat template</h3><pre class="insp-pre">${esc(j.template)}</pre></div>`:''}
      ${j.system?`<div class="insp-sec"><h3>System prompt</h3><pre class="insp-pre">${esc(j.system)}</pre></div>`:''}
      ${j.model_info?`<div class="insp-sec"><h3>Raw model info</h3><pre class="insp-pre">${esc(JSON.stringify(j.model_info,null,2).slice(0,2400))}</pre></div>`:''}`;
	} catch (err) {
		$('#inspBody').innerHTML = `<div class="ps-empty">${esc(err.message)}</div>`;
	}
}
$('#inspClose').addEventListener('click', () => $('#inspModal').classList.remove('open'));
$('#inspModal').addEventListener('click', e => {
	if (e.target === $('#inspModal')) $('#inspModal').classList.remove('open');
});
document.addEventListener('keydown', e => {
	if (e.key === 'Escape') $('#inspModal').classList.remove('open');
});

/* ---------- pull ---------- */
const PULLS = new Map();
const CATALOG = [{
	cat: 'General purpose',
	items: [{
		m: 'llama3.2',
		d: 'Meta · 3B · fast daily driver',
		s: '~2 GB'
	}, {
		m: 'llama3.1:8b',
		d: 'Meta · 8B · balanced',
		s: '~4.7 GB'
	}, {
		m: 'qwen2.5:7b',
		d: 'Alibaba · 7B · strong all-round',
		s: '~4.7 GB'
	}, {
		m: 'gemma3:4b',
		d: 'Google · 4B · efficient',
		s: '~3.3 GB'
	}, {
		m: 'mistral',
		d: 'Mistral · 7B · classic',
		s: '~4.1 GB'
	}]
}, {
	cat: 'Reasoning / DeepThink',
	items: [{
		m: 'deepseek-r1:7b',
		d: 'DeepSeek R1 · thinks step by step',
		s: '~4.7 GB'
	}, {
		m: 'deepseek-r1:14b',
		d: 'DeepSeek R1 · deeper reasoning',
		s: '~9 GB'
	}, {
		m: 'qwen3:8b',
		d: 'Qwen3 · hybrid thinking',
		s: '~5.2 GB'
	}]
}, {
	cat: 'Coding',
	items: [{
		m: 'qwen2.5-coder:7b',
		d: 'Qwen Coder · best local coder',
		s: '~4.7 GB'
	}, {
		m: 'codellama:7b',
		d: 'Code Llama · classic',
		s: '~3.8 GB'
	}]
}, {
	cat: 'Vision',
	items: [{
		m: 'llava',
		d: 'LLaVA · 7B · image understanding',
		s: '~4.7 GB'
	}, {
		m: 'llama3.2-vision',
		d: 'Meta Vision · 11B',
		s: '~7.9 GB'
	}, {
		m: 'moondream',
		d: 'Moondream · tiny vision',
		s: '~1.7 GB'
	}]
}, {
	cat: 'Tiny & fast',
	items: [{
		m: 'phi4-mini',
		d: 'Microsoft · 3.8B',
		s: '~2.5 GB'
	}, {
		m: 'smollm2:1.7b',
		d: 'SmolLM2 · pocket size',
		s: '~1.8 GB'
	}, {
		m: 'tinyllama',
		d: 'TinyLlama · 1.1B',
		s: '~0.6 GB'
	}]
}];
$('#catalogGroups').innerHTML = CATALOG.map(g =>
	`<div class="cat-group"><div class="cat-label">${g.cat}</div><div class="cat-grid">` +
	g.items.map(x => `<button type="button" class="cat-card" data-q="${x.m}"><b>${x.m}</b><span>${x.d}</span><i>${x.s}</i></button>`).join('') +
	'</div></div>').join('');
$('#catalogGroups').addEventListener('click', e => {
	const c = e.target.closest('[data-q]');
	if (!c) return;
	$('#pullName').value = c.dataset.q;
	startPull(c.dataset.q);
});
$('#pullBtn').addEventListener('click', () => {
	const n = $('#pullName').value.trim();
	if (n) startPull(n);
});
$('#pullName').addEventListener('keydown', e => {
	if (e.key === 'Enter') {
		const n = e.target.value.trim();
		if (n) startPull(n);
	}
});
async function startPull(name) {
	if (PULLS.has(name)) return toast('Already pulling ' + name, 'warn');
	const ctrl = new AbortController();
	const job = {
		ctrl,
		layers: new Map()
	};
	const el = document.createElement('div');
	el.className = 'pull-job';
	el.innerHTML = `<div class="pj-head"><span class="pj-name">⬇ ${esc(name)}</span><button class="pj-cancel" title="Cancel pull">${ic('x')}</button></div>
    <div class="pj-status">connecting…</div><div class="pj-overall"><i></i></div><div class="pj-layers"></div>`;
	$('#pullJobs').prepend(el);
	job.el = el;
	PULLS.set(name, job);
	el.querySelector('.pj-cancel').onclick = () => {
		ctrl.abort();
		el.classList.add('dead');
		el.querySelector('.pj-status').textContent = 'cancelled';
		PULLS.delete(name);
		setTimeout(() => el.remove(), 4000);
	};
	const paint = () => {
		let done = 0,
			total = 0,
			html = '';
		for (const [dig, l] of job.layers) {
			total += l.total || 0;
			done += Math.min(l.completed || 0, l.total || 0);
			const pct = l.total ? Math.min(100, l.completed / l.total * 100) : (l.finished ? 100 : 0);
			html += `<div class="layer"><span>${esc(dig.slice(0,19))}…</span><div class="layer-bar"><i class="${pct<100?'active':''}" style="width:${pct}%"></i></div><span class="layer-bytes">${l.total?fmtB(Math.min(l.completed||0,l.total))+' / '+fmtB(l.total):'…'}</span></div>`;
		}
		el.querySelector('.pj-layers').innerHTML = html;
		el.querySelector('.pj-overall i').style.width = (total ? Math.min(100, done / total * 100) : 0) + '%';
	};
	try {
		const res = await fetch(base() + '/api/pull', {
			method: 'POST',
			signal: ctrl.signal,
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				model: name,
				name,
				stream: true
			})
		});
		if (!res.ok) {
			let d = '';
			try {
				d = (await res.text()).slice(0, 200);
			} catch {}
			throw new Error('Ollama ' + res.status + (d ? ' — ' + d : ''));
		}
		for await (const j of ndjson(res)) {
			if (j.error) throw new Error(j.error);
			if (j.digest) {
				const l = job.layers.get(j.digest) || {
					completed: 0,
					total: j.total || 0,
					finished: false
				};
				l.completed = j.completed || 0;
				if (j.total) l.total = j.total;
				if (j.completed >= j.total && j.total) l.finished = true;
				job.layers.set(j.digest, l);
				paint();
			}
			if (j.status) el.querySelector('.pj-status').textContent = j.status + (j.digest ? '  ·  ' + j.digest.slice(0, 19) + '…' : '');
			if (j.status === 'success') {
				el.classList.add('done');
				el.querySelector('.pj-status').textContent = '✓ pulled successfully — ready to chat';
				el.querySelector('.pj-overall i').style.width = '100%';
				PULLS.delete(name);
				toast('Pulled ' + name + ' ✓');
				$('#pullName').value = '';
				loadTags();
				setTimeout(() => el.remove(), 8000);
				return;
			}
		}
	} catch (err) {
		if (err.name === 'AbortError') return;
		el.querySelector('.pj-status').textContent = '✗ ' + err.message;
		el.querySelector('.pj-status').style.color = 'var(--danger)';
		PULLS.delete(name);
		toast('Pull failed: ' + err.message, 'error');
	}
}

/* ---------- modelfile creator ---------- */
const MF_TEMPLATES = {
	assistant: `FROM llama3.2
SYSTEM """You are Fanoos AI — warm, precise, and local-first.
Use Markdown. Be direct, never sycophantic."""
PARAMETER temperature 0.7
PARAMETER num_ctx 8192`,
	coder: `FROM qwen2.5-coder:7b
SYSTEM """You are a senior software engineer inside Fanoos UI.
Give complete, runnable code. Prefer clarity over cleverness."""
PARAMETER temperature 0.2
PARAMETER num_ctx 16384`,
	blank: `FROM llama3.2
SYSTEM "Your custom personality here."
PARAMETER temperature 0.7
PARAMETER num_ctx 4096`
};
$('#createTpl').addEventListener('change', e => {
	$('#createFile').value = MF_TEMPLATES[e.target.value] || MF_TEMPLATES.assistant;
});
$('#createBtn').addEventListener('click', async () => {
	const name = $('#createName').value.trim(),
		mf = $('#createFile').value.trim(),
		log = $('#createLog');
	if (!name) return toast('Give the new model a name', 'warn');
	if (!/^FROM\s/im.test(mf)) return toast('Modelfile must start with a FROM line', 'warn');
	const btn = $('#createBtn');
	btn.disabled = true;
	btn.textContent = 'Creating…';
	log.textContent = '→ creating ' + name + ' …\n';
	try {
		const res = await post('/api/create', {
			model: name,
			name,
			modelfile: mf,
			stream: true
		});
		for await (const j of ndjson(res)) {
			if (j.error) throw new Error(j.error);
			if (j.status) {
				log.innerHTML = log.innerHTML.replace(/— waiting —\n?/, '') + `<span class="${j.status==='success'?'ok':'dim'}">${esc(j.status)}</span>\n`;
				log.scrollTop = log.scrollHeight;
			}
			if (j.status === 'success') {
				toast('Model "' + name + '" created ✓');
				$('#createName').value = '';
				loadTags();
			}
		}
	} catch (err) {
		log.innerHTML += `<span style="color:var(--danger)">${esc(err.message)}</span>\n`;
		toast('Create failed: ' + err.message, 'error');
	} finally {
		btn.disabled = false;
		btn.textContent = 'Create';
	}
});

/* ---------- running models ---------- */
let PS = [];
async function loadPS() {
	try {
		PS = (await (await req('/api/ps')).json()).models || [];
	} catch {
		PS = [];
	}
	paintPS();
	$('#stRunning').textContent = PS.length;
}

function paintPS() {
	const now = Date.now();
	$('#psList').innerHTML = PS.length ? PS.map(m => {
		const mins = m.expires_at ? Math.max(0, Math.round((new Date(m.expires_at) - now) / 60000)) : null;
		return `<div class="ps-card"><span class="ps-dot"></span>
      <div><div class="ps-name">${esc(m.name)}</div>
      <div class="ps-meta">${fmtB(m.size||0)}${m.size_vram?' · '+fmtB(m.size_vram)+' VRAM':''}${m.details?.parameter_size?' · '+esc(m.details.parameter_size):''}</div></div>
      <span class="ps-exp">${mins!=null?'~'+mins+' min left':''}</span>
      <button class="ps-unload" data-unload="${esc(m.name)}" title="Free memory now">${ic('power')}Unload</button></div>`;
	}).join('') : '<div class="ps-empty">Nothing loaded right now — models load into memory on the first message and unload after the keep-alive window.</div>';
}
$('#psList').addEventListener('click', async e => {
	const b = e.target.closest('[data-unload]');
	if (!b) return;
	const name = b.dataset.unload;
	b.disabled = true;
	b.textContent = 'unloading…';
	try {
		await post('/api/generate', {
			model: name,
			keep_alive: 0
		});
		toast('Unloaded ' + name);
		loadPS();
	} catch (err) {
		toast('Unload failed: ' + err.message, 'error');
		loadPS();
	}
});
$('#psRefresh').addEventListener('click', loadPS);
setInterval(loadPS, 15000);

/* ---------- system prompt ---------- */
const SYS_PRESETS = [
	['Default', ''],
	['Coder', 'You are Fanoos AI in coding mode — a senior software engineer. Give complete, runnable code with language-tagged fenced blocks. Prefer clarity over cleverness, point out edge cases, and never invent APIs.'],
	['Tutor', 'You are Fanoos AI in tutor mode. Explain step by step from first principles, use simple analogies, then check understanding with one short question at the end. Keep a patient, encouraging tone.'],
	['Concise', 'Answer in as few words as possible while staying complete and correct. No filler, no restating the question. Use bullet points over prose.'],
	['Brainstormer', 'You are Fanoos AI in brainstorm mode. Always offer at least 5 distinct ideas across different angles, ranked by originality. Wild ideas welcome — label them.']
];
$('#sysPresets').innerHTML = SYS_PRESETS.map(([n], i) => `<button type="button" class="qchip" data-sp="${i}">${n}</button>`).join('');
$('#sysPresets').addEventListener('click', e => {
	const c = e.target.closest('[data-sp]');
	if (!c) return;
	$('#sysPrompt').value = SYS_PRESETS[+c.dataset.sp][1];
	updateSysCount();
	toast('Preset loaded — press Save to apply');
});
async function loadSystemPrompt() {
	$('#sysPrompt').value = await Auth.getSystem();
	updateSysCount();
}

function updateSysCount() {
	$('#sysCount').textContent = '~' + estTok($('#sysPrompt').value) + ' tokens';
}
$('#sysPrompt').addEventListener('input', updateSysCount);
$('#sysSave').addEventListener('click', async () => {
	try {
		await Auth.setSystem($('#sysPrompt').value);
		toast('System prompt saved — applies to every new request');
	} catch (err) {
		toast('Save failed: ' + err.message, 'error');
	}
});
$('#sysReset').addEventListener('click', async () => {
	if (!await fancyConfirm('Reset system prompt', 'Clear the override and restore the built-in Fanoos AI personality?', {
			confirmText: 'Reset',
			danger: false
		})) return;
	$('#sysPrompt').value = '';
	updateSysCount();
	try {
		await Auth.setSystem('');
		toast('Reset to default Fanoos AI prompt');
	} catch (err) {
		toast('Reset failed: ' + err.message, 'error');
	}
});

/* ---------- security ---------- */
function paintSecMode() {
	$('#secMode').textContent = Auth.php ?
		'server-side (bcrypt via api.php)' :
		'browser-only (PHP backend not detected)';
}
$('#changePassBtn').addEventListener('click', async () => {
	const np = $('#newPass').value,
		np2 = $('#newPass2').value;
	if (np.length < 4) return toast('New password must be at least 4 characters', 'warn');
	if (np !== np2) return toast('Passwords do not match', 'warn');
	if (await Auth.has()) {
		const cur = await fancyDialog({
			title: 'Confirm identity',
			message: 'Enter your current password first.',
			inputValue: '',
			inputType: 'password',
			confirmText: 'Continue'
		});
		if (cur === null) return;
		if (!await Auth.verify(cur)) return toast('Current password is wrong', 'error');
	}
	await Auth.set(np);
	Auth.ADMIN_PASS = np;
	$('#newPass').value = '';
	$('#newPass2').value = '';
	toast('Admin password changed');
});

/* ---------- test bench ---------- */
let benchCtrl = null;
$('#testTemp').addEventListener('input', e => $('#testTempVal').textContent = (+e.target.value).toFixed(1));
$('#testBtn').addEventListener('click', runBench);
$('#benchStop').addEventListener('click', () => benchCtrl?.abort());

async function runBench() {
	const model = $('#testModel').value,
		prompt = $('#testPrompt').value.trim() || 'Say hello in one sentence.';
	const out = $('#testOut'),
		statsEl = $('#benchStats');
	if (model === '—') return toast('No models installed', 'warn');
	out.textContent = '';
	statsEl.textContent = 'running…';
	$('#testBtn').disabled = true;
	$('#benchStop').hidden = false;
	benchCtrl = new AbortController();
	const stream = $('#testStream').checked;
	const t0 = performance.now();
	let txt = '',
		final = null;
	try {
		const res = await post('/api/chat', {
			model,
			stream,
			messages: [{
				role: 'user',
				content: prompt
			}],
			options: {
				temperature: +$('#testTemp').value,
				num_ctx: 2048
			}
		}, benchCtrl.signal);
		if (!stream) {
			const j = await res.json();
			txt = j.message?.content || '(no output)';
			final = j;
			out.textContent = txt;
		} else {
			for await (const j of ndjson(res)) {
				if (j.error) throw new Error(j.error);
				if (j.message?.content) {
					txt += j.message.content;
					out.textContent = txt;
					out.scrollTop = out.scrollHeight;
				}
				if (j.done) final = j;
			}
		}
		const ms = Math.round(performance.now() - t0);
		let stats = `${ms}ms · ${final?.eval_count ?? '?'} tokens`;
		if (final?.eval_count && final?.eval_duration) stats += ` · ${(final.eval_count / (final.eval_duration / 1e9)).toFixed(1)} tok/s`;
		statsEl.textContent = stats;
		if (!txt) out.textContent = '(no output)';
	} catch (e) {
		if (e.name === 'AbortError') statsEl.textContent = 'stopped';
		else {
			out.textContent = '✗ ' + e.message;
			statsEl.textContent = 'failed';
		}
	} finally {
		$('#testBtn').disabled = false;
		$('#benchStop').hidden = true;
		benchCtrl = null;
	}
}

/* ---------- host ---------- */
$('#admHost').value = HOST;
$('#admHostSave').addEventListener('click', () => {
	HOST = $('#admHost').value.trim() || 'http://localhost:11434';
	$('#admHost').value = HOST;
	writeHost(HOST);
	toast('Host saved — Fanoos UI uses it too');
	loadAll();
});

async function loadAll() {
	await loadVersion();
	loadDevices();
	paintSecMode();
	await Promise.all([loadTags(), loadPS(), loadSystemPrompt()]);
}
initGate();
