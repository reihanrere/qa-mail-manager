import { useEffect, useState } from 'react'
import { ChevronsUpDown, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useDefaultLayout } from 'react-resizable-panels'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useAccount, useInfiniteAccounts } from '@/features/account/queries'
import { INBOX_ACCOUNT_PARAMS } from '@/features/inbox/queries'
import { getInitials } from '@/features/inbox/utils/format'
import { AccountList } from './account-list'
import { MessageList } from './message-list'
import { MessageDetail } from './message-detail'

const ACCOUNTS_COLLAPSED_SIZE = 56

/**
 * Inbox page layout: three resizable panes (accounts, messages, detail) on desktop and a
 * single-pane flow below 1024px. The selected account lives in the `?account=` search param.
 */
export function InboxContainer() {
  const navigate = useNavigate({ from: '/inbox' })
  const search = useSearch({ from: '/inbox' })
  const selectedAccountId = search.account
  const [selectedMessageId, setSelectedMessageId] = useState<string | undefined>()
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  // Shares its cache with the account panel, so the first item is the most recently active account
  const { data: accountPages } = useInfiniteAccounts(INBOX_ACCOUNT_PARAMS)
  const latestAccountId = accountPages?.pages[0]?.items[0]?.id
  const { data: selectedAccount } = useAccount(isDesktop ? undefined : selectedAccountId)

  useEffect(() => {
    if (latestAccountId && !selectedAccountId) {
      navigate({ search: { account: latestAccountId }, replace: true })
    }
  }, [latestAccountId, selectedAccountId, navigate])

  const handleSelectAccount = (accountId: string) => {
    setSelectedMessageId(undefined)
    navigate({ search: { account: accountId } })
  }

  return (
    <TooltipProvider delayDuration={0}>
      {isDesktop ? (
        <DesktopInbox
          selectedAccountId={selectedAccountId}
          selectedMessageId={selectedMessageId}
          onSelectAccount={handleSelectAccount}
          onSelectMessage={setSelectedMessageId}
        />
      ) : (
        <MobileInbox
          selectedAccountId={selectedAccountId}
          selectedMessageId={selectedMessageId}
          selectedAccountEmail={selectedAccount?.email}
          onSelectAccount={handleSelectAccount}
          onSelectMessage={setSelectedMessageId}
        />
      )}
    </TooltipProvider>
  )
}

interface InboxViewProps {
  selectedAccountId?: string
  selectedMessageId?: string
  onSelectAccount: (accountId: string) => void
  onSelectMessage: (messageId: string | undefined) => void
}

function DesktopInbox({
  selectedAccountId,
  selectedMessageId,
  onSelectAccount,
  onSelectMessage,
}: InboxViewProps) {
  const { t } = useTranslation()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: 'inbox-layout',
    storage: localStorage,
    // Only remember sizes the user dragged; a narrow window would otherwise persist a collapsed pane
    onlySaveAfterUserInteractions: true,
  })

  return (
    <ResizablePanelGroup
      orientation="horizontal"
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
      // The message iframe would swallow pointer events mid-drag and stall the resize
      className="min-h-0 flex-1 items-stretch [&:has([data-separator=active])_iframe]:pointer-events-none"
    >
      <ResizablePanel
        id="accounts"
        // Pixel defaults: a percentage computed against a not-yet-final group width can land
        // below minSize, which makes the collapsible pane start collapsed
        defaultSize={260}
        minSize={200}
        maxSize="30"
        collapsible
        collapsedSize={ACCOUNTS_COLLAPSED_SIZE}
        onResize={(size) => setIsCollapsed(size.inPixels < 100)}
        className={cn(
          'flex min-w-0 flex-col overflow-hidden',
          isCollapsed && 'min-w-[56px] transition-all duration-300 ease-in-out',
        )}
      >
        <div
          className={cn('flex h-[52px] shrink-0 items-center', isCollapsed ? 'justify-center' : 'gap-2 px-4')}
        >
          <Users className="size-4 shrink-0 text-muted-foreground" />
          {!isCollapsed && <h2 className="truncate text-sm font-semibold">{t('inbox.accounts')}</h2>}
        </div>
        <Separator />
        <div className="min-h-0 flex-1">
          <AccountList
            selectedAccountId={selectedAccountId}
            onSelectAccount={onSelectAccount}
            isCollapsed={isCollapsed}
          />
        </div>
      </ResizablePanel>

      <ResizableHandle withHandle />

      <ResizablePanel
        id="messages"
        defaultSize={380}
        minSize={300}
        className="flex min-w-0 flex-col overflow-hidden"
      >
        <MessageList
          accountId={selectedAccountId}
          selectedMessageId={selectedMessageId}
          onSelectMessage={onSelectMessage}
        />
      </ResizablePanel>

      <ResizableHandle withHandle />

      <ResizablePanel id="detail" minSize={340} className="flex min-w-0 flex-col overflow-hidden">
        <MessageDetail
          accountId={selectedAccountId}
          messageId={selectedMessageId}
          onDeleted={() => onSelectMessage(undefined)}
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}

function MobileInbox({
  selectedAccountId,
  selectedMessageId,
  selectedAccountEmail,
  onSelectAccount,
  onSelectMessage,
}: InboxViewProps & { selectedAccountEmail?: string }) {
  const { t } = useTranslation()
  const [accountSheetOpen, setAccountSheetOpen] = useState(false)

  if (selectedAccountId && selectedMessageId) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <MessageDetail
          accountId={selectedAccountId}
          messageId={selectedMessageId}
          onBack={() => onSelectMessage(undefined)}
          onDeleted={() => onSelectMessage(undefined)}
        />
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 p-2">
        <Sheet open={accountSheetOpen} onOpenChange={setAccountSheetOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" className="w-full justify-start gap-2 px-2">
              <span className="flex size-6 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-semibold">
                {selectedAccountEmail ? getInitials(selectedAccountEmail) : '?'}
              </span>
              <span className="min-w-0 flex-1 truncate text-left font-mono text-xs">
                {selectedAccountEmail ?? t('inbox.selectAccount')}
              </span>
              <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="flex w-80 flex-col gap-0 p-0">
            <SheetHeader className="p-4">
              <SheetTitle>{t('inbox.accounts')}</SheetTitle>
            </SheetHeader>
            <Separator />
            <div className="min-h-0 flex-1">
              <AccountList
                selectedAccountId={selectedAccountId}
                onSelectAccount={(accountId) => {
                  onSelectAccount(accountId)
                  setAccountSheetOpen(false)
                }}
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>
      <Separator />
      <div className="min-h-0 flex-1">
        <MessageList
          accountId={selectedAccountId}
          selectedMessageId={selectedMessageId}
          onSelectMessage={onSelectMessage}
        />
      </div>
    </div>
  )
}
