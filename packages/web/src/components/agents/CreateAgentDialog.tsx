'use client';

import { useState, useCallback, useMemo } from 'react';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useApiClient } from '@/hooks/useApiClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { AgentModel, ResponseTrigger } from '@merry/shared';

type ResponseStyle = 'structured' | 'conversational' | 'brief';

const MODELS: { value: AgentModel; label: string }[] = [
  { value: 'haiku', label: 'Haiku' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'opus', label: 'Opus' },
];

const TRIGGERS: { value: ResponseTrigger; label: string }[] = [
  { value: 'always', label: 'Always' },
  { value: 'tagged', label: 'Tagged' },
  { value: 'contextual', label: 'Contextual' },
  { value: 'called_by_agent', label: 'Called by Agent' },
  { value: 'manual', label: 'Manual' },
];

const STYLES: { value: ResponseStyle; label: string }[] = [
  { value: 'structured', label: 'Structured' },
  { value: 'conversational', label: 'Conversational' },
  { value: 'brief', label: 'Brief' },
];

interface CreateAgentDialogProps {
  onCreated?: () => void;
}

export function CreateAgentDialog({ onCreated }: CreateAgentDialogProps) {
  const t = useTranslations('agents');
  const tc = useTranslations();
  const api = useApiClient();

  const [open, setOpen] = useState(false);
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [model, setModel] = useState<AgentModel>('sonnet');
  const [responseTrigger, setResponseTrigger] = useState<ResponseTrigger>('tagged');
  const [responseStyle, setResponseStyle] = useState<ResponseStyle>('conversational');
  const [persona, setPersona] = useState('');
  const [creating, setCreating] = useState(false);

  const idRegex = /^[a-z0-9][a-z0-9-]*$/;
  const isIdValid = useMemo(() => !id || idRegex.test(id), [id]);

  const resetState = useCallback(() => {
    setId('');
    setName('');
    setAvatar('');
    setColor('#6366f1');
    setModel('sonnet');
    setResponseTrigger('tagged');
    setResponseStyle('conversational');
    setPersona('');
    setCreating(false);
  }, []);

  const handleCreate = useCallback(async () => {
    if (!id || !name || !isIdValid || creating) return;
    setCreating(true);
    try {
      await api.createAgent({
        id,
        name,
        avatar: avatar || undefined,
        color: color || undefined,
        model,
        behavior: {
          responseTrigger,
          responseStyle,
          autoGreet: false,
        },
        persona: persona || undefined,
      });
      onCreated?.();
      setOpen(false);
      resetState();
    } catch {
      // TODO: toast
    } finally {
      setCreating(false);
    }
  }, [id, name, avatar, color, model, responseTrigger, responseStyle, persona, isIdValid, creating, api, onCreated, resetState]);

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetState(); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="mr-1 h-3.5 w-3.5" />
          {t('createAgent')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md overflow-y-auto max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{t('createAgent')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Identity Section */}
          <div className="space-y-3">
            <label className="text-sm font-medium">{t('identity')}</label>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">{t('agentId')}</label>
              <Input
                placeholder={t('agentIdPlaceholder')}
                value={id}
                onChange={(e) => setId(e.target.value.toLowerCase())}
              />
              {!isIdValid && id && (
                <p className="text-[10px] text-destructive">{t('agentIdHint')}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">{t('agentName')}</label>
              <Input
                placeholder={t('agentNamePlaceholder')}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="flex gap-4 items-end">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">{t('avatar')}</label>
                <Input
                  className="w-24"
                  placeholder={t('avatarPlaceholder')}
                  value={avatar}
                  onChange={(e) => setAvatar(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">{t('colorLabel')}</label>
                <Input
                  type="color"
                  className="w-16 h-9 p-1 cursor-pointer"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Model Section */}
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('modelAndLimits')}</label>
            <div className="flex gap-2">
              {MODELS.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setModel(m.value)}
                  className={cn(
                    'flex-1 rounded-md border px-3 py-1.5 text-sm transition-colors',
                    model === m.value
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border text-muted-foreground hover:border-primary/50'
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Behavior Section */}
          <div className="space-y-3">
            <label className="text-sm font-medium">{t('behaviorSection')}</label>
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">{t('responseTrigger')}</label>
              <div className="grid grid-cols-2 gap-2">
                {TRIGGERS.map((tr) => (
                  <button
                    key={tr.value}
                    onClick={() => setResponseTrigger(tr.value)}
                    className={cn(
                      'rounded-md border px-3 py-1.5 text-xs transition-colors',
                      responseTrigger === tr.value
                        ? 'border-primary bg-primary/10'
                        : 'border-border text-muted-foreground hover:border-primary/50'
                    )}
                  >
                    {tr.value === 'always' ? t('triggerAlways') :
                     tr.value === 'tagged' ? t('triggerTagged') :
                     tr.value === 'contextual' ? t('triggerContextual') :
                     tr.value === 'called_by_agent' ? t('triggerCalled') :
                     t('triggerManual')}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">{t('responseStyle')}</label>
              <div className="flex gap-2">
                {STYLES.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => setResponseStyle(s.value)}
                    className={cn(
                      'flex-1 rounded-md border px-2 py-1.5 text-xs transition-colors',
                      responseStyle === s.value
                        ? 'border-primary bg-primary/10'
                        : 'border-border text-muted-foreground hover:border-primary/50'
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Persona Section */}
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('personaSection')}</label>
            <textarea
              className="w-full rounded-md border border-input bg-muted/30 px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              rows={4}
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
              placeholder={t('personaPlaceholder')}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {tc('cancel')}
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!id || !name || !isIdValid || creating}
          >
            {creating ? t('creating') : tc('create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
