// server.js - NotificationAPI Backend for Compound Health Monitor
const express = require('express');
const cors = require('cors');
const notificationapi = require('notificationapi-node-server-sdk').default;

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize NotificationAPI
notificationapi.init(
  'a4lsubuvif0i11gsbtlgdtseby',
  'uf3fq44h7ewonz64mnte4ugfedrgwcnix435qf7zxir5qaapumzwdr4xyj'
);

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'https://claude.ai'],
  credentials: true
}));
app.use(express.json());

// Health check endpoint
app.get('/api/notify/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'NotificationAPI Backend'
  });
});

// Send notification endpoint
app.post('/api/notify', async (req, res) => {
  try {
    console.log('Received notification request:', req.body);
    
    const { type, to, parameters } = req.body;
    
    // Validate required fields
    if (!to || (!to.email && !to.number)) {
      return res.status(400).json({
        success: false,
        error: 'Email or phone number is required'
      });
    }
    
    // Send notification via NotificationAPI
    const result = await notificationapi.send({
      type: type || 'alert',
      to: {
        email: to.email,
        number: to.number
      },
      parameters: parameters || {}
    });
    
    console.log('NotificationAPI response:', result.data);
    
    res.json({
      success: true,
      data: result.data,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('NotificationAPI error:', error);
    
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Test endpoint for debugging
app.post('/api/notify/test', async (req, res) => {
  try {
    const result = await notificationapi.send({
      type: 'alert',
      to: {
        email: 'patilmonish89@gmail.com',
        number: '+15005550006'
      },
      parameters: {
        message: 'Test notification from Compound Health Monitor',
        timestamp: new Date().toISOString()
      }
    });
    
    res.json({
      success: true,
      data: result.data,
      message: 'Test notification sent successfully'
    });
    
  } catch (error) {
    console.error('Test notification error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 NotificationAPI Backend running on port ${PORT}`);
  console.log(`📧 Ready to send notifications via NotificationAPI`);
  console.log(`🔗 Health check: http://localhost:${PORT}/api/notify/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('👋 Shutting down gracefully');
  process.exit(0);
});