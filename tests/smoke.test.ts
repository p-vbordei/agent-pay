import { test, expect } from 'bun:test'
import { VERSION } from '../src/index.ts'

test('package version is the v0.1 banner', () => {
  expect(VERSION).toBe('agent-pay/0.1')
})
