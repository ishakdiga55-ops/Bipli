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

const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

app.get('/', (req, res) => res.redirect('/cashier/'));

const orders = new Map();

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

io.on('connection', (socket) => {
  socket.on('join-cashier', () => {
    socket.join('cashier-room');
    socket.emit('orders-snapshot', Array.from(orders.values()));
  });

  socket.on('create-order', ({ number }, callback) => {
    try {
      const num = (number || '').toString().trim();
      if (!num) throw new Error('رقم الطلب مطلوب');

      const id = generateId();
      const origin = 'https://bipli-1.onrender.com'; 
      const customerUrl = `${origin}/customer/?id=${id}`;
      
      const order = {
        id, number: num, status: 'waiting', createdAt: Date.now(), readyAt: null, customerUrl
      };

      orders.set(id, order);
      io.to('cashier-room').emit('order-created', order);
      if (callback) callback({ ok: true, order });
    } catch (error) {
      if (callback) callback({ ok: false, error: error.message });
    }
  });

  socket.on('update-status', ({ id, status }, callback) => {
    const order = orders.get(id);
    if (!order) return callback && callback({ ok: false });
    order.status = status;
    if (status === 'ready') order.readyAt = Date.now();
    io.to(`order-${id}`).emit(status === 'ready' ? 'order-ready' : 'order-updated', order);
    io.to('cashier-room').emit('order-updated', order);
    if (callback) callback({ ok: true });
  });

  socket.on('delete-order', ({ id }) => {
    if (orders.has(id)) {
      orders.delete(id);
      io.to('cashier-room').emit('order-deleted', { id });
    }
  });

  socket.on('join-order', ({ id }, callback) => {
    const order = orders.get(id);
    if (!order) return callback && callback({ ok: false });
    socket.join(`order-${id}`);
    if (callback) callback({ ok: true, order });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on ${PORT}`));