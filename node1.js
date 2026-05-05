// package.json
{
  "name": "flou-social-platform",
  "version": "1.0.0",
  "description": "Premium social experience platform",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "socket.io": "^4.5.4",
    "firebase-admin": "^11.8.0",
    "multer": "^1.4.5-lts.1",
    "axios": "^1.4.0",
    "dotenv": "^16.0.3",
    "bcryptjs": "^2.4.3",
    "jsonwebtoken": "^9.0.0",
    "cors": "^2.8.5",
    "compression": "^1.7.4",
    "helmet": "^7.0.0",
    "express-rate-limit": "^6.7.0"
  },
  "devDependencies": {
    "nodemon": "^2.0.22"
  }
}