const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const csv = require('csv-parser');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// JWT secret
const JWT_SECRET = 'chat-app-secret-2024-change-this-in-production';

// CSV file path
const CSV_FILE = path.join(__dirname, 'users_database.csv');

// In-memory storage
let users = [];
let chats = [];
let notifications = [];
const onlineUsers = new Map();

// Load users from CSV on startup
const loadUsersFromCSV = () => {
  if (fs.existsSync(CSV_FILE)) {
    fs.createReadStream(CSV_FILE)
      .pipe(csv())
      .on('data', (row) => {
        if (row.id && row.id !== 'id' && row.id !== 'bot-001') {
          try {
            const user = {
              id: row.id,
              username: row.username,
              email: row.email,
              password: row.password,
              profilePic: row.profilePic,
              status: 'offline',
              lastSeen: new Date(row.lastSeen),
              friends: [],
              friendRequests: [],
              bio: row.bio || '',
              location: row.location || ''
            };
            
            // Safely parse friends array
            if (row.friends && row.friends.trim()) {
              try {
                user.friends = JSON.parse(row.friends);
              } catch (e) {
                user.friends = [];
              }
            }
            
            // Safely parse friendRequests array
            if (row.friendRequests && row.friendRequests.trim()) {
              try {
                user.friendRequests = JSON.parse(row.friendRequests);
              } catch (e) {
                user.friendRequests = [];
              }
            }
            
            users.push(user);
          } catch (error) {
            console.error('Error parsing user from CSV:', error);
          }
        }
      })
      .on('end', () => {
        console.log('Users loaded from CSV');
      })
      .on('error', (error) => {
        console.error('Error reading CSV file:', error);
      });
  }
};

// Save user to CSV
const saveUserToCSV = (user) => {
  try {
    const userRecord = {
      id: user.id,
      username: user.username,
      email: user.email,
      password: user.password,
      profilePic: user.profilePic,
      status: user.status,
      lastSeen: user.lastSeen.toISOString(),
      friends: JSON.stringify(user.friends),
      friendRequests: JSON.stringify(user.friendRequests),
      bio: user.bio,
      location: user.location
    };

    const fileExists = fs.existsSync(CSV_FILE);
    const csvLine = `${userRecord.id},${userRecord.username},${userRecord.email},${userRecord.password},${userRecord.profilePic},${userRecord.status},${userRecord.lastSeen},${userRecord.friends},${userRecord.friendRequests},${userRecord.bio},${userRecord.location}\n`;

    if (!fileExists) {
      const header = 'id,username,email,password,profilePic,status,lastSeen,friends,friendRequests,bio,location\n';
      fs.writeFileSync(CSV_FILE, header + csvLine);
    } else {
      fs.appendFileSync(CSV_FILE, csvLine);
    }
  } catch (error) {
    console.error('Error saving user to CSV:', error);
  }
};

// Update user in CSV
const updateUserInCSV = (user) => {
  try {
    if (!fs.existsSync(CSV_FILE)) return;

    const lines = fs.readFileSync(CSV_FILE, 'utf8').split('\n');
    const updatedLines = lines.map(line => {
      if (line.startsWith(user.id + ',')) {
        const userRecord = {
          id: user.id,
          username: user.username,
          email: user.email,
          password: user.password,
          profilePic: user.profilePic,
          status: user.status,
          lastSeen: user.lastSeen.toISOString(),
          friends: JSON.stringify(user.friends),
          friendRequests: JSON.stringify(user.friendRequests),
          bio: user.bio,
          location: user.location
        };
        return `${userRecord.id},${userRecord.username},${userRecord.email},${userRecord.password},${userRecord.profilePic},${userRecord.status},${userRecord.lastSeen},${userRecord.friends},${userRecord.friendRequests},${userRecord.bio},${userRecord.location}`;
      }
      return line;
    });
    fs.writeFileSync(CSV_FILE, updatedLines.join('\n'));
  } catch (error) {
    console.error('Error updating user in CSV:', error);
  }
}

// Bot user
const botUser = {
  id: 'bot-001',
  username: 'ChatBot 🤖',
  email: 'bot@chat.com',
  password: '',
  profilePic: 'https://ui-avatars.com/api/?name=ChatBot&background=007bff&color=fff&bold=true',
  status: 'online',
  lastSeen: new Date(),
  friends: [],
  friendRequests: [],
  isBot: true
};

// Add bot to users
users.push(botUser);

