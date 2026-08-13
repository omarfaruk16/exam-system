import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <p className="text-muted-foreground text-5xl font-medium">404</p>
      <div>
        <p className="font-medium">Page not found</p>
        <p className="text-muted-foreground mt-1 text-sm">
          The page you’re looking for doesn’t exist or has moved.
        </p>
      </div>
      <Button asChild variant="outline">
        <Link to="/">Back to dashboard</Link>
      </Button>
    </div>
  );
}
