import { Moon, Sun, Menu } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { useThemeStore } from '@/store/theme.store'
import { useAppStore } from '@/store/app.store'

interface AppHeaderProps {
  title: string
  description?: string
}

/** Page header with title, mobile menu button and theme toggle. */
export function AppHeader({ title, description }: AppHeaderProps) {
  const theme = useThemeStore((state) => state.theme)
  const setTheme = useThemeStore((state) => state.setTheme)
  const mobileSidebarOpen = useAppStore((state) => state.mobileSidebarOpen)
  const setMobileSidebarOpen = useAppStore((state) => state.setMobileSidebarOpen)

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-background/80 px-6 backdrop-blur">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open menu"
          onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
          className="md:hidden"
        >
          <Menu className="size-4" />
        </Button>
        <div>
          <h1 className="text-sm font-semibold">{title}</h1>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle theme"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>

        <Avatar className="size-8">
          <AvatarFallback>QA</AvatarFallback>
        </Avatar>
      </div>
    </header>
  )
}