// Load persisted users from CSV on startup
loadUsersFromCSV();

// Bot responses
const botResponses = [
  "Hello! I'm your friendly ChatBot! 👋",
  "Welcome to the chat app!",
  "How can I help you today?",
  "You can practice chatting with me!",
  "Try sending different messages!",
  "I'm always here to help! 😊",
  "Feel free to ask me anything!",
  "This app was built with Node.js!",
  "Enjoy your chatting experience! 🚀"
];

// Helper functions
const generateToken = (userId) => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
};

const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

const getBotResponse = () => {
  return botResponses[Math.floor(Math.random() * botResponses.length)];
};

const createBotChat = (userId) => {
  const chatId = `chat-${Date.now()}`;
  const chat = {
    id: chatId,
    participants: [userId, botUser.id],
    messages: [
      {
        id: 'msg-1',
        senderId: botUser.id,
        content: "👋 Hello! I'm ChatBot, your personal assistant!",
        timestamp: new Date().toISOString(),
        readBy: [botUser.id]
      },
      {
        id: 'msg-2',
        senderId: botUser.id,
        content: "You can practice chatting with me while you explore the app!",
        timestamp: new Date().toISOString(),
        readBy: [botUser.id]
      },
      {
        id: 'msg-3',
        senderId: botUser.id,
        content: "Try sending me a message! I'll respond! 😊",
        timestamp: new Date().toISOString(),
        readBy: [botUser.id]
      }
    ],
    isLocked: false,
    type: 'personal',
    createdAt: new Date()
  };
  
  chats.push(chat);
  
  // Add bot to user's friends
  const user = users.find(u => u.id === userId);
  if (user) {
    if (!user.friends.includes(botUser.id)) {
      user.friends.push(botUser.id);
    }
    if (!botUser.friends.includes(userId)) {
      botUser.friends.push(userId);
    }
  }
  
  return chat;
};

const createNotification = (userId, type, data) => {
  const notification = {
    id: `notif-${Date.now()}`,
    userId,
    type,
    data,
    isRead: false,
    createdAt: new Date().toISOString()
  };
  
  notifications.push(notification);
  
  // Send real-time notification via socket
  const userSocketId = onlineUsers.get(userId);
  if (userSocketId) {
    io.to(userSocketId).emit('new-notification', notification);
  }
  
  return notification;
};

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/dashboard.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// Register
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    // Validation
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    // Check if user exists
    const existingUser = users.find(u => u.email === email);
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user
    const user = {
      id: `user-${Date.now()}`,
      username,
      email,
      password: hashedPassword,
      profilePic: `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=random&color=fff`,
      status: 'online',
      lastSeen: new Date(),
      friends: [],
      friendRequests: [],
      bio: '',
      location: ''
    };
    
    users.push(user);
    
    // Save user to CSV with credentials
    saveUserToCSV(user);
    
    // Create bot chat for new user
    const botChat = createBotChat(user.id);
    
    // Create welcome notification
    createNotification(user.id, 'system', {
      title: 'Welcome to ChatApp!',
      message: 'Your account has been created successfully. Start by chatting with the ChatBot!',
      icon: '🎉'
    });
    
    // Generate token
    const token = generateToken(user.id);
    
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        profilePic: user.profilePic,
        status: user.status,
        bio: user.bio,
        location: user.location
      },
      botChatId: botChat.id
    });
    
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Find user
    const user = users.find(u => u.email === email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Check password
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Update status
    user.status = 'online';
    user.lastSeen = new Date();
    
    // Generate token
    const token = generateToken(user.id);
    
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        profilePic: user.profilePic,
        status: user.status,
        bio: user.bio,
        location: user.location
      }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get user profile
