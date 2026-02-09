const express = require('express');
const http = require('http');
const { v4: uuidV4 } = require('uuid');
const path = require('path');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.enable("trust proxy");

app.get("/sitemap.xml", (req, res) => {
  res.type("application/xml");
  res.set("Cache-Control", "no-store");

  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://chatwithstrangers.fun/</loc></url>
  <url><loc>https://chatwithstrangers.fun/text-chat/</loc></url>
  <url><loc>https://chatwithstrangers.fun/chat/</loc></url>
  <url><loc>https://chatwithstrangers.fun/about/</loc></url>
  <url><loc>https://chatwithstrangers.fun/contact/</loc></url>
  <url><loc>https://chatwithstrangers.fun/legal/</loc></url>
</urlset>`);
});



app.use((req, res, next) => {
  if (req.path === "/") {
    res.set("Cache-Control", "no-cache, no-store, must-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
  }
  next();
});


app.use((req, res, next) => {
  const host = req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'http';

  // Build final correct URL
  let finalUrl = 'https://' + host.replace(/^www\./, '') + req.path;

  // Add trailing slash for pages (not files)
  if (!req.path.endsWith('/') && !req.path.includes('.')) {
    finalUrl += '/';
  }

  // Preserve query string
  const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';

  // If request is already correct, continue
  if (
    proto === 'https' &&
    !host.startsWith('www.') &&
    (req.path.endsWith('/') || req.path.includes('.'))
  ) {
    return next();
  }

  return res.redirect(301, finalUrl + query);
});


// Set view engine and public folder
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

let waitingUsers = [];
let onlineUsers = 0;

// TEXT CHAT queue and pair storage
let textQueue = [];
let textPartners = {};


// Routes
app.get('/', (req, res) => {
  res.render('index', { canonicalPath: '/' });
});

app.get('/chat/', (req, res) => {
  res.render('chat', {
    canonicalPath: '/chat/',
    roomId: uuidV4()
  });
});


app.get('/text-chat/', (req, res) => {
  res.render('text-chat', {
    canonicalPath: '/text-chat/'
  });
});


app.get('/about/', (req, res) => {
  res.render('about', {
    canonicalPath: '/about/',
    title: 'About Us',
    team: [
      {
        name: "Adnan Khan",
        role: "Developer",
        bio: "Building awesome video chat experiences.",
        avatar: "/images/avatar1.jpg"
      }
    ]
  });
});


app.get('/contact/', (req, res) => {
  res.render('contact', {
    canonicalPath: '/contact/'
  });
});


app.post('/contact/', express.urlencoded({ extended: true }), (req, res) => {
  const { name, email, message } = req.body;
  console.log('Contact form submitted:', { name, email, message });
  res.send('Thank you for contacting us!');
});


app.get('/legal/', (req, res) => {
  res.render('legal', {
    canonicalPath: '/legal/',
    appName: "Chatwithstrangers",
    supportEmail: "ak786lawa@gmail.com",
    isAuthenticated: req.isAuthenticated ? req.isAuthenticated() : false,
    currentYear: new Date().getFullYear()
  });
});


// Socket.IO logic
io.on('connection', (socket) => {
  console.log('New user connected:', socket.id);
  onlineUsers++;
  io.emit('updateUserCount', onlineUsers);

  // Video Chat
  socket.on('join-queue', () => {
    if (waitingUsers.length > 0) {
      const otherUser = waitingUsers.pop();
      const roomId = uuidV4();

      otherUser.join(roomId);
      socket.join(roomId);

      io.to(otherUser.id).emit('start-chat', roomId);
      socket.emit('start-chat', roomId);
    } else {
      waitingUsers.push(socket);
      socket.emit('waiting');
    }
  });

  socket.on('ready', (roomId, userId) => {
    socket.join(roomId);
    socket.to(roomId).emit('user-connected', userId);
  });

  socket.on('leave-room', (roomId) => {
    socket.leave(roomId);
    socket.to(roomId).emit('user-disconnected');
  });

  socket.on('chat-message', (roomId, message) => {
    socket.to(roomId).emit('chat-message', message);
  });

  // ====== TEXT CHAT EVENTS ======
  socket.on('join-text-queue', () => {
  textQueue.push(socket);

  if (textQueue.length >= 2) {
    const [sock1, sock2] = textQueue.splice(0, 2);
    textPartners[sock1.id] = sock2.id;
    textPartners[sock2.id] = sock1.id;

    sock1.emit('partner-found', { partnerId: sock2.id });
    sock2.emit('partner-found', { partnerId: sock1.id });
  }
});


  socket.on('text-message', (msg) => {
    const partnerId = textPartners[socket.id];
    if (partnerId) {
      io.to(partnerId).emit('text-message', msg);
    }
  });

  socket.on('next-text', () => {
    const partnerId = textPartners[socket.id];
    delete textPartners[socket.id];

    if (partnerId) {
      delete textPartners[partnerId];
      const partnerSocket = io.sockets.sockets.get(partnerId);
      if (partnerSocket) {
        partnerSocket.emit('partner-disconnected');
        textQueue.push(partnerSocket);
        partnerSocket.emit('queued-again');
        io.emit('updateQueue', textQueue.length);
      }
    }
    textQueue.push(socket);
    socket.emit('queued-again');
    io.emit('updateQueue', textQueue.length);

    if (textQueue.length >= 2) {
      const [sock1, sock2] = textQueue.splice(0, 2);
      textPartners[sock1.id] = sock2.id;
      textPartners[sock2.id] = sock1.id;

      sock1.emit('partner-found', { partnerId: sock2.id });
      sock2.emit('partner-found', { partnerId: sock1.id });
    }
  });

  socket.on('end-text', () => {
    const partnerId = textPartners[socket.id];
    delete textPartners[socket.id];

    if (partnerId) {
      const partnerSocket = io.sockets.sockets.get(partnerId);
      if (partnerSocket) {
        partnerSocket.emit('partner-disconnected');
      }
      delete textPartners[partnerId];
    }
  });

  // ====== Disconnect for both chat systems ======
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    onlineUsers = Math.max(onlineUsers - 1, 0);
    io.emit('updateUserCount', onlineUsers);

    waitingUsers = waitingUsers.filter((user) => user !== socket);

    // TEXT CHAT CLEANUP
    const partnerId = textPartners[socket.id];
    delete textPartners[socket.id];

    if (partnerId) {
      io.to(partnerId).emit('partner-disconnected');
      delete textPartners[partnerId];
      const partnerSocket = io.sockets.sockets.get(partnerId);
      if (partnerSocket) {
        textQueue.push(partnerSocket);
      }
    }

    textQueue = textQueue.filter(s => s.id !== socket.id);

    // Room cleanup for video chat
    const rooms = Object.keys(socket.rooms);
    rooms.forEach((room) => {
      if (room !== socket.id) {
        socket.to(room).emit('user-disconnected');
      }
    });
  });
});

app.get('/site.webmanifest', (req, res) => {
  res.setHeader('Content-Type', 'application/manifest+json');
  res.sendFile(__dirname + '/public/site.webmanifest');
});
app.get('/4888f9a737314c7593d767bf2ac2474b.txt', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', '4888f9a737314c7593d767bf2ac2474b.txt'));
});


app.use(express.static('public'));
app.get('/robots.txt', function (req, res) {
  res.sendFile(__dirname + '/public/robots.txt');
});


app.get("/health", (req, res) => {
  console.log("Health check pinged at", new Date());
  res.send("OK");
});

// ⬇️ AFTER sitemap, static files
app.use(express.static('public'));

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
