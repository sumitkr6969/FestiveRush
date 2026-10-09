import { Brand } from "./brand";
import { SidebarNav } from "./sidebar-nav";

/** Desktop sidebar. Below `lg` the same nav lives in <MobileNav />. */
export function AppSidebar() {
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r bg-sidebar lg:flex">
      <div className="flex h-16 items-center border-b px-5">
        <Brand />
      </div>
      <SidebarNav />
    </aside>
  );
}
