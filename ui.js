/* 公共层：数据访问、图注现拼、路线配色、导览图查看器。
   站点里不允许出现第二套事实——所有文本都来自 site-data.js（索引）＋ data/js/*.js（切片）。 */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.prototype.slice.call((r || document).querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const param = k => new URLSearchParams(location.search).get(k);
const DAY_LABEL = id => id ? parseInt(id.slice(0, 2), 10) + '/' + parseInt(id.slice(2), 10) : '';

const Trip = {
  place(id) { return TRIP.places.filter(x => x.id === id)[0]; },
  day(id) { return TRIP.days.filter(x => x.id === id)[0]; },
  topic(id) { return TRIP.topics.filter(x => x.id === id)[0]; },
  route(id) { return TRIP.routes.filter(x => x.id === id)[0]; },
  note(i) { return TRIP.notes[String(i)] || null; },
  /* 切片里的照片记录只有 file 与 note_idx：地点名由文件名反解，图注仍然现拼 */
  pidOf(ph) {
    const m = /\/([a-z_]+)_\d+\./.exec(ph && ph.file || '');
    return m ? m[1] : null;
  },
  photosOf(pid) {
    const p = Trip.place(pid);
    return p && p.photos ? p.photos : [];
  },
  /* 图注由「地点短名 ＋ 原帖标题 ＋ 编号」现拼：同一条带 token 的长链接只在 _notes 里存一份 */
  caption(ph, name) {
    if (ph.kind === 'evidence') return ph.caption || '';
    const pid = Trip.pidOf(ph);
    const label = name || (pid && Trip.place(pid) ? Trip.place(pid).name : '');
    const n = Trip.note(ph.note_idx);
    return label || (n && n.title ? n.title.slice(0, 18) : '');
  },
  noteLink(i) {
    const n = Trip.note(i);
    if (!n || !n.url) return '<span class="note-chip">原帖 ' + esc(i) + '（链接待补）</span>';
    return '<a class="note-chip" href="' + esc(n.url) + '" target="_blank" rel="noopener">'
      + esc(n.title || ('原帖 ' + i)) + ' ↗</a>';
  },
  quote(q, name) {
    return '<figure class="quote"><blockquote>' + esc(q.text) + '</blockquote><figcaption>'
      + '<span class="qtag">' + esc(q.label || '临行确认') + '</span>'
      + (name ? '<span class="qplace">' + esc(name) + '</span>' : '')
      + (q.note ? Trip.noteLink(q.note) : '') + '</figcaption></figure>';
  },
  /* 切片按需加载：file:// 下不能 fetch，只能注入 <script> */
  slice(kind, id, done) {
    const s = document.createElement('script');
    s.src = 'data/js/' + kind + '_' + id + '.js';
    s.onload = () => {
      const d = window.SLICE;
      window.SLICE = null;
      done(d);
    };
    s.onerror = () => done(null);
    document.head.appendChild(s);
  },
  tracks(dayId) {
    if (!window.TRACKS) return [];
    return TRACKS.tracks.filter(t => !dayId || t.day === dayId);
  },
};

/* §8 四色固定：包车/拼车、区间车、村公交、徒步；另加火车与走向示意 */
function legClass(leg) {
  const m = ((leg && (leg.mode + leg.pricing_unit + leg.status)) || '');
  if (/徒步|步行|栈道/.test(m)) return 'hike';
  if (/村公交|摆渡|免费/.test(m)) return 'bus';
  if (/区间车|景交|大巴/.test(m)) return 'shuttle';
  if (/火车|K97|卧铺/.test(m)) return 'train';
  return 'drive';
}
const LEGEND = { drive: '包车／拼车', shuttle: '景区区间车', bus: '村公交／摆渡', hike: '徒步',
                 train: '火车', intent: '转场走向（示意）', stay: '当晚落脚' };

/* §7 官方导览图查看器：全屏、缩放、拖动、关闭，且支持浏览器后退 */
const Guide = {
  node: null, scale: 1, tx: 0, ty: 0, drag: null,
  open(file, name, facts) {
    Guide.close();
    const n = document.createElement('div');
    n.className = 'viewer';
    n.innerHTML = '<div class="viewer-bar"><b>' + esc(name) + '｜官方区域导览图</b>'
      + '<div class="viewer-tools"><button data-z="in" aria-label="放大">＋</button>'
      + '<button data-z="out" aria-label="缩小">－</button>'
      + '<button data-z="reset">实际大小</button>'
      + '<button data-z="close" aria-label="关闭">×</button></div></div>'
      + '<div class="viewer-stage"><img src="' + esc(file) + '" alt="' + esc(name) + '官方导览图" draggable="false"></div>'
      + '<p class="viewer-note">图上是官方完整路网与全部设施；<b>本次采用路线</b>见下方与对应日期卡。'
      + (facts ? '<span class="viewer-facts">' + facts.map(f => '<span>' + esc(f) + '</span>').join('') + '</span>' : '')
      + '</p>';
    document.body.appendChild(n);
    Guide.node = n; Guide.scale = 1; Guide.tx = 0; Guide.ty = 0; Guide.apply();
    history.pushState({ viewer: file }, '');
    n.addEventListener('click', e => {
      const z = e.target.getAttribute && e.target.getAttribute('data-z');
      if (z === 'in') Guide.zoom(1.3); else if (z === 'out') Guide.zoom(1 / 1.3);
      else if (z === 'reset') { Guide.scale = 1; Guide.tx = 0; Guide.ty = 0; Guide.apply(); }
      else if (z === 'close' || e.target === n) Guide.back();
    });
    n.addEventListener('wheel', e => { e.preventDefault(); Guide.zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12); }, { passive: false });
    const img = $('img', n);
    img.addEventListener('pointerdown', e => {
      Guide.drag = { x: e.clientX - Guide.tx, y: e.clientY - Guide.ty };
      img.setPointerCapture(e.pointerId);
    });
    img.addEventListener('pointermove', e => {
      if (!Guide.drag) return;
      Guide.tx = e.clientX - Guide.drag.x; Guide.ty = e.clientY - Guide.drag.y; Guide.apply();
    });
    img.addEventListener('pointerup', () => { Guide.drag = null; });
    document.addEventListener('keydown', Guide.esc);
  },
  esc(e) { if (e.key === 'Escape') Guide.back(); },
  zoom(k) { Guide.scale = Math.min(6, Math.max(1, Guide.scale * k)); if (Guide.scale === 1) { Guide.tx = 0; Guide.ty = 0; } Guide.apply(); },
  apply() {
    if (!Guide.node) return;
    $('img', Guide.node).style.transform = 'translate(' + Guide.tx + 'px,' + Guide.ty + 'px) scale(' + Guide.scale + ')';
    Guide.node.classList.toggle('zoomed', Guide.scale > 1);
  },
  close() { if (Guide.node) { Guide.node.remove(); Guide.node = null; document.removeEventListener('keydown', Guide.esc); } },
  back() { if (history.state && history.state.viewer) history.back(); else Guide.close(); },
};
addEventListener('popstate', () => { if (Guide.node) Guide.close(); });

