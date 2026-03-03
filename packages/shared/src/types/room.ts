export type RoomType = 'group' | 'dm';

export type TurnStrategy = 'round-robin' | 'free-form' | 'directed' | 'moderated';

export interface Room {
  id: string;
  name: string;
  type: RoomType;
  turnStrategy: TurnStrategy;
  members: string[]; // agent IDs
  createdAt: string;
  updatedAt: string;
}

export interface CreateRoomRequest {
  name: string;
  type: RoomType;
  turnStrategy?: TurnStrategy;
  members: string[];
}
