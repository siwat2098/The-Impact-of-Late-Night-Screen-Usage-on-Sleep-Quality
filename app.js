/* The Impact of Late-Night Screen Usage on Sleep Quality — D3.js dashboard */
(() => {
  'use strict';

  const CSV_FILE = 'Social_media_impact_on_life.csv';
  const COLOR = { late: '#a78bfa', day: '#5eead4' };
  const DEVICE_COLOR = { 'Smartphone': '#a78bfa', 'Tablet': '#f9a8d4', 'Laptop/PC': '#5eead4' };
  const LATE_LABEL = { true: 'ใช้หน้าจอตอนกลางคืน', false: 'ไม่ใช้หน้าจอตอนกลางคืน' };
  const DUR = 650;
  const fmt1 = d3.format('.1f'), fmt2 = d3.format('.2f'), fmtInt = d3.format(',');

  let ALL = [];
  let TOTAL = 0;
  const state = { gender: 'all', device: 'all', age: 'all', maxUsage: 14, late: null };
  const charts = [];

  /* ---------- helpers ---------- */
  const ageGroup = a => (a <= 17 ? '15–17' : a <= 20 ? '18–20' : '21+');
  const mean = (a, f) => (a.length ? d3.mean(a, f) : NaN);

  function filterRows(skip) {
    return ALL.filter(d =>
      (state.gender === 'all' || d.Gender === state.gender) &&
      (skip === 'device' || state.device === 'all' || d.Device_Type === state.device) &&
      (state.age === 'all' || d.ageGroup === state.age) &&
      d.Daily_Usage_Hours <= state.maxUsage &&
      (skip === 'late' || state.late === null || d.Late_Night_Usage === state.late)
    );
  }

  function linreg(rows, xf, yf) {
    const n = rows.length;
    if (n < 8) return null;
    const mx = d3.mean(rows, xf), my = d3.mean(rows, yf);
    let sxx = 0, sxy = 0, syy = 0;
    rows.forEach(d => { const dx = xf(d) - mx, dy = yf(d) - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; });
    if (!sxx || !syy) return null;
    const slope = sxy / sxx;
    return { slope, intercept: my - slope * mx, r: sxy / Math.sqrt(sxx * syy), n };
  }
  const strength = r => { const a = Math.abs(r); return a < .1 ? 'แทบไม่มี' : a < .3 ? 'อ่อน' : a < .5 ? 'ปานกลาง' : 'ค่อนข้างแรง'; };

  /* ---------- tooltip ---------- */
  const tip = d3.select('#tooltip');
  function showTip(html, ev) { tip.html(html).classed('show', true); moveTip(ev); }
  function moveTip(ev) {
    const node = tip.node(), w = node.offsetWidth, h = node.offsetHeight;
    let x = ev.clientX + 16, y = ev.clientY + 16;
    if (x + w > innerWidth - 8) x = ev.clientX - w - 16;
    if (y + h > innerHeight - 8) y = ev.clientY - h - 16;
    tip.style('left', x + 'px').style('top', y + 'px');
  }
  const hideTip = () => tip.classed('show', false);

  /* ---------- svg scaffold ---------- */
  function scaffold(sel, margin) {
    const host = d3.select(sel);
    host.selectAll('*').remove();
    const W = host.node().clientWidth, H = host.node().clientHeight;
    const svg = host.append('svg').attr('width', W).attr('height', H).attr('viewBox', `0 0 ${W} ${H}`);
    const g = svg.append('g').attr('transform', `translate(${margin.l},${margin.t})`);
    return { svg, g, w: W - margin.l - margin.r, h: H - margin.t - margin.b, margin };
  }

  /* ---------- pie chart (with clickable legend) ---------- */
  function pieChart(sel, cfg) {
    const m = { t: 8, r: 8, b: 8, l: 8 };
    let S, R, cx, cy, arc, labelArc, slices, legend, lx;

    function build() {
      S = scaffold(sel, m);
      R = Math.max(60, Math.min(S.h / 2 - 8, S.w * 0.3));
      cx = S.w > 560 ? S.w * 0.3 : R + 4;
      cy = S.h / 2;
      arc = d3.arc().innerRadius(0).outerRadius(R);
      labelArc = d3.arc().innerRadius(R * 0.62).outerRadius(R * 0.62);
      slices = S.g.append('g').attr('transform', `translate(${cx},${cy})`);
      lx = cx + R + (S.w > 560 ? S.w * 0.12 : 24);
      legend = S.g.append('g').attr('transform', `translate(${lx},${cy - cfg.groups.length * 25})`);
      S.g.append('text').attr('class', 'leg-sub').attr('x', lx).attr('y', cy + cfg.groups.length * 25 + 24).text('คลิกชิ้นพาย/รายการเพื่อเลือกกลุ่ม');
    }

    function update(rows) {
      const stats = cfg.groups.map(g => ({ ...g, n: rows.filter(d => cfg.getKey(d) === g.key).length }));
      const total = d3.sum(stats, d => d.n);
      stats.forEach(d => (d.pct = total ? d.n / total * 100 : 0));
      const pie = d3.pie().sort(null).value(d => d.n)(stats);
      const sel = cfg.selected();
      const dim = d => sel !== null && sel !== d.data.key;

      const sl = slices.selectAll('g.slice').data(pie, d => d.data.key).join(en => {
        const g = en.append('g').attr('class', 'slice');
        g.append('path').attr('fill', d => d.data.color);
        g.append('text').attr('class', 'pct');
        return g;
      });
      sl.select('path')
        .on('click', (e, d) => cfg.onClick(d.data.key))
        .on('mouseenter mousemove', (e, d) => showTip(
          `<b>${d.data.label}</b>${fmtInt(d.data.n)} คน<br><span>${fmt1(d.data.pct)}% ของทั้งหมดที่กรอง</span><br><span>คลิกเพื่อเลือก/ยกเลิก</span>`, e))
        .on('mouseleave', hideTip)
        .transition().duration(DUR).ease(d3.easeCubicOut)
        .attr('opacity', d => (dim(d) ? .35 : 1))
        .attrTween('d', function (d) {
          const from = this._c || { startAngle: d.startAngle, endAngle: d.startAngle };
          const i = d3.interpolate(from, d); this._c = d;
          return t => arc(i(t));
        });
      sl.select('text.pct')
        .transition().duration(DUR).ease(d3.easeCubicOut)
        .attr('opacity', d => (d.data.pct < 4 ? 0 : dim(d) ? .4 : 1))
        .attrTween('transform', function (d) {
          const from = this._c || { startAngle: d.startAngle, endAngle: d.startAngle };
          const i = d3.interpolate(from, d); this._c = d;
          return t => `translate(${labelArc.centroid(i(t))})`;
        })
        .tween('text', function (d) {
          const el = d3.select(this), i = d3.interpolateNumber(this._v || 0, d.data.pct); this._v = d.data.pct;
          return t => el.text(fmt1(i(t)) + '%');
        });
      // explode the selected slice
      sl.transition().duration(350).attr('transform', d => {
        if (sel !== d.data.key || !d.data.n) return 'translate(0,0)';
        const a = (d.startAngle + d.endAngle) / 2 - Math.PI / 2;
        return `translate(${Math.cos(a) * 12},${Math.sin(a) * 12})`;
      });

      // legend
      const rowsSel = legend.selectAll('g.leg-row').data(stats, d => d.key).join(en => {
        const g = en.append('g').attr('class', 'leg-row').attr('transform', (d, i) => `translate(0,${i * 50})`);
        g.append('rect').attr('width', 14).attr('height', 14).attr('rx', 4).attr('y', -11).attr('fill', d => d.color);
        g.append('text').attr('class', 'leg-name').attr('x', 24).text(d => d.label);
        g.append('text').attr('class', 'leg-sub').attr('x', 24).attr('y', 18).attr('data-sub', 1);
        return g;
      });
      rowsSel.on('click', (e, d) => cfg.onClick(d.key)).transition().duration(300).attr('opacity', d => (sel !== null && sel !== d.key ? .4 : 1));
      rowsSel.select('[data-sub]').text(d => `${fmtInt(d.n)} คน · ${fmt1(d.pct)}%`);
      return stats;
    }
    return { build, update };
  }

  /* ---------- bar chart ---------- */
  function barChart(sel, cfg) {
    const m = { t: 34, r: 20, b: 52, l: 52 };
    let S, x, y, bars, labels, cats;

    function build() {
      S = scaffold(sel, m);
      x = d3.scaleBand().domain(cfg.groups.map(d => String(d.key))).range([0, S.w]).padding(.38);
      y = d3.scaleLinear().domain(cfg.domain).range([S.h, 0]);
      S.g.append('g').attr('class', 'grid-line').call(d3.axisLeft(y).ticks(5).tickSize(-S.w).tickFormat(''));
      S.g.append('g').attr('class', 'axis').call(d3.axisLeft(y).ticks(5));
      S.g.append('text').attr('class', 'axis-title').attr('transform', 'rotate(-90)')
        .attr('x', -S.h / 2).attr('y', -38).attr('text-anchor', 'middle').text(cfg.yLabel);
      bars = S.g.append('g');
      labels = S.g.append('g');
      cats = S.g.append('g').attr('transform', `translate(0,${S.h + 22})`);
      cats.selectAll('text').data(cfg.groups).join('text').attr('class', 'cat-label')
        .attr('x', d => x(String(d.key)) + x.bandwidth() / 2).text(d => d.label)
        .on('click', (e, d) => cfg.onClick(d.key));
    }

    function update(rows) {
      const stats = cfg.groups.map(gr => {
        const sub = rows.filter(d => cfg.getKey(d) === gr.key);
        return { ...gr, n: sub.length, mean: mean(sub, cfg.value), sd: sub.length > 1 ? d3.deviation(sub, cfg.value) : NaN };
      });
      const sel = cfg.selected();
      const dim = d => sel !== null && sel !== d.key;

      bars.selectAll('rect').data(stats, d => d.key).join(
        en => en.append('rect').attr('class', 'bar').attr('rx', 10)
          .attr('x', d => x(String(d.key))).attr('width', x.bandwidth()).attr('y', S.h).attr('height', 0)
      )
        .on('click', (e, d) => cfg.onClick(d.key))
        .on('mouseenter mousemove', (e, d) => showTip(
          `<b>${d.label}</b>${cfg.valueName}: <b style="display:inline">${isNaN(d.mean) ? '–' : fmt2(d.mean)}</b><br>
           <span>จำนวน: ${fmtInt(d.n)} คน · SD ${isNaN(d.sd) ? '–' : fmt2(d.sd)}</span><br><span>คลิกเพื่อเลือก/ยกเลิก</span>`, e))
        .on('mouseleave', hideTip)
        .attr('fill', d => d.color)
        .transition().duration(DUR).ease(d3.easeCubicOut)
        .attr('x', d => x(String(d.key))).attr('width', x.bandwidth())
        .attr('y', d => (isNaN(d.mean) ? S.h : y(d.mean)))
        .attr('height', d => (isNaN(d.mean) ? 0 : S.h - y(d.mean)))
        .attr('opacity', d => (dim(d) ? .3 : 1))
        .attr('stroke', d => (sel === d.key ? '#fff' : 'none')).attr('stroke-width', 2.5);

      labels.selectAll('text').data(stats, d => d.key).join('text').attr('class', 'bar-label')
        .attr('x', d => x(String(d.key)) + x.bandwidth() / 2)
        .transition().duration(DUR).ease(d3.easeCubicOut)
        .attr('y', d => (isNaN(d.mean) ? S.h - 8 : y(d.mean) - 9))
        .attr('opacity', d => (dim(d) ? .35 : 1))
        .tween('text', function (d) {
          const el = d3.select(this), to = isNaN(d.mean) ? 0 : d.mean;
          const i = d3.interpolateNumber(this._v || 0, to); this._v = to;
          return t => el.text(isNaN(d.mean) ? '–' : fmt2(i(t)));
        });
      cats.selectAll('text').transition().duration(300).attr('opacity', d => (dim(d) ? .45 : 1));
      return stats;
    }
    return { build, update };
  }

  /* ---------- line chart: usage hours (1-hour bins) -> avg sleep duration ---------- */
  function lineChart(sel) {
    const m = { t: 22, r: 22, b: 54, l: 56 };
    const MIN_N = 8, BINS = d3.range(1, 15);
    let S, x, y, area, line, path, band, dots, guide, prev = null, bins = [];

    function build() {
      S = scaffold(sel, m);
      prev = null;
      x = d3.scaleLinear().domain([1, 15]).range([0, S.w]);
      y = d3.scaleLinear().domain([3, 9]).range([S.h, 0]);
      S.g.append('g').attr('class', 'grid-line').call(d3.axisLeft(y).ticks(6).tickSize(-S.w).tickFormat(''));
      S.g.append('g').attr('class', 'axis').attr('transform', `translate(0,${S.h})`).call(d3.axisBottom(x).ticks(7));
      S.g.append('g').attr('class', 'axis').call(d3.axisLeft(y).ticks(6));
      S.g.append('text').attr('class', 'axis-title').attr('x', S.w / 2).attr('y', S.h + 42).attr('text-anchor', 'middle').text('Daily Usage Hours (ชั่วโมงต่อวัน)');
      S.g.append('text').attr('class', 'axis-title').attr('transform', 'rotate(-90)').attr('x', -S.h / 2).attr('y', -40).attr('text-anchor', 'middle').text('ค่าเฉลี่ยชั่วโมงนอน');
      band = S.g.append('path').attr('class', 'band');
      path = S.g.append('path').attr('class', 'line-path');
      guide = S.g.append('line').attr('class', 'guide').attr('y1', 0).attr('y2', S.h).attr('opacity', 0);
      dots = S.g.append('g');
      S.g.append('rect').attr('width', S.w).attr('height', S.h).attr('fill', 'transparent')
        .on('mousemove', ev => {
          const [mx] = d3.pointer(ev);
          const ok = bins.filter(b => b.ok);
          if (!ok.length) return;
          const b = d3.least(ok, d => Math.abs(x(d.c) - mx));
          guide.attr('x1', x(b.c)).attr('x2', x(b.c)).attr('opacity', 1);
          dots.selectAll('circle').attr('r', d => (d.i === b.i ? 7 : 5));
          showTip(`<b>ใช้งาน ${b.x0}–${b.x0 + 1} ชม./วัน</b>นอนเฉลี่ย <b style="display:inline">${fmt2(b.mean)}</b> ชม.<br>
            <span>95% CI: ${fmt2(b.lo)}–${fmt2(b.hi)} · n = ${fmtInt(b.n)}</span>`, ev);
        })
        .on('mouseleave', () => { guide.attr('opacity', 0); dots.selectAll('circle').attr('r', 5); hideTip(); });
    }

    function update(rows) {
      bins = BINS.map(x0 => {
        const sub = rows.filter(d => Math.floor(d.Daily_Usage_Hours) === x0);
        const n = sub.length, mu = mean(sub, d => d.Sleep_Duration_Hours);
        const se = n > 1 ? d3.deviation(sub, d => d.Sleep_Duration_Hours) / Math.sqrt(n) : NaN;
        return { i: x0, x0, c: x0 + .5, n, mean: mu, lo: mu - 1.96 * se, hi: mu + 1.96 * se, ok: n >= MIN_N };
      });
      const cur = bins.map(b => (b.ok ? { m: b.mean, lo: b.lo, hi: b.hi } : null));
      const old = prev || cur;
      const mix = (a, b, t, k) => (a && b ? a[k] + (b[k] - a[k]) * t : b ? b[k] : null);
      const lineGen = d3.line().curve(d3.curveMonotoneX).defined(d => d.y != null).x(d => d.x).y(d => d.y);
      const areaGen = d3.area().curve(d3.curveMonotoneX).defined(d => d.y0 != null).x(d => d.x).y0(d => d.y0).y1(d => d.y1);

      const pts = t => bins.map((b, i) => {
        const v = mix(old[i], cur[i], t, 'm');
        return { x: x(b.c), y: v == null ? null : y(v) };
      });
      const bnd = t => bins.map((b, i) => {
        const lo = mix(old[i], cur[i], t, 'lo'), hi = mix(old[i], cur[i], t, 'hi');
        return { x: x(b.c), y0: lo == null || isNaN(lo) ? null : y(Math.max(3, lo)), y1: hi == null || isNaN(hi) ? null : y(Math.min(9, hi)) };
      });
      path.transition().duration(DUR).ease(d3.easeCubicOut).attrTween('d', () => t => lineGen(pts(t)) || '');
      band.transition().duration(DUR).ease(d3.easeCubicOut).attrTween('d', () => t => areaGen(bnd(t)) || '');
      prev = cur;

      dots.selectAll('circle').data(bins.filter(b => b.ok), d => d.i).join(
        en => en.append('circle').attr('class', 'pt').attr('r', 5).attr('cx', d => x(d.c)).attr('cy', d => y(d.mean)).attr('opacity', 0),
        up => up,
        ex => ex.transition().duration(250).attr('opacity', 0).remove()
      ).transition().duration(DUR).ease(d3.easeCubicOut).attr('cx', d => x(d.c)).attr('cy', d => y(d.mean)).attr('opacity', 1);
      return bins;
    }
    return { build, update };
  }

  /* ---------- scatter plot: usage hours -> sleep quality ---------- */
  function scatter(sel) {
    const m = { t: 38, r: 22, b: 54, l: 56 };
    let S, x, y, dots, lines, rendered = false;
    const yv = d => d.Sleep_Quality_Score + d.jitter;

    function build() {
      S = scaffold(sel, m);
      rendered = false;
      x = d3.scaleLinear().domain([0, 14.5]).range([0, S.w]);
      y = d3.scaleLinear().domain([0.4, 5.6]).range([S.h, 0]);
      S.g.append('g').attr('class', 'grid-line').call(d3.axisLeft(y).tickValues([1, 2, 3, 4, 5]).tickSize(-S.w).tickFormat(''));
      S.g.append('g').attr('class', 'axis').attr('transform', `translate(0,${S.h})`).call(d3.axisBottom(x).ticks(8));
      S.g.append('g').attr('class', 'axis').call(d3.axisLeft(y).tickValues([1, 2, 3, 4, 5]));
      S.g.append('text').attr('class', 'axis-title').attr('x', S.w / 2).attr('y', S.h + 42).attr('text-anchor', 'middle').text('Daily Usage Hours (ชั่วโมงต่อวัน)');
      S.g.append('text').attr('class', 'axis-title').attr('transform', 'rotate(-90)').attr('x', -S.h / 2).attr('y', -40).attr('text-anchor', 'middle').text('Sleep Quality Score (1–5)');
      dots = S.g.append('g');
      lines = S.g.append('g');
      const lg = S.g.append('g').attr('class', 'legend').attr('transform', `translate(${Math.max(0, S.w - 300)},-22)`);
      [[true, COLOR.late, 'ใช้ตอนกลางคืน'], [false, COLOR.day, 'ไม่ใช้']].forEach(([k, c, t], i) => {
        const it = lg.append('g').attr('transform', `translate(${i * 150},0)`).style('cursor', 'pointer').on('click', () => toggleLate(k));
        it.append('circle').attr('r', 5).attr('fill', c).attr('cy', -4);
        it.append('text').attr('x', 12).text(t);
      });
    }

    function update(rows) {
      dots.selectAll('circle').data(rows, d => d.id).join(
        en => en.append('circle').attr('class', 'dot')
          .attr('cx', d => x(d.Daily_Usage_Hours)).attr('cy', d => y(yv(d))).attr('r', 0).attr('opacity', 0)
          .on('mouseenter mousemove', (e, d) => {
            d3.select(e.currentTarget).raise().attr('r', 6).attr('stroke', '#fff').attr('stroke-width', 1.5);
            showTip(`<b>${d.Late_Night_Usage ? '🌙 ใช้หน้าจอตอนกลางคืน' : '☀️ ไม่ใช้ตอนกลางคืน'}</b>
              ใช้งาน ${fmt1(d.Daily_Usage_Hours)} ชม./วัน<br>นอน ${fmt1(d.Sleep_Duration_Hours)} ชม. · คุณภาพ ${d.Sleep_Quality_Score}/5<br>
              <span>${d.Gender} · ${d.Age} ปี · ${d.Device_Type}</span>`, e);
          })
          .on('mouseleave', e => { d3.select(e.currentTarget).attr('r', 2.8).attr('stroke', 'none'); hideTip(); }),
        up => up,
        ex => ex.transition().duration(350).attr('r', 0).attr('opacity', 0).remove()
      )
        .attr('fill', d => (d.Late_Night_Usage ? COLOR.late : COLOR.day))
        .transition().duration(rendered ? DUR : 900).delay(rendered ? 0 : (d, i) => (i % 60) * 8)
        .attr('cx', d => x(d.Daily_Usage_Hours)).attr('cy', d => y(yv(d)))
        .attr('r', 2.8).attr('opacity', .42);
      rendered = true;

      const groups = [true, false].map(k => {
        const sub = rows.filter(d => d.Late_Night_Usage === k);
        return { k, sub, reg: linreg(sub, d => d.Daily_Usage_Hours, d => d.Sleep_Quality_Score) };
      }).filter(d => d.reg);
      const ends = d => { const a = d3.min(d.sub, r => r.Daily_Usage_Hours), b = d3.max(d.sub, r => r.Daily_Usage_Hours); return [a, b]; };
      lines.selectAll('line').data(groups, d => d.k).join(
        en => en.append('line').attr('class', 'trend').attr('stroke', d => (d.k ? '#c4b5fd' : '#99f6e4'))
          .attr('x1', d => x(ends(d)[0])).attr('x2', d => x(ends(d)[0]))
          .attr('y1', d => y(d.reg.intercept + d.reg.slope * ends(d)[0])).attr('y2', d => y(d.reg.intercept + d.reg.slope * ends(d)[0])),
        up => up,
        ex => ex.transition().duration(300).attr('opacity', 0).remove()
      ).transition().duration(DUR)
        .attr('x1', d => x(ends(d)[0])).attr('x2', d => x(ends(d)[1]))
        .attr('y1', d => y(d.reg.intercept + d.reg.slope * ends(d)[0])).attr('y2', d => y(d.reg.intercept + d.reg.slope * ends(d)[1]));
    }
    return { build, update };
  }

  /* ---------- interactions ---------- */
  function toggleLate(k) { state.late = state.late === k ? null : k; syncControls(); render(); }
  function toggleDevice(k) { state.device = state.device === k ? 'all' : k; syncControls(); render(); }

  /* ---------- chart definitions ---------- */
  const lateGroups = [
    { key: true, label: LATE_LABEL.true, color: COLOR.late },
    { key: false, label: LATE_LABEL.false, color: COLOR.day }
  ];
  const c1 = pieChart('#chart1', { groups: lateGroups, getKey: d => d.Late_Night_Usage, selected: () => state.late, onClick: toggleLate });
  const c2 = barChart('#chart2', {
    groups: lateGroups, getKey: d => d.Late_Night_Usage, value: d => d.Sleep_Quality_Score,
    domain: [0, 5], yLabel: 'ค่าเฉลี่ย Sleep Quality (1–5)', valueName: 'Sleep Quality เฉลี่ย',
    selected: () => state.late, onClick: toggleLate
  });
  const c3 = lineChart('#chart3');
  const c4 = scatter('#chart4');
  const c5 = pieChart('#chart5', {
    groups: ['Smartphone', 'Tablet', 'Laptop/PC'].map(k => ({ key: k, label: k === 'Laptop/PC' ? 'Laptop / PC' : k, color: DEVICE_COLOR[k] })),
    getKey: d => d.Device_Type, selected: () => (state.device === 'all' ? null : state.device), onClick: toggleDevice
  });
  charts.push(c1, c2, c3, c4, c5);

  /* ---------- KPI + insights ---------- */
  function setKpi(id, value, formatter) {
    const el = d3.select(id);
    const from = +el.property('_v') || 0, to = isNaN(value) ? 0 : value;
    el.property('_v', to);
    el.transition().duration(DUR).tween('text', () => { const i = d3.interpolateNumber(from, to); return t => el.text(isNaN(value) ? '–' : formatter(i(t))); });
  }
  const set = (id, html) => { document.getElementById(id).innerHTML = html; };

  function renderKpis(rows) {
    const n = rows.length, late = rows.filter(d => d.Late_Night_Usage).length;
    setKpi('#kpiTotal', n, fmtInt);
    set('kpiTotalNote', n === TOTAL ? 'นักเรียนนักศึกษาทั้งหมด' : `จากทั้งหมด ${fmtInt(TOTAL)} คน`);
    setKpi('#kpiLate', n ? late / n * 100 : NaN, v => fmt1(v) + '%');
    set('kpiLateNote', `${fmtInt(late)} จาก ${fmtInt(n)} คน`);
    setKpi('#kpiDur', mean(rows, d => d.Sleep_Duration_Hours), v => fmt2(v) + ' ชม.');
    setKpi('#kpiQual', mean(rows, d => d.Sleep_Quality_Score), v => fmt2(v) + ' / 5');
  }

  function scatterText(rows) {
    const reg = linreg(rows, d => d.Daily_Usage_Hours, d => d.Sleep_Quality_Score);
    if (!reg) return 'ข้อมูลไม่เพียงพอสำหรับคำนวณแนวโน้ม';
    const dir = reg.slope < 0 ? 'ลดลง' : 'เพิ่มขึ้น';
    return `สหสัมพันธ์ r = <b>${fmt2(reg.r)}</b> (${strength(reg.r)}) — ทุก 1 ชม. ที่ใช้งานเพิ่มขึ้น คะแนนคุณภาพการนอนโดยเฉลี่ย<b>${dir} ${fmt2(Math.abs(reg.slope))}</b> คะแนน · ความสัมพันธ์ไม่ได้พิสูจน์เหตุและผล`;
  }

  /* ---------- render ---------- */
  function render() {
    const rows = filterRows();
    renderKpis(rows);

    const s1 = c1.update(filterRows('late'));
    const late = s1.find(d => d.key === true);
    set('ins1', late && (s1[0].n + s1[1].n)
      ? `<b>${fmt1(late.pct)}%</b> (${fmtInt(late.n)} คน) ใช้หน้าจอตอนกลางคืน เทียบกับ ${fmt1(100 - late.pct)}% ที่ไม่ใช้`
      : 'ไม่มีข้อมูลภายใต้ตัวกรองนี้');

    const s2 = c2.update(filterRows('late'));
    const a = s2.find(d => d.key === true), b = s2.find(d => d.key === false);
    set('ins2', a && b && !isNaN(a.mean) && !isNaN(b.mean)
      ? `กลุ่มที่ใช้หน้าจอตอนกลางคืนมีคะแนนเฉลี่ย <b>${fmt2(a.mean)}</b> ${a.mean < b.mean ? 'ต่ำกว่า' : 'สูงกว่า'}กลุ่มที่ไม่ใช้ (<b>${fmt2(b.mean)}</b>) อยู่ ${fmt2(Math.abs(a.mean - b.mean))} คะแนน (~${fmt1(Math.abs((a.mean - b.mean) / b.mean * 100))}%)`
      : 'ไม่มีข้อมูลเพียงพอสำหรับเปรียบเทียบสองกลุ่มภายใต้ตัวกรองนี้');

    const bins = c3.update(rows).filter(d => d.ok);
    const reg = linreg(rows, d => d.Daily_Usage_Hours, d => d.Sleep_Duration_Hours);
    if (bins.length > 1 && reg) {
      const f = bins[0], l = bins.at(-1);
      set('ins3', `จากช่วงใช้งาน ${f.x0} ชม. ถึง ${l.x0} ชม. ชั่วโมงนอนเฉลี่ย${l.mean < f.mean ? 'ลดลง' : 'เพิ่มขึ้น'}จาก <b>${fmt2(f.mean)}</b> เป็น <b>${fmt2(l.mean)}</b> ชม. · r = <b>${fmt2(reg.r)}</b> (${strength(reg.r)})`);
    } else set('ins3', 'ข้อมูลไม่เพียงพอสำหรับแสดงแนวโน้ม');

    c4.update(rows);
    set('ins4', scatterText(rows));

    const s5 = c5.update(filterRows('device')).filter(d => d.n > 0).sort((p, q) => q.n - p.n);
    set('ins5', s5.length
      ? `<b>${s5[0].label}</b> เป็นอุปกรณ์ที่ใช้มากที่สุด (${fmt1(s5[0].pct)}%)${s5.length > 1 ? ` ส่วน <b>${s5.at(-1).label}</b> น้อยที่สุด (${fmt1(s5.at(-1).pct)}%, ${fmtInt(s5.at(-1).n)} คน)` : ''}`
      : 'ไม่มีข้อมูลภายใต้ตัวกรองนี้');
    renderChips();
  }

  /* ---------- controls ---------- */
  function renderChips() {
    const maxU = +d3.select('#fUsage').attr('max');
    const items = [];
    if (state.late !== null) items.push({ t: LATE_LABEL[state.late], f: () => (state.late = null) });
    if (state.device !== 'all') items.push({ t: state.device, f: () => (state.device = 'all') });
    if (state.gender !== 'all') items.push({ t: state.gender, f: () => (state.gender = 'all') });
    if (state.age !== 'all') items.push({ t: 'อายุ ' + state.age, f: () => (state.age = 'all') });
    if (state.maxUsage < maxU) items.push({ t: `≤ ${state.maxUsage} ชม./วัน`, f: () => (state.maxUsage = maxU) });
    d3.select('#chips').selectAll('.chip').data(items, d => d.t).join('span').attr('class', 'chip').attr('title', 'คลิกเพื่อลบตัวกรอง')
      .html(d => `${d.t} <i>✕</i>`).on('click', (e, d) => { d.f(); syncControls(); render(); });
  }

  function syncControls() {
    d3.select('#fGender').property('value', state.gender);
    d3.select('#fDevice').property('value', state.device);
    d3.select('#fAge').property('value', state.age);
    d3.select('#fUsage').property('value', state.maxUsage);
    d3.select('#fUsageVal').text(state.maxUsage);
  }

  function fillSelect(id, values, key) {
    d3.select(id).selectAll('option').data(['all', ...values]).join('option')
      .attr('value', d => d).text(d => (d === 'all' ? 'ทั้งหมด' : d));
    d3.select(id).on('change', function () { state[key] = this.value; render(); });
  }

  function setupControls() {
    fillSelect('#fGender', [...new Set(ALL.map(d => d.Gender))].sort(), 'gender');
    fillSelect('#fDevice', ['Smartphone', 'Tablet', 'Laptop/PC'], 'device');
    fillSelect('#fAge', ['15–17', '18–20', '21+'], 'age');
    const mx = Math.ceil(d3.max(ALL, d => d.Daily_Usage_Hours));
    state.maxUsage = mx;
    d3.select('#fUsage').attr('min', 2).attr('max', mx).property('value', mx)
      .on('input', function () { state.maxUsage = +this.value; d3.select('#fUsageVal').text(this.value); render(); });
    d3.select('#fUsageVal').text(mx);
    d3.select('#resetBtn').on('click', () => {
      Object.assign(state, { gender: 'all', device: 'all', age: 'all', maxUsage: mx, late: null });
      syncControls(); render();
    });
  }

  /* ---------- boot ---------- */
  function init(raw) {
    const rng = d3.randomLcg(42);
    ALL = raw.map((d, i) => ({
      id: i,
      Age: +d.Age, Gender: d.Gender.trim(), Device_Type: d.Device_Type.trim(),
      Daily_Usage_Hours: +d.Daily_Usage_Hours, Sleep_Duration_Hours: +d.Sleep_Duration_Hours,
      Sleep_Quality_Score: +d.Sleep_Quality_Score,
      Late_Night_Usage: String(d.Late_Night_Usage).trim().toLowerCase() === 'true',
      ageGroup: ageGroup(+d.Age), jitter: (rng() - .5) * .6
    })).filter(d => !isNaN(d.Daily_Usage_Hours) && !isNaN(d.Sleep_Quality_Score));
    TOTAL = ALL.length;
    setupControls();
    charts.forEach(c => c.build());
    render();
  }

  let rt;
  addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => { if (ALL.length) { charts.forEach(c => c.build()); render(); } }, 200);
  });

  d3.csv(CSV_FILE).then(init).catch(err => {
    console.error(err);
    document.getElementById('loadError').hidden = false;
    document.getElementById('csvFile').addEventListener('change', e => {
      const f = e.target.files[0]; if (!f) return;
      f.text().then(t => { document.getElementById('loadError').hidden = true; init(d3.csvParse(t)); });
    });
  });
})();
