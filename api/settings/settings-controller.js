import * as dbSettings from '../../db/db-settings.js';
import * as dbUsers from '../../db/db-users.js';
import { defaultSettings } from './settings-service.js';

export async function getSettings(request, reply) {
  const userId = request.user.id;
  if (!userId) return reply.code(401).send({ message: 'Unauthorized' });

  try {
    let settings = await dbSettings.getUsersSettings(userId);
    if (settings === undefined) {
      settings = defaultSettings;
    }
    const isUserAdmin = await dbUsers.isUserAdmin(userId);
    settings.isUserAdmin = isUserAdmin;
    settings.userName = request.user.username;

    return reply.code(200).send(settings);
  } catch (error) {
    return reply.code(400).send({ message: error.message });
  }
}

export async function postSettings(request, reply) {
  const userId = request.user.id;
  if (!userId) return reply.code(401).send({ message: 'Unauthorized' });

  const settings = request.body;
  try {
    await dbSettings.postUsersSettings(userId, settings);
    return reply.code(200).send({ message: 'Settings saved successfully' });
  } catch (error) {
    return reply.code(400).send({ message: error.message });
  }
}

export async function updateSetting(request, reply) {
  const userId = request.user.id;
  if (!userId) return reply.code(401).send({ message: 'Unauthorized' });

  const setting = Object.keys(request.body)[0];
  const value = request.body[setting];

  const allowedSettings = ['darkTheme', 'selectedChapterFood', 'selectedChapterMoney', 'height'];

  if (!allowedSettings.includes(setting)) {
    return reply.code(400).send({ message: 'Invalid setting name' });
  }

  if (Object.keys(request.body).length !== 1) {
    return reply.code(400).send({ message: 'Request body must contain exactly one setting' });
  }

  try {
    await dbSettings.updateSingleSetting(userId, setting, value);
    return reply.code(200).send({ message: 'Setting updated successfully' });
  } catch (error) {
    return reply.code(400).send({ message: error.message });
  }
}
