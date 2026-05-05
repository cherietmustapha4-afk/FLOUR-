// sockets/typing.js
module.exports = (io, db) => {
  const typingUsers = new Map();
  
  io.on('connection', (socket) => {
    const userId = socket.handshake.auth.userId;
    
    if (userId) {
      typingUsers.set(socket.id, { userId, timeout: null });
      
      socket.on('typing_start', async ({ partnerId }) => {
        const chatId = userId < partnerId ? `${userId}_${partnerId}` : `${partnerId}_${userId}`;
        
        // Check if partner has typing indicators enabled
        const settingsSnap = await db.ref(`userSettings/${partnerId}/typingIndicators`).once('value');
        if (settingsSnap.val() !== false) {
          socket.to(`user_${partnerId}`).emit('typing_indicator', { userId, chatId, isTyping: true });
          
          // Auto-clear after 3 seconds
          const userData = typingUsers.get(socket.id);
          if (userData && userData.timeout) {
            clearTimeout(userData.timeout);
          }
          
          const timeout = setTimeout(() => {
            socket.emit('typing_stop', { partnerId });
            socket.to(`user_${partnerId}`).emit('typing_indicator', { userId, chatId, isTyping: false });
          }, 3000);
          
          typingUsers.set(socket.id, { userId, timeout });
        }
      });
      
      socket.on('typing_stop', ({ partnerId }) => {
        const chatId = userId < partnerId ? `${userId}_${partnerId}` : `${partnerId}_${userId}`;
        socket.to(`user_${partnerId}`).emit('typing_indicator', { userId, chatId, isTyping: false });
      });
    }
  });
};