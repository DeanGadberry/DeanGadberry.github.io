/* Flexibility planner: Plan / Retest / Stretches.
   Self-test -> limiters -> 3-5 stretch stack -> week -> retest every 4 weeks.
   Data lives in data.js (window.FLEX). Answers and retests are saved in this
   browser (localStorage); everything still works without storage. */
(function () {
  'use strict';
  var F = window.FLEX;
  var DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var DAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  var TYPES = [['rest', 'Rest'], ['upper', 'Upper lift'], ['lower', 'Lower lift'], ['full', 'Full-body lift'], ['cardio', 'Cardio / other']];
  var KEY = 'flexplanner-v1';

  /* ---------------- storage ---------------- */
  function load(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  var state = load(KEY, null) || {};
  state.answers = state.answers || {};
  state.levels = state.levels || {};
  state.days = state.days || ['upper', 'lower', 'cardio', 'upper', 'lower', 'rest', 'rest'];
  if (state.noSun === undefined) state.noSun = false;
  state.n = state.n || 2;
  if (!state.sizeMode) state.sizeMode = 'auto';
  state.view = state.view || 'plan';
  var qs = new URLSearchParams(location.search).get('skill');
  if (qs && F.SKILLS[qs]) state.skill = qs;
  state.skill = state.skill || 'pancake';
  var hv = location.hash.slice(1);
  if (hv === 'plan' || hv === 'retest' || hv === 'stretches') state.view = hv;
  function persist() { save(KEY, state); }

  /* ---------------- helpers ---------------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmtDate(d) { return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
  function shortDate(d) { return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function weeksText(w) { return w < 9 ? Math.round(w) + ' wk' : Math.round(w / 4.35) + ' mo'; }
  function todayStr() { var d = new Date(), z = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()); }
  function sizeFor(level) { if (state.sizeMode !== 'auto') return +state.sizeMode; return level <= 1 ? 3 : level === 2 ? 4 : 5; }

  /* "Show me how": description + video, hidden until asked */
  function video(v) {
    return '<div class="vf" data-id="' + v[0] + '"><img src="https://i.ytimg.com/vi/' + v[0] + '/hqdefault.jpg" alt="" loading="lazy">' +
      '<button type="button" class="play" aria-label="Play video"><span>&#9654;</span></button></div>' +
      '<p class="vcred">' + v[1] + ' &middot; ' + v[2] + '</p>';
  }
  var howSeq = 0;
  function exItem(e, num, sub) {
    var id = 'h' + (++howSeq);
    return '<li><div class="exrow">' + (num ? '<span class="num">' + num + '</span>' : '') +
      '<div class="txt"><b>' + e.n + '</b><small>' + sub + '</small></div>' +
      '<button type="button" class="howbtn" aria-expanded="false" aria-controls="' + id + '">Show me how</button></div>' +
      '<div class="howbox" id="' + id + '" hidden><p>' + e.how + ' <i>' + e.cue + '</i></p>' +
      (e.note ? '<p class="meta">' + e.note + '</p>' : '') + '<div class="vslot" data-v="' + esc(JSON.stringify(e.v)) + '"></div></div></li>';
  }
  document.addEventListener('click', function (e) {
    var hb = e.target.closest('.howbtn');
    if (hb) {
      var box = document.getElementById(hb.getAttribute('aria-controls'));
      var open = box.hidden;
      box.hidden = !open; hb.setAttribute('aria-expanded', open); hb.textContent = open ? 'Hide' : 'Show me how';
      var slot = box.querySelector('.vslot');
      if (open && slot && !slot.innerHTML) slot.innerHTML = video(JSON.parse(slot.dataset.v));
      return;
    }
    var b = e.target.closest('.vf .play');
    if (b) {
      var vf = b.closest('.vf');
      vf.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + vf.dataset.id +
        '?autoplay=1&rel=0" title="Video" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>';
    }
  });

  /* ---------------- tabs & skill chips ---------------- */
  function setView(v) {
    state.view = v; persist();
    document.querySelectorAll('.tabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.view === v); b.setAttribute('aria-pressed', b.dataset.view === v); });
    ['plan', 'retest', 'stretches'].forEach(function (x) { $('#view-' + x).hidden = x !== v; });
    try { history.replaceState(null, '', '#' + v); } catch (e) {}
  }
  $('.tabs').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { setView(b.dataset.view); window.scrollTo(0, 0); } });

  function renderSkills() {
    $('#skills').innerHTML = Object.keys(F.SKILLS).map(function (k) {
      return '<button type="button" class="chip' + (k === state.skill ? ' on' : '') + '" data-skill="' + k + '">' + F.SKILLS[k].name.split(' (')[0] + '</button>';
    }).join('');
  }
  $('#skills').addEventListener('click', function (e) {
    var b = e.target.closest('.chip'); if (!b) return;
    state.skill = b.dataset.skill; persist();
    renderSkills(); renderSelftest(); renderPlan(); renderRetest(); renderCatalog();
  });

  /* ---------------- self-test & settings ---------------- */
  function pills(name, opts, sel) {
    return '<div class="pills">' + opts.map(function (o, i) {
      return '<label><input type="radio" name="' + name + '" value="' + i + '"' + (sel === i ? ' checked' : '') + '><span>' + o + '</span></label>';
    }).join('') + '</div>';
  }
  function renderSelftest() {
    var s = F.SKILLS[state.skill], ans = state.answers[state.skill] || {}, lvl = state.levels[state.skill];
    var h = '<div class="q"><b>Where are you now?</b><details><summary>How to check</summary>' + s.levelHow + '</details>' +
      '<select class="lvlsel" name="level" aria-label="Current level"><option value="">Choose&hellip;</option>' + s.levels.map(function (l, i) {
        return '<option value="' + i + '"' + (lvl === i ? ' selected' : '') + '>' + i + ' &middot; ' + l + '</option>'; }).join('') + '</select></div>';
    s.tests.forEach(function (k) {
      var t = F.TESTS[k];
      h += '<div class="q"><b>' + t.q + '</b><details><summary>How to test</summary>' + t.how + '</details>' +
        pills('t_' + k, t.opts.map(function (o) { return o[0]; }), ans[k]) + '</div>';
    });
    $('#selftest').innerHTML = h;
    var n = s.tests.filter(function (k) { return ans[k] != null; }).length;
    $('#selftest-sum').textContent = lvl == null ? '— start here' : '· level ' + lvl + ', ' + n + ' of ' + s.tests.length + ' answered';
    $('#selftest-panel').open = lvl == null;
  }
  $('#selftest').addEventListener('change', function (e) {
    var n = e.target.name; if (!n) return;
    if (n === 'level') { if (e.target.value === '') delete state.levels[state.skill]; else state.levels[state.skill] = +e.target.value; }
    else { state.answers[state.skill] = state.answers[state.skill] || {}; state.answers[state.skill][n.slice(2)] = +e.target.value; }
    persist();
    var keepOpen = $('#selftest-panel').open;
    renderPlan(); updateSelftestSum(); $('#selftest-panel').open = keepOpen;
  });
  function updateSelftestSum() {
    var s = F.SKILLS[state.skill], ans = state.answers[state.skill] || {}, lvl = state.levels[state.skill];
    var n = s.tests.filter(function (k) { return ans[k] != null; }).length;
    $('#selftest-sum').textContent = lvl == null ? '— start here' : '· level ' + lvl + ', ' + n + ' of ' + s.tests.length + ' answered';
  }

  function renderSettings() {
    var h = '<div class="days">' + DAYS.map(function (d, i) {
      return '<label class="day"><span>' + d + '</span><select data-day="' + i + '">' + TYPES.map(function (t) {
        return '<option value="' + t[0] + '"' + (state.days[i] === t[0] ? ' selected' : '') + '>' + t[1] + '</option>'; }).join('') + '</select></label>';
    }).join('') + '</div><div class="row2">' +
      '<label>Sessions a week <select id="nsess">' + [1, 2, 3].map(function (n) { return '<option' + (state.n === n ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></label>' +
      '<label>Stretches <select id="nsize">' + [['auto', 'Auto'], ['3', '3'], ['4', '4'], ['5', '5']].map(function (o) {
        return '<option value="' + o[0] + '"' + (String(state.sizeMode) === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>' +
      '<label><input type="checkbox" id="nosun"' + (state.noSun ? ' checked' : '') + '> Keep Sunday free</label></div>' +
      '<p class="meta">Auto: 3 stretches at levels 0&ndash;1, 4 at level 2, 5 from level 3. Add one if a retest shows no progress and you have the time.</p>';
    $('#settings').innerHTML = h;
    updateSettingsSum();
  }
  function updateSettingsSum() {
    var lifts = state.days.filter(function (t) { return t === 'upper' || t === 'lower' || t === 'full'; }).length;
    $('#settings-sum').textContent = '· ' + lifts + ' lifting days, ' + state.n + ' session' + (state.n === 1 ? '' : 's') + ', ' + (state.sizeMode === 'auto' ? 'auto' : state.sizeMode) + ' stretches';
  }
  $('#settings').addEventListener('change', function (e) {
    if (e.target.dataset.day) state.days[+e.target.dataset.day] = e.target.value;
    if (e.target.id === 'nsess') state.n = +e.target.value;
    if (e.target.id === 'nsize') state.sizeMode = e.target.value;
    if (e.target.id === 'nosun') state.noSun = e.target.checked;
    persist(); updateSettingsSum(); renderPlan();
  });

  /* ---------------- engine: limiters ---------------- */
  function rankLimiters(skill, ans) {
    var pts = {};
    F.SKILLS[skill].tests.forEach(function (k) {
      if (ans[k] == null) return;
      var o = F.TESTS[k].opts[ans[k]][1];
      Object.keys(o).forEach(function (l) { pts[l] = (pts[l] || 0) + o[l]; });
    });
    var arr = Object.keys(pts).map(function (k) { return { k: k, p: pts[k] }; })
      .filter(function (x) { return x.p > 0; }).sort(function (a, b) { return b.p - a.p; });
    return arr;
  }

  /* ---------------- engine: stack ---------------- */
  function pick(skill, level, filter, prefer, used) {
    var best = null, bestScore = -1;
    F.EX.forEach(function (e) {
      if (used[e.id] || e.sk.indexOf(skill) < 0 || e.lv > level || !filter(e)) return;
      var s = 1;
      prefer.forEach(function (l, i) { if (e.lim.indexOf(l) >= 0) s += (prefer.length - i) * 3; });
      if (s > bestScore) { bestScore = s; best = e; }
    });
    if (best) used[best.id] = true;
    return best;
  }
  function spec(e) { return e.spec || F.METHODS[e.m].spec; }

  function buildStack(skill, level, ranked) {
    var sk = F.SKILLS[skill], used = {}, out = [];
    var sig = ranked.filter(function (r) { return r.p >= 2; }).map(function (r) { return r.k; });
    var muscles = sig.filter(function (k) { return F.LIMITERS[k].muscle && k !== 'wrists'; });
    sk.defaults.forEach(function (d) { if (muscles.length < 2 && muscles.indexOf(d) < 0) muscles.push(d); });
    var flag = function (k) { return sig.indexOf(k) >= 0; };

    // 1. Prep: nerve / wrists first if flagged, else a drill for the top muscle.
    if (flag('nerve')) push(pick(skill, level, function (e) { return e.m === 'nerve'; }, ['nerve'], used), 'Prep');
    if (flag('wrists') || skill === 'bridge') push(pick(skill, level, function (e) { return e.lim.indexOf('wrists') >= 0; }, ['wrists'], used), 'Prep');
    if (out.length < 2) push(pick(skill, level, function (e) { return e.t === 1 && e.m !== 'soft'; }, muscles, used), 'Prep');

    // 2. Isolated, assisted stretches for the top two muscle limiters.
    muscles.slice(0, 2).forEach(function (m) {
      push(pick(skill, level, function (e) { return e.t === 2 && e.lim.indexOf(m) >= 0; }, [m].concat(muscles), used), 'Isolated');
    });

    // 3. Compound pair: assisted (loaded) then resisted (active / strength).
    var a1 = pick(skill, level, function (e) { return e.t === 3 && spec(e) === 'assisted'; }, muscles, used);
    var a2 = pick(skill, level, function (e) { return e.t === 3 && spec(e) === 'resisted'; }, ['active'].concat(muscles), used);
    if (a1 && a2) { push(a1, 'Pair A1'); push(a2, 'Pair A2'); }
    else { push(a1, 'Compound'); push(a2, 'Strength in range'); }

    // 4. Skill position.
    var d = null;
    if (flag('technique')) d = pick(skill, level, function (e) { return e.t === 4 && e.m === 'technique'; }, ['technique'], used);
    if (!d && level >= 2) d = pick(skill, level, function (e) { return e.t === 4 && e.m === 'ballistic'; }, muscles, used);
    if (!d) d = pick(skill, level, function (e) { return e.t === 4; }, muscles.concat(['technique']), used);
    push(d, 'Skill position');

    return out;
    function push(e, role) { if (e) out.push({ e: e, role: role }); }
  }

  // Split warm-up drills out, then keep the 3-5 stretches that matter most,
  // in their original small-to-big order.
  function trimStack(all, size) {
    var warm = all.filter(function (it) { return it.role === 'Prep'; });
    var core = all.filter(function (it) { return it.role !== 'Prep'; });
    var rank = function (it, i) {
      if (it.role === 'Skill position') return 0;
      if (it.role === 'Pair A1' || it.role === 'Compound') return 1;
      if (it.role === 'Pair A2' || it.role === 'Strength in range') return 2;
      return 3 + i; // isolated stretches, first one kept before the second
    };
    var keep = core.map(function (it, i) { return { it: it, r: rank(it, i), i: i }; })
      .sort(function (a, b) { return a.r - b.r; }).slice(0, size)
      .sort(function (a, b) { return a.i - b.i; }).map(function (x) { return x.it; });
    if (!keep.some(function (it) { return it.role === 'Pair A1'; })) keep.forEach(function (it) { if (it.role === 'Pair A2') it.role = 'Strength in range'; });
    if (!keep.some(function (it) { return it.role === 'Pair A2'; })) keep.forEach(function (it) { if (it.role === 'Pair A1') it.role = 'Compound'; });
    return { warm: warm.slice(0, 2), stack: keep };
  }

  function doseIdx(level) { return level <= 1 ? 0 : (level <= 3 ? 1 : 2); }
  function dose(e, level) {
    var m = F.METHODS[e.m], i = doseIdx(level);
    if (e.m === 'ballistic') i = Math.max(1, i);
    return m.dose[i];
  }

  /* ---------------- engine: schedule ---------------- */
  function hits(skill, type) {
    var r = F.SKILLS[skill].region;
    if (type === 'full') return true;
    if (r === 'lower') return type === 'lower';
    if (r === 'upper') return type === 'upper';
    return type === 'upper' || type === 'lower';
  }
  function schedule(skill) {
    var days = state.days, allowed = [], info = [];
    for (var d = 0; d < 7; d++) {
      var conflict = hits(skill, days[d]);
      var gap = 7;
      for (var k = 1; k <= 7; k++) if (hits(skill, days[(d - k + 7) % 7])) { gap = k; break; }
      var excluded = state.noSun && d === 6;
      var score = excluded ? -99 : conflict ? 2 : gap >= 2 ? 4 : 1;
      info.push({ d: d, conflict: conflict, gap: gap, excluded: excluded, score: score });
      if (!excluded) allowed.push(d);
    }
    var n = Math.min(state.n, allowed.length), best = null;
    combos(allowed, n).forEach(function (c) {
      var ok = true, minGap = 7, total = 0;
      for (var i = 0; i < c.length; i++) {
        total += info[c[i]].score;
        for (var j = i + 1; j < c.length; j++) {
          var g = Math.min(Math.abs(c[i] - c[j]), 7 - Math.abs(c[i] - c[j]));
          minGap = Math.min(minGap, g); if (g < 2) ok = false;
        }
      }
      var val = (ok ? 1000 : 0) + total * 10 + minGap;
      if (!best || val > best.val) best = { c: c, val: val };
    });
    var focus = best ? best.c : [];
    return info.map(function (x) {
      var row = { day: DAY_FULL[x.d], type: TYPES.filter(function (t) { return t[0] === days[x.d]; })[0][1] };
      if (x.excluded) { row.kind = 'rest'; row.what = 'Rest'; }
      else if (focus.indexOf(x.d) >= 0) {
        row.kind = 'focus';
        row.what = x.conflict ? 'Focus session &mdash; in the evening, 6+ hours after lifting'
          : x.gap >= 2 ? 'Focus session &mdash; any time (2+ days after your last session that loads these areas: ideal)'
          : 'Focus session &mdash; keep it moderate (day after heavy training)';
      } else { row.kind = 'maint'; row.what = 'Maintenance &mdash; 5&ndash;10 min easy'; }
      return row;
    });
  }
  function combos(arr, k) {
    var res = [];
    (function go(start, cur) {
      if (cur.length === k) { res.push(cur.slice()); return; }
      for (var i = start; i < arr.length; i++) { cur.push(arr[i]); go(i + 1, cur); cur.pop(); }
    })(0, []);
    return res;
  }

  /* ---------------- engine: minutes & timeline ---------------- */
  function weeklyMinutes(stack, sched) {
    var focusN = sched.filter(function (r) { return r.kind === 'focus'; }).length;
    var maintN = sched.filter(function (r) { return r.kind === 'maint'; }).length;
    var mins = {};
    stack.forEach(function (it) {
      var per = F.METHODS[it.e.m].min * focusN + (it.role === 'Isolated' ? 2 * maintN : 0);
      it.e.lim.forEach(function (l) { if (F.LIMITERS[l].muscle) mins[l] = (mins[l] || 0) + per; });
    });
    return mins;
  }
  function timeline(skill, level, sigCount) {
    var s = F.SKILLS[skill], goal = s.levels.length - 1, gap = goal - level;
    if (gap <= 0) return null;
    var f = 1 + 0.15 * Math.max(0, sigCount - 1);
    if (state.n === 1) f *= 1.4; else if (state.n === 3) f *= 0.9;
    return { lo: s.weeks[0] * gap * f, hi: s.weeks[1] * gap * f, gap: gap };
  }


  /* ---------------- plan ---------------- */
  var lastPlan = null;
  function computePlan(skill) {
    var s = F.SKILLS[skill], level = state.levels[skill];
    if (level == null) return null;
    var ans = state.answers[skill] || {};
    var ranked = rankLimiters(skill, ans);
    var sig = ranked.filter(function (r) { return r.p >= 2; });
    var built = trimStack(buildStack(skill, level, ranked), sizeFor(level));
    return { skill: skill, s: s, level: level, ranked: ranked, sig: sig, stack: built.stack, warm: built.warm,
      sched: schedule(skill), tl: timeline(skill, level, sig.length), built: new Date() };
  }
  function weekStrip(sched) {
    return '<div class="week">' + sched.map(function (r) {
      var lab = r.kind === 'focus' ? 'Focus' + (/evening/.test(r.what) ? '<br>eve' : '') : r.kind === 'maint' ? 'Easy' : 'Rest';
      return '<div class="' + r.kind + '"><b>' + r.day.slice(0, 2) + '</b>' + lab + '</div>';
    }).join('') + '</div>';
  }
  function renderPlan() {
    var p = lastPlan = computePlan(state.skill), box = $('#plan-out');
    if (!p) {
      box.innerHTML = '<p class="line">Answer <b>Where are you now?</b> in the self-test below to get your plan. The other questions sharpen it.</p>';
      $('#selftest-panel').open = true;
      return;
    }
    var s = p.s, rt = retestDate(p.skill), dn = daysUntil(rt), goal = s.levels.length - 1;
    var est = p.tl ? weeksText(p.tl.lo) + '&ndash;' + weeksText(p.tl.hi) : 'At goal';
    var h = '<div class="strip"><div><span>Level</span><b>' + p.level + ' &rarr; ' + goal + '</b><small>' + s.levels[p.level] + '</small></div>' +
      '<div><span>Estimate</span><b>' + est + '</b><small>' + (p.tl ? 'by ' + shortDate(addDays(p.built, p.tl.lo * 7)) + '&ndash;' + shortDate(addDays(p.built, p.tl.hi * 7)) : 'One session a week keeps it') + '</small></div>' +
      '<div class="hot"><span>Retest</span><b>' + shortDate(rt) + '</b><small>' + (dn <= 0 ? 'today' : 'in ' + dn + ' days') + '</small></div></div>';
    var mains = p.sig.map(function (r) { return F.LIMITERS[r.k].label; });
    h += '<p class="line"><b>Holding you back:</b> ' + (mains.length ? mains.join(', ') : s.defaults.map(function (d) { return F.LIMITERS[d].label; }).join(', ') + ' <span class="muted">(typical &mdash; answer the self-test)</span>') + '</p>';
    if (p.warm.length) h += '<p class="line"><b>Warm-up 3&ndash;5 min:</b> ' + p.warm.map(function (it) { return it.e.n; }).join(' and ') + '.</p>';
    h += '<ol class="exlist">' + p.stack.map(function (it, i) {
      var m = F.METHODS[it.e.m];
      return exItem(it.e, i + 1, dose(it.e, p.level) + ' &middot; rest ' + m.rest);
    }).join('') + '</ol>';
    if (p.skill === 'front') h += '<p class="line muted">Both sides; one extra set on the tighter side.</p>';
    if (p.skill === 'bridge') h += '<p class="line muted">Build slowly; stop for any sharp low-back pain.</p>';
    if (p.sig.some(function (r) { return r.k === 'technique'; }) && (p.skill === 'pancake' || p.skill === 'middle'))
      h += '<p class="line muted">A hip pinch can be bone, not muscle: tilt the pelvis forward, kneecaps up, don&rsquo;t force it.</p>';
    var mins = Math.round(p.stack.reduce(function (a, it) { return a + F.METHODS[it.e.m].min + 1; }, 4));
    h += weekStrip(p.sched) + '<p class="line muted">Focus about ' + mins + ' min &middot; Easy 5&ndash;10 min &middot; weeks 1&ndash;3 build up, week 4 lighter, then retest.</p>';
    h += '<div class="btnrow"><button type="button" class="btn" id="card-open">Phone image</button><button type="button" class="btn ghost" id="print">Print</button>' +
      '<button type="button" class="btn ghost" data-go="retest">Retest</button></div><div id="card-panel" hidden></div>';
    box.innerHTML = h;
  }

  /* ---------------- print view & phone card ---------------- */
  function txt(html) { var d = document.createElement('textarea'); d.innerHTML = String(html).replace(/<[^>]+>/g, ''); return d.value; }
  function retestDate(skill) {
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var rows = (typeof skillSessions === 'function') ? skillSessions(skill) : [];
    if (rows.length) {
      var d = addDays(new Date(rows[rows.length - 1].date + 'T12:00'), 28);
      return d < today ? today : d;
    }
    return addDays(today, 28);
  }
  function daysUntil(d) { var t = new Date(); t.setHours(0, 0, 0, 0); return Math.round((d - t) / 864e5); }
  function estText(p) {
    if (!p.tl) return { range: 'At goal', dates: 'Keep one session a week' };
    return { range: weeksText(p.tl.lo) + '–' + weeksText(p.tl.hi), dates: fmtDate(addDays(p.built, p.tl.lo * 7)) + ' – ' + fmtDate(addDays(p.built, p.tl.hi * 7)) };
  }

  function renderPrint() {
    var p = lastPlan; if (!p) return;
    var s = p.s, rt = retestDate(p.skill), est = estText(p);
    var focusN = p.sched.filter(function (r) { return r.kind === 'focus'; }).length;
    var h = '<header><span>Flexibility plan</span><h1>' + s.name + '</h1><small>Built ' + fmtDate(p.built) + '</small></header>' +
      '<div class="pv-sum"><div><span>Now</span><b>Level ' + p.level + '</b><small>' + s.levels[p.level] + '</small></div>' +
      '<div><span>Goal</span><b>Level ' + (s.levels.length - 1) + '</b><small>' + s.levels[s.levels.length - 1] + '</small></div>' +
      '<div><span>Estimate</span><b>' + esc(est.range) + '</b><small>' + esc(est.dates) + '</small></div>' +
      '<div class="hot"><span>Retest</span><b>' + fmtDate(rt) + '</b><small>then every 4 weeks</small></div></div>';
    h += '<h2>Focus session &mdash; ' + p.stack.length + ' stretches, in this order</h2>' + (p.warm && p.warm.length ? '<p class="pv-rules"><b>Warm-up 3&ndash;5 min:</b> ' + p.warm.map(function (it) { return it.e.n; }).join(' and ') + ', one easy set each.</p>' : '') + '<table class="pv-stack"><tr><th>#</th><th>Exercise</th><th>Dose</th><th>Rest</th><th>Cue</th></tr>' +
      p.stack.map(function (it, i) {
        var e = it.e, m = F.METHODS[e.m];
        return '<tr><td>' + (i + 1) + '</td><td><b>' + e.n + '</b><br><small>' + m.label + ' &middot; ' + it.role + '</small></td><td>' + dose(e, p.level) + '</td><td>' + m.rest + '</td><td>' + e.cue + '</td></tr>';
      }).join('') + '</table>';
    h += '<h2>Week</h2><table class="pv-week"><tr>' + p.sched.map(function (r) { return '<th>' + r.day.slice(0, 3) + '</th>'; }).join('') + '</tr><tr>' +
      p.sched.map(function (r) {
        var lab = r.kind === 'focus' ? '<b>Focus</b>' + (/evening/.test(r.what) ? '<br><small>evening</small>' : '') : r.kind === 'maint' ? 'Easy<br><small>5&ndash;10 min</small>' : '<span class="muted">Rest</span>';
        return '<td class="' + r.kind + '">' + lab + '<br><small class="muted">' + r.type + '</small></td>';
      }).join('') + '</tr></table>' +
      '<p class="pv-rules">' + focusN + ' focus session' + (focusN === 1 ? '' : 's') + ' a week, 48 h+ apart &middot; rest 60&ndash;90 s between exercises &middot; ' +
      'weeks 1&ndash;3 build from the low to the high end of each dose, week 4 deload (half the sets) then retest.</p>';
    var ms = F.SKILL_MEASURES[p.skill];
    var dates = [rt, addDays(rt, 28), addDays(rt, 56)];
    h += '<h2>Retest sheet</h2><table class="pv-log"><tr><th>Test</th>' + dates.map(function (d) { return '<th>' + fmtDate(d) + '</th>'; }).join('') + '</tr>' +
      '<tr><td>Level (0&ndash;' + (s.levels.length - 1) + ')</td><td></td><td></td><td></td></tr>' +
      ms.map(function (id) {
        var m = F.MEASURES[id];
        return '<tr><td>' + m.label + ' <small>(' + m.unit + ')</small></td>' + dates.map(function () { return '<td>' + (m.sides ? '<span class="lr">L</span><span class="lr">R</span>' : '') + '</td>'; }).join('') + '</tr>';
      }).join('') + '</table><p class="pv-rules">Same time of day and same warm-up each retest. Enter them in the Retest tab to update your plan.</p>';
    $('#printview').innerHTML = h;
  }

  function wrap(ctx, text, maxW) {
    var words = text.split(/\s+/), lines = [], cur = '';
    words.forEach(function (w) {
      var t = cur ? cur + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
    });
    if (cur) lines.push(cur);
    return lines;
  }
  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function drawCard(cv, sc) {
    var p = lastPlan, s = p.s, W = 1080, H = 1920, M = 84, ctx = cv.getContext('2d');
    var INK = '#1c2420', BG = '#f6f3ec', MUTED = 'rgba(28,36,32,0.6)', SOFT = 'rgba(28,36,32,0.07)';
    var FF = '"EB Garamond", Georgia, serif';
    var f = function (wt, px) { ctx.font = wt + ' ' + Math.round(px * sc) + 'px ' + FF; };
    ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = INK; ctx.textBaseline = 'top';
    var y = M;
    // header
    f('600', 30); ctx.fillStyle = MUTED; ctx.fillText('FLEXIBILITY PLAN', M, y); y += 46 * sc;
    ctx.fillStyle = INK; f('700', 76);
    wrap(ctx, txt(s.name), W - 2 * M).forEach(function (l) { ctx.fillText(l, M, y); y += 84 * sc; });
    f('400', 34); ctx.fillStyle = MUTED;
    ctx.fillText('Level ' + p.level + '  →  goal level ' + (s.levels.length - 1), M, y); y += 44 * sc;
    wrap(ctx, 'Now: ' + txt(s.levels[p.level]), W - 2 * M).forEach(function (l) { ctx.fillText(l, M, y); y += 42 * sc; });
    y += 26 * sc;
    // retest block
    var rt = retestDate(p.skill), dn = daysUntil(rt), bh = 190 * sc;
    ctx.fillStyle = INK; rrect(ctx, M, y, W - 2 * M, bh, 28); ctx.fill();
    ctx.fillStyle = BG; f('600', 28); ctx.fillText('NEXT RETEST', M + 40, y + 30 * sc);
    f('700', 72); ctx.fillText(fmtDate(rt), M + 40, y + 66 * sc);
    f('400', 30); ctx.fillStyle = 'rgba(246,243,236,0.8)';
    ctx.fillText((dn <= 0 ? 'today' : 'in ' + dn + ' day' + (dn === 1 ? '' : 's')) + '  ·  then every 4 weeks', M + 40, y + 148 * sc);
    y += bh + 30 * sc;
    var est = estText(p);
    ctx.fillStyle = INK; f('600', 32); ctx.fillText('Estimated goal: ' + est.range, M, y); y += 42 * sc;
    f('400', 28); ctx.fillStyle = MUTED; ctx.fillText(est.dates, M, y); y += 58 * sc;
    // week strip
    ctx.fillStyle = INK; f('700', 40); ctx.fillText('Your week', M, y); y += 58 * sc;
    var cw = (W - 2 * M) / 7, r = Math.min(46, cw / 2 - 8) * sc;
    p.sched.forEach(function (row, i) {
      var cx = M + cw * i + cw / 2, cy = y + r;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
      if (row.kind === 'focus') { ctx.fillStyle = INK; ctx.fill(); }
      else if (row.kind === 'maint') { ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke(); }
      else { ctx.fillStyle = SOFT; ctx.fill(); }
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      f('700', 30); ctx.fillStyle = row.kind === 'focus' ? BG : row.kind === 'maint' ? INK : MUTED;
      ctx.fillText(row.day.slice(0, 2), cx, cy + 1);
      ctx.textBaseline = 'top'; f('400', 22); ctx.fillStyle = MUTED;
      ctx.fillText(row.kind === 'focus' ? 'FOCUS' : row.kind === 'maint' ? 'easy' : 'rest', cx, cy + r + 10 * sc);
      ctx.textAlign = 'left';
    });
    y += 2 * r + 52 * sc;
    // stack
    ctx.fillStyle = INK; f('700', 40); ctx.fillText('Focus session: ' + p.stack.length + ' stretches, in order', M, y); y += 54 * sc;
    if (p.warm && p.warm.length) {
      f('400', 27); ctx.fillStyle = MUTED;
      wrap(ctx, 'Warm-up 3\u20135 min: ' + p.warm.map(function (it) { return txt(it.e.n); }).join(' and '), W - 2 * M).forEach(function (l) { ctx.fillText(l, M, y); y += 34 * sc; });
      y += 14 * sc;
    }
    p.stack.forEach(function (it, i) {
      var e = it.e, m = F.METHODS[e.m];
      f('700', 34); ctx.fillStyle = INK;
      ctx.fillText(String(i + 1), M, y);
      var x = M + 52 * sc, w = W - M - x;
      wrap(ctx, txt(e.n), w).forEach(function (l) { ctx.fillText(l, x, y); y += 40 * sc; });
      f('400', 27); ctx.fillStyle = MUTED;
      wrap(ctx, txt(dose(e, p.level)) + '  ·  rest ' + txt(m.rest), w).forEach(function (l) { ctx.fillText(l, x, y); y += 34 * sc; });
      y += 16 * sc;
    });
    // footer
    var fy = Math.max(y + 10, H - M - 60);
    ctx.strokeStyle = 'rgba(28,36,32,0.2)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(M, fy); ctx.lineTo(W - M, fy); ctx.stroke();
    f('400', 26); ctx.fillStyle = MUTED;
    ctx.fillText('Focus sessions 48 h+ apart  ·  week 4 = deload, then retest', M, fy + 22);
    return y;
  }
  function renderCard() {
    if (!lastPlan) return;
    var cv = document.createElement('canvas'); cv.width = 1080; cv.height = 1920;
    var go = function () {
      var sc = 1;
      for (var i = 0; i < 8; i++) { if (drawCard(cv, sc) <= 1920 - 84 - 80) break; sc -= 0.06; }
      cv.toBlob(function (b) {
        if (!b) return;
        if (lastPlan.cardUrl) URL.revokeObjectURL(lastPlan.cardUrl);
        lastPlan.cardBlob = b; lastPlan.cardUrl = URL.createObjectURL(b);
        var img = $('#card-img'); if (img) img.src = lastPlan.cardUrl;
        var sh = $('#card-share');
        try { if (sh && navigator.canShare && navigator.canShare({ files: [new File([b], 'x.png', { type: 'image/png' })] })) sh.hidden = false; } catch (e) {}
      }, 'image/png');
    };
    if (document.fonts && document.fonts.load) {
      Promise.all([document.fonts.load('700 40px "EB Garamond"'), document.fonts.load('400 30px "EB Garamond"'), document.fonts.load('600 30px "EB Garamond"')]).then(go, go);
    } else go();
  }
  function cardName() { var d = lastPlan.built, z = function (n) { return (n < 10 ? '0' : '') + n; }; return 'flexibility-' + lastPlan.skill + '-' + d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + '.png'; }

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (t.dataset && t.dataset.go) { setView(t.dataset.go); window.scrollTo(0, 0); return; }
    if (!lastPlan) return;
    if (t.id === 'print') { renderPrint(); window.print(); }
    else if (t.id === 'card-open') {
      var panel = $('#card-panel');
      panel.hidden = !panel.hidden;
      if (!panel.hidden) {
        panel.innerHTML = '<img id="card-img" alt="Phone image of this plan"><div class="btnrow"><button type="button" class="btn" id="card-save">Save image</button>' +
          '<button type="button" class="btn ghost" id="card-share" hidden>Share&hellip;</button></div>';
        renderCard();
      }
    } else if (t.id === 'card-save' && lastPlan.cardUrl) {
      var a = document.createElement('a'); a.href = lastPlan.cardUrl; a.download = cardName();
      document.body.appendChild(a); a.click(); a.remove();
    } else if (t.id === 'card-share' && lastPlan.cardBlob) {
      navigator.share({ files: [new File([lastPlan.cardBlob], cardName(), { type: 'image/png' })], title: 'Flexibility plan' }).catch(function () {});
    }
  });

  /* ---------------- retest ---------------- */
  var TKEY = 'flexplanner-tests-v1';
  function sessions() { return load(TKEY, []); }
  function setSessions(l) { save(TKEY, l); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function num(v) { if (v === '' || v == null) return null; var n = parseFloat(v); return isFinite(n) ? n : null; }
  function fmtN(n) { return n == null ? '&ndash;' : (Math.round(n * 10) / 10).toString(); }

  // Bring over entries from the earlier level-only log.
  (function migrate() {
    var all = sessions(), changed = false;
    Object.keys(F.SKILLS).forEach(function (k) {
      var old = load('flexplanner-log-' + k, null);
      if (!old || !old.length) return;
      old.forEach(function (r) { all.push({ id: uid(), skill: k, date: r.date, level: r.level, note: r.note || '', vals: {} }); });
      try { localStorage.removeItem('flexplanner-log-' + k); } catch (e) {}
      changed = true;
    });
    if (changed) setSessions(all);
  })();

  function skillSessions(k) {
    return sessions().filter(function (x) { return x.skill === k; })
      .sort(function (a, b) { return (a.date + (a.time || '')) < (b.date + (b.time || '')) ? -1 : 1; });
  }
  // Single comparable value for a measure in a session (worse side for two-sided tests).
  function val(sess, id) {
    var m = F.MEASURES[id], v = sess.vals && sess.vals[id];
    if (!v) return null;
    if (!m.sides) return num(v.v);
    var L = num(v.L), R = num(v.R);
    if (L == null) return R; if (R == null) return L;
    return m.better === 'lower' ? Math.max(L, R) : Math.min(L, R);
  }

  function chart(rows, m) {
    var pts = [];
    rows.forEach(function (r) {
      var v = r.vals && r.vals[r._id];
      if (!v) return;
      var t = new Date(r.date + 'T' + (r.time || '12:00')).getTime();
      if (m.sides) { if (num(v.L) != null) pts.push({ t: t, s: 'L', y: num(v.L) }); if (num(v.R) != null) pts.push({ t: t, s: 'R', y: num(v.R) }); }
      else if (num(v.v) != null) pts.push({ t: t, s: 'v', y: num(v.v) });
    });
    if (pts.length < 2) return '';
    var W = 320, H = 90, P = 8;
    var ts = pts.map(function (p) { return p.t; }), ys = pts.map(function (p) { return p.y; });
    if (m.goal != null) ys.push(m.goal);
    var t0 = Math.min.apply(0, ts), t1 = Math.max.apply(0, ts), y0 = Math.min.apply(0, ys), y1 = Math.max.apply(0, ys);
    if (t1 === t0) t1 = t0 + 1; if (y1 === y0) { y1 += 1; y0 -= 1; }
    var X = function (t) { return P + (t - t0) / (t1 - t0) * (W - 2 * P); };
    // Up always means better.
    var Y = function (y) { var f = (y - y0) / (y1 - y0); if (m.better === 'lower') f = 1 - f; return H - P - f * (H - 2 * P); };
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="spark" role="img" aria-label="' + esc(m.label.replace(/&[a-z]+;/g, '')) + ' over time">';
    if (m.goal != null) svg += '<line x1="' + P + '" x2="' + (W - P) + '" y1="' + Y(m.goal) + '" y2="' + Y(m.goal) + '" class="goal"/>';
    ['L', 'R', 'v'].forEach(function (sd) {
      var ser = pts.filter(function (p) { return p.s === sd; });
      if (!ser.length) return;
      svg += '<polyline class="ser ' + sd + '" points="' + ser.map(function (p) { return X(p.t).toFixed(1) + ',' + Y(p.y).toFixed(1); }).join(' ') + '"/>';
      ser.forEach(function (p) { svg += '<circle class="ser ' + sd + '" cx="' + X(p.t).toFixed(1) + '" cy="' + Y(p.y).toFixed(1) + '" r="3"/>'; });
    });
    return svg + '</svg>';
  }

  function trend(rows, id) {
    var m = F.MEASURES[id], pts = rows.map(function (r) {
      return { t: new Date(r.date).getTime() / 6048e5, y: val(r, id) }; }).filter(function (p) { return p.y != null; });
    if (pts.length < 2) return null;
    pts = pts.slice(-8);
    var n = pts.length, mt = 0, my = 0;
    pts.forEach(function (p) { mt += p.t / n; my += p.y / n; });
    var num_ = 0, den = 0;
    pts.forEach(function (p) { num_ += (p.t - mt) * (p.y - my); den += (p.t - mt) * (p.t - mt); });
    if (!den) return null;
    var slope = num_ / den, last = pts[pts.length - 1];
    var improving = m.better === 'lower' ? slope < 0 : slope > 0;
    var out = { slope: slope, improving: improving, last: last.y };
    if (m.goal != null && improving) {
      var weeks = (m.goal - last.y) / slope;
      if (weeks <= 0) out.reached = true; else out.eta = addDays(new Date(last.t * 6048e5), weeks * 7);
    }
    return out;
  }


  function renderRetest() {
    var k = state.skill, s = F.SKILLS[k], rows = skillSessions(k), rt = retestDate(k), dn = daysUntil(rt);
    $('#rt-head').innerHTML = '<p class="line">' + (rows.length ? 'Last retest ' + esc(rows[rows.length - 1].date) + '. ' : 'No retests yet &mdash; this first one is your baseline. ') +
      '<b>Next: ' + fmtDate(rt) + '</b> ' + (dn <= 0 ? '(due now)' : '(in ' + dn + ' days)') + '.</p>' +
      '<p class="meta">Same time of day and same warm-up each time. Fill in what you test; blanks are fine.</p>';
    var lvl = state.levels[k];
    var h = '<div class="row2"><label>Date <input type="date" id="rt-date" value="' + todayStr() + '"></label>' +
      '<label>Level <select id="rt-level"><option value="">&ndash;</option>' + s.levels.map(function (l, i) {
        return '<option value="' + i + '"' + (lvl === i ? ' selected' : '') + '>' + i + ' &middot; ' + l + '</option>'; }).join('') + '</select></label></div>';
    h += '<div class="mrow mhead"><span></span><span>Left</span><span>Right</span></div>';
    F.SKILL_MEASURES[k].forEach(function (id) {
      var m = F.MEASURES[id];
      var lab = '<div class="lab">' + m.label + ' <small>' + m.unit + (m.better === 'lower' ? ' &darr;' : ' &uarr;') + '</small><details><summary>How</summary>' + m.how + '</details></div>';
      h += m.sides
        ? '<div class="mrow">' + lab + '<input type="number" step="0.5" inputmode="decimal" data-m="' + id + '" data-s="L" aria-label="Left"><input type="number" step="0.5" inputmode="decimal" data-m="' + id + '" data-s="R" aria-label="Right"></div>'
        : '<div class="mrow one">' + lab + '<input type="number" step="0.5" inputmode="decimal" data-m="' + id + '" data-s="v" aria-label="Value"></div>';
    });
    h += '<div class="btnrow"><button type="button" class="bigbtn" id="rt-save">Save retest &amp; update plan</button><span id="rt-msg" class="ok" role="status"></span></div>';
    $('#rt-form').innerHTML = h;
    renderProgress();
  }

  function renderProgress() {
    var k = state.skill, rows = skillSessions(k), box = $('#rt-progress');
    if (!rows.length) { box.innerHTML = ''; return; }
    var prim = F.SKILL_MEASURES[k][0], pm = F.MEASURES[prim], tr = trend(rows, prim);
    var h = '<h2>Progress</h2>';
    if (tr) {
      h += '<p class="line"><b>' + pm.label.split(':').pop().trim() + ':</b> ' + (tr.improving ? 'improving' : 'flat') + ', ~' + fmtN(Math.abs(tr.slope)) + ' ' + pm.unit + '/week' +
        (tr.reached ? ' &mdash; goal reached.' : tr.eta ? ' &mdash; on pace for <b>' + fmtDate(tr.eta) + '</b>.' : tr.improving ? '.' : ' &mdash; plateaus of 4&ndash;5 weeks are normal.') + '</p>';
    }
    var have = F.SKILL_MEASURES[k].filter(function (id) { return rows.some(function (r) { return val(r, id) != null; }); });
    if (have.length) {
      h += '<table class="prog"><tr><th>Test</th><th>First</th><th>Last</th><th>Change</th></tr>' + have.map(function (id) {
        var m = F.MEASURES[id], hv = rows.filter(function (r) { return val(r, id) != null; });
        var a = val(hv[0], id), b = val(hv[hv.length - 1], id), x = b - a, good = m.better === 'lower' ? x < 0 : x > 0;
        return '<tr><td>' + m.label.split(':').pop().trim() + ' <small class="muted">' + m.unit + '</small></td><td>' + fmtN(a) + '</td><td>' + fmtN(b) + '</td><td>' +
          (hv.length < 2 ? '&ndash;' : '<span class="' + (x === 0 ? '' : good ? 'up' : 'down') + '">' + (x > 0 ? '+' : '') + fmtN(x) + '</span>') + '</td></tr>';
      }).join('') + '</table><p class="meta">Two-sided tests use your tighter side.</p>';
      var charts = have.map(function (id) {
        var m = F.MEASURES[id], c = chart(rows.filter(function (r) { return val(r, id) != null; }).map(function (r) { var o = Object.assign({}, r); o._id = id; return o; }), m);
        return c ? '<div class="mcard"><b>' + m.label + '</b>' + c + '</div>' : '';
      }).join('');
      if (charts) h += '<details class="panel"><summary>Charts</summary><div class="mgrid">' + charts + '</div><p class="meta">Up is better. Solid = left, dashed = right, line = goal.</p></details>';
    }
    h += '<details class="panel"><summary>Past retests <small>&middot; ' + rows.length + '</small></summary><table class="prog">' + rows.slice().reverse().map(function (r) {
      return '<tr><td>' + esc(r.date) + '</td><td>' + (r.level == null || r.level === '' ? '' : 'Level ' + r.level) + '</td><td><button type="button" class="del" data-id="' + r.id + '" aria-label="Delete retest">&times;</button></td></tr>';
    }).join('') + '</table></details>';
    box.innerHTML = h;
  }

  function download(name, text, type) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: type }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function csv() {
    var q = function (x) { x = x == null ? '' : String(x); return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; };
    var out = [['skill', 'date', 'time', 'warmed_up', 'feel', 'level', 'test', 'side', 'value', 'unit', 'notes'].join(',')];
    sessions().forEach(function (r) {
      var base = [r.skill, r.date, r.time, r.warm === false ? 'no' : 'yes', r.feel, r.level];
      var keys = Object.keys(r.vals || {});
      if (!keys.length) out.push(base.concat(['', '', '', '', r.note]).map(q).join(','));
      keys.forEach(function (id) {
        var m = F.MEASURES[id], v = r.vals[id], unit = m ? m.unit.replace('&deg;', 'deg') : '';
        var label = m ? m.label.replace(/&[a-z]+;/g, '') : id;
        (m && m.sides ? ['L', 'R'] : ['v']).forEach(function (sd) {
          if (num(v[sd]) == null) return;
          out.push(base.concat([label, sd === 'v' ? '' : sd, v[sd], unit, r.note]).map(q).join(','));
        });
      });
    });
    return out.join('\n');
  }


  document.addEventListener('change', function (e) {
    if (e.target.id !== 'lg-import' || !e.target.files[0]) return;
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var inc = JSON.parse(fr.result); if (!Array.isArray(inc)) throw 0;
        var all = sessions(), ids = {}, added = 0; all.forEach(function (r) { ids[r.id] = 1; });
        inc.forEach(function (r) { if (r && r.skill && r.date && !ids[r.id]) { r.id = r.id || uid(); all.push(r); added++; } });
        setSessions(all); renderRetest(); renderPlan();
        $('#lg-io-msg').textContent = 'Restored ' + added + ' retest' + (added === 1 ? '' : 's') + '.';
      } catch (err) { $('#lg-io-msg').textContent = 'That file isn’t a planner backup.'; }
      e.target.value = '';
    };
    fr.readAsText(e.target.files[0]);
  });
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (t.id === 'rt-save') {
      var vals = {}, any = false;
      document.querySelectorAll('#rt-form input[data-m]').forEach(function (inp) {
        var v = num(inp.value); if (v == null) return;
        vals[inp.dataset.m] = vals[inp.dataset.m] || {}; vals[inp.dataset.m][inp.dataset.s] = v; any = true;
      });
      var lv = $('#rt-level').value;
      if (!any && lv === '') { $('#rt-msg').textContent = 'Enter your level or at least one result.'; return; }
      var all = sessions();
      all.push({ id: uid(), skill: state.skill, date: $('#rt-date').value || todayStr(), level: lv === '' ? null : +lv, vals: vals });
      setSessions(all);
      var changed = lv !== '' && state.levels[state.skill] !== +lv;
      if (lv !== '') { state.levels[state.skill] = +lv; persist(); }
      renderRetest(); renderPlan(); renderSelftest();
      $('#rt-msg').innerHTML = 'Saved. ' + (changed ? 'New level &mdash; your plan changed. ' : 'Plan updated. ') + '<button type="button" class="btn ghost" data-go="plan">See plan</button>';
    } else if (t.classList.contains('del') && t.dataset.id) {
      setSessions(sessions().filter(function (r) { return r.id !== t.dataset.id; })); renderRetest(); renderPlan();
    } else if (t.id === 'lg-csv') download('flexibility-retests.csv', csv(), 'text/csv');
    else if (t.id === 'lg-json') download('flexibility-retests-backup.json', JSON.stringify(sessions(), null, 1), 'application/json');
  });

  /* ---------------- stretches ---------------- */
  function opt(v, l) { return '<option value="' + v + '">' + l + '</option>'; }
  $('#f-lim').innerHTML = opt('', 'Any target') + Object.keys(F.LIMITERS).map(function (k) { return opt(k, F.LIMITERS[k].label); }).join('');
  $('#f-m').innerHTML = opt('', 'Any method') + Object.keys(F.METHODS).map(function (k) { return opt(k, F.METHODS[k].label); }).join('');
  $('#f-spec').innerHTML = opt('', 'Assisted or resisted') + opt('assisted', 'Assisted') + opt('neutral', 'Neutral') + opt('resisted', 'Resisted');
  var catAll = false, catMethod = '';
  function renderCatalog() {
    var k = state.skill, fl = $('#f-lim').value, fm = $('#f-m').value || catMethod, fsp = $('#f-spec').value, q = $('#f-q').value.toLowerCase();
    var list = F.EX.filter(function (e) {
      return (catAll || e.sk.indexOf(k) >= 0) && (!fl || e.lim.indexOf(fl) >= 0) && (!fm || e.m === fm) &&
        (!fsp || spec(e) === fsp) && (!q || (e.n + ' ' + e.how).toLowerCase().indexOf(q) >= 0);
    });
    $('#cat-toggle').textContent = catAll ? 'Only ' + F.SKILLS[k].name.split(' (')[0] : 'Show all ' + F.EX.length;
    $('#count').textContent = (catAll ? 'All stretches' : F.SKILLS[k].name.split(' (')[0]) + ' · ' + list.length;
    $('#catalog').innerHTML = list.map(function (e) {
      var m = F.METHODS[e.m];
      return exItem(e, 0, m.label + ' &middot; ' + e.lim.map(function (l) { return F.LIMITERS[l].label; }).join(', ') + (e.lv ? ' &middot; level ' + e.lv + '+' : ''));
    }).join('') || '<li>No stretches match. Clear the filter.</li>';
  }
  function renderMatrix() {
    var sks = Object.keys(F.SKILLS), ms = Object.keys(F.METHODS);
    var h = '<table class="matrix"><tr><th></th>' + sks.map(function (k) { return '<th>' + F.SKILLS[k].name.split(' (')[0] + '</th>'; }).join('') + '</tr>';
    ms.forEach(function (m) {
      h += '<tr><th>' + F.METHODS[m].label + '</th>' + sks.map(function (k) {
        var n = F.EX.filter(function (e) { return e.m === m && e.sk.indexOf(k) >= 0; }).length;
        return '<td>' + (n ? '<button type="button" data-m="' + m + '" data-k="' + k + '">' + n + '</button>' : '&middot;') + '</td>';
      }).join('') + '</tr>';
    });
    $('#matrix').innerHTML = h + '</table>';
  }
  $('#cat-toggle').addEventListener('click', function () { catAll = !catAll; renderCatalog(); });
  ['#f-lim', '#f-m', '#f-spec'].forEach(function (s) { $(s).addEventListener('change', function () { catMethod = ''; renderCatalog(); }); });
  $('#f-q').addEventListener('input', renderCatalog);
  $('#f-clear').addEventListener('click', function () { $('#f-lim').value = ''; $('#f-m').value = ''; $('#f-spec').value = ''; $('#f-q').value = ''; catMethod = ''; renderCatalog(); });
  $('#matrix').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    state.skill = b.dataset.k; persist(); catAll = false; $('#f-m').value = b.dataset.m;
    renderSkills(); renderSelftest(); renderPlan(); renderRetest(); renderCatalog(); window.scrollTo(0, 0);
  });

  /* ---------------- sources & start ---------------- */
  $('#sources').innerHTML = F.SOURCES.map(function (s) {
    return '<li>' + s[0] + ' <a class="ext" href="' + s[1] + '" target="_blank" rel="noopener noreferrer">Link</a></li>';
  }).join('');

  renderSkills(); renderSettings(); renderSelftest(); renderPlan(); renderRetest(); renderCatalog(); renderMatrix(); setView(state.view);
})();
