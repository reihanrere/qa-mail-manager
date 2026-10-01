import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { Loader2, RotateCcw, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { apiErrorMessage } from '@/lib/api-error'
import { cn } from '@/lib/utils'
import { settingsApi } from '../api'
import { settingsKeys } from '../queries'
import { FIELD_GROUPS, fromDraft, isChanged, toDraft, type DraftError, type FieldDef } from '../fields'
import type { AppSettings, EditableSettingKey, EditableSettings, SettingsPatch } from '@/types/settings'

type Drafts = Record<EditableSettingKey, string>

function draftsFrom(editable: EditableSettings): Drafts {
  return Object.fromEntries(Object.entries(editable).map(([key, value]) => [key, toDraft(value)])) as Drafts
}

const ALL_FIELDS = FIELD_GROUPS.flatMap((group) => group.fields)

/**
 * Edits the settings the backend allows to change at runtime. Saved values override the
 * environment defaults (shown under each field) until reset; they apply immediately.
 */
export function EditableSettingsForm({ settings }: { settings: AppSettings }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [drafts, setDrafts] = useState<Drafts>(() => draftsFrom(settings.editable))
  // Re-sync the form when the saved settings change (save, reset, or another tab)
  const [syncedFrom, setSyncedFrom] = useState(settings.editable)
  if (syncedFrom !== settings.editable) {
    setSyncedFrom(settings.editable)
    setDrafts(draftsFrom(settings.editable))
  }

  const save = useMutation({
    mutationFn: (patch: SettingsPatch) => settingsApi.update(patch),
    onSuccess: (updated, patch) => {
      queryClient.setQueryData(settingsKeys.all, updated)
      toast.success(patch.reset?.length ? t('settingsForm.resetToDefault') : t('settingsForm.saved'))
    },
    onError: (error) => toast.error(apiErrorMessage(error, t('settingsForm.saveFailed'))),
  })

  const errors: Partial<Record<EditableSettingKey, DraftError>> = {}
  const changed: Partial<EditableSettings> = {}
  for (const field of ALL_FIELDS) {
    const draft = drafts[field.key]
    if (!isChanged(field.kind, draft, settings.editable[field.key])) continue
    const parsed = fromDraft(field.kind, draft)
    if ('error' in parsed) errors[field.key] = parsed.error
    else (changed as Record<string, unknown>)[field.key] = parsed.value
  }
  const changedCount = Object.keys(changed).length + Object.keys(errors).length
  const hasErrors = Object.keys(errors).length > 0

  const setDraft = (key: EditableSettingKey, value: string) =>
    setDrafts((current) => ({ ...current, [key]: value }))

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (!hasErrors && changedCount > 0) save.mutate({ values: changed })
      }}
    >
      {FIELD_GROUPS.map((group, index) => (
        <div key={group.id}>
          {index > 0 && <Separator />}
          <p className="px-4 pt-4 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {t(`settingsGroups.${group.id}`)}
          </p>
          {group.fields.map((field) => (
            <SettingField
              key={field.key}
              field={field}
              settings={settings}
              draft={drafts[field.key]}
              error={errors[field.key] && t(`settingsForm.errors.${errors[field.key]!}`)}
              dirty={field.key in changed || field.key in errors}
              disabled={save.isPending}
              onChange={(value) => setDraft(field.key, value)}
              onReset={() => save.mutate({ reset: [field.key] })}
            />
          ))}
        </div>
      ))}
      <Separator />
      <div className="flex flex-wrap items-center justify-end gap-2 p-4">
        <span className="mr-auto text-xs text-muted-foreground">
          {changedCount > 0
            ? t('settingsForm.unsaved', { count: changedCount })
            : t('settingsForm.applyImmediately')}
        </span>
        <Button
          type="button"
          variant="outline"
          disabled={changedCount === 0 || save.isPending}
          onClick={() => setDrafts(draftsFrom(settings.editable))}
        >
          {t('settingsForm.discard')}
        </Button>
        <Button type="submit" disabled={changedCount === 0 || hasErrors || save.isPending} className="gap-2">
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {t('common.save')}
        </Button>
      </div>
    </form>
  )
}

function SettingField({
  field,
  settings,
  draft,
  error,
  dirty,
  disabled,
  onChange,
  onReset,
}: {
  field: FieldDef
  settings: AppSettings
  draft: string
  error?: string
  dirty: boolean
  disabled: boolean
  onChange: (value: string) => void
  onReset: () => void
}) {
  const { t } = useTranslation()
  const id = `setting-${field.key}`
  const overridden = settings.overridden.includes(field.key)
  const defaultLabel = toDraft(settings.defaults[field.key]) || t('settingsForm.empty')
  const options =
    field.kind === 'provider'
      ? settings.providers.map((provider) => ({ value: provider.name, label: provider.label }))
      : field.options?.map((value) => ({
          value,
          label: (t as (key: string) => string)(`settingsOptions.${field.key}.${value}`),
        }))

  return (
    <div className="grid gap-2 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] sm:items-start sm:gap-6">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <Label htmlFor={id}>{t(`settingsFields.${field.key}.label`)}</Label>
          {overridden && (
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              {t('settingsForm.customized')}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{t(`settingsFields.${field.key}.description`)}</p>
        <p className="text-xs text-muted-foreground">
          {t('settingsForm.defaultFrom')} <code className="rounded bg-muted px-1 font-mono">{field.env}</code>
          : <span className="font-mono break-all">{defaultLabel}</span>
        </p>
      </div>
      <div className="min-w-0 space-y-1.5">
        {options ? (
          <Select value={draft} onValueChange={onChange} disabled={disabled}>
            <SelectTrigger id={id} className={cn('w-full', dirty && 'border-primary')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            id={id}
            value={draft}
            onChange={(event) => onChange(event.target.value)}
            inputMode={field.kind === 'int' ? 'numeric' : undefined}
            className={cn('font-mono text-sm', dirty && 'border-primary')}
            aria-invalid={!!error}
            disabled={disabled}
            autoComplete="off"
            spellCheck={false}
          />
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
        {overridden && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
            onClick={onReset}
            disabled={disabled}
          >
            <RotateCcw className="size-3" />
            {t('settingsForm.resetField')}
          </Button>
        )}
      </div>
    </div>
  )
}
