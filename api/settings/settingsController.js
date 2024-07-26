import { dbGetUsersSettings, dbPostUsersSettings } from '../../db/settings.js';
import { defaultSettings } from './settingsService.js';

const settingsController = {
  async getSettings(request, reply) {
    const userId = request.user.id;
    if (!userId) {
      reply.code(401).send({ message: 'Failed to get userId' });
      return;
    }
    try {
      let settings = await dbGetUsersSettings(userId);
      if (settings === undefined) {
        settings = defaultSettings;
      }
      settings.userName = request.user.username;
      await reply.code(200).send(settings);
    } catch (error) {
      reply.code(400).send({ message: error.message });
    }
  },

  async postSettings(request, reply) {
    const userId = request.user.id;
    if (!userId) {
      reply.code(401).send({ message: 'Failed to get userId' });
      return;
    }
    const settings = request.body;

    try {
      await dbPostUsersSettings(userId, settings);
      await reply.code(200).send({ message: 'Settings saved successfully' });
    } catch (error) {
      reply.code(400).send({ message: error.message });
    }
  },
};

export default settingsController;
