export interface Patient {
  _id: string
  patientId: string
  name: string
  fatherName?: string
  phone?: string
  email?: string
  address?: string
  sex?: 'male' | 'female' | 'other' | ''
  dateOfBirth?: string | null
  age?: number | null
  bloodGroup?: string
  doctorName?: string
  imgUrl?: string
  addDate?: string
  registrationTime?: string
}

export interface MedicalHistoryEntry {
  _id: string
  patientId: string
  title: string
  description: string
  date?: string | null
  imgUrl?: string
  patientName?: string
  patientAddress?: string
  patientPhone?: string
  registrationTime?: string
}

export interface PatientDetail {
  patient: Patient
  history: MedicalHistoryEntry[]
}

export interface ListResponse<T> {
  items: T[]
  total: number
}

export type CommsChannel = 'sms' | 'voice'

export interface MessageTemplate {
  _id: string
  name: string
  channel: CommsChannel | null
  text?: string
  /** Set once an 8 kHz mono .wav recording has been uploaded. */
  mediaPath?: string
  createdBy?: string
}

export interface NotificationType {
  _id?: string
  key: 'appointment' | 'payment'
  channel: CommsChannel
  enabled: boolean
  defaultText?: string
  templateId?: string | null
  /** Daily send time 'HH:MM' in the hospital timezone; '' = only run by hand. */
  time: string
  /** Text used when neither defaultText nor a template text is set. */
  fallbackText: string
}

export interface NotificationTypesResponse {
  items: NotificationType[]
  timezone: string
}

/** Result of a broadcast or a reminder run. `skipped` = nothing was sent, with the reason. */
export interface SendResult {
  status: 'done' | 'skipped'
  reason?: string
  provider?: string
  style?: 'quick' | 'campaign'
  contacts: number
  sent: number
  failed: number
  invalid: { phone: string; name?: string; reason: string }[]
  errors?: string[]
  date?: string
  appointments?: number
  patients?: number
  alreadyReminded?: number
}

export interface CommsLogsResponse {
  items: CommsLog[]
  total: number
  counts: Partial<Record<CommsLog['status'], number>>
}

export interface CommsLog {
  _id: string
  type: 'sms' | 'voice' | 'email'
  key: 'appointment' | 'payment' | 'broadcast' | 'otp'
  recipient: string
  recipientPatientId?: string
  patientName?: string | null
  message: string
  provider: string
  providerRef?: string
  status: 'queued' | 'sent' | 'failed'
  error?: string
  createdAt: string
  updatedAt: string
}

export type AppointmentStatus =
  | 'scheduled'
  | 'arrived'
  | 'completed'
  | 'cancelled'
  | 'no show'

export interface AppointmentVitals {
  bloodPressure?: string
  pulse?: string
  temperature?: string
  weight?: string
}

export interface Appointment {
  _id: string
  patientId: string
  doctorId: string
  date: string
  startDateTime: string
  endDateTime: string
  minutes: number
  timeSlot: string
  status: AppointmentStatus
  remarks?: string
  vitals?: AppointmentVitals
  /** resolved by GET endpoints */
  patientName?: string
  doctorName?: string
  addDate?: string
}

export interface DoctorRef {
  _id: string
  name: string
  department?: string
  specialist?: string
}

export interface Doctor extends DoctorRef {
  email?: string
  phone?: string
  address?: string
  imgUrl?: string
  /** aggregated projection on list endpoints */
  upcomingAppointments?: number
}

export interface Department {
  _id: string
  name: string
  description?: string
}

export interface DepartmentsResponse {
  items: Department[]
  usage: { id: string; name: string; doctors: number }[]
  unlisted: string[]
}

export interface Service {
  _id: string
  name: string
  description?: string
  price: string | null
  type?: string
  dCommission?: number | null
  hCommission?: number | null
}

export interface ServicesResponse {
  items: Service[]
  types: string[]
  usage: { id: string; name: string; invoices: number }[]
}

