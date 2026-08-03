/* ============================================================
   生日网站《我们的第三年》主逻辑
   依赖：assets/data.js（CONFIG/TIMELINE/ALBUMS/SECRET_INTRO/QUIZ/REWARDS/FINALE）
        assets/lyrics.js（LYRICS/FIREWORK_LYRIC_INDEX）
   纯原生 JS，无框架无外链；音效与八音盒生日歌全部 Web Audio 合成
   ============================================================ */
/* global CONFIG, TIMELINE, ALBUMS, SECRET_INTRO, QUIZ, REWARDS, FINALE, LYRICS, FIREWORK_LYRIC_INDEX */
(function () {
'use strict';

var $ = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
function ce(tag, cls, html) {
  var d = document.createElement(tag);
  if (cls) d.className = cls;
  if (html != null) d.innerHTML = html;
  return d;
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

/* ============================================================
   一、Web Audio 引擎（AudioContext 在第 1 幕点击里初始化）
   ============================================================ */
var AC = window.AudioContext || window.webkitAudioContext;
var AudioKit = {
  ctx: null, sfxGain: null, musicGain: null, noiseBuf: null, ok: false, muted: false,
  init: function () {
    if (!AC) return;
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try { this.ctx = new AC(); } catch (e) { return; }
    var c = this.ctx;
    if (c.state === 'suspended') c.resume();
    this.sfxGain = c.createGain();               // 音效总线，约 70%
    this.sfxGain.gain.value = this.muted ? 0 : 0.7;
    this.sfxGain.connect(c.destination);
    this.musicGain = c.createGain();             // 八音盒生日歌总线，约 35%
    this.musicGain.gain.value = this.muted ? 0 : 0.35;
    this.musicGain.connect(c.destination);
    var len = c.sampleRate;
    var buf = c.createBuffer(1, len, c.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    this.ok = true;
  },
  now: function () { return this.ctx ? this.ctx.currentTime : 0; },
  setMuted: function (m) {
    this.muted = m;
    if (!this.ctx) return;
    this.sfxGain.gain.setTargetAtTime(m ? 0 : 0.7, this.now(), 0.02);
    this.musicGain.gain.setTargetAtTime(m ? 0 : 0.35, this.now(), 0.02);
  }
};

function tone(o) {
  // o: {freq, slideTo, slideT, type, t, a, d, peak, dest}
  if (!AudioKit.ok || AudioKit.muted) return;
  var c = AudioKit.ctx, t = (o.t != null ? o.t : c.currentTime);
  var osc = c.createOscillator(), g = c.createGain();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(o.freq, t);
  if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.slideTo), t + (o.slideT || o.d || 0.3));
  var a = o.a || 0.005, d = o.d || 0.2, peak = o.peak || 0.5;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  osc.connect(g); g.connect(o.dest || AudioKit.sfxGain);
  osc.start(t); osc.stop(t + a + d + 0.05);
}

function noise(o) {
  // o: {t, a, d, peak, filterType, freq, freqEnd, q, dest}
  if (!AudioKit.ok || AudioKit.muted) return;
  var c = AudioKit.ctx, t = (o.t != null ? o.t : c.currentTime);
  var src = c.createBufferSource();
  src.buffer = AudioKit.noiseBuf;
  src.loop = true;
  var a = o.a || 0.005, d = o.d || 0.3, peak = o.peak || 0.6;
  var g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  var node = src;
  if (o.filterType) {
    var f = c.createBiquadFilter();
    f.type = o.filterType;
    f.frequency.setValueAtTime(o.freq || 1000, t);
    if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.freqEnd), t + a + d);
    f.Q.value = o.q || 1;
    src.connect(f); node = f;
  }
  node.connect(g); g.connect(o.dest || AudioKit.sfxGain);
  src.start(t); src.stop(t + a + d + 0.05);
}

