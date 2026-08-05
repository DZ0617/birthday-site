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
function rand2(r) { return r[0] + Math.random() * (r[1] - r[0]); }

/* 触感反馈（仅安卓生效，iOS 无 navigator.vibrate，静默跳过） */
function buzz(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }

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
  paper:      function () { noise({ d: 0.4, a: 0.05, peak: 0.3, filterType: 'lowpass', freq: 700 }); },
  scratch:    function () { noise({ d: 0.05, peak: 0.1, filterType: 'bandpass', freq: 3200, q: 0.7 }); },
};

/* ---------- 八音盒版《生日快乐歌》（标准旋律，循环播放到离开吹蜡烛页） ---------- */
var MusicBox = {
  playing: false, timer: null, beat: 0.42, reps: 0, MAX_REPS: 99, // 循环陪到她吹完蜡烛，由 leaveHooks.s2 停止
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
   注意：不用 createMediaElementSource 路由——部分 WebView（安卓微信等）
   路由后无声且不可回退，直接走元素播放 + volume 淡入最稳
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

/* ---------- 律动光晕（纯 CSS 呼吸，随 BGM/歌曲播放起落，零风险） ---------- */
function pulseOn() { var p = $('#bgPulse'); if (p) p.classList.add('on'); }
function pulseOff() { var p = $('#bgPulse'); if (p) p.classList.remove('on'); }

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
    pulseOn();
  } else {
    pulseOff();
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
    p.vy += p.g;
    if (p.brakeAfter && age * 60 > p.brakeAfter) { p.vx *= 0.86; p.vy *= 0.86; } // 到位后急停（心形定格）
    p.x += p.vx; p.y += p.vy; p.rot += p.vr;
    if (p.swayA) p.x += Math.sin(age * p.swayF + p.swayP) * p.swayA; // 花瓣摇摆
    var k = 1 - age / p.life;
    if (p.twinkle) k *= 0.6 + 0.4 * Math.sin(age * 16 + p.x); // 星光闪烁
    fctx.save();
    fctx.globalAlpha = Math.max(0, k);
    fctx.translate(p.x * DPR, p.y * DPR);
    fctx.rotate(p.rot);
    fctx.fillStyle = p.color;
    if (p.shape === 'rect') {
      fctx.fillRect(-p.size / 2 * DPR, -p.size / 4 * DPR, p.size * DPR, p.size / 2 * DPR);
    } else if (p.shape === 'petal') {
      fctx.beginPath();
      fctx.ellipse(0, 0, p.size * DPR, p.size * 0.58 * DPR, 0, 0, 6.283);
      fctx.fill();
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

/* 心形烟花：粒子从中心飞出心形曲线后急停、闪烁、缓慢消散 */
var HEART_COLORS = ['#ff5b8d', '#ff8fab', '#ff2e63', '#ffd1dc', '#ffffff'];
function heartFireworkAt(cx, cy, R) {
  var N = 90, T = 52, g = 0.045; // T≈0.87s 到位
  for (var i = 0; i < N; i++) {
    var t = (i / N) * Math.PI * 2;
    var hx = 16 * Math.pow(Math.sin(t), 3);
    var hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    var tx = cx + hx * R / 16;
    var ty = cy - hy * R / 16; // 画布 y 向下，心形翻转
    parts.push({
      x: cx, y: cy,
      vx: (tx - cx) / T,
      vy: (ty - cy) / T - 0.5 * g * T,
      g: g, brakeAfter: T,
      rot: 0, vr: 0,
      size: 2 + Math.random() * 2,
      color: HEART_COLORS[i % HEART_COLORS.length],
      shape: 'dot', twinkle: true,
      t0: performance.now(), life: 2.6 + Math.random() * 0.6
    });
  }
  // 中心一小撮白色碎光，模拟炸点
  for (var j = 0; j < 22; j++) {
    var a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 5;
    parts.push({
      x: cx, y: cy,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 0.05,
      rot: 0, vr: 0, size: 1.4 + Math.random() * 1.6,
      color: '#ffffff', shape: 'dot', twinkle: true,
      t0: performance.now(), life: 0.9 + Math.random() * 0.5
    });
  }
  fxKick();
}

/* 信纸场景飘落的花瓣 */
var PETAL_COLORS = ['#ffc2d4', '#ff8fab', '#ffd6e0', '#ffe5ec'];
function petal() {
  parts.push({
    x: Math.random() * window.innerWidth, y: -20,
    vx: (Math.random() - 0.5) * 0.6, vy: 1 + Math.random() * 1.2, g: 0.004,
    rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.06,
    size: 5 + Math.random() * 4,
    color: PETAL_COLORS[(Math.random() * PETAL_COLORS.length) | 0],
    shape: 'petal',
    swayA: 0.5 + Math.random() * 0.5, swayF: 1.2 + Math.random() * 1.4, swayP: Math.random() * 6,
    t0: performance.now(), life: 11 + Math.random() * 4
  });
  fxKick();
}

/* ============================================================
   银河漫游：视差星野（指针/陀螺仪视差 + 磁吸星尘 + 流星）
   ============================================================ */
function createSky(canvas) {
  var ctx = canvas.getContext('2d');
  var stars = [], mets = [], raf = 0, W = 0, H = 0;
  var DPR = Math.min(2, window.devicePixelRatio || 1);
  var ptr = { x: -9999, y: -9999 };
  var t0 = performance.now(), metIv = null;
  function resize() {
    W = canvas.clientWidth || window.innerWidth;
    H = canvas.clientHeight || window.innerHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
  }
  function build() {
    stars = [];
    for (var i = 0; i < 110; i++) {
      var layer = i < 50 ? 0 : (i < 90 ? 1 : 2);
      stars.push({ x: Math.random(), y: Math.random(),
        r: layer === 0 ? 0.6 + Math.random() * 0.8 : 0.9 + Math.random() * 1.5,
        dep: [0.25, 0.55, 1][layer], ph: Math.random() * 6.28, sp: 1 + Math.random() * 2 });
    }
  }
  function meteor() {
    mets.push({ x: W * 0.15 + Math.random() * W * 0.75, y: -20,
      vx: -(3.4 + Math.random() * 2), vy: 3 + Math.random() * 1.6, life: 1 });
  }
  function loop(now) {
    raf = requestAnimationFrame(loop);
    var t = (now - t0) / 1000;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    var ox = ptr.x - W / 2, oy = ptr.y - H / 2;
    for (var i = 0; i < stars.length; i++) {
      var st = stars[i];
      var x = st.x * W - ox * 0.045 * st.dep, y = st.y * H - oy * 0.045 * st.dep;
      var dx = ptr.x - x, dy = ptr.y - y, d = Math.sqrt(dx * dx + dy * dy);
      if (d < 110 && d > 1) { var f = (1 - d / 110) * 14; x += dx / d * f; y += dy / d * f; }
      ctx.globalAlpha = 0.25 + 0.65 * Math.abs(Math.sin(t * st.sp + st.ph));
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x, y, st.r, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;
    mets = mets.filter(function (m) {
      m.x += m.vx; m.y += m.vy; m.life -= 0.012;
      if (m.life <= 0 || m.y > H + 40) return false;
      var g = ctx.createLinearGradient(m.x, m.y, m.x - m.vx * 12, m.y - m.vy * 12);
      g.addColorStop(0, 'rgba(255,255,255,' + (0.9 * m.life) + ')');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = g; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(m.x - m.vx * 12, m.y - m.vy * 12); ctx.stroke();
      return true;
    });
  }
  var stage = canvas.parentElement;
  stage.addEventListener('pointermove', function (e) {
    var r = canvas.getBoundingClientRect();
    ptr.x = e.clientX - r.left; ptr.y = e.clientY - r.top;
  });
  stage.addEventListener('pointerleave', function () { ptr.x = -9999; ptr.y = -9999; });
  try { // 陀螺仪视差（iOS 未授权时静默不触发，无副作用）
    window.addEventListener('deviceorientation', function (e) {
      if (e.gamma == null || !raf) return;
      ptr.x = W / 2 + clamp(e.gamma, -30, 30) * 6;
      ptr.y = H / 2 + clamp((e.beta || 45) - 45, -25, 25) * 6;
    });
  } catch (e) {}
  window.addEventListener('resize', function () { if (raf) { resize(); build(); } });
  return {
    start: function () {
      if (raf) return;
      resize(); build();
      raf = requestAnimationFrame(loop);
      metIv = setInterval(function () { if (Math.random() < 0.5 && !document.hidden) meteor(); }, 4200);
    },
    stop: function () {
      cancelAnimationFrame(raf); raf = 0;
      if (metIv) { clearInterval(metIv); metIv = null; }
    },
    meteor: meteor
  };
}

/* ---------- 指尖物理：3D tilt（卡片跟随手指倾斜） ---------- */
function bindTilt(el, max) {
  el.addEventListener('pointermove', function (e) {
    el.classList.add('tilt-live'); // 中和 dropIn 动画的 forwards 填充，否则 transform 不生效
    var r = el.getBoundingClientRect();
    var px = (e.clientX - r.left) / r.width - 0.5;
    var py = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = 'rotate(var(--rot, 0deg)) perspective(700px) rotateX(' +
      (-py * max).toFixed(2) + 'deg) rotateY(' + (px * max).toFixed(2) + 'deg)';
  });
  el.addEventListener('pointerleave', function () {
    el.style.transform = 'rotate(var(--rot, 0deg))';
  });
}

/* ---------- 甩一甩检测（拍立得显影用，iOS 未授权静默跳过） ---------- */
function watchShake(cb) {
  var last = 0;
  function onMotion(e) {
    var a = e.accelerationIncludingGravity;
    if (!a || a.x == null) return;
    var m = Math.abs(a.x) + Math.abs(a.y) + Math.abs(a.z);
    if (m > 38 && Date.now() - last > 1200) { last = Date.now(); cb(); }
  }
  window.addEventListener('devicemotion', onMotion);
  return function () { window.removeEventListener('devicemotion', onMotion); };
}

/* ---------- 通用 toast ---------- */
function showToast(text, ms) {
  var old = $('.toast'); if (old) old.remove();
  var t = ce('div', 'toast', text);
  $('#' + currentScene).appendChild(t);
  requestAnimationFrame(function () { t.classList.add('show'); });
  setTimeout(function () {
    t.classList.remove('show');
    setTimeout(function () { t.remove(); }, 500);
  }, ms || 2600);
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
    buzz(35);
    setTimeout(function () { SFX.pop(); }, 260);
    var r = this.getBoundingClientRect();
    confetti(r.left + r.width / 2, r.top + r.height / 2, 130);
    this.classList.add('open');
    $('#giftHint').classList.add('fade-out');
    MusicBox.start();
    setTimeout(startGreeting, 750);
  });
}
function startGreeting() {
  $('#greeting').classList.remove('hidden');
  var text = CONFIG.herName + '，生日快乐';
  var box = $('#bigTitle');
  box.textContent = '';
  // 逐字弹入：--d 控制入场延迟，--sd 控制流光的相位错开（波浪扫过）
  text.split('').forEach(function (ch, i) {
    var sp = ce('span', 'ch');
    sp.textContent = ch;
    sp.style.setProperty('--d', (i * 0.16) + 's');
    sp.style.setProperty('--sd', (-i * 0.22) + 's');
    box.appendChild(sp);
    setTimeout(function () { SFX.tick(); }, i * 160);
  });
  var total = text.length * 160 + 500;
  setTimeout(function () {
    var st = $('#subTitle');
    st.classList.remove('hidden');
    st.classList.add('fade-in');
  }, total);
  // 标题播完自动进入吹蜡烛（按用户要求去掉了按钮）
  setTimeout(function () { SFX.click(); goto('s2'); }, total + 1200);
}
enterHooks.s1 = function () { sky1.start(); };
leaveHooks.s1 = function () { sky1.stop(); }; // 音乐不停：生日快乐歌继续陪到愿望/吹蜡烛页

/* ============================================================
   第 2 幕 · 吹蜡烛（麦克风优先，失败降级长按）
   ============================================================ */
var micStream = null, analyser = null, micData = null;
var micMode = false, pressMode = false, pressing = false, pressStart = 0;
var blowPower = 0, candlesOut = 0, candleDone = false, micTried = false;
var wasBlowing = false;
var windSrc = null, windGain = null;
var micFallback = null;
var windBarEl = $('#windBar'), cakeEl = $('#cake'), flameEls = $$('#cake .flame'); // 缓存：blowLoop 每帧要用
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
  sky2.start();
  if (candleDone) return;
  if (!micTried) { micTried = true; setupMic(); }
  enablePressMode(); // 长按兜底立即生效，麦克风拿到后两者都可用
};
leaveHooks.s2 = function () { clearMicFallback(); stopMic(); stopWind(); MusicBox.stop(); sky2.stop(); };

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
  if (!candleDone && candlesOut < 3) {
    if (!wishConfirmed) showWishNudge(); // 愿望没确定：提示先写愿望
    else showNudge();
  }
}

