// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { expect, it } from 'vitest'

it('usa a base compartilhada para todos os campos de texto da aplicação', () => {
  const exceptions = new Set(['hidden', 'file', 'checkbox', 'radio', 'range', 'color', 'submit', 'reset', 'button', 'image'])
  const violations: string[] = []
  function inspect(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name)
      if (entry.isDirectory()) { inspect(file); continue }
      if (!file.endsWith('.tsx') || relative(process.cwd(), file) === 'components/ui/Field.tsx') continue
      const ast = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
      function visit(node: ts.Node) {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          const tag = node.tagName.getText(ast)
          if (['input', 'textarea', 'select'].includes(tag)) {
            const type = node.attributes.properties.find(attr => ts.isJsxAttribute(attr) && attr.name.getText(ast) === 'type')
            const allowed = tag === 'input' && type && ts.isJsxAttribute(type) && type.initializer && ts.isStringLiteral(type.initializer) && exceptions.has(type.initializer.text)
            if (!allowed) violations.push(`${relative(process.cwd(), file)}:${ast.getLineAndCharacterOfPosition(node.getStart()).line + 1}`)
          }
        }
        ts.forEachChild(node, visit)
      }
      visit(ast)
    }
  }
  inspect(join(process.cwd(), 'app'))
  inspect(join(process.cwd(), 'components'))
  expect(violations, 'Reutilize components/ui/Field.tsx; não recrie campos nativos nas telas.').toEqual([])
})