export interface PrescriptionItem {
  medicineId?: string | null
  name: string
  dosage?: string | null
  duration?: string | null
  instructions?: string | null
}

export interface Prescription {
  _id: string
  patientId: string
  doctorId: string
  date: string
  symptom?: string | null
  advice?: string | null
  note?: string | null
  validity?: string | null
  items: PrescriptionItem[]
  summary?: string | null
  state?: string
  createdBy?: string | null
  /** resolved on GET /prescriptions/:id */
  patientName?: string
  patientCode?: string
  doctorName?: string
}

export interface PrescriptionsResponse {
  items: Prescription[]
  patientNames: Record<string, string>
  doctorNames: Record<string, string>
  total: number
}

export interface OnDrugResponse {
  items: {
    prescriptionId: string
    date: string
    patientId: string
    patientName: string
    patientCode: string
    onThisDrug: PrescriptionItem[]
  }[]
}

export interface Medicine {
  _id: string
  name: string
  categoryId?: string | null
  generic?: string
  company?: string
  effects?: string
  box?: string
  price?: string | null
  sellingPrice?: string | null
  quantity: number
  expiryDate?: string | null
  addDate?: string
}

export interface MedicineCategory {
  _id: string
  name: string
  description?: string
}

export interface MedicineCategoriesResponse {
  items: MedicineCategory[]
  usage: { id: string; medicines: number }[]
}

export interface LabCategory {
  _id: string
  name: string
  description?: string | null
  referenceValue?: string | null
}

export interface LabCategoriesResponse {
  items: LabCategory[]
  usage: { id: string; requests: number }[]
}

export interface LabTest {
  labCategoryId: string | null
  _id: string
  name: string
  referenceValue?: string | null
  result: string | null
  status: 'requested' | 'reported'
  reportedAt?: string | null
}

export interface Lab {
  _id: string
  patientId: string
  doctorId?: string | null
  date: string
  tests: LabTest[]
  status: 'requested' | 'partial' | 'reported'
  reportedAt?: string | null
  patientName: string
  patientPhone?: string | null
  patientAddress?: string | null
  doctorName?: string | null
  /** resolved on GET /labs/:id */
  patientCode?: string
  requestUserId?: string
}

export interface LabsResponse {
  items: Lab[]
  patientNames: Record<string, string>
  total: number
}

export interface SaleItem {
  medicineId?: string | null
  name: string
  quantity: number
  unitPrice?: string | null
  lineTotal?: string | null
}

export interface PharmacySale {
  _id: string
  patientId?: string | null
  date: string
  items: SaleItem[]
  amount?: string
  discount?: string
  vat?: string
  grossTotal?: string
  amountReceived?: string
  status?: string
  saleUserId?: string
  /** resolved on GET /pharmacy-sales/:id */
  patientName?: string
  patientCode?: string
}

export interface SalesResponse {
  items: PharmacySale[]
  total: number
  takings: string
}

export interface SaleCreateData {
  medicines: Medicine[]
  prescription: Prescription | null
  patient: { _id: string; name: string; patientId: string } | null
}

export type BedStatus = 'free' | 'occupied'

export interface BedOccupancy {
  admissionId: string
  patientName: string
  since: string
}

export interface Bed {
  _id: string
  wardId: string
  number: string
  description?: string
  status: BedStatus
  wardName: string
  occupied: boolean
  occupancy: BedOccupancy | null
  lastAdmittedAt?: string
  lastDischargedAt?: string
}

export interface BedCategory {
  _id: string
  name: string
  description?: string
}

export interface BedsBoard {
  beds: Bed[]
  categories: BedCategory[]
  freeCount: number
  totalCount: number
}

export type AdmissionStatus = 'admitted' | 'discharged'

export interface Admission {
  _id: string
  patientId: string
  bedId: string
  number: string
  wardId: string
  admittedAt: string
  dTime: string | null
  status: AdmissionStatus
  createdBy?: string
  /** resolved by GET endpoints */
  patientName?: string
  patientCode?: string
  bedNumber?: string
  wardName?: string
  admissionNumber?: string
}

