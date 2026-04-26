import * as React from 'react';
import { cn } from '@/lib/utils';

const Sidebar = React.forwardRef(({ className, collapsed = false, ...props }, ref) => (
  <aside
    ref={ref}
    className={cn('sidebar', collapsed && 'sidebar-collapsed', className)}
    data-collapsed={collapsed ? 'true' : 'false'}
    {...props}
  />
));
Sidebar.displayName = 'Sidebar';

const SidebarHeader = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('sidebar-header', className)} {...props} />
));
SidebarHeader.displayName = 'SidebarHeader';

const SidebarContent = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('sidebar-content', className)} {...props} />
));
SidebarContent.displayName = 'SidebarContent';

const SidebarFooter = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('sidebar-footer', className)} {...props} />
));
SidebarFooter.displayName = 'SidebarFooter';

const SidebarSection = React.forwardRef(({ className, ...props }, ref) => (
  <section ref={ref} className={cn('sidebar-section', className)} {...props} />
));
SidebarSection.displayName = 'SidebarSection';

export { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarSection };
