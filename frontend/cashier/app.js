/**
 * Bipli — منطق لوحة الكاشير
 */
const socket = io();

const statusEl      = document.getElementById('status');
const form          = document.getElementById('create-form');
const numberInput   = document.getElementById('order-number');
const qrSection     = document.getElementById('qr-section');
const qrCanvas      = document.getElementById('qr-canvas');
const qrOrderNumber = document.getElementById('qr-order-number');
const closeQrBtn    = document.getElementById('close-qr');
const ordersList    = document.getElementById('orders-list');

let orders = {};

/* ===== الاتصال ===== */
socket.on('connect', () => {
  statusEl.textContent = 'متصل';
  statusEl.classList.replace('offline', 'online');
  socket.emit('join-cashier');
});

socket.on('disconnect', () => {
  statusEl.textContent = 'غير متصل';
  statusEl.classList.replace('online', 'offline');
});

/* ===== استقبال البيانات ===== */
socket.on('orders-snapshot', (list) => {
  orders = {};
  list.forEach((o) => (orders[o.id] = o));
  renderOrders();
});

socket.on('order-created', (order) => {
  orders[order.id] = order;
  renderOrders();
});

socket.on('order-updated', (order) => {
  orders[order.id] = order;
  renderOrders();
});

socket.on('order-deleted', ({ id }) => {
  delete orders[id];
  renderOrders();
});

/* ===== إنشاء طلب ===== */
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const number = numberInput.value.trim();
  if (!number) return;

  socket.emit('create-order', { number }, (res) => {
    if (res && res.ok) {
      numberInput.value = '';
      showQr(res.order);
    } else {
      alert(res && res.error ? res.error : 'تعذّر إنشاء الطلب');
    }
  });
});

/* ===== عرض QR ===== */
function showQr(order) {
  const url = `${window.location.origin}/customer/?id=${order.id}`;
  
  // 1. إظهار القسم أولاً وتحديث الرقم
  qrOrderNumber.textContent = order.number;
  
  // 2. إضافة رابط بديل (في حال فشل الـ QR)
  const qrInfo = document.querySelector('.qr-info');
  let linkEl = document.getElementById('qr-direct-link');
  if (!linkEl) {
    linkEl = document.createElement('a');
    linkEl.id = 'qr-direct-link';
    linkEl.target = '_blank';
    linkEl.textContent = 'أو اضغط هنا لفتح رابط العميل مباشرة';
    linkEl.style.cssText = 'display:block; margin-top:10px; color:#3b82f6; font-size:13px; text-decoration:underline;';
    qrInfo.appendChild(linkEl);
  }
  linkEl.href = url;

  qrSection.hidden = false;
  qrSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // 3. محاولة توليد صورة الـ QR
  try {
    if (typeof QRCode !== 'undefined') {
      qrCanvas.style.display = 'block';
      QRCode.toCanvas(qrCanvas, url, { width: 260, margin: 2 }, (err) => {
        if (err) console.error('QR error:', err);
      });
    } else {
      throw new Error('المكتبة غير محملة');
    }
  } catch (error) {
    console.warn('QR Code library failed:', error);
    qrCanvas.style.display = 'none'; // إخفاء الكانفاس الفارغ
  }
}

closeQrBtn.addEventListener('click', () => (qrSection.hidden = true));

/* ===== رسم القائمة ===== */
function renderOrders() {
  const list = Object.values(orders).sort((a, b) => b.createdAt - a.createdAt);

  if (list.length === 0) {
    ordersList.innerHTML = '<p class="empty">لا توجد طلبات حالياً</p>';
    return;
  }

  ordersList.innerHTML = '';
  list.forEach((order) => {
    const card = document.createElement('div');
    card.className = `order-card ${order.status}`;

    const actions = [];
    if (order.status === 'waiting') {
      actions.push(`<button class="btn-prepare" data-id="${order.id}">تحضير</button>`);
    }
    if (order.status !== 'ready') {
      actions.push(`<button class="btn-ready" data-id="${order.id}">جاهز</button>`);
    }
    actions.push(`<button class="btn-qr" data-id="${order.id}">QR</button>`);
    if (order.status === 'ready') {
      actions.push(`<button class="btn-delete" data-id="${order.id}">حذف</button>`);
    }

    card.innerHTML = `
      <div class="order-info">
        <span class="order-number">#${escapeHtml(order.number)}</span>
        <span class="order-status">${statusLabel(order.status)}</span>
      </div>
      <div class="order-actions">${actions.join('')}</div>
    `;

    ordersList.appendChild(card);
  });

  bindActions();
}

function bindActions() {
  ordersList.querySelectorAll('.btn-prepare').forEach((b) =>
    b.addEventListener('click', () => socket.emit('mark-preparing', { id: b.dataset.id }))
  );
  ordersList.querySelectorAll('.btn-ready').forEach((b) =>
    b.addEventListener('click', () => socket.emit('mark-ready', { id: b.dataset.id }))
  );
  ordersList.querySelectorAll('.btn-qr').forEach((b) =>
    b.addEventListener('click', () => {
      const o = orders[b.dataset.id];
      if (o) showQr(o);
    })
  );
  ordersList.querySelectorAll('.btn-delete').forEach((b) =>
    b.addEventListener('click', () => {
      if (confirm('حذف هذا الطلب؟')) {
        socket.emit('delete-order', { id: b.dataset.id });
      }
    })
  );
}

function statusLabel(s) {
  return { waiting: 'قيد الانتظار', preparing: 'قيد التحضير', ready: 'جاهز ✓' }[s] || s;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}