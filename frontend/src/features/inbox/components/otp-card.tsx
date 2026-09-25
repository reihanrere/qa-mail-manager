import { Copy, Check, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import type { OTPResult } from '@/types/message'

interface OTPCardProps {
  otp: OTPResult
}

/** Highlights a detected verification code with a copy-to-clipboard button. */
export function OTPCard({ otp }: OTPCardProps) {
  const [copied, setCopied] = useState(false)
  const [copying, setCopying] = useState(false)

  const handleCopy = async () => {
    setCopying(true)
    try {
      await navigator.clipboard.writeText(otp.code)
      setCopied(true)
      toast.success('OTP copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy OTP')
    } finally {
      setCopying(false)
    }
  }

  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">Verification code ({otp.length} digits)</p>
        <p className="truncate font-mono text-2xl font-bold tracking-widest select-all" data-otp-code>
          {otp.code}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0"
        onClick={handleCopy}
        disabled={copying}
        aria-label={copied ? 'Copied' : 'Copy OTP to clipboard'}
      >
        {copying ? (
          <Loader2 className="size-4 animate-spin" />
        ) : copied ? (
          <Check className="size-4 text-green-500" />
        ) : (
          <>
            <Copy className="mr-1 size-4" />
            Copy
          </>
        )}
      </Button>
    </div>
  )
}
