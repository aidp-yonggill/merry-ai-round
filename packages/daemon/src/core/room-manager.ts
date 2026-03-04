import type { Room, RoomType, TurnStrategy } from '@merry/shared';
import { generateRoomId } from '@merry/shared';
import { SqliteStore } from '../storage/sqlite-store.js';

export class RoomManager {
  private store: SqliteStore;

  constructor(store: SqliteStore) {
    this.store = store;
  }

  create(params: { name: string; type: RoomType; turnStrategy?: TurnStrategy; members: string[] }): Room {
    const now = new Date().toISOString();
    const room: Room = {
      id: generateRoomId(),
      name: params.name,
      type: params.type,
      turnStrategy: params.turnStrategy ?? 'round-robin',
      members: params.members,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    this.store.saveRoom(room);
    return room;
  }

  get(id: string): Room | null {
    return this.store.getRoom(id);
  }

  getAll(): Room[] {
    return this.store.getAllRooms();
  }

  getArchived(): Room[] {
    return this.store.getArchivedRooms();
  }

  update(id: string, updates: Partial<Pick<Room, 'name' | 'turnStrategy'>>): Room | null {
    const room = this.store.getRoom(id);
    if (!room) return null;

    const updated: Room = {
      ...room,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.store.saveRoom(updated);
    return updated;
  }

  addMember(roomId: string, agentId: string): Room | null {
    const room = this.store.getRoom(roomId);
    if (!room) return null;
    if (room.members.includes(agentId)) return room;

    room.members.push(agentId);
    room.updatedAt = new Date().toISOString();
    this.store.saveRoom(room);
    return room;
  }

  removeMember(roomId: string, agentId: string): Room | null {
    const room = this.store.getRoom(roomId);
    if (!room) return null;

    room.members = room.members.filter(m => m !== agentId);
    room.updatedAt = new Date().toISOString();
    this.store.saveRoom(room);
    return room;
  }

  archive(id: string): boolean {
    const room = this.store.getRoom(id);
    if (!room) return false;
    this.store.archiveRoom(id);
    return true;
  }

  unarchive(id: string): boolean {
    const room = this.store.getRoom(id);
    if (!room) return false;
    this.store.unarchiveRoom(id);
    return true;
  }

  delete(id: string): void {
    this.store.deleteRoom(id);
  }
}