// 八音盒音色：基频 + 泛音列，短促起音 + 指数衰减
function mbTone(freq, t, dur, dest, peak) {
  if (!AudioKit.ok) return;
  var c = AudioKit.ctx;
  var partials = [[1, 1], [2, 0.38], [3, 0.14], [4.2, 0.05]];
  partials.forEach(function (p) {
    var osc = c.createOscillator(), g = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq * p[0];
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime((peak || 0.4) * p[1], t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(dest || AudioKit.musicGain);
    osc.start(t); osc.stop(t + dur + 0.05);
  });
}

/* ---------- 全部音效（Web Audio 合成，无音频文件） ---------- */
var SFX = {
  click:      function () { tone({ freq: 880, slideTo: 660, d: 0.06, peak: 0.35 }); },
  key:        function () { tone({ freq: 1250, d: 0.04, peak: 0.22, type: 'square' }); },
  tick:       function () { tone({ freq: 1568, d: 0.09, peak: 0.14 }); },
  bubble:     function () { tone({ freq: 620, slideTo: 940, d: 0.08, peak: 0.2 }); },
  ding:       function () { tone({ freq: 1318.5, d: 0.5, peak: 0.45 }); tone({ freq: 1975.5, t: AudioKit.now() + 0.03, d: 0.6, peak: 0.22 }); },
  dong:       function () { tone({ freq: 220, slideTo: 110, d: 0.35, peak: 0.55 }); tone({ freq: 110, d: 0.3, peak: 0.3, type: 'triangle' }); },
  fail:       function () { tone({ freq: 180, d: 0.2, peak: 0.35, type: 'sawtooth' }); tone({ freq: 150, t: AudioKit.now() + 0.18, d: 0.3, peak: 0.35, type: 'sawtooth' }); },
  unlock:     function () { var n = [523.25, 659.25, 783.99, 1046.5]; for (var i = 0; i < n.length; i++) mbTone(n[i], AudioKit.now() + i * 0.09, 0.6, AudioKit.sfxGain, 0.4); },
  shutter:    function () { noise({ d: 0.03, peak: 0.55, filterType: 'highpass', freq: 2200 }); noise({ t: AudioKit.now() + 0.09, d: 0.05, peak: 0.7, filterType: 'highpass', freq: 1500 }); },
  eject:      function () { noise({ d: 0.22, a: 0.02, peak: 0.32, filterType: 'bandpass', freq: 500, freqEnd: 1800, q: 2 }); tone({ freq: 180, d: 0.09, peak: 0.12, type: 'square' }); },
  page:       function () { noise({ d: 0.16, a: 0.01, peak: 0.28, filterType: 'bandpass', freq: 2200, freqEnd: 600, q: 1.2 }); },
  tear:       function () { noise({ d: 0.5, a: 0.01, peak: 0.65, filterType: 'bandpass', freq: 900, freqEnd: 500, q: 0.8 }); noise({ t: AudioKit.now() + 0.08, d: 0.35, peak: 0.45, filterType: 'highpass', freq: 1200 }); },
  pop:        function () { noise({ d: 0.25, peak: 0.8, filterType: 'lowpass', freq: 2500, freqEnd: 300 }); tone({ freq: 160, slideTo: 60, d: 0.28, peak: 0.7 }); },
  extinguish: function () { noise({ d: 0.16, a: 0.004, peak: 0.55, filterType: 'lowpass', freq: 900, freqEnd: 200 }); tone({ freq: 320, slideTo: 90, d: 0.12, peak: 0.28 }); },
  firework:   function () {
    tone({ freq: 110, slideTo: 38, d: 0.7, peak: 0.8 });
    noise({ d: 0.5, peak: 0.65, filterType: 'lowpass', freq: 1800, freqEnd: 200 });
    var t0 = AudioKit.now() + 0.15;
    for (var i = 0; i < 10; i++) noise({ t: t0 + Math.random() * 0.7, d: 0.03, peak: 0.22, filterType: 'highpass', freq: 2500 + Math.random() * 2000 });
  },
  reward:     function () {
    var n = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    for (var i = 0; i < n.length; i++) mbTone(n[i], AudioKit.now() + i * 0.08, 0.8, AudioKit.sfxGain, 0.45);
    for (var j = 0; j < 8; j++) tone({ freq: 2000 + Math.random() * 2000, t: AudioKit.now() + 0.3 + j * 0.05, d: 0.15, peak: 0.1 });
  },
  paper:      function () { noise({ d: 0.4, a: 0.05, peak: 0.3, filterType: 'lowpass', freq: 700 }); }
};

/* ---------- 八音盒版《生日快乐歌》（标准旋律，循环播放） ---------- */
var MusicBox = {
  playing: false, timer: null, beat: 0.42, reps: 0, MAX_REPS: 1, // 只播一遍就停，不循环
  // [MIDI 音高, 拍数]——标准 Happy Birthday 简谱
  melody: [
    [67, .75], [67, .25], [69, 1], [67, 1], [72, 1], [71, 2],
    [67, .75], [67, .25], [69, 1], [67, 1], [74, 1], [72, 2],
    [67, .75], [67, .25], [79, 1], [76, 1], [72, 1], [71, 1], [69, 2],
    [77, .75], [77, .25], [76, 1], [72, 1], [74, 1], [72, 2.5]
  ],
  freq: function (m) { return 440 * Math.pow(2, (m - 69) / 12); },
  schedule: function () {
    if (!this.playing || !AudioKit.ok) return;
    if (this.reps >= this.MAX_REPS) { this.playing = false; return; }
    var self = this;
    // iOS 上 AudioContext 是异步 resume：等它真正 running 再排音，否则会静音
    if (AudioKit.ctx && AudioKit.ctx.state === 'suspended') {
      if (++this._wait > 40) { this._wait = 0; this.stop(); return; }
      var rp = AudioKit.ctx.resume();
      if (rp && rp.catch) rp.catch(function () {});
      this.timer = setTimeout(function () { self.schedule(); }, 120);
      return;
    }
    this._wait = 0;
    this.reps++;
    var t = AudioKit.now() + 0.05, total = 0;
    this.melody.forEach(function (n) {
      var d = n[1] * self.beat;
      mbTone(self.freq(n[0]), t + total, Math.max(1.1, d * 1.9), self.gain || AudioKit.musicGain, 0.5);
      total += d;
    });
    total += 1.4; // 句尾呼吸
    this.timer = setTimeout(function () { self.schedule(); }, total * 1000);
  },
  start: function () {
    if (this.playing) return;
    this.playing = true;
    this.reps = 0; this._wait = 0;
    // 独立音量节点：stop() 时立刻压静音（包括已排好还没播的音符）
    if (!this.gain && AudioKit.ctx && AudioKit.ok) {
      this.gain = AudioKit.ctx.createGain();
      this.gain.gain.value = 1;
      this.gain.connect(AudioKit.musicGain);
    }
    if (this.gain && this.gain.gain && AudioKit.ctx) {
      this.gain.gain.cancelScheduledValues(AudioKit.now());
      this.gain.gain.setTargetAtTime(1, AudioKit.now(), 0.02);
    }
    this.schedule();
  },
  stop: function () {
    this.playing = false;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    // 立刻压静音（包括已经排好还没播的音符），避免切场景后生日歌还在响
    if (this.gain && this.gain.gain && AudioKit.ctx) {
      this.gain.gain.cancelScheduledValues(AudioKit.now());
      this.gain.gain.setTargetAtTime(0, AudioKit.now(), 0.03);
    }
  },
};

/* ============================================================
   二、<audio> 元素：BGM ×5 + 终章歌曲（全部 JS 创建，preload=none）
   ============================================================ */
var bgmEls = {}, songEl = null, songMissing = false;
function setupAudioElements() {
  Object.keys(CONFIG.bgm).forEach(function (k) {
    var a = new Audio();
    a.src = CONFIG.bgm[k];
    a.preload = 'none';
    a.loop = true;
    bgmEls[k] = a;
  });
  songEl = new Audio();
  songEl.src = CONFIG.songFile;
  songEl.preload = 'none';
  songEl.addEventListener('error', function () {
    songMissing = true;
    if (playerActive && !degraded) startDegraded();
  });
  songEl.addEventListener('timeupdate', function () {
    if (playerActive && !degraded) updateLyrics(songEl.currentTime);
  });
  songEl.addEventListener('ended', function () {
    if (playerActive && !degraded) finishFinale();
  });
}

// 第 1 幕点击里统一预热：muted 播放 → 立刻暂停，解锁后续程序化播放
function preheatAudios() {
  var all = Object.keys(bgmEls).map(function (k) { return bgmEls[k]; });
  all.push(songEl);
  all.forEach(function (a) {
    // 预热只做“解锁”，全程保持静音，绝不在回调里取消静音或依赖 pause()：
    // 部分微信内核 pause() 会失效，一旦取消静音就会把 BGM 提前外放出来
    a.muted = true;
    var p;
    try { p = a.play(); } catch (e) { return; }
    if (p && p.then) {
      p.then(function () { try { a.pause(); } catch (e) {} }).catch(function () {});
    } else {
      try { a.pause(); } catch (e) {}
    }
  });
}

/* ---------- BGM 切换（淡入淡出，目标音量 35%） ---------- */
var currentBGM = null;
function fadeTo(a, target, done) {
  if (a._ft) clearInterval(a._ft);
  var steps = 0;
  a._ft = setInterval(function () {
    var v = a.volume, d = target - v;
    if (Math.abs(d) < 0.04 || ++steps > 40) {
      a.volume = target;
      clearInterval(a._ft); a._ft = null;
      if (done) done();
    } else {
      a.volume = clamp(v + d * 0.25, 0, 1);
    }
  }, 60);
}
function playBGM(key) {
  if (currentBGM === key) return;
  if (currentBGM && bgmEls[currentBGM]) {
    // 立刻停掉上一首（iOS 不支持 audio.volume，淡出永远收敛不了，必须直接 pause）
    var old = bgmEls[currentBGM];
    if (old._ft) { clearInterval(old._ft); old._ft = null; }
    old.volume = 0;
    try { old.pause(); } catch (e) {}
    try { old.currentTime = 0; } catch (e) {}
  }
  currentBGM = key;
  if (key && bgmEls[key]) {
    var next = bgmEls[key];
    try { next.currentTime = 0; } catch (e) {}
    next.volume = 0;
    next.muted = muted;
    var p = next.play();
    if (p && p.catch) {
      p.catch(function () {
        // iOS 偶发 play 被拒：稍后重试一次
        setTimeout(function () {
          var p2 = next.play();
          if (p2 && p2.catch) p2.catch(function () {});
        }, 150);
      });
    }
    fadeTo(next, 0.35);
  }
}
function stopBGM() { playBGM(null); }

/* ============================================================
   三、粒子画布（彩带 + 烟花，手写 canvas）
   ============================================================ */
var fxCanvas = $('#fx'), fctx = fxCanvas.getContext('2d');
var parts = [], fxRunning = false, DPR = 1;
function fxResize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  fxCanvas.width = window.innerWidth * DPR;
  fxCanvas.height = window.innerHeight * DPR;
}
window.addEventListener('resize', fxResize);
fxResize();