function showNudge() {
  var n = $('#candleNudge');
  n.textContent = '风力不够哦，再用力一点～';
  clearTimeout(n._tm);
  n._tm = setTimeout(function () { n.textContent = ''; }, 1600);
}

/* 愿望未确定时的吹气提示（节流，避免每帧刷屏） */
var lastWishNudge = 0;
function showWishNudge() {
  var now = Date.now();
  if (now - lastWishNudge < 1600) return;
  lastWishNudge = now;
  var n = $('#candleNudge');
  n.textContent = '先写下生日愿望，点「确定」再吹哦~';
  clearTimeout(n._tm);
  n._tm = setTimeout(function () { n.textContent = ''; }, 2200);
  buzz(30);
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
  // 愿望未确认前吹气无效：提示先写愿望并点确定
  if (!wishConfirmed) {
    if (pressing || wasBlowing) showWishNudge();
    wasBlowing = false;
    windBarEl.style.transform = 'scaleX(0)';
    setWind(0);
    return;
  }
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
  // 风力可视化：火苗倾斜压扁 + 烛光明暗 + 风力条（--wind 经 CSS 变量驱动火焰动画）
  var wVis = clamp(Math.max(blowPower, level / 0.3), 0, 1);
  cakeEl.style.setProperty('--wind', wVis.toFixed(3));
  var fd = (0.34 - wVis * 0.2).toFixed(3) + 's'; // 风越大火苗抖得越快
  for (var fi = 0; fi < flameEls.length; fi++) flameEls[fi].style.animationDuration = fd;
  windBarEl.style.transform = 'scaleX(' + clamp(wVis, 0.02, 1) + ')';
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
  buzz(25);
}

function candleSuccess() {
  candleDone = true;
  clearMicFallback();
  stopMic();
  stopWind();
  cakeEl.style.setProperty('--wind', '0');
  buzz([30, 60, 30]);
  $('#candleHint').textContent = '';
  $('#candleNudge').textContent = '';
  $('#windBar').style.transform = 'scaleX(0)';
  fireworksShow(5, 450);
  $('#s2').classList.add('lit');
  saveWish(); // 愿望装瓶（本地 + 偷偷上传）
  // 烟花放完直接进时光轴（按用户要求：不显示愿望消息、无按钮）
  setTimeout(function () { goto('s3'); }, 3400);
}

/* ============================================================
   第 3 幕 · 时光轴
   ============================================================ */
var tlBuilt = false;
var unShake = null;
enterHooks.s3 = function () {
  playBGM('timeline');
  if (!tlBuilt) {
    buildTimeline();
    SFX.page();
    setTimeout(function () { showToast('📸 甩甩手机，照片显影更快哦', 3000); }, 1600);
  }
  if (!unShake) unShake = watchShake(function () {
    var fresh = $$('.polaroid.fresh');
    if (!fresh.length) return;
    fresh.forEach(function (p) { p.classList.add('developed'); });
    SFX.shutter(); buzz(20);
    showToast('📸 甩一甩，照片全部显影！');
  });
};
leaveHooks.s3 = function () { if (unShake) { unShake(); unShake = null; } };
function initS3() {
  $('#toS4').addEventListener('click', function () { SFX.click(); goto('s4'); });
  initLightbox();
  // 时光轴滚动进度线
  $('#tlScroll').addEventListener('scroll', function () {
    var max = this.scrollHeight - this.clientHeight;
    var f = $('#tlFill');
    if (f) f.style.height = (max > 0 ? clamp(this.scrollTop / max, 0, 1) * 100 : 0) + '%';
  }, { passive: true });
  $('#eggClose').addEventListener('click', function () {
    SFX.click();
    $('#eggModal').classList.add('hidden');
  });
}
function buildTimeline() {
  tlBuilt = true;
  var list = $('#tlList');
  // 进度线轨道（绝对定位在站点虚线上）
  var track = ce('div', 'tl-track');
  var fill = ce('div', 'tl-fill');
  fill.id = 'tlFill';
  track.appendChild(fill);
  list.appendChild(track);
  TIMELINE.forEach(function (st) {
    var d = ce('div', 'station');
    d.appendChild(ce('div', 'station-head rise',
      '<span class="t-date">' + st.date + '</span><h3>' + st.title + '</h3>'));
    var urls = st.photos.map(function (pid) { return 'assets/images/' + pid + '.jpg'; });
    var ph = ce('div', 't-photos');
    if (st.photos.length === 1) ph.classList.add('single');
    st.photos.forEach(function (pid, pi) {
      var pol = ce('div', 'polaroid');
      pol.classList.add('fresh'); // 拍立得先"未显影"，滚动出现后自动显影（也可甩手机加速）
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
        openLightbox(urls, pi);
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
      bindTilt(pol, 8); // 指尖物理：手指按住照片可 3D 倾斜
    });
    d.appendChild(ph);
    d.appendChild(ce('p', 't-text rise', st.text));
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
      if (en.target.classList.contains('polaroid')) { // 出片音效只给拍立得
        var n = Date.now();
        if (n - lastSnd > 350) { lastSnd = n; SFX.eject(); }
        // 滚动出现 1.4 秒后自动显影（甩手机可立即全部显影）
        setTimeout(function () { en.target.classList.add('developed'); }, 1400);
      }
    });
  }, { root: $('#tlScroll'), threshold: 0.2 });
  $$('.polaroid, .rise').forEach(function (p) { io.observe(p); });
}

