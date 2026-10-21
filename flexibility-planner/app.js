/* Flexibility planner: Assess -> Plan -> Library.
   Self-test -> limiters -> 3-5 stretch stack -> week -> reassess every 4 weeks.
   Data lives in data.js (window.FLEX). Answers are saved in this browser
   (localStorage); everything still works without storage. */
(function () {
  'use strict';
  var F = window.FLEX;
  var DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var DAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  var TYPES = [['rest', 'Rest'], ['upper', 'Upper'], ['lower', 'Lower'], ['full', 'Full'], ['cardio', 'Cardio']];
  var KEY = 'flexplanner-v1';
  var SKILL_COLOR = { pike: '#d79921', pancake: '#d65d0e', middle: '#cc241d', front: '#b16286', bridge: '#458588', flexion: '#689d6a', extension: '#98971a', squat: '#a0522d' };
  var MCOLOR = { static: '#458588', pir: '#b16286', loaded: '#cc241d', iso: '#689d6a', isoreps: '#689d6a', active: '#98971a', strength: '#d65d0e',
    dynamic: '#d79921', ballistic: '#d65d0e', nerve: '#b16286', soft: '#928374', cars: '#d79921', technique: '#458588' };
  var ICON = {
    pike: '<line x1="5" y1="31" x2="35" y2="31"/><line x1="7" y1="29" x2="27" y2="21"/><circle cx="31" cy="20" r="3.4"/><line x1="15" y1="25" x2="32" y2="29"/>',
    pancake: '<line x1="20" y1="30" x2="3" y2="35"/><line x1="20" y1="30" x2="37" y2="35"/><line x1="20" y1="30" x2="20" y2="20"/><circle cx="20" cy="16" r="3.4"/><line x1="20" y1="23" x2="9" y2="30"/><line x1="20" y1="23" x2="31" y2="30"/>',
    middle: '<line x1="2" y1="33" x2="38" y2="33"/><line x1="20" y1="33" x2="20" y2="15"/><circle cx="20" cy="10.5" r="3.4"/><line x1="20" y1="20" x2="9" y2="15"/><line x1="20" y1="20" x2="31" y2="15"/>',
    front: '<line x1="3" y1="33" x2="37" y2="33"/><line x1="20" y1="33" x2="21" y2="15"/><circle cx="21.5" cy="10.5" r="3.4"/><line x1="21" y1="19" x2="16" y2="7"/><line x1="21" y1="19" x2="26" y2="7"/>',
    bridge: '<path d="M6 35 C6 12 34 12 34 35" fill="none"/><circle cx="9" cy="28" r="3.2"/>',
    flexion: '<line x1="20" y1="20" x2="20" y2="31"/><line x1="20" y1="31" x2="16" y2="38"/><line x1="20" y1="31" x2="24" y2="38"/><circle cx="20" cy="13" r="3.4"/><line x1="20" y1="19" x2="16" y2="3"/><line x1="20" y1="19" x2="24" y2="3"/>',
    extension: '<line x1="18" y1="17" x2="18" y2="30"/><line x1="18" y1="30" x2="15" y2="38"/><line x1="18" y1="30" x2="21" y2="38"/><circle cx="18" cy="10" r="3.4"/><line x1="18" y1="17" x2="30" y2="24"/><line x1="18" y1="18" x2="31" y2="27"/>',
    squat: '<line x1="13" y1="30" x2="9" y2="37"/><line x1="13" y1="30" x2="24" y2="27"/><line x1="24" y1="27" x2="25" y2="37"/><line x1="13" y1="30" x2="20" y2="15"/><circle cx="21" cy="10" r="3.4"/><line x1="19" y1="19" x2="30" y2="21"/>'
  };

  /* ---------------- storage ---------------- */
  function load(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  var state = load(KEY, null) || {};
  state.answers = state.answers || {};
  state.levels = state.levels || {};
  state.tested = state.tested || {};
  state.days = state.days || ['upper', 'lower', 'cardio', 'upper', 'lower', 'rest', 'rest'];
  if (state.noSun === undefined) state.noSun = false;
  state.n = state.n || 2;
  if (!state.sizeMode) state.sizeMode = 'auto';
  if (['assess', 'plan', 'library'].indexOf(state.view) < 0) state.view = null;
  var qs = new URLSearchParams(location.search).get('skill');
  if (qs && F.SKILLS[qs]) state.skill = qs;
  state.skill = state.skill || 'pancake';
  // carry over the date of the last logged retest from the old version
  var oldTests = load('flexplanner-tests-v1', []);
  Object.keys(state.levels).forEach(function (k) {
    if (state.tested[k]) return;
    var r = (Array.isArray(oldTests) ? oldTests : []).filter(function (x) { return x && x.skill === k && x.date; }).map(function (x) { return x.date; }).sort();
    state.tested[k] = r.length ? r[r.length - 1] : todayStr();
  });
  var hv = location.hash.slice(1);
  if (hv === 'assess' || hv === 'plan' || hv === 'library') state.view = hv;
  if (!state.view) state.view = state.levels[state.skill] == null ? 'assess' : 'plan';
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
  function short(k) { return F.SKILLS[k].name.split(' (')[0]; }
  function skc() { return SKILL_COLOR[state.skill]; }

  /* ---------------- pictures & "Show me how" ---------------- */
  function video(id, title, by) {
    return '<div class="vf" data-id="' + id + '"><img src="https://i.ytimg.com/vi/' + id + '/hqdefault.jpg" alt="" loading="lazy">' +
      '<button type="button" class="play" aria-label="Play video">&#9654;</button></div>' +
      (title ? '<p class="vcred">' + title + ' &middot; ' + by + '</p>' : '');
  }
  var howSeq = 0;
  function exItem(e, num, sub) {
    var id = 'h' + (++howSeq), m = F.METHODS[e.m];
    return '<li class="ex" style="--c:' + (MCOLOR[e.m] || '#458588') + '"><div class="exrow">' +
      '<button type="button" class="thumb" data-how="' + id + '" aria-label="Show me how: ' + esc(e.n.replace(/&[^;]+;/g, '')) + '">' +
      '<img src="https://i.ytimg.com/vi/' + e.v[0] + '/mqdefault.jpg" alt="" loading="lazy">' + (num ? '<span class="n">' + num + '</span>' : '') + '</button>' +
      '<div class="txt"><b>' + e.n + '</b><span class="tag">' + m.label + '</span><span class="dose">' + sub + '</span>' +
      '<button type="button" class="howbtn" aria-expanded="false" aria-controls="' + id + '">Show me how</button></div></div>' +
      '<div class="howbox" id="' + id + '" hidden><p>' + e.how + ' <i>' + e.cue + '</i></p>' +
      (e.note ? '<p class="muted">' + e.note + '</p>' : '') + '<div class="vslot" data-v="' + esc(JSON.stringify(e.v)) + '"></div></div></li>';
  }
  document.addEventListener('click', function (e) {
    var hb = e.target.closest('.howbtn, .thumb');
    if (hb) {
      var bid = hb.getAttribute('aria-controls') || hb.dataset.how, box = document.getElementById(bid);
      var btn = box.parentNode.querySelector('.howbtn'), open = box.hidden;
      box.hidden = !open; btn.setAttribute('aria-expanded', open); btn.textContent = open ? 'Hide' : 'Show me how';
      var slot = box.querySelector('.vslot');
      if (open && slot && !slot.innerHTML) { var v = JSON.parse(slot.dataset.v); slot.innerHTML = video(v[0], v[1], v[2]); }
      return;
    }
    var b = e.target.closest('.vf .play');
    if (b) {
      var vf = b.closest('.vf');
      vf.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + vf.dataset.id +
        '?autoplay=1&rel=0" title="Video" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>';
    }
  });

  /* ---------------- steps & skill tiles ---------------- */
  function setView(v) {
    state.view = v; persist();
    document.querySelectorAll('.steps button').forEach(function (b) { b.classList.toggle('on', b.dataset.view === v); b.setAttribute('aria-pressed', b.dataset.view === v); });
    ['assess', 'plan', 'library'].forEach(function (x) { $('#view-' + x).hidden = x !== v; });
    try { history.replaceState(null, '', '#' + v); } catch (e) {}
  }
  function go(v) { setView(v); var t = $('.steps').offsetTop; if (window.scrollY > t) window.scrollTo(0, t); }
  $('.steps').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) go(b.dataset.view); });
  document.addEventListener('click', function (e) { var t = e.target.closest('[data-go]'); if (t) go(t.dataset.go); });

  function renderSkills() {
    $('#skills').innerHTML = Object.keys(F.SKILLS).map(function (k) {
      var l = state.levels[k];
      return '<button type="button" class="skill' + (k === state.skill ? ' on' : '') + '" data-skill="' + k + '" style="--c:' + SKILL_COLOR[k] + '" aria-pressed="' + (k === state.skill) + '">' +
        '<svg viewBox="0 0 40 40" fill="none" stroke="' + SKILL_COLOR[k] + '" stroke-width="3" stroke-linecap="round" aria-hidden="true">' + ICON[k] + '</svg>' +
        '<span>' + short(k) + '</span><small>' + (l == null ? 'not assessed' : 'level ' + l + '/' + (F.SKILLS[k].levels.length - 1)) + '</small></button>';
    }).join('');
  }
  $('#skills').addEventListener('click', function (e) {
    var b = e.target.closest('.skill'); if (!b) return;
    state.skill = b.dataset.skill; persist();
    renderAll();
    if (state.levels[state.skill] == null && state.view === 'plan') setView('assess');
  });

  /* ---------------- assessment ---------------- */
  function radios(name, opts, sel) {
    return '<div class="radios" role="radiogroup">' + opts.map(function (o, i) {
      return '<label><input type="radio" name="' + name + '" value="' + i + '"' + (sel === i ? ' checked' : '') + '><span>' + o + '</span></label>';
    }).join('') + '</div>';
  }
  function renderAssess() {
    var s = F.SKILLS[state.skill], ans = state.answers[state.skill] || {}, lvl = state.levels[state.skill], c = skc();
    $('#lvl-box').style.setProperty('--c', c);
    $('#lvl-box').innerHTML = '<h3>' + s.name + ': where are you now?</h3><p class="lede">' + s.levelHow + '</p><ol class="ladder" style="--c:' + c + '">' +
      s.levels.map(function (l, i) {
        return '<li><label><input type="radio" name="level" value="' + i + '"' + (lvl === i ? ' checked' : '') + '><span class="lv">' + i + '</span><span>' + l + (i === s.levels.length - 1 ? ' <small class="muted">&middot; goal</small>' : '') + '</span></label></li>';
      }).join('') + '</ol>';
    $('#tests').innerHTML = s.tests.map(function (k) {
      var t = F.TESTS[k];
      return '<div class="q" style="--c:#458588"><b>' + t.q + '</b><details><summary>How to test</summary>' + t.how + (t.video ? video(t.video) : '') + '</details>' +
        radios('t_' + k, t.opts.map(function (o) { return o[0]; }), ans[k]) + '</div>';
    }).join('');
    updateCount();
  }
  function updateCount() {
    var s = F.SKILLS[state.skill], ans = state.answers[state.skill] || {};
    var n = s.tests.filter(function (k) { return ans[k] != null; }).length;
    $('#as-prog').style.width = (100 * n / s.tests.length) + '%';
    $('#as-count').textContent = n + ' of ' + s.tests.length + ' answered' + (n < s.tests.length ? ' — skip any you can’t test' : '');
  }
  $('#view-assess').addEventListener('change', function (e) {
    var n = e.target.name; if (!n || e.target.type !== 'radio') return;
    if (n === 'level') state.levels[state.skill] = +e.target.value;
    else { state.answers[state.skill] = state.answers[state.skill] || {}; state.answers[state.skill][n.slice(2)] = +e.target.value; }
    state.tested[state.skill] = todayStr();
    persist(); updateCount(); renderSkills(); renderPlan();
  });

  function renderSettings() {
    $('#settings').innerHTML = '<div class="days">' + DAYS.map(function (d, i) {
      return '<label class="day"><span>' + d + '</span><select data-day="' + i + '" aria-label="' + DAY_FULL[i] + '">' + TYPES.map(function (t) {
        return '<option value="' + t[0] + '"' + (state.days[i] === t[0] ? ' selected' : '') + '>' + t[1] + '</option>'; }).join('') + '</select></label>';
    }).join('') + '</div><div class="row2">' +
      '<label>Stretch sessions a week <select id="nsess">' + [1, 2, 3].map(function (n) { return '<option' + (state.n === n ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></label>' +
      '<label>Stretches per session <select id="nsize">' + [['auto', 'Auto (3–5)'], ['3', '3'], ['4', '4'], ['5', '5']].map(function (o) {
        return '<option value="' + o[0] + '"' + (String(state.sizeMode) === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>' +
      '<label><input type="checkbox" id="nosun"' + (state.noSun ? ' checked' : '') + '> Keep Sunday free</label></div>';
  }
  $('#settings').addEventListener('change', function (e) {
    if (e.target.dataset.day) state.days[+e.target.dataset.day] = e.target.value;
    if (e.target.id === 'nsess') state.n = +e.target.value;
    if (e.target.id === 'nsize') state.sizeMode = e.target.value;
    if (e.target.id === 'nosun') state.noSun = e.target.checked;
    persist(); renderPlan();
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
  function renderPlan() {
    var p = lastPlan = computePlan(state.skill), box = $('#plan-out'), c = skc();
    if (!p) {
      box.innerHTML = '<div class="box" style="--c:' + c + '"><h3>No plan yet for ' + short(state.skill) + '</h3><p>Pick your level in the assessment first. The self-test questions sharpen the plan.</p>' +
        '<button type="button" class="bigbtn" data-go="assess">Start the assessment</button></div>';
      return;
    }
    var s = p.s, rt = retestDate(p.skill), dn = daysUntil(rt), goal = s.levels.length - 1;
    var h = '<div class="stats">' +
      '<div class="stat" style="--c:' + c + '"><span>Level</span><b>' + p.level + ' &rarr; ' + goal + '</b><small>' + s.levels[p.level] + '</small></div>' +
      '<div class="stat" style="--c:var(--yellow)"><span>Goal in</span><b>' + (p.tl ? weeksText(p.tl.lo) + '&ndash;' + weeksText(p.tl.hi) : 'Done') + '</b><small>' +
        (p.tl ? shortDate(addDays(p.built, p.tl.lo * 7)) + '&ndash;' + shortDate(addDays(p.built, p.tl.hi * 7)) : 'One session a week keeps it') + '</small></div>' +
      '<div class="stat" style="--c:var(--orange)"><span>Reassess</span><b>' + shortDate(rt) + '</b><small>' + (dn <= 0 ? 'due now' : 'in ' + dn + ' days') + '</small></div></div>';
    h += '<div class="path" style="--c:' + c + '">' + s.levels.map(function (l, i) {
      return '<div class="' + (i < p.level ? 'done' : i === p.level ? 'now' : '') + (i === goal ? ' goal' : '') + '" title="' + esc(l.replace(/&[^;]+;/g, "'")) + '">' + (i === p.level ? 'You' : i === goal ? 'Goal' : i) + '</div>';
    }).join('') + '</div>';
    if (dn <= 0) h += '<div class="warm" style="border-left:5px solid var(--orange)"><b>Time to reassess.</b> Retake the self-test and update your answers; your plan rebuilds itself. <button type="button" class="btn ghost" data-go="assess">Open assessment</button></div>';

    // focus areas
    var top = p.ranked.slice(0, 5), max = top.length ? top[0].p : 1;
    h += '<h2 style="--c:var(--red)"><span class="dot"></span>Your focus areas</h2>';
    if (top.length) {
      h += '<div class="bars">' + top.map(function (r) {
        var col = r.p >= 3 ? 'var(--red)' : r.p >= 2 ? 'var(--orange)' : 'var(--yellow)';
        return '<div class="bar"><span>' + F.LIMITERS[r.k].label + '</span><div class="track"><i style="width:' + Math.max(12, 100 * r.p / max) + '%;background:' + col + '"></i></div></div>';
      }).join('') + '</div>';
    } else h += '<p class="lede">Typical for ' + short(p.skill) + ': ' + s.defaults.map(function (d) { return F.LIMITERS[d].label; }).join(', ') + '. Answer the self-test to find yours.</p>';

    // stack
    var mins = Math.round(p.stack.reduce(function (a, it) { return a + F.METHODS[it.e.m].min + 1; }, 4));
    h += '<h2 style="--c:var(--green)"><span class="dot"></span>Your stretches <small class="muted" style="font-size:.95rem;font-weight:400">&middot; about ' + mins + ' min, in order</small></h2>';
    if (p.warm.length) h += '<div class="warm"><b>Warm-up 3&ndash;5 min:</b> ' + p.warm.map(function (it) { return it.e.n; }).join(' and ') + '.</div>';
    h += '<ol class="exlist">' + p.stack.map(function (it, i) {
      return exItem(it.e, i + 1, dose(it.e, p.level) + ' &middot; rest ' + F.METHODS[it.e.m].rest);
    }).join('') + '</ol>';
    var notes = [];
    if (p.skill === 'front') notes.push('Both sides; one extra set on the tighter side.');
    if (p.skill === 'bridge') notes.push('Build slowly; stop for any sharp low-back pain.');
    if (p.sig.some(function (r) { return r.k === 'technique'; }) && (p.skill === 'pancake' || p.skill === 'middle'))
      notes.push('A hip pinch can be bone, not muscle: tilt the pelvis forward, kneecaps up, don&rsquo;t force it.');
    if (notes.length) h += '<p class="legend">' + notes.join(' ') + '</p>';

    // week
    h += '<h2 style="--c:var(--aqua)"><span class="dot"></span>Your week</h2><div class="week">' + p.sched.map(function (r) {
      var lab = r.kind === 'focus' ? 'Stretch' + (/evening/.test(r.what) ? '<br>eve' : '') : r.kind === 'maint' ? 'Easy' : 'Rest';
      return '<div class="' + r.kind + '"><b>' + r.day.slice(0, 3) + '</b>' + lab + '</div>';
    }).join('') + '</div>' +
      '<p class="legend"><i style="background:var(--orange)"></i>Full session<i style="background:var(--aqua)"></i>5&ndash;10 min easy &middot; Weeks 1&ndash;3 build up, week 4 lighter, then reassess.</p>';
    h += '<div class="btnrow"><button type="button" class="btn" id="card-open">Phone image</button><button type="button" class="btn ghost" id="print">Print</button>' +
      '<button type="button" class="btn ghost" data-go="library">All ' + short(p.skill).toLowerCase() + ' stretches</button></div><div id="card-panel" hidden></div>';
    box.innerHTML = h;
  }

  /* ---------------- print view & phone card ---------------- */
  function txt(html) { var d = document.createElement('textarea'); d.innerHTML = String(html).replace(/<[^>]+>/g, ''); return d.value; }
  function retestDate(skill) {
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var t = state.tested[skill] ? new Date(state.tested[skill] + 'T12:00') : today;
    t.setHours(0, 0, 0, 0);
    var d = addDays(t, 28);
    return d < today ? today : d;
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
      '<div class="hot"><span>Reassess</span><b>' + fmtDate(rt) + '</b><small>then every 4 weeks</small></div></div>';
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
    var dates = [rt, addDays(rt, 28), addDays(rt, 56)];
    h += '<h2>Reassessment sheet</h2><table class="pv-log"><tr><th>Self-test</th>' + dates.map(function (d) { return '<th>' + fmtDate(d) + '</th>'; }).join('') + '</tr>' +
      '<tr><td>Level (0&ndash;' + (s.levels.length - 1) + ')</td><td></td><td></td><td></td></tr>' +
      s.tests.map(function (k) { return '<tr><td>' + F.TESTS[k].q + '</td><td></td><td></td><td></td></tr>'; }).join('') +
      '</table><p class="pv-rules">On each date, warm up the same way, retake the self-test, and change your answers in the planner. The plan rebuilds itself.</p>';
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
    var INK = '#3c3836', BG = '#fbf1c7', MUTED = '#7c6f64', SOFT = '#ebdbb2', ORANGE = '#d65d0e', AQUA = '#689d6a', DARK = '#282828';
    var SC = SKILL_COLOR[p.skill] || ORANGE;
    var FF = '"EB Garamond", Georgia, serif';
    var f = function (wt, px) { ctx.font = wt + ' ' + Math.round(px * sc) + 'px ' + FF; };
    ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
    var rb = ['#cc241d', '#d65d0e', '#d79921', '#98971a', '#689d6a', '#458588', '#b16286'];
    rb.forEach(function (c, i) { ctx.fillStyle = c; ctx.fillRect(i * W / 7, 0, W / 7 + 1, 22); });
    ctx.fillStyle = INK; ctx.textBaseline = 'top';
    var y = M;
    // header
    f('600', 30); ctx.fillStyle = SC; ctx.fillText('FLEXIBILITY PLAN', M, y); y += 46 * sc;
    ctx.fillStyle = INK; f('700', 76);
    wrap(ctx, txt(s.name), W - 2 * M).forEach(function (l) { ctx.fillText(l, M, y); y += 84 * sc; });
    f('400', 34); ctx.fillStyle = MUTED;
    ctx.fillText('Level ' + p.level + '  →  goal level ' + (s.levels.length - 1), M, y); y += 44 * sc;
    wrap(ctx, 'Now: ' + txt(s.levels[p.level]), W - 2 * M).forEach(function (l) { ctx.fillText(l, M, y); y += 42 * sc; });
    y += 26 * sc;
    // retest block
    var rt = retestDate(p.skill), dn = daysUntil(rt), bh = 190 * sc;
    ctx.fillStyle = DARK; rrect(ctx, M, y, W - 2 * M, bh, 28); ctx.fill();
    ctx.fillStyle = ORANGE; rrect(ctx, M, y, 18, bh, 9); ctx.fill();
    ctx.fillStyle = BG; f('600', 28); ctx.fillStyle = '#fe8019'; ctx.fillText('NEXT REASSESSMENT', M + 40, y + 30 * sc); ctx.fillStyle = BG;
    f('700', 72); ctx.fillText(fmtDate(rt), M + 40, y + 66 * sc);
    f('400', 30); ctx.fillStyle = '#d5c4a1';
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
      if (row.kind === 'focus') { ctx.fillStyle = ORANGE; ctx.fill(); }
      else if (row.kind === 'maint') { ctx.fillStyle = '#d9e0b8'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = AQUA; ctx.stroke(); }
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
      ctx.fillStyle = MCOLOR[e.m] || SC; ctx.beginPath(); ctx.arc(M + 18 * sc, y + 20 * sc, 21 * sc, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = BG; ctx.textAlign = 'center'; f('700', 28); ctx.fillText(String(i + 1), M + 18 * sc, y + 5 * sc); ctx.textAlign = 'left'; f('700', 34); ctx.fillStyle = INK;
      var x = M + 52 * sc, w = W - M - x;
      wrap(ctx, txt(e.n), w).forEach(function (l) { ctx.fillText(l, x, y); y += 40 * sc; });
      f('400', 27); ctx.fillStyle = MUTED;
      wrap(ctx, txt(dose(e, p.level)) + '  ·  rest ' + txt(m.rest), w).forEach(function (l) { ctx.fillText(l, x, y); y += 34 * sc; });
      y += 16 * sc;
    });
    // footer
    var fy = Math.max(y + 10, H - M - 60);
    ctx.strokeStyle = '#d5c4a1'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(M, fy); ctx.lineTo(W - M, fy); ctx.stroke();
    f('400', 26); ctx.fillStyle = MUTED;
    ctx.fillText('Focus sessions 48 h+ apart  ·  week 4 lighter, then reassess', M, fy + 22);
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
    if (!lastPlan) return;
    if (t.id === 'print') { renderPrint(); window.print(); }
    else if (t.id === 'card-open') {
      var panel = $('#card-panel');
      panel.hidden = !panel.hidden;
      if (!panel.hidden) {
        panel.innerHTML = '<img id="card-img" alt="Phone image of this plan"><div class="btnrow" style="justify-content:center"><button type="button" class="btn" id="card-save">Save image</button>' +
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

  /* ---------------- library ---------------- */
  function opt(v, l) { return '<option value="' + v + '">' + l + '</option>'; }
  $('#f-lim').innerHTML = opt('', 'Any target') + Object.keys(F.LIMITERS).map(function (k) { return opt(k, F.LIMITERS[k].label); }).join('');
  $('#f-m').innerHTML = opt('', 'Any method') + Object.keys(F.METHODS).map(function (k) { return opt(k, F.METHODS[k].label); }).join('');
  var catAll = false;
  function renderCatalog() {
    var k = state.skill, fl = $('#f-lim').value, fm = $('#f-m').value, q = $('#f-q').value.toLowerCase();
    var list = F.EX.filter(function (e) {
      return (catAll || e.sk.indexOf(k) >= 0) && (!fl || e.lim.indexOf(fl) >= 0) && (!fm || e.m === fm) &&
        (!q || (e.n + ' ' + e.how).toLowerCase().indexOf(q) >= 0);
    });
    $('#cat-toggle').textContent = catAll ? 'Only ' + short(k) : 'Show all ' + F.EX.length;
    $('#count').textContent = (catAll ? 'All stretches' : short(k) + ' stretches') + ' · ' + list.length;
    $('#view-library h2').style.setProperty('--c', catAll ? 'var(--purple)' : skc());
    $('#catalog').innerHTML = list.map(function (e) {
      return exItem(e, 0, e.lim.map(function (l) { return F.LIMITERS[l].label; }).join(', ') + (e.lv ? ' &middot; level ' + e.lv + '+' : ''));
    }).join('') || '<li class="warm">No stretches match. Clear the filters.</li>';
  }
  function renderMatrix() {
    var sks = Object.keys(F.SKILLS), ms = Object.keys(F.METHODS);
    var h = '<table class="matrix"><tr><th></th>' + sks.map(function (k) { return '<th style="color:' + SKILL_COLOR[k] + '">' + short(k) + '</th>'; }).join('') + '</tr>';
    ms.forEach(function (m) {
      h += '<tr><th>' + F.METHODS[m].label + '</th>' + sks.map(function (k) {
        var n = F.EX.filter(function (e) { return e.m === m && e.sk.indexOf(k) >= 0; }).length;
        return '<td>' + (n ? '<button type="button" data-m="' + m + '" data-k="' + k + '">' + n + '</button>' : '&middot;') + '</td>';
      }).join('') + '</tr>';
    });
    $('#matrix').innerHTML = h + '</table>';
  }
  $('#cat-toggle').addEventListener('click', function () { catAll = !catAll; renderCatalog(); });
  ['#f-lim', '#f-m'].forEach(function (s) { $(s).addEventListener('change', renderCatalog); });
  $('#f-q').addEventListener('input', renderCatalog);
  $('#matrix').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    state.skill = b.dataset.k; persist(); catAll = false; $('#f-m').value = b.dataset.m;
    renderAll(); go('library');
  });

  /* ---------------- sources & start ---------------- */
  $('#sources').innerHTML = F.SOURCES.map(function (s) {
    return '<li>' + s[0] + ' <a href="' + s[1] + '" target="_blank" rel="noopener noreferrer">Link</a></li>';
  }).join('');

  function renderAll() { renderSkills(); renderAssess(); renderPlan(); renderCatalog(); }
  renderSettings(); renderMatrix(); renderAll(); setView(state.view);
})();