/* 方案示意图：同一套投影与四色，给 plans.html 用；首页的交互地图在 app.js。 */
const Mini = {
  el: null, W: 900, H: 420, M: 34,
  mount(el) { this.el = el; },
  draw(planId) {
    if (!this.el || !window.TRIP) return;
    const NS = 'http://www.w3.org/2000/svg';
    const plan = TRIP.plans.filter(x => x.id === planId)[0] || TRIP.plans[0];
    const mk = (t, at) => { const e = document.createElementNS(NS, t); Object.keys(at || {}).forEach(k => e.setAttribute(k, at[k])); return e; };
    const skip = { campsites: 1, luggage: 1, back_to_altay: 1, baihaba_kanas_transfer: 1, urumqi_night_train: 1 };
    const seq = plan.route.filter(id => !skip[id]).map(id => TRIP.places.filter(x => x.id === id)[0])
      .filter(x => x && x.coord && x.coord[0] != null);
    const legs = (window.GeoMap ? GeoMap.planLegs(planId, 'core') : []);
    let pts = [];
    seq.forEach(x => pts.push(x.coord));
    legs.forEach(l => { pts = pts.concat(l.points || []); });
    if (!pts.length) return;
    const la = pts.map(x => x[0]), ln = pts.map(x => x[1]);
    let a = Math.min.apply(null, ln), b = Math.max.apply(null, ln);
    let c = Math.min.apply(null, la), d = Math.max.apply(null, la);
    const px = (b - a) * .1 + .01, py = (d - c) * .14 + .01;
    a -= px; b += px; c -= py; d += py;
    const k = Math.min((this.W - 2 * this.M) / (b - a), (this.H - 2 * this.M) / (d - c));
    const cx = (a + b) / 2, cy = (c + d) / 2;
    const at = q => [(q[1] - cx) * k + this.W / 2, this.H / 2 - (q[0] - cy) * k];
    const svg = mk('svg', { viewBox: '0 0 ' + this.W + ' ' + this.H, role: 'img',
                            'aria-label': plan.name + ' 路线示意' });
    legs.forEach(l => {
      const g = l.points;
      if (!g || g.length < 2) return;
      svg.appendChild(mk('path', { d: 'M' + g.map((q, i) => (i ? 'L' : '') + at(q).map(v => v.toFixed(1)).join(' ')).join(' '),
                                  class: 'route-line ' + (l.mode === 'hike' ? 'hike' : (l.mode === 'shuttle' ? 'shuttle' : 'drive'))
                                       + (l.src === 'schematic' ? ' intent' : '') }));
    });
    seq.filter(x => x.kind === 'stay').forEach(x => {
      const q = at(x.coord);
      const g = mk('g', { class: 'poi' });
      g.appendChild(mk('circle', { cx: q[0], cy: q[1], r: x.kind === 'stay' ? 8 : 6,
                                   fill: x.kind === 'stay' ? '#102b27' : '#d6a750' }));
      const t = mk('text', { x: q[0] + 11, y: q[1] + 4 });
      t.textContent = x.name;
      g.appendChild(t);
      g.appendChild(mk('title')).textContent = x.name;
      svg.appendChild(g);
    });
    this.el.innerHTML = '';
    this.el.appendChild(svg);
    return plan;
  },
};

/* 图片真加载失败时的降级：先原样重试一次（多为渲染期加载被中断），仍失败就换成带标注的占位块，
   不让用户看到浏览器破图，也不让布局塌掉。file:// 下不能加查询串重试，会被当成另一个路径。 */
document.addEventListener('error', function (e) {
  const i = e.target;
  if (!i || i.tagName !== 'IMG') return;
  const src = i.getAttribute('src');
  if (!i.dataset.imgRetry && src) {
    i.dataset.imgRetry = '1';
    i.src = '';
    i.src = src;
    return;
  }
  const box = document.createElement('div');
  box.className = 'img-fallback';
  box.innerHTML = '<b>这张图没能加载出来</b><span>'
    + esc(i.getAttribute('alt') || (src ? src.split('/').pop() : '')) + '</span>';
  if (i.parentNode) i.parentNode.replaceChild(box, i);
}, true);
