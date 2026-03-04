'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Pencil, Trash2, X, Check, AlertTriangle } from 'lucide-react';
import type { AgentState } from '@merry/shared';
import { useApiClient } from '@/hooks/useApiClient';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { AgentStatusBadge } from './AgentStatusBadge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

interface AgentDetailProps {
  agent: AgentState | null;
  open: boolean;
  onClose: () => void;
  onMutated?: () => void;
}

export function AgentDetail({ agent, open, onClose, onMutated }: AgentDetailProps) {
  const t = useTranslations('agents');
  const tc = useTranslations();
  const api = useApiClient();

  const [editMode, setEditMode] = useState(false);
  const [rawConfig, setRawConfig] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const resetState = useCallback(() => {
    setEditMode(false);
    setRawConfig('');
    setSaving(false);
    setDeleting(false);
    setConfirmingDelete(false);
  }, []);

  const handleEdit = useCallback(async () => {
    if (!agent) return;
    try {
      const config = await api.getAgentConfig(agent.definition.id);
      setRawConfig(config);
      setEditMode(true);
    } catch {
      // TODO: toast
    }
  }, [agent, api]);

  const handleSave = useCallback(async () => {
    if (!agent) return;
    setSaving(true);
    try {
      await api.updateAgentConfig(agent.definition.id, rawConfig);
      onMutated?.();
      setEditMode(false);
    } catch {
      // TODO: toast
    } finally {
      setSaving(false);
    }
  }, [agent, rawConfig, api, onMutated]);

  const handleDelete = useCallback(async () => {
    if (!agent) return;
    setDeleting(true);
    try {
      await api.deleteAgent(agent.definition.id);
      onMutated?.();
      onClose();
    } catch {
      // TODO: toast
    } finally {
      setDeleting(false);
    }
  }, [agent, api, onMutated, onClose]);

  if (!agent) return null;
  const { definition: def } = agent;

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) { onClose(); resetState(); } }}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              <AvatarFallback
                className="text-xl"
                style={{ backgroundColor: def.color + '20', color: def.color }}
              >
                {def.avatar}
              </AvatarFallback>
            </Avatar>
            <div>
              <SheetTitle style={{ color: def.color }}>{def.name}</SheetTitle>
              <AgentStatusBadge status={agent.status} />
            </div>
          </div>
        </SheetHeader>

        <div className="mt-4 flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleEdit}
            className="gap-1.5"
            disabled={editMode}
          >
            <Pencil className="h-3.5 w-3.5" />{t('editAgent')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setConfirmingDelete(true)}
            className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
            disabled={editMode || confirmingDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />{t('deleteAgent')}
          </Button>
        </div>

        {confirmingDelete && !editMode && (
          <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-4 space-y-3">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm font-medium">{t('deleteConfirm')}</span>
            </div>
            <p className="text-xs text-muted-foreground">{t('deleteConfirmDesc')}</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="destructive"
                onClick={handleDelete}
                disabled={deleting}
                className="gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />{deleting ? t('deleting') : t('confirmDelete')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirmingDelete(false)}
                className="gap-1.5"
              >
                <X className="h-3.5 w-3.5" />{tc('cancel')}
              </Button>
            </div>
          </div>
        )}

        {editMode ? (
          <div className="mt-6 space-y-3">
            <p className="text-xs text-muted-foreground">{t('rawConfigDesc')}</p>
            <textarea
              className="w-full rounded-md border border-input bg-muted/30 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              rows={20}
              value={rawConfig}
              onChange={(e) => setRawConfig(e.target.value)}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
                <Check className="h-3.5 w-3.5" />{saving ? t('saving') : tc('save')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditMode(false)} className="gap-1.5">
                <X className="h-3.5 w-3.5" />{tc('cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <StatBlock label={t('model')} value={def.model} />
              <StatBlock label={t('maxTurns')} value={String(def.maxTurns)} />
              <StatBlock label={t('tokensUsed')} value={agent.totalTokensUsed.toLocaleString()} />
              <StatBlock label={t('cost')} value={`$${agent.totalCostUsd.toFixed(4)}`} />
              <StatBlock label={t('budget')} value={`$${def.maxBudgetUsd.toFixed(2)}`} />
              <StatBlock label={t('responseStyle')} value={def.behavior.responseStyle} />
            </div>

            <Separator />

            {/* Tags */}
            <div>
              <h4 className="text-sm font-medium mb-2">{t('tags')}</h4>
              <div className="flex flex-wrap gap-1">
                {def.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                ))}
              </div>
            </div>

            <Separator />

            {/* Persona */}
            <div>
              <h4 className="text-sm font-medium mb-2">{t('persona')}</h4>
              <div className="rounded-md bg-muted/50 p-3 text-sm whitespace-pre-wrap leading-relaxed">
                {def.persona}
              </div>
            </div>

            <Separator />

            {/* Tools */}
            <div>
              <h4 className="text-sm font-medium mb-2">{t('tools')}</h4>
              <div className="space-y-1 text-sm">
                {def.tools.allowed.length > 0 && (
                  <p className="text-muted-foreground">
                    <span className="text-emerald-400">{t('allowed')}</span>{' '}
                    {def.tools.allowed.join(', ')}
                  </p>
                )}
                {def.tools.disallowed.length > 0 && (
                  <p className="text-muted-foreground">
                    <span className="text-red-400">{t('disallowed')}</span>{' '}
                    {def.tools.disallowed.join(', ')}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/50 p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}
