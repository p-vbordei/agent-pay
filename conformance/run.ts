import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runVector } from './scenarios.ts'

const VECTORS_DIR = join(import.meta.dir, 'vectors')

async function main() {
  const files = readdirSync(VECTORS_DIR).filter((f) => f.endsWith('.json')).sort()
  let passed = 0
  for (const file of files) {
    const vector = JSON.parse(readFileSync(join(VECTORS_DIR, file), 'utf8')) as {
      id: string
      title: string
      scenario: string
    }
    process.stdout.write(`${vector.id} ${vector.title}… `)
    try {
      await runVector(vector)
      console.log('PASS')
      passed++
    } catch (e) {
      console.log(`FAIL: ${(e as Error).message}`)
    }
  }
  console.log(`${passed}/${files.length} vectors passed`)
  if (passed !== files.length) process.exit(1)
}

await main()
