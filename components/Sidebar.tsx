import {
  IconChartBar,
  IconDashboard,
  IconDatabase,
  IconFolder,
  IconListDetails,
  IconReport,
  IconTags,
  IconUsers,
  IconCalendar,
  IconReceipt,
  IconSchool,
  IconCurrencyDollar,
  IconFileReport,
  IconChecklist,
} from "@tabler/icons-react";
import * as React from "react";
import { NavDocuments } from "@/components/NavDocument";
import { NavMain } from "@/components/NavMain";
import { NavUser } from "@/components/NavUser";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { UserCheck } from "lucide-react";

const data = {
  navMain: [
    {
      title: "Lịch tổng hợp",
      url: "/workspace/admin-schedule",
      icon: IconCalendar,
      adminOnly: true,
    },
    {
      title: "Lịch dạy",
      url: "/workspace/my-schedule",
      icon: IconCalendar,
      teacherOnly: true,
    },
    {
      title: "Hóa đơn",
      url: "/workspace/invoice",
      icon: IconReceipt,
      adminOnly: true,
    },
    {
      title: "Tổng hợp tài chính",
      url: "/workspace/financial-summary",
      icon: IconCurrencyDollar,
      adminOnly: true,
    },
    {
      title: "Học sinh",
      url: "/workspace/students",
      icon: IconUsers,
    },
    {
      title: "Giáo viên",
      url: "/workspace/teachers",
      icon: UserCheck,
      adminOnly: true,
    },
    {
      title: "Điểm danh",
      url: "/workspace/attendance",
      icon: IconListDetails,
    },
    {
      title: "Quản lý lớp học",
      url: "/workspace/classes",
      icon: IconSchool,
      adminOnly: true,
    },
    {
      title: "Quản lý phòng học",
      url: "/workspace/rooms",
      icon: IconTags,
      adminOnly: true,
    },
    {
      title: "Lớp học của tôi",
      url: "/workspace/my-classes",
      icon: IconSchool,
      teacherOnly: true,
    },
    {
      title: "Báo cáo tháng",
      url: "/workspace/monthly-report",
      icon: IconFileReport,
      teacherOnly: true,
    },
    {
      title: "Duyệt báo cáo",
      url: "/workspace/monthly-report-review",
      icon: IconChecklist,
      adminOnly: true,
    },
  ],

  documents: [],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { userProfile } = useAuth();
  const isAdmin = React.useMemo(() => {
    const adminStatus =
      userProfile?.isAdmin === true || userProfile?.role === "admin";
    console.log("Sidebar - User Profile:", {
      email: userProfile?.email,
      role: userProfile?.role,
      isAdmin: userProfile?.isAdmin,
      position: userProfile?.position,
      calculatedIsAdmin: adminStatus,
    });
    return adminStatus;
  }, [userProfile]);

  const user = {
    name: userProfile?.displayName || userProfile?.email || "",
    email: userProfile?.email || "",
    avatar: "",
  };

  const menu = data.navMain.filter((item) => {
    // Admin-only items: show only to admins
    if (item.adminOnly && !isAdmin) {
      return false;
    }
    // Teacher-only items: show only to non-admins (teachers)
    if (item.teacherOnly && isAdmin) {
      return false;
    }
    return true;
  });
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarContent>
        <NavMain items={menu} />
        <NavDocuments items={data.documents} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
