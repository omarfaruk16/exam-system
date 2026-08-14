import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { loadChildren, nodeBadge, nodeExpandable, nodeName, type OrgNode } from './orgModel';

function focusSibling(el: HTMLElement, dir: 1 | -1) {
  const items = Array.from(
    el.closest('[role="tree"]')?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? [],
  );
  const i = items.indexOf(el);
  const next = items[i + dir];
  if (next) next.focus();
}

export function OrgTreeNode({
  node,
  depth,
  selectedId,
  onSelect,
}: {
  node: OrgNode;
  depth: number;
  selectedId: string | null;
  onSelect: (n: OrgNode) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const expandable = nodeExpandable(node);

  const childrenQuery = useQuery({
    queryKey: ['org-children', node.level, node.publicId],
    queryFn: () => loadChildren(node),
    enabled: expanded && expandable,
  });

  const isSelected = selectedId === node.publicId;
  const badge = nodeBadge(node);

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        if (expandable && !expanded) setExpanded(true);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (expanded) setExpanded(false);
        break;
      case 'ArrowDown':
        e.preventDefault();
        focusSibling(e.currentTarget, 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusSibling(e.currentTarget, -1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        onSelect(node);
        break;
    }
  }

  return (
    <li role="none">
      <div
        role="treeitem"
        aria-selected={isSelected}
        aria-expanded={expandable ? expanded : undefined}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onClick={() => onSelect(node)}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        className={cn(
          'flex cursor-pointer items-center gap-1.5 rounded-md py-1.5 pr-2 text-sm outline-none transition-colors',
          'focus-visible:ring-ring focus-visible:ring-2',
          isSelected ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted',
        )}
      >
        {expandable ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            aria-label={expanded ? 'Collapse' : 'Expand'}
            className="shrink-0 rounded p-0.5 hover:bg-black/5 dark:hover:bg-white/10"
            tabIndex={-1}
          >
            <ChevronRight
              className={cn('size-3.5 transition-transform', expanded && 'rotate-90')}
            />
          </button>
        ) : (
          <span className="w-[18px] shrink-0" />
        )}
        <span className="truncate">{nodeName(node)}</span>
        {badge && (
          <span className="text-muted-foreground ml-auto shrink-0 text-[10px] tabular-nums">
            {badge}
          </span>
        )}
      </div>

      {expanded && expandable && (
        <ul role="group">
          {childrenQuery.isLoading ? (
            <li
              role="none"
              className="text-muted-foreground flex items-center gap-2 py-1.5 text-xs"
              style={{ paddingLeft: `${(depth + 1) * 14 + 26}px` }}
            >
              <Loader2 className="size-3 animate-spin" /> Loading…
            </li>
          ) : (childrenQuery.data ?? []).length === 0 ? (
            <li
              role="none"
              className="text-muted-foreground py-1.5 text-xs"
              style={{ paddingLeft: `${(depth + 1) * 14 + 26}px` }}
            >
              Empty
            </li>
          ) : (
            (childrenQuery.data ?? []).map((child) => (
              <OrgTreeNode
                key={child.publicId}
                node={child}
                depth={depth + 1}
                selectedId={selectedId}
                onSelect={onSelect}
              />
            ))
          )}
        </ul>
      )}
    </li>
  );
}
