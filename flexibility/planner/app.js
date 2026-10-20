/* Flexibility planner: assessment -> limiters -> stacked plan -> schedule
   -> timeline, plus a filterable catalog and a progress log.
   Data lives in data.js (window.FLEX). Saved answers and logs use
   localStorage on this device only; everything works without it. */
(function () {
  'use strict';
  var F = window.FLEX;
  var DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var DAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  var TYPES = [['rest', 'Rest'], ['upper', 'Upper lift'], ['lower', 'Lower lift'], ['full', 'Full-body lift'], ['cardio', 'Cardio / other']];
  var KEY = 'flexplanner-v1';
  var EX = {};
  F.EX.forEach(function (e) { EX[e.id] = e; });

  /* ---------------- storage (safe) ---------------- */
  function load(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  var state = load(KEY, null) || {};
  state.answers = state.answers || {};
  state.levels = state.levels || {};
  state.days = state.days || ['upper', 'lower', 'cardio', 'upper', 'lower', 'rest', 'rest'];
  if (state.noSun === undefined) state.noSun = true;
  state.n = state.n || 2;
  var qs = new URLSearchParams(location.search).get('skill');
  if (qs && F.SKILLS[qs]) state.skill = qs;
  state.skill = state.skill || 'pancake';
  function persist() { save(KEY, state); }

  /* ---------------- helpers ---------------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmtDate(d) { return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function weeksText(w) { return w < 9 ? Math.round(w) + ' weeks' : Math.round(w / 4.35) + ' months'; }

  function video(v, small) {
    var id = v[0];
    return '<div class="vf' + (small ? ' small' : '') + '" data-id="' + id + '">' +
      '<img src="https://i.ytimg.com/vi/' + id + '/hqdefault.jpg" alt="" loading="lazy">' +
      '<button type="button" class="play" aria-label="Play: ' + esc(v[1].replace(/&[a-z]+;/g, ' ')) + '"><span>&#9654;</span></button></div>' +
      '<p class="vcred">' + v[1] + ' &middot; ' + v[2] + '</p>';
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('.vf .play');
    if (!b) return;
    var box = b.closest('.vf');
    box.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + box.dataset.id +
      '?autoplay=1&rel=0" title="Video" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>';
    box.classList.add('on');
  });

  /* ---------------- assessment form ---------------- */
  function renderSkillPicker() {
    $('#skills').innerHTML = Object.keys(F.SKILLS).map(function (k) {
      return '<button type="button" class="skillbtn' + (k === state.skill ? ' on' : '') + '" data-skill="' + k + '">' + F.SKILLS[k].name + '</button>';
    }).join('');
  }
  $('#skills').addEventListener('click', function (e) {
    var b = e.target.closest('.skillbtn'); if (!b) return;
    state.skill = b.dataset.skill; persist();
    renderSkillPicker(); renderTests(); $('#plan').innerHTML = ''; $('#plan-wrap').hidden = true;
  });

  function radioGroup(name, opts, sel) {
    return '<div class="opts">' + opts.map(function (o, i) {
      return '<label class="opt"><input type="radio" name="' + name + '" value="' + i + '"' + (sel === i ? ' checked' : '') + '><span>' + o + '</span></label>';
    }).join('') + '</div>';
  }

  function renderTests() {
    var s = F.SKILLS[state.skill];
    var ans = state.answers[state.skill] || {};
    var lvl = state.levels[state.skill];
    var h = '<fieldset class="test lvl"><legend>Where are you now?</legend><p class="how">' + s.levelHow + '</p>' +
      radioGroup('level', s.levels.map(function (l, i) { return '<b>' + i + '</b> &middot; ' + l; }), lvl) + '</fieldset>';
    s.tests.forEach(function (k, idx) {
      var t = F.TESTS[k];
      h += '<fieldset class="test"><legend>' + (idx + 1) + '. ' + t.q + '</legend><p class="how">' + t.how + '</p>';
      if (t.video) h += '<details class="tvid"><summary>Show me</summary>' + video(findVideo(t.video), true) + '</details>';
      h += radioGroup('t_' + k, t.opts.map(function (o) { return o[0]; }), ans[k]) + '</fieldset>';
    });
    $('#tests').innerHTML = h;
  }
  function findVideo(id) {
    for (var i = 0; i < F.EX.length; i++) if (F.EX[i].v[0] === id) return F.EX[i].v;
    if (id === 'cPN3-FR-clk') return ['cPN3-FR-clk', 'Knee to Wall &ndash; Ankle Mobility Test', 'Rehab 2 Perform'];
    return [id, 'Demo', 'YouTube'];
  }
  $('#tests').addEventListener('change', function (e) {
    var n = e.target.name; if (!n) return;
    var v = parseInt(e.target.value, 10);
    if (n === 'level') state.levels[state.skill] = v;
    else { state.answers[state.skill] = state.answers[state.skill] || {}; state.answers[state.skill][n.slice(2)] = v; }
    persist();
  });

  function renderSchedule() {
    var h = '<div class="days">';
    DAYS.forEach(function (d, i) {
      h += '<label class="day"><span>' + d + '</span><select data-day="' + i + '">' + TYPES.map(function (t) {
        return '<option value="' + t[0] + '"' + (state.days[i] === t[0] ? ' selected' : '') + '>' + t[1] + '</option>';
      }).join('') + '</select></label>';
    });
    h += '</div><div class="row2"><label>Focused sessions per week <select id="nsess">' +
      [1, 2, 3].map(function (n) { return '<option' + (state.n === n ? ' selected' : '') + '>' + n + '</option>'; }).join('') +
      '</select></label><label class="chk"><input type="checkbox" id="nosun"' + (state.noSun ? ' checked' : '') + '> Keep Sunday free</label></div>';
    $('#sched-in').innerHTML = h;
  }
  $('#sched-in').addEventListener('change', function (e) {
    if (e.target.dataset.day) state.days[+e.target.dataset.day] = e.target.value;
    if (e.target.id === 'nsess') state.n = +e.target.value;
    if (e.target.id === 'nosun') state.noSun = e.target.checked;
    persist();
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

    return out.slice(0, 7);
    function push(e, role) { if (e) out.push({ e: e, role: role }); }
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

  /* ---------------- render plan ---------------- */
  $('#build').addEventListener('click', function () {
    var skill = state.skill, s = F.SKILLS[skill];
    var level = state.levels[skill];
    var msg = $('#build-msg');
    if (level == null) { msg.textContent = 'Pick where you are now (the first question) to build your plan.'; return; }
    msg.textContent = '';
    var ans = state.answers[skill] || {};
    var answered = s.tests.filter(function (k) { return ans[k] != null; }).length;
    var ranked = rankLimiters(skill, ans);
    var sig = ranked.filter(function (r) { return r.p >= 2; });
    var stack = buildStack(skill, level, ranked);
    var sched = schedule(skill);
    var mins = weeklyMinutes(stack, sched);
    var tl = timeline(skill, level, sig.length);
    var today = new Date();

    var h = '<nav class="ntoc"><a href="#p-sum">Summary</a><a href="#p-lim">Limiters</a><a href="#p-stack">Your stack</a>' +
      '<a href="#p-week">Week</a><a href="#p-between">Between sessions</a><a href="#p-prog">Progression</a><a href="#p-log">Track</a></nav>';

    // Summary
    h += '<h2 id="p-sum">' + s.name + ' plan</h2>';
    h += '<div class="sumgrid"><div><span>Now</span><b>Level ' + level + '</b><small>' + s.levels[level] + '</small></div>' +
      '<div><span>Goal</span><b>Level ' + (s.levels.length - 1) + '</b><small>' + s.levels[s.levels.length - 1] + '</small></div>' +
      '<div><span>Estimate</span><b>' + (tl ? weeksText(tl.lo) + '&ndash;' + weeksText(tl.hi) : 'There now') + '</b><small>' +
      (tl ? fmtDate(addDays(today, tl.lo * 7)) + ' &ndash; ' + fmtDate(addDays(today, tl.hi * 7)) : 'Maintain with one session a week') + '</small></div>' +
      '<div><span>Next retest</span><b>' + fmtDate(addDays(today, 28)) + '</b><small>Every 4 weeks</small></div></div>';
    if (answered < s.tests.length) h += '<p class="nnote">You answered ' + answered + ' of ' + s.tests.length + ' tests. The plan uses defaults for the rest &mdash; answer them all for a sharper plan.</p>';
    h += '<p class="meta">The estimate is a coaching rule of thumb, not a promise: research doesn&rsquo;t give timelines for these skills, and bone shape caps some people short of a full side split or pancake. Log your retests below and the page will re-estimate from your actual progress.</p>';

    // Limiters
    h += '<h2 id="p-lim">What&rsquo;s holding you back</h2>';
    if (!ranked.length) h += '<p>No clear limiter from your answers, so the plan targets the usual ones for this skill: ' + s.defaults.map(function (d) { return F.LIMITERS[d].label; }).join(', ') + '.</p>';
    else {
      var max = ranked[0].p;
      h += '<div class="bars">' + ranked.map(function (r) {
        return '<div class="bar"><span>' + F.LIMITERS[r.k].label + '</span><i style="width:' + Math.round(r.p / max * 100) + '%"></i><em>' + (r.p >= 2 ? 'main' : 'minor') + '</em></div>';
      }).join('') + '</div>';
      if (sig.some(function (r) { return r.k === 'technique'; }) && (skill === 'pancake' || skill === 'middle'))
        h += '<p class="nnote">A pinch at the hip often means bone, not muscle. Tilt the pelvis forward and turn the legs so the kneecaps face up; don&rsquo;t force through a block.</p>';
      if (sig.some(function (r) { return r.k === 'nerve'; }))
        h += '<p class="nnote">Nerve tension: floss gently and keep the head neutral while stretching hamstrings. Tingling that lingers means back off.</p>';
    }

    // Stack
    h += '<h2 id="p-stack">Your stack &mdash; do it in this order</h2>';
    h += '<p>Small and isolated first, the full skill position last &mdash; each step opens range for the next. The A1/A2 pair alternates an assisted stretch with a resisted exercise. Rest 60&ndash;90 s between exercises.</p>';
    h += '<ol class="stack">' + stack.map(function (it) {
      var e = it.e, m = F.METHODS[e.m];
      return '<li class="card-ex"><div class="exhead"><span class="role">' + it.role + '</span><h3>' + e.n + '</h3>' +
        '<p class="chips"><span>' + m.label + '</span><span>' + spec(e) + '</span><span>' + e.lim.map(function (l) { return F.LIMITERS[l].label; }).join(', ') + '</span></p></div>' +
        '<p class="dose"><b>Dose:</b> ' + dose(e, level) + ' &middot; <b>Rest:</b> ' + m.rest + '</p>' +
        '<p>' + e.how + ' <i>' + e.cue + '</i></p>' + (e.note ? '<p class="meta">' + e.note + '</p>' : '') + video(e.v) + '</li>';
    }).join('') + '</ol>';
    if (skill === 'front') h += '<p class="nnote">Do both sides. Start with the tighter side and give it one extra set.</p>';
    if (skill === 'bridge') h += '<p class="nnote">Backbend safety: build slowly, keep the bend spread through the upper back and hips, and stop for any sharp low-back pain.</p>';

    // Week
    h += '<h2 id="p-week">Your week</h2><table class="wk">' + sched.map(function (r) {
      return '<tr class="' + r.kind + '"><th>' + r.day + '</th><td><small>' + r.type + '</small><br>' + r.what + '</td></tr>';
    }).join('') + '</table>';
    var maintList = stack.filter(function (it) { return it.role === 'Isolated' || it.role === 'Prep'; }).slice(0, 3);
    h += '<p><b>Focus session:</b> the full stack above, about ' + Math.round(stack.reduce(function (a, it) { return a + F.METHODS[it.e.m].min + 1; }, 5)) + ' minutes with a 5-minute warm-up.</p>';
    h += '<p><b>Maintenance session:</b> one easy set each of ' + maintList.map(function (it) { return it.e.n; }).join(', ') + ' &mdash; about 60&ndash;70% effort.</p>';
    h += '<p><b>Between focus sessions:</b> at least 48 hours. Matt Smith&rsquo;s ranking for timing: 2+ days after training that loads the same areas is best; the evening of a lifting day is next; straight after lifting is last.</p>';
    var mk = Object.keys(mins).sort(function (a, b) { return mins[b] - mins[a]; }).slice(0, 4);
    if (mk.length) h += '<p><b>Weekly stretching time:</b> ' + mk.map(function (k) {
      return F.LIMITERS[k].label + ' ~' + mins[k] + ' min' + (mins[k] >= 10 ? ' &#10003;' : ' (aim for 10+)');
    }).join(' &middot; ') + '. Research found gains peaked around 10 minutes per muscle group per week.</p>';

    // Between
    h += '<h2 id="p-between">Between sessions</h2><ul>' + F.BETWEEN[s.region].concat(F.BETWEEN.all).map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>';

    // Progression
    h += '<h2 id="p-prog">Progression</h2><table class="wk">' +
      '<tr><th>Week 1</th><td>Lower end of each dose. Learn the positions.</td></tr>' +
      '<tr><th>Week 2</th><td>Middle of the range.</td></tr>' +
      '<tr><th>Week 3</th><td>Top of the range; add a little load to loaded stretches if every rep was clean.</td></tr>' +
      '<tr><th>Week 4</th><td>Deload &mdash; half the sets, easier effort. Retest at the end and rebuild the plan if your level changed.</td></tr></table>' +
      '<p>Once you reach the goal, keep it with one session a week &mdash; gains fade slowly but do fade when you stop entirely.</p>';

    // Log
    h += '<h2 id="p-log">Track your retests</h2>' +
      '<div class="logform"><label>Date <input type="date" id="log-date" value="' + today.toISOString().slice(0, 10) + '"></label>' +
      '<label>Level <select id="log-level">' + s.levels.map(function (l, i) { return '<option value="' + i + '"' + (i === level ? ' selected' : '') + '>' + i + '</option>'; }).join('') + '</select></label>' +
      '<label class="wide">Measurement / note <input type="text" id="log-note" placeholder="' + esc(s.measure) + '"></label>' +
      '<button type="button" id="log-add">Add entry</button></div><div id="log-list"></div>';
    h += '<p class="noprint"><button type="button" id="print">Print this plan</button></p>';

    $('#plan').innerHTML = h;
    $('#plan-wrap').hidden = false;
    renderLog();
    $('#plan-wrap').scrollIntoView({ behavior: 'smooth' });
  });

  /* ---------------- progress log ---------------- */
  function logKey() { return 'flexplanner-log-' + state.skill; }
  function renderLog() {
    var list = load(logKey(), []), s = F.SKILLS[state.skill], box = $('#log-list');
    if (!box) return;
    if (!list.length) { box.innerHTML = '<p class="meta">No entries yet. Saved on this device only.</p>'; return; }
    list.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var h = '<table class="wk">' + list.map(function (r, i) {
      return '<tr><th>' + esc(r.date) + '</th><td>Level ' + r.level + (r.note ? ' &middot; ' + esc(r.note) : '') +
        ' <button type="button" class="del" data-i="' + i + '" aria-label="Delete entry">&times;</button></td></tr>';
    }).join('') + '</table>';
    var first = list[0], last = list[list.length - 1], goal = s.levels.length - 1;
    var weeks = (new Date(last.date) - new Date(first.date)) / 6048e5;
    if (last.level >= goal) h += '<p class="nnote">Goal reached. Switch to one maintenance session a week.</p>';
    else if (list.length >= 2 && last.level > first.level && weeks > 0) {
      var rate = weeks / (last.level - first.level);
      var eta = addDays(new Date(last.date), rate * (goal - last.level) * 7);
      h += '<p class="nnote">From your own progress: about ' + weeksText(rate) + ' per level. Projected goal: <b>' + fmtDate(eta) + '</b>.</p>';
    } else if (list.length >= 2) h += '<p class="meta">No level change yet &mdash; plateaus of 4&ndash;5 weeks are normal. Keep the plan steady.</p>';
    box.innerHTML = h;
  }
  document.addEventListener('click', function (e) {
    if (e.target.id === 'log-add') {
      var list = load(logKey(), []);
      list.push({ date: $('#log-date').value, level: +$('#log-level').value, note: $('#log-note').value.slice(0, 120) });
      save(logKey(), list); $('#log-note').value = ''; renderLog();
    } else if (e.target.classList.contains('del')) {
      var l = load(logKey(), []); l.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      l.splice(+e.target.dataset.i, 1); save(logKey(), l); renderLog();
    } else if (e.target.id === 'print') window.print();
  });

  /* ---------------- catalog ---------------- */
  function opt(v, l) { return '<option value="' + v + '">' + l + '</option>'; }
  function renderFilters() {
    $('#f-skill').innerHTML = opt('', 'All skills') + Object.keys(F.SKILLS).map(function (k) { return opt(k, F.SKILLS[k].name); }).join('');
    $('#f-lim').innerHTML = opt('', 'All targets') + Object.keys(F.LIMITERS).map(function (k) { return opt(k, F.LIMITERS[k].label); }).join('');
    $('#f-m').innerHTML = opt('', 'All methods') + Object.keys(F.METHODS).map(function (k) { return opt(k, F.METHODS[k].label); }).join('');
    $('#f-spec').innerHTML = opt('', 'Assisted, neutral &amp; resisted') + opt('assisted', 'Assisted') + opt('neutral', 'Neutral') + opt('resisted', 'Resisted');
  }
  function renderCatalog() {
    var fs = $('#f-skill').value, fl = $('#f-lim').value, fm = $('#f-m').value, fsp = $('#f-spec').value, q = $('#f-q').value.toLowerCase();
    var list = F.EX.filter(function (e) {
      return (!fs || e.sk.indexOf(fs) >= 0) && (!fl || e.lim.indexOf(fl) >= 0) && (!fm || e.m === fm) &&
        (!fsp || spec(e) === fsp) && (!q || (e.n + ' ' + e.how).toLowerCase().indexOf(q) >= 0);
    });
    $('#count').textContent = list.length + ' of ' + F.EX.length + ' exercises';
    $('#catalog').innerHTML = list.map(function (e) {
      var m = F.METHODS[e.m];
      return '<article class="card-ex"><div class="exhead"><h3>' + e.n + '</h3>' +
        '<p class="chips"><span>' + m.label + '</span><span>' + spec(e) + '</span>' + (e.lv ? '<span>level ' + e.lv + '+</span>' : '') + '</p></div>' +
        '<p><b>Targets:</b> ' + e.lim.map(function (l) { return F.LIMITERS[l].label; }).join(', ') +
        '<br><b>Skills:</b> ' + e.sk.map(function (k) { return F.SKILLS[k].name; }).join(', ') + '</p>' +
        '<p>' + e.how + ' <i>' + e.cue + '</i></p><p class="dose"><b>Typical dose:</b> ' + m.dose[1] + '</p>' +
        (e.note ? '<p class="meta">' + e.note + '</p>' : '') + video(e.v) + '</article>';
    }).join('') || '<p>No exercises match. Clear a filter.</p>';
  }
  function renderMatrix() {
    var sks = Object.keys(F.SKILLS), ms = Object.keys(F.METHODS);
    var h = '<table class="matrix"><tr><th></th>' + sks.map(function (k) { return '<th>' + F.SKILLS[k].name.split(' (')[0].replace('&amp;', '&') + '</th>'; }).join('') + '</tr>';
    ms.forEach(function (m) {
      h += '<tr><th>' + F.METHODS[m].label + '</th>' + sks.map(function (k) {
        var n = F.EX.filter(function (e) { return e.m === m && e.sk.indexOf(k) >= 0; }).length;
        return '<td>' + (n ? '<button type="button" data-m="' + m + '" data-k="' + k + '">' + n + '</button>' : '&middot;') + '</td>';
      }).join('') + '</tr>';
    });
    $('#matrix').innerHTML = h + '</table>';
  }
  ['#f-skill', '#f-lim', '#f-m', '#f-spec'].forEach(function (s) { $(s).addEventListener('change', renderCatalog); });
  $('#f-q').addEventListener('input', renderCatalog);
  $('#matrix').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    $('#f-skill').value = b.dataset.k; $('#f-m').value = b.dataset.m; $('#f-lim').value = ''; $('#f-spec').value = ''; $('#f-q').value = '';
    renderCatalog(); $('#catalog-top').scrollIntoView({ behavior: 'smooth' });
  });
  $('#f-clear').addEventListener('click', function () {
    ['#f-skill', '#f-lim', '#f-m', '#f-spec'].forEach(function (s) { $(s).value = ''; }); $('#f-q').value = ''; renderCatalog();
  });

  /* ---------------- sources ---------------- */
  $('#sources').innerHTML = F.SOURCES.map(function (s) {
    return '<li>' + s[0] + ' <a class="ext" href="' + s[1] + '" target="_blank" rel="noopener noreferrer">Link</a></li>';
  }).join('');

  renderSkillPicker(); renderTests(); renderSchedule(); renderFilters(); renderCatalog(); renderMatrix();
})();