/* ---------- 大图查看：左右切换 / 滑动 / 计数 / 键盘 ---------- */
var lbList = [], lbIdx = 0;
function openLightbox(list, idx) {
  lbList = list;
  lbIdx = idx;
  updateLightbox();
  $('#lightbox').classList.remove('hidden');
}
function updateLightbox() {
  var im = $('#lightboxImg');
  im.src = lbList[lbIdx];
  im.classList.remove('lb-pop');
  void im.offsetWidth;
  im.classList.add('lb-pop');
  $('#lbCount').textContent = (lbIdx + 1) + ' / ' + lbList.length;
  var multi = lbList.length > 1;
  $('#lbPrev').style.display = multi ? '' : 'none';
  $('#lbNext').style.display = multi ? '' : 'none';
  $('#lbCount').style.display = multi ? '' : 'none';
}
function lbNav(d) {
  if (lbList.length < 2) return;
  lbIdx = (lbIdx + d + lbList.length) % lbList.length;
  updateLightbox();
  SFX.page();
}
function closeLightbox() {
  $('#lightbox').classList.add('hidden');
  $('#lightboxImg').src = '';
}
function initLightbox() {
  var lb = $('#lightbox');
  $('#lbPrev').addEventListener('click', function (e) { e.stopPropagation(); lbNav(-1); });
  $('#lbNext').addEventListener('click', function (e) { e.stopPropagation(); lbNav(1); });
  var lbX = null;
  lb.addEventListener('pointerdown', function (e) { lbX = e.clientX; });
  lb.addEventListener('pointerup', function (e) {
    var dx = lbX == null ? 0 : e.clientX - lbX;
    lbX = null;
    if (lbList.length > 1 && Math.abs(dx) > 48) { lbNav(dx < 0 ? 1 : -1); return; }
    if (Math.abs(dx) <= 10 && !e.target.closest('.lb-nav')) closeLightbox(); // 点按空白/照片关闭
  });
  lb.addEventListener('pointercancel', function () { lbX = null; });
  document.addEventListener('keydown', function (e) {
    if ($('#lightbox').classList.contains('hidden')) return;
    if (e.key === 'ArrowLeft') lbNav(-1);
    else if (e.key === 'ArrowRight') lbNav(1);
    else if (e.key === 'Escape') closeLightbox();
  });
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
  $('#toS5').addEventListener('click', function () { SFX.click(); goto('sGame'); });
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
    bindTilt(card, 6); // 指尖物理：房间卡片跟随手指倾斜
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
/* 房间三：绝密档案——前 7 次照常拒绝，第 8 次反转开门掉「死缠烂打券」 */
var forbiddenCracked = false; // 是否已开门（本局只开一次）
var forbiddenCard = {
  icon: '🔓', text: '死缠烂打券', rarity: 'SSR', tier: 3,
  desc: '对着一扇打不开的门连试 8 次密码的狠人，值得表彰：凭此券可要求他如实回答任何一个问题，不许撒谎、不许装傻、不许转移话题。'
};

function renderForbidden(c) {
  if (forbiddenCracked) { renderForbiddenCracked(c); return; } // 已开过：直接显示战利品
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
    // —— 第 8 次：反转开门 ——
    if (denyCount >= 8) { openForbidden(c); return; }
    SFX.fail();
    buzz(70);
    if (denyCount === 7) msg.textContent = '（门锁发出了奇怪的声音……）'; // 第 7 次埋钩子
    else if (denyCount >= 6) msg.textContent = a.denyMore[2];
    else if (denyCount === 5) msg.textContent = a.denyMore[1];
    else if (denyCount === 4) msg.textContent = a.denyMore[0];
    else msg.textContent = a.denyMsg + (denyCount >= 3 ? '\n' + a.denyMsg3 : '');
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

/* 反转开门：掉卡 + 撒花 */
function openForbidden(c) {
  forbiddenCracked = true;
  SFX.unlock();
  buzz([40, 60, 40, 60, 80]);
  addCard(forbiddenCard); // 入卡包，自动发编号
  renderForbiddenCracked(c, true);
  SFX.reward();
  confetti(window.innerWidth / 2, window.innerHeight * 0.3, 90);
  setTimeout(function () {
    heartFireworkAt(window.innerWidth / 2, window.innerHeight * 0.32,
      Math.min(window.innerWidth, window.innerHeight) * 0.24);
    SFX.firework();
  }, 500);
}

/* 开门后的房间内容（firstTime=true 时是首次开门的演出） */
function renderForbiddenCracked(c, firstTime) {
  c.innerHTML = '';
  var panel = ce('div', 'task-card');
  panel.appendChild(ce('p', 'task-text',
    firstTime
      ? '……行吧，我输了。<br>这个房间根本就没有密码，我承认。<br>但你居然试了 8 次都没放弃——这种精神必须表彰。门开了，里面没有照片，只有一张卡，归你了：'
      : '这个房间已经被你用死缠烂打的方式攻破了。<br>战利品在下面，卡包里也有一份~'));
  var got = ce('div', 'game-got-list');
  got.innerHTML = cardsToHtml([forbiddenCard]);
  panel.appendChild(got);
  var btn = ce('button', 'btn primary small', '收下，回房间列表');
  btn.addEventListener('click', function () {
    SFX.click();
    $('#roomBack').click(); // 复用现有返回逻辑
  });
  panel.appendChild(btn);
  c.appendChild(panel);
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
      buzz(35);
      setTimeout(function () { SFX.shutter(); }, 350);
      onOk();
    } else {
      SFX.fail();
      buzz(70);
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

/* 解锁成功：照片依次掉落，全部遮罩 → 点开刮开才可见（刮过的记住状态） */
var scratchedPhotos = {}; // { albumId: [pid, ...] }
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
    // 未刮开的照片盖涂层遮住
    var cover = ce('div', 'photo-cover', '🪙');
    if (scratchedPhotos[album.id] && scratchedPhotos[album.id].indexOf(pid) >= 0) cover.classList.add('off');
    p.appendChild(cover);
    p.addEventListener('click', function () {
      SFX.shutter();
      openScratchCard('assets/images/' + pid + '.jpg', function () {
        if (!scratchedPhotos[album.id]) scratchedPhotos[album.id] = [];
        if (scratchedPhotos[album.id].indexOf(pid) < 0) scratchedPhotos[album.id].push(pid);
        cover.classList.add('off'); // 刮开后缩略图揭开
      });
    });
    grid.appendChild(p);
  });
  c.appendChild(grid);
}

/* ============================================================
   第 5 幕 · 默契大考验（双模式：限时快答 / 悠闲节奏）
   ============================================================ */
