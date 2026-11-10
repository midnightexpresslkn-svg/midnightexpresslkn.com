import { parseAstAsync } from "vite";

// Vitest maps V8 offsets through the module-runner print, which inserts a
// semicolon between adjacent statements. The page script has to be that text.
export async function coveredSource(code) {
  const ast = await parseAstAsync(code);
  const points = [];
  const skip = new Set([
    "FunctionDeclaration",
    "ClassDeclaration",
    "BlockStatement",
    "ImportDeclaration",
  ]);
  function mark(statements) {
    if (!statements) return;
    for (let i = 0; i < statements.length - 1; i += 1) {
      const stmt = statements[i];
      if (code[stmt.end - 1] !== ";" && !skip.has(stmt.type))
        points.push(stmt.end);
    }
  }
  function visit(node) {
    if (!node || typeof node !== "object" || !node.type) return;
    if (
      node.type === "Program" ||
      node.type === "BlockStatement" ||
      node.type === "StaticBlock"
    ) {
      mark(node.body);
    } else if (node.type === "SwitchCase") mark(node.consequent);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const item of value) visit(item);
      } else visit(value);
    }
  }
  visit(ast);
  points.sort((a, b) => b - a);
  let out = code;
  for (const index of points)
    out = `${out.slice(0, index)};${out.slice(index)}`;
  return out;
}
