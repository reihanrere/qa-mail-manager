import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** Reads KEY from the environment, falling back to the project's root .env file. */
export function envValue(key: string): string | undefined {
  if (process.env[key]) return process.env[key]
  try {
    const file = readFileSync(resolve(import.meta.dirname, '../../.env'), 'utf8')
    const line = file.split('\n').find((l) => l.startsWith(`${key}=`))
    return line?.slice(key.length + 1).trim() || undefined
  } catch {
    return undefined
  }
}
