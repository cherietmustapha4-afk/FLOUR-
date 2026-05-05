// routes/upload.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const axios = require('axios');
const { authenticateToken } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage() });
const IMGBB_KEY = process.env.IMGBB_KEY;

// Upload single image
router.post('/image', authenticateToken, upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file provided' });
  }
  
  try {
    const formData = new FormData();
    formData.append('image', req.file.buffer.toString('base64'));
    
    const response = await axios.post(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    
    if (response.data.success) {
      res.json({ url: response.data.data.url });
    } else {
      res.status(500).json({ error: 'Upload failed' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload multiple images
router.post('/images', authenticateToken, upload.array('images', 10), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No image files provided' });
  }
  
  try {
    const urls = [];
    
    for (const file of req.files) {
      const formData = new FormData();
      formData.append('image', file.buffer.toString('base64'));
      
      const response = await axios.post(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      
      if (response.data.success) {
        urls.push(response.data.data.url);
      }
    }
    
    res.json({ urls });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;