function fxKick() { if (!fxRunning) { fxRunning = true; requestAnimationFrame(fxLoop); } }
function fxLoop() {
  if (!parts.length) {
    fxRunning = false;
    fctx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
    return;
  }
  requestAnimationFrame(fxLoop);
  fctx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
  var now = performance.now();
  parts = parts.filter(function (p) {
    var age = (now - p.t0) / 1000;
    if (age > p.life) return false;
    p.vy += p.g; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
    var k = 1 - age / p.life;
    fctx.save();
    fctx.globalAlpha = Math.max(0, k);
    fctx.translate(p.x * DPR, p.y * DPR);
    fctx.rotate(p.rot);
    fctx.fillStyle = p.color;
    if (p.shape === 'rect') {
      fctx.fillRect(-p.size / 2 * DPR, -p.size / 4 * DPR, p.size * DPR, p.size / 2 * DPR);
    } else {
      fctx.beginPath();
      fctx.arc(0, 0, Math.max(0.4, p.size * k) * DPR, 0, 6.283);
      fctx.fill();
    }
    fctx.restore();
    return true;
  });
}

var CONF_COLORS = ['#ffd166', '#ef476f', '#06d6a0', '#118ab2', '#f78c6b', '#c77dff', '#ff8fab'];
function confetti(x, y, n) {
  n = n || 80;
  for (var i = 0; i < n; i++) {
    var a = Math.random() * Math.PI * 2, sp = 4 + Math.random() * 9;
    parts.push({
      x: x, y: y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 6, g: 0.25,
      rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
      size: 6 + Math.random() * 8, color: CONF_COLORS[i % CONF_COLORS.length],
      shape: 'rect', t0: performance.now(), life: 1.6 + Math.random() * 1.2
    });
  }
  fxKick();
}

var FW_COLORS = ['#ffd98a', '#ffb45e', '#ff8fab', '#a0c4ff', '#bdb2ff', '#fdffb6'];
function fireworkAt(x, y, big) {
  var col = FW_COLORS[(Math.random() * FW_COLORS.length) | 0];
  var n = big ? 70 : 42;
  for (var i = 0; i < n; i++) {
    var a = (i / n) * Math.PI * 2 + Math.random() * 0.2;
    var sp = 3 + Math.random() * (big ? 8 : 6);
    parts.push({
      x: x, y: y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 0.06,
      rot: 0, vr: 0,
      size: 2 + Math.random() * 2.5,
      color: Math.random() < 0.75 ? col : '#ffffff',
      shape: 'dot', t0: performance.now(), life: 1.2 + Math.random() * 0.9
    });
  }
  fxKick();
}
function fireworksShow(times, interval) {
  var c = 0;
  (function one() {
    fireworkAt(window.innerWidth * (0.15 + Math.random() * 0.7),
               window.innerHeight * (0.12 + Math.random() * 0.4), true);
    SFX.firework();
    if (++c < times) setTimeout(one, interval || 450);
  })();
}

/* ============================================================
   四、场景管理（六幕淡入淡出）
   ============================================================ */
var currentScene = 's1';
var enterHooks = {}, leaveHooks = {};
function goto(id) {
  if (id === currentScene) return;
  var from = $('#' + currentScene), to = $('#' + id);
  if (leaveHooks[currentScene]) leaveHooks[currentScene]();
  from.classList.remove('active');
  to.classList.add('active');
  currentScene = id;
  if (enterHooks[id]) enterHooks[id]();
}

function makeStars(container, n) {
  for (var i = 0; i < n; i++) {
    var s = ce('span', 'star');
    s.style.left = (Math.random() * 100) + '%';
    s.style.top = (Math.random() * 100) + '%';
    var sz = 1 + Math.random() * 2.2;
    s.style.width = s.style.height = sz + 'px';
    s.style.animationDelay = (Math.random() * 3) + 's';
    s.style.animationDuration = (2 + Math.random() * 3) + 's';
    container.appendChild(s);
  }
}

function showBtn(b) { b.classList.remove('hidden'); b.classList.add('btn-in'); }

/* ============================================================
   第 1 幕 · 拆礼物
   ============================================================ */