var qIdx = 0, qScore = 0, qStreak = 0, qLock = false, quizStarted = false;
var quizMode = 'fast', qBaseTime = 8, qTimer = null;
enterHooks.s5 = function () {
  playBGM('quiz');
  if (!quizStarted) {
    quizStarted = true;
    $('#modeView').classList.remove('hidden');
    $('#quizView').classList.add('hidden');
    $('#rewardView').classList.add('hidden');
  }
};
function initS5() {
  $('#modeFast').addEventListener('click', function () { SFX.click(); startQuiz('fast'); });
  $('#modeChill').addEventListener('click', function () { SFX.click(); startQuiz('chill'); });
  $('#toScratch').addEventListener('click', function () { SFX.click(); openPrizeScratch(); });
  $('#toSong').addEventListener('click', function () { SFX.click(); goto('sSong'); });
  $('#toBag').addEventListener('click', function () { SFX.click(); goto('sBag'); });
  $('#toS6').addEventListener('click', function () { SFX.click(); goto('s6'); });
  $('#prizeAgain').addEventListener('click', function () {
    if (scratchCount >= 3) return;
    SFX.click();
    newPrizeCard();
  });
  $('#prizeKeep').addEventListener('click', function () {
    SFX.click();
    finishPrizeScratch(scratchGot[scratchGot.length - 1]);
  });
  $('#prizeClose').addEventListener('click', function () {
    SFX.click();
    $('#prizeModal').classList.add('hidden');
  });
  $('#scratchClose').addEventListener('click', function () {
    SFX.click();
    $('#scratchCard').classList.add('hidden');
  });
  $('#songPlay').addEventListener('click', function () {
    if (!songQEl) return;
    SFX.click();
    if (songQEl.paused) {
      try { songQEl.currentTime = 0; } catch (e) {}
      var p = songQEl.play();
      if (p && p.catch) p.catch(function () {});
      if (songPlayed && songReplays === 0) songReplays = 1; // 首次播放免费，第二次起算重听
      songPlayed = true;
      $('#songPlay').textContent = songReplays >= 1 ? '🔁 重听中（已用 1 次，答对 10 分）' : '🔁 重听一遍（答对仍是 20 分）';
    } else {
      try { songQEl.pause(); } catch (e) {}
      $('#songPlay').textContent = '▶ 播放前奏';
    }
  });
}
function startQuiz(mode) {
  quizMode = mode;
  qIdx = 0; qScore = 0; qStreak = 0;
  $('#modeView').classList.add('hidden');
  $('#quizView').classList.remove('hidden');
  renderQuestion();
}
function stopQTimer() { if (qTimer) { clearTimeout(qTimer); qTimer = null; } }
function startQTimer() {
  stopQTimer();
  var bar = $('#qTimerBar'), tEl = $('#qTimer');
  tEl.classList.remove('warn');
  bar.style.transition = 'none';
  bar.style.transform = 'scaleX(1)';
  void bar.offsetWidth;
  bar.style.transition = 'transform ' + qBaseTime + 's linear';
  bar.style.transform = 'scaleX(0)';
  qTimer = setTimeout(function () { // 超时算错
    if (qLock) return;
    qLock = true;
    qStreak = 0;
    SFX.dong();
    buzz([50, 40, 50]);
    tEl.classList.add('warn');
    $$('#qOptions .opt')[QUIZ[qIdx].answer].classList.add('right');
    $('#qScore').textContent = '得分 ' + qScore;
    setTimeout(nextQ, 950);
  }, qBaseTime * 1000);
}
function nextQ() {
  qIdx++;
  if (qIdx < QUIZ.length) renderQuestion();
  else showReward();
}
function renderQuestion() {
  qLock = false;
  stopQTimer();
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
  if (quizMode === 'fast') {
    $('#qTimer').classList.remove('hidden');
    qBaseTime = Math.max(5, 8 - Math.floor(qStreak / 2)); // 连对 2 题后每题加速 1 秒（最少 5 秒）
    startQTimer();
  } else {
    $('#qTimer').classList.add('hidden');
  }
}
function answer(i, btn) {
  if (qLock) return;
  qLock = true;
  stopQTimer();
  var q = QUIZ[qIdx];
  var ok = i === q.answer;
  var opts = $$('#qOptions .opt');
  if (ok) {
    qScore += 10;
    qStreak++;
    SFX.ding();
    buzz(20);
    btn.classList.add('right');
    if (qStreak % 3 === 0) confetti(window.innerWidth / 2, window.innerHeight * 0.2, 45); // 连对 3 题小彩带
  } else {
    qStreak = 0;
    SFX.dong();
    buzz([50, 40, 50]);
    btn.classList.add('wrong');
    opts[q.answer].classList.add('right');
  }
  $('#qScore').textContent = '得分 ' + qScore;
  setTimeout(nextQ, 950);
}
function showReward() {
  playBGM('reward'); // 结算切《就是爱你》
  $('#quizView').classList.add('hidden');
  $('#rewardView').classList.remove('hidden');
  var correct = qScore / 10;
  $('#rScore').textContent = '10 题答对 ' + correct + ' 题 · 得分 ' + qScore + ' 分';
  var box = $('#rCoupons');
  box.innerHTML = '';
  if (quizMode === 'fast') {
    // 限时快答：按答对数给奖励卡
    var gained = [];
    if (correct >= 10) { gained.push(pickCard(1), pickCard(1), pickCard(3)); quizPerfect = true; }
    else if (correct >= 8) gained.push(pickCard(1), pickCard(1));
    else gained.push(pickCard(1));
    gained.forEach(addCard);
    $('#rTitle').textContent = correct >= 10 ? '满分情侣 💯'
      : correct >= 8 ? '默契满分 💘'
      : correct >= 5 ? '心有灵犀 💞'
      : '还要多了解 💗';
    box.innerHTML = cardsToHtml(gained);
  } else {
    // 悠闲节奏：纯红包档（截图找我领取）；<5 题按约定给抱抱券
    var r = CHILL_REWARDS[CHILL_REWARDS.length - 1];
    for (var i = 0; i < CHILL_REWARDS.length; i++) {
      if (correct >= CHILL_REWARDS[i].min) { r = CHILL_REWARDS[i]; break; }
    }
    $('#rTitle').textContent = r.title;
    box.innerHTML = '<div class="coupon"><span class="cp-tag">' + r.icon + '</span><span>' + r.text + '</span></div>';
    if (correct < 5) { // 按约定给抱抱券（入卡包）
      var hug = REWARDS.N[1];
      addCard({ icon: hug.icon, text: hug.text, desc: hug.desc, rarity: 'N', tier: 1 });
    }
  }
  SFX.reward();
  buzz([25, 50, 25, 50, 60]);
  var n = 0;
  var tm = setInterval(function () {
    confetti(window.innerWidth * (0.2 + Math.random() * 0.6), window.innerHeight * 0.22, 40);
    if (++n >= 4) clearInterval(tm);
  }, 500);
}

/* ============================================================
   统一奖励卡系统：每个游戏给卡 → rewardBag 汇总 → 猜歌后卡包展示
   ============================================================ */
var rewardBag = [];
var lovePerfect = false, quizPerfect = false; // 终极券成就记录

/* 卡池抽取：tier 1→N / 2→R / 3→SR，均带小概率「暴击升级」 */
var TIER_MAP = { 1: ['N', 0.12, 'R'], 2: ['R', 0.12, 'SR'], 3: ['SR', 0.1, 'SSR'] };
function pickCard(tier) {
  var m = TIER_MAP[tier] || TIER_MAP[1];
  var rar = Math.random() < m[1] ? m[2] : m[0];
  var pool = REWARDS[rar];
  var c = pool[(Math.random() * pool.length) | 0];
  return { icon: c.icon, text: c.text, desc: c.desc, rarity: rar, tier: tier };
}

/* 入包：补稀有度 + 发编号（NO.001 起，按稀有度分段） */
var cardSerial = { N: 30, R: 20, SR: 10, SSR: 0 };
function addCard(card) {
  if (!card.rarity) card.rarity = card.tier >= 3 ? 'SR' : card.tier === 2 ? 'R' : 'N';
  if (!card.no) card.no = 'NO.' + ('00' + (++cardSerial[card.rarity])).slice(-3);
  rewardBag.push(card);
}

/* 结算用迷你卡（接爱心 / 问答 / 猜歌的获得列表共用） */
function cardsToHtml(cards) {
  return cards.map(function (c, i) {
    var col = (RARITY[c.rarity] || RARITY.N).color;
    return '<div class="mini-card' + (c.rarity === 'SSR' ? ' ssr' : '') +
      '" style="--rc:' + col + ';animation-delay:' + (0.12 + i * 0.15) + 's">' +
      '<span class="mc-icon">' + c.icon + '</span>' +
      '<span class="mc-name">' + c.text + '</span>' +
      '<span class="mc-rar">' + c.rarity + '</span>' +
      '<span class="mc-no">' + (c.no || '') + '</span></div>';
  }).join('');
}

/* ============================================================
   奖励刮刮乐：答题结算后，先刮 1 次 → 可加刮至多 3 次 → 三选一
   ============================================================ */
var scratchGot = [], scratchCount = 0;
function pickScratchPrize() {
  // 40% N / 35% R / 25% SR（内含暴击升级），与游戏给卡同一池
  var r = Math.random();
  return pickCard(r < 0.4 ? 1 : r < 0.75 ? 2 : 3);
}
function openPrizeScratch() {
  scratchGot = [];
  scratchCount = 0;
  $('#prizeModal').classList.remove('hidden');
  newPrizeCard();
}
function newPrizeCard() {
  scratchCount++;
  var p = pickScratchPrize();
  scratchGot.push(p);
  $('#prizeSub').textContent = '刮开看看你抽到了什么（第 ' + scratchCount + ' / 3 次）';
  $('#prizeReveal').classList.add('hidden');
  $('#prizeBtns').classList.remove('hidden');
  $('#prizePool').classList.add('hidden');
  $('#prizeChoose').classList.add('hidden');
  $('#prizeDone').classList.add('hidden');
  $('#prizeClose').classList.add('hidden');
  $('#prizeAgain').style.display = scratchCount >= 3 ? 'none' : '';
  setupScratchCanvas($('#prizeCv'), function () {
    showPrizeReveal(p);
  });
}
function showPrizeReveal(p) {
  var rv = $('#prizeReveal');
  rv.classList.remove('hidden');
  rv.innerHTML = '<span class="pr-icon">' + p.icon + '</span><span class="pr-text">' + p.text + '</span>';
  SFX.pop();
  buzz(25);
  if (scratchCount >= 3) {
    // 三选一：从刮到的 3 个里保留 1 个
    $('#prizeBtns').classList.add('hidden');
    $('#prizeChoose').classList.remove('hidden');
    var pool = $('#prizePool');
    pool.classList.remove('hidden');
    pool.innerHTML = '';
    scratchGot.forEach(function (pp) {
      var card = ce('button', 'coupon');
      card.innerHTML = '<span class="cp-tag">' + pp.icon + '</span><span>' + pp.text + '</span>';
      card.addEventListener('click', function () { SFX.click(); finishPrizeScratch(pp); });
      pool.appendChild(card);
    });
  }
}
function finishPrizeScratch(p) {
  $('#prizePool').classList.add('hidden');
  $('#prizeChoose').classList.add('hidden');
  $('#prizeReveal').classList.remove('hidden');
  $('#prizeReveal').innerHTML = '<span class="pr-icon">' + p.icon + '</span><span class="pr-text">' + p.text + '</span>';
  $('#prizeSub').textContent = '恭喜你获得：';
  $('#prizeDone').classList.remove('hidden');
  $('#prizeClose').classList.remove('hidden');
  $('#prizeBtns').classList.add('hidden');
  addCard(p); // 选中的卡入奖励卡包
  SFX.reward();
  confetti(window.innerWidth / 2, window.innerHeight * 0.3, 60);
  showBtn($('#toSong')); // 刮完放行下一环节
}

/* ============================================================
   第 4.5 幕 · 接爱心（重做版）
   规则页 → 3-2-1 倒计时 → 连击倍率 / 金心护盾 / 难度曲线 / 矢量爱心
   ============================================================ */
