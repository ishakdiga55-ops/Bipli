/**
 * Bipli — خادم الطلبات اللحظي
 * Node.js + Express + Socket.io
 */
const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

// خدمة الملفات الثابتة من frontend
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

// ===== المخزن (in-memory) =====
// orders: Map<id, { id, number, status, createdAt, readyAt }>
const orders = new Map();

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

// REST احتياطي
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, name: 'Bipli', orders: orders.size });
});

app.get('/api/orders/:id', (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Not found' });
  res.json(order);
});

// ===== Socket.io =====
io.on('connection', (socket) => {
  console.log('🟢 اتصال:', socket.id);

  // ===== الكاشير =====
  socket.on('join-cashier', () => {
    socket.join('cashier');
    socket.emit('orders-snapshot', Array.from(orders.values()));
  });

  socket.on('create-order', ({ number }, cb) => {
    const num = (number || '').toString().trim();
    if (!num) return cb && cb({ ok: false, error: 'رقم الطلب مطلوب' });

    const id = generateId();
    const order = {
      id,
      number: num,
      status: 'waiting',
      createdAt: Date.now(),
      readyAt: null,
    };
    orders.set(id, order);
    io.to('cashier').emit('order-created', order);
    cb && cb({ ok: true, order });
  });

  socket.on('mark-preparing', ({ id }, cb) => {
    const order = orders.get(id);
    if (!order) return cb && cb({ ok: false });
    order.status = 'preparing';
    io.to(`order:${id}`).emit('order-updated', order);
    io.to('cashier').emit('order-updated', order);
    cb && cb({ ok: true, order });
  });

  socket.on('mark-ready', ({ id }, cb) => {
    const order = orders.get(id);
    if (!order) return cb && cb({ ok: false });
    order.status = 'ready';
    order.readyAt = Date.now();
    io.to(`order:${id}`).emit('order-ready', order);
    io.to('cashier').emit('order-updated', order);
    cb && cb({ ok: true, order });
  });

  socket.on('delete-order', ({ id }, cb) => {
    if (!orders.has(id)) return cb && cb({ ok: false });
    orders.delete(id);
    io.to('cashier').emit('order-deleted', { id });
    cb && cb({ ok: true });
  });

  // ===== العميل =====
  socket.on('join-order', ({ id }, cb) => {
    const order = orders.get(id);
    if (!order) return cb && cb({ ok: false });
    socket.join(`order:${id}`);
    socket.emit('order-snapshot', order);
    cb && cb({ ok: true, order });
  });

  socket.on('disconnect', () => {
    console.log('🔴 قطع:', socket.id);
  });
});

// ===== التشغيل =====
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('=====================================');
  console.log(`🚀 Bipli يعمل على: http://localhost:${PORT}`);
  console.log(`👨‍💼 الكاشير:  http://localhost:${PORT}/cashier/`);
  console.log(`👤 العميل:   http://localhost:${PORT}/customer/`);
  console.log('=====================================');
});