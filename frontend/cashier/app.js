const socket = io();
const DOM = {
  status: document.getElementById('status'),
  form: document.getElementById('create-form'),
  input: document.getElementById('order-number'),
  submitBtn: document.getElementById('submit-btn'),
  qrSection: document.getElementById('qr-section'),
  qrImage: document.getElementById('qr-image'),
  qrOrderNumber: document.getElementById('qr-order-number'),
  closeQrBtn: document.getElementById('close-qr'),
  ordersList: document.getElementById('orders-list'),
  toastContainer: document.getElementById('toast-container')
};

let orders = {};

/* ===== إدارة الإشعارات (Toasts) ===== */
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  DOM.toastContainer.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/* ===== الاتصال ===== */
socket.on('connect', () => {
  DOM.status.textContent = 'متصل';
  DOM.status.className = 'status online';
  socket.emit('join-cashier');
  showToast('تم الاتصال بالخادم', 'success');
});

socket.on('disconnect', () => {
  DOM.status.textContent = 'غير متصل';
  DOM.status.className = 'status offline';
  showToast('انقطع الاتصال!', 'error');
});

/* ===== استقبال البيانات ===== */
socket.on('orders-snapshot', (list) => {
  orders = Object.fromEntries(list.map(o => [o.id, o]));
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
DOM.form.addEventListener('submit', (e) => {
  e.preventDefault();
  const number = DOM.input.value.trim();
  if (!number) return;

  // حالة التحميل لمنع النقر المتكرر
  DOM.submitBtn.disabled = true;
  DOM.submitBtn.textContent = 'جاري الإنشاء...';

  socket.emit('create-order', { number }, (res) => {
    DOM.submitBtn.disabled = false;
    DOM.submitBtn.textContent = 'إنشاء QR';

    if (res && res.ok) {
      DOM.input.value = '';
      showQrModal(res.order);
      showToast('تم إنشاء الطلب بنجاح');
    } else {
      showToast(res.error || 'حدث خطأ', 'error');
    }
  });
});

/* ===== عرض QR ===== */
function showQrModal(order) {
  DOM.qrOrderNumber.textContent = order.number;
  DOM.qrImage.src = order.qrDataUrl; // الصورة جاهزة من الخادم
  DOM.qrSection.hidden = false;
  DOM.qrSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

DOM.closeQrBtn.addEventListener('click', () => {
  DOM.qrSection.hidden = true;
  DOM.qrImage.src = ''; // تنظيف الذاكرة
});

/* ===== رسم القائمة (احترافي وآمن) ===== */
function renderOrders() {
  const list = Object.values(orders).sort((a, b) => b.createdAt - a.createdAt);

  if (list.length === 0) {
    DOM.ordersList.innerHTML = '<p class="empty">لا توجد طلبات حالياً</p>';
    return;
  }

  DOM.ordersList.innerHTML = '';
  
  list.forEach((order) => {
    const card = document.createElement('div');
    card.className = `order-card ${order.status}`;

    // بناء العناصر برمجياً (أكثر أماناً)
    const infoDiv = document.createElement('div');
    infoDiv.className = 'order-info';
    
    const numSpan = document.createElement('span');
    numSpan.className = 'order-number';
    numSpan.textContent = `#${order.number}`;
    
    const statusSpan = document.createElement('span');
    statusSpan.className = 'order-status';
    statusSpan.textContent = statusLabel(order.status);
    
    infoDiv.append(numSpan, statusSpan);

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'order-actions';

    const createBtn = (text, className, onClick) => {
      const btn = document.createElement('button');
      btn.className = className;
      btn.textContent = text;
      btn.addEventListener('click', onClick);
      return btn;
    };

    if (order.status === 'waiting') {
      actionsDiv.appendChild(createBtn('تحضير', 'btn-prepare', () => 
        updateStatus(order.id, 'preparing')
      ));
    }
    if (order.status !== 'ready') {
      actionsDiv.appendChild(createBtn('جاهز', 'btn-ready', () => 
        updateStatus(order.id, 'ready')
      ));
    }
    
    actionsDiv.appendChild(createBtn('QR', 'btn-qr', () => {
      socket.emit('create-order', { number: order.number }, (res) => {
        // لإعادة عرض الـ QR، نطلب من الخادم إنشاءه مجدداً (لأننا لا نحتفظ بالصورة للكاشير)
        // في الإصدارات القادمة يمكن تحسين هذا
      });
      // حل مؤقت سريع: نعرض الـ QR من الذاكرة إن وجد
      if (order.qrDataUrl) showQrModal(order);
    }));

    if (order.status === 'ready') {
      actionsDiv.appendChild(createBtn('حذف', 'btn-delete', () => {
        if (confirm('حذف هذا الطلب؟')) socket.emit('delete-order', { id: order.id });
      }));
    }

    card.append(infoDiv, actionsDiv);
    DOM.ordersList.appendChild(card);
  });
}

function updateStatus(id, status) {
  socket.emit('update-status', { id, status });
}

function statusLabel(s) {
  const labels = { waiting: 'قيد الانتظار', preparing: 'قيد التحضير', ready: 'جاهز ✓' };
  return labels[s] || s;
}