var gCv = null, gCtx = null, gDPR = 1, gRAF = 0, gOver = true, gKeys = {};
var gScore = 0, gLives = 3, gGood = 0, gBad = 0;
var gCombo = 0, gMaxCombo = 0, gShield = false;
var gItems = [], gFloats = [], gRipples = [];
var gLastGood = 0, gLastBad = 0, gLastGold = 0;
var gPx = 0, gT0 = 0, gLastSec = -1, gCatchT = 0, gShakeT = 0;
var GOLD_MULT = 3; // 金心基础倍数

function gMult() { return gCombo >= 10 ? 3 : gCombo >= 5 ? 2 : 1; }

enterHooks.sGame = function () {
  $('#gameResult').classList.add('hidden');
  $('#gameRules').classList.remove('hidden');
  $('#gameCombo').classList.add('hidden');
  $('#gameTime').textContent = LOVE_GAME.duration;
  $('#gameScore').textContent = '0';
  $('#gameLives').textContent = '❤❤❤';
  setupGameCanvas();
  drawIdleFrame();
};

function setupGameCanvas() {
  gCv = $('#gameCv');
  gDPR = Math.min(2, window.devicePixelRatio || 1);
  gCv.width = window.innerWidth * gDPR;
  gCv.height = window.innerHeight * gDPR;
  gCtx = gCv.getContext('2d');
}
function drawIdleFrame() {
  if (!gCtx) return;
  var w = window.innerWidth, h = window.innerHeight;
  gCtx.setTransform(gDPR, 0, 0, gDPR, 0, 0);
  gCtx.clearRect(0, 0, w, h);
  drawHeart(gCtx, w / 2, h * 0.4, 18, 'rgba(255,91,141,.45)', 'rgba(255,91,141,.35)');
  drawBasket(performance.now(), h);
}

/* 矢量爱心：渐变 + 高光 + 外发光 */
function drawHeart(c, x, y, s, col, glow) {
  c.save();
  if (glow) { c.shadowColor = glow; c.shadowBlur = 16; }
  var g = c.createLinearGradient(x, y - s, x, y + s);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.18, col);
  g.addColorStop(1, col);
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(x, y + s * 0.9);
  c.bezierCurveTo(x - s * 1.15, y + s * 0.1, x - s * 0.55, y - s * 0.8, x, y - s * 0.15);
  c.bezierCurveTo(x + s * 0.55, y - s * 0.8, x + s * 1.15, y + s * 0.1, x, y + s * 0.9);
  c.fill();
  c.shadowBlur = 0;
  c.fillStyle = 'rgba(255,255,255,.55)'; // 高光点
  c.beginPath(); c.arc(x - s * 0.34, y - s * 0.18, s * 0.14, 0, 6.283); c.fill();
  c.restore();
}
function drawItem(it, now) {
  gCtx.save();
  gCtx.translate(it.x, it.y);
  gCtx.rotate(Math.sin(now / 320 + it.x * 0.1) * 0.14); // 下落轻摆
  if (it.type === 'good') {
    drawHeart(gCtx, 0, 0, 13, '#ff5b8d', 'rgba(255,91,141,.85)');
  } else if (it.type === 'gold') {
    var p = 1 + Math.sin(now / 120) * 0.14; // 金心脉动
    drawHeart(gCtx, 0, 0, 13 * p, '#ffd23e', 'rgba(255,210,62,.95)');
    gCtx.font = '12px serif'; gCtx.textAlign = 'center';
    gCtx.fillText('✨', 12, -14);
  } else {
    drawHeart(gCtx, 0, 0, 13, '#9aa3b8', 'rgba(120,130,160,.55)');
    gCtx.strokeStyle = 'rgba(15,18,38,.7)'; gCtx.lineWidth = 2; // 裂纹
    gCtx.beginPath();
    gCtx.moveTo(0, -4); gCtx.lineTo(-3, 3); gCtx.lineTo(2, 9); gCtx.lineTo(-1, 15);
    gCtx.stroke();
  }
  gCtx.restore();
}
function drawBasket(now, h) {
  var since = (now - gCatchT) / 1000;
  var sq = since < 0.25 ? 1 - Math.sin(since / 0.25 * Math.PI) * 0.18 : 1; // 接住时挤压回弹
  gCtx.save();
  gCtx.translate(gPx, h - 62);
  gCtx.scale(2 - sq, sq);
  var hot = Math.min(1, gCombo / 12); // 连击越高光环越亮
  var aura = gCtx.createRadialGradient(0, 0, 4, 0, 0, 46);
  aura.addColorStop(0, 'rgba(255,' + Math.round(217 - hot * 60) + ',' + Math.round(138 + hot * 60) + ',' + (0.24 + hot * 0.3) + ')');
  aura.addColorStop(1, 'rgba(255,180,94,0)');
  gCtx.fillStyle = aura;
  gCtx.beginPath(); gCtx.arc(0, 0, 46, 0, 6.283); gCtx.fill();
  if (gShield) { // 护盾圈
    gCtx.strokeStyle = 'rgba(123,211,255,.85)';
    gCtx.lineWidth = 2;
    gCtx.setLineDash([6, 6]);
    gCtx.beginPath(); gCtx.arc(0, 0, 36, now / 300, now / 300 + 6.283); gCtx.stroke();
    gCtx.setLineDash([]);
  }
  gCtx.font = '40px serif'; gCtx.textAlign = 'center'; gCtx.textBaseline = 'middle';
  gCtx.fillText('🧺', 0, 0);
  gCtx.restore();
}
function drawRipples(now) {
  gRipples = gRipples.filter(function (r) {
    var age = (now - r.t0) / 1000;
    if (age > 0.5) return false;
    gCtx.strokeStyle = 'rgba(' + r.col + ',' + (1 - age / 0.5).toFixed(2) + ')';
    gCtx.lineWidth = 2;
    gCtx.beginPath(); gCtx.arc(r.x, r.y, 10 + age * 90, 0, 6.283); gCtx.stroke();
    return true;
  });
}
function addFloat(x, y, txt, col) {
  gFloats.push({ x: x, y: y, txt: txt, col: col, t0: performance.now() });
}
function drawFloats(now) {
  gFloats = gFloats.filter(function (f) {
    var age = (now - f.t0) / 1000;
    if (age > 0.9) return false;
    gCtx.save();
    gCtx.globalAlpha = 1 - age / 0.9;
    gCtx.font = 'bold 15px sans-serif';
    gCtx.textAlign = 'center';
    gCtx.fillStyle = f.col;
    gCtx.shadowColor = f.col; gCtx.shadowBlur = 8;
    gCtx.fillText(f.txt, f.x, f.y - age * 46);
    gCtx.restore();
    return true;
  });
}

function updateLives() {
  $('#gameLives').textContent = '❤'.repeat(Math.max(0, gLives)) + (gShield ? '🛡' : '');
}
function updateCombo() {
  var el = $('#gameCombo');
  if (gCombo >= 3) {
    el.classList.remove('hidden');
    el.textContent = gCombo + ' 连击' + (gMult() > 1 ? ' · 得分 ×' + gMult() : '');
    el.classList.remove('hot'); void el.offsetWidth;
    if (gCombo >= 5) el.classList.add('hot');
  } else {
    el.classList.add('hidden');
  }
}
function flashRed() {
  var f = $('#gameFlash');
  f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
}

function gameCountdown(done) {
  var seq = ['3', '2', '1', 'GO!'];
  var el = $('#gameCount');
  el.classList.remove('hidden');
  var i = 0;
  (function step() {
    if (i >= seq.length) { el.classList.add('hidden'); done(); return; }
    el.textContent = seq[i++];
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    SFX.tick();
    setTimeout(step, i === seq.length ? 550 : 720);
  })();
}

