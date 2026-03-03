import { nanoid } from 'nanoid';

export function generateId(prefix?: string): string {
  const id = nanoid(12);
  return prefix ? `${prefix}_${id}` : id;
}

export function generateRoomId(): string {
  return generateId('room');
}

export function generateMessageId(): string {
  return generateId('msg');
}