app.get('/api/profile', authenticate, (req, res) => {
  try {
    const user = users.find(u => u.id === req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      profilePic: user.profilePic,
      status: user.status,
      bio: user.bio,
      location: user.location,
      friendsCount: user.friends.length,
      createdAt: user.createdAt
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Update profile
app.put('/api/profile', authenticate, async (req, res) => {
  try {
    const { username, bio, location, profilePic } = req.body;
    const user = users.find(u => u.id === req.userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Update fields
    if (username) user.username = username;
    if (bio !== undefined) user.bio = bio;
    if (location !== undefined) user.location = location;
    if (profilePic) user.profilePic = profilePic;
    
    // Notify friends about profile update
    user.friends.forEach(friendId => {
      const friendSocketId = onlineUsers.get(friendId);
      if (friendSocketId) {
        io.to(friendSocketId).emit('friend-updated', {
          userId: user.id,
          username: user.username,
          profilePic: user.profilePic
        });
      }
    });
    
    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        profilePic: user.profilePic,
        status: user.status,
        bio: user.bio,
        location: user.location
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Get all users (except current user)
app.get('/api/users', authenticate, (req, res) => {
  try {
    const currentUser = users.find(u => u.id === req.userId);
    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const otherUsers = users
      .filter(u => 
        u.id !== req.userId && // Not current user
        !u.isBot && // Not bot
        !currentUser.friends.includes(u.id) // Not already friends
      )
      .map(user => ({
        id: user.id,
        username: user.username,
        profilePic: user.profilePic,
        status: user.status,
        lastSeen: user.lastSeen,
        bio: user.bio || '',
        location: user.location || ''
      }));
    
    console.log(`Found ${otherUsers.length} users for ${currentUser.username}`);
    res.json(otherUsers);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get user's friends
app.get('/api/friends', authenticate, (req, res) => {
  try {
    const user = users.find(u => u.id === req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const friends = user.friends
      .map(friendId => users.find(u => u.id === friendId))
      .filter(Boolean)
      .map(friend => ({
        id: friend.id,
        username: friend.username,
        profilePic: friend.profilePic,
        status: friend.status,
        lastSeen: friend.lastSeen,
        bio: friend.bio,
        location: friend.location,
        isBot: friend.isBot || false
      }));
    
    res.json(friends);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch friends' });
  }
});

// Get user's notifications
app.get('/api/notifications', authenticate, (req, res) => {
  try {
    const userNotifications = notifications
      .filter(n => n.userId === req.userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    res.json(userNotifications);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Mark notification as read
app.put('/api/notifications/:id/read', authenticate, (req, res) => {
  try {
    const notification = notifications.find(n => n.id === req.params.id && n.userId === req.userId);
    
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    
    notification.isRead = true;
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// Clear all notifications
app.delete('/api/notifications', authenticate, (req, res) => {
  try {
    notifications = notifications.filter(n => n.userId !== req.userId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear notifications' });
  }
});

// Get user's chats
app.get('/api/chats', authenticate, (req, res) => {
  try {
    const userChats = chats
      .filter(chat => chat.participants.includes(req.userId))
      .map(chat => {
        const partnerId = chat.participants.find(id => id !== req.userId);
        const partner = users.find(u => u.id === partnerId);
        const lastMessage = chat.messages[chat.messages.length - 1];
        const unreadCount = chat.messages.filter(msg => 
          msg.senderId !== req.userId && 
          !msg.readBy?.includes(req.userId)
        ).length;
        
        return {
          id: chat.id,
          partner: partner ? {
            id: partner.id,
            username: partner.username,
            profilePic: partner.profilePic,
            status: partner.status,
            isBot: partner.isBot || false
          } : null,
          lastMessage: lastMessage ? {
            content: lastMessage.content,
            timestamp: lastMessage.timestamp
          } : null,
          unreadCount,
          isLocked: chat.isLocked || false,
          createdAt: chat.createdAt
        };
      });
    
    res.json(userChats);
  } catch (error) {
    console.error('Get chats error:', error);
    res.status(500).json({ error: 'Failed to fetch chats' });
  }
});

// Get chat messages
app.get('/api/chats/:chatId/messages', authenticate, (req, res) => {
  try {
    const chat = chats.find(c => c.id === req.params.chatId);
    
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }
    
    if (!chat.participants.includes(req.userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Mark messages as read for current user
    chat.messages.forEach(msg => {
      if (msg.senderId !== req.userId && !msg.readBy.includes(req.userId)) {
        msg.readBy.push(req.userId);
      }
    });
    
    res.json(chat.messages);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Send friend request
app.post('/api/friend-request', authenticate, (req, res) => {
  try {
    const { receiverId } = req.body;
    
    const sender = users.find(u => u.id === req.userId);
    const receiver = users.find(u => u.id === receiverId);
    
    if (!sender || !receiver) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Check if already friends
    if (sender.friends.includes(receiverId)) {
      return res.status(400).json({ error: 'Already friends' });
    }
    
    // Check if request already exists
    const existingRequest = receiver.friendRequests.find(req => req.from === sender.id);
    if (existingRequest) {
      return res.status(400).json({ error: 'Request already sent' });
    }
    
    // Add friend request
    receiver.friendRequests.push({
      from: sender.id,
      status: 'pending',
      sentAt: new Date()
    });
    
    // Create notification for receiver
    createNotification(receiverId, 'friend_request', {
      fromUserId: sender.id,
      fromUsername: sender.username,
      fromProfilePic: sender.profilePic,
      message: `${sender.username} sent you a friend request`
    });
    
    res.json({ success: true, message: 'Friend request sent' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send friend request' });
  }
});

// Get pending friend requests
app.get('/api/friend-requests', authenticate, (req, res) => {
  try {
    const user = users.find(u => u.id === req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const pendingRequests = user.friendRequests
      .filter(req => req.status === 'pending')
      .map(req => {
        const sender = users.find(u => u.id === req.from);
        return {
          requestId: req.from,
          sender: {
            id: sender?.id,
            username: sender?.username,
            profilePic: sender?.profilePic,
            status: sender?.status
          },
          sentAt: req.sentAt
        };
      });
    
    res.json(pendingRequests);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch friend requests' });
  }
});

// Accept friend request
app.post('/api/accept-friend', authenticate, (req, res) => {
  try {
    const { requestId } = req.body;
    const user = users.find(u => u.id === req.userId);
    const requester = users.find(u => u.id === requestId);
    
    if (!user || !requester) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const requestIndex = user.friendRequests.findIndex(req => req.from === requestId);
    if (requestIndex === -1) {
      return res.status(404).json({ error: 'Request not found' });
    }
    
    // Update request status
    user.friendRequests[requestIndex].status = 'accepted';
    
    // Add to friends list
    user.friends.push(requestId);
    requester.friends.push(user.id);
    
    // Update both users in CSV
    updateUserInCSV(user);
    updateUserInCSV(requester);
    
    // Create chat
    const chat = {
      id: `chat-${Date.now()}`,
      participants: [user.id, requestId],
      messages: [],
      isLocked: false,
      type: 'personal',
      createdAt: new Date()
    };
    chats.push(chat);
    
    // Create notifications
    createNotification(user.id, 'friend_accepted', {
      friendId: requester.id,
      friendUsername: requester.username,
      message: `You are now friends with ${requester.username}!`,
      chatId: chat.id
    });
    
    createNotification(requester.id, 'friend_accepted', {
      friendId: user.id,
      friendUsername: user.username,
      message: `${user.username} accepted your friend request!`,
      chatId: chat.id
    });
    
    // Notify both users via socket
    const userSocketId = onlineUsers.get(user.id);
    const requesterSocketId = onlineUsers.get(requester.id);
    
    if (userSocketId) {
      io.to(userSocketId).emit('friend-accepted', {
        friendId: requester.id,
        chatId: chat.id
      });
    }
    
    if (requesterSocketId) {
      io.to(requesterSocketId).emit('friend-accepted', {
        friendId: user.id,
        chatId: chat.id
      });
    }
    
    res.json({ 
      success: true, 
      chatId: chat.id,
      friend: {
        id: requester.id,
        username: requester.username,
        profilePic: requester.profilePic,
        status: requester.status
      },
      message: 'Friend request accepted'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to accept friend request' });
  }
});

// Reject friend request
app.post('/api/reject-friend', authenticate, (req, res) => {
  try {
    const { requestId } = req.body;
    const user = users.find(u => u.id === req.userId);
    
    const requestIndex = user.friendRequests.findIndex(req => req.from === requestId);
    if (requestIndex === -1) {
      return res.status(404).json({ error: 'Request not found' });
    }
    
    // Update request status
    user.friendRequests[requestIndex].status = 'rejected';
    
    res.json({ success: true, message: 'Friend request rejected' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reject friend request' });
  }
});

// Get or create chat with user
app.get('/api/chats/with/:userId', authenticate, (req, res) => {
  try {
    const userId = req.params.userId;
    
    // Find existing chat
    let chat = chats.find(c => 
      c.participants.includes(req.userId) && 
      c.participants.includes(userId) &&
      c.type === 'personal'
    );
    
    if (!chat) {
      // Create new chat
      chat = {
        id: `chat-${Date.now()}`,
        participants: [req.userId, userId],
        messages: [],
        isLocked: false,
        type: 'personal',
        createdAt: new Date()
      };
      chats.push(chat);
    }
    
    const partner = users.find(u => u.id === userId);
    
    res.json({
      id: chat.id,
      partner: partner ? {
        id: partner.id,
        username: partner.username,
        profilePic: partner.profilePic,
        status: partner.status,
        isBot: partner.isBot || false
      } : null,
      messages: chat.messages,
      isLocked: chat.isLocked
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get chat' });
  }
});

// Logout
app.post('/api/logout', authenticate, (req, res) => {
  const user = users.find(u => u.id === req.userId);
  if (user) {
    user.status = 'offline';
    user.lastSeen = new Date();
  }
  
  res.json({ success: true, message: 'Logged out successfully' });
});

// Socket.IO
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  socket.on('register', (userId) => {
    onlineUsers.set(userId, socket.id);
    socket.userId = userId;
    
    // Update user status
    const user = users.find(u => u.id === userId);
    if (user) {
      user.status = 'online';
      user.lastSeen = new Date();
      
      // Notify friends
      user.friends.forEach(friendId => {
        const friendSocketId = onlineUsers.get(friendId);
        if (friendSocketId) {
          io.to(friendSocketId).emit('friend-status', {
            userId,
            status: 'online'
          });
        }
      });
    }
  });
  
  socket.on('join-chat', (chatId) => {
    socket.join(`chat-${chatId}`);
  });
  
  socket.on('send-message', (data) => {
    try {
      const { chatId, content, senderId } = data;
      const chat = chats.find(c => c.id === chatId);
      
      if (!chat) {
        socket.emit('error', { message: 'Chat not found' });
        return;
      }
      
      // Create message
      const message = {
        id: `msg-${Date.now()}`,
        senderId,
        content,
        timestamp: new Date().toISOString(),
        readBy: [senderId]
      };
      
      // Add to chat
      chat.messages.push(message);
      
      // Send to chat room
      io.to(`chat-${chatId}`).emit('new-message', {
        ...message,
        chatId
      });
      
      // Create notification for other participant only if they are friends
      const otherParticipantId = chat.participants.find(id => id !== senderId);
      if (otherParticipantId !== botUser.id) {
        const sender = users.find(u => u.id === senderId);
        const recipient = users.find(u => u.id === otherParticipantId);
        
        // Only create notification if they are friends (to prevent notifications for non-friends)
        // Check if both users exist AND recipient has sender in their friends list
        if (recipient && sender && Array.isArray(recipient.friends) && recipient.friends.includes(senderId)) {
          createNotification(otherParticipantId, 'message', {
            chatId,
            senderId,
            senderName: sender?.username,
            message: content.substring(0, 50) + (content.length > 50 ? '...' : ''),
            preview: true
          });
        }
      }
      
      // Check if message is to bot
      const isToBot = chat.participants.includes(botUser.id) && senderId !== botUser.id;
      if (isToBot) {
        // Send bot response after delay
        setTimeout(() => {
          const botMessage = {
            id: `msg-${Date.now()}`,
            senderId: botUser.id,
            content: getBotResponse(),
            timestamp: new Date().toISOString(),
            readBy: [botUser.id]
          };
          
          chat.messages.push(botMessage);
          io.to(`chat-${chatId}`).emit('new-message', {
            ...botMessage,
            chatId
          });
        }, 1000);
      }
      
    } catch (error) {
      console.error('Send message error:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });
  
  socket.on('typing', (data) => {
    const { chatId, isTyping } = data;
    socket.to(`chat-${chatId}`).emit('typing', {
      userId: socket.userId,
      isTyping
    });
  });
  
  socket.on('message-read', (data) => {
    const { chatId, messageId } = data;
    const chat = chats.find(c => c.id === chatId);
    
    if (chat) {
      const message = chat.messages.find(m => m.id === messageId);
      if (message && !message.readBy.includes(socket.userId)) {
        message.readBy.push(socket.userId);
        
        socket.to(`chat-${chatId}`).emit('message-read', {
          messageId,
          userId: socket.userId
        });
      }
    }
  });
  
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    if (socket.userId) {
      onlineUsers.delete(socket.userId);
      
      // Update user status
      const user = users.find(u => u.id === socket.userId);
      if (user) {
        user.status = 'offline';
        user.lastSeen = new Date();
        
        // Notify friends
        user.friends.forEach(friendId => {
          const friendSocketId = onlineUsers.get(friendId);
          if (friendSocketId) {
            io.to(friendSocketId).emit('friend-status', {
              userId: socket.userId,
              status: 'offline'
            });
          }
        });
      }
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📁 Static files served from: ${__dirname}`);
});