var giftOpened = false;
function initS1() {
  $('#giftHint').innerHTML = CONFIG.herShort + '，有一份礼物要给你<br>→ 点我拆开';
  $('#giftBox').addEventListener('click', function () {
    if (giftOpened) return;
    if (!assetsReady) return; // 资源没加载完之前先不放行
    giftOpened = true;
    // —— 音频解锁：初始化 AudioContext + 预热全部 <audio> ——
    AudioKit.init();
    setupAudioElements();
    preheatAudios();
    // 撕纸 + 爆破 + 彩带
    SFX.tear();
    setTimeout(function () { SFX.pop(); }, 260);
    var r = this.getBoundingClientRect();
    confetti(r.left + r.width / 2, r.top + r.height / 2, 130);
    this.classList.add('open');
    $('#giftHint').classList.add('fade-out');
    MusicBox.start();
    setTimeout(startGreeting, 750);
  });
  $('#toS2').addEventListener('click', function () { SFX.click(); goto('s2'); });
}
function startGreeting() {
  $('#greeting').classList.remove('hidden');
  var text = CONFIG.herName + '，生日快乐';
  var box = $('#bigTitle');
  box.textContent = '';
  var i = 0;
  var tm = setInterval(function () {
    box.textContent = text.slice(0, ++i);
    SFX.tick();
    if (i >= text.length) {
      clearInterval(tm);
      setTimeout(function () {
        var st = $('#subTitle');
        st.classList.remove('hidden');
        st.classList.add('fade-in');
      }, 450);
      setTimeout(function () { showBtn($('#toS2')); }, 1300);
    }
  }, 220);
}
leaveHooks.s1 = function () { MusicBox.stop(); };

/* ============================================================
   第 2 幕 · 吹蜡烛（麦克风优先，失败降级长按）
   ============================================================ */
var micStream = null, analyser = null, micData = null;
var micMode = false, pressMode = false, pressing = false, pressStart = 0;
var blowPower = 0, candlesOut = 0, candleDone = false, micTried = false;
var wasBlowing = false;
var windSrc = null, windGain = null;
var micFallback = null;
var BLOW_TH = 0.14;                 // 吹气音量阈值
var CANDLE_THR = [0.3, 0.62, 0.95]; // 持续吹气约 1 秒，三根依次熄灭

function startWind() {
  if (!AudioKit.ok || windSrc) return;
  var c = AudioKit.ctx;
  windSrc = c.createBufferSource();
  windSrc.buffer = AudioKit.noiseBuf;
  windSrc.loop = true;
  var f = c.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 600;
  windGain = c.createGain();
  windGain.gain.value = 0;
  windSrc.connect(f); f.connect(windGain); windGain.connect(AudioKit.sfxGain);
  windSrc.start();
}
function setWind(level) {
  if (windGain) windGain.gain.setTargetAtTime(clamp(level * 1.8, 0, 0.7), AudioKit.now(), 0.05);
}
function stopWind() {
  if (windSrc) { try { windSrc.stop(); } catch (e) {} windSrc = null; windGain = null; }
}
function stopMic() {
  if (micStream) {
    micStream.getTracks().forEach(function (t) { t.stop(); });
    micStream = null;
  }
  micMode = false;
}
function clearMicFallback() {
  if (micFallback) { clearTimeout(micFallback); micFallback = null; }
}

enterHooks.s2 = function () {
  if (candleDone) return;
  if (!micTried) { micTried = true; setupMic(); }
  enablePressMode(); // 长按兜底立即生效，麦克风拿到后两者都可用
};
leaveHooks.s2 = function () { clearMicFallback(); stopMic(); stopWind(); };

function setupMic() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !AudioKit.ok) {
    enablePressMode();
    return;
  }
  navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
    if (candleDone || currentScene !== 's2') { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
    micStream = stream;
    var src = AudioKit.ctx.createMediaStreamSource(stream);
    analyser = AudioKit.ctx.createAnalyser();
    analyser.fftSize = 1024;
    micData = new Uint8Array(analyser.fftSize);
    src.connect(analyser);
    micMode = true;
    // 自动校准底噪：先采 0.6 秒安静音量，再定吹气阈值（适配不同手机麦克风灵敏度）
    var samples = 0, sum = 0;
    (function calibrate() {
      if (candleDone || currentScene !== 's2') return;
      analyser.getByteTimeDomainData(micData);
      var s = 0;
      for (var i = 0; i < micData.length; i++) {
        var v = (micData[i] - 128) / 128;
        s += v * v;
      }
      sum += Math.sqrt(s / micData.length);
      if (++samples < 12) { setTimeout(calibrate, 50); return; }
      var base = sum / samples;
      BLOW_TH = Math.max(0.10, base * 2.5 + 0.015);
      startWind();
      startBlowLoop();
      // 万一麦克风一直收不到风（设备静音/微信权限异常），3.5 秒后确保长按可用
      micFallback = setTimeout(function () {
        if (!candleDone && candlesOut === 0) enablePressMode();
      }, 3500);
    })();
  }).catch(function () { enablePressMode(); });
}

function enablePressMode() {
  if (pressMode || candleDone) return;
  pressMode = true;
  $('#candleHint').textContent = '吹一口气~或者按住屏幕不松手~';
  $('#s2').addEventListener('pointerdown', onPressStart);
  $('#s2').addEventListener('touchstart', onPressStart, { passive: true });
  window.addEventListener('pointerup', onPressEnd);
  window.addEventListener('pointercancel', onPressEnd);
  window.addEventListener('touchend', onPressEnd);
  window.addEventListener('touchcancel', onPressEnd);
  startWind();
  startBlowLoop();
}
function onPressStart(e) {
  if (currentScene !== 's2' || candleDone) return;
  if (e.target.closest('button')) return;
  pressing = true;
  pressStart = performance.now();
}
function onPressEnd() {
  if (!pressing) return;
  pressing = false;
  if (!candleDone && candlesOut < 3) showNudge();
}

function showNudge() {
  var n = $('#candleNudge');
  n.textContent = '风力不够哦，再用力一点～';
  clearTimeout(n._tm);
  n._tm = setTimeout(function () { n.textContent = ''; }, 1600);
}

var blowLoopOn = false;
function startBlowLoop() {
  if (blowLoopOn) return;
  blowLoopOn = true;
  blowLoop();
}
function blowLoop() {
  if (currentScene !== 's2' || candleDone) { blowLoopOn = false; stopWind(); return; }
  requestAnimationFrame(blowLoop);
  var level = 0, blowing = false;
  if (pressing) {
    // 长按优先：按住一定有效，麦克风再灵敏也不影响
    blowing = true;
    clearMicFallback();
    level = Math.min(0.35, (performance.now() - pressStart) / 1000 * 0.35);
    blowPower = Math.min(1.05, blowPower + 0.014);               // 长按约 1.2 秒
  } else if (micMode && analyser) {
    analyser.getByteTimeDomainData(micData);
    var sum = 0;
    for (var i = 0; i < micData.length; i++) {
      var v = (micData[i] - 128) / 128;
      sum += v * v;
    }
    level = Math.sqrt(sum / micData.length);
    blowing = level > BLOW_TH;
    if (blowing) { clearMicFallback(); blowPower = Math.min(1.05, blowPower + 0.0167); }   // 约 1 秒吹满
    else blowPower = Math.max(0, blowPower - 0.04);
  } else if (pressMode) {
    blowPower = Math.max(0, blowPower - 0.05);
  }
  // 中途断气 → 调皮提示
  if (wasBlowing && !blowing && candlesOut < 3 && blowPower > 0.05 && blowPower < CANDLE_THR[2]) showNudge();
  wasBlowing = blowing;
  $('#windBar').style.transform = 'scaleX(' + clamp(Math.max(blowPower, level / 0.3), 0.02, 1) + ')';
  setWind(level);
  while (candlesOut < 3 && blowPower >= CANDLE_THR[candlesOut]) {
    extinguishCandle(candlesOut);
    candlesOut++;
  }
  if (candlesOut >= 3 && !candleDone) candleSuccess();
}

