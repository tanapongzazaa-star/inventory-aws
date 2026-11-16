'use strict';

const state = {
  token: localStorage.getItem('token'),
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  categories: [],
  page: 'dashboard',
  productsPage: 1,
  historyPage: 1,
};

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n || 0).toLocaleString('th-TH');
const money = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dt = (s) => new Date(s).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Bangkok' });

function toast(msg, isErr = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show' + (isErr ? ' err' : '');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.className = 'toast'), 3500);
}

async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (state.token) headers.Authorization = 'Bearer ' + state.token;
  let body = opts.body;
  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }
  const res = await fetch('/api' + path, { ...opts, headers, body });
  let data = null;
  try { data = await res.json(); } catch { /* ไม่มี body */ }
  if (res.status === 401 && !path.startsWith('/auth/')) {
    logout();
    throw new Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
  }
  if (!res.ok) throw new Error((data && data.error) || 'เกิดข้อผิดพลาด (' + res.status + ')');
  return data;
}

function table(headers, rows, emptyText = 'ไม่มีข้อมูล') {
  if (!rows.length) return `<p class="empty">${emptyText}</p>`;
  const th = headers.map((h) => `<th class="${h.num ? 'num' : ''}">${h.label}</th>`).join('');
  return `<table><thead><tr>${th}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
}

function pager(total, page, limit) {
  const pages = Math.max(1, Math.ceil(total / limit));
  return `<div class="pager"><span>ทั้งหมด ${fmt(total)} รายการ</span>
    <button class="small" data-p="${page - 1}" ${page <= 1 ? 'disabled' : ''}>ก่อนหน้า</button>
    <span>หน้า ${page}/${pages}</span>
    <button class="small" data-p="${page + 1}" ${page >= pages ? 'disabled' : ''}>ถัดไป</button></div>`;
}

/* ---------- Auth / Navigation ---------- */
function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  state.token = null;
  state.user = null;
  $('#app-view').hidden = true;
  $('#login-view').hidden = false;
}

async function showApp() {
  $('#login-view').hidden = true;
  $('#app-view').hidden = false;
  $('#who').textContent = `${state.user.full_name} (${state.user.role})`;
  try {
    state.categories = await api('/categories');
    go(state.page);
  } catch (e) {
    toast(e.message, true);
  }
}

function go(page) {
  state.page = page;
  document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('active', b.dataset.page === page));
  const render = { dashboard: renderDashboard, products: renderProducts, stock: renderStock, history: renderHistory }[page];
  render().catch((e) => toast(e.message, true));
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#login-error').textContent = '';
  const f = new FormData(e.target);
  try {
    const d = await api('/auth/login', { method: 'POST', body: { username: f.get('username'), password: f.get('password') } });
    state.token = d.token;
    state.user = d.user;
    localStorage.setItem('token', d.token);
    localStorage.setItem('user', JSON.stringify(d.user));
    e.target.reset();
    showApp();
  } catch (err) {
    $('#login-error').textContent = err.message;
  }
});
$('#logout').addEventListener('click', logout);
$('nav').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-page]');
  if (b) go(b.dataset.page);
});

/* ---------- Dashboard ---------- */
async function renderDashboard() {
  const d = await api('/dashboard');
  const t = d.totals;
  const low = table(
    [{ label: 'SKU' }, { label: 'สินค้า' }, { label: 'คงเหลือ', num: true }, { label: 'Min', num: true }],
    d.low_stock.map(
      (p) => `<tr><td>${esc(p.sku)}</td><td>${esc(p.name)}</td>
        <td class="num"><span class="badge low">${fmt(p.quantity)} ${esc(p.unit)}</span></td><td class="num">${fmt(p.min_stock)}</td></tr>`
    ),
    'ไม่มีสินค้าใกล้หมด'
  );
  const recent = table(
    [{ label: 'เวลา' }, { label: 'สินค้า' }, { label: 'ประเภท' }, { label: 'จำนวน', num: true }],
    d.recent.map(
      (r) => `<tr><td>${dt(r.created_at)}</td><td>${esc(r.product_name)}</td>
        <td><span class="badge ${r.type === 'IN' ? 'in' : 'out'}">${r.type === 'IN' ? 'รับเข้า' : 'ตัดจ่าย'}</span></td>
        <td class="num">${fmt(r.quantity)}</td></tr>`
    ),
    'ยังไม่มีรายการ'
  );
  $('#main').innerHTML = `
    <div class="cards">
      <div class="card"><span>จำนวนสินค้า (SKU)</span><b>${fmt(t.total_products)}</b></div>
      <div class="card"><span>จำนวนชิ้นรวม</span><b>${fmt(t.total_units)}</b></div>
      <div class="card"><span>มูลค่าสต็อกรวม (บาท)</span><b>${money(t.stock_value)}</b></div>
      <div class="card ${t.low_stock_count ? 'warn' : ''}"><span>สินค้าใกล้หมด</span><b>${fmt(t.low_stock_count)}</b></div>
    </div>
    <div class="grid2">
      <section><h2>สินค้าใกล้หมด</h2>${low}</section>
      <section><h2>รายการล่าสุด</h2>${recent}</section>
    </div>
    <p><button id="export">ส่งออกรายงานสต็อก (CSV เก็บใน S3)</button></p>`;

  $('#export').addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      const r = await api('/reports/export');
      const a = document.createElement('a');
      a.href = r.url;
      a.click();
      toast(`สร้างรายงาน ${fmt(r.rows)} รายการแล้ว`);
    } catch (err) {
      toast(err.message, true);
    } finally {
      e.target.disabled = false;
    }
  });
}

/* ---------- Products ---------- */
async function renderProducts() {
  const catOpts = state.categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  $('#main').innerHTML = `
    <div class="toolbar">
      <input id="q" type="search" placeholder="ค้นหาชื่อ / SKU">
      <select id="cat"><option value="">ทุกหมวดหมู่</option>${catOpts}</select>
      <label class="chk"><input type="checkbox" id="low"> เฉพาะใกล้หมด</label>
      <span class="spacer"></span>
      <button id="add" class="primary">+ เพิ่มสินค้า</button>
    </div>
    <section id="plist">กำลังโหลด...</section>`;

  const load = async () => {
    const params = new URLSearchParams({ page: state.productsPage, limit: 10 });
    if ($('#q').value.trim()) params.set('q', $('#q').value.trim());
    if ($('#cat').value) params.set('category_id', $('#cat').value);
    if ($('#low').checked) params.set('low_stock', '1');
    const d = await api('/products?' + params);
    const rows = d.items.map(
      (p) => `<tr>
        <td>${p.image_url ? `<img class="thumb" src="${esc(p.image_url)}" alt="${esc(p.name)}">` : '<div class="thumb"></div>'}</td>
        <td>${esc(p.sku)}</td>
        <td>${esc(p.name)}<br><small>${esc(p.category_name || '')}${p.location ? ' · ' + esc(p.location) : ''}</small></td>
        <td class="num">${p.quantity <= p.min_stock ? `<span class="badge low">${fmt(p.quantity)}</span>` : fmt(p.quantity)} ${esc(p.unit)}</td>
        <td class="num">${money(p.unit_price)}</td>
        <td><button class="small" data-edit="${p.id}">แก้ไข</button>
            ${state.user.role === 'admin' ? `<button class="small danger" data-del="${p.id}">ลบ</button>` : ''}</td></tr>`
    );
    $('#plist').innerHTML =
      table(
        [{ label: 'รูป' }, { label: 'SKU' }, { label: 'สินค้า' }, { label: 'คงเหลือ', num: true }, { label: 'ราคาขาย', num: true }, { label: '' }],
        rows,
        'ไม่พบสินค้า'
      ) + pager(d.total, d.page, d.limit);

    $('#plist').querySelectorAll('[data-p]').forEach((b) =>
      b.addEventListener('click', () => { state.productsPage = Number(b.dataset.p); load().catch((e) => toast(e.message, true)); })
    );
    $('#plist').querySelectorAll('[data-edit]').forEach((b) =>
      b.addEventListener('click', () => openProductDialog(d.items.find((p) => p.id === Number(b.dataset.edit)), load))
    );
    $('#plist').querySelectorAll('[data-del]').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!confirm('ลบสินค้านี้? (ประวัติรายการเดิมยังคงอยู่)')) return;
        try { await api('/products/' + b.dataset.del, { method: 'DELETE' }); toast('ลบสินค้าแล้ว'); await load(); }
        catch (e) { toast(e.message, true); }
      })
    );
  };

  let timer;
  $('#q').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { state.productsPage = 1; load().catch((e) => toast(e.message, true)); }, 300); });
  $('#cat').addEventListener('change', () => { state.productsPage = 1; load().catch((e) => toast(e.message, true)); });
  $('#low').addEventListener('change', () => { state.productsPage = 1; load().catch((e) => toast(e.message, true)); });
  $('#add').addEventListener('click', () => openProductDialog(null, load));
  await load();
}

function openProductDialog(product, onSaved) {
  const form = $('#pform');
  form.reset();
  $('#pform-error').textContent = '';
  $('#pdlg-title').textContent = product ? 'แก้ไขสินค้า' : 'เพิ่มสินค้า';
  $('#initial-wrap').hidden = !!product; // ยอดคงเหลือแก้ผ่านหน้ารับเข้า/ตัดจ่ายเท่านั้น
  form.category_id.innerHTML =
    '<option value="">— ไม่ระบุ —</option>' + state.categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');

  if (product) {
    for (const k of ['sku', 'name', 'unit', 'unit_cost', 'unit_price', 'min_stock', 'location', 'description']) form[k].value = product[k] ?? '';
    form.category_id.value = product.category_id ?? '';
  }

  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    if (!fd.get('image') || !fd.get('image').size) fd.delete('image');
    if (product) fd.delete('initial_quantity');
    try {
      await api(product ? '/products/' + product.id : '/products', { method: product ? 'PUT' : 'POST', body: fd });
      $('#pdlg').close();
      toast(product ? 'บันทึกการแก้ไขแล้ว' : 'เพิ่มสินค้าแล้ว');
      await onSaved();
    } catch (err) {
      $('#pform-error').textContent = err.message;
    }
  };
  $('#pdlg').showModal();
}
$('#pcancel').addEventListener('click', () => $('#pdlg').close());

/* ---------- Stock In / Out ---------- */
async function renderStock() {
  const d = await api('/products?limit=100');
  const opts = d.items
    .map((p) => `<option value="${p.id}">${esc(p.sku)} — ${esc(p.name)} (คงเหลือ ${fmt(p.quantity)} ${esc(p.unit)})</option>`)
    .join('');
  $('#main').innerHTML = `
    <form id="sform" class="panel stock-form">
      <h2>บันทึกรับเข้า / ตัดจ่าย</h2>
      <label>สินค้า<select name="product_id" required>${opts}</select></label>
      <label>ประเภท<select name="type">
        <option value="in">รับเข้า (Stock In)</option><option value="out">ตัดจ่าย (Stock Out)</option></select></label>
      <label>จำนวน<input name="quantity" type="number" min="1" step="1" required></label>
      <label>เหตุผล<input name="reason" required maxlength="255" placeholder="เช่น รับสินค้าจากซัพพลายเออร์ / ขายหน้าร้าน"></label>
      <p class="error" id="sform-error" role="alert"></p>
      <button class="primary">บันทึกรายการ</button>
    </form>`;
  if (!d.items.length) $('#sform-error').textContent = 'ยังไม่มีสินค้า กรุณาเพิ่มสินค้าก่อน';

  $('#sform').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      const r = await api('/stock/' + f.get('type'), {
        method: 'POST',
        body: { product_id: f.get('product_id'), quantity: f.get('quantity'), reason: f.get('reason') },
      });
      toast(`บันทึกแล้ว ยอดคงเหลือ ${fmt(r.balance_after)}`);
      await renderStock();
    } catch (err) {
      $('#sform-error').textContent = err.message;
    }
  });
}

/* ---------- History ---------- */
async function renderHistory() {
  $('#main').innerHTML = `
    <div class="toolbar">
      <select id="htype"><option value="">ทุกประเภท</option><option value="IN">รับเข้า</option><option value="OUT">ตัดจ่าย</option></select>
      <label class="chk">จาก&nbsp;<input type="date" id="hfrom"></label>
      <label class="chk">ถึง&nbsp;<input type="date" id="hto"></label>
    </div>
    <section id="hlist">กำลังโหลด...</section>`;

  const load = async () => {
    const params = new URLSearchParams({ page: state.historyPage, limit: 15 });
    if ($('#htype').value) params.set('type', $('#htype').value);
    if ($('#hfrom').value) params.set('from', $('#hfrom').value);
    if ($('#hto').value) params.set('to', $('#hto').value);
    const d = await api('/history?' + params);
    const rows = d.items.map(
      (r) => `<tr><td>${dt(r.created_at)}</td><td>${esc(r.sku)}<br><small>${esc(r.product_name)}</small></td>
        <td><span class="badge ${r.type === 'IN' ? 'in' : 'out'}">${r.type === 'IN' ? 'รับเข้า' : 'ตัดจ่าย'}</span></td>
        <td class="num">${fmt(r.quantity)}</td><td class="num">${fmt(r.balance_after)}</td>
        <td>${esc(r.reason)}</td><td>${esc(r.performed_by)}</td></tr>`
    );
    $('#hlist').innerHTML =
      table(
        [{ label: 'เวลา' }, { label: 'สินค้า' }, { label: 'ประเภท' }, { label: 'จำนวน', num: true }, { label: 'คงเหลือ', num: true }, { label: 'เหตุผล' }, { label: 'ผู้ทำรายการ' }],
        rows,
        'ไม่พบรายการ'
      ) + pager(d.total, d.page, d.limit);
    $('#hlist').querySelectorAll('[data-p]').forEach((b) =>
      b.addEventListener('click', () => { state.historyPage = Number(b.dataset.p); load().catch((e) => toast(e.message, true)); })
    );
  };
  ['#htype', '#hfrom', '#hto'].forEach((s) =>
    $(s).addEventListener('change', () => { state.historyPage = 1; load().catch((e) => toast(e.message, true)); })
  );
  await load();
}

/* ---------- Boot ---------- */
if (state.token && state.user) showApp();
