/**
 * Bipli — منطق واجهة العميل (احترافي)
 */
const params  = new URLSearchParams(location.search);
const orderId = params.get('id');

const DOM = {
  card: document.getElementById('card'),
  orderNumber: document.getElementById('order-number'),
  statusBadge: document.getElementById('status-badge'),
  message: document.getElementById('message'),
  stopBtn: document.getElementById('stop-btn'),
  hint: document.getElementById('hint'),
  ringtone: document.getElementById('ringtone'),
  error: document.getElementById('error-msg'),
  overlay: document.getElementById('audio-overlay'),
  enableAudioBtn: document.getElementById('enable-audio-btn')
};

let soundEnabled = false;
let isReady      = false;
let beepTimer    = null;
let beepCtx      = null;

if (!orderId) showError('رابط غير صالح — رقم الطلب مفقود.');

/* ===== 1. تفعيل الصوت (Overlay) ===== */
DOM.enableAudioBtn.addEventListener('click', async () => {
  soundEnabled = true;
  DOM.overlay.classList.add('hidden'); // إخفاء النافذة

  // محاولة تشغيل الصوت لكسر حظر المتصفح
  try {
    DOM.ringtone.volume = 0.01;
    await DOM.ringtone.play();
    DOM.ringtone.pause();
    DOM.ringtone.currentTime = 0;
    DOM.ringtone.volume = 1;
  } catch (e) {
    console.warn('Audio unlock failed, using fallback');
  }

  // طلب إذن الإشعارات
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
});

/* ===== 2. الاتصال بالخادم ===== */
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

/* ===== 3. تحديث الواجهة ===== */
function applyOrder(order) {
  if (!order) return;
  DOM.orderNumber.textContent = '#' + order.number;
  setStatus(order.status);
}

function setStatus(status) {
  DOM.statusBadge.className = 'status-badge ' + status;
  const labels = { waiting: 'قيد الانتظار', preparing: 'قيد التحضير', ready: 'جاهز! ✓' };
  DOM.statusBadge.textContent = labels[status] || status;

  if (status === 'waiting') {
    DOM.message.textContent = 'يرجى الانتظار، سنقوم بإشعارك عند تجهيز طلبك.';
    DOM.card.classList.remove('is-ready', 'is-preparing');
  } else if (status === 'preparing') {
    DOM.message.textContent = 'طلبك قيد التحضير الآن…';
    DOM.card.classList.remove('is-ready');
    DOM.card.classList.add('is-preparing');
  } else if (status === 'ready') {
    DOM.message.textContent = 'طلبك جاهز! يرجى التوجه إلى الكاشير.';
    DOM.card.classList.add('is-ready');
    DOM.card.classList.remove('is-preparing');
  }
}

/* ===== 4. التنبيه عند الجاهزية ===== */
function triggerReady() {
  if (isReady) return;
  isReady = true;

  if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 800]);

  if (soundEnabled) {
    playRingtone().catch(() => startBeepFallback());
  } else {
    // إذا لم يضغط على الزر (حالة نادرة)
    DOM.overlay.classList.remove('hidden');
    DOM.enableAudioBtn.textContent = '🔔 اضغط لتشغيل التنبيه';
  }

  showNotification();
  DOM.stopBtn.hidden = false;
}

async function playRingtone() {
  DOM.ringtone.currentTime = 0;
  await DOM.ringtone.play();
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
  DOM.ringtone.pause();
  DOM.ringtone.currentTime = 0;
  if (beepTimer) { clearInterval(beepTimer); beepTimer = null; }
  if (navigator.vibrate) navigator.vibrate(0);
}

function showNotification() {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    new Notification('Bipli — طلبك جاهز! 🎉', {
      body: `الطلب ${DOM.orderNumber.textContent} جاهز للاستلام`,
      tag: 'order-ready',
      requireInteraction: true,
      vibrate: [400, 200, 400],
    });
  } catch (_) {}
}

DOM.stopBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  stopAll();
  DOM.stopBtn.hidden = true;
  DOM.message.textContent = 'شكراً لك! نتمنى لك يوماً سعيداً.';
  DOM.card.classList.remove('is-ready');
});

function showError(msg) {
  DOM.error.textContent = msg;
  DOM.error.hidden = false;
  DOM.card.hidden = true;
  DOM.overlay.classList.add('hidden');
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW register failed:', e));
}