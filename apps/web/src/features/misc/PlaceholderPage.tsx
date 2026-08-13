import { Hammer, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

interface PlaceholderPageProps {
  title: string;
  phase: number;
  icon?: LucideIcon;
  description?: string;
}

export function PlaceholderPage({
  title,
  phase,
  icon: Icon = Hammer,
  description,
}: PlaceholderPageProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h2 className="text-2xl font-medium">{title}</h2>
        <Badge variant="neutral">Phase {phase}</Badge>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <div className="bg-muted text-muted-foreground flex h-12 w-12 items-center justify-center rounded-full">
            <Icon className="size-6" />
          </div>
          <div>
            <p className="font-medium">This section is being built</p>
            <p className="text-muted-foreground mx-auto mt-1 max-w-md text-sm">
              {description ?? `${title} becomes available in Phase ${phase} of the rollout.`}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
