/* 详情页统一渲染：day / place / topic / route / plans。
   事实只来自 site-data.js（索引）＋ data/js/<类型>_<id>.js（单页切片）。
   渲染层只做两件事：去掉内部口径与过程痕迹；把长段落拆成「结论句 ＋ 依据」。 */

/* ══ 文本层 ══════════════════════════════════════════════════════ */
const CLEAN_PAREN = /性质|口径|按人|按车|作者|截图|OCR|图内文字|评论|正文|复核|未标|转述|私信|图证|底库|核验|简报|内部|生成|版本|样本|对照|执行卡|读数|底线|基线|两步路|KML|Codex|handoff|攻略整理|校准|[A-F]\s?\d|图\s?\d/;

function cleanText(v) {
  if (v == null) return '';
  let t = String(v);
  t = t.replace(/[“”"'‘’「」]/g, '');
  t = t.replace(/[（(]([^（）()]{0,300})[）)]/g, (m, inner) => CLEAN_PAREN.test(inner) ? '' : m);
  t = t.replace(/(?:根据|按|见|出自|来自)?\s*简报\s*§?\s*[\d.]+[^，。；！？）)]{0,26}/g, '');
  t = t.replace(/§\s*[\d.]+[^，。；！？）)]{0,22}/g, '');
  t = t.replace(/旧(?:稿|采用值|版|口径)[^，。；！？）)]{0,40}/g, '');
  t = t.replace(/见\s*\d+\s*文件/g, '');
  t = t.replace(/(?:已核验|已核|版本号|过程稿|生成器|生成日期|底库|切片数据|本站|本页|本文|内部代号|等级码|项核验|待补充)\s*/g, '');
  t = t.replace(/(?:根据|依据)?\s*基线\s*v?\d+(?:\.\d+)?[^，。；！？）)]{0,22}/g, '');
  t = t.replace(/(^|[^A-Za-z0-9_])[vV]\d+(?:\.\d+)?(?![0-9])/g, '$1');
  t = t.replace(/L\d+[a-z]?(?:\s*[—\-－]\s*L?\d+[a-z]?)?/g, '相关路段');
  t = t.replace(/[A-F]\s?级参数[^，。；]*/g, '');
  t = t.replace(/(?:存在)?定\s*[A-F](?![A-Za-z0-9])/g, '');
  t = t.replace(/[→>-]\s*[A-F](?![A-Za-z0-9])/g, '');
  t = t.replace(/[，、；]\s*[A-F]\s*(?=[，。；、）)]|$)/g, '');
  t = t.replace(/＋\s*双独立一致|＋\s*单源|单源\s*[→>-]?|两源独立一致/g, '');
  t = t.replace(/[（(]\s*[）)]/g, '');
  t = t.replace(/[ \t]{2,}/g, ' ');
  t = t.replace(/\s+([，。；：、）!?])/g, '$1');
  t = t.replace(/([，；、])\1+/g, '$1');
  t = t.replace(/^[，；、。：\s]+/, '');
  return t.trim();
}
function cleanList(arr) { return (arr || []).map(cleanText).filter(Boolean); }

