const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

app.get('/', (req, res) => res.redirect('/cashier/'));

const orders = new Map();

// 👇 الرابط الجديد الذي يولد صورة الـ QR مباشرة (احترافي جداً)
app.get('/api/qr/:id', async (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) return res.status(404).send('Not found');
  try {
    // توليد الصورة كملف بياني وليس كنص
    const qrBuffer = await QRCode.toBuffer(order.customerUrl, { width: 300, margin: 2 });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store'); // منع الاحتفاظ بالصورة القديمة
    res.send(qrBuffer);
  } catch (err) {
    res.status(500).send('Error generating QR');
  }
});

io.on('connection', (socket) => {
  socket.on('join-cashier', () => {
    socket.join('cashier-room');
    socket.emit('orders-snapshot', Array.from(orders.values()));
  });

  socket.on('create-order', async ({ number }, callback) => {
    try {
      const num = (number || '').toString().trim();
      if (!num) throw new Error('رقم الطلب مطلوب');

      const id = uuidv4();
      // تثبيت رابط السيرفر لضمان عمل الكود على الهاتف
      const origin = 'https://bipli-1.onrender.com'; 
      const customerUrl = `${origin}/customer/?id=${id}`;
      
      const order = {
        id, number: num, status: 'waiting', createdAt: Date.now(), readyAt: null,
        customerUrl 
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