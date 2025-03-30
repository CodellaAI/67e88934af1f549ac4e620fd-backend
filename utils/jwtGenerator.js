
const jwt = require('jsonwebtoken');

module.exports = function(userId, role) {
  const payload = {
    user: {
      id: userId,
      role: role
    }
  };

  return jwt.sign(
    payload,
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};
