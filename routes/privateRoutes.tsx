import AttendanceView from "@/components/pages/AttendanceView";
import InvoicePage from "@/components/pages/InvoicePage";
import FinancialSummaryPage from "@/components/pages/FinancialSummaryPage";
import StudentListView from "@/components/pages/StudentListView";
import TeacherListView from "@/components/pages/TeacherListView";
import ClassManagement from "@/components/pages/ClassManagement";
import ClassGradeBook from "@/components/pages/ClassGradeBook";
import RoomManagement from "@/components/pages/RoomManagement";
import TeacherClassView from "@/components/pages/TeacherClassView";
import TeacherAttendance from "@/components/pages/TeacherAttendance";
import AttendanceSession from "@/components/pages/AttendanceSession";
import ClassSessionHistory from "@/components/pages/ClassSessionHistory";
import TeacherSchedule from "@/components/pages/TeacherSchedule";
import AdminSchedule from "@/components/pages/AdminSchedule";
import StudentReportPage from "@/components/pages/StudentReportPage";
import TeacherMonthlyReport from "@/components/pages/TeacherMonthlyReport";
import AdminMonthlyReportReview from "@/components/pages/AdminMonthlyReportReview";
import AdminLayout from "@/layouts/AdminLayout";
import Authoriation from "@/routes/Authoriation";
import { Empty } from "antd/lib";

const privateRoutes = [
  {
    path: "/workspace",
    element: <AdminLayout />,
    children: [
      {
        index: true,
        element: <Empty />,
      },
      {
        path: "invoice",
        element: (
          <Authoriation>
            <InvoicePage />
          </Authoriation>
        ),
      },
      {
        path: "financial-summary",
        element: (
          <Authoriation>
            <FinancialSummaryPage />
          </Authoriation>
        ),
      },
      {
        path: "students",
        element: <StudentListView />,
      },
      {
        path: "teachers",
        element: (
          <Authoriation>
            <TeacherListView />
          </Authoriation>
        ),
      },
      {
        path: "attendance",
        element: <TeacherAttendance />,
      },
      {
        path: "attendance/session/:classId",
        element: <AttendanceSession />,
      },
      {
        path: "attendance/old",
        element: <AttendanceView />,
      },
      {
        path: "classes",
        element: (
          <Authoriation>
            <ClassManagement />
          </Authoriation>
        ),
      },
      {
        path: "rooms",
        element: (
          <Authoriation>
            <RoomManagement />
          </Authoriation>
        ),
      },
      {
        path: "my-classes",
        element: <TeacherClassView />,
      },
      {
        path: "classes/:classId/history",
        element: <ClassSessionHistory />,
      },
      {
        path: "classes/:classId/grades",
        element: <ClassGradeBook />,
      },
      {
        path: "my-schedule",
        element: <TeacherSchedule />,
      },
      {
        path: "admin-schedule",
        element: (
          <Authoriation>
            <AdminSchedule />
          </Authoriation>
        ),
      },
      {
        path: "students/:studentId/report",
        element: <StudentReportPage />,
      },
      {
        path: "monthly-report",
        element: <TeacherMonthlyReport />,
      },
      {
        path: "monthly-report-review",
        element: (
          <Authoriation>
            <AdminMonthlyReportReview />
          </Authoriation>
        ),
      },
    ],
  },
];

export default privateRoutes;
