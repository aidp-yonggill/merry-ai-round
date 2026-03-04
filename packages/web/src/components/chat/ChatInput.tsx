'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Send } from 'lucide-react';
import { useStore } from '@/lib/store';
import { useApiClient } from '@/hooks/useApiClient';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ChatInputProps {
  roomId: string;
}

export function ChatInput({ roomId }: ChatInputProps) {
  const t = useTranslations('chat');
  const [text, setText] = useState('');
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const agents = useStore((s) => s.agents);
  const api = useApiClient();

  const filteredAgents = useMemo(() =>
    mentionQuery !== null
      ? agents.filter((a) =>
          a.definition.name.toLowerCase().includes(mentionQuery.toLowerCase())
        )
      : [],
    [agents, mentionQuery]
  );

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setText(value);

    // Detect @mention
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPos);
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
    if (mentionMatch) {
      setMentionQuery(mentionMatch[1]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  }, []);

  const insertMention = useCallback((name: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const cursorPos = textarea.selectionStart;
    const textBefore = text.slice(0, cursorPos);
    const textAfter = text.slice(cursorPos);
    const mentionStart = textBefore.lastIndexOf('@');
    const newText = textBefore.slice(0, mentionStart) + `@${name} ` + textAfter;
    setText(newText);
    setMentionQuery(null);
    textarea.focus();
  }, [text]);

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setSending(true);
    try {
      await api.sendMessage(roomId, { content: trimmed });
      setText('');
    } catch {
      // TODO: toast
    } finally {
      setSending(false);
    }
  }, [text, sending, api, roomId]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery !== null && filteredAgents.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((i) => Math.min(i + 1, filteredAgents.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        insertMention(filteredAgents[mentionIndex].definition.name);
        return;
      }
      if (e.key === 'Escape') {
        setMentionQuery(null);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [mentionQuery, filteredAgents, mentionIndex, insertMention, handleSend]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
    }
  }, [text]);

  return (
    <div className="relative border-t border-border px-3 md:px-4 py-2 md:py-3">
      {/* Mention autocomplete */}
      {mentionQuery !== null && filteredAgents.length > 0 && (
        <div className="absolute bottom-full left-4 right-4 mb-1 rounded-md border border-border bg-popover p-1 shadow-lg">
          {filteredAgents.map((agent, i) => (
            <button
              key={agent.id}
              onClick={() => insertMention(agent.definition.name)}
              className={cn(
                'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors',
                i === mentionIndex ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50'
              )}
            >
              <span>{agent.definition.avatar}</span>
              <span className="font-medium" style={{ color: agent.definition.color }}>
                {agent.definition.name}
              </span>
              <span className="ml-auto text-xs">{agent.definition.model}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={t('placeholder')}
          rows={1}
          className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[44px] ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
        <Button
          size="icon"
          onClick={handleSend}
          disabled={!text.trim() || sending}
          className="shrink-0 h-11 w-11 md:h-9 md:w-9"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
