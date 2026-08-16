import { Hammer, type LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface PlaceholderPageProps {
  title: string;
  icon?: LucideIcon;
  description?: string;
}

export function PlaceholderPage({ title, icon: Icon = Hammer, description }: PlaceholderPageProps) {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-medium">{title}</h2>
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <div className="bg-muted text-muted-foreground flex h-12 w-12 items-center justify-center rounded-full">
            <Icon className="size-6" />
          </div>
          <div>
            <p className="font-medium">This section is being built</p>
            <p className="text-muted-foreground mx-auto mt-1 max-w-md text-sm">
              {description ?? `${title} will be available soon.`}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