function extinguishCandle(i) {
  var candles = $$('#cake .candle');
  var c = candles[i];
  if (!c) return;
  $('.flame', c).classList.add('out');
  c.classList.add('out-now');
  SFX.extinguish();
}

function candleSuccess() {
  candleDone = true;
  clearMicFallback();
  stopMic();
  stopWind();
  $('#candleHint').textContent = '';
  $('#candleNudge').textContent = '';
  $('#windBar').style.transform = 'scaleX(0)';
  fireworksShow(5, 450);
  $('#s2').classList.add('lit');
  setTimeout(function () {
    var w = $('#wishMsg');
    w.classList.remove('hidden');
    setTimeout(function () { showBtn($('#toS3')); }, 1400);
  }, 500);
}
function initS2() {
  $('#toS3').addEventListener('click', function () { SFX.click(); goto('s3'); });
}

/* ============================================================
   第 3 幕 · 时光轴
   ============================================================ */
var tlBuilt = false;
enterHooks.s3 = function () {
  playBGM('timeline');
  if (!tlBuilt) {
    buildTimeline();
    SFX.page();
  }
};
function initS3() {
  $('#toS4').addEventListener('click', function () { SFX.click(); goto('s4'); });
  $('#lightbox').addEventListener('click', function () {
    this.classList.add('hidden');
    $('#lightboxImg').src = '';
  });
  $('#eggClose').addEventListener('click', function () {
    SFX.click();
    $('#eggModal').classList.add('hidden');
  });
}
function buildTimeline() {
  tlBuilt = true;
  var list = $('#tlList');
  TIMELINE.forEach(function (st) {
    var d = ce('div', 'station');
    d.appendChild(ce('div', 'station-head',
      '<span class="t-date">' + st.date + '</span><h3>' + st.title + '</h3>'));
    var ph = ce('div', 't-photos');
    if (st.photos.length === 1) ph.classList.add('single');
    st.photos.forEach(function (pid) {
      var pol = ce('div', 'polaroid');
      pol.style.setProperty('--rot', (Math.random() * 6 - 3).toFixed(1) + 'deg');
      var img = ce('img');
      img.src = 'assets/images/' + pid + '.jpg';
      img.alt = st.title;
      img.loading = 'lazy';
      img.decoding = 'async';
      pol.appendChild(img);
      pol.appendChild(ce('span', 'p-cap', st.date));
      pol.addEventListener('click', function () {
        SFX.shutter();
        openLightbox(img.src);
      });
      if (st.egg) {
        var egg = ce('span', 'egg', '🎂');
        egg.addEventListener('click', function (ev) {
          ev.stopPropagation();
          SFX.bubble();
          $('#eggText').textContent = st.egg;
          $('#eggModal').classList.remove('hidden');
        });
        pol.appendChild(egg);
      }
      ph.appendChild(pol);
    });
    d.appendChild(ph);
    d.appendChild(ce('p', 't-text', st.text));
    list.appendChild(d);
  });
  observePolaroids();
}
function observePolaroids() {
  var lastSnd = 0;
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      en.target.classList.add('in');
      io.unobserve(en.target);
      var n = Date.now();
      if (n - lastSnd > 350) { lastSnd = n; SFX.eject(); }
    });
  }, { root: $('#tlScroll'), threshold: 0.2 });
  $$('.polaroid').forEach(function (p) { io.observe(p); });
}
function openLightbox(src) {
  $('#lightboxImg').src = src;
  $('#lightbox').classList.remove('hidden');
}

/* ============================================================
   第 4 幕 · 秘密相册
   ============================================================ */
var unlocked = {}, denyCount = 0;
enterHooks.s4 = function () {
  playBGM('album');
  buildRooms();
};
function initS4() {
  $('#toS5').addEventListener('click', function () { SFX.click(); goto('s5'); });
  $('#roomBack').addEventListener('click', function () {
    SFX.click();
    buildRooms();
    $('#s4').classList.remove('in-room');
    $('#roomView').classList.add('hidden');
    $('#roomList').classList.remove('hidden');
  });
}
function buildRooms() {
  var list = $('#roomList');
  list.innerHTML = '';
  ['secret', 'daily', 'forbidden'].forEach(function (id) {
    var a = ALBUMS[id];
    var card = ce('button', 'room-card');
    card.innerHTML = '<span class="r-icon">' + a.icon + '</span>' +
      '<span class="r-name">「' + a.name + '」相册</span>' +
      '<span class="r-lock">' + (unlocked[id] ? '🔓' : '🔒') + '</span>';
    card.addEventListener('click', function () { SFX.click(); openRoom(id); });
    list.appendChild(card);
  });
}
function openRoom(id) {
  $('#s4').classList.add('in-room');
  $('#roomView').classList.remove('hidden');
  var c = $('#roomContent');
  c.innerHTML = '';
  if (id === 'secret') {
    if (unlocked.secret) renderPhotos(c, ALBUMS.secret);
    else renderSecretIntro(c);
  } else if (id === 'daily') {
    if (unlocked.daily) renderPhotos(c, ALBUMS.daily);
    else renderDaily(c);
  } else {
    renderForbidden(c);
  }
}

