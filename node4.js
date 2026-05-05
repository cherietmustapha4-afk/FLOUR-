// sockets/notifications.js
module.exports = (io, db) => {
  // Listen for new notifications in Firebase
  const notificationListener = async (snapshot, userId) => {
    const notification = snapshot.val();
    if (notification && !notification.read) {
      io.to(`user_${userId}`).emit('new_notification', {
        id: snapshot.key,
        ...notification,
      });
    }
  };
  
  // Attach listeners for all users (in production, attach on user connection)
  // This would be better managed dynamically when users connect
};