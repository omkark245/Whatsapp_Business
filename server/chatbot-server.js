#!/usr/bin/env node

const http = require('http');
const url = require('url');
const querystring = require('querystring');

// Configuration
const WEBHOOK_VERIFY_TOKEN = '533fe35fb07f1005ced1b699a28e11113b6d8e6a5ce3f78e1acaad8a35a4d4da';
const PORT = 5000;

// Meta API Configuration - Read from environment or use placeholder
const META_API_TOKEN = process.env.META_API_TOKEN || 'YOUR_META_BUSINESS_TOKEN';
const META_PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID || '942998318891359';
const META_API_VERSION = process.env.META_API_VERSION || 'v21.0';

// Course Database
const COURSES = {
  'full-stack-java': {
    id: 'full-stack-java',
    name: '✨ Full Stack Java Development',
    duration: '8 Weeks',
    price: '₹5,999',
    modules: [
      'Java Fundamentals & OOP',
      'Spring Boot Framework',
      'REST APIs & Microservices',
      'Database Design & SQL',
      'Frontend Integration (React)',
      'Deployment & DevOps',
      'Real-world Project',
      'Interview Preparation'
    ],
    highlights: [
      '✓ Industry-ready training',
      '✓ Hands-on projects',
      '✓ Lifetime access to materials',
      '✓ Job assistance',
      '✓ Certificate of completion'
    ],
    startDate: 'Next batch starting soon',
    contact: 'Contact us for enrollment: +91 97632 50689',
    description: 'Master full-stack Java development with Spring Boot, REST APIs, and modern web technologies. Perfect for beginners and intermediate developers.'
  },
  'data-science': {
    id: 'data-science',
    name: '📊 Data Science & AI',
    duration: '10 Weeks',
    price: '₹7,999',
    modules: [
      'Python for Data Science',
      'Statistics & Probability',
      'Data Wrangling & Cleaning',
      'EDA (Exploratory Data Analysis)',
      'Machine Learning Algorithms',
      'Deep Learning & Neural Networks',
      'Real-world Projects',
      'Interview Preparation'
    ],
    highlights: [
      '✓ Industry-ready training',
      '✓ Hands-on ML projects',
      '✓ Lifetime access to materials',
      '✓ Job assistance',
      '✓ Certificate of completion'
    ],
    startDate: 'Next batch starting soon',
    contact: 'Contact us for enrollment: +91 97632 50689',
    description: 'Learn Data Science, Machine Learning, and AI from scratch. Build real-world projects and prepare for data science interviews.'
  }
};

// In-memory storage for conversations
const conversations = {};
const messages = [];

function createRequestId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function sendJsonError(res, status, code, message, details = []) {
  const requestId = createRequestId();
  const normalizedDetails = Array.isArray(details) ? details : [details].filter(Boolean);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'X-Request-Id': requestId,
  });
  res.end(JSON.stringify({
    success: false,
    error: message,
    code,
    requestId,
    ...(normalizedDetails.length ? { details: normalizedDetails } : {}),
    errorInfo: {
      message,
      code,
      status,
      requestId,
      details: normalizedDetails,
    },
  }));
}