function sents(t) {
  const m = String(t == null ? '' : t).match(/[^。！？；]+[。！？；]?/g) || [];
  return m.map(x => x.trim()).filter(Boolean);
}
function splitLead(first) {
  if (first.length <= 96) return [first, ''];
  let cut = first.lastIndexOf('，', 88);
  if (cut < 30) cut = first.lastIndexOf('、', 88);
  if (cut < 30) cut = 88;
  return [first.slice(0, cut + 1), first.slice(cut + 1)];
}
/* 摘要：字数是硬上限（默认 90），超长句在标点处断开，不再靠 88 字的固定切点 */
function leadOf(t, cap) {
  const first = sents(t)[0] || '';
  if (!first) return '';
  const c = Math.max(14, cap || 90);
  if (first.length <= c) return first;
  let cut = -1;
  ['，', '、', '；', '：', '（'].forEach(ch => { const i = first.lastIndexOf(ch, c); if (i > cut) cut = i; });
  if (cut < Math.floor(c * 0.45)) cut = c - 1;
  return first.slice(0, cut + 1).replace(/[，、；：]$/, '') + '…';
}
function chunks(t, max) {
  const out = []; let buf = '';
  sents(t).forEach(s => {
    if (buf && buf.length + s.length > max) { out.push(buf); buf = ''; }
    buf += s;
  });
  if (buf) out.push(buf);
  return out;
}
/* 结论先行：首句加粗，其余按 118 字分组为小字依据 */
function paraHTML(text, cls) {
  const t = cleanText(text);
  if (!t) return '';
  const s = sents(t);
  const first = s.shift() || '';
  const parts = splitLead(first);
  let out = '<p class="p-lead">' + esc(parts[0]) + '</p>';
  chunks(parts[1] + s.join(''), 118).forEach(c => { out += '<p class="p-body">' + esc(c) + '</p>'; });
  return '<div class="paras ' + (cls || '') + '">' + out + '</div>';
}
function itemHTML(raw) {
  const t = cleanText(raw);
  if (!t) return '';
  const m = /^([^：:]{1,14})[：:]\s*([\s\S]+)$/.exec(t);
  const head = m ? m[1] : '';
  const body = m ? m[2] : t;
  const s = sents(body);
  const first = s.shift() || '';
  const parts = splitLead(first);
  const rest = parts[1] + s.join('');
  return '<li><b>' + esc(head || parts[0]) + '</b>'
    + (head ? '<span class="li-body">' + esc(parts[0]) + '</span>' : '')
    + (rest ? '<span class="li-ev">' + esc(rest) + '</span>' : '') + '</li>';
}
function ulHTML(arr, cls) {
  const items = (arr || []).filter(Boolean).map(itemHTML).filter(Boolean).join('');
  return items ? '<ul class="detail-list ' + (cls || '') + '">' + items + '</ul>' : '';
}
function withUnit(v, unit){              /* 字段缺失时不留 undefined */
  if (v == null || v === '') return '';
  return String(v) + (unit || '');
}
function isNum(v){                       /* 只给纯数字单元格右对齐，长句一律左对齐 */
  const t = String(v == null ? '' : v).replace(/\s+/g, '');
  if (!/\d/.test(t)) return false;
  return /^[¥￥\d.,%+\-–—~/]+(元|人|天|晚|件|公里|km|小时|分钟|米)?(\/人|\/件)?$/.test(t);
}
function rowsHTML(rows, cols, cls) {
  const body = (rows || []).filter(Boolean);
  if (!body.length) return '';
  return '<div class="wrap-tbl ' + (cls || '') + '"><table><thead><tr>'
    + cols.map(h => '<th>' + esc(h) + '</th>').join('') + '</tr></thead><tbody>'
    + body.map(r => '<tr>' + r.map((c, i) => '<td'
      + (i ? (isNum(c) ? ' class="num"' : '') : ' class="lead-cell"') + '>'
      + esc(cleanText(c)) + '</td>').join('') + '</tr>').join('')
    + '</tbody></table></div>';
}
function tagOf(note) {
  const n = (note && typeof note === 'object') ? note : {};
  const raw = String(n.nature || n.label || '');
  if (/商家|老板|报价|民宿|司机/.test(raw)) return '商家信息';
  if (/评论/.test(raw)) return '评论经验';
  if (/多篇|互证|两篇|两源|独立一致/.test(raw)) return '多篇亲测';
  if (/官方|景区|游客中心|站牌/.test(raw)) return '官方信息';
  return '单篇亲测';
}
function basisHTML(tip) {
  const b = cleanText(tip && tip.basis);
  if (!b) return '';
  return '<p class="li-ev basis"><span class="ev">' + tagOf(tip) + '</span>'
    + esc(leadOf(b, 96)) + '</p>';
}
function quoteHTML(q, name) {
  const one = leadOf(cleanText(q && q.text), 76);
  const tag = (q && q.label && !/临行确认|B\b/.test(q.label)) ? q.label : tagOf(q);
  return '<figure class="quote"><blockquote>' + esc(one) + '</blockquote><figcaption>'
    + '<span class="qtag">' + esc(tag) + '</span>'
    + (name ? '<span class="qplace">' + esc(name) + '</span>' : '')
    + (q && q.note ? Trip.noteLink(q.note) : '') + '</figcaption></figure>';
}
function guideHTML(g, alt) {
  if (!g) return '';
  return '<div class="guide-inline">'
    + '<button class="guide-fig" data-guide="' + esc(g.id) + '" aria-label="放大查看官方导览图">'
    + '<img src="' + esc(g.file) + '" alt="' + esc(alt || g.name) + '" loading="lazy"></button>'
    + '<div class="guide-text"><p class="p-body">' + esc(leadOf(cleanText(g.use), 110)) + '</p>'
    + (g.official_vs_us ? '<p class="p-body"><b>官方全图 ≠ 本次走法：</b>'
        + esc(leadOf(cleanText(g.official_vs_us), 96)) + '</p>' : '')
    + ulHTML(cleanList(g.adopted).slice(0, 3), 'tight')
    + '<button class="text-link" data-guide="' + esc(g.id) + '">全屏查看官方全图</button>'
    + '</div></div>';
}
function galleryHTML(ph, name) {
  if (!ph || !ph.length) return '';
  return '<div class="shot-grid">' + ph.map(x =>
    '<figure class="shot"><img src="' + esc(x.file) + '" alt="' + esc(name || '实景') + '" loading="lazy"'
    + (x.w ? ' width="' + x.w + '" height="' + x.h + '"' : '')
    + '><figcaption>' + esc(Trip.caption(x, name)) + '</figcaption></figure>').join('') + '</div>';
}
function evidenceHTML(p) {
  const ev = (p.evidence_photos || []);
  if (!ev.length) return '';
  return '<details class="fold tight"><summary>图证：价目表与轨迹截图 ' + ev.length + ' 张</summary>'
    + '<div class="shot-grid ev">' + ev.map(e => '<figure class="shot"><img src="' + esc(e.file)
      + '" alt="' + esc(e.caption || '图证') + '" loading="lazy"><figcaption>'
      + esc(cleanText(e.caption)) + '</figcaption></figure>').join('') + '</div></details>';
}
function identityNote(v) {
  const t = cleanText(v);
  if (!t) return '';
  if (/两步路|图层|KML|kml|转弯提示|假里程|导航线片段|逐点累加/.test(String(v))) {
    return '轨迹由导航线生成：逐点累加会把提示点算进里程，本文只采用官方统计值。';
  }
  return t;
}
function sec(title, inner, lead) {
  if (!inner) return '';
  return '<section class="detail-section"><h2>' + esc(title) + '</h2>'
    + (lead ? '<p class="sec-lead">' + esc(lead) + '</p>' : '') + inner + '</section>';
}
function factsHTML(rows, tail) {
  const body = (rows || []).filter(x => x && x[1]).map(x => '<div class="fact"><small>' + esc(x[0])
    + '</small><b>' + x[1] + '</b></div>').join('');
  return (body || tail) ? body + (tail || '') : '';
}
function noteLinksHTML(list, n) {
  const uniq = (list || []).filter((v, i, a) => v != null && a.indexOf(v) === i).slice(0, n || 8);
  if (!uniq.length) return '';
  return '<div class="note-list">' + uniq.map(i => Trip.noteLink(i)).join('') + '</div>';
}
/* plans.html 只加载到 ui.js，缺 roads.js/geomap.js 时按需补上 */
function loadGeoMap(done) {
  if (window.GeoMap) { if (done) done(); return; }
  const wait = window.__geoWait || (window.__geoWait = []);
  wait.push(done);
  if (wait.length > 1) return;
  const flush = () => { const q = window.__geoWait || []; window.__geoWait = []; q.forEach(f => { try { f && f(); } catch (e) {} }); };
  const s1 = document.createElement('script');
  s1.src = 'data/roads.js';
  s1.onerror = flush;
  s1.onload = () => {
    const s2 = document.createElement('script');
    s2.src = 'geomap.js';
    s2.onload = flush; s2.onerror = flush;
    document.head.appendChild(s2);
  };
  document.head.appendChild(s1);
}