/* 房间一：微信式对话 → 任务卡 → 密码 1031 */
function renderSecretIntro(c) {
  var chat = ce('div', 'chat-card');
  c.appendChild(chat);
  var i = 0;
  function nextBubble() {
    if (i < SECRET_INTRO.chat.length) {
      var m = SECRET_INTRO.chat[i++];
      chat.appendChild(ce('div', 'bubble ' + m.from, m.text));
      SFX.bubble();
      setTimeout(nextBubble, 900);
    } else {
      showChoices();
    }
  }
  setTimeout(nextBubble, 500);
  function showChoices() {
    var row = ce('div', 'chat-btns');
    var b1 = ce('button', 'btn primary small', SECRET_INTRO.wantBtn);
    var b2 = ce('button', 'btn ghost small', SECRET_INTRO.dontBtn);
    b1.addEventListener('click', function () {
      SFX.click();
      row.remove();
      chat.appendChild(ce('div', 'bubble her', SECRET_INTRO.wantBtn));
      SFX.bubble();
      setTimeout(function () { renderTaskCard(c); }, 700);
    });
    b2.addEventListener('click', function () {
      SFX.click();
      row.remove();
      chat.appendChild(ce('div', 'bubble her', SECRET_INTRO.dontBtn));
      SFX.bubble();
      setTimeout(function () {
        chat.appendChild(ce('div', 'bubble him', SECRET_INTRO.refuseMsg));
        SFX.bubble();
        setTimeout(function () { renderTaskCard(c); }, 1000);
      }, 600);
    });
    row.appendChild(b1);
    row.appendChild(b2);
    chat.appendChild(row);
  }
}
function renderTaskCard(c) {
  var card = ce('div', 'task-card');
  card.appendChild(ce('p', 'task-text', SECRET_INTRO.taskCard));
  card.appendChild(buildPassBox(ALBUMS.secret, function () {
    unlocked.secret = true;
    renderPhotos(c, ALBUMS.secret);
  }));
  c.appendChild(card);
  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  SFX.paper();
}

/* 房间二：直接密码 20231031 */
function renderDaily(c) {
  var card = ce('div', 'task-card');
  card.appendChild(ce('p', 'task-text', '这间屋子里是最普通的日子，也是最想留住的日子~输入密码就能看~'));
  card.appendChild(buildPassBox(ALBUMS.daily, function () {
    unlocked.daily = true;
    renderPhotos(c, ALBUMS.daily);
  }));
  c.appendChild(card);
}

/* 房间三：绝密档案，永远打不开 */
function renderForbidden(c) {
  var a = ALBUMS.forbidden;
  var card = ce('div', 'task-card');
  card.appendChild(ce('p', 'task-text', '⚠️ 本房间为最高机密~请输入密码~（提示：没有提示）'));
  var wrap = ce('div');
  var row = ce('div', 'pass-row');
  var input = ce('input');
  input.type = 'text';
  input.placeholder = '输入密码试试';
  input.autocomplete = 'off';
  var btn = ce('button', 'btn primary', '解锁');
  var msg = ce('p', 'pass-msg');
  function tryIt() {
    SFX.key();
    denyCount++;
    SFX.fail();
    msg.textContent = a.denyMsg + (denyCount >= 3 ? '\n' + a.denyMsg3 : '');
    input.value = '';
    row.classList.remove('shake');
    void row.offsetWidth;
    row.classList.add('shake');
  }
  btn.addEventListener('click', tryIt);
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter') tryIt(); });
  row.appendChild(input);
  row.appendChild(btn);
  wrap.appendChild(row);
  wrap.appendChild(msg);
  card.appendChild(wrap);
  c.appendChild(card);
}

/* 密码输入组（校验前 trim 空格） */
function buildPassBox(album, onOk) {
  var wrap = ce('div');
  var row = ce('div', 'pass-row');
  var input = ce('input');
  input.type = 'tel';
  input.inputMode = 'numeric';
  input.placeholder = album.hint;
  input.autocomplete = 'off';
  var btn = ce('button', 'btn primary', '解锁');
  var msg = ce('p', 'pass-msg');
  function tryIt() {
    SFX.key();
    var v = input.value.trim();
    if (v === album.password) {
      SFX.unlock();
      setTimeout(function () { SFX.shutter(); }, 350);
      onOk();
    } else {
      SFX.fail();
      msg.textContent = album.wrongMsg;
      input.value = '';
      row.classList.remove('shake');
      void row.offsetWidth;
      row.classList.add('shake');
    }
  }
  btn.addEventListener('click', tryIt);
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter') tryIt(); });
  row.appendChild(input);
  row.appendChild(btn);
  wrap.appendChild(row);
  wrap.appendChild(msg);
  return wrap;
}

/* 解锁成功：照片依次掉落 + 可点击放大 */
/* 解锁成功：照片依次掉落 + 可点击放大 */
function renderPhotos(c, album) {
  c.innerHTML = '';
  var grid = ce('div', 'photo-grid');
  album.photos.forEach(function (pid, i) {
    var p = ce('div', 'fall-photo');
    p.style.animationDelay = (i * 0.18) + 's';
    var img = ce('img');
    img.src = 'assets/images/' + pid + '.jpg';
    img.alt = album.name + (i + 1);
    img.loading = 'lazy';
    img.decoding = 'async';
    p.appendChild(img);
    p.addEventListener('click', function () {
      SFX.shutter();
      openLightbox(img.src);
    });
    grid.appendChild(p);
  });
  c.appendChild(grid);
}

/* ============================================================
   第 5 幕 · 默契大考验
   ============================================================ */
var qIdx = 0, qScore = 0, qStreak = 0, qLock = false, quizStarted = false;
enterHooks.s5 = function () {
  if (!quizStarted) {
    quizStarted = true;
    playBGM('quiz');
    renderQuestion();
  }
};
function initS5() {
  $('#toS6').addEventListener('click', function () { SFX.click(); goto('s6'); });
}
function renderQuestion() {
  qLock = false;
  var q = QUIZ[qIdx];
  $('#qProgress').textContent = '第 ' + (qIdx + 1) + ' / ' + QUIZ.length + ' 题';
  $('#qScore').textContent = '得分 ' + qScore;
  $('#qText').textContent = q.q;
  var box = $('#qOptions');
  box.innerHTML = '';
  q.options.forEach(function (op, i) {
    var b = ce('button', 'opt', '<span class="opt-tag">' + 'ABCD'[i] + '</span><span>' + op + '</span>');
    b.addEventListener('click', function () { answer(i, b); });
    box.appendChild(b);
  });
  var card = $('#quizCard');
  card.classList.remove('q-in');
  void card.offsetWidth;
  card.classList.add('q-in');
}
function answer(i, btn) {
  if (qLock) return;
  qLock = true;
  var q = QUIZ[qIdx];
  var ok = i === q.answer;
  var opts = $$('#qOptions .opt');
  if (ok) {
    qScore += 10;
    qStreak++;
    SFX.ding();
    btn.classList.add('right');
    if (qStreak % 3 === 0) confetti(window.innerWidth / 2, window.innerHeight * 0.2, 45); // 连对 3 题小彩带
  } else {
    qStreak = 0;
    SFX.dong();
    btn.classList.add('wrong');
    opts[q.answer].classList.add('right');
  }
  $('#qScore').textContent = '得分 ' + qScore;
  setTimeout(function () {
    qIdx++;
    if (qIdx < QUIZ.length) renderQuestion();
    else showReward();
  }, 950);
}
function showReward() {
  playBGM('reward'); // 结算切《就是爱你》
  $('#quizView').classList.add('hidden');
  $('#rewardView').classList.remove('hidden');
  var r = REWARDS[REWARDS.length - 1];
  for (var i = 0; i < REWARDS.length; i++) {
    if (qScore >= REWARDS[i].min) { r = REWARDS[i]; break; }
  }
  $('#rScore').textContent = '10 题答对 ' + (qScore / 10) + ' 题 · 得分 ' + qScore + ' 分';
  $('#rTitle').textContent = r.title;
  var box = $('#rCoupons');
  box.innerHTML = '';
  r.coupons.forEach(function (cp, i) {
    var card = ce('div', 'coupon');
    card.style.animationDelay = (0.3 + i * 0.25) + 's';
    card.innerHTML = '<span class="cp-tag">' + (r.isPunish ? '😈' : '🎫') + '</span><span>' + cp + '</span>';
    box.appendChild(card);
  });
  SFX.reward();
  var n = 0;
  var tm = setInterval(function () {
    confetti(window.innerWidth * (0.2 + Math.random() * 0.6), window.innerHeight * 0.22, 40);
    if (++n >= 4) clearInterval(tm);
  }, 500);
}

