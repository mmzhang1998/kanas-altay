/* GeoMap：地图"怎么画"的唯一实现。
   几何来源：dist/data/roads.js（OpenStreetMap 真实路网路由 + 水体多边形）＋ tracks.js（两步路 KML 实录）。
   没有真实几何的接驳段画成细点线并标"接驳示意"，绝不把直线当道路（需求基线 R05）。
   本文件不产生任何事实：颜色、线型、标记样式都在这里，数据一律外部传入。 */
window.GeoMap = (function () {
  const R = window.ROADS || { water: [], ctx: [], legs: [] };
  const STYLE = {
    drive:   { color: '#2A5750', width: 3.6, dash: null,  label: '包车／拼车（导航道路）' },
    shuttle: { color: '#5C8A80', width: 3.0, dash: null,  label: '景区区间车／摆渡（导航道路）' },
    hike:    { color: '#7FA090', width: 3.0, dash: '0.1 7', label: '徒步路线' },
    stub:    { color: '#A8A79E', width: 1.6, dash: '2 6', label: '接驳示意（无公开路网）' },
    schem:   { color: '#A8A79E', width: 2.4, dash: '7 8', label: '走向示意（该路未收录于公开路网）' },
    ctx:     { color: '#E4E3DD', width: 2.0, dash: null },
    ghost:   { color: '#CFCFC7', width: 1.6, dash: null },
  };
  /* 交通方式判定：阿禾公路、铁贾公路、白哈巴通行线都是车行，绝不能被画成徒步。
     kind 优先；kind 缺失时回退到名称里的关键词。 */
  function modeOf(kind, name) {
    /* kind 是权威字段：只要它明确写了车行/区间车/徒步，就直接采信，
       不再回到名称里猜——历史 bug 就是"行车实录"里的"实录"二字把阿禾公路判成了徒步。 */
    const kd = String(kind || '').trim().toLowerCase();
    if (kd === 'drive' || kd === 'shuttle' || kd === 'bus' || kd === 'train' || kd === 'hike') return kd;
    const k = kd + ' ' + String(name || '');
    if (/区间|摆渡|shuttle|村公交|大巴/.test(k)) return 'shuttle';
    if (/行车|公路|通行|导航线|drive|包车|自驾|实录/.test(k)) return 'drive';
    if (/徒步|hike|穿越|岩画|步道|栈道|walk/.test(k)) return 'hike';
    return 'drive';
  }

  const DAY_OF = { '0924': '9/24', '0925': '9/25', '0926': '9/26', '0927': '9/27', '0928': '9/28',
                   '0929': '9/29', '0930': '9/30', '1001': '10/1', '1002': '10/2' };

  /* 某天/某范围要画哪些真实路网腿。腿自带 day 字段，直接按日匹配即可。 */
  function legsFor(dayId, scope) {
    const d = DAY_OF[dayId];
    return R.legs.filter(l => (dayId ? d === l.day : true));
  }

  /* 精致标记：白底圆环 + 彩色内芯；过夜点用深墨绿实心。首字只作辅助，主信息靠标签。 */
  function pinHTML(p) {
    const cls = p.kind === 'stay' ? 'stay' : (p.kind === 'hub' ? 'hub' : (p.kind === 'road' ? 'road' : 'sight'));
    return '<i class="gpin ' + cls + '"><b></b></i>';
  }

  /* ── SVG 渲染（离线兜底引擎）────────────────────────────────────── */
  function drawSVG(svg, v, at) {
    const NS = 'http://www.w3.org/2000/svg';
    const mk = (t, a) => { const e = document.createElementNS(NS, t);
      Object.keys(a || {}).forEach(k => e.setAttribute(k, a[k])); return e; };
    svg.innerHTML = '';
    svg.append(mk('rect', { width: v.w || 1000, height: v.h || 600, class: 'gm-bg' }));

    /* 水体：真实的湖，不是装饰 */
    (R.water || []).forEach(w => {
      if (w.points.length < 4) return;
      svg.append(mk('path', { class: 'gm-water',
        d: 'M' + w.points.map(p => at(p).map(x => x.toFixed(1)).join(' ')).join('L') + 'Z' }));
    });
    /* 背景路网：让地图有地理质感，白色路芯 + 浅灰路缘 */
    (R.ctx || []).forEach(c => {
      const d = 'M' + c.points.map(p => at(p).map(x => x.toFixed(1)).join(' ')).join('L');
      svg.append(mk('path', { d: d, class: 'gm-ctx-casing' }));
      svg.append(mk('path', { d: d, class: 'gm-ctx' }));
    });
    /* 本次行程：先画白底衬线，再画彩色主线，交叉处才看得清 */
    const legs = v.planLegs || legsFor(v.dayId, v.scope);
    const tracks = v.tracks || [];
    /* 第四参数是"这一段自己"的对象：点击时才拿得到它。
       早先这里闭包引用了外层 forEach 的变量，点徒步线会直接抛错，详情根本打不开。 */
    const line = (pts, st, cls, tip, seg) => {
      if (!pts || pts.length < 2) return;
      const d = 'M' + pts.map(p => at(p).map(x => x.toFixed(1)).join(' ')).join('L');
      svg.append(mk('path', { d: d, class: 'gm-casing ' + (cls || '') }));
      const e = mk('path', { d: d, class: 'gm-line route-line ' + (cls || '').replace(/^leg-/, ''),
        stroke: st.color, 'stroke-width': st.width, 'stroke-dasharray': st.dash || 'none' });
      if (tip) { const t = mk('title', {}); t.textContent = tip; e.append(t); }
      e.style.cursor = 'pointer';
      e.addEventListener('click', () => {
        if (!window.__openLeg) return;
        window.__openLeg(seg || { name: tip, mode: (st && st.mode) || 'drive', src: 'schematic', km: 0 });
      });
      svg.append(e);
    };
    legs.forEach(l => {
      if (!l.points.length) return;
      let st2 = l.src === 'schematic' ? STYLE.schem
        : (v.colorByPlan ? { color: PLAN_COLOR[l.plan] || STYLE.drive.color, width: 2.8, dash: null } : STYLE[l.mode]);
      if (l.mode && !st2.mode) st2 = Object.assign({}, st2, { mode: l.mode });
      line(l.points, st2, 'leg-' + (l.src === 'schematic' ? 'schem' : l.mode),
           l.name + (l.src === 'schematic' ? ' · 走向示意' : (l.km ? ' · ' + l.km + ' km' : '')), l);

      if (l.stub && v.pois) {   /* 接驳示意：只连接"路网端点 ↔ 白名单坐标"，明确不是道路 */
        const a = l.points[0], b = l.points[l.points.length - 1];
        [a, b].forEach(q => {
          const near = v.pois.filter(p => p.coord && p.coord[0] != null)
            .map(p => ({ p: p, d: Math.hypot(p.coord[0] - q[0], p.coord[1] - q[1]) }))
            .sort((x, y) => x.d - y.d)[0];
          if (near && near.d < 0.06) line([q, near.p.coord], STYLE.stub, 'stub', '接驳示意');
        });
      }
    });
    tracks.forEach(t => {
      /* 这一屏已经画了同一条路的真实路段，就不要再叠一份实录 */
      if (legs.some(l => l.points && sameCorridor(t.points, l.points))) return;
      const g = (t.adopted_points && t.adopted_points.length) ? t.adopted_points : t.points;
      const m = modeOf(t.kind, t.name);
      if ((t.adopted_points || []).length && t.points && t.points.length > 1)
        line(t.points, STYLE.ghost, 'ghost', null, null);
      /* 里程：有"实际采用段"就用采用段，否则用整条轨迹原生统计 */
      const adoptedKm = parseFloat(String(t.adopted_km == null ? '' : t.adopted_km).replace(/[^0-9.]/g, ''));
      const km = isFinite(adoptedKm) ? adoptedKm : t.distance;
      const seg = { name: t.name, km: km, mode: m, src: 'kml', day: t.day,
                    gain: t.gain, loss: t.loss, elevation: t.elevation,
                    adoptedKm: t.adopted_km, adoptedNote: t.adopted_note, fullKm: t.distance };
      line(g, STYLE[m] || STYLE.drive, 'leg-' + m, t.name + ' · ' + (km || '') + ' km', seg);
    });
    return { legs: legs };
  }

  /* 标签：白描边光晕，压在任何底图上都读得清 */
  function labelAttrs() { return { class: 'gm-label', 'paint-order': 'stroke', stroke: '#fbfaf7',
    'stroke-width': 3.2, 'stroke-linejoin': 'round' }; }


  const PLAN_COLOR = { main: '#123B33', alt_a: '#B0742C', alt_b: '#2E7F6E' };
  const PLAN_NAME = { main: '主方案', alt_a: '备选A · 禾木＋喀纳斯', alt_b: '备选B · 铁贾＋白哈巴' };
  const CORRIDOR = { altay_city: 1, back_to_altay: 1, ahe_road: 1, urumqi_night_train: 1 };
  const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.03;
  const placeOf = id => (window.TRIP ? TRIP.places.filter(x => x.id === id)[0] : null);
  function curve(a, b, n, bow) {
    n = n || 26; bow = bow || .14;
    const kx = 111320 * Math.cos(a[0] * Math.PI / 180), ky = 110540;
    const dx = (b[1] - a[1]) * kx, dy = (b[0] - a[0]) * ky, L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L, out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, s = Math.sin(Math.PI * t) * bow * L;
      out.push([+(a[0] + (b[0] - a[0]) * t + ny * s / ky).toFixed(5),
                +(a[1] + (b[1] - a[1]) * t + nx * s / kx).toFixed(5)]);
    }
    return out;
  }
  /* 某方案的全部行程腿：先找真实路网腿 → 再找当天 KML 轨迹 → 都没有才画走向示意 */

  const SPEED = { drive: 40, shuttle: 30, hike: 4 };
  function legLabel(l) {
    if (!l.km) return '';
    const h = l.km / (SPEED[l.mode] || 40);
    return l.km + ' km · 约 ' + (h < 1 ? Math.round(h * 60) + ' 分钟' : h.toFixed(1) + ' 小时');
  }
  function midOf(pts) { return pts && pts.length ? pts[Math.floor(pts.length / 2)] : null; }
  /* 核心视图里 10/1 返程只画一段指向（完整线在"含阿禾全线"） */
  const CAMP_IDS = () => {
    const t = (window.TRIP && TRIP.topics || []).filter(x => x.id === 'camp')[0];
    return (t ? t.places : []).filter(id => id !== 'campsites');
  };
  const CORRIDOR2 = { altay_city: 1, back_to_altay: 1, ahe_road: 1, urumqi_night_train: 1 };
  /* 某方案某天的全部线：先放当天真实腿（导航/OSM）与 KML 徒步，
     只有"两个相邻点都不在任何真实线上"时才补一条走向示意，避免碎虚线 */
  /* 阿勒泰走廊腿：只在「含阿禾全线」里出现。留在核心区会把取景拉到阿勒泰市，
     整张图缩成地区图——这正是读者抱怨的"进来就是世界地图那么大"。 */
  const CORRIDOR_LEG = { L1: 1, L10: 1 };
  const hideKey = l => (l.src === 'schematic' ? 'schem' : l.mode);
  const hidden = l => !!(window.HIDE || {})[hideKey(l)];
  /* 未过滤的原始腿列表：图例要靠它判断"这一类到底存不存在"。
     若用过滤后的列表算图例，点掉一类按钮也会跟着消失，读起来像筛选失效。 */
  /* 方案级过滤：每一天该走哪些路，用当天 places 里出现的点来判定，
     否则三套方案共用同一批"日期腿"，切换按钮时地图不会变。 */
  function legAllowed(plan, d, l) {
    if (l.id === 'L1' || l.id === 'L10') return true;
    const tagged = (window.LEG_TAGS || R.LEG_TAGS) && (window.LEG_TAGS || R.LEG_TAGS)[l.id];
    if (!tagged) return true;
    const want = {};
    ((plan.day_places || {})[d] || []).forEach(id => { want[id] = 1; });
    /* 起终点的白名单：由 build_roads.py 写入 LEG_TAGS，没有标注就视为通用腿 */
    return tagged.from.some(id => want[id]) && tagged.to.some(id => want[id]);
  }
  /* ── 实录（KML）该不该出现在这一套方案里 ──────────────────────────
     实录只属于"当天行程点里真的包含它两端"的方案；否则三套方案会共用同一批轨迹，
     切换方案时地图看着没变（读者原话：切换顶部方案按钮，地图路线没变化）。
     另外 roads.js 的 src=kml 路段与 tracks.js 是同一批原始实录，重复落笔会叠出两层线。 */
  const TRACK_PLACES = {
    '2025-04-21-103139': ['hemu_village', 'xiaoshike_meilifeng'],
    '阿勒泰布尔津县-穿越-贾登峪-布奴阿拉安': ['jiadengyu', 'bulaan'],
    '2026-06-23-091425-喀纳斯三湾': ['shenxian_bay', 'wolong_bay'],
    '喀纳斯吐鲁克岩画往返': ['kanas_lakeside', 'yaze_lake', 'turuk_rockart'],
    '大美新疆白哈巴穿越到喀纳斯': ['baihaba', 'kanas_hub'],
    '阿勒泰市-阿禾公路-禾木村': ['ahe_road'],
    '2025-02-25-145544': ['hemu_village'],
    '2026-07-17-白哈巴-喀纳斯': ['baihaba', 'kanas_hub'],
  };
  /* 同走廊判定：实录与真实路段常常是同一条路的两份几何（点数、采样都不同），
     只比端点就会漏，所以判断"两端都贴着这条折线、这条折线两端也贴着实录"。
     命中就说明是一段路的两份画法，只画一份，避免叠成两层线、里程还被算两遍。 */
  const NEAR_KM = 0.4;
  function nearLine(line, p) {
    for (let i = 0; i < line.length; i++) {
      const dy = (line[i][0] - p[0]) * 111.2, dx = (line[i][1] - p[1]) * 73.4;
      if (Math.sqrt(dx * dx + dy * dy) <= NEAR_KM) return true;
    }
    return false;
  }
  function sameCorridor(pts, line) {
    if (!pts || pts.length < 2 || !line || line.length < 2) return false;
    if (!nearLine(line, pts[0]) || !nearLine(line, pts[pts.length - 1])) return false;
    return nearLine(pts, line[0]) && nearLine(pts, line[line.length - 1]);
  }
  /* 这一段本身就是"导航线"（tracks 注册表里 is_nav_line），和 roads.js 的 L3
     区间车路段是同一条路：不采用实录，直接由 L3 落笔，避免同路两条线叠着走。 */
  const TRACK_DROP = { '阿勒泰布尔津县-穿越-贾登峪-布奴阿拉安': 1 };
  /* 「不采用」的实录任何方案都不画 */
  function trackAllowed(plan, did, t) {
    if (TRACK_DROP[t.id]) return false;
    if (/不采用/.test(String(t.status || ''))) return false;
    const ids = (plan.day_places || {})[did] || [];
    const need = TRACK_PLACES[t.id];
    /* 锚点是“这条轨迹的落点属于这一天”：命中任意一个即可（阿禾公路全天都在路上，
       轨迹终点是禾木，但备选B 只到贾登峪，用单一终点判定会把它整条丢掉）。 */
    return need ? need.some(id => ids.indexOf(id) >= 0) : false;
  }
  function planLegsRaw(planIds, scope, dayId) {
    const out = [];
    (planIds || []).forEach(planId => {
      const plan = window.TRIP ? TRIP.plans.filter(x => x.id === planId)[0] : null;
      if (!plan || !plan.day_places) return;
      Object.keys(plan.day_places).sort().forEach(did => {
        if (dayId && did !== dayId) return;
        const d = DAY_OF[did];
        R.legs.forEach(l => {
          if (l.day !== d) return;
          if (scope === 'core' && CORRIDOR_LEG[l.id]) return;
          if (!legAllowed(plan, did, l)) return;
          out.push({ plan: planId, day: did, dayLabel: l.day, mode: l.mode, src: l.src,
                     name: l.name, points: l.points, id: l.id, km: l.km });
        });
        (window.TRACKS ? TRACKS.tracks : []).forEach(t => {
          if (!trackAllowed(plan, did, t)) return;
          /* 同一天已有这份真实路段，就不再叠同一段实录 */
          /* 与实录同源的 roads.js 路段（src=kml）本身就是这份 KML 重采样出来的，
            不能拿它当重复依据，否则实录会被自己的副本挤掉。 */
          if (R.legs.some(l => l.day === d && l.src !== 'kml' && sameCorridor(t.points, l.points))) return;
          const ad = t.adopted_points && t.adopted_points.length;
          if (String(t.day || '').indexOf(d) === 0 && t.points && t.points.length > 1
              && (ad || modeOf(t.kind, t.name) !== 'hike'))
            out.push({ plan: planId, day: did, dayLabel: d, mode: modeOf(t.kind, t.name), src: 'kml', name: t.name,
                       points: ad ? t.adopted_points : t.points, id: t.id,
                       km: (function () {
                         const k = parseFloat(String(t.adopted_km == null ? '' : t.adopted_km).replace(/[^0-9.]/g, ''));
                         return isFinite(k) ? k : t.distance;
                       })(),
                       gain: t.gain, loss: t.loss, elevation: t.elevation,
                       adoptedNote: t.adopted_note, fullKm: t.distance });
        });
      });
    });
    return out;
  }
  /* 某方案某天的全部线：先放当天真实腿（导航/OSM）与 KML 徒步，再按图例开关过滤 */
  function planLegs(planId, scope) {
    return planLegsRaw([planId], scope, null).filter(l => !hidden(l));
  }
  /* 选中某一天时用的腿：真实道路几何优先，同样尊重图例开关 */
  function dayLegs(dayId, scope) {
    const d = DAY_OF[dayId];
    return R.legs.filter(l => l.day === d && !(scope === 'core' && CORRIDOR_LEG[l.id]))
      .filter(l => !hidden(l));
  }
  const visible = p => !(window.HIDE && window.HIDE.stay && p.kind === 'stay');
  return { legsFor: legsFor, planLegs: planLegs, planLegsRaw: planLegsRaw, dayLegs: dayLegs, visible: visible,
           trackAllowed: trackAllowed, sameCorridor: sameCorridor,
           legLabel: legLabel, CAMP_IDS: CAMP_IDS, PLAN_COLOR: PLAN_COLOR, PLAN_NAME: PLAN_NAME, pinHTML: pinHTML, drawSVG: drawSVG, labelAttrs: labelAttrs, modeOf: modeOf,
           STYLE: STYLE, raw: R };
})();