/* ══ 卡片 ════════════════════════════════════════════════════════ */
function legCard(r) {
  const pending = (!r.three_total && !r.per_person) || /待询价|未知/.test(String(r.price_nature || ''));
  const nums = [
    ['里程', r.km_num ? r.km_num + ' km' : leadOf(cleanText(r.km), 22)],
    ['正常用时', leadOf(cleanText(r.hours_normal), 18)],
    ['含缓冲', leadOf(cleanText(r.hours_buffered), 18)],
    ['价格', pending ? '待司机报价' : (leadOf(cleanText(r.price), 40) || '—')]
  ].filter(x => x[1]);
  const ask = cleanList(r.unknowns);
  return '<article class="leg ' + legClass(r) + (pending ? ' quote-pending' : '') + '">'
    + '<div class="leg-head"><b>' + esc(leadOf(cleanText(r.name), 40)) + '</b>'
    + '<span class="chip">' + esc(leadOf(cleanText(r.mode), 26)) + '</span></div>'
    + '<dl class="num-row">' + nums.map(x => '<div><dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1]) + '</dd></div>').join('') + '</dl>'
    + (r.can_stop_photo ? '<p class="leg-note"><b>能否停车拍照</b>'
        + esc(leadOf(cleanText(r.can_stop_photo), 60)) + '</p>' : '')
    + (r.fits_big_packs ? '<p class="leg-note"><b>三个大包</b>'
        + esc(leadOf(cleanText(r.fits_big_packs), 60)) + '</p>' : '')
    + (ask.length ? '<details class="fold tight"><summary>下单前问清 ' + ask.length + ' 件事</summary>'
        + ulHTML(ask) + '</details>' : '')
    + '<a class="mini-link" href="route.html?id=' + esc(r.id) + '">看这一段的路程、估价与沿途</a>'
    + '</article>';
}
function hikeCard(r) {
  const t = window.TRACKS ? (TRACKS.tracks.filter(x => x.id === r.track_id)[0] || {}) : {};
  const geo = (t.adopted_points && t.adopted_points.length) ? '采用段已绘'
    : (r.shape === 'segment_unknown' ? '采用段在图上不可绘' : '完整轨迹已绘');
  return '<article class="hike-card"><div class="leg-head"><b>' + esc(leadOf(cleanText(r.place_name), 40))
    + '</b><span class="chip">' + esc(r.day) + ' · ' + esc(geo) + '</span></div>'
    + '<dl class="num-row">'
    + [['本次采用', withUnit(r.adopt_km, ' km')], ['累计爬升', withUnit(r.adopt_gain, ' m')],
       ['用时', r.hours || ''], ['完整轨迹', withUnit(r.full_km, ' km')]]
        .filter(x => x[1]).map(x => '<div><dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1])
        + '</dd></div>').join('') + '</dl>'
    + (r.adopted ? '<p class="p-lead">' + esc(leadOf(cleanText(r.adopted), 80)) + '</p>' : '')
    + (r.adopted_note ? '<p class="p-body">' + esc(leadOf(identityNote(r.adopted_note), 110)) + '</p>' : '')
    + (r.exit_points ? '<p class="li-ev basis"><span class="ev">退出点</span>'
        + esc(leadOf(cleanText(r.exit_points), 90)) + '</p>' : '')
    + (r.risks && r.risks.length ? ulHTML(r.risks, 'risk') : '')
    + '<a class="mini-link" href="route.html?id=' + esc(r.id) + '">看轨迹形状与强度</a></article>';
}
function placeCard(p) {
  return '<a class="pcard" href="place.html?id=' + esc(p.id) + '">'
    + (p.thumb ? '<img src="' + esc(p.thumb) + '" alt="" loading="lazy">' : '<span class="pcard-noimg">暂无实拍</span>')
    + '<span class="pcard-body"><b>' + esc(p.name) + '</b><span class="pcard-line">'
    + esc(leadOf(cleanText(p.conclusion), 46)) + '</span></span></a>';
}

/* ══ DAY ═════════════════════════════════════════════════════════ */
function renderDay(d) {
  document.title = d.date + '｜' + cleanText(d.headline) + '｜我们的阿勒泰';
  const ps = (d.places || []).map(id => Trip.place(id)).filter(Boolean);
  const cover = (d.photos || [])[0];
  document.getElementById('hero').innerHTML =
    '<div class="hero-copy"><p class="hero-date">第 ' + d.no + ' 天 · ' + esc(d.date) + ' ' + esc(d.week) + '</p>'
    + '<h1>' + esc(cleanText(d.title || d.headline)) + '</h1>'
    + '<p class="hero-lead">' + esc(leadOf(cleanText(d.headline), 120)) + '</p>'
    + (d.core ? '<p class="hero-core">' + esc(leadOf(cleanText(d.core), 110)) + '</p>' : '')
    + '<div class="chip-row"><span class="chip">' + esc(leadOf(cleanText(d.move), 40)) + '</span>'
    + '<span class="chip">' + esc(leadOf(cleanText(d.sleep), 40)) + '</span></div>'
    + '<div class="hero-more">' + paraHTML(d.summary) + '</div></div>'
    + (cover ? '<figure class="hero-shot"><img src="' + esc(cover.file) + '" alt="' + esc(d.date)
        + ' 实景" loading="lazy"></figure>' : '');

  let c = '';
  if (d.timeline && d.timeline.length) {
    c += sec('当天怎么走', '<ol class="timeline">' + d.timeline.map(t =>
      '<li><time>' + esc(cleanText(t.time) || '不设钟点') + '</time><div>'
      + '<p>' + esc(leadOf(cleanText(t.what), 130)) + '</p>'
      + (t.redline ? '<span class="tl-red">红线：' + esc(leadOf(cleanText(t.redline), 90)) + '</span>' : '')
      + '</div></li>').join('') + '</ol>', '按时间顺序，红字是不能越过的底线');
  }
  c += sec('底线与删减顺序',
    '<div class="callout-grid">'
    + (d.redline ? '<div class="callout alert"><small>最晚红线</small><p>' + esc(leadOf(cleanText(d.redline), 130)) + '</p></div>' : '')
    + (d.cut_first ? '<div class="callout warn"><small>来不及时先删什么</small><p>' + esc(leadOf(cleanText(d.cut_first), 130)) + '</p></div>' : '')
    + (d.weather_alt ? '<div class="callout soft"><small>天气替代</small><p>' + esc(leadOf(cleanText(d.weather_alt), 120)) + '</p></div>' : '')
    + (d.pace ? '<div class="callout soft"><small>建议节奏</small><p>' + esc(leadOf(cleanText(d.pace), 110)) + '</p></div>' : '')
    + '</div>');
  const legs = (d.legs || []).map(id => Trip.route(id)).filter(Boolean);
  if (legs.length) c += sec('当天的路', '<div class="leg-grid">' + legs.map(legCard).join('') + '</div>');
  const hikes = (d.tracks || []).map(id => (window.TRACKS ? TRACKS.tracks.filter(x => x.id === id)[0] : null))
    .filter(t => t && t.route).map(t => Trip.route(t.route)).filter(Boolean);
  if (hikes.length) c += sec('走的这一段', hikes.map(hikeCard).join(''));
  if (ps.length) c += sec('当天经过', '<div class="pgrid">' + ps.map(placeCard).join('') + '</div>');
  if (d.meals && d.meals.length) c += sec('吃饭与补给', ulHTML(d.meals.map(m =>
    m.place + '：' + (m.text || ''))));
  const sleepPlaces = ps.filter(p => p.facilities && (p.facilities.lodging || p.facilities.camp));
  c += sec('今晚落脚', '<div class="sleep-card"><b>' + esc(leadOf(cleanText(d.sleep), 60)) + '</b>'
    + (sleepPlaces.length ? ulHTML(sleepPlaces.map(p => p.name + '：' + (p.facilities.lodging || p.facilities.camp))) : '')
    + '</div>');
  c += sec('行李怎么放', '<p class="p-lead">大包：' + esc(leadOf(cleanText(d.bag) || '跟随当天安排', 90)) + '</p>'
    + (d.carry ? '<p class="p-body">日包：' + esc(leadOf(cleanText(d.carry), 100)) + '</p>' : ''));
  const crowd = (TRIP.crowd || []).filter(r => ps.some(p => String(r['地点'] || '').indexOf(p.name) >= 0));
  if (crowd.length) c += sec('错峰怎么执行', ulHTML(crowd.map(r =>
    r['地点'] + '：本次' + (r['本次怎么执行'] || '') + (r['明确避开什么'] ? '；避开' + r['明确避开什么'] : ''))));
  if (d.cost && d.cost.length) c += sec('当天费用', rowsHTML(d.cost.map(x => [x.item, x.text]), ['项目', '口径与金额']));
  if (d.topics && d.topics.length) {
    c += sec('相关攻略', '<div class="link-grid">' + d.topics.map(id => {
      const t = Trip.topic(id);
      return t ? '<a class="link-card" href="topic.html?id=' + esc(t.id) + '"><b>' + esc(t.name) + '</b><span>'
        + esc(leadOf(cleanText(t.conclusion), 52)) + '</span></a>' : '';
    }).join('') + '</div>');
  }
  const gs = (TRIP.guides || []).filter(g => (d.places || []).indexOf(g.place) >= 0);
  if (gs.length) c += sec('官方导览图', gs.map(g => guideHTML(g, g.name)).join(''), '点图放大，或全屏查看完整路网');
  if (d.photos && d.photos.length) c += sec('当天实景', galleryHTML(d.photos, ''));
  if (d.quotes && d.quotes.length) c += sec('代表原话',
    '<p class="sec-lead">只留结论与出处，原帖在下方入口</p>'
    + d.quotes.map(q => quoteHTML(q, q.place)).join(''));
  if (d.quotes && d.quotes.length) {
    const nl = noteLinksHTML(d.quotes.map(q => q.note), 6);
    if (nl) c += sec('代表原帖', nl);
  }
  document.getElementById('content').innerHTML = c;

  const i = TRIP.days.map(x => x.id).indexOf(d.id);
  const prev = i > 0 ? TRIP.days[i - 1] : null;
  const next = i < TRIP.days.length - 1 ? TRIP.days[i + 1] : null;
  document.getElementById('facts').innerHTML = '<h3>当天速查</h3>'
    + factsHTML([['当日核心', esc(leadOf(cleanText(d.core), 90))],
      ['建议节奏', esc(leadOf(cleanText(d.pace), 90))],
      ['大包去向', esc(leadOf(cleanText(d.bag), 90))],
      ['最晚红线', esc(leadOf(cleanText(d.redline), 90))],
      ['先删什么', esc(leadOf(cleanText(d.cut_first), 90))],
      ['天气替代', esc(leadOf(cleanText(d.weather_alt), 90))],
      ['实拍', String((d.photos || []).length) + ' 张']])
    + '<div class="day-nav">'
    + '<a href="' + (prev ? 'day.html?id=' + prev.id : 'index.html#days') + '">← ' + (prev ? DAY_LABEL(prev.id) : '回首页') + '</a>'
    + '<a href="' + (next ? 'day.html?id=' + next.id : 'index.html#days') + '">' + (next ? DAY_LABEL(next.id) : '回首页') + ' →</a>'
    + '</div>';
  $$('#content [data-guide]').forEach(b => b.addEventListener('click', () => {
    const g = (TRIP.guides || []).filter(x => x.id === b.dataset.guide)[0];
    if (g) Guide.open(g.file, g.name, g.facility_lines);
  }));
}

/* ══ PLACE ═══════════════════════════════════════════════════════ */
function renderPlace(p) {
  document.title = p.name + '｜我们的阿勒泰';
  const ph = (p.photos && p.photos[0]);
  const g = (TRIP.guides || []).filter(x => x.place === p.id)[0];
  document.getElementById('hero').innerHTML =
    '<div class="hero-copy"><p class="hero-date">'
    + esc((p.days || []).map(DAY_LABEL).join(' · ') || '按方案排期')
    + (p.type ? ' · ' + esc(leadOf(cleanText(p.type), 30)) : '') + '</p>'
    + '<h1>' + esc(p.name) + '</h1>'
    + '<p class="hero-lead">' + esc(leadOf(cleanText(p.conclusion), 120)) + '</p>'
    + '<div class="chip-row">' + (p.confidence ? '<span class="chip">'
        + esc(leadOf(cleanText(p.confidence), 20)) + '</span>' : '')
    + '<span class="chip">实拍 ' + (p.photo_count || 0) + ' 张</span>'
    + (p.duration ? '<span class="chip">' + esc(leadOf(cleanText(p.duration), 24)) + '</span>' : '') + '</div>'
    + (p.alias ? '<details class="fold tight"><summary>别名与写法核对</summary><p>'
        + esc(leadOf(cleanText(p.alias), 140)) + '</p></details>' : '') + '</div>'
    + (ph ? '<figure class="hero-shot"><img src="' + esc(ph.file) + '" alt="' + esc(p.name)
        + ' 实景" loading="lazy"></figure>'
      : '<div class="hero-noimg"><b>这个点暂时没有可确认归属的实拍照片</b>'
        + '<span>位置与玩法以文字和官方导览图为准。</span></div>');

  let c = '';
  c += sec('看什么', ulHTML(cleanList(p.see)));
  c += sec('怎么玩', ulHTML(cleanList(p.play)));
  if (p.when) c += sec('什么时候来', paraHTML(p.when));
  if (p.crowd) c += sec('错峰', paraHTML(p.crowd));
  if (p.transport && p.transport.length) c += sec('怎么到', ulHTML(cleanList(p.transport)));
  if (p.hike || p.hike_card) {
    const r = Trip.route(p.id);
    c += sec('走的这一段', paraHTML(p.hike) + (r && r.kind === 'hike' ? hikeCard(r) : ''));
  }
  if (p.duration) c += sec('留多久', '<p class="p-lead">' + esc(leadOf(cleanText(p.duration), 100)) + '</p>');
  if (p.spots && p.spots.length) c += sec('机位', ulHTML(cleanList(p.spots)));
  if (p.avoid && p.avoid.length) c += sec('避坑', ulHTML(cleanList(p.avoid), 'risk'));
  if (p.risks && p.risks.length) c += sec('风险与撤退条件', ulHTML(cleanList(p.risks), 'risk'));
  if (p.alternatives && p.alternatives.length) c += sec('天气不好怎么替', ulHTML(cleanList(p.alternatives)));
  const fk = Object.keys(p.facilities || {});
  if (fk.length) {
    const label = { lodging: '住宿', camp: '露营', supply: '吃饭与补给', luggage: '行李', ticket: '门票与区间车' };
    c += sec('设施与补给', ulHTML(fk.map(k => (label[k] || k) + '：' + p.facilities[k])));
  }
  if (p.cost && p.cost.length) c += sec('这里的钱', rowsHTML(p.cost.map(x => {
    const parts = cleanText(x).split('｜').map(s => s.trim()).filter(Boolean);
    return parts.length > 1 ? [parts[0], parts.slice(1).join('：')] : [cleanText(x), ''];
  }), ['项目', '口径与金额']));
  if (p.tips && p.tips.length) c += sec('提示', ulHTML(cleanList(p.tips)));
  if (p.verify && p.verify.length) c += sec('临行要现场确认', '<ul class="verify-list">'
    + cleanList(p.verify).map(v => '<li>' + esc(leadOf(v, 96)) + '</li>').join('') + '</ul>');
  c += sec('图证', evidenceHTML(p));
  if (g) c += sec('官方导览图', guideHTML(g, p.name + '官方导览图'), '点图放大，或全屏查看完整路网');
  if (p.quotes && p.quotes.length) c += sec('代表评价',
    '<p class="sec-lead">正面与反对意见都保留结论，原帖见下方入口</p>'
    + p.quotes.map(q => quoteHTML(q, p.name)).join(''));
  if (p.notes && p.notes.length) {
    c += sec('代表原帖', noteLinksHTML(p.notes, 8) + '<p class="sec-lead">点开是小红书原文'
      + (p.note_count ? '，本页共参考 ' + p.note_count + ' 篇' : '') + '</p>');
  }
  if (p.photos && p.photos.length) c += sec('实景', galleryHTML(p.photos, p.name));
  document.getElementById('content').innerHTML = c;

  const relatedTopics = (p.topics || []).map(id => Trip.topic(id)).filter(Boolean);
  document.getElementById('facts').innerHTML = '<h3>地点速查</h3>'
    + factsHTML([['结论硬度', esc(leadOf(cleanText(p.confidence) || '临行确认', 24))],
      ['类型', esc(leadOf(cleanText(p.type), 34))],
      ['留多久', esc(leadOf(cleanText(p.duration), 30))],
      ['出现在', (p.days || []).map(x => '<a href="day.html?id=' + x + '">' + DAY_LABEL(x) + '</a>').join(' ')],
      ['相关攻略', relatedTopics.map(t => '<a href="topic.html?id=' + t.id + '">' + esc(t.name) + '</a>').join(' ')]])
    + '<div class="day-nav"><a href="index.html#journey">回行程图定位 →</a></div>';
  $$('#content [data-guide]').forEach(b => b.addEventListener('click', () => {
    if (g) Guide.open(g.file, g.name, g.facility_lines);
  }));
}

/* ══ TOPIC ══════════════════════════════════════════════════════ */
function renderTopic(t) {
  document.title = t.name + '｜攻略｜我们的阿勒泰';
  document.getElementById('hero').innerHTML =
    '<div class="hero-copy"><p class="hero-date">覆盖 ' + (t.days || []).length + ' 天 · '
    + (t.places || []).length + ' 个地点 · 参考 ' + (t.note_count || 0) + ' 篇原帖</p>'
    + '<h1>' + esc(t.name) + '</h1>'
    + '<p class="hero-lead">' + esc(leadOf(cleanText(t.conclusion), 120)) + '</p></div>';

  let c = '';
  if (t.top && t.top.length) c += sec('先记住这三条', '<ol class="top-list">'
    + cleanList(t.top).slice(0, 4).map(x => '<li>' + esc(leadOf(x, 80)) + '</li>').join('') + '</ol>');
  if (t.tips && t.tips.length) c += sec('先做这几件事', ulWithBasis(t.tips), '每一条都是行程里要执行的动作');
  if ((t.packing || []).length) {
    c += sec('每人带多少', (t.packing || []).map(gp =>
      '<details class="fold"><summary>' + esc(cleanText(gp[0])) + '（' + (gp[1] || []).length + ' 项）</summary>'
      + rowsHTML(gp[1], ['装备', '每人数量', '为什么是这个数', '状态']) + '</details>').join(''));
  }
  if ((t.status_rules || []).length) c += sec('排程里必须做的动作', ulHTML(
    (t.status_rules || []).map(r => r.rule + '：' + (r.how || ''))));
  if ((t.food_groups || []).length) c += sec('在哪吃', '<div class="food-grid">'
    + t.food_groups.map(gp => '<a class="fcell" href="place.html?id=' + esc(gp.pid) + '"><b>'
      + esc(gp.place) + '</b><span>' + esc(leadOf(cleanText(gp.text), 70)) + '</span></a>').join('') + '</div>');
  const ps = (t.places || []).map(id => Trip.place(id)).filter(Boolean);
  if (ps.length) c += sec('涉及地点', '<div class="pgrid">' + ps.map(placeCard).join('') + '</div>');
  const rs = (t.routes || []).map(id => Trip.route(id)).filter(Boolean);
  if (rs.length) c += sec('涉及路线', rs.map(r => r.kind === 'hike' ? hikeCard(r) : legCard(r)).join(''));
  if (t.days && t.days.length) c += sec('用在哪天', '<div class="link-grid">' + t.days.map(id => {
    const d = Trip.day(id);
    return d ? '<a class="link-card" href="day.html?id=' + esc(id) + '"><b>' + esc(d.date) + '</b><span>'
      + esc(leadOf(cleanText(d.short), 30)) + '</span></a>' : '';
  }).join('') + '</div>');
  if (t.quotes && t.quotes.length) c += sec('代表原话',
    '<p class="sec-lead">只留结论与出处，原帖在下方入口</p>'
    + t.quotes.map(q => quoteHTML(q, q.label === '临行确认' ? '' : '')).join(''));
  const refs = [];
  (t.quotes || []).forEach(q => { if (q.note) refs.push(q.note); });
  (t.tips || []).forEach(x => (x.refs || []).forEach(r => refs.push(r)));
  const nl = noteLinksHTML(refs, 8);
  if (nl) c += sec('代表原帖', nl + '<p class="sec-lead">点开是小红书原文</p>');
  document.getElementById('content').innerHTML = c;

  document.getElementById('facts').innerHTML = '<h3>攻略速查</h3>'
    + factsHTML([['一句结论', esc(leadOf(cleanText(t.conclusion), 90))],
      ['动作', (t.tips || []).length + ' 条'],
      ['涉及地点', (t.places || []).length + ' 个'],
      ['涉及路线', (t.routes || []).length + ' 条'],
      ['原帖', (t.note_count || 0) + ' 篇']])
    + '<div class="day-nav"><a href="index.html#topics">回首页攻略区 →</a></div>';
}
function ulWithBasis(tips) {
  const items = (tips || []).filter(Boolean).map(x => {
    const t = cleanText(x.text);
    const s = sents(t);
    const first = s.shift() || '';
    const parts = splitLead(first);
    return '<li><b>' + esc(parts[0]) + '</b>'
      + (parts[1] + s.join('') ? '<span class="li-body">' + esc(parts[1] + s.join('')) + '</span>' : '')
      + (x.place && Trip.place(x.place) ? '<a class="mini-link" href="place.html?id=' + esc(x.place)
          + '">看 ' + esc(Trip.place(x.place).name) + '</a>' : '')
      + basisHTML(x) + '</li>';
  }).join('');
  return '<ul class="check-list">' + items + '</ul>';
}

/* ══ ROUTE ══════════════════════════════════════════════════════ */
function renderRoute(r) {
  document.title = (r.place_name || r.name) + '｜路线｜我们的阿勒泰';
  const t = window.TRACKS ? (TRACKS.tracks.filter(x => x.id === r.track_id)[0] || {}) : {};
  document.getElementById('hero').innerHTML =
    '<div class="hero-copy"><p class="hero-date">' + esc(cleanText(r.day))
    + ' · ' + (r.kind === 'hike' ? '徒步线' : '转场路段')
    + (r.is_nav_line ? ' · 导航线，非全程实录' : '') + '</p>'
    + '<h1>' + esc(leadOf(cleanText(r.place_name || r.name), 40)) + '</h1>'
    + '<p class="hero-lead">' + esc(leadOf(cleanText(r.adopted_note || r.adopted), 120)) + '</p></div>'
    + '<div class="trace" id="trace"></div>';

  let nums;
  if (r.kind === 'leg') {
    nums = [['里程', r.km_num ? r.km_num + ' km' : leadOf(cleanText(r.km), 20)],
      ['正常用时', leadOf(cleanText(r.hours_normal), 16)],
      ['含缓冲', leadOf(cleanText(r.hours_buffered), 16)],
      ['计价', leadOf(cleanText(r.pricing_unit), 10)],
      ['每人', r.per_person ? String(r.per_person) + ' 元' : '待询价'],
      ['三人合计', r.three_total ? String(r.three_total) + ' 元' : '待询价']];
  } else {
    nums = [['本次采用', withUnit(r.adopt_km, ' km')],
      ['累计爬升', withUnit(r.adopt_gain, ' m')],
      ['用时', r.hours || '—'],
      ['完整轨迹', withUnit(r.full_km, ' km')],
      ['海拔区间', (r.elev && r.elev[0] != null) ? r.elev[0] + ' — ' + r.elev[1] + ' m' : '—'],
      ['起 → 终', leadOf(cleanText(r.start), 12) + ' → ' + leadOf(cleanText(r.end), 12)]];
  }
  let c = sec('数字', '<dl class="num-row wide">' + nums.filter(x => x[1]).map(x =>
    '<div><dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1]) + '</dd></div>').join('') + '</dl>'
    + (r.kind === 'leg'
      ? '<p class="li-ev basis"><span class="ev">' + esc(r.level_label || '临行确认') + '</span>'
        + '未拿到 2026 报价前不按 0 元计，也不并进合计。</p>'
      : '<p class="li-ev basis"><span class="ev">里程口径</span>里程与爬升取导航线原生统计，'
        + '逐点累加海拔会明显偏高。</p>'));
  if (r.kind === 'leg') {
    c += sec('这段怎么执行', ulHTML([
      '怎么走：' + (r.mode || '') + '；' + (r.status || ''),
      r.can_stop_photo ? '能否停车拍照：' + r.can_stop_photo : '',
      r.fits_big_packs ? '三个大包怎么办：' + r.fits_big_packs : '',
      r.price ? '价格口径：' + r.price : '价格口径：待询价 —— 这一段属于花钱最多的几段之一，出发前必须拿到 2026 报价',
      r.level_label ? '这条价格有多硬：' + r.level_label : ''
    ]));
  } else {
    c += sec('这段怎么执行', paraHTML(r.adopted));
  }
  const traceKm = (r.kind === 'leg') ? withUnit(r.km_num, ' km')
    : (withUnit(r.full_km, ' km') || withUnit(r.adopt_km, ' km'));
  if (traceKm) {
    const np = (t.points || []).length, na = (t.adopted_points || []).length;
    c += sec('完整轨迹与采用段',
      '<p class="p-lead">完整轨迹 ' + esc(traceKm)
      + ((r.kind !== 'leg' && r.full_gain != null) ? ' / ' + esc(withUnit(r.full_gain, ' m')) : '')
      + (np ? '，实录 ' + np + ' 个点' : '') + '</p>'
      + (na ? '<p class="p-body">本次采用：' + esc(leadOf(cleanText(r.adopted || r.adopted_note), 110))
              + '，图上 ' + na + ' 个点</p>'
            : '<p class="p-body">按导航线整段行驶，图上为路段走向示意。</p>')
      + (r.identity ? '<p class="li-ev basis"><span class="ev">轨迹来源</span>'
          + esc(identityNote(r.identity)) + '</p>' : ''));
  }
  if (r.exit_points) c += sec('折返与退出', '<p class="p-lead">' + esc(leadOf(cleanText(r.exit_points), 120)) + '</p>');
  if (r.risks && r.risks.length) c += sec('风险与撤退条件', ulHTML(cleanList(r.risks), 'risk'));
  if (r.unknowns && r.unknowns.length) c += sec('下单前问清', '<ul class="verify-list">'
    + cleanList(r.unknowns).map(u => '<li>' + esc(leadOf(u, 90)) + '</li>').join('') + '</ul>');
  const p = (r.kind === 'hike' && r.place) ? Trip.place(r.place) : Trip.place(r.id);
  if (p) c += sec('关联地点', '<div class="pgrid">' + placeCard(p) + '</div>');
  const dd = (TRIP.days || []).filter(x => String(r.day || '').indexOf(x.date) >= 0);
  c += sec('用在哪天', dd.length ? '<div class="link-grid">' + dd.map(d =>
    '<a class="link-card" href="day.html?id=' + esc(d.id) + '"><b>' + esc(d.date) + '</b><span>'
    + esc(leadOf(cleanText(d.short), 30)) + '</span></a>').join('') + '</div>'
    : '<p class="p-lead">' + esc(leadOf(cleanText(r.day), 40)) + '</p>');
  document.getElementById('content').innerHTML = c;
  drawTrace(t);

  document.getElementById('facts').innerHTML = '<h3>路段速查</h3>'
    + factsHTML([['类型', r.kind === 'hike' ? '徒步' : '转场'],
      ['状态', esc(leadOf(cleanText(r.status), 24))],
      ['日期', esc(cleanText(r.day))],
      ['几何', ((t.points || []).length) + ' 点']])
    + '<div class="day-nav"><a href="index.html#journey">回行程图 →</a></div>';
}
function drawTrace(t) {
  const box = document.getElementById('trace');
  if (!box) return;
  const full = (t && t.points) || [];
  if (full.length < 2) { box.innerHTML = '<p class="trace-empty">这一段暂无可用轨迹。</p>'; return; }
  const adopt = (t.adopted_points && t.adopted_points.length > 1) ? t.adopted_points : [];
  const all = adopt.length ? full.concat(adopt) : full;
  const la = all.map(q => q[0]), ln = all.map(q => q[1]);
  const a0 = Math.min.apply(null, ln), a1 = Math.max.apply(null, ln);
  const b0 = Math.min.apply(null, la), b1 = Math.max.apply(null, la);
  const k = Math.min(608 / Math.max(a1 - a0, 0.001), 184 / Math.max(b1 - b0, 0.001));
  const ox = 16 - a0 * k + (608 - (a1 - a0) * k) / 2, oy = 16 + (184 - (b1 - b0) * k) / 2;
  const xy = q => [q[1] * k + ox, 216 - (q[0] * k + oy)];
  const path = s => 'M' + s.map(q => xy(q).map(v => v.toFixed(1)).join(' ')).join(' L');
  const s0 = xy(full[0]), s1 = xy(full[full.length - 1]);
  box.innerHTML = '<svg viewBox="0 0 640 216" role="img" aria-label="轨迹形状">'
    + '<path d="' + path(full) + '" class="trace-full"/>'
    + (adopt.length ? '<path d="' + path(adopt) + '" class="trace-adopt"/>' : '')
    + '<circle cx="' + s0[0].toFixed(1) + '" cy="' + s0[1].toFixed(1) + '" r="5" class="trace-start"/>'
    + (Math.abs(s1[0] - s0[0]) + Math.abs(s1[1] - s0[1]) > 4
      ? '<circle cx="' + s1[0].toFixed(1) + '" cy="' + s1[1].toFixed(1) + '" r="5" class="trace-end"/>' : '')
    + '</svg><p class="trace-key"><span class="k1">完整轨迹</span>'
    + (adopt.length ? '<span class="k2">本次采用段</span>' : '') + '</p>';
}

/* ══ 装载 ════════════════════════════════════════════════════════ */
function dropEmptySections() {
  $$('.detail-section').forEach(s => {
    const kids = Array.prototype.slice.call(s.children).filter(x => x.tagName !== 'H2');
    if (!kids.length || kids.every(x => !x.textContent.trim() && !x.querySelector('img, svg'))) s.remove();
  });
}

(function () {
  const TYPE = document.body.dataset.type;
  const ID = param('id');
  if (TYPE === 'plans') { renderPlans(); dropEmptySections(); return; }
  if (!ID || !Trip[TYPE]) {
    document.getElementById('content').innerHTML = '<section class="detail-section"><h2>缺少参数</h2>'
      + '<p class="p-body">请用带 <code>?id=</code> 的链接打开本页，或<a href="index.html">回首页</a>。</p></section>';
    return;
  }
  Trip.slice(TYPE, ID, function (slice) {
    const light = Trip[TYPE](ID);
    if (!light && !slice) {
      document.getElementById('content').innerHTML = '<section class="detail-section"><h2>没有这条数据</h2>'
        + '<p class="p-body">标识 <code>' + esc(ID) + '</code> 不在数据层里。<a href="index.html">回首页</a></p></section>';
      return;
    }
    const data = slice || light;
    if (TYPE === 'day') renderDay(data);
    else if (TYPE === 'place') renderPlace(data);
    else if (TYPE === 'topic') renderTopic(data);
    else renderRoute(data);
    dropEmptySections();
    if (!history.state || !history.state.page) history.replaceState({ page: TYPE + ':' + ID }, '');
  });
})();

/* ═ 方案对照页（plans.html）═════════════════════════════════════ */
function store_get(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
function store_set(k,v){ try { localStorage.setItem(k,v); } catch(e){} }

function renderPlans() {
  const P = TRIP.plans || [];
  let cur = param('plan') || (window.PLAN_VIEW) || store_get('altay.plan') || (P[0] || {}).id;
  if (!P.some(x => x.id === cur)) cur = (P[0] || {}).id;
  document.title = '三套方案差在哪｜我们的阿勒泰';
  const main = P[0] || {};
  document.getElementById('hero').innerHTML =
    '<div class="hero-copy"><p class="hero-date">三套方案 · 9 天同一张图</p>'
    + '<h1>三套方案差在哪</h1>'
    + '<p class="hero-lead">共同点：9/24 夜火车进，9/30 傍晚下撤贾登峪，10/1 直达阿勒泰站赶 K9752。</p>'
    + (main.gain ? '<p class="p-body">不同点只集中在 9/25—9/29 这五天：换掉哪一段，决定了全程的舒展程度。</p>' : '')
    + '</div>';
  document.getElementById('content').innerHTML =
    '<section class="detail-section"><h2>一张图看三套方案</h2>'
    + '<p class="sec-lead">切换方案，下面的地图与对照表同时跟着换</p>'
    + '<div class="plan-switch" id="planSwitch"></div>'
    + '<div id="planMap" class="mini-map"></div>'
    + '<p class="map-cap">实线是导航轨迹，虚线是转场走向示意，深色点是当晚落脚。</p></section>'
    + '<section class="detail-section"><h2>逐日对照</h2><div id="planBody"></div></section>';

  function paint() {
    const p = P.filter(x => x.id === cur)[0] || P[0];
    const sw = document.getElementById('planSwitch');
    if (sw) {
      sw.innerHTML = P.map(x => '<button data-plan="' + esc(x.id) + '" class="plan-btn'
        + (x.id === cur ? ' on' : '') + '">' + '<b>' + esc(x.name) + '</b><span>'
        + esc(leadOf(cleanText(x.gain), 34)) + '</span></button>').join('');
      $$('[data-plan]', sw).forEach(b => b.addEventListener('click', () => {
        cur = b.getAttribute('data-plan');
        store_set('altay.plan', cur);
        try { history.replaceState({ plan: cur }, '', 'plans.html?plan=' + cur); } catch (e) {}
        paint();
      }));
    }
    const box = document.getElementById('planMap');
    if (box) { try { Mini.mount(box); Mini.draw(cur); } catch (e) {} }
    const days = (TRIP.days || []).filter(d => d.id !== '0924' && d.id !== '1002');
    const body = document.getElementById('planBody');
    if (body) body.innerHTML =
      rowsHTML(days.map(d => [d.date + ' ' + (d.week || '')].concat(
        P.map(x => (x.days && x.days[d.id]) || '同主方案'))), ['日期'].concat(P.map(x => x.name)), 'plan-tbl')
      + '<div class="plan-cmp">'
      + '<article><h3>' + esc(p.name) + '</h3>' + paraHTML(p.gain)
      + (p.cost ? '<p class="li-ev basis"><span class="ev">花费</span>' + esc(leadOf(cleanText(p.cost), 90)) + '</p>' : '')
      + ((p.diff_from_main || []).length
        ? '<h4 class="sub-h">与主方案不同</h4><ul class="diff-list">' + p.diff_from_main.map(x =>
          '<li>' + DAY_LABEL(x.date) + '：<b>' + esc(leadOf(cleanText(x.this), 44)) + '</b>'
          + '<span class="was">主方案：' + esc(leadOf(cleanText(x.main), 40)) + '</span></li>').join('') + '</ul>'
        : ((P.filter(x => x.id !== p.id && (x.diff_from_main || []).length).length)
          ? '<h4 class="sub-h">换成备选，会换掉哪几天</h4><ul class="diff-list">'
            + P.filter(x => x.id !== p.id && (x.diff_from_main || []).length).map(x => {
                const df = x.diff_from_main;
                return '<li><b>' + esc(x.name.replace(/｜.*/, '')) + '</b>'
                  + '<span class="was">' + df.slice(0, 3).map(y => DAY_LABEL(y.date) + ' '
                      + esc(leadOf(cleanText(y.this), 16))).join(' · ')
                  + (df.length > 3 ? ' · 另 ' + (df.length - 3) + ' 天' : '') + '</span></li>';
              }).join('') + '</ul>'
          : '<p class="p-body">这一套就是主方案。</p>'))
      + '<h4 class="sub-h">这一套的逐晚落点</h4><ul class="plan-nights">'
      + (TRIP.days || []).filter(d => d.id !== '1002').map(d => {
          const diff = (p.night_diff || []).filter(x => x.date === d.id)[0];
          const here = diff ? diff.this : ((p.nights || {})[d.id] || '');
          if (!here) return '';
          return '<li class="plan-day' + (diff ? ' diff' : '') + '"><b>' + esc(DAY_LABEL(d.id)) + '</b>'
            + '<span>' + esc(leadOf(cleanText(here), 34)) + '</span>'
            + (diff ? '<small>主方案：' + esc(leadOf(cleanText(diff.main), 30)) + '</small>' : '') + '</li>';
        }).join('') + '</ul>'
      + ((p.night_diff || []).length
        ? '<h4 class="sub-h">逐晚落点差异</h4><ul class="diff-list">' + p.night_diff.map(x =>
          '<li>' + DAY_LABEL(x.date) + ' 夜：<b>' + esc(leadOf(cleanText(x.this), 40)) + '</b>'
          + '<span class="was">主方案：' + esc(leadOf(cleanText(x.main), 40)) + '</span></li>').join('') + '</ul>' : '')
      + '</article></div>';
  }

  document.getElementById('facts').innerHTML = '<h3>怎么选</h3>'
    + factsHTML(P.map(x => [x.name, esc(leadOf(cleanText(x.gain), 60))]))
    + '<div class="day-nav"><a href="index.html#plans">回首页切换方案 →</a></div>';
  paint();
  loadGeoMap(paint);
}