export interface AdmissionCreateData {
  patients: { _id: string; name: string; patientId: string }[]
  beds: { id: string; number: string; wardName: string }[]
}

export interface InvoiceItem {
  serviceId?: string | null
  name: string
  quantity: number
  unitPrice: string
  lineTotal: string
}

export interface InvoicePayment {
  _id: string
  invoiceId: string
  amount: string
  method?: string | null
  reference?: string | null
  paidAt: string
}

export interface Invoice {
  _id: string
  patientId: string
  patientName: string
  patientPhone?: string
  patientAddress?: string
  doctorId?: string | null
  doctorName?: string
  date: string
  items: InvoiceItem[]
  amount: string
  discount: string
  vat: string
  grossTotal: string
  remarks?: string
  depositType?: string
  createdBy?: string
  paid?: string
  balance?: string
  settlement?: 'unpaid' | 'part paid' | 'paid'
  payments?: InvoicePayment[]
}

export interface InvoicesResponse {
  items: Invoice[]
  total: number
  owed: string
}

export interface InvoiceCreateData {
  patients: { _id: string; name: string; patientId: string }[]
  doctors: { _id: string; name: string }[]
  services: { _id: string; name: string; price: string | null }[]
  patient?: { _id: string; name: string; patientId: string } | null
}

export interface AccountSector {
  _id: string
  name: string
  type: 'income' | 'expense'
}

export interface LedgerEntry {
  _id: string
  sectorId: string
  sectorName: string
  type: 'income' | 'expense'
  amount: string
  date: string
  description?: string
  createdBy?: string
}

export interface LedgerEntriesResponse {
  items: LedgerEntry[]
  total: number
  total_amount: string
}

export interface AccountingSettings {
  _id: string
  companyId: string
  apiLink: string
  username: string
  password?: string
  passwordConfigured?: boolean
}

export interface BillingTotals {
  charged: number
  chargedCount: number
  depositCharged: number
  depositCount: number
  paid: number
  due: number
}

export interface ReportSummary {
  income: string
  expense: string
  billing: BillingTotals
  totalIncome: string
  balance: string
}

export interface TypeReport {
  type: 'income' | 'expense'
  entries: LedgerEntry[]
  total: string
  billing?: BillingTotals
}

export interface BatchEntryInput {
  sectorId: string
  amount: number | string
  date: string
  description?: string
}

export interface ReportCard {
  key: string
  path: string
  permission: string | null
  title: string
}

export interface LabReportItem {
  labId: string
  testId: string
  test: string
  requestedOn: string
  patientId: string
  patientName: string
  patientCode: string
  days: number
}

export interface LabReport {
  items: LabReportItem[]
  overdue: number
  byTest: { test: string; count: number }[]
}

export interface DrugUsageItem {
  name: string
  prescribed: number
  dispensed: number
  value: string
}

export interface DrugUsageReport {
  from: string
  to: string
  items: DrugUsageItem[]
  totalValue: string
}

export interface DebtorItem {
  patientId: string
  invoices: number
  owed: string
  oldest: string
  days: number
  patientName: string
  patientCode: string
  phone?: string
}

export interface DebtorsReport {
  items: DebtorItem[]
  buckets: Record<string, string>
  total: string
}

export interface OccupancySeriesItem {
  date: string
  occupied: number
  percent: number
}

export interface OccupancyReport {
  from: string
  to: string
  totalBeds: number
  currentlyOccupied: number
  discharges: number
  averageStay: string
  averageStayDays: number
  peak: number
  byWard: { ward: string; count: number }[]
  series: OccupancySeriesItem[]
}

export type StaffType = 'nurse' | 'pharmacist' | 'laboratorist' | 'receptionist' | 'accountant'

export interface StaffMember {
  _id: string
  type: StaffType
  name: string
  email?: string
  phone?: string
  address?: string
  imgUrl?: string
}

export interface StaffListResponse {
  items: StaffMember[]
  total: number
}

export interface StaffCreateInput {
  name: string
  email?: string
  phone?: string
  address?: string
  imgUrl?: string
}

export type UserRole = 'admin' | 'doctor' | 'nurse' | 'pharmacist' | 'laboratorist' | 'accountant' | 'receptionist' | 'patient'

export interface User {
  _id: string
  firstName: string
  lastName: string
  login: string
  email: string
  role: UserRole
  phone?: string
  about?: string
  addDate?: string
}

export interface UsersResponse {
  items: User[]
  total: number
}

export interface UserCreateInput {
  firstName: string
  lastName: string
  login: string
  email: string
  role: UserRole
  phone?: string
  about?: string
  password: string
}

export interface UserUpdateInput {
  firstName?: string
  lastName?: string
  login?: string
  email?: string
  role?: UserRole
  phone?: string
  about?: string
  password?: string
}

export interface PermissionGroup {
  group: string
  keys: string[]
}

export interface RolePermissions {
  role: string
  keys: string[]
}

export interface ActivityLogEntry {
  _id: string
  description: string
  details?: string
  userType: 'registered' | 'guest' | 'crawler'
  userId?: string
  userName?: string
  ip?: string
  userAgent?: string
  locale?: string
  referer?: string
  method?: string
  route?: string
  rel?: { model: string; id: string }
  deletedAt?: string
  createdAt: string
}

export interface ActivityLogsResponse {
  items: ActivityLogEntry[]
  total: number
}

export interface AuthResponse {
  user: {
    id: string
    login: string
    name: string
    role: UserRole
    phone?: string | null
  }
  token: string
  hospitalName?: string | null
  needsInstitute?: boolean
  permissions?: string[]
}

export const PERMISSION_ROLES = ['admin', 'doctor', 'nurse', 'pharmacist', 'laboratorist', 'accountant', 'receptionist'] as const
export const PERMISSION_GROUPS = {
  patients: ['patient_view', 'patient_add', 'patient_update', 'patient_delete', 'patient_medical_history', 'patient_portal_access', 'patient_bulk_add'],
  appointments: ['appointment_view', 'appointment_add', 'appointment_update', 'appointment_cancel', 'appointment_calendar', 'view_appointment_reports'],
  admissions: ['admission_view', 'admission_add', 'admission_discharge', 'bed_view', 'bed_allot', 'bed_release', 'ward_view', 'ward_add', 'ward_update', 'ward_delete'],
  clinical: ['prescription_view', 'prescription_add', 'prescription_update', 'prescription_delete', 'lab_test_view', 'lab_test_add', 'lab_test_update', 'lab_test_delete', 'diagnostic_report_view', 'diagnostic_report_add', 'operation_theatre_view', 'operation_theatre_schedule'],
  pharmacy: ['medicine_view', 'medicine_add', 'medicine_update', 'medicine_delete', 'pharmacy_sale', 'pharmacy_stock_view', 'view_pharmacy_reports'],
  staff: ['doctor_view', 'doctor_add', 'doctor_update', 'doctor_delete', 'doctor_portal_access', 'doctor_schedule', 'nurse_view', 'nurse_add', 'nurse_update', 'nurse_delete', 'staff_view', 'staff_add', 'staff_update', 'staff_delete', 'department_view', 'department_add', 'department_update', 'department_delete'],
  money: ['payment_view', 'payment_add', 'payment_update', 'payment_delete', 'patient_deposit', 'invoice_view', 'invoice_print', 'expense_view', 'expense_add', 'expense_update', 'expense_delete', 'payroll_view', 'payroll_process', 'view_payment_reports', 'accounting'],
  administration: ['send_sms/voice', 'send_notification', 'view_sms_voice_reports', 'service_view', 'service_add', 'service_update', 'service_delete', 'holidays_view', 'holidays_add', 'holidays_delete', 'hospital_information_add', 'branch_view', 'branch_add', 'branch_update', 'branch_delete'],
} as const
