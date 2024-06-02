import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../../env.js';
import { dbCreateUser, dbGetUserByUsername } from '../../db/user.js';

const generateTokens = (user) => {
  const accessToken = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '10m' });
  const refreshToken = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '31d' });
  return { accessToken, refreshToken };
};

const authService = {
  async register(username, password) {
    const existingUser = await dbGetUserByUsername(username);
    if (existingUser) {
      throw new Error('Username is taken');
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await dbCreateUser(username, hashedPassword);
    if (!result) {
      throw new Error('Something went wrong');
    }
    return result;
  },

  async login(username, password) {
    const user = await dbGetUserByUsername(username);
    if (!user || !(await bcrypt.compare(password, user.hashed_password))) {
      throw new Error('Invalid username and/or password');
    }
    return generateTokens(user);
  },

  async refreshToken(token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = { id: decoded.id, username: decoded.username };
      return generateTokens(user);
    } catch (error) {
      throw new Error('Invalid token');
    }
  },

  async verifyToken(token) {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (error) {
      throw new Error('Invalid token');
    }
  },
};

export default authService;
