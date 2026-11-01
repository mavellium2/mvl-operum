// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { expect, it } from 'vitest'

it('usa GlassButton como única implementação nativa de botão da aplicação', () => {

  const violations: string[] = []
  function inspect(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name)
      if (entry.isDirectory()) { inspect(file); continue }
      if (!file.endsWith('.tsx') || relative(process.cwd(), file) === 'components/ui/GlassButton.tsx') continue
      const ast = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
      function visit(node: ts.Node) {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          const tag = node.tagName.getText(ast)
          if (tag === 'button') violations.push(`${relative(process.cwd(), file)}:${ast.getLineAndCharacterOfPosition(node.getStart()).line + 1}`)
        }
        ts.forEachChild(node, visit)
      }
      visit(ast)
    }
  }
  inspect(join(process.cwd(), 'app'))
  inspect(join(process.cwd(), 'components'))
  expect(violations, 'Reutilize GlassButton e GlassCloseButton; não recrie botões nativos nas telas.').toEqual([])
})
