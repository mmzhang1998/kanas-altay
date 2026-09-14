/* GeoMap：地图"怎么画"的唯一实现。
   几何来源：dist/data/roads.js（OpenStreetMap 真实路网路由 + 水体多边形）＋ tracks.js（两步路 KML 实录）。
   没有真实几何的接驳段画成细点线并标"接驳示意"，绝不把直线当道路（需求基线 R05）。
   本文件不产生任何事实：颜色、线型、标记样式都在这里，数据一律外部传入。 */
window.GeoMap = (function () {
  const R = window.ROADS || { water: [], ctx: [], legs: [] };
  const STYLE = {
    drive:   { color: '#b0742c', width: 3.6, dash: null,  label: '包车／拼车（真实道路）' },
    shuttle: { color: '#2e7f6e', width: 3.0, dash: null,  label: '景区区间车／摆渡（真实道路）' },
    hike:    { color: '#4f8f5b', width: 3.0, dash: '0.1 7', label: '徒步（两步路实录）' },
    stub:    { color: '#9aa79f', width: 1.6, dash: '2 6', label: '接驳示意（无公开路网）' },
    schem:   { color: '#8a948d', width: 2.4, dash: '7 8', label: '走向示意（该路未收录于公开路网）' },
    ctx:     { color: '#ffffff', width: 2.0, dash: null },
    ghost:   { color: '#c9c4b8', width: 1.6, dash: null },
  };
  /* 交通方式判定：阿禾公路、铁贾公路、白哈巴通行线都是车行，绝不能被画成徒步。
     kind 优先；kind 缺失时回退到名称里的关键词。 */
  function modeOf(kind, name) {
    const k = String(kind || '') + ' ' + String(name || '');
    if (/区间|摆渡|shuttle/.test(k)) return 'shuttle';
    if (/徒步|hike|穿越|岩画|实录/.test(k)) return 'hike';
    if (/行车|公路|通行|导航线|drive|包车|自驾/.test(k)) return 'drive';
    return 'hike';
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
    svg.append(mk('rect', { width: 1000, height: 600, class: 'gm-bg' }));

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
    const line = (pts, st, cls, tip) => {
      if (!pts || pts.length < 2) return;
      const d = 'M' + pts.map(p => at(p).map(x => x.toFixed(1)).join(' ')).join('L');
      svg.append(mk('path', { d: d, class: 'gm-casing ' + (cls || '') }));
      const e = mk('path', { d: d, class: 'gm-line route-line ' + (cls || '').replace(/^leg-/, ''),
        stroke: st.color, 'stroke-width': st.width, 'stroke-dasharray': st.dash || 'none' });
      if (tip) { const t = mk('title', {}); t.textContent = tip; e.append(t); }
      e.style.cursor = 'pointer';
      e.addEventListener('click', () => { if (window.__openLeg) window.__openLeg(l); });
      svg.append(e);
    };
    legs.forEach(l => {
      if (!l.points.length) return;
      const st2 = l.src === 'schematic' ? STYLE.schem
        : (v.colorByPlan ? { color: PLAN_COLOR[l.plan] || STYLE.drive.color, width: 3.2, dash: null } : STYLE[l.mode]);
      line(l.points, st2, 'leg-' + (l.src === 'schematic' ? 'schem' : l.mode),
           l.name + (l.src === 'schematic' ? ' · 走向示意' : (l.km ? ' · ' + l.km + ' km' : '')));

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
      const g = (t.adopted_points && t.adopted_points.length) ? t.adopted_points : t.points;
      const m = modeOf(t.kind, t.name);
      const isHike = m === 'hike';
      if ((t.adopted_points || []).length && t.points && t.points.length > 1)
        line(t.points, STYLE.ghost, 'ghost', null);
      line(g, STYLE[m] || STYLE.drive, 'leg-' + m,
           t.name + ' · ' + (t.distance || '') + ' km');
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
  function returnStub(planId) {
    const j = placeOf('jiadengyu');
    if (!j || !j.coord) return null;
    return { plan: planId, day: '1001', mode: 'drive', src: 'schematic', km: 228,
             name: '10/1 贾登峪 → 阿勒泰站',
             points: [j.coord, [j.coord[0] - 0.22, j.coord[1] + 0.30]] };
  }
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
          out.push({ plan: planId, day: did, dayLabel: l.day, mode: l.mode, src: l.src,
                     name: l.name, points: l.points, id: l.id, km: l.km });
        });
        (window.TRACKS ? TRACKS.tracks : []).forEach(t => {
          const ad = t.adopted_points && t.adopted_points.length;
          if (String(t.day || '').indexOf(d) === 0 && t.points && t.points.length > 1
              && (ad || modeOf(t.kind, t.name) !== 'hike'))
            out.push({ plan: planId, day: did, dayLabel: d, mode: modeOf(t.kind, t.name), src: 'kml', name: t.name,
                       points: ad ? t.adopted_points : t.points, id: t.id, km: t.distance });
        });
      });
      if (scope === 'core' && (!dayId || dayId === '1001')) {
        const rs = returnStub(planId); if (rs) out.push(rs);
      }
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
           legLabel: legLabel, CAMP_IDS: CAMP_IDS, PLAN_COLOR: PLAN_COLOR, PLAN_NAME: PLAN_NAME, pinHTML: pinHTML, drawSVG: drawSVG, labelAttrs: labelAttrs, modeOf: modeOf,
           STYLE: STYLE, raw: R };
})();