function startHeartGame() {
  setupGameCanvas();
  gOver = false;
  gScore = 0; gLives = LOVE_GAME.lives; gGood = 0; gBad = 0;
  gCombo = 0; gMaxCombo = 0; gShield = false;
  gItems = []; gFloats = []; gRipples = [];
  gLastGood = 0; gLastBad = 0; gLastGold = 0;
  gT0 = performance.now(); gLastSec = -1; gCatchT = 0; gShakeT = 0;
  $('#gameResult').classList.add('hidden');
  $('#gameTime').textContent = LOVE_GAME.duration;
  $('#gameScore').textContent = '0';
  updateLives();
  updateCombo();
  gRAF = requestAnimationFrame(gameLoop);
}
function gameLoop() {
  if (gOver) return;
  gRAF = requestAnimationFrame(gameLoop);
  var now = performance.now();
  var el = (now - gT0) / 1000;
  var remain = LOVE_GAME.duration - el;
  if (remain <= 0) { endHeartGame(); return; }
  var sec = Math.ceil(remain);
  if (sec !== gLastSec) {
    gLastSec = sec;
    $('#gameTime').textContent = sec;
    if (sec <= 5) { buzz(15); SFX.tick(); }
  }
  var w = window.innerWidth, h = window.innerHeight;
  // 难度曲线：下落提速 55%，刷新变密 32%
  var ramp = 1 + (el / LOVE_GAME.duration) * 0.55;
  var gapM = 1 - (el / LOVE_GAME.duration) * 0.32;
  if (now - gLastGood > rand2(LOVE_GAME.goodGap) * gapM) { gLastGood = now; spawnHeart('good'); }
  if (now - gLastBad > rand2(LOVE_GAME.badGap) * gapM) { gLastBad = now; spawnHeart('bad'); }
  if (now - gLastGold > rand2([5200, 8200])) { gLastGold = now; spawnHeart('gold'); }
  if (gKeys.left) gPx -= 10;
  if (gKeys.right) gPx += 10;
  gPx = clamp(gPx, 42, w - 42);
  var shx = 0, shy = 0; // 受击震屏
  if (now - gShakeT < 220) { shx = (Math.random() - 0.5) * 8; shy = (Math.random() - 0.5) * 6; }
  gCtx.setTransform(gDPR, 0, 0, gDPR, 0, 0);
  gCtx.clearRect(0, 0, w, h);
  gCtx.translate(shx, shy);
  gItems = gItems.filter(function (it) {
    it.y += it.vy * ramp * (it.type === 'gold' ? 0.9 : 1);
    if (it.y > h - 30) { // 落地
      if (it.type === 'good') {
        if (gCombo > 2) addFloat(it.x, h - 60, '连击断了…', 'rgba(255,255,255,.55)');
        gCombo = 0; updateCombo();
      }
      return false;
    }
    drawItem(it, now);
    if (it.y > h - 92 && Math.abs(it.x - gPx) < 46) { // 接住
      catchItem(it, h);
      return false;
    }
    return true;
  });
  drawRipples(now);
  drawBasket(now, h);
  drawFloats(now);
}
function catchItem(it, h) {
  if (it.type === 'bad') {
    if (gShield) { // 护盾挡刀
      gShield = false;
      SFX.ding(); buzz(20);
      addFloat(it.x, h - 100, '护盾挡下！', '#7bd3ff');
      updateLives();
      return;
    }
    gLives--; gBad++;
    gCombo = 0; updateCombo();
    gScore = Math.max(0, gScore - LOVE_GAME.badDeduct);
    SFX.dong(); buzz([40, 40, 40]);
    gShakeT = performance.now();
    flashRed();
    addFloat(it.x, h - 100, '-' + LOVE_GAME.badDeduct, '#ef476f');
    updateLives();
    $('#gameScore').textContent = gScore;
    if (gLives <= 0) endHeartGame();
    return;
  }
  gCombo++;
  if (gCombo > gMaxCombo) gMaxCombo = gCombo;
  var m = gMult();
  var pts = (it.type === 'gold' ? LOVE_GAME.goodScore * GOLD_MULT : LOVE_GAME.goodScore) * m;
  gScore += pts;
  gGood++;
  gCatchT = performance.now();
  gRipples.push({ x: it.x, y: h - 70, t0: performance.now(),
    col: it.type === 'gold' ? '255,210,62' : '255,91,141' });
  if (it.type === 'gold') {
    if (!gShield) { gShield = true; updateLives(); }
    SFX.reward(); buzz(25);
    addFloat(it.x, h - 100, '+' + pts + ' 金心!', '#ffd23e');
    confetti(it.x, h - 90, 14);
  } else {
    SFX.ding();
    addFloat(it.x, h - 100, '+' + pts + (m > 1 ? ' ×' + m : ''), m > 1 ? '#ffd98a' : '#ff8fab');
    confetti(it.x, h - 90, 8);
  }
  updateCombo();
  $('#gameScore').textContent = gScore;
}
function spawnHeart(type) {
  gItems.push({
    x: 30 + Math.random() * (window.innerWidth - 60),
    y: -24,
    vy: rand2(LOVE_GAME.fallSpeed),
    type: type
  });
}
function endHeartGame() {
  if (gOver) return;
  gOver = true;
  if (gRAF) { cancelAnimationFrame(gRAF); gRAF = 0; }
  var t = LOVE_GAME.titles[LOVE_GAME.titles.length - 1].t;
  for (var i = 0; i < LOVE_GAME.titles.length; i++) {
    if (gScore >= LOVE_GAME.titles[i].min) { t = LOVE_GAME.titles[i].t; break; }
  }
  var gained = [pickCard(1)];
  if (gGood >= 20) gained.push(pickCard(1));
  if (gGood >= 30) { gained.push(pickCard(2)); lovePerfect = true; }
  gained.forEach(addCard);
  var tip = gGood >= 30 ? '太强了！获得 3 张卡！'
    : gGood >= 20 ? '手速不错！获得 2 张卡！'
    : '完成即得 1 张基础卡！';
  $('#gameTitle').textContent = t;
  $('#gameScoreTxt').textContent = '得分 ' + gScore + ' · 接住 ' + gGood + ' 颗爱心' +
    (gMaxCombo >= 3 ? ' · 最高 ' + gMaxCombo + ' 连击' : '') +
    (gBad ? ' · 被砸 ' + gBad + ' 次' : '') + ' · ' + tip;
  $('#gameGot').innerHTML = cardsToHtml(gained);
  $('#gameGotTitle').classList.remove('hidden');
  $('#gameGot').classList.remove('hidden');
  $('#gameResult').classList.remove('hidden');
  SFX.reward();
  confetti(window.innerWidth / 2, window.innerHeight * 0.3, 80);
}

document.addEventListener('keydown', function (e) {
  if (e.key === 'ArrowLeft') gKeys.left = true;
  else if (e.key === 'ArrowRight') gKeys.right = true;
});
document.addEventListener('keyup', function (e) {
  if (e.key === 'ArrowLeft') gKeys.left = false;
  else if (e.key === 'ArrowRight') gKeys.right = false;
});
function initGame() {
  var cv = $('#gameCv');
  cv.addEventListener('pointermove', function (e) { gPx = e.clientX; });
  cv.addEventListener('pointerdown', function (e) { gPx = e.clientX; });
  $('#gameStart').addEventListener('click', function () {
    SFX.click();
    $('#gameRules').classList.add('hidden');
    gameCountdown(startHeartGame);
  });
  $('#gameNext').addEventListener('click', function () { SFX.click(); goto('s5'); });
}

/* ============================================================
   第 5.5 幕 · 听前奏猜歌名（片段在 assets/audio/quiz/）
   ============================================================ */
var songIdx = 0, songScore = 0, songQEl = null, songReplays = 0, songLock = false, songPlayed = false;
enterHooks.sSong = function () {
  stopBGM(); // 猜歌时关掉背景音乐（否则《就是爱你》会一直响，干扰听前奏）
  songIdx = 0; songScore = 0; songLock = false;
  if (!songQEl) songQEl = new Audio();
  renderSongQ();
};
leaveHooks.sSong = function () { if (songQEl) { try { songQEl.pause(); } catch (e) {} } };
function renderSongQ() {
  songLock = false;
  songReplays = 0;
  songPlayed = false;
  var q = SONG_QUIZ[songIdx];
  $('#songqProgress').textContent = '第 ' + (songIdx + 1) + ' / ' + SONG_QUIZ.length + ' 首 · 得分 ' + songScore;
  $('#songReplay').textContent = '每首可重听 1 次（重听答对只得一半分）';
  $('#songPlay').textContent = '▶ 播放前奏';
  $('#songPlay').classList.remove('hidden');
  $('#songPlay').disabled = false;
  songQEl.src = q.file;
  songQEl.preload = 'auto';
  var box = $('#songOptions');
  box.innerHTML = '';
  q.options.forEach(function (op, i) {
    var b = ce('button', 'opt', '<span class="opt-tag">' + 'ABCD'[i] + '</span><span>' + op + '</span>');
    b.addEventListener('click', function () { songAnswer(i, b); });
    box.appendChild(b);
  });
  $('#toBag').classList.add('hidden'); // 猜歌期间不显示"去总览"按钮
}
function songAnswer(i, btn) {
  if (songLock) return;
  songLock = true;
  try { songQEl.pause(); } catch (e) {}
  $('#songPlay').classList.add('hidden');
  var q = SONG_QUIZ[songIdx];
  var ai = q.options.indexOf(q.answer);
  var ok = i === ai;
  var pts = ok ? (songReplays > 0 ? 10 : 20) : 0;
  var opts = $$('#songOptions .opt');
  if (ok) {
    songScore += pts;
    SFX.ding();
    buzz(20);
    btn.classList.add('right');
  } else {
    SFX.dong();
    buzz([50, 40, 50]);
    btn.classList.add('wrong');
    opts[ai].classList.add('right');
  }
  $('#songqProgress').textContent = '第 ' + (songIdx + 1) + ' / ' + SONG_QUIZ.length + ' 首 · 得分 ' + songScore + (ok ? (pts === 20 ? ' 🎵' : ' 🎧') : '');
  setTimeout(function () {
    songIdx++;
    if (songIdx < SONG_QUIZ.length) renderSongQ();
    else finishSongQuiz();
  }, 950);
}
function finishSongQuiz() {
  var correct = songScore / 20; // 每首满分 20
  var t = correct >= 5 ? '音乐大师 🎼' : correct >= 4 ? '耳机不离身 🎧' : '点歌台常客 🎤';
  $('#songqProgress').textContent = '猜歌得分 ' + songScore + ' · ' + t;
  // 猜歌奖励卡：5/5 高阶；4/5 进阶；其余基础（安慰）
  var gained = [];
  if (correct >= 5) gained.push(pickCard(3));
  else if (correct >= 4) gained.push(pickCard(2));
  else gained.push(pickCard(1));
  gained.forEach(addCard);
  // 终极券成就：接爱心≥30 + 限时满分 + 猜歌满分
  if (lovePerfect && quizPerfect && correct >= 5) {
    addCard(ULTIMATE_CARD);
    $('#songqSub').textContent = '三项全完美！解锁隐藏终极券！🏆';
  } else {
    $('#songqSub').textContent = '这些歌，都是我们一路走来的背景音乐~';
  }
  $('#songqSub').textContent += '（获得：' + gained.map(function (c) { return c.icon + ' ' + c.text; }).join('、') + '）';
  confetti(window.innerWidth / 2, window.innerHeight * 0.3, 90);
  SFX.reward();
  showBtn($('#toBag')); // 去奖励总览
}

