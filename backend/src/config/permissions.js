export const PERMISSION_GROUPS = {
  patients: ['patient_view', 'patient_add', 'patient_update', 'patient_delete', 'patient_medical_history', 'patient_portal_access', 'patient_bulk_add'],
  appointments: ['appointment_view', 'appointment_add', 'appointment_update', 'appointment_cancel', 'appointment_calendar', 'view_appointment_reports'],
  admissions: ['admission_view', 'admission_add', 'admission_discharge', 'bed_view', 'bed_allot', 'bed_release', 'ward_view', 'ward_add', 'ward_update', 'ward_delete'],
  clinical: ['prescription_view', 'prescription_add', 'prescription_update', 'prescription_delete', 'lab_test_view', 'lab_test_add', 'lab_test_update', 'lab_test_delete', 'diagnostic_report_view', 'diagnostic_report_add', 'operation_theatre_view', 'operation_theatre_schedule'],
  pharmacy: ['medicine_view', 'medicine_add', 'medicine_update', 'medicine_delete', 'pharmacy_sale', 'pharmacy_stock_view', 'view_pharmacy_reports'],
  staff: ['doctor_view', 'doctor_add', 'doctor_update', 'doctor_delete', 'doctor_portal_access', 'doctor_schedule', 'nurse_view', 'nurse_add', 'nurse_update', 'nurse_delete', 'staff_view', 'staff_add', 'staff_update', 'staff_delete', 'department_view', 'department_add', 'department_update', 'department_delete'],
  money: ['payment_view', 'payment_add', 'payment_update', 'payment_delete', 'patient_deposit', 'invoice_view', 'invoice_print', 'expense_view', 'expense_add', 'expense_update', 'expense_delete', 'payroll_view', 'payroll_process', 'view_payment_reports', 'accounting'],
  administration: ['send_sms/voice', 'send_notification', 'view_sms_voice_reports', 'service_view', 'service_add', 'service_update', 'service_delete', 'holidays_view', 'holidays_add', 'holidays_delete', 'hospital_information_add', 'branch_view', 'branch_add', 'branch_update', 'branch_delete', 'users'],
};

export const PERMISSION_CATALOGUE = Object.values(PERMISSION_GROUPS).flat();
export const USER_ROLES = ['admin', 'doctor', 'nurse', 'pharmacist', 'laboratorist', 'accountant', 'receptionist', 'patient'];
// Every staff role has its own grant set; patient has none until the patient portal is designed.
export const PERMISSION_ROLES = USER_ROLES.filter((role) => role !== 'patient');
export const APPOINTMENT_STATUSES = ['scheduled', 'arrived', 'completed', 'cancelled', 'no show'];
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
export const STAFF_TYPES = ['nurse', 'pharmacist', 'laboratorist', 'receptionist', 'accountant'];