/* ============================================================
   第 6 幕 · 终章
   ============================================================ */
var playerActive = false, degraded = false, letterShown = false;
var curLyric = -2, fwFired = false, lyricsBuilt = false;
var degRAF = null, degT0 = 0;
var kbTimer = null, letterFw = null;

enterHooks.s6 = function () {
  stopBGM();
  $('#finaleIntro').classList.remove('hidden');
  setTimeout(function () { $('#fLine1').classList.add('show'); }, 1600);
  setTimeout(function () { $('#fTitle').classList.add('show'); $('#fSub').classList.add('show'); }, 3400);
  setTimeout(function () { showBtn($('#playSong')); }, 4700);
};
function initS6() {
  $('#fLine1').textContent = FINALE.intro1;
  $('#fTitle').textContent = FINALE.songTitle;
  $('#fSub').textContent = FINALE.subtitle;
  buildLetter();
  $('#playSong').addEventListener('click', function () {
    SFX.click();
    $('#finaleIntro').classList.add('hidden');
    $('#finalePlayer').classList.remove('hidden');
    startPlayer();
  });
  $('#skipSong').addEventListener('click', function () {
    SFX.click();
    finishFinale();
  });
}
function startPlayer() {
  buildLyrics();
  startSlideshow();
  playerActive = true;
  if (songMissing || !songEl) { startDegraded(); return; }
  try { songEl.currentTime = 0; } catch (e) {}
  songEl.volume = 1;
  songEl.muted = muted;
  var p;
  try { p = songEl.play(); } catch (e) { startDegraded(); return; }
  if (p && p.catch) p.catch(function () { startDegraded(); });
}

/* song.mp3 缺失 / 播放失败 → 降级：歌词计时滚动 + 轮播 + 提示小字 */
function startDegraded() {
  if (degraded || letterShown) return;
  degraded = true;
  try { songEl.pause(); } catch (e) {}
  $('#songMissingNote').classList.remove('hidden');
  degT0 = performance.now();
  degLoop();
}
function degLoop() {
  if (!playerActive || letterShown) return;
  degRAF = requestAnimationFrame(degLoop);
  var t = (performance.now() - degT0) / 1000;
  updateLyrics(t);
  if (t >= LYRICS[LYRICS.length - 1].end + 0.5) finishFinale();
}

function buildLyrics() {
  if (lyricsBuilt) return;
  lyricsBuilt = true;
  var box = $('#lyricsBox');
  box.appendChild(ce('div', 'lyr-space'));
  LYRICS.forEach(function (l) {
    box.appendChild(ce('div', 'lyr', l.text));
  });
  box.appendChild(ce('div', 'lyr-space'));
}
function updateLyrics(t) {
  var idx = -1;
  for (var i = 0; i < LYRICS.length; i++) {
    if (LYRICS[i].start <= t) idx = i;
    else break;
  }
  if (idx === curLyric) return;
  curLyric = idx;
  var lines = $$('#lyricsBox .lyr');
  lines.forEach(function (l, j) {
    l.classList.toggle('on', j === idx);
    l.classList.toggle('past', j < idx);
  });
  if (idx >= 0 && lines[idx]) {
    var box = $('#lyricsBox');
    var target = lines[idx].offsetTop - box.clientHeight / 2 + lines[idx].clientHeight / 2;
    try { box.scrollTo({ top: target, behavior: 'smooth' }); }
    catch (e) { box.scrollTop = target; }
  }
  if (idx === FIREWORK_LYRIC_INDEX && !fwFired) {
    fwFired = true;
    fireworksShow(4, 500); // 唱到"生日快乐"自动放烟花
  }
}

/* Ken Burns 照片轮播：opacity 交叉淡化 + scale 缓推，每张 7 秒 */
function startSlideshow() {
  var wrap = $('#kbWrap');
  wrap.innerHTML = '';
  var imgs = FINALE.slideshow.map(function (pid, i) {
    var img = ce('img');
    img.alt = '';
    img.decoding = 'async';
    if (i === 0) img.src = 'assets/images/' + pid + '.jpg';
    wrap.appendChild(img);
    return img;
  });
  function show(i) {
    var img = imgs[i];
    if (!img.src) img.src = 'assets/images/' + FINALE.slideshow[i] + '.jpg';
    var ni = (i + 1) % imgs.length;
    if (!imgs[ni].src) imgs[ni].src = 'assets/images/' + FINALE.slideshow[ni] + '.jpg'; // 预取下一张
    imgs.forEach(function (m, j) { m.classList.toggle('show', j === i); });
    img.classList.remove('kb-a', 'kb-b');
    void img.offsetWidth;
    img.classList.add(i % 2 ? 'kb-b' : 'kb-a');
  }
  show(0);
  var cur = 0;
  kbTimer = setInterval(function () {
    cur = (cur + 1) % imgs.length;
    show(cur);
  }, 7000);
}

