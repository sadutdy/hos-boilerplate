import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, can, useAuth } from '@/auth/auth-context'
import { ThemeProvider } from '@/components/theme-provider'
import { AppShell } from '@/components/layout/app-shell'
import { ModulePlaceholder } from '@/components/module-placeholder'
import LoginPage from '@/pages/login'
import NotFoundPage from '@/pages/not-found'

const DashboardPage = lazy(() => import('@/pages/dashboard'))
const PatientsPage = lazy(() => import('@/pages/patients'))
const PatientCreatePage = lazy(() => import('@/pages/patient-create'))
const PatientProfilePage = lazy(() => import('@/pages/patient-profile'))
const AppointmentsPage = lazy(() => import('@/pages/appointments'))
const BedsPage = lazy(() => import('@/pages/beds-board'))
const AdmissionsPage = lazy(() => import('@/pages/admissions'))
const AdmissionCreatePage = lazy(() => import('@/pages/admission-create'))
const AdmissionDetailPage = lazy(() => import('@/pages/admission-detail'))
const DoctorsPage = lazy(() => import('@/pages/doctors'))
const DoctorCreatePage = lazy(() => import('@/pages/doctor-create'))
const DoctorProfilePage = lazy(() => import('@/pages/doctor-profile'))
const DepartmentsPage = lazy(() => import('@/pages/departments'))
const ServicesPage = lazy(() => import('@/pages/services'))
const AppointmentCreatePage = lazy(() => import('@/pages/appointment-create'))
const AppointmentEditPage = lazy(() => import('@/pages/appointment-edit'))
const PrescriptionsPage = lazy(() => import('@/pages/prescriptions'))
const PrescriptionCreatePage = lazy(() => import('@/pages/prescription-create'))
const PrescriptionDetailPage = lazy(() => import('@/pages/prescription-detail'))
const MedicinesPage = lazy(() => import('@/pages/medicines'))
const MedicineCategoriesPage = lazy(() => import('@/pages/medicine-categories'))
const LabsPage = lazy(() => import('@/pages/labs'))
const LabCreatePage = lazy(() => import('@/pages/lab-create'))
const LabDetailPage = lazy(() => import('@/pages/lab-detail'))
const LabTestsPage = lazy(() => import('@/pages/lab-tests'))
const PharmacyPage = lazy(() => import('@/pages/pharmacy'))
const PharmacySaleCreatePage = lazy(() => import('@/pages/pharmacy-sale-create'))
const PharmacySaleDetailPage = lazy(() => import('@/pages/pharmacy-sale-detail'))
const BarcodePage = lazy(() => import('@/pages/barcode'))
const InvoicesPage = lazy(() => import('@/pages/invoices'))
const InvoiceCreatePage = lazy(() => import('@/pages/invoice-create'))
const InvoiceDetailPage = lazy(() => import('@/pages/invoice-detail'))
const AccountingPage = lazy(() => import('@/pages/accounting'))
const ReportsPage = lazy(() => import('@/pages/reports'))
const StaffPage = lazy(() => import('@/pages/staff'))
const UsersPage = lazy(() => import('@/pages/users'))

function RequireAuth({ permission, children }: { permission?: string | readonly string[]; children: ReactNode }) {
  const { session } = useAuth()
  const location = useLocation()

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  if (!can(session, permission)) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
        You don’t have permission to view this page.
      </div>
    )
  }
  return <>{children}</>
}

const CommunicationsPage = lazy(() => import('@/pages/communications'))

const modules = [
  { path: '/settings', title: 'Settings', permission: 'settings', specDoc: '01-modules/15-settings.md' },
]

function PlaceholderModule({
  title,
  permission,
  specDoc,
}: {
  title: string
  permission: string
  specDoc: string
}) {
  const { session } = useAuth()
  if (!can(session, permission)) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
        You don’t have permission to view this page.
      </div>
    )
  }
  return (
    <ModulePlaceholder
      title={title}
      description={`Manage ${title.toLowerCase()} — from the HOS-Boilerplate spec.`}
      specDoc={specDoc}
    />
  )
}

function PageFallback() {
  return (
    <div aria-hidden className="flex flex-col gap-5">
      <div className="h-8 w-56 animate-pulse rounded bg-muted" />
      <div className="h-40 animate-pulse rounded-lg bg-muted" />
      <div className="h-32 animate-pulse rounded-lg bg-muted" />
    </div>
  )
}

