import type { ComponentType } from 'react'
import {
  CalendarClock,
  Building,
  ClipboardList,
  Contact,
  CreditCard,
  FileText,
  FlaskConical,
  Barcode,
  LayoutDashboard,
  MessageSquare,
  Package,
  Pill,
  Receipt,
  Settings,
  Stethoscope,
  Tags,
  TestTube,
  Users,
  UsersRound,
} from 'lucide-react'

export interface NavItem {
  label: string
  to: string
  icon: ComponentType<{ className?: string }>
  /**
   * Permission key required to see/open this item. Keys here mirror the
   * module map (rebuild-spec README §2) until the real catalogue from
   * 02-database-schema.md §14 arrives via GET /auth/bootstrap.
   * A list means any one of the keys is enough.
   */
  permission?: string | readonly string[]
}

export interface NavGroup {
  heading: string
  items: NavItem[]
}

export const navGroups: NavGroup[] = [
  {
    heading: 'Overview',
    items: [
      { label: 'Dashboard', to: '/', icon: LayoutDashboard },
    ],
  },
  {
    heading: 'Front desk',
    items: [
      { label: 'Patients', to: '/patients', icon: Users, permission: 'patient_view' },
      { label: 'Appointments', to: '/appointments', icon: CalendarClock, permission: 'appointment_view' },
      { label: 'Beds & admissions', to: '/beds', icon: Contact, permission: 'bed_view' },
    ],
  },
  {
    heading: 'Clinical',
    items: [
      { label: 'Doctors', to: '/doctors', icon: Stethoscope, permission: 'doctor_view' },
      { label: 'Departments', to: '/departments', icon: Building, permission: 'department_view' },
      { label: 'Services', to: '/services', icon: Tags, permission: 'service_view' },
      { label: 'Prescriptions', to: '/prescriptions', icon: ClipboardList, permission: 'prescription_view' },
      { label: 'Medicines', to: '/medicines', icon: Pill, permission: 'medicine_view' },
      { label: 'Laboratory', to: '/laboratory', icon: FlaskConical, permission: 'lab_test_view' },
      { label: 'Lab tests', to: '/lab-tests', icon: TestTube, permission: 'lab_test_view' },
      { label: 'Barcode sheet', to: '/barcode', icon: Barcode, permission: 'pharmacy_stock_view' },
      { label: 'Pharmacy', to: '/pharmacy', icon: Package, permission: 'pharmacy_stock_view' },
    ],
  },
  {
    heading: 'Finance',
    items: [
      { label: 'Invoices', to: '/invoices', icon: Receipt, permission: 'invoices' },
      { label: 'Accounting', to: '/accounting', icon: CreditCard, permission: 'accounting' },
      { label: 'Reports', to: '/reports', icon: FileText, permission: 'reports' },
    ],
  },
  {
    heading: 'Administration',
    items: [
      { label: 'Staff', to: '/staff', icon: UsersRound, permission: 'staff' },
      { label: 'Users & permissions', to: '/users', icon: Users, permission: 'users' },
      { label: 'Communications', to: '/communications', icon: MessageSquare, permission: ['send_sms/voice', 'send_notification', 'view_sms_voice_reports'] },
      { label: 'Settings', to: '/settings', icon: Settings, permission: 'settings' },
    ],
  },
]
