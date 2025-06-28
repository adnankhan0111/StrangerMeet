const express = require('express');
const http = require('http');
const { v4: uuidV4 } = require('uuid');
const path = require('path');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Set EJS as templating engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Global variables
let waitingUsers = [];
let onlineUsers = 0;

// Routes
app.get('/', (req, res) => {
  res.render('index');
});

app.get('/chat', (req, res) => {
  res.render('chat', { roomId: uuidV4() });
});

// Socket.IO logic
io.on('connection', (socket) => {
  console.log('New user connected:', socket.id);
  onlineUsers++;
  io.emit('updateUserCount', onlineUsers); // Send count to all

  // User joins chat queue
  socket.on('join-queue', () => {
    console.log('User joined queue:', socket.id);

    if (waitingUsers.length > 0) {
      const otherUser = waitingUsers.pop();
      const roomId = uuidV4();

      console.log(`Pairing ${socket.id} with ${otherUser.id} in room ${roomId}`);

      otherUser.join(roomId);
      socket.join(roomId);

      io.to(otherUser.id).emit('start-chat', roomId);
      socket.emit('start-chat', roomId);
    } else {
      waitingUsers.push(socket);
      socket.emit('waiting');
    }
  });

  // When ready in chat room
  socket.on('ready', (roomId, userId) => {
    console.log(`User ${userId} ready in room ${roomId}`);
    socket.join(roomId);
    socket.to(roomId).emit('user-connected', userId);
  });

  // Leave room
  socket.on('leave-room', (roomId) => {
    console.log(`User left room ${roomId}`);
    socket.leave(roomId);
    socket.to(roomId).emit('user-disconnected');
  });

  // Chat messages
  socket.on('chat-message', (roomId, message) => {
    socket.to(roomId).emit('chat-message', message);
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    onlineUsers = Math.max(onlineUsers - 1, 0);
    io.emit('updateUserCount', onlineUsers); // Update count

    // Remove from waiting queue
    waitingUsers = waitingUsers.filter((user) => user !== socket);

    // Notify room if user was in a chat
    const rooms = Object.keys(socket.rooms);
    rooms.forEach((room) => {
      if (room !== socket.id) {
        socket.to(room).emit('user-disconnected');
      }
    });
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

// Add this with your other routes
app.get('/about', (req, res) => {
  res.render('about', {
    title: 'About Us',
    team: [
      {
        name: "Adnan khan",
        role: "Developer",
        bio: "Building awesome video chat experiences.",
        avatar: "/images/avatar1.jpg" // Make sure this file exists
      }
    ]
  });
});

app.get('/contact', (req, res) => {
  res.render('contact');
});
app.post('/contact', express.urlencoded({ extended: true }), (req, res) => {
  const { name, email, message } = req.body;
  console.log('Contact form submitted:', { name, email, message });
  res.send('Thank you for contacting us!');
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Route for Legal Page
app.get('/legal', (req, res) => {
    res.render('legal', {
        appName: "FbiooGames",
        supportEmail: "ak786lawa@gmail.com",
        isAuthenticated: req.isAuthenticated ? req.isAuthenticated() : false,
        currentYear: new Date().getFullYear()
    });
});

 PORT = process.env.PORT || 3000;io = require('socket.io')(server, {
  cors: {
    origin: ["https://strangermeet1.onrender.com/", "http://localhost:3000"],
    methods: ["GET", "POST"]
  }
});