export function Router() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<AppShell />}>
              <Route
                index
                element={
                  <RequireAuth>
                    <Suspense fallback={<div className="h-24 animate-pulse rounded-lg bg-muted" />}>
                      <DashboardPage />
                    </Suspense>
                  </RequireAuth>
                }
              />
              <Route
                path="/patients"
                element={
                  <RequireAuth permission="patient_view">
                    <Suspense fallback={<PageFallback />}>
                      <PatientsPage />
                    </Suspense>
                  </RequireAuth>
                }
              />
              <Route
                path="/invoices"
                element={
                  <RequireAuth permission="invoice_view">
                    <Suspense fallback={<PageFallback />}>
                      <InvoicesPage />
                    </Suspense>
                  </RequireAuth>
                }
              />
              <Route
                path="/invoices/create"
                element={
                  <RequireAuth permission="payment_add">
                    <Suspense fallback={<PageFallback />}>
                      <InvoiceCreatePage />
                    </Suspense>
                  </RequireAuth>
                }
              />
              <Route
                path="/invoices/:id"
                element={
                  <RequireAuth permission="invoice_view">
                    <Suspense fallback={<PageFallback />}>
                      <InvoiceDetailPage />
                    </Suspense>
                  </RequireAuth>
                }
              />
              <Route
                path="/accounting"
                element={
                  <RequireAuth permission="accounting">
                    <Suspense fallback={<PageFallback />}>
                      <AccountingPage />
                    </Suspense>
                  </RequireAuth>
                }
              />
              <Route
                path="/reports"
                element={
                  <RequireAuth>
                    <Suspense fallback={<PageFallback />}>
                      <ReportsPage />
                    </Suspense>
                  </RequireAuth>
                }
              />
              <Route
                path="/users"
                element={
                  <RequireAuth permission="users">
                    <Suspense fallback={<PageFallback />}>
                      <UsersPage />
                    </Suspense>
                  </RequireAuth>
                }
              />
              <Route
                path="/staff"
                element={
                  <RequireAuth>
                    <Suspense fallback={<PageFallback />}>
                      <StaffPage />
                    </Suspense>
                  </RequireAuth>
                }
              />
              <Route
                path="/staff/:type"
                element={
                  <RequireAuth>
                    <Suspense fallback={<PageFallback />}>
                      <StaffPage />
                    </Suspense>
                  </RequireAuth>
                }
              />
              <Route
                path="/appointments"
                element={
                  <RequireAuth permission="appointment_view">
                    <Suspense fallback={<PageFallback />}>
                      <AppointmentsPage />
                    </Suspense>
                  </RequireAuth>
                }
              />
              <Route
                path="/beds"
                element={
                  <RequireAuth permission="bed_view">
                    <Suspense fallback={<PageFallback />}>
                      <BedsPage />
                    </Suspense>
                  </RequireAuth>
                }
              />
              <Route
                path="/admissions"
                element={
                  <RequireAuth permission="admission_view">
                    <Suspense fallback={<PageFallback />}>
                      <AdmissionsPage />
                    </Suspense>
                  </RequireAuth>
                }
              />
              <Route
                path="/admissions/create"
                element={
                  <RequireAuth permission="admission_add">
                    <Suspense fallback={<PageFallback />}>
                      <AdmissionCreatePage />
                    </Suspense>
                  </RequireAuth>
                }
              />
              <Route
                path="/admissions/:id"
                element={
                  <RequireAuth permission="admission_view">
                    <Suspense fallback={<PageFallback />}>
                      <AdmissionDetailPage />
                    </Suspense>
                  </RequireAuth>
                }
              />
              <Route
                path="/appointments/create"
                element={
                  <RequireAuth permission="appointment_add">
                    <Suspense fallback={<PageFallback />}>
                      <AppointmentCreatePage />
                    </Suspense>
                  </RequireAuth>
                }
              />
              <Route
                path="/appointments/:id/edit"
                element={
                  <RequireAuth permission="appointment_update">
                    <Suspense fallback={<PageFallback />}>
                      <AppointmentEditPage />
                    </Suspense>
                  </RequireAuth>
                }
              />
              <Route
                path="/doctors"
                element={
                  <RequireAuth permission="doctor_view">
                    <Suspense fallback={<PageFallback />}>
                      <DoctorsPage />
                    </Suspense>
                  </RequireAuth>
                }
              />
              <Route
                path="/doctors/create"
                element={
                  <RequireAuth permission="doctor_add">
                    <Suspense fallback={<PageFallback />}>
                      <DoctorCreatePage />
                    </Suspense>
                  </RequireAuth>
                }
              />
              <Route
                path="/doctors/:id"
                element={
                  <RequireAuth permission="doctor_view">
                    <Suspense fallback={<PageFallback />}>
                      <DoctorProfilePage />
                    </Suspense>
                  </RequireAuth>
                }
              />
              <Route
                path="/departments"
                element={
                  <RequireAuth permission="department_view">
                    <Suspense fallback={<PageFallback />}>
                      <DepartmentsPage />
                    </Suspense>
                  </RequireAuth>
                }
              />
              <Route
                path="/services"
                element={
                  <RequireAuth permission="service_view">
                    <Suspense fallback={<PageFallback />}>
                      <ServicesPage />
                    </Suspense>
                  </RequireAuth>
                }
              />
              <Route
                path="/patients/create"
                element={
                  <RequireAuth permission="patient_add">
                    <Suspense fallback={<PageFallback />}>
                      <PatientCreatePage />
                    </Suspense>
                  </RequireAuth>
                }
              />
              <Route
                path="/patients/:id"
                element={
                  <RequireAuth permission="patient_view">
                    <Suspense fallback={<PageFallback />}>
                      <PatientProfilePage />
                    </Suspense>
                  </RequireAuth>
                }
              />
              <Route
                path="/prescriptions"
                element={
                  <RequireAuth permission="prescription_view">
                    <Suspense fallback={<PageFallback />}>
                      <PrescriptionsPage />
                    </Suspense>
                  </RequireAuth>
                }
              />
              <Route
                path="/prescriptions/create"
                element={
                  <RequireAuth permission="prescription_add">
                    <Suspense fallback={<PageFallback />}>
                      <PrescriptionCreatePage />
                    </Suspense>
                  </RequireAuth>
                }
              />
              <Route
                path="/prescriptions/:id"
                element={
                  <RequireAuth permission="prescription_view">
                    <Suspense fallback={<PageFallback />}>
                      <PrescriptionDetailPage />
                    </Suspense>
                  </RequireAuth>
                }
              />
              <Route
                path="/medicines"
                element={
                  <RequireAuth permission="medicine_view">
                    <Suspense fallback={<PageFallback />}>
                      <MedicinesPage />
                    </Suspense>
                  </RequireAuth>
                }
              />
              <Route
                path="/medicine-categories"
                element={
                  <RequireAuth permission="medicine_view">
                    <Suspense fallback={<PageFallback />}>
                      <MedicineCategoriesPage />
                    </Suspense>
                  </RequireAuth>
                }
              />
              <Route
                path="/laboratory"
                element={
                  <RequireAuth permission="lab_test_view">
                    <Suspense fallback={<PageFallback />}>
                      <LabsPage />
                    </Suspense>
                  </RequireAuth>
                }
              />
              <Route
                path="/laboratory/create"
                element={
                  <RequireAuth permission="lab_test_add">
                    <Suspense fallback={<PageFallback />}>
                      <LabCreatePage />
                    </Suspense>
                  </RequireAuth>
                }
              />
              <Route
                path="/laboratory/:id"
                element={
                  <RequireAuth permission="lab_test_view">
                    <Suspense fallback={<PageFallback />}>
                      <LabDetailPage />
                    </Suspense>
                  </RequireAuth>
                }
              />
              <Route
                path="/lab-tests"
                element={
                  <RequireAuth permission="lab_test_view">
                    <Suspense fallback={<PageFallback />}>
                      <LabTestsPage />
                    </Suspense>
                  </RequireAuth>
                }
              />
              <Route
                path="/pharmacy"
                element={
                  <RequireAuth permission="pharmacy_stock_view">
                    <Suspense fallback={<PageFallback />}>
                      <PharmacyPage />
                    </Suspense>
                  </RequireAuth>
                }
              />
              <Route
                path="/pharmacy/new"
                element={
                  <RequireAuth permission="pharmacy_sale">
                    <Suspense fallback={<PageFallback />}>
                      <PharmacySaleCreatePage />
                    </Suspense>
                  </RequireAuth>
                }
              />
              <Route
                path="/pharmacy/:id"
                element={
                  <RequireAuth permission="pharmacy_stock_view">
                    <Suspense fallback={<PageFallback />}>
                      <PharmacySaleDetailPage />
                    </Suspense>
                  </RequireAuth>
                }
              />
              <Route
                path="/barcode"
                element={
                  <RequireAuth permission="pharmacy_stock_view">
                    <Suspense fallback={<PageFallback />}>
                      <BarcodePage />
                    </Suspense>
                  </RequireAuth>
                }
              />
              <Route
                path="/communications"
                element={
                  <RequireAuth permission={['send_sms/voice', 'send_notification', 'view_sms_voice_reports']}>
                    <Suspense fallback={<PageFallback />}>
                      <CommunicationsPage />
                    </Suspense>
                  </RequireAuth>
                }
              />
              {modules.map((m) => (
                <Route
                  key={m.path}
                  path={m.path}
                  element={
                    <Suspense fallback={<div className="h-24 animate-pulse rounded-lg bg-muted" />}>
                      <PlaceholderModule
                        title={m.title}
                        permission={m.permission}
                        specDoc={m.specDoc}
                      />
                    </Suspense>
                  }
                />
              ))}
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}
