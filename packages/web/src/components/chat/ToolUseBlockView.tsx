'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ToolUseBlock } from '@merry/shared';
import { cn } from '@/lib/utils';

interface ToolUseBlockViewProps {
  blocks: ToolUseBlock[];
}

const TOOL_ICONS: Record<string, string> = {
  Read: '📄',
  Write: '✏️',
  Edit: '🔧',
  Bash: '💻',
  Glob: '🔍',
  Grep: '🔎',
  WebSearch: '🌐',
  WebFetch: '🌐',
  Agent: '🤖',
};

function statusColor(status: ToolUseBlock['status']) {
  switch (status) {
    case 'running': return 'text-yellow-500';
    case 'completed': return 'text-green-500';
    case 'error': return 'text-red-500';
  }
}

function statusIcon(status: ToolUseBlock['status']) {
  switch (status) {
    case 'running': return '⏳';
    case 'completed': return '✓';
    case 'error': return '✗';
  }
}

function formatInput(input: Record<string, unknown>): string {
  // Show a concise summary of tool input
  if (input.file_path) return String(input.file_path);
  if (input.command) return String(input.command).slice(0, 120);
  if (input.pattern) return `pattern: ${input.pattern}`;
  if (input.query) return String(input.query).slice(0, 120);
  if (input.url) return String(input.url);
  const keys = Object.keys(input);
  if (keys.length === 0) return '';
  return keys.map(k => `${k}: ${JSON.stringify(input[k]).slice(0, 60)}`).join(', ');
}

function ToolUseItem({ block }: { block: ToolUseBlock }) {
  const t = useTranslations('toolUse');
  const [expanded, setExpanded] = useState(false);
  const icon = TOOL_ICONS[block.toolName] ?? '🔧';
  const inputSummary = formatInput(block.input);

  return (
    <div className="border border-border/50 rounded-md overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-accent/30 transition-colors text-left"
      >
        <span className={cn('text-[10px]', statusColor(block.status))}>
          {statusIcon(block.status)}
        </span>
        <span>{icon}</span>
        <span className="font-mono font-medium text-foreground/80">{block.toolName}</span>
        {inputSummary && (
          <span className="truncate text-muted-foreground flex-1">{inputSummary}</span>
        )}
        {block.durationMs != null && (
          <span className="text-muted-foreground shrink-0">
            {block.durationMs < 1000 ? `${block.durationMs}ms` : `${(block.durationMs / 1000).toFixed(1)}s`}
          </span>
        )}
        <span className="text-muted-foreground shrink-0">{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && (
        <div className="border-t border-border/50 bg-background/50 px-2.5 py-2 space-y-1.5">
          {Object.keys(block.input).length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{t('input')}</div>
              <pre className="text-xs font-mono text-foreground/70 whitespace-pre-wrap break-all max-h-40 overflow-auto">
                {JSON.stringify(block.input, null, 2)}
              </pre>
            </div>
          )}
          {block.output && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{t('output')}</div>
              <pre className="text-xs font-mono text-foreground/70 whitespace-pre-wrap break-all max-h-40 overflow-auto">
                {block.output.slice(0, 2000)}
                {block.output.length > 2000 && '...'}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ToolUseBlockView({ blocks }: ToolUseBlockViewProps) {
  const t = useTranslations('toolUse');
  const [collapsed, setCollapsed] = useState(false);
  if (blocks.length === 0) return null;

  const running = blocks.filter(b => b.status === 'running').length;
  const completed = blocks.filter(b => b.status === 'completed').length;
  const errors = blocks.filter(b => b.status === 'error').length;

  return (
    <div className="mt-1.5 space-y-1">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <span>{collapsed ? '▸' : '▾'}</span>
        <span>
          {t('toolsUsed', { count: blocks.length })}
          {running > 0 && <span className="text-yellow-500 ml-1">({running} {t('running')})</span>}
          {errors > 0 && <span className="text-red-500 ml-1">({errors} {t('failed')})</span>}
          {running === 0 && errors === 0 && completed > 0 && (
            <span className="text-green-500 ml-1">({t('allDone')})</span>
          )}
        </span>
      </button>
      {!collapsed && (
        <div className="space-y-1">
          {blocks.map(block => (
            <ToolUseItem key={block.id} block={block} />
          ))}
        </div>
      )}
    </div>
  );
}
