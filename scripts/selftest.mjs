// Самотесты логики без зависимостей: node scripts/selftest.mjs (npm run test)
// Node ≥ 22.18 / 24 исполняет .ts сам (type stripping). Модули src импортируют друг друга без расширения,
// поэтому регистрируем крошечный resolve-хук, который пробует добавить «.ts».
import { registerHooks } from 'node:module'

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context)
    } catch (e) {
      if (/^\.{1,2}\//.test(specifier) && !/\.[cm]?[jt]sx?$/.test(specifier)) return nextResolve(specifier + '.ts', context)
      throw e
    }
  },
})

await import('./selftest.ts')
