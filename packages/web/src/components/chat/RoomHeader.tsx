'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Trash2, Archive } from 'lucide-react';
import { useStore } from '@/lib/store';
import { useApiClient } from '@/hooks/useApiClient';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { DiscussionControls } from './DiscussionControls';

interface RoomHeaderProps {
  roomId: string;
}

export function RoomHeader({ roomId }: RoomHeaderProps) {
  const t = useTranslations('chat');
  const tr = useTranslations('rooms');
  const tGlobal = useTranslations();
  const rooms = useStore((s) => s.rooms);
  const agents = useStore((s) => s.agents);
  const room = rooms.find((r) => r.id === roomId);
  const api = useApiClient();
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [archiving, setArchiving] = useState(false);

  if (!room) return null;

  const memberAgents = agents.filter((a) => room.members.includes(a.id));

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.deleteRoom(roomId);
      router.push('/');
    } finally {
      setDeleting(false);
    }
  };

  const handleArchive = async () => {
    setArchiving(true);
    try {
      await api.archiveRoom(roomId);
      router.push('/');
    } finally {
      setArchiving(false);
    }
  };

  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-2">
      <div className="flex min-w-0 items-center gap-3">
        <h2 className="max-w-[120px] truncate text-base font-semibold sm:max-w-none">
          {room.name}
        </h2>
        <Separator orientation="vertical" className="hidden h-5 sm:block" />
        <div className="hidden items-center gap-1 sm:flex">
          {memberAgents.map((agent) => (
            <span
              key={agent.id}
              title={agent.definition.name}
              className="cursor-default text-base"
            >
              {agent.definition.avatar}
            </span>
          ))}
          {memberAgents.length === 0 && (
            <span className="text-xs text-muted-foreground">{t('noAgents')}</span>
          )}
        </div>
        <span className="hidden text-xs text-muted-foreground sm:inline">
          {room.turnStrategy}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
              <Archive className="h-3.5 w-3.5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{tr('archiveConfirm')}</AlertDialogTitle>
              <AlertDialogDescription>{tr('archiveConfirmDesc')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={archiving}>
                {tGlobal('cancel')}
              </AlertDialogCancel>
              <AlertDialogAction onClick={handleArchive} disabled={archiving}>
                {archiving ? tr('archiving') : tr('archive')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{tr('deleteConfirm')}</AlertDialogTitle>
              <AlertDialogDescription>{tr('deleteConfirmDesc')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>
                {tGlobal('cancel')}
              </AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {deleting ? tr('deleting') : tr('confirmDelete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <DiscussionControls roomId={roomId} />
      </div>
    </div>
  );
}
