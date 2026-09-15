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
  el: null,
  mount(el) { this.el = el; },
  draw(planId) {
    if (!this.el || !window.TRIP) return;
    const NS = 'http://www.w3.org/2000/svg';
    const plan = TRIP.plans.filter(x => x.id === planId)[0] || TRIP.plans[0];
    const mk = (t, at) => { const e = document.createElementNS(NS, t); Object.keys(at || {}).forEach(k => e.setAttribute(k, at[k])); return e; };
    const skip = { campsites: 1, luggage: 1, back_to_altay: 1, baihaba_kanas_transfer: 1, urumqi_night_train: 1 };
    const cos = Math.cos(48.4 * Math.PI / 180);   /* 让经纬度按真实长宽比呈现 */
    const collect = pid => {
      const pl = TRIP.plans.filter(x => x.id === pid)[0];
      if (!pl) return { pts: [], legs: [] };
      let pts = [];
      (pl.route || []).filter(id => !skip[id]).forEach(id => {
        const q = TRIP.places.filter(x => x.id === id)[0];
        if (q && q.coord && q.coord[0] != null) pts.push(q.coord);
      });
      /* 用全线的真实路网腿（含阿勒泰走廊）；走向示意不进小图，小图只画能落到路面的线 */
      const legs = (window.GeoMap ? GeoMap.planLegs(pid, 'full').filter(l => l.src !== 'schematic') : []);
      legs.forEach(l => { pts = pts.concat(l.points || []); });
      return { pts: pts, legs: legs };
    };
    /* 取景框用三套方案的并集：切方案时比例完全一致，不会忽大忽小 */
    const me = collect(plan.id);
    if (!me.pts.length) return;
    const box = pts => {
      const fx = pts.map(q => q[1] * cos), fy = pts.map(q => q[0]);
      const gx0 = Math.min.apply(null, fx), gx1 = Math.max.apply(null, fx);
      const gy0 = Math.min.apply(null, fy), gy1 = Math.max.apply(null, fy);
      const px = (gx1 - gx0) * .035 + .003, py = (gy1 - gy0) * .035 + .003;
      return { x0: gx0 - px, x1: gx1 + px, y0: gy0 - py, y1: gy1 + py,
               r: (gx1 - gx0 + 2 * px) / (gy1 - gy0 + 2 * py) };
    };
    const union = [];
    (TRIP.plans || []).forEach(p2 => {
      if (p2.id === plan.id) return;
      collect(p2.id).pts.forEach(q => union.push(q));
    });
    /* 三套并集的边框保证切方案时取景框完全不动；只有当并集把画幅拉成细长条、
       留出大片空白时，才回退到当前方案自己的边框。 */
    const mine = box(me.pts);
    const all = union.length ? box(union.concat(me.pts)) : mine;
    const pick = (all.r < 1.15 || all.r > 2.5) ? mine : all;
    /* 把取景框规整到固定长宽比：画幅不忽宽忽窄，也不留大片空边 */
    const RATIO = 1.18;
    let bx0 = pick.x0, bx1 = pick.x1, by0 = pick.y0, by1 = pick.y1;
    const cur = (bx1 - bx0) / (by1 - by0);
    if (cur < RATIO) { const need = (by1 - by0) * RATIO, cx = (bx0 + bx1) / 2; bx0 = cx - need / 2; bx1 = cx + need / 2; }
    else if (cur > RATIO) { const need = (bx1 - bx0) / RATIO, cy = (by0 + by1) / 2; by0 = cy - need / 2; by1 = cy + need / 2; }
    const x0 = bx0, x1 = bx1, y0 = by0, y1 = by1;
    const K = 1000;
    const W = Math.max(1, Math.round((x1 - x0) * K)), H = Math.max(1, Math.round((y1 - y0) * K));
    const at = q => [(q[1] * cos - x0) * K, (y1 - q[0]) * K];
    /* 标签与圆点按实际显示宽度换算，窄栏里也不会缩成看不清的小字 */
    const shown = Math.max(320, Math.round(this.el.getBoundingClientRect().width) || 800);
    const u = W / shown;
    const svg = mk('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img',
                            'aria-label': plan.name + ' 路线示意' });
    me.legs.forEach(l => {
      const g = l.points;
      if (!g || g.length < 2) return;
      svg.appendChild(mk('path', { d: 'M' + g.map((q, i) => (i ? 'L' : '') + at(q).map(v => v.toFixed(1)).join(' ')).join(' '),
                                  class: 'route-line ' + (l.mode === 'hike' ? 'hike' : (l.mode === 'shuttle' ? 'shuttle' : 'drive'))
                                       + (l.src === 'schematic' ? ' intent' : '') }));
    });
    const seen = {};
    const pinned = [];
    me.pts.forEach(q => {
      const p3 = TRIP.places.filter(x => x.coord && x.coord[0] === q[0] && x.coord[1] === q[1])[0];
      /* 公路类点位在数据里只是一枚名义坐标，路面本身已经画出来了，不重复标点 */
      if (!p3 || p3.kind === 'road' || seen[p3.id]) return;
      seen[p3.id] = 1;
      pinned.push(p3);
    });
    /* 过夜点优先级最高；标签贪心避让，窄栏里密集的点位宁可不写，也不叠成一团 */
    pinned.sort((a, b) => (a.kind === 'stay' ? 0 : 1) - (b.kind === 'stay' ? 0 : 1));
    const boxes = [];
    const crowded = r => boxes.some(o => !(r[2] < o[0] || r[0] > o[2] || r[3] < o[1] || r[1] > o[3]));
    pinned.forEach(p3 => {
      const stay = p3.kind === 'stay';
      const xy = at(p3.coord);
      const g = mk('g', { class: 'poi ' + (stay ? 'stay' : 'hub') });
      g.appendChild(mk('circle', { cx: xy[0].toFixed(1), cy: xy[1].toFixed(1),
                                   r: ((stay ? 5.2 : 3.4) * u).toFixed(1) }));
      const fs = (stay ? 12.5 : 11.5) * u;
      const gap = (stay ? 13 : 10) * u, base = 4.5 * u, lineH = 16 * u;
      const tw = p3.name.length * fs + 5 * u;
      const cands = [[gap, base], [gap, base + lineH], [gap, base - lineH], [gap, base + 2 * lineH], [-gap - tw, base]];
      let spot = null;
      for (let i = 0; i < cands.length; i++) {
        const c = cands[i];
        const r = [xy[0] + c[0] - 2 * u, xy[1] + c[1] - fs, xy[0] + c[0] - 2 * u + tw, xy[1] + c[1] + 3 * u];
        if (!crowded(r)) { spot = c; boxes.push(r); break; }
      }
      if (!spot && stay) {
        spot = cands[0];
        boxes.push([xy[0] + gap - 2 * u, xy[1] + base - fs, xy[0] + gap - 2 * u + tw, xy[1] + base + 3 * u]);
      }
      if (spot) {
        const t = mk('text', { x: (xy[0] + spot[0]).toFixed(1), y: (xy[1] + spot[1]).toFixed(1), 'text-anchor': 'start' });
        t.style.fontSize = fs.toFixed(1) + 'px';
        t.textContent = p3.name;
        g.appendChild(t);
      }
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

/* ══ 术语外化 ═══════════════════════════════════════════════════════════
   底库（采集笔记、台账、费用表）里的研究用词不能出现在读者面前。
   渲染层已经做过一轮清理，这里再加一道页面级的兜底：任何模块、任何动态内容
   渲染完成后统一过一遍，把内部说法换成读者语言，并收拾替换后留下的碎标点。
   ═══════════════════════════════════════════════════════════════════ */
const POLISH_PAIRS = [
  ['按车还是按人不明', '按车或按人计价待现场核价'], ['含等待与否不明', '是否含等待待现场核价'],
  ['链接待补', '稍后补充'], ['实拍', '现场照片'], ['原帖', '来源'],
  ['整包自报', '打包价·旅友实测'], ['不含门票自报', '不含门票·旅友实测'],
  ['自报未成交', '旅友询价·未成交'], ['自报成交', '旅友实测成交'], ['评论自报', '旅友实测'],
  ['亲测同向', '多人实测一致'], ['实测校对', '实地校对'], ['实测笔记', '实地笔记'], ['亲测条目', '实地记录'],
  ['口径不明', '说法不一'], ['口径互斥', '说法不一'], ['口径不一致', '说法不一致'],
  ['单源待核', '待现场确认'], ['未核实', '待现场确认'],
  ['文档原口径', ''], ['主方案文档口径', '主方案估算'], ['免费口径', '是否免费'],
  ['官方口径', '官方公布'], ['旧口径', ''], ['原口径', ''],
  ['逐晚住宿口径', '逐晚住宿安排'], ['出行住宿口径', '住宿安排'],
  ['作者名', '账号名'], ['自报', '旅友实测'], ['亲测', '实地体验'], ['实测', '实地核验'],
  ['作者', '旅友'], ['楼主', '旅友'], ['素材', '资料'], ['简报', '资料'], ['台账', '账目'],
  ['底库', '资料库'], ['单源', '单一来源'], ['待核', '待现场确认'], ['待确认', '出行前确认'],
  ['楼中楼', ''], ['存疑', '待现场确认'], ['不明', '待现场确认'], ['模块', '页面'], ['口径', '标准'],
  ['ASR', ''], ['OCR', ''], ['§', ''], ['v4', ''], ['v3', ''], ['v5', ''], ['v6', ''],
  ['方案版本', '方案'], ['正式版', '定稿'],
];
const POLISH_SQUEEZE = [
  [/[（(]\s*[，、；:：]?\s*[）)]/g, ''],
  [/[（(]\s*[，、；:：]/g, '（'],
  [/[，、；:：]\s*[）)]/g, '）'],
  [/[，、；]{2,}/g, '，'], [/。{2,}/g, '。'], [/[ \t]{2,}/g, ' '],
  [/\s*[，、；:：]\s*(?=[。；])/g, ''],
  [/^\s*[，、；:：＋+—\-\s]+/g, ''],
  [/[，、；:：]\s*[^，。；！？]{0,24}…+\s*$/g, ''],
];
const POLISH_RE = [
  [/\s*[A-Za-z][A-Za-z0-9_.\-]{3,}\s*(?=[／\/])/g, ''],
  [/\s*[A-Za-z][A-Za-z0-9_.\-]{3,}(?=["“])/g, ''],
];
function polishText(t) {
  let s = String(t == null ? '' : t);
  if (!/[\u4e00-\u9fa5]/.test(s)) return s;
  for (let i = 0; i < POLISH_PAIRS.length; i++) {
    if (s.indexOf(POLISH_PAIRS[i][0]) < 0) continue;
    s = s.split(POLISH_PAIRS[i][0]).join(POLISH_PAIRS[i][1]);
  }
  for (let k = 0; k < POLISH_RE.length; k++) s = s.replace(POLISH_RE[k][0], POLISH_RE[k][1]);
  for (let j = 0; j < POLISH_SQUEEZE.length; j++) s = s.replace(POLISH_SQUEEZE[j][0], POLISH_SQUEEZE[j][1]);
  return s;
}
const SCRUB_SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, CODE: 1, PRE: 1 };
function scrubText(root) {
  if (!root || !document.createTreeWalker) return;
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const jobs = [];
  let n;
  while ((n = walk.nextNode())) {
    const p = n.parentNode;
    if (!p || SCRUB_SKIP[p.nodeName]) continue;
    const raw = n.nodeValue;
    if (!raw || raw.length < 2) continue;
    const next = polishText(raw);
    if (next !== raw) jobs.push([n, next]);
  }
  jobs.forEach(function (j) { j[0].nodeValue = j[1]; });
}
let _scrubQueued = false;
function scheduleScrub() {
  if (_scrubQueued) return;
  _scrubQueued = true;
  const run = function () { _scrubQueued = false; scrubText(document.body); };
  if (window.requestAnimationFrame) requestAnimationFrame(run); else setTimeout(run, 16);
}
if (document.body && window.MutationObserver) {
  new MutationObserver(scheduleScrub)
    .observe(document.body, { childList: true, subtree: true, characterData: true });
  scheduleScrub();
}