/* ============================================================
   第 5.6 幕 · 奖励总览：所有卡汇总 + 2 次同级别替换机会
   ============================================================ */
var swapLeft = 2;
enterHooks.sBag = function () {
  swapLeft = 2; // 每次进总览都重置 2 次机会（本局只进一次）
  renderBag();
};
function renderBag() {
  var box = $('#bagList');
  box.innerHTML = '';
  box.className = 'bag-fan';
  rewardBag.forEach(function (card, i) {
    var col = (RARITY[card.rarity] || RARITY.N).color;
    var d = ce('div', 'holo-card' + (card.rarity === 'SSR' ? ' ssr' : ''));
    d.style.setProperty('--rc', col);
    d.style.animationDelay = (0.08 + i * 0.1) + 's';
    d.innerHTML =
      '<div class="hc-inner">' +
        '<div class="hc-face hc-front">' +
          '<span class="hc-rar">' + card.rarity + '</span>' +
          '<div class="hc-icon">' + card.icon + '</div>' +
          '<div class="hc-name">' + card.text + '</div>' +
          '<div class="hc-no">' + (card.no || '') + ' · 终身有效</div>' +
          '<div class="hc-holo"></div>' +
        '</div>' +
        '<div class="hc-face hc-back">' +
          '<div class="hc-bt">使用说明</div>' +
          '<div class="hc-bd">' + (card.desc || '截图找他兑换，终身有效。') + '</div>' +
          (card.tier ? '<button class="bag-swap" data-i="' + i + '">🔄 换一张同级卡</button>' : '') +
          '<div class="hc-bf">终身有效 · 截图找他兑换</div>' +
        '</div>' +
      '</div>';
    d.addEventListener('click', function (e) {
      if (e.target.closest('.bag-swap')) return;
      d.classList.toggle('flip');
      SFX.page();
    });
    d.addEventListener('pointermove', function (e) { // 全息高光跟随手指
      var r = d.getBoundingClientRect();
      d.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
      d.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
    });
    box.appendChild(d);
  });
  $('#bagSwapNote').textContent = swapLeft > 0
    ? '🔄 还有 ' + swapLeft + ' 次替换机会：翻开卡片，点卡背的「换一张同级卡」'
    : '替换机会已用完，都是你的啦~';
  $$('.bag-swap', box).forEach(function (b) {
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      if (swapLeft <= 0) return;
      SFX.click();
      var i = +b.getAttribute('data-i');
      var old = rewardBag[i];
      if (!old || !old.tier) return;
      var fresh = pickCard(old.tier);
      if (fresh.icon === old.icon && fresh.text === old.text) fresh = pickCard(old.tier);
      rewardBag[i] = fresh;
      swapLeft--;
      renderBag();
      SFX.ding(); buzz(20);
    });
  });
  renderSets();
  checkFullSet();
}

/* 集章进度 + N 卡合成（3 张 N 换 1 张随机 R，可能暴击 SR） */
function renderSets() {
  var box = $('#bagSets');
  if (!box) return;
  var got = { N: 0, R: 0, SR: 0, SSR: 0 };
  rewardBag.forEach(function (c) { if (got[c.rarity] != null) got[c.rarity]++; });
  var html = '';
  ['N', 'R', 'SR', 'SSR'].forEach(function (r) {
    var total = r === 'SSR' ? REWARDS.SSR.length + 2 : REWARDS[r].length; // 卡池外还有两张隐藏 SSR：终极券 + 死缠烂打券
    html += '<span class="set-chip" style="--rc:' + RARITY[r].color + '">' + r + ' ' + got[r] + '/' + total + '</span>';
  });
  box.innerHTML = html;
  var plain = rewardBag.filter(function (c) { return c.rarity === 'N' && !c.ultimate; });
  if (plain.length >= 3) {
    var btn = ce('button', 'set-combine', '🧪 3 张 N 合成 1 张 R');
    btn.addEventListener('click', combineN);
    box.appendChild(btn);
  }
}
function combineN() {
  var removed = 0;
  for (var i = rewardBag.length - 1; i >= 0 && removed < 3; i--) {
    if (rewardBag[i].rarity === 'N' && !rewardBag[i].ultimate) {
      rewardBag.splice(i, 1);
      removed++;
    }
  }
  addCard(pickCard(2)); // 随机 R，12% 暴击 SR
  SFX.reward();
  confetti(window.innerWidth / 2, window.innerHeight * 0.3, 60);
  showToast('🧪 合成成功！新卡已放入卡包');
  renderBag();
}

/* 隐藏成就：四种稀有度各至少 1 张 → 全图鉴纪念卡 */
function checkFullSet() {
  var got = { N: 0, R: 0, SR: 0, SSR: 0 };
  rewardBag.forEach(function (c) { if (got[c.rarity] != null) got[c.rarity]++; });
  if (got.N && got.R && got.SR && got.SSR && !rewardBag._rainbow) {
    rewardBag._rainbow = true;
    addCard({ icon: '🌈', text: '全图鉴纪念卡', rarity: 'SSR', tier: 3,
      desc: '四种稀有度全部集齐！凭此卡可要求他再实现一个小心愿。' });
    setTimeout(function () {
      SFX.reward();
      fireworksShow(3, 400);
      showToast('🌈 集齐四种稀有度！解锁隐藏卡「全图鉴纪念卡」', 3200);
      renderBag();
    }, 600);
  }
}

/* ============================================================
   照片刮刮乐 + 通用刮擦 canvas
   ============================================================ */
function setupScratchCanvas(cv, onDone) {
  var stage = cv.parentElement;
  var rect = stage.getBoundingClientRect();
  cv.width = Math.max(1, Math.round(rect.width));
  cv.height = Math.max(1, Math.round(rect.height));
  var ctx = cv.getContext('2d');
  // —— 拉丝金属涂层 ——
  var grd = ctx.createLinearGradient(0, 0, cv.width, cv.height);
  grd.addColorStop(0, '#d9d9de'); grd.addColorStop(0.28, '#a9a9b2');
  grd.addColorStop(0.5, '#ececf0'); grd.addColorStop(0.72, '#9c9ca6');
  grd.addColorStop(1, '#cbcbd2');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.globalAlpha = 0.07; // 斜向拉丝
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
  for (var ln = -cv.height; ln < cv.width; ln += 5) {
    ctx.beginPath(); ctx.moveTo(ln, 0); ctx.lineTo(ln + cv.height, cv.height); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (var i = 0; i < 700; i++) { // 金属颗粒
    ctx.fillStyle = Math.random() < 0.5
      ? 'rgba(255,255,255,' + (Math.random() * 0.18) + ')'
      : 'rgba(60,60,80,' + (Math.random() * 0.1) + ')';
    ctx.fillRect(Math.random() * cv.width, Math.random() * cv.height, 1.4, 1.4);
  }
  ctx.fillStyle = 'rgba(110,110,130,.85)';
  ctx.font = 'bold ' + Math.max(24, Math.round(cv.width / 6)) + 'px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('刮 一 刮', cv.width / 2, cv.height / 2);
  var done = false, drawing = false, lastX = 0, lastY = 0, moves = 0;
  function pos(e) {
    var r = cv.getBoundingClientRect();
    var cx = e.clientX != null ? e.clientX : e.touches[0].clientX;
    var cy = e.clientY != null ? e.clientY : e.touches[0].clientY;
    return { x: (cx - r.left) * (cv.width / r.width), y: (cy - r.top) * (cv.height / r.height) };
  }
  function scratchAt(x, y) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(x, y, cv.width * 0.055, 0, 6.283);
    ctx.fill();
  }
  function scratchLine(x1, y1, x2, y2) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = cv.width * 0.11;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  function checkDone() {
    if (done) return;
    var d = ctx.getImageData(0, 0, cv.width, cv.height).data;
    var n = 0, total = 0;
    for (var i = 3; i < d.length; i += 60) { total++; if (d[i] > 0) n++; }
    if (1 - n / total > 0.42) {
      done = true;
      ctx.clearRect(0, 0, cv.width, cv.height);
      onDone();
    }
  }
  function downEvt(e) {
    drawing = true;
    var p = pos(e);
    lastX = p.x; lastY = p.y;
    scratchAt(p.x, p.y);
    if (cv.setPointerCapture && e.pointerId != null) { try { cv.setPointerCapture(e.pointerId); } catch (err) {} }
  }
  function moveEvt(e) {
    if (!drawing) return;
    var p = pos(e);
    scratchLine(lastX, lastY, p.x, p.y);
    lastX = p.x; lastY = p.y;
    moves++;
    if (moves % 5 === 0) { SFX.scratch(); buzz(6); } // 刮擦手感
    if (moves % 8 === 0) checkDone();
  }
  function upEvt() { drawing = false; checkDone(); }
  cv.addEventListener('pointerdown', downEvt);
  cv.addEventListener('pointermove', moveEvt);
  cv.addEventListener('pointerup', upEvt);
  cv.addEventListener('pointercancel', upEvt);
  cv.addEventListener('mousedown', downEvt);
  cv.addEventListener('mousemove', moveEvt);
  cv.addEventListener('mouseup', upEvt);
  cv.addEventListener('touchstart', downEvt, { passive: true });
  cv.addEventListener('touchmove', moveEvt, { passive: true });
  cv.addEventListener('touchend', upEvt);
}

