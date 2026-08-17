import katex from 'katex';

/**
 * Renders text that may contain LaTeX math delimiters:
 *   $$...$$  — display (block) math
 *   $...$    — inline math
 * Everything else is rendered as plain text. Falls back to raw text on KaTeX error.
 */
export function MathText({ text, className }: { text: string; className?: string }) {
  const parts = parse(text);
  return (
    <span className={className}>
      {parts.map((p, i) => {
        if (p.type === 'text') return <span key={i}>{p.value}</span>;
        try {
          const html = katex.renderToString(p.value, {
            displayMode: p.type === 'block',
            throwOnError: true,
            output: 'html',
          });
          return (
            <span
              key={i}
              className={p.type === 'block' ? 'my-2 block' : 'inline'}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        } catch {
          return (
            <span key={i} className="font-mono text-[0.9em]">
              {p.type === 'block' ? `$$${p.value}$$` : `$${p.value}$`}
            </span>
          );
        }
      })}
    </span>
  );
}

type Part = { type: 'text'; value: string } | { type: 'inline' | 'block'; value: string };

function parse(input: string): Part[] {
  const parts: Part[] = [];
  let rest = input;
  while (rest.length > 0) {
    const blockIdx = rest.indexOf('$$');
    const inlineIdx = rest.indexOf('$');

    if (blockIdx !== -1 && (inlineIdx === -1 || blockIdx <= inlineIdx)) {
      if (blockIdx > 0) parts.push({ type: 'text', value: rest.slice(0, blockIdx) });
      const end = rest.indexOf('$$', blockIdx + 2);
      if (end === -1) {
        parts.push({ type: 'text', value: rest.slice(blockIdx) });
        break;
      }
      parts.push({ type: 'block', value: rest.slice(blockIdx + 2, end) });
      rest = rest.slice(end + 2);
    } else if (inlineIdx !== -1) {
      if (inlineIdx > 0) parts.push({ type: 'text', value: rest.slice(0, inlineIdx) });
      const end = rest.indexOf('$', inlineIdx + 1);
      if (end === -1) {
        parts.push({ type: 'text', value: rest.slice(inlineIdx) });
        break;
      }
      parts.push({ type: 'inline', value: rest.slice(inlineIdx + 1, end) });
      rest = rest.slice(end + 1);
    } else {
      parts.push({ type: 'text', value: rest });
      break;
    }
  }
  return parts;
}
