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
  if (state.noSun === undefined) state.noSun = false;
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
    renderSkillPicker(); renderTests(); renderLogForm(); $('#plan').innerHTML = ''; $('#plan-wrap').hidden = true;
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
      '<a href="#p-week">Week</a><a href="#p-between">Between sessions</a><a href="#p-prog">Progression</a><a href="#p-log">Track</a><a href="#p-take">Phone card &amp; print</a></nav>';

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
    h += '<h2 id="p-log">Track your progress</h2><div id="plan-proj"></div>' +
      '<p class="noprint"><a class="linkbtn" href="#log-sec">Log a test session &rarr;</a></p>';
    h += '<h2 id="p-take">Take it with you</h2>' +
      '<p>A phone-sized card with your stack, your week and your retest date &mdash; save it to your photos. Or print a one-page plan with a blank retest sheet.</p>' +
      '<div class="take"><div class="cardprev"><img id="card-img" alt="Phone card for this plan"></div>' +
      '<div class="takebtns"><button type="button" class="bigbtn" id="card-save">Save phone image</button>' +
      '<button type="button" class="linkbtn" id="card-share" hidden>Share&hellip;</button>' +
      '<button type="button" class="linkbtn" id="print">Print plan</button></div></div>';

    $('#plan').innerHTML = h;
    lastPlan = { skill: skill, s: s, level: level, tl: tl, stack: stack, sched: sched, built: today };
    renderPrint(); renderCard();
    $('#plan-wrap').hidden = false;
    renderPlanProj();
    $('#plan-wrap').scrollIntoView({ behavior: 'smooth' });
  });

  /* ---------------- print view & phone card ---------------- */
  var lastPlan = null;
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
    h += '<h2>Focus session &mdash; in this order</h2><table class="pv-stack"><tr><th>#</th><th>Exercise</th><th>Dose</th><th>Rest</th><th>Cue</th></tr>' +
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
      }).join('') + '</table><p class="pv-rules">Same time of day and same warm-up each retest. Enter results in the Test log to update your projected date.</p>';
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
    ctx.fillStyle = INK; f('700', 40); ctx.fillText('Focus session, in order', M, y); y += 58 * sc;
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
    if (!lastPlan) return;
    if (e.target.id === 'card-save' && lastPlan.cardUrl) {
      var a = document.createElement('a'); a.href = lastPlan.cardUrl; a.download = cardName();
      document.body.appendChild(a); a.click(); a.remove();
    } else if (e.target.id === 'card-share' && lastPlan.cardBlob) {
      navigator.share({ files: [new File([lastPlan.cardBlob], cardName(), { type: 'image/png' })], title: 'Flexibility plan' }).catch(function () {});
    }
  });

  /* ---------------- test log ---------------- */
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

  function renderLogForm() {
    var k = state.skill, s = F.SKILLS[k], now = new Date();
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    var h = '<div class="lgtop"><label>Skill <select id="lg-skill">' + Object.keys(F.SKILLS).map(function (x) {
      return '<option value="' + x + '"' + (x === k ? ' selected' : '') + '>' + F.SKILLS[x].name + '</option>'; }).join('') + '</select></label>' +
      '<label>Date <input type="date" id="lg-date" value="' + now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + '"></label>' +
      '<label>Time <input type="time" id="lg-time" value="' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + '"></label>' +
      '<label>Level <select id="lg-level"><option value="">&ndash;</option>' + s.levels.map(function (l, i) {
        return '<option value="' + i + '"' + (state.levels[k] === i ? ' selected' : '') + '>' + i + ' &middot; ' + l + '</option>'; }).join('') + '</select></label>' +
      '<label>Feel today <select id="lg-feel"><option value="">&ndash;</option><option value="1">1 &middot; stiff / sore</option><option value="2">2</option><option value="3">3 &middot; normal</option><option value="4">4</option><option value="5">5 &middot; loose</option></select></label>' +
      '<label class="chk"><input type="checkbox" id="lg-warm" checked> Warmed up</label></div>';
    h += '<table class="mtable"><tr><th>Test</th><th>Left</th><th>Right</th></tr>' + F.SKILL_MEASURES[k].map(function (id) {
      var m = F.MEASURES[id];
      var label = '<b>' + m.label + '</b> <span class="unit">(' + m.unit + ', ' + (m.better === 'lower' ? 'lower' : 'higher') + ' is better)</span>' +
        '<details><summary>How</summary>' + m.how + '</details>';
      if (m.sides) return '<tr><td>' + label + '</td><td><input type="number" step="0.5" inputmode="decimal" data-m="' + id + '" data-s="L" aria-label="Left"></td>' +
        '<td><input type="number" step="0.5" inputmode="decimal" data-m="' + id + '" data-s="R" aria-label="Right"></td></tr>';
      return '<tr><td>' + label + '</td><td colspan="2"><input type="number" step="0.5" inputmode="decimal" data-m="' + id + '" data-s="v" aria-label="Value"></td></tr>';
    }).join('') + '</table>';
    h += '<label class="full">Notes <input type="text" id="lg-note" maxlength="200" placeholder="e.g. after lifting, tight left hip, new floor mark"></label>' +
      '<p><button type="button" class="bigbtn" id="lg-save">Save session</button> <span id="lg-msg" role="status"></span></p>';
    $('#log-form').innerHTML = h;
    renderHistory();
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

  function projectionHtml(k) {
    var rows = skillSessions(k), s = F.SKILLS[k];
    if (!rows.length) return '<p class="meta">No test sessions logged yet for this skill.</p>';
    var prim = F.SKILL_MEASURES[k][0], m = F.MEASURES[prim], tr = trend(rows, prim), h = '';
    if (tr) {
      var rate = Math.abs(tr.slope);
      h += '<p class="nnote"><b>' + m.label + ':</b> ' + (tr.improving ? 'improving' : 'not improving yet') +
        ' about ' + fmtN(rate) + ' ' + m.unit + ' per week' + (m.sides ? ' (tighter side)' : '') + '.';
      if (tr.reached) h += ' Goal reached.';
      else if (tr.eta) h += ' At this pace you reach ' + fmtN(m.goal) + ' ' + m.unit + ' around <b>' + fmtDate(tr.eta) + '</b>.';
      else if (!tr.improving) h += ' Plateaus of 4&ndash;5 weeks are normal &mdash; keep the plan steady.';
      h += '</p>';
    } else h += '<p class="meta">Log at least two sessions with &ldquo;' + m.label + '&rdquo; to see a trend.</p>';
    var lv = rows.filter(function (r) { return r.level != null && r.level !== ''; });
    if (lv.length >= 2) {
      var a = lv[0], b = lv[lv.length - 1], goal = s.levels.length - 1;
      var wk = (new Date(b.date) - new Date(a.date)) / 6048e5;
      if (+b.level >= goal) h += '<p class="nnote">Level goal reached. Keep one session a week.</p>';
      else if (+b.level > +a.level && wk > 0) h += '<p class="nnote">Levels: about ' + weeksText(wk / (b.level - a.level)) + ' per level; projected goal level around <b>' +
        fmtDate(addDays(new Date(b.date), wk / (b.level - a.level) * (goal - b.level) * 7)) + '</b>.</p>';
    }
    return h;
  }
  function renderPlanProj() { var b = $('#plan-proj'); if (b) b.innerHTML = projectionHtml(state.skill); }

  function renderHistory() {
    var k = state.skill, rows = skillSessions(k), box = $('#log-hist');
    if (!rows.length) { box.innerHTML = '<p class="meta">No sessions yet. Saved on this device only &mdash; use Export to keep a copy.</p>'; return; }
    var h = '<h3>Progress</h3>' + projectionHtml(k) + '<div class="mgrid">';
    F.SKILL_MEASURES[k].forEach(function (id) {
      var m = F.MEASURES[id], have = rows.filter(function (r) { return val(r, id) != null; });
      if (!have.length) return;
      var first = val(have[0], id), last = val(have[have.length - 1], id), prev = have.length > 1 ? val(have[have.length - 2], id) : null;
      var best = have.map(function (r) { return val(r, id); }).reduce(function (a, b) { return m.better === 'lower' ? Math.min(a, b) : Math.max(a, b); });
      var d = function (a, b) {
        if (a == null || b == null || have.length < 2) return '&ndash;';
        var x = b - a, good = m.better === 'lower' ? x < 0 : x > 0;
        return '<span class="' + (x === 0 ? '' : good ? 'up' : 'down') + '">' + (x > 0 ? '+' : '') + fmtN(x) + '</span>';
      };
      var lv = have[have.length - 1].vals[id];
      var latest = m.sides ? 'L ' + fmtN(num(lv.L)) + ' / R ' + fmtN(num(lv.R)) : fmtN(num(lv.v));
      h += '<div class="mcard"><b>' + m.label + '</b><span class="unit">' + m.unit + (m.goal != null ? ' &middot; goal ' + m.goal : '') + '</span>' +
        chart(have.map(function (r) { var c = Object.assign({}, r); c._id = id; return c; }), m) +
        '<table class="mini"><tr><td>Latest</td><td>' + latest + '</td></tr><tr><td>Since last</td><td>' + d(prev, last) + '</td></tr>' +
        '<tr><td>Since first</td><td>' + d(first, last) + '</td></tr><tr><td>Best</td><td>' + fmtN(best) + '</td></tr></table></div>';
    });
    h += '</div><p class="meta">Charts: up is always better. Solid = left (or single), dashed = right, line = goal. Two-sided changes use your tighter side.</p>';
    h += '<h3>Sessions</h3><div class="hscroll"><table class="htable"><tr><th>Date</th><th>Lvl</th><th>Feel</th>' +
      F.SKILL_MEASURES[k].map(function (id) { return '<th>' + F.MEASURES[id].label.split(':')[0] + '</th>'; }).join('') + '<th>Notes</th><th></th></tr>';
    rows.slice().reverse().forEach(function (r) {
      h += '<tr><td>' + esc(r.date) + (r.time ? '<br><small>' + esc(r.time) + '</small>' : '') + (r.warm === false ? '<br><small>cold</small>' : '') + '</td><td>' + (r.level == null || r.level === '' ? '&ndash;' : r.level) + '</td><td>' + (r.feel || '&ndash;') + '</td>' +
        F.SKILL_MEASURES[k].map(function (id) {
          var v = r.vals && r.vals[id], m = F.MEASURES[id];
          if (!v) return '<td>&ndash;</td>';
          return '<td>' + (m.sides ? fmtN(num(v.L)) + ' / ' + fmtN(num(v.R)) : fmtN(num(v.v))) + '</td>';
        }).join('') + '<td>' + esc(r.note || '') + '</td><td><button type="button" class="del" data-id="' + r.id + '" aria-label="Delete session">&times;</button></td></tr>';
    });
    box.innerHTML = h + '</table></div>';
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
    if (e.target.id === 'lg-skill') { state.skill = e.target.value; persist(); renderSkillPicker(); renderTests(); renderLogForm(); }
    if (e.target.id === 'lg-import' && e.target.files[0]) {
      var fr = new FileReader();
      fr.onload = function () {
        try {
          var inc = JSON.parse(fr.result); if (!Array.isArray(inc)) throw 0;
          var all = sessions(), ids = {}; all.forEach(function (r) { ids[r.id] = 1; });
          var added = 0;
          inc.forEach(function (r) { if (r && r.skill && r.date && !ids[r.id]) { r.id = r.id || uid(); all.push(r); added++; } });
          setSessions(all); renderHistory(); renderPlanProj();
          $('#lg-io-msg').textContent = 'Imported ' + added + ' session' + (added === 1 ? '' : 's') + '.';
        } catch (err) { $('#lg-io-msg').textContent = 'That file isn&rsquo;t a planner backup.'.replace('&rsquo;', '’'); }
        e.target.value = '';
      };
      fr.readAsText(e.target.files[0]);
    }
  });
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (t.id === 'lg-save') {
      var vals = {}, any = false;
      document.querySelectorAll('#log-form input[data-m]').forEach(function (inp) {
        var v = num(inp.value); if (v == null) return;
        vals[inp.dataset.m] = vals[inp.dataset.m] || {};
        vals[inp.dataset.m][inp.dataset.s] = v; any = true;
      });
      var lvl = $('#lg-level').value;
      if (!any && lvl === '') { $('#lg-msg').textContent = 'Enter at least one measurement or your level.'; return; }
      var all = sessions();
      all.push({ id: uid(), skill: state.skill, date: $('#lg-date').value, time: $('#lg-time').value, level: lvl === '' ? null : +lvl,
        feel: $('#lg-feel').value ? +$('#lg-feel').value : null, warm: $('#lg-warm').checked, note: $('#lg-note').value.slice(0, 200), vals: vals });
      setSessions(all);
      if (lvl !== '') { state.levels[state.skill] = +lvl; persist(); }
      document.querySelectorAll('#log-form input[data-m]').forEach(function (inp) { inp.value = ''; });
      $('#lg-note').value = '';
      $('#lg-msg').textContent = 'Saved.';
      renderHistory(); renderPlanProj(); renderPrint(); renderCard();
    } else if (t.classList.contains('del') && t.dataset.id) {
      if (!confirm('Delete this session?')) return;
      setSessions(sessions().filter(function (r) { return r.id !== t.dataset.id; })); renderHistory(); renderPlanProj();
    } else if (t.id === 'lg-csv') download('flexibility-tests.csv', csv(), 'text/csv');
    else if (t.id === 'lg-json') download('flexibility-tests-backup.json', JSON.stringify(sessions(), null, 1), 'application/json');
    else if (t.id === 'print') window.print();
    else if (t.closest && t.closest('a[href="#log-sec"]')) { /* plain anchor jump */ }
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

  renderSkillPicker(); renderTests(); renderSchedule(); renderFilters(); renderCatalog(); renderMatrix(); renderLogForm();
})();
