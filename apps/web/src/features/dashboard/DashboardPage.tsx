import { Link } from 'react-router-dom';
import { ROLE_LABELS, type SessionUser } from '@exam/types';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { navForRoles } from '@/config/nav';

const DESCRIPTIONS: Record<string, string> = {
  '/org': 'Manage faculties, departments, programs, courses, and offerings.',
  '/students': 'Bulk-import students from Excel and manage rosters.',
  '/exams': 'Create, review, approve, and publish examinations.',
  '/reports': 'Generate mark sheets and export results to Excel or PDF.',
  '/users': 'Manage accounts, roles, and scoped access.',
  '/audit': 'Review the append-only trail of sensitive actions.',
  '/department': 'View your department’s programs, courses, and offerings.',
  '/teachers': 'Assign and reassign teachers to course parts.',
  '/courses': 'View the course parts you are assigned to teach.',
  '/questions': 'Build reusable MCQ and written question banks.',
  '/grading': 'Mark written answers and finalize results.',
  '/my-exams': 'Take your scheduled examinations.',
  '/results': 'View your marks and feedback.',
};

export function DashboardPage({ user }: { user: SessionUser }) {
  const items = navForRoles(user.roles.map((r) => r.role)).filter((i) => i.path !== '/');
  const firstName = user.displayName.split(/\s+/)[0];

  return (
    <div className="space-y-8">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          {user.roles.map((r) => (
            <Badge
              key={`${r.role}-${r.scopeDepartment?.publicId ?? r.scopeFaculty?.publicId ?? 'all'}`}
              variant="primary"
            >
              {ROLE_LABELS[r.role]}
            </Badge>
          ))}
        </div>
        <h2 className="mt-3 text-2xl font-medium">Welcome, {firstName}</h2>
        <p className="text-muted-foreground mt-1">
          Here’s what you can do in the examination system.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className="focus-visible:ring-ring rounded-lg focus-visible:outline-none focus-visible:ring-2"
          >
            <Card className="hover:border-primary/40 h-full transition-colors">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="bg-primary/10 text-primary flex h-10 w-10 items-center justify-center rounded-md">
                    <item.icon className="size-5" />
                  </div>
                </div>
                <h3 className="mt-4 font-medium">{item.label}</h3>
                <p className="text-muted-foreground mt-1 text-sm">
                  {DESCRIPTIONS[item.path] ?? ''}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
