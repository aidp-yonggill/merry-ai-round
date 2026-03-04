export type RoomType = 'group' | 'dm';

export type TurnStrategy = 'round-robin' | 'free-form' | 'directed' | 'moderated';

export type RoomStatus = 'active' | 'archived';

export interface Room {
  id: string;
  name: string;
  type: RoomType;
  turnStrategy: TurnStrategy;
  members: string[]; // agent IDs
  status: RoomStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRoomRequest {
  name: string;
  type: RoomType;
  turnStrategy?: TurnStrategy;
  members: string[];
}
