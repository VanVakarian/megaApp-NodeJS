import { execSync } from 'child_process';
import * as debugService from './debug-service.js';

export async function ping(request, reply) {
  const message = await debugService.ping();
  return reply.send({ message: message });
}

export async function latestCommitInfo(request, reply) {
  let commitHash = 'unknown';
  let commitDateTime = 'unknown';

  try {
    commitHash = execSync('git rev-parse --short HEAD').toString().trim();
    const rawDate = execSync('git show -s --format=%ci HEAD').toString().trim();

    const date = new Date(rawDate);
    commitDateTime = date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch (error) {
    console.error('Failed to get git info:', error);
  }

  return { commitHash, commitDateTime };
}
