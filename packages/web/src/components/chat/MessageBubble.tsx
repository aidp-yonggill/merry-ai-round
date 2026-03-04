'use client';

import { useTranslations } from 'next-intl';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage, AgentState, ToolUseBlock } from '@merry/shared';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ToolUseBlockView } from './ToolUseBlockView';
import { cn } from '@/lib/utils';

interface MessageBubbleProps {
  message: ChatMessage;
  agent?: AgentState;
  streamingContent?: string;
  activeToolBlocks?: ToolUseBlock[];
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function MessageBubble({ message, agent, streamingContent, activeToolBlocks }: MessageBubbleProps) {
  const t = useTranslations('chat');
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const displayContent = streamingContent ?? message.content;
  const agentColor = agent?.definition.color ?? '#888';
  const agentAvatar = agent?.definition.avatar ?? '?';
  const agentName = agent?.definition.name ?? t('unknown');

  if (isSystem) {
    return (
      <div className="flex justify-center px-4 py-2">
        <span className="text-xs text-muted-foreground italic">{displayContent}</span>
      </div>
    );
  }

  return (
    <div className={cn('group flex gap-2 md:gap-3 px-3 md:px-4 py-1.5 md:py-2 hover:bg-accent/30 transition-colors', isUser && 'flex-row-reverse')}>
      <Avatar className="mt-0.5 h-7 w-7 md:h-8 md:w-8 shrink-0">
        <AvatarFallback
          className={cn('text-sm', isUser ? 'bg-primary text-primary-foreground' : '')}
          style={!isUser ? { backgroundColor: agentColor + '20', color: agentColor } : undefined}
        >
          {isUser ? 'U' : agentAvatar}
        </AvatarFallback>
      </Avatar>
      <div className={cn('flex min-w-0 max-w-[85%] md:max-w-[75%] flex-col', isUser && 'items-end')}>
        <div className="flex items-baseline gap-2">
          <span
            className="text-sm font-semibold"
            style={!isUser ? { color: agentColor } : undefined}
          >
            {isUser ? t('you') : agentName}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatTime(message.createdAt)}
          </span>
        </div>
        <div
          className={cn(
            'mt-1 rounded-lg px-3 py-2 text-sm leading-relaxed',
            isUser
              ? 'bg-primary text-primary-foreground whitespace-pre-wrap'
              : 'bg-card border-l-2 prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-pre:my-2 prose-ul:my-1 prose-ol:my-1'
          )}
          style={!isUser ? { borderLeftColor: agentColor } : undefined}
        >
          {isUser ? (
            displayContent
          ) : (
            <Markdown remarkPlugins={[remarkGfm]}>{displayContent}</Markdown>
          )}
          {streamingContent !== undefined && (
            <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-foreground" />
          )}
        </div>
        {/* Tool use blocks: show real-time active ones, or persisted from metadata */}
        {!isUser && (activeToolBlocks ?? message.metadata.toolUseBlocks) && (
          <ToolUseBlockView blocks={activeToolBlocks ?? message.metadata.toolUseBlocks ?? []} />
        )}
        {message.metadata.tokensUsed && (
          <span className="mt-0.5 text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
            {message.metadata.tokensUsed} {t('tokens')}
            {message.metadata.costUsd ? ` / $${message.metadata.costUsd.toFixed(4)}` : ''}
          </span>
        )}
      </div>
    </div>
  );
}
