import { useState, type ReactNode } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { Check, Copy, Moon, RefreshCw, RotateCcw, Sun } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { AppHeader } from '@/components/layout/app-header'
import { PageContainer } from '@/components/common/page-container'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
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
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { useThemeStore, type Theme } from '@/store/theme.store'
import { useAppStore } from '@/store/app.store'
import { useAppSettings } from '@/features/settings/queries'
import { API_URL } from '@/lib/api-url'
import { EditableSettingsForm } from '@/features/settings/components/editable-settings-form'
import { useLiveStore, type LiveStatus } from '@/store/live.store'
import { LANGUAGES, currentLanguage, dateLocale, setLanguage } from '@/i18n'

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
})

// /health lives at the server root, not under the /api prefix
const HEALTH_URL = API_URL ? new URL('/health', API_URL).toString() : ''
const PANEL_LAYOUT_PREFIX = 'react-resizable-panels:'

function SettingsPage() {
  const { t } = useTranslation()
  return (
    <>
      <AppHeader title={t('pages.settings.title')} description={t('pages.settings.description')} />
      <PageContainer className="max-w-5xl">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">{t('settings.heading')}</h2>
          <p className="text-muted-foreground">{t('settings.storedLocally')}</p>
        </div>

        <SettingsSection title={t('settings.appearance')} description={t('settings.appearanceHint')}>
          <AppearanceSettings />
        </SettingsSection>

        <Separator />

        <SettingsSection title={t('settings.connection')} description={t('settings.connectionHint')}>
          <ConnectionSettings />
        </SettingsSection>

        <Separator />

        <SettingsSection title={t('settings.providers')} description={t('settings.providersHint')}>
          <ProviderSettings />
        </SettingsSection>

        <Separator />

        <SettingsSection title={t('settings.behavior')} description={t('settings.behaviorHint')}>
          <BehaviorSettings />
        </SettingsSection>

        <Separator />

        <SettingsSection title={t('settings.localData')} description={t('settings.localDataHint')}>
          <LocalDataSettings />
        </SettingsSection>
      </PageContainer>
    </>
  )
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="grid gap-4 lg:grid-cols-[240px_1fr] lg:gap-8">
      <div className="space-y-1">
        <h3 className="font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Card className="min-w-0 gap-0 py-0 shadow-sm">{children}</Card>
    </section>
  )
}

function SettingRow({
  label,
  description,
  htmlFor,
  children,
}: {
  label: string
  description?: ReactNode
  htmlFor?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0 space-y-1">
        <Label htmlFor={htmlFor}>{label}</Label>
        {description && <div className="text-sm text-muted-foreground">{description}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

const THEME_OPTIONS: { value: Theme; icon: typeof Sun }[] = [
  { value: 'light', icon: Sun },
  { value: 'dark', icon: Moon },
]

/** Segmented control styling shared by the theme and language pickers. */
function segmentClass(selected: boolean) {
  return cn(
    'flex items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors',
    selected
      ? 'border-primary bg-primary text-primary-foreground'
      : 'hover:bg-accent hover:text-accent-foreground',
  )
}

function AppearanceSettings() {
  const { t } = useTranslation()
  const language = currentLanguage()
  const theme = useThemeStore((state) => state.theme)
  const setTheme = useThemeStore((state) => state.setTheme)
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed)
  const setSidebarCollapsed = useAppStore((state) => state.setSidebarCollapsed)
  const newMailToasts = useAppStore((state) => state.newMailToasts)
  const setNewMailToasts = useAppStore((state) => state.setNewMailToasts)

  return (
    <>
      <SettingRow label={t('settings.theme')} description={t('settings.themeHint')}>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('settings.theme')}>
          {THEME_OPTIONS.map(({ value, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={theme === value}
              onClick={() => setTheme(value)}
              className={segmentClass(theme === value)}
            >
              <Icon className="size-4" />
              {t(`settings.${value}`)}
            </button>
          ))}
        </div>
      </SettingRow>
      <Separator />
      <SettingRow label={t('settings.language')} description={t('settings.languageHint')}>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('settings.language')}>
          {LANGUAGES.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={language === value}
              lang={value}
              onClick={() => setLanguage(value)}
              className={segmentClass(language === value)}
            >
              {t(`language.${value}`)}
            </button>
          ))}
        </div>
      </SettingRow>
      <Separator />
      <SettingRow
        label={t('settings.collapseSidebar')}
        htmlFor="collapse-sidebar"
        description={t('settings.collapseSidebarHint')}
      >
        <Switch id="collapse-sidebar" checked={sidebarCollapsed} onCheckedChange={setSidebarCollapsed} />
      </SettingRow>
      <Separator />
      <SettingRow
        label={t('settings.newMailToasts')}
        htmlFor="new-mail-toasts"
        description={t('settings.newMailToastsHint')}
      >
        <Switch id="new-mail-toasts" checked={newMailToasts} onCheckedChange={setNewMailToasts} />
      </SettingRow>
    </>
  )
}

