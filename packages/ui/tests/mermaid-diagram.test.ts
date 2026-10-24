import { render } from "pele"
import { describe, expect, it } from "vitest"

// MermaidDiagram puts Pele's SVG straight into the page, and diagram sources
// come from an agent that read someone else's pull request. Pele escaping
// label text is the only thing keeping a hostile label from adding markup, so
// this pins it: if an upgrade of Pele stops escaping, this fails.

const hostileSources = {
  "HTML in a node label": 'flowchart LR\n  A["<img src=x onerror=alert(1)>"] --> B',
  "a label closing its own text element":
    'flowchart LR\n  A["</text><script>alert(1)</script>"] --> B',
  "HTML in an edge label": 'flowchart LR\n  A -->|"<svg onload=alert(1)>"| B',
  "an entity-encoded tag": 'flowchart LR\n  A["&lt;img src=x onerror=alert(1)&gt;"] --> B',
  "a click callback": 'flowchart LR\n  A --> B\n  click A "javascript:alert(1)"',
  "a click link": 'flowchart LR\n  A --> B\n  click A href "javascript:alert(1)"',
  "HTML in a sequence message": "sequenceDiagram\n  Alice->>Bob: <img src=x onerror=alert(1)>",
}

describe("diagrams from hostile sources", () => {
  for (const [name, source] of Object.entries(hostileSources)) {
    it(`${name} -> drawn without any element or attribute it asked for`, () => {
      const { svg } = render(source)

      expect(svg).not.toMatch(/<(script|img|iframe|foreignObject|a)\b/i)
      expect(svg.match(/<svg\b/gi)).toHaveLength(1)
      expect(svg).not.toMatch(/<[^>]*\son\w+\s*=/i)
      expect(svg).not.toMatch(/javascript:/i)
    })
  }
})
