import { useState, type ReactNode } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { toast } from 'sonner'
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

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
})

// /health lives at the server root, not under the /api prefix
const HEALTH_URL = API_URL ? new URL('/health', API_URL).toString() : ''
const PANEL_LAYOUT_PREFIX = 'react-resizable-panels:'

function SettingsPage() {
  return (
    <>
      <AppHeader title="Settings" description="Manage your application preferences" />
      <PageContainer className="max-w-5xl">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">Settings</h2>
          <p className="text-muted-foreground">Preferences are stored in this browser only</p>
        </div>

        <SettingsSection title="Appearance" description="Customize how the application looks">
          <AppearanceSettings />
        </SettingsSection>

        <Separator />

        <SettingsSection title="Backend Connection" description="The API this app talks to">
          <ConnectionSettings />
        </SettingsSection>

        <Separator />

        <SettingsSection
          title="Mail Providers"
          description="Read-only. Configured on the server through environment variables (.env)"
        >
          <ProviderSettings />
        </SettingsSection>

        <Separator />

        <SettingsSection
          title="Behavior"
          description="Saved on the server for everyone. Overrides the .env defaults until reset"
        >
          <BehaviorSettings />
        </SettingsSection>

        <Separator />

        <SettingsSection title="Local Data" description="Data saved in this browser">
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

const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
]

function AppearanceSettings() {
  const theme = useThemeStore((state) => state.theme)
  const setTheme = useThemeStore((state) => state.setTheme)
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed)
  const setSidebarCollapsed = useAppStore((state) => state.setSidebarCollapsed)

  return (
    <>
      <SettingRow label="Theme" description="Choose between light and dark mode">
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Theme">
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={theme === value}
              onClick={() => setTheme(value)}
              className={cn(
                'flex items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors',
                theme === value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>
      </SettingRow>
      <Separator />
      <SettingRow
        label="Collapse sidebar"
        htmlFor="collapse-sidebar"
        description="Show only icons in the sidebar on larger screens"
      >
        <Switch id="collapse-sidebar" checked={sidebarCollapsed} onCheckedChange={setSidebarCollapsed} />
      </SettingRow>
    </>
  )
}

function ConnectionSettings() {
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
      toast.error('Failed to copy URL')
    }
  }

  return (
    <>
      <SettingRow
        label="API base URL"
        description={
          <>
            Set via <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">VITE_API_URL</code> in{' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">frontend/.env</code>. Restart the
            dev server after changing it.
          </>
        }
      >
        <div className="flex min-w-0 items-center gap-1 rounded-md border bg-muted/50 py-1 pr-1 pl-3">
          <span className="truncate font-mono text-sm">{API_URL || 'Not configured'}</span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleCopy}
            disabled={!API_URL}
            aria-label="Copy API URL"
          >
            {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
          </Button>
        </div>
      </SettingRow>
      <Separator />
      <SettingRow
        label="Status"
        description={
          lastChecked
            ? `Last checked at ${format(new Date(lastChecked), 'HH:mm:ss')}`
            : 'Checks the backend /health endpoint'
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
            {isFetching && !data && !isError ? 'Checking…' : isHealthy ? 'Connected' : 'Unreachable'}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching || !HEALTH_URL}
            className="gap-1.5"
          >
            <RefreshCw className={cn('size-3.5', isFetching && 'animate-spin')} />
            Test
          </Button>
        </div>
      </SettingRow>
    </>
  )
}

function BehaviorSettings() {
  const { data, isPending, isError, refetch, isFetching } = useAppSettings()
  if (isPending) return <p className="p-4 text-sm text-muted-foreground">Loading settings…</p>
  if (isError) {
    return (
      <div className="flex items-center justify-between gap-4 p-4">
        <p className="text-sm text-destructive">Could not load settings from the backend.</p>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          Retry
        </Button>
      </div>
    )
  }
  return <EditableSettingsForm settings={data} />
}

const LIVE_STATUS_META: Record<LiveStatus, { label: string; dot: string }> = {
  connected: { label: 'Connected', dot: 'bg-emerald-500' },
  connecting: { label: 'Connecting…', dot: 'animate-pulse bg-muted-foreground' },
  disconnected: { label: 'Disconnected', dot: 'bg-destructive' },
}

function LiveStatusLabel() {
  const status = useLiveStore((state) => state.status)
  const meta = LIVE_STATUS_META[status]
  return (
    <span className="flex items-center gap-2 text-sm font-medium">
      <span className={cn('size-2 rounded-full', meta.dot)} />
      {meta.label}
    </span>
  )
}

function EnvKey({ children }: { children: ReactNode }) {
  return <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{children}</code>
}

function ProviderSettings() {
  const { data, isPending, isError, isFetching, refetch } = useAppSettings()

  if (isPending) {
    return <p className="p-4 text-sm text-muted-foreground">Loading settings…</p>
  }
  if (isError) {
    return (
      <div className="flex items-center justify-between gap-4 p-4">
        <p className="text-sm text-destructive">Could not load settings from the backend.</p>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          Retry
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
                  New addresses use <span className="font-mono whitespace-nowrap">@{provider.domain}</span>
                </>
              ) : (
                <span className="break-words text-destructive">{provider.error}</span>
              )
            }
          >
            <div className="flex items-center gap-2">
              {provider.name === data.defaultProvider && <Badge variant="secondary">Default</Badge>}
              <span className="flex items-center gap-2 text-sm font-medium">
                <span
                  className={cn(
                    'size-2 rounded-full',
                    provider.available ? 'bg-emerald-500' : 'bg-destructive',
                  )}
                />
                {provider.available ? 'Available' : 'Unavailable'}
              </span>
            </div>
          </SettingRow>
          <Separator />
        </div>
      ))}
      <SettingRow
        label="Email ingest"
        description={
          <>
            Receives mail for the own-domain provider from the Cloudflare Email Worker. Set{' '}
            <EnvKey>INGEST_SECRET</EnvKey> to enable.
          </>
        }
      >
        <span className="text-sm font-medium">{data.inbox.ingestEnabled ? 'Enabled' : 'Disabled'}</span>
      </SettingRow>
      <Separator />
      <SettingRow
        label="Live updates"
        description="New mail appears instantly through a server-sent events stream; inboxes still poll as a fallback"
      >
        <LiveStatusLabel />
      </SettingRow>
    </>
  )
}

function LocalDataSettings() {
  const setTheme = useThemeStore((state) => state.setTheme)
  const setSidebarCollapsed = useAppStore((state) => state.setSidebarCollapsed)

  const handleReset = () => {
    setTheme('dark')
    setSidebarCollapsed(false)
    try {
      Object.keys(localStorage)
        .filter((key) => key.startsWith(PANEL_LAYOUT_PREFIX))
        .forEach((key) => localStorage.removeItem(key))
    } catch {
      // Storage may be unavailable (private mode); preferences above are already reset
    }
    toast.success('Preferences reset to defaults')
  }

  return (
    <SettingRow
      label="Reset preferences"
      description="Restore theme, sidebar and inbox panel sizes to their defaults. Accounts and emails are not affected."
    >
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" className="gap-2">
            <RotateCcw className="size-4" />
            Reset
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset preferences?</AlertDialogTitle>
            <AlertDialogDescription>
              Theme, sidebar and inbox layout will go back to their defaults. Your accounts and emails stay as
              they are.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset}>Reset</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingRow>
  )
}
