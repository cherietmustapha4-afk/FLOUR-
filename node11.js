// sockets/chat.js
module.exports = (io, db) => {
  io.on('connection', (socket) => {
    const userId = socket.handshake.auth.userId;
    if (userId) {
      socket.join(`user_${userId}`);
      console.log(`User ${userId} connected`);
      
      // Handle typing indicator
      socket.on('typing', async ({ partnerId, isTyping }) => {
        const chatId = userId < partnerId ? `${userId}_${partnerId}` : `${partnerId}_${userId}`;
        const settingsSnap = await db.ref(`userSettings/${partnerId}/typingIndicators`).once('value');
        
        if (settingsSnap.val() !== false) {
          socket.to(`user_${partnerId}`).emit('user_typing', { userId, chatId, isTyping });
        }
      });
      
      // Handle message read receipts
      socket.on('message_read', async ({ messageId, partnerId }) => {
        const chatId = userId < partnerId ? `${userId}_${partnerId}` : `${partnerId}_${userId}`;
        const settingsSnap = await db.ref(`userSettings/${partnerId}/readReceipts`).once('value');
        
        if (settingsSnap.val() !== false) {
          await db.ref(`messages/${chatId}/${messageId}/read`).set(true);
          socket.to(`user_${partnerId}`).emit('message_read_receipt', { messageId });
        }
      });
      
      socket.on('disconnect', () => {
        console.log(`User ${userId} disconnected`);
      });
    }
  });
};