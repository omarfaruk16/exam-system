import {
  BarChart3,
  BookOpen,
  Building2,
  ListChecks,
  Loader2,
  ScrollText,
  Upload,
  Users,
} from 'lucide-react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { ChangePasswordPage } from '@/features/auth/ChangePasswordPage';
import { LoginPage } from '@/features/auth/LoginPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { DevShowcase } from '@/features/exam-taking/DevShowcase';
import { ExamTakingPage } from '@/features/exam-taking/ExamTakingPage';
import { MyExamsPage } from '@/features/student/MyExamsPage';
import { ExamListPage } from '@/features/authoring/ExamListPage';
import { ExamFormPage } from '@/features/authoring/ExamFormPage';
import { ExamBuilderPage } from '@/features/authoring/ExamBuilderPage';
import { GradingExamsPage } from '@/features/teacher/GradingExamsPage';
import { GradingWorkspace } from '@/features/teacher/GradingWorkspace';
import { ResultPage } from '@/features/student/ResultPage';
import { OrgLayout } from '@/features/org/OrgLayout';
import { OrgStructurePage } from '@/features/org/OrgStructurePage';
import { TermsPage } from '@/features/org/TermsPage';
import { OfferingsPage } from '@/features/org/OfferingsPage';
import { ReviewQueuePage } from '@/features/review/ReviewQueuePage';
import { ReviewDetailPage } from '@/features/review/ReviewDetailPage';
import { ReportsPage } from '@/features/reports/ReportsPage';
import { NotFoundPage } from '@/features/misc/NotFoundPage';
import { PlaceholderPage } from '@/features/misc/PlaceholderPage';
import { useSession } from '@/lib/session';

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="text-muted-foreground size-6 animate-spin" />
    </div>
  );
}

export function App() {
  const { data: user, isLoading } = useSession();

  if (isLoading) return <FullScreenLoader />;

  // Unauthenticated: only the login screen.
  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  // Forced first-login password change gates everything else.
  if (user.mustChangePassword) {
    return (
      <Routes>
        <Route path="/change-password" element={<ChangePasswordPage />} />
        <Route path="*" element={<Navigate to="/change-password" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/change-password" element={<ChangePasswordPage />} />
      {/* Distraction-free, full-screen — deliberately outside the app shell (no sidebar). */}
      <Route path="/exam/:examPublicId" element={<ExamTakingPage />} />
      {import.meta.env.DEV && <Route path="/dev/exam-ui" element={<DevShowcase />} />}
      <Route element={<AppShell user={user} />}>
        <Route path="/" element={<DashboardPage user={user} />} />
        <Route path="/org" element={<OrgLayout />}>
          <Route index element={<OrgStructurePage />} />
          <Route path="terms" element={<TermsPage />} />
          <Route path="offerings" element={<OfferingsPage />} />
        </Route>
        <Route path="/review" element={<ReviewQueuePage />} />
        <Route path="/review/:examPublicId" element={<ReviewDetailPage />} />
        <Route
          path="/students"
          element={
            <PlaceholderPage
              title="Students"
              phase={2}
              icon={Upload}
              description="Bulk student import from Excel. The import API and worker are ready; the admin UI ships with the organization module in Phase 2."
            />
          }
        />
        <Route path="/exams" element={<ExamListPage />} />
        <Route path="/exams/new" element={<ExamFormPage />} />
        <Route path="/exams/:examPublicId/edit" element={<ExamFormPage />} />
        <Route path="/exams/:examPublicId/build" element={<ExamBuilderPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/users" element={<PlaceholderPage title="Users" phase={2} icon={Users} />} />
        <Route
          path="/audit"
          element={<PlaceholderPage title="Audit Log" phase={2} icon={ScrollText} />}
        />
        <Route
          path="/department"
          element={<PlaceholderPage title="Department" phase={2} icon={Building2} />}
        />
        <Route
          path="/teachers"
          element={<PlaceholderPage title="Teachers" phase={2} icon={Users} />}
        />
        <Route
          path="/courses"
          element={<PlaceholderPage title="My Courses" phase={2} icon={BookOpen} />}
        />
        <Route
          path="/questions"
          element={<PlaceholderPage title="Question Bank" phase={3} icon={ListChecks} />}
        />
        <Route path="/grading" element={<GradingExamsPage />} />
        <Route path="/grading/:examPublicId" element={<GradingWorkspace />} />
        <Route path="/my-exams" element={<MyExamsPage />} />
        <Route path="/results/:attemptPublicId" element={<ResultPage />} />
        <Route
          path="/results"
          element={<PlaceholderPage title="Results" phase={5} icon={BarChart3} />}
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
