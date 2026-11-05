/**
 * Bipli — منطق واجهة العميل
 */
const params  = new URLSearchParams(location.search);
const orderId = params.get('id');

const cardEl        = document.getElementById('card');
const orderNumberEl = document.getElementById('order-number');
const statusBadge   = document.getElementById('status-badge');
const messageEl     = document.getElementById('message');
const enableBtn     = document.getElementById('enable-sound');
const stopBtn       = document.getElementById('stop-btn');
const hintEl        = document.getElementById('hint');
const ringtone      = document.getElementById('ringtone');
const errorEl       = document.getElementById('error-msg');

let soundEnabled = false;
let isReady      = false;
let beepTimer    = null;
let beepCtx      = null;

if (!orderId) showError('رابط غير صالح — رقم الطلب مفقود.');

const socket = io();

socket.on('connect', () => {
  if (!orderId) return;
  socket.emit('join-order', { id: orderId }, (res) => {
    if (!res || !res.ok) {
      showError('لم يتم العثور على هذا الطلب. تأكد من مسح الكود مجدداً.');
      return;
    }
    applyOrder(res.order);
    if (res.order.status === 'ready') triggerReady();
  });
});

socket.on('order-snapshot', (order) => {
  applyOrder(order);
  if (order.status === 'ready') triggerReady();
});

socket.on('order-updated', applyOrder);

socket.on('order-ready', (order) => {
  applyOrder(order);
  triggerReady();
});

function applyOrder(order) {
  if (!order) return;
  orderNumberEl.textContent = '#' + order.number;
  setStatus(order.status);
}

function setStatus(status) {
  statusBadge.className = 'status-badge ' + status;
  const labels = {
    waiting:   'قيد الانتظار',
    preparing: 'قيد التحضير',
    ready:     'جاهز! ✓',
  };
  statusBadge.textContent = labels[status] || status;

  if (status === 'waiting') {
    messageEl.textContent = 'يرجى الانتظار، سنقوم بإشعارك عند تجهيز طلبك.';
    cardEl.classList.remove('is-ready', 'is-preparing');
  } else if (status === 'preparing') {
    messageEl.textContent = 'طلبك قيد التحضير الآن…';
    cardEl.classList.remove('is-ready');
    cardEl.classList.add('is-preparing');
  } else if (status === 'ready') {
    messageEl.textContent = 'طلبك جاهز! يرجى التوجه إلى الكاشير.';
    cardEl.classList.add('is-ready');
    cardEl.classList.remove('is-preparing');
  }
}

function triggerReady() {
  if (isReady) return;
  isReady = true;

  if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 800]);

  if (soundEnabled) {
    playRingtone().catch(() => startBeepFallback());
  } else {
    enableBtn.hidden = false;
    enableBtn.textContent = '🔔 اضغط لتشغيل التنبيه';
    hintEl.textContent = 'طلبك جاهز — اضغط لتفعيل الصوت';
  }

  showNotification();
  stopBtn.hidden = false;
}

async function playRingtone() {
  ringtone.currentTime = 0;
  await ringtone.play();
  soundEnabled = true;
  enableBtn.hidden = true;
}

function startBeepFallback() {
  if (beepTimer) return;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  if (!beepCtx) beepCtx = new AudioCtx();
  if (beepCtx.state === 'suspended') beepCtx.resume();

  const beep = () => {
    const t = beepCtx.currentTime;
    const osc = beepCtx.createOscillator();
    const gain = beepCtx.createGain();
    osc.connect(gain);
    gain.connect(beepCtx.destination);
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.3, t + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    osc.start(t);
    osc.stop(t + 0.5);
  };
  beep();
  beepTimer = setInterval(beep, 900);
}

function stopAll() {
  ringtone.pause();
  ringtone.currentTime = 0;
  if (beepTimer) { clearInterval(beepTimer); beepTimer = null; }
  if (navigator.vibrate) navigator.vibrate(0);
}

function showNotification() {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    new Notification('Bipli — طلبك جاهز! 🎉', {
      body: `الطلب ${orderNumberEl.textContent} جاهز للاستلام`,
      tag: 'order-ready',
      requireInteraction: true,
      vibrate: [400, 200, 400],
    });
  } catch (_) {}
}

function unlockAudio() {
  if (soundEnabled) return;
  soundEnabled = true;

  ringtone.volume = 0;
  const p = ringtone.play();
  if (p && p.then) {
    p.then(() => {
      ringtone.pause();
      ringtone.currentTime = 0;
      ringtone.volume = 1;
    }).catch(() => {
      ringtone.volume = 1;
    });
  } else {
    ringtone.volume = 1;
  }

  enableBtn.hidden = true;

  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

document.addEventListener('touchstart', unlockAudio, { once: true, passive: true });
document.addEventListener('click',      unlockAudio, { once: true });

enableBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  unlockAudio();
  if (isReady) playRingtone().catch(() => startBeepFallback());
});

stopBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  stopAll();
  stopBtn.hidden = true;
  messageEl.textContent = 'شكراً لك! نتمنى لك يوماً سعيداً.';
  cardEl.classList.remove('is-ready');
});

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.hidden = false;
  cardEl.hidden = true;
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((e) =>
    console.warn('SW register failed:', e)
  );
}