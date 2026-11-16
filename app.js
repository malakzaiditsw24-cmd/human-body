/* =========================================================
   app.js — منطق اللعبة: الاستكشاف + الاختبار + تركيب الأعضاء
   ========================================================= */
(() => {
  'use strict';

  /* ---------- أدوات عامة ---------- */
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const byId = id => ORGANS.find(o => o.id === id);
  const shuffle = a => {
    const r = [...a];
    for (let i = r.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [r[i], r[j]] = [r[j], r[i]];
    }
    return r;
  };
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* تجاهل */ } }
  };
  const fmtTime = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  /* ---------- الصوت ---------- */
  let muted = store.get('muted', false);
  let audioCtx = null;
  function tone(freq, start, dur, type = 'sine', vol = 0.14) {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type; o.frequency.value = freq;
    o.connect(g); g.connect(audioCtx.destination);
    const t = audioCtx.currentTime + start;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur);
  }
  function sfx(kind) {
    if (muted) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (kind === 'good') { tone(660, 0, .12); tone(880, .1, .18); }
      else if (kind === 'bad') { tone(220, 0, .22, 'square', .08); }
      else if (kind === 'pop') { tone(520, 0, .08, 'triangle', .1); }
      else if (kind === 'win') { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * .13, .25)); }
    } catch { /* الصوت غير مدعوم */ }
  }
  const muteBtn = $('#muteBtn');
  const paintMute = () => { muteBtn.textContent = muted ? '🔇' : '🔊'; };
  muteBtn.addEventListener('click', () => { muted = !muted; store.set('muted', muted); paintMute(); sfx('pop'); });
  paintMute();

  /* ---------- قصاصات احتفال + نافذة منبثقة ---------- */
  function confetti() {
    const icons = ['🎉', '⭐', '✨', '💖', '🫀', '🧠', '🎈'];
    for (let i = 0; i < 40; i++) {
      const s = document.createElement('span');
      s.className = 'confetti';
      s.textContent = icons[i % icons.length];
      s.style.left = Math.random() * 100 + 'vw';
      s.style.animationDuration = (2 + Math.random() * 2) + 's';
      s.style.animationDelay = Math.random() * .6 + 's';
      document.body.appendChild(s);
      setTimeout(() => s.remove(), 5000);
    }
  }
  const modal = $('#modal');
  function showModal(html) { $('#modalCard').innerHTML = html; modal.hidden = false; }
  function hideModal() { modal.hidden = true; }
  modal.addEventListener('click', e => { if (e.target === modal || e.target.closest('[data-close]')) hideModal(); });

  /* ---------- رسم الجسم ---------- */
  const bodySVG = (uid, organsMarkup) =>
    `<svg viewBox="0 0 400 800" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="جسم الإنسان">${BODY_BASE(uid)}${organsMarkup}</svg>`;

  /* صناديق الأعضاء (تُحسب مرة واحدة والجسم ظاهر) لاستخدامها في الصور المصغّرة */
  const boxes = {};
  function computeBoxes() {
    $$('#exploreBody .organ').forEach(g => {
      const b = g.getBBox();
      boxes[g.dataset.id] = [b.x - 8, b.y - 8, b.width + 16, b.height + 16];
    });
  }
  const miniSVG = o => `<svg viewBox="${boxes[o.id].join(' ')}" preserveAspectRatio="xMidYMid meet">${o.shape}</svg>`;

  /* ---------- التبويبات ---------- */
  let activeTab = 'explore';
  const quizState = { inited: false };
  const build = { inited: false };

  function showTab(t) {
    activeTab = t;
    $$('.view').forEach(v => v.classList.toggle('active', v.id === t));
    $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
    if (t === 'quiz' && !quizState.inited) { quizState.inited = true; renderQuizStart(); }
    if (t === 'build' && !build.inited) { build.inited = true; resetBuild(); }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  $('#tabs').addEventListener('click', e => {
    const b = e.target.closest('.tab');
    if (b) { sfx('pop'); showTab(b.dataset.tab); }
  });

  /* =========================================================
     1) الاستكشاف
     ========================================================= */
  const explored = new Set(store.get('explored', []));
  let selected = null;

  function initExplore() {
    $('#exploreBody').innerHTML = bodySVG('e', ORGANS.map(o =>
      `<g class="organ" data-id="${o.id}" tabindex="0" role="button" aria-label="${o.name}">${o.shape}</g>`).join(''));
    computeBoxes();

    const holder = $('#exploreBody');
    holder.addEventListener('click', e => {
      const g = e.target.closest('.organ');
      if (g) selectOrgan(g.dataset.id);
    });
    holder.addEventListener('keydown', e => {
      const g = e.target.closest('.organ');
      if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); selectOrgan(g.dataset.id); }
    });

    /* اسم العضو عند تمرير الماوس */
    const tip = $('#tooltip'), wrap = holder.parentElement;
    holder.addEventListener('mousemove', e => {
      const g = e.target.closest('.organ');
      if (!g) { tip.hidden = true; return; }
      const r = wrap.getBoundingClientRect();
      tip.textContent = byId(g.dataset.id).name;
      tip.style.left = (e.clientX - r.left) + 'px';
      tip.style.top = (e.clientY - r.top) + 'px';
      tip.hidden = false;
    });
    holder.addEventListener('mouseleave', () => { tip.hidden = true; });

    /* فلتر الأجهزة */
    $('#sysChips').innerHTML =
      `<button class="chip-f active" data-sys="all" style="--c:#475569"><i></i>الكل</button>` +
      Object.entries(SYSTEMS).map(([k, s]) =>
        `<button class="chip-f" data-sys="${k}" style="--c:${s.color}"><i></i>${s.name}</button>`).join('');
    $('#sysChips').addEventListener('click', e => {
      const b = e.target.closest('.chip-f');
      if (!b) return;
      $$('.chip-f').forEach(x => x.classList.toggle('active', x === b));
      const sys = b.dataset.sys;
      $$('#exploreBody .organ').forEach(g => g.classList.toggle('dim', sys !== 'all' && byId(g.dataset.id).sys !== sys));
      sfx('pop');
    });

    renderInfo();
  }

  function selectOrgan(id) {
    selected = id;
    explored.add(id);
    store.set('explored', [...explored]);
    $$('#exploreBody .organ').forEach(g => g.classList.toggle('selected', g.dataset.id === id));
    renderInfo();
    sfx('pop');
    if (window.matchMedia('(max-width: 900px)').matches) $('#info').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function progressHTML() {
    const n = explored.size, t = ORGANS.length;
    return `<div class="progress"><small>🏅 اكتشفت ${n} من ${t} عضوًا ${n === t ? '— أنت خبير الآن! جرّب الاختبار 🎓' : ''}</small>
            <div class="bar"><i style="width:${(n / t) * 100}%"></i></div></div>`;
  }

  function renderInfo() {
    const box = $('#info');
    if (!selected) {
      box.innerHTML = `
        <div class="welcome">
          <div class="big">🧑‍🔬</div>
          <h2>أهلًا أيها المستكشف!</h2>
          <p>اضغط على أي عضو في الجسم لتتعرف على وظيفته ومكانه ومعلومة طريفة عنه.<br>
             الألوان تدل على الجهاز الذي ينتمي إليه العضو، ويمكنك التصفية من الأزرار أعلى الجسم.</p>
          <div class="row-btns"><button class="btn big" id="tourBtn">🚀 ابدأ الجولة من الرأس إلى القدم</button></div>
        </div>${progressHTML()}`;
      $('#tourBtn').addEventListener('click', () => selectOrgan(TOUR[0]));
      return;
    }
    const o = byId(selected), s = SYSTEMS[o.sys];
    const idx = TOUR.indexOf(o.id);
    box.innerHTML = `
      <div class="info-head" style="--c:${s.color}">
        <div class="mini">${miniSVG(o)}</div>
        <div><h2>${o.name} ${o.emoji}</h2><span class="badge">${s.name}</span></div>
      </div>
      <div class="info-block"><h3>💼 ما وظيفته؟</h3><p>${o.desc}</p></div>
      <div class="info-block"><h3>📍 أين يقع؟</h3><p>${o.where}</p></div>
      <div class="info-block fact"><h3>💡 هل تعلم؟</h3><p>${o.fact}</p></div>
      <div class="nav-row">
        <button class="btn soft" id="prevBtn">→ السابق</button>
        <button class="btn" id="nextBtn">التالي ←</button>
      </div>${progressHTML()}`;
    $('#prevBtn').addEventListener('click', () => selectOrgan(TOUR[(idx - 1 + TOUR.length) % TOUR.length]));
    $('#nextBtn').addEventListener('click', () => selectOrgan(TOUR[(idx + 1) % TOUR.length]));
  }

  /* =========================================================
     2) الاختبار — أسئلة عشوائية
     ========================================================= */
  const quiz = { list: [], i: 0, score: 0, wrong: [], count: 10, locked: false };

  function makeQuestions(n) {
    const sysKeys = Object.keys(SYSTEMS);
    const all = [];
    ORGANS.forEach(o => {
      const others = shuffle(ORGANS.filter(x => x.id !== o.id)).slice(0, 3);
      all.push({ organ: o.id, q: `ما العضو المسؤول عن هذه المهمة: «${o.fn}»؟`,
                 options: [o.name, ...others.map(x => x.name)], answer: 0, explain: `${o.name}: ${o.fn}.` });
      if (!o.noSystemQ) {
        const sw = shuffle(sysKeys.filter(k => k !== o.sys)).slice(0, 3);
        all.push({ organ: o.id, q: `إلى أي جهاز من أجهزة الجسم ينتمي: ${o.name}؟`,
                   options: [SYSTEMS[o.sys].name, ...sw.map(k => SYSTEMS[k].name)], answer: 0,
                   explain: `${o.name} جزء من ${SYSTEMS[o.sys].name}.` });
      }
      all.push({ organ: o.id, q: o.quiz.q, options: [o.quiz.a, ...o.quiz.w], answer: 0, explain: `💡 ${o.fact}` });
    });
    /* سؤال واحد لكل عضو كحد أقصى لتنويع الأسئلة */
    const used = new Set(), picked = [];
    for (const q of shuffle(all)) {
      if (used.has(q.organ)) continue;
      used.add(q.organ); picked.push(q);
      if (picked.length >= n) break;
    }
    return picked.map(q => {
      const correct = q.options[q.answer];
      const opts = shuffle(q.options);
      return { ...q, options: opts, answer: opts.indexOf(correct) };
    });
  }

  function renderQuizStart() {
    const best = store.get('quizBest', null);
    $('#quizBox').innerHTML = `
      <div class="quiz-start center">
        <div style="font-size:4rem">🎯</div>
        <h2>اختبر معلوماتك عن جسم الإنسان</h2>
        <p>أسئلة عشوائية في كل مرة عن وظائف الأعضاء وأماكنها وأجهزتها.<br>اختر عدد الأسئلة ثم ابدأ!</p>
        <div class="count-pick" id="countPick">
          ${[5, 10, 16].map(n => `<button data-n="${n}" class="${quiz.count === n ? 'on' : ''}">${n === 16 ? 'كل الأعضاء (16)' : n + ' أسئلة'}</button>`).join('')}
        </div>
        <button class="btn big" id="startQuiz">ابدأ الاختبار 🚀</button>
        ${best ? `<p class="best">🏆 أفضل نتيجة لك: ${best.score} من ${best.total}</p>` : ''}
      </div>`;
    $('#countPick').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      quiz.count = +b.dataset.n;
      $$('#countPick button').forEach(x => x.classList.toggle('on', x === b));
      sfx('pop');
    });
    $('#startQuiz').addEventListener('click', startQuiz);
  }

  function startQuiz() {
    quiz.list = makeQuestions(quiz.count);
    quiz.i = 0; quiz.score = 0; quiz.wrong = [];
    sfx('pop');
    renderQuestion();
  }

  function renderQuestion() {
    const q = quiz.list[quiz.i];
    quiz.locked = false;
    const letters = ['أ', 'ب', 'ج', 'د'];
    $('#quizBox').innerHTML = `
      <div class="q-top"><span>السؤال ${quiz.i + 1} / ${quiz.list.length}</span><span>⭐ ${quiz.score}</span></div>
      <div class="bar"><i style="width:${(quiz.i / quiz.list.length) * 100}%"></i></div>
      <div class="q-text">${q.q}</div>
      <div class="options">
        ${q.options.map((t, i) => `<button class="opt" data-i="${i}"><b>${letters[i]}</b><span>${t}</span></button>`).join('')}
      </div>
      <div id="qFeedback"></div>`;
    $$('.opt').forEach(b => b.addEventListener('click', () => answer(+b.dataset.i)));
  }

  function answer(i) {
    if (quiz.locked) return;
    quiz.locked = true;
    const q = quiz.list[quiz.i];
    const ok = i === q.answer;
    $$('.opt').forEach((b, k) => {
      b.disabled = true;
      if (k === q.answer) b.classList.add('ok');
      else if (k === i) b.classList.add('no');
    });
    if (ok) { quiz.score++; sfx('good'); }
    else { quiz.wrong.push(q.organ); sfx('bad'); }
    const last = quiz.i === quiz.list.length - 1;
    $('#qFeedback').innerHTML = `
      <div class="explain ${ok ? '' : 'bad'}"><b>${ok ? '✅ إجابة صحيحة، أحسنت!' : '❌ إجابة خاطئة.'}</b><br>${q.explain}</div>
      <div class="q-actions"><button class="btn" id="nextQ">${last ? 'عرض النتيجة 🏁' : 'السؤال التالي ←'}</button></div>`;
    $('#nextQ').addEventListener('click', () => { quiz.i++; last ? renderResult() : renderQuestion(); });
  }

  function renderResult() {
    const total = quiz.list.length, pct = quiz.score / total;
    const stars = pct >= .9 ? 3 : pct >= .6 ? 2 : pct > 0 ? 1 : 0;
    const msg = pct >= .9 ? 'رائع جدًا! أنت طبيب المستقبل 👨‍⚕️' : pct >= .6 ? 'ممتاز! أنت على الطريق الصحيح 👏' : 'محاولة جيدة! راجع الأعضاء وجرّب مرة أخرى 💪';
    const best = store.get('quizBest', null);
    const isBest = !best || quiz.score / total >= best.score / best.total;
    if (isBest) store.set('quizBest', { score: quiz.score, total });
    if (pct >= .6) { confetti(); sfx('win'); }
    const wrongOrgans = [...new Set(quiz.wrong)];
    $('#quizBox').innerHTML = `
      <div class="center">
        <div class="stars">${'⭐'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>
        <div class="score-big">${quiz.score} / ${total}</div>
        <p style="margin-top:8px;font-weight:700">${msg}</p>
        ${wrongOrgans.length ? `<p style="margin-top:14px;color:var(--muted)">أعضاء تحتاج مراجعة (اضغط لتتعلم عنها):</p>
          <div class="review">${wrongOrgans.map(id => `<button data-id="${id}">${byId(id).emoji} ${byId(id).name}</button>`).join('')}</div>` : ''}
        <div class="row-btns">
          <button class="btn big" id="again">🔄 اختبار جديد</button>
          <button class="btn soft big" id="toExplore">🔍 العودة للاستكشاف</button>
        </div>
      </div>`;
    $('#again').addEventListener('click', startQuiz);
    $('#toExplore').addEventListener('click', () => showTab('explore'));
    $$('.review button').forEach(b => b.addEventListener('click', () => { showTab('explore'); selectOrgan(b.dataset.id); }));
  }

  /* =========================================================
     3) تركيب الأعضاء — اسحب كل عضو إلى مكانه
     ========================================================= */
  Object.assign(build, { placed: new Set(), miss: 0, hints: 0, elapsed: 0, started: false, done: false, selected: null, guide: true });

  function resetBuild() {
    Object.assign(build, { miss: 0, hints: 0, elapsed: 0, started: false, done: false, selected: null });
    build.placed.clear();

    $('#buildBody').innerHTML = bodySVG('b', ORGANS.map(o =>
      `<g class="slot ghost" data-id="${o.id}">${o.shape}</g>`).join(''));
    $('#buildBody').classList.toggle('noguide', !build.guide);

    const tray = $('#tray');
    tray.innerHTML = '';
    shuffle(ORGANS).forEach(o => {
      const c = document.createElement('div');
      c.className = 'chip';
      c.dataset.id = o.id;
      c.innerHTML = `${miniSVG(o)}<span>${o.name}</span>`;
      tray.appendChild(c);
      bindChip(c);
    });
    $('#bTotal').textContent = ORGANS.length;
    setMsg('ابدأ! اختر عضوًا من الأسفل وضعه في مكانه الصحيح 👇');
    updateHUD();
  }

  function setMsg(text, kind = '') {
    const m = $('#bMsg');
    m.textContent = text;
    m.className = 'bmsg ' + kind;
  }
  function updateHUD() {
    $('#bTime').textContent = fmtTime(build.elapsed);
    $('#bDone').textContent = build.placed.size;
    $('#bMiss').textContent = build.miss;
    $('#bBar').style.width = (build.placed.size / ORGANS.length) * 100 + '%';
  }
  setInterval(() => {
    if (activeTab === 'build' && build.started && !build.done) { build.elapsed++; updateHUD(); }
  }, 1000);

  function selectChip(chip) {
    $$('.chip').forEach(c => c.classList.remove('selected'));
    if (build.selected === chip) { build.selected = null; return; }
    chip.classList.add('selected');
    build.selected = chip;
    sfx('pop');
    setMsg(`اخترت «${byId(chip.dataset.id).name}» — اضغط على مكانه في الجسم 👆`);
  }

  function bindChip(chip) {
    chip.addEventListener('pointerdown', e => {
      if (build.done) return;
      e.preventDefault();
      build.started = true;
      const sx = e.clientX, sy = e.clientY;
      let ghost = null, moved = false;
      chip.setPointerCapture(e.pointerId);

      const move = ev => {
        if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 6) {
          moved = true;
          ghost = chip.cloneNode(true);
          ghost.classList.add('drag-ghost');
          document.body.appendChild(ghost);
          chip.classList.add('dragging');
        }
        if (moved) { ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px'; }
      };
      const up = ev => {
        chip.removeEventListener('pointermove', move);
        chip.removeEventListener('pointerup', up);
        chip.removeEventListener('pointercancel', up);
        if (ghost) ghost.remove();
        chip.classList.remove('dragging');
        if (moved) tryDrop(chip, ev.clientX, ev.clientY);
        else selectChip(chip);
      };
      chip.addEventListener('pointermove', move);
      chip.addEventListener('pointerup', up);
      chip.addEventListener('pointercancel', up);
    });
  }

  /* الضغط على الجسم لوضع العضو المحدد (للجوال) */
  $('#buildBody').addEventListener('click', e => {
    if (build.selected && !build.done) tryDrop(build.selected, e.clientX, e.clientY);
  });

  function tryDrop(chip, x, y) {
    const id = chip.dataset.id;
    const slot = $(`#buildBody .slot[data-id="${id}"]`);
    const els = document.elementsFromPoint(x, y);
    const overBody = els.some(el => el.closest && (el.closest('.bodybase') || el.closest('.slot')));
    let hit = els.some(el => el.closest && el.closest('.slot') === slot);
    if (!hit) { /* تسامح إضافي للأعضاء الصغيرة جدًا */
      const r = slot.getBoundingClientRect();
      const pad = (r.width < 40 || r.height < 40) ? 16 : 0;
      hit = pad > 0 && x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
    }
    if (hit) place(chip, slot);
    else if (overBody) wrong(chip);
  }

  function place(chip, slot) {
    const o = byId(chip.dataset.id);
    slot.classList.remove('ghost', 'hint');
    slot.classList.add('filled');
    chip.classList.add('placed');
    chip.classList.remove('selected');
    build.selected = null;
    build.placed.add(o.id);
    setMsg(`✅ أحسنت! ${o.name} ${o.emoji} — ${o.fn}.`, 'ok');
    sfx('good');
    updateHUD();
    if (build.placed.size === ORGANS.length) finishBuild();
  }

  function wrong(chip) {
    build.miss++;
    chip.classList.add('shake');
    setTimeout(() => chip.classList.remove('shake'), 500);
    setMsg('❌ ليس هنا! فكّر في مكان العضو وحاول مرة أخرى.', 'no');
    sfx('bad');
    updateHUD();
  }

  $('#hintBtn').addEventListener('click', () => {
    if (build.done) return;
    const chip = build.selected || shuffle($$('.chip:not(.placed)'))[0];
    if (!chip) return;
    const slot = $(`#buildBody .slot[data-id="${chip.dataset.id}"]`);
    slot.classList.add('hint');
    setTimeout(() => slot.classList.remove('hint'), 2600);
    build.hints++; build.started = true;
    setMsg(`💡 مكان «${byId(chip.dataset.id).name}» يضيء الآن في الجسم!`);
    sfx('pop');
  });
  $('#guideBtn').addEventListener('click', e => {
    build.guide = !build.guide;
    $('#buildBody').classList.toggle('noguide', !build.guide);
    e.currentTarget.textContent = `👁️ الخطوط الإرشادية: ${build.guide ? 'تشغيل' : 'إيقاف (تحدٍّ!)'}`;
    sfx('pop');
  });
  $('#restartBtn').addEventListener('click', () => { sfx('pop'); resetBuild(); });

  function finishBuild() {
    build.done = true;
    const penalty = build.miss + build.hints;
    const stars = penalty <= 1 ? 3 : penalty <= 5 ? 2 : 1;
    const best = store.get('buildBest', null);
    const newBest = !best || build.elapsed < best;
    if (newBest) store.set('buildBest', build.elapsed);
    sfx('win'); confetti();
    showModal(`
      <div style="font-size:3.4rem">🎉</div>
      <h2>أحسنت! ركّبت الجسم كاملًا</h2>
      <div class="stars">${'⭐'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>
      <p>⏱️ الوقت: <b>${fmtTime(build.elapsed)}</b> &nbsp;·&nbsp; ❌ الأخطاء: <b>${build.miss}</b> &nbsp;·&nbsp; 💡 التلميحات: <b>${build.hints}</b></p>
      <p style="margin-top:8px">${newBest ? '🏆 هذا أفضل وقت لك!' : '🏆 أفضل وقت: ' + fmtTime(best)}</p>
      <div class="row-btns">
        <button class="btn big" id="mAgain">🔄 العب مرة أخرى</button>
        <button class="btn soft big" data-close>إغلاق</button>
      </div>`);
    $('#mAgain').addEventListener('click', () => { hideModal(); resetBuild(); });
  }

  /* ---------- تشغيل ---------- */
  initExplore();
})();