function buildLetter() {
  var card = $('#letterCard');
  FINALE.letter.forEach(function (line, i) {
    var p = ce('p', null, line);
    p.style.animationDelay = (0.4 + i * 0.6) + 's';
    card.appendChild(p);
  });
  var sign = ce('p', 'letter-sign', FINALE.signature);
  sign.style.animationDelay = (0.4 + FINALE.letter.length * 0.6) + 's';
  card.appendChild(sign);
}
function finishFinale() {
  if (letterShown) return;
  letterShown = true;
  playerActive = false;
  if (degRAF) cancelAnimationFrame(degRAF);
  if (kbTimer) { clearInterval(kbTimer); kbTimer = null; }
  try { songEl.pause(); } catch (e) {}
  $('#finalePlayer').classList.add('hidden');
  $('#letterView').classList.remove('hidden');
  SFX.paper();
  playBGM('letter'); // 信纸展开时《不能说的秘密》低音量垫底
  fireworksShow(3, 600);
  letterFw = setInterval(function () { // 漫天烟花
    fireworkAt(window.innerWidth * (0.1 + Math.random() * 0.8),
               window.innerHeight * (0.08 + Math.random() * 0.35), false);
    if (Math.random() < 0.6) SFX.firework();
  }, 1100);
}

/* ============================================================
   静音按钮（控制 BGM + 音效，不含终章歌曲）
   ============================================================ */
var muted = false;
function initMute() {
  $('#muteBtn').addEventListener('click', function () {
    muted = !muted;
    this.textContent = muted ? '🔇' : '🔊';
    AudioKit.setMuted(muted);
    Object.keys(bgmEls).forEach(function (k) { bgmEls[k].muted = muted; });
  });
}

/* 切回前台时恢复 AudioContext（微信后台可能挂起） */
document.addEventListener('visibilitychange', function () {
  if (!document.hidden && AudioKit.ctx && AudioKit.ctx.state === 'suspended') {
    AudioKit.ctx.resume();
  }
});

/* ============================================================
   启动
   ============================================================ */
/* ============================================================
   开屏密码锁：输入正确密码后才开始加载资源
   ============================================================ */
var LOCK = {
  pass: '617520',
  val: '',
  el: null,
  dots: [],
  msg: null,
  init: function () {
    this.el = $('#lockScreen');
    this.msg = $('#lockMsg');
    this.dots = Array.prototype.slice.call(document.querySelectorAll('#lockDots span'));
    var self = this;
    document.querySelectorAll('#lockPad button').forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-key');
        if (k === 'del') self.del();
        else if (k === 'ok') self.submit();
        else self.push(k);
      });
    });
    document.addEventListener('keydown', function (e) {
      if (/^\d$/.test(e.key)) self.push(e.key);
      else if (e.key === 'Backspace') self.del();
      else if (e.key === 'Enter') self.submit();
    });
  },
  push: function (d) {
    if (this.val.length >= 6) return;
    this.val += d;
    this.msg.textContent = '';
    this.render();
    if (this.val.length === 6) this.submit();
  },
  del: function () {
    this.val = this.val.slice(0, -1);
    this.msg.textContent = '';
    this.render();
  },
  submit: function () {
    if (this.val.length < 6) {
      this.msg.textContent = '\u8fd8\u5dee ' + (6 - this.val.length) + ' \u4f4d\u54e6~';
      return;
    }
    var self = this;
    if (this.val === this.pass) {
      this.msg.textContent = '';
      this.el.classList.add('unlocked');
      LOADER.start();
      setTimeout(function () { self.el.style.display = 'none'; }, 650);
    } else {
      this.msg.textContent = '\u5bc6\u7801\u4e0d\u5bf9\u54e6\uff0c\u518d\u8bd5\u4e00\u6b21~';
      var d = document.getElementById('lockDots');
      d.classList.remove('shake');
      void d.offsetWidth;
      d.classList.add('shake');
      this.val = '';
      this.render();
    }
  },
  render: function () {
    for (var i = 0; i < 6; i++) this.dots[i].classList.toggle('on', i < this.val.length);
  }
};

/* ============================================================
   加载页：照片 + BGM 全部就绪后才放行
   ============================================================ */
var assetsReady = false;
var LOADER = {
  total: 0, done: 0, finished: false,
  start: function () {
    var urls = [], seen = {};
    function add(u) { if (!seen[u]) { seen[u] = 1; urls.push(u); } }
    TIMELINE.forEach(function (st) { st.photos.forEach(function (pid) { add('assets/images/' + pid + '.jpg'); }); });
    Object.keys(ALBUMS).forEach(function (k) {
      var ph = ALBUMS[k].photos || [];
      ph.forEach(function (pid) { add('assets/images/' + pid + '.jpg'); });
    });
    FINALE.slideshow.forEach(function (pid) { add('assets/images/' + pid + '.jpg'); });
    Object.keys(CONFIG.bgm).forEach(function (k) { add(CONFIG.bgm[k]); });
    add(CONFIG.songFile);
    this.total = urls.length;
    var self = this;
    urls.forEach(function (u) {
      if (/\.mp3$/i.test(u)) {
        var a = new Audio();
        a.preload = 'auto';
        a.src = u;
        var fin = function () { self.tick(); };
        a.addEventListener('canplaythrough', fin);
        a.addEventListener('error', fin);
        a.addEventListener('abort', fin);
      } else {
        var im = new Image();
        var fin2 = function () { self.tick(); };
        im.onload = fin2;
        im.onerror = fin2;
        im.onabort = fin2;
        im.src = u;
      }
    });
    // 15 秒后显示“直接进入”按钮；120 秒兜底强制放行，避免永远卡住
    this.skipTimer = setTimeout(function () { $('#loader').classList.add('show-skip'); }, 15000);
    this.timer = setTimeout(function () { self.force(); }, 120000);
  },
  tick: function () {
    if (this.finished) return;
    this.done++;
    var pct = Math.min(100, Math.round(this.done / this.total * 100));
    $('#loaderBar').style.width = pct + '%';
    $('#loaderText').textContent = '正在加载回忆 ' + pct + '%';
    if (this.done >= this.total) this.finish();
  },
  force: function () { this.finish(); },
  finish: function () {
    if (this.finished) return;
    this.finished = true;
    clearTimeout(this.timer);
    clearTimeout(this.skipTimer);
    assetsReady = true;
    $('#loaderBar').style.width = '100%';
    $('#loaderText').textContent = '加载完成，点击礼盒开始~';
    $('#loader').classList.add('done');
    setTimeout(function () { $('#loader').style.display = 'none'; }, 700);
  }
};
$('#loaderSkip').addEventListener('click', function () { LOADER.force(); });
LOCK.init();

makeStars($('#s1Stars'), 60);
makeStars($('#s2Stars'), 46);
initS1();
initS2();
initS3();
initS4();
initS5();
initS6();
initMute();

})();
