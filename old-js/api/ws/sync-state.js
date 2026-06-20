import { userDataLastModified } from '../../server.js';

export function updateUserDataLastModified(userId) {
  userDataLastModified.set(userId, Date.now());
}

export function getUserDataLastModified(userId) {
  return userDataLastModified.get(userId) || 0;
}