function ConnectionSettings() {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const { data, isFetching, isError, dataUpdatedAt, errorUpdatedAt, refetch } = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const response = await fetch(HEALTH_URL)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return (await response.json()) as { status: string }
    },
    enabled: !!HEALTH_URL,
    staleTime: 0,
  })

  const isHealthy = !isError && data?.status === 'ok'
  const lastChecked = Math.max(dataUpdatedAt, errorUpdatedAt)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(API_URL)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error(t('settings.copyUrlFailed'))
    }
  }

  return (
    <>
      <SettingRow
        label={t('settings.apiUrl')}
        description={
          <>
            {t('settings.apiUrlHintBefore')} <EnvKey>VITE_API_URL</EnvKey> {t('settings.apiUrlHintIn')}{' '}
            <EnvKey>frontend/.env</EnvKey>. {t('settings.apiUrlHintAfter')}
          </>
        }
      >
        <div className="flex min-w-0 items-center gap-1 rounded-md border bg-muted/50 py-1 pr-1 pl-3">
          <span className="truncate font-mono text-sm">{API_URL || t('settings.notConfigured')}</span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleCopy}
            disabled={!API_URL}
            aria-label={t('settings.copyApiUrl')}
          >
            {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
          </Button>
        </div>
      </SettingRow>
      <Separator />
      <SettingRow
        label={t('settings.status')}
        description={
          lastChecked
            ? t('settings.lastChecked', {
                time: format(new Date(lastChecked), 'HH:mm:ss', { locale: dateLocale() }),
              })
            : t('settings.healthHint')
        }
      >
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 text-sm font-medium">
            <span
              className={cn(
                'size-2 rounded-full',
                isFetching && !data && !isError
                  ? 'animate-pulse bg-muted-foreground'
                  : isHealthy
                    ? 'bg-emerald-500'
                    : 'bg-destructive',
              )}
            />
            {isFetching && !data && !isError
              ? t('settings.checking')
              : isHealthy
                ? t('settings.connected')
                : t('settings.unreachable')}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching || !HEALTH_URL}
            className="gap-1.5"
          >
            <RefreshCw className={cn('size-3.5', isFetching && 'animate-spin')} />
            {t('settings.test')}
          </Button>
        </div>
      </SettingRow>
    </>
  )
}

function BehaviorSettings() {
  const { t } = useTranslation()
  const { data, isPending, isError, refetch, isFetching } = useAppSettings()
  if (isPending) return <p className="p-4 text-sm text-muted-foreground">{t('settings.loadingSettings')}</p>
  if (isError) {
    return (
      <div className="flex items-center justify-between gap-4 p-4">
        <p className="text-sm text-destructive">{t('settings.loadSettingsFailed')}</p>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          {t('common.retry')}
        </Button>
      </div>
    )
  }
  return <EditableSettingsForm settings={data} />
}

const LIVE_STATUS_DOT: Record<LiveStatus, string> = {
  connected: 'bg-emerald-500',
  connecting: 'animate-pulse bg-muted-foreground',
  disconnected: 'bg-destructive',
}

function LiveStatusLabel() {
  const { t } = useTranslation()
  const status = useLiveStore((state) => state.status)
  return (
    <span className="flex items-center gap-2 text-sm font-medium">
      <span className={cn('size-2 rounded-full', LIVE_STATUS_DOT[status])} />
      {t(`settings.${status}`)}
    </span>
  )
}

function EnvKey({ children }: { children: ReactNode }) {
  return <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{children}</code>
}

function ProviderSettings() {
  const { t } = useTranslation()
  const { data, isPending, isError, isFetching, refetch } = useAppSettings()

  if (isPending) {
    return <p className="p-4 text-sm text-muted-foreground">{t('settings.loadingSettings')}</p>
  }
  if (isError) {
    return (
      <div className="flex items-center justify-between gap-4 p-4">
        <p className="text-sm text-destructive">{t('settings.loadSettingsFailed')}</p>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          {t('common.retry')}
        </Button>
      </div>
    )
  }

  return (
    <>
      {data.providers.map((provider) => (
        <div key={provider.name}>
          <SettingRow
            label={provider.label}
            description={
              provider.available ? (
                <>
                  {t('settings.newAddressesUse')}{' '}
                  <span className="font-mono whitespace-nowrap">@{provider.domain}</span>
                </>
              ) : (
                <span className="break-words text-destructive">{provider.error}</span>
              )
            }
          >
            <div className="flex items-center gap-2">
              {provider.name === data.defaultProvider && (
                <Badge variant="secondary">{t('settings.default')}</Badge>
              )}
              <span className="flex items-center gap-2 text-sm font-medium">
                <span
                  className={cn(
                    'size-2 rounded-full',
                    provider.available ? 'bg-emerald-500' : 'bg-destructive',
                  )}
                />
                {provider.available ? t('settings.available') : t('settings.unavailable')}
              </span>
            </div>
          </SettingRow>
          <Separator />
        </div>
      ))}
      <SettingRow
        label={t('settings.ingest')}
        description={
          <>
            {t('settings.ingestHintBefore')} <EnvKey>INGEST_SECRET</EnvKey> {t('settings.ingestHintAfter')}
          </>
        }
      >
        <span className="text-sm font-medium">
          {data.inbox.ingestEnabled ? t('settings.enabled') : t('settings.disabled')}
        </span>
      </SettingRow>
      <Separator />
      <SettingRow label={t('settings.liveUpdates')} description={t('settings.liveUpdatesHint')}>
        <LiveStatusLabel />
      </SettingRow>
    </>
  )
}

function LocalDataSettings() {
  const { t } = useTranslation()
  const setTheme = useThemeStore((state) => state.setTheme)
  const setSidebarCollapsed = useAppStore((state) => state.setSidebarCollapsed)

  const handleReset = () => {
    setTheme('dark')
    setSidebarCollapsed(false)
    setLanguage(null)
    try {
      Object.keys(localStorage)
        .filter((key) => key.startsWith(PANEL_LAYOUT_PREFIX))
        .forEach((key) => localStorage.removeItem(key))
    } catch {
      // Storage may be unavailable (private mode); preferences above are already reset
    }
    toast.success(t('settings.resetDone'))
  }

  return (
    <SettingRow label={t('settings.resetPreferences')} description={t('settings.resetPreferencesHint')}>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" className="gap-2">
            <RotateCcw className="size-4" />
            {t('common.reset')}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settings.resetTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('settings.resetDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset}>{t('common.reset')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingRow>
  )
}