/* 刮卡文案：最近 5 条不重复，池子抽完自动重置 */
var scratchRecent = [];
function pickScratchLine() {
  var pool = [];
  for (var i = 0; i < SCRATCH_LINES.length; i++) {
    if (scratchRecent.indexOf(i) === -1) pool.push(i);
  }
  if (!pool.length) { scratchRecent = []; return pickScratchLine(); }
  var idx = pool[(Math.random() * pool.length) | 0];
  scratchRecent.push(idx);
  if (scratchRecent.length > Math.min(5, SCRATCH_LINES.length - 1)) scratchRecent.shift();
  return SCRATCH_LINES[idx];
}

/* 相册照片刮刮卡：点开照片 → 刮开涂层 → 情话 */
function openScratchCard(src, onDone) {
  $('#scratchImg').src = src;
  $('#scratchLine').textContent = '';
  $('#scratchClose').classList.add('hidden');
  $('#scratchTip').textContent = '手指刮开银色涂层~';
  $('#scratchCard').classList.remove('hidden');
  var line = pickScratchLine(); // 最近 5 条不重复
  // 等图片加载后按实际尺寸建涂层（CSS 尺寸固定，直接建即可）
  setupScratchCanvas($('#scratchCv'), function () {
    $('#scratchTip').textContent = '刮开啦！💕';
    $('#scratchLine').textContent = line;
    $('#scratchClose').classList.remove('hidden');
    SFX.pop();
    buzz(20);
    if (onDone) onDone();
  });
}

/* ============================================================
   愿望瓶：必须填写愿望并点「确定」后才能吹蜡烛
   ============================================================ */
var wishConfirmed = false;
/* 测试模式：本地调试 / 局域网 / 带 ?test=1 参数时不发邮件，避免消耗 Formspree 额度 */
var IS_TEST = /localhost|127\.0\.0\.1|file:|192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])/i.test(location.hostname || '') || /[?&]test=1/.test(location.search);
function initWish() {
  $('#wishConfirm').addEventListener('click', function () {
    var v = $('#wishInput').value.trim();
    if (!v) {
      $('#wishTip').textContent = '写一句愿望才能确定哦~';
      $('#wishTip').classList.remove('ok');
      buzz(60);
      return;
    }
    wishConfirmed = true;
    saveWish();
    SFX.ding();
    buzz(25);
    this.textContent = '✓ 愿望已装瓶';
    this.disabled = true;
    $('#candleNudge').textContent = '愿望已装瓶，现在吹蜡烛吧~';
    clearTimeout($('#candleNudge')._tm);
    $('#candleNudge')._tm = setTimeout(function () { $('#candleNudge').textContent = ''; }, 2400);
  });
}
function saveWish() {
  var v = $('#wishInput').value.trim();
  if (!v) return;
  try { localStorage.setItem('birthday_wish', v); } catch (e) {}
  $('#wishTip').textContent = WISH.savedTip;
  $('#wishTip').classList.add('ok');
  if (WISH.endpoint) {
    var fd = new FormData();
    fd.append('wish', v);
    fd.append('_subject', '她写下了生日愿望 💌');
    if (IS_TEST) {
      console.log('[测试模式] 愿望未发送（不消耗 Formspree 额度）：', v);
      $('#wishTip').textContent = '（测试模式）愿望已记下，没发邮件~';
    } else {
      try { fetch(WISH.endpoint, { method: 'POST', body: fd, mode: 'no-cors' }).catch(function () {}); } catch (e) {}
    }
  }
}
/* 终章信纸下方展示她写下的愿望 */
function showWishReveal() {
  var w = null;
  try { w = localStorage.getItem('birthday_wish'); } catch (e) {}
  var rv = $('#wishReveal');
  if (!w) { rv.classList.add('hidden'); return; }
  rv.innerHTML = '<p class="wr-title">🫙 你写下的生日愿望</p>' +
    '<p class="wr-body">' + w.replace(/</g, '&lt;') + '</p>' +
    '<p class="wr-note">虽然我不知道你许了什么愿，但我希望，能在某个不经意的瞬间，偷偷帮你把它实现。</p>';
  rv.classList.remove('hidden');
}

/* ============================================================
   第 6 幕 · 终章
   ============================================================ */
var playerActive = false, degraded = false, letterShown = false;
var curLyric = -2, fwFired = false, lyricsBuilt = false;
var degRAF = null, degT0 = 0;
var kbTimer = null, letterFw = null, letterPetals = null;

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
  $('#letterNext').addEventListener('click', function () {
    SFX.page();
    var total = Math.ceil(FINALE.letter.length / LETTER_PAGE);
    if (letterPage < total - 1) {
      letterPage++;
      renderLetterPage();
    } else {
      this.classList.add('hidden'); // 收下这封信
      buzz(20);
    }
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
  pulseOn(); // 歌曲播放时光晕呼吸
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
    if (j !== idx) l.classList.remove('fill');
  });
  if (idx >= 0 && lines[idx]) {
    // 卡拉OK扫光：动画时长 = 本句时长，整句从左到右点亮
    var cur = lines[idx];
    var dur = Math.max(0.5, LYRICS[idx].end - LYRICS[idx].start);
    cur.style.animationDuration = dur + 's';
    cur.classList.remove('fill');
    void cur.offsetWidth;
    cur.classList.add('fill');
    var box = $('#lyricsBox');
    var target = cur.offsetTop - box.clientHeight / 2 + cur.clientHeight / 2;
    try { box.scrollTo({ top: target, behavior: 'smooth' }); }
    catch (e) { box.scrollTop = target; }
  }
  if (idx === FIREWORK_LYRIC_INDEX && !fwFired) {
    fwFired = true;
    // 唱到"生日快乐"：先放一颗心形烟花，再连发礼花
    heartFireworkAt(window.innerWidth / 2, window.innerHeight * 0.36,
                    Math.min(window.innerWidth, window.innerHeight) * 0.3);
    SFX.firework();
    setTimeout(function () { fireworksShow(3, 550); }, 900);
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

/* 信纸分页：每页 4 行，最后一页带签名；翻页按钮逐页展示 */
var letterPage = 0, LETTER_PAGE = 4;
function buildLetter() {
  letterPage = 0;
  renderLetterPage();
}
function renderLetterPage() {
  var card = $('#letterCard');
  card.innerHTML = '';
  var total = Math.ceil(FINALE.letter.length / LETTER_PAGE);
  var isLast = letterPage === total - 1;
  var lines = FINALE.letter.slice(letterPage * LETTER_PAGE, (letterPage + 1) * LETTER_PAGE);
  lines.forEach(function (line, i) {
    var p = ce('p', null, line);
    p.style.animationDelay = (0.4 + i * 0.6) + 's';
    card.appendChild(p);
  });
  if (isLast) {
    var sign = ce('p', 'letter-sign', FINALE.signature);
    sign.style.animationDelay = (0.4 + lines.length * 0.6) + 's';
    card.appendChild(sign);
    showWishReveal(); // 最后一页展示她写下的愿望
    $('#letterNext').textContent = '收下这封信 ❤';
  } else {
    $('#wishReveal').classList.add('hidden');
    $('#letterNext').textContent = '下一页 →';
  }
  $('#letterNext').classList.remove('hidden');
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
  buzz(30);
  playBGM('letter'); // 信纸展开时《不能说的秘密》低音量垫底
  // 开场一颗心形烟花，随后漫天烟花 + 飘落花瓣
  setTimeout(function () {
    heartFireworkAt(window.innerWidth / 2, window.innerHeight * 0.3,
                    Math.min(window.innerWidth, window.innerHeight) * 0.26);
    SFX.firework();
  }, 800);
  fireworksShow(3, 600);
  for (var pi = 0; pi < 8; pi++) setTimeout(petal, pi * 160);
  letterPetals = setInterval(petal, 650);
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
    if (songEl) songEl.muted = muted; // 终章歌曲同样受静音按钮控制
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
      buzz(30);
      this.el.classList.add('unlocked');
      LOADER.start();
      setTimeout(function () { self.el.style.display = 'none'; }, 650);
    } else {
      this.msg.textContent = '\u5bc6\u7801\u4e0d\u5bf9\u54e6\uff0c\u518d\u8bd5\u4e00\u6b21~';
      buzz(90);
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

var sky1 = createSky($('#sky1'));
var sky2 = createSky($('#sky2'));
sky1.start(); // 首屏就是第 1 幕，直接启动
initS1();
initWish();
initS3();
initS4();
initS5();
initGame();
initS6();
initMute();

})();