// Helper function to send WhatsApp message via Meta API
async function sendWhatsAppMessage(phoneNumber, messageText) {
  if (META_API_TOKEN === 'YOUR_META_BUSINESS_TOKEN') {
    console.log(`⚠️  Meta API Token not configured. Would send to ${phoneNumber}: ${messageText.substring(0, 50)}...`);
    return false;
  }

  try {
    const url = `https://graph.facebook.com/${META_API_VERSION}/${META_PHONE_NUMBER_ID}/messages`;

    const payload = {
      messaging_product: 'whatsapp',
      to: phoneNumber,
      type: 'text',
      text: {
        body: messageText
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${META_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (response.ok) {
      console.log(`✓ Message sent to ${phoneNumber}: ${result.messages[0].id}`);
      return true;
    } else {
      console.error(`✗ Failed to send message: ${result.error.message}`);
      return false;
    }
  } catch (error) {
    console.error(`✗ Error sending message: ${error.message}`);
    return false;
  }
}

// Auto-reply with course options
function getCoursesGreeting() {
  return `
👋 Welcome to Finlec Technologies!

We offer industry-leading courses to help you become job-ready:

🎓 *Which course are you interested in?*

1️⃣  *FULL STACK JAVA*
   • Duration: 8 weeks
   • Price: ₹5,999
   Type: "java" to learn more

2️⃣  *DATA SCIENCE & AI*
   • Duration: 10 weeks
   • Price: ₹7,999
   Type: "data" to learn more

Or reply with:
• "courses" - See all courses
• "help" - Get help
• "contact" - Contact us
`;
}

// Detailed course information
function getCourseDetails(courseId) {
  const course = COURSES[courseId];
  if (!course) return null;

  return `
📚 ${course.name}

⏱️ Duration: ${course.duration}
💰 Price: ${course.price}
📅 ${course.startDate}

📌 *What you'll learn:*
${course.modules.map((m, i) => `${i + 1}. ${m}`).join('\n')}

✨ *Why choose us?*
${course.highlights.join('\n')}

🎯 ${course.description}

👉 ${course.contact}

Want to know more? Reply:
• "enroll" - Enroll now
• "schedule" - View schedule
• "testimonials" - See success stories
• "back" - Return to course list
`;
}

// Process user message and get response
function processUserMessage(userMessage, phoneNumber) {
  const messageLower = userMessage.toLowerCase().trim();

  // Initialize conversation if new user
  if (!conversations[phoneNumber]) {
    conversations[phoneNumber] = {
      state: 'greeting',
      messages: []
    };
  }

  const userState = conversations[phoneNumber];
  userState.messages.push({
    timestamp: new Date(),
    text: userMessage,
    from: 'user'
  });

  let response = null;

  // Process based on user input
  if (messageLower === 'java' || messageLower.includes('java') || messageLower === '1') {
    userState.state = 'viewing-course';
    userState.currentCourse = 'full-stack-java';
    response = getCourseDetails('full-stack-java');
  }
  else if (messageLower === 'data' || messageLower.includes('data') || messageLower === '2') {
    userState.state = 'viewing-course';
    userState.currentCourse = 'data-science';
    response = getCourseDetails('data-science');
  }
  else if (messageLower === 'courses') {
    userState.state = 'greeting';
    response = getCoursesGreeting();
  }
  else if (messageLower === 'help') {
    response = `
🆘 *How can we help?*

📝 Common questions:
• "courses" - See all courses
• "java" - Learn about Full Stack Java
• "data" - Learn about Data Science
• "contact" - Contact us
• "enroll" - Enrollment process

For more help, contact: +91 97632 50689
Email: launchpaddindia@gmail.com
    `;
  }
  else if (messageLower === 'contact') {
    response = `
📞 *Contact Information*

📱 WhatsApp: +91 97632 50689
📧 Email: launchpaddindia@gmail.com
🌐 Website: finlectechnologies.com
📍 Follow us on social media

We typically respond within 2 hours!

Need immediate help? Type "help"
    `;
  }
  else if (messageLower === 'back') {
    userState.state = 'greeting';
    response = getCoursesGreeting();
  }
  else if (messageLower === 'enroll' && userState.currentCourse) {
    response = `
🎉 *Great choice!*

To enroll in ${COURSES[userState.currentCourse].name}:

1. Visit: finlectechnologies.com
2. Select the course
3. Complete the form
4. Make payment
5. Start learning!

Or contact us directly:
📱 +91 97632 50689
📧 launchpaddindia@gmail.com

Need a custom plan? Let us know!
    `;
  }
  else if (userState.state === 'greeting') {
    response = getCoursesGreeting();
  }
  else {
    // Default response for unrecognized input
    response = `
I didn't quite understand that. Here are some options:

📚 Reply with:
• "java" - Full Stack Java course
• "data" - Data Science & AI course
• "courses" - See all courses
• "contact" - Contact us
• "help" - Get help

Type one of these to continue! 👆
    `;
  }

  userState.messages.push({
    timestamp: new Date(),
    text: response,
    from: 'bot'
  });

  return response;
}

// Create HTTP server
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const query = parsedUrl.query;

  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_URL || 'http://localhost:5173');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Webhook verification (GET request from Meta)
  if (req.method === 'GET' && pathname === '/webhook') {
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
      console.log('✓ Webhook verified successfully!');
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(challenge);
    } else {
      console.log('✗ Webhook verification failed - invalid token');
      sendJsonError(res, 403, 'WEBHOOK_VERIFY_TOKEN_INVALID', 'Forbidden');
    }
    return;
  }

  // Webhook message handling (POST request from Meta)
  if (req.method === 'POST' && pathname === '/webhook') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        console.log('\n📨 Webhook received at ' + new Date().toLocaleTimeString());

        // Extract message information if present
        if (data.entry && data.entry[0] && data.entry[0].changes) {
          data.entry[0].changes.forEach(change => {
            if (change.value && change.value.messages) {
              change.value.messages.forEach(msg => {
                const userPhone = msg.from;
                const userText = msg.text?.body || '';
                const messageId = msg.id;

                console.log(`📱 From: ${userPhone}`);
                console.log(`📝 Message: ${userText}`);

                // Store message
                messages.push({
                  timestamp: new Date(),
                  from: userPhone,
                  id: messageId,
                  type: msg.type,
                  content: userText,
                });

                // Process message and generate response
                const response = processUserMessage(userText, userPhone);
                console.log(`🤖 Response: ${response.substring(0, 100)}...`);

                // Send response via Meta API (async, non-blocking)
                sendWhatsAppMessage(userPhone, response);
              });
            }
          });
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        console.error('✗ Error processing webhook:', err.message);
        sendJsonError(res, 400, 'WEBHOOK_PAYLOAD_INVALID', err.message);
      }
    });
    return;
  }

  // API: Get all conversations
  if (req.method === 'GET' && pathname === '/api/conversations') {
    sendJsonError(res, 403, 'ADMIN_ACCESS_REQUIRED', 'Forbidden: Authentication required to view sensitive PII.');
    return;
  }

  // API: Get conversation for specific user
  if (req.method === 'GET' && pathname === '/api/conversations/' && query.phone) {
    sendJsonError(res, 403, 'ADMIN_ACCESS_REQUIRED', 'Forbidden: Authentication required to view sensitive PII.');
    return;
  }

  // API: Get all received messages
  if (req.method === 'GET' && pathname === '/api/messages') {
    sendJsonError(res, 403, 'ADMIN_ACCESS_REQUIRED', 'Forbidden: Authentication required to view sensitive PII.');
    return;
  }

  // API: Get courses
  if (req.method === 'GET' && pathname === '/api/courses') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(COURSES, null, 2));
    return;
  }

  // API: Get server status
  if (req.method === 'GET' && pathname === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: '✓ Running',
      port: PORT,
      conversations: Object.keys(conversations).length,
      messages_received: messages.length,
      courses_available: Object.keys(COURSES).length,
      webhook_configured: true,
      timestamp: new Date(),
    }, null, 2));
    return;
  }

  // Dashboard home page
  if (pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <html>
        <head>
          <title>Finlec Technologies WhatsApp Chatbot Dashboard</title>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; padding: 20px; }
            .container { max-width: 1200px; margin: 0 auto; }
            .header { color: white; text-align: center; margin-bottom: 40px; }
            .header h1 { font-size: 2.5em; margin-bottom: 10px; }
            .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 30px; }
            .stat-card { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); }
            .stat-card h3 { color: #667eea; margin-bottom: 10px; }
            .stat-card .value { font-size: 2em; font-weight: bold; color: #333; }
            .section { background: white; padding: 30px; border-radius: 10px; margin-bottom: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); }
            .section h2 { color: #667eea; margin-bottom: 20px; border-bottom: 3px solid #667eea; padding-bottom: 10px; }
            .course-box { background: #f8f9fa; padding: 15px; margin: 10px 0; border-left: 4px solid #667eea; border-radius: 5px; }
            .course-box h4 { color: #333; margin-bottom: 5px; }
            .course-box p { color: #666; font-size: 0.9em; }
            .message-thread { background: #f8f9fa; padding: 15px; margin: 10px 0; border-radius: 5px; border: 1px solid #ddd; }
            .message { margin: 10px 0; padding: 10px; border-radius: 5px; }
            .user-msg { background: #e3f2fd; text-align: right; }
            .bot-msg { background: #f5f5f5; }
            .button { display: inline-block; padding: 10px 20px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 5px; }
            .button:hover { background: #764ba2; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🤖 Finlec Technologies WhatsApp Chatbot</h1>
              <p>Automated Course Inquiry & Lead Capture System</p>
            </div>

            <div class="stats">
              <div class="stat-card">
                <h3>💬 Active Conversations</h3>
                <div class="value">${Object.keys(conversations).length}</div>
              </div>
              <div class="stat-card">
                <h3>📨 Messages Received</h3>
                <div class="value">${messages.length}</div>
              </div>
              <div class="stat-card">
                <h3>📚 Courses Available</h3>
                <div class="value">${Object.keys(COURSES).length}</div>
              </div>
              <div class="stat-card">
                <h3>✅ Webhook Status</h3>
                <div class="value" style="color: green;">Connected</div>
              </div>
            </div>

            <div class="section">
              <h2>📚 Available Courses</h2>
              ${Object.values(COURSES).map(course => `
                <div class="course-box">
                  <h4>${course.name}</h4>
                  <p>⏱️ ${course.duration} | 💰 ${course.price}</p>
                  <p>${course.description}</p>
                </div>
              `).join('')}
            </div>

            <div class="section">
              <h2>🔗 API Endpoints</h2>
              <a href="/api/status" class="button">Server Status</a>
              <a href="/api/courses" class="button">All Courses</a>
              <a href="/api/messages" class="button">Messages</a>
              <a href="/api/conversations" class="button">Conversations</a>
            </div>

            <div class="section">
              <h2>📝 How It Works</h2>
              <p style="margin-bottom: 15px;">
                1️⃣ User sends any message to your WhatsApp Business number<br>
                2️⃣ Webhook receives message via Meta API<br>
                3️⃣ Chatbot processes message and generates response<br>
                4️⃣ Response sent back with course options<br>
                5️⃣ User selects course, receives detailed info<br>
                6️⃣ Lead captured for follow-up
              </p>
            </div>

            <div class="section">
              <h2>⚙️ Configuration</h2>
              <p><strong>Webhook URL:</strong> https://silly-friends-bet.loca.lt/webhook</p>
              <p><strong>Verify Token:</strong> Configured ✓</p>
              <p><strong>Meta Business Account:</strong> Connected ✓</p>
              <p><strong>Port:</strong> ${PORT}</p>
            </div>

            <p style="color: white; text-align: center; margin-top: 40px; font-size: 0.9em;">
              🚀 Chatbot running successfully! Ready to receive messages.
            </p>
          </div>
        </body>
      </html>
    `);
    return;
  }

  // 404
  sendJsonError(res, 404, 'ROUTE_NOT_FOUND', 'Not Found', {
    available: ['/webhook', '/api/status', '/api/courses', '/api/messages', '/api/conversations', '/'],
  });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`
  ╔════════════════════════════════════════════════════════════╗
  ║  🤖 Finlec Technologies WhatsApp Chatbot Server                        ║
  ║  ✓ Running on port ${PORT}                                  ║
  ║  ✓ Dashboard: http://localhost:${PORT}                      ║
  ║  ✓ Webhook: https://silly-friends-bet.loca.lt/webhook ║
  ║  ✓ Verify Token: Configured                              ║
  ║  ✓ Courses: ${Object.keys(COURSES).length} Available                                  ║
  ╚════════════════════════════════════════════════════════════╝

  Features:
  ✓ Auto-reply with course options
  ✓ Detailed course information delivery
  ✓ Conversation tracking by user
  ✓ Multiple course selection support
  ✓ Conversation history per user

  Commands:
  • java - Full Stack Java course details
  • data - Data Science & AI course details
  • courses - View all courses
  • help - Get help
  • contact - Contact information
  • enroll - Enrollment process
  • back - Return to course list

  Ready to chat! Waiting for messages...
    `);
  });

  server.on('error', (err) => {
    console.error('✗ Server error:', err.message);
    process.exit(1);
  });

  process.on('SIGINT', () => {
    console.log('\n\nShutting down server...');
    process.exit(0);
  });
}

module.exports = { server, processUserMessage, conversations, messages, sendJsonError };
