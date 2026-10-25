import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { connect } from '../db.js';

process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/hos_boilerplate?replicaSet=rs0';

const { User, RolePermission, ActivityLog } = await import('../models/auth.js');
const { Patient, Department, Doctor, Service, MedicalHistory } = await import('../models/clinic.js');
const { Appointment, BedCategory, Bed, Admission, Staff } = await import('../models/ward.js');
const { MedicineCategory, Medicine, Prescription, LabCategory, Lab, PharmacySale } = await import('../models/pharmacy.js');
const { Invoice, InvoicePayment } = await import('../models/billing.js');
const {
  Institute, AppSettings, GatewayCredential, AccountingSetting, Integration,
  NotificationType, MessageTemplate, AccountSector, LedgerEntry,
} = await import('../models/org.js');
const { nextCounter } = await import('../models/counter.js');
const { PERMISSION_ROLES } = await import('../config/permissions.js');
const { toMoney, withTxn } = await import('../util.js');

async function main() {
  await connect();
  const collections = await mongoose.connection.db.listCollections().toArray();
  for (const c of collections) {
    await mongoose.connection.collection(c.name).deleteMany({});
  }
  console.log('collections cleared');

  await new Institute({
    name: 'HOS Demo Hospital',
    establishedYear: '2012',
    website: 'https://hos-demo.example.com',
    email: 'info@hos-demo.example.com',
    phone: '+92 42 111 000 111',
    address: '12 Ferozepur Road, Lahore',
  }).save();

  await AppSettings.create({
    title: 'HOS Demo Hospital',
    loginTitle: 'HOS Demo Hospital — HMS',
    currency: 'PKR',
    language: 'en',
    timezone: 'Asia/Karachi',
    reminderCron: { appointment: '18:00', payment: '' },
    phoneCountryCode: '92',
    discountDefault: 0,
    vatDefault: 0,
    smsGateway: 'bizsms',
    reminderCron: { appointment: '0 7 * * *', payment: '0 18 * * *' },
  });

  await GatewayCredential.create([
    { name: 'JazzCash', merchantKey: 'jc-demo-key', salt: 'jc-demo-salt', status: 'disabled' },
    { name: 'PayFast', status: 'disabled' },
  ]);
  await AccountingSetting.create({ companyId: 'demo-company', apiLink: 'https://books.example.com/api', username: 'sync-bot', password: 'demo-pass' });
  await Integration.create([
    { channel: 'sms', provider: 'mock', url: 'https://sms.example.com/send', mask: 'HOSDEMO' },
    { channel: 'voice', provider: 'mock' },
  ]);
  await NotificationType.create([
    { key: 'appointment', channel: 'sms', enabled: true, defaultText: 'Dear {{patient.name}}, you have an appointment at {{institute.name}} on {{appointment.date}} at {{appointment.time}}. Please arrive ten minutes early.' },
    { key: 'payment', channel: 'sms', enabled: false, defaultText: 'Dear {{patient.name}}, your outstanding balance at {{institute.name}} is {{invoice.balance}}. Please contact reception to settle it.' },
  ]);
  await MessageTemplate.create([
    { name: 'Clinic closed', channel: 'sms', text: 'Dear {{patient.name}}, {{institute.name}} OPD is closed tomorrow. Emergency remains open.' },
    { name: 'Vaccination drive', channel: 'sms', text: 'Free vaccination camp at {{institute.name}} this Saturday, 9am to 1pm.' },
  ]);

  for (const role of PERMISSION_ROLES) {
    await RolePermission.create({ role, keys: [] });
  }
  await AccountSector.create([
    { name: 'Consultation fees', type: 'income' },
    { name: 'Pharmacy sales', type: 'income' },
    { name: 'Lab fees', type: 'income' },
    { name: 'Rent', type: 'expense' },
    { name: 'Utilities', type: 'expense' },
    { name: 'Salaries', type: 'expense' },
  ]);

  const passwordHash = await bcrypt.hash('123456', 10);
  const userDefs = [
    { firstName: 'Ayesha', lastName: 'Khan', login: 'admin', email: 'admin@hos-demo.example.com', role: 'admin' },
    { firstName: 'Umar', lastName: 'Farooq', login: 'dumar', email: 'umar@hos-demo.example.com', role: 'doctor' },
    { firstName: 'Sana', lastName: 'Riaz', login: 'nsana', email: 'sana@hos-demo.example.com', role: 'nurse' },
    { firstName: 'Ahmed', lastName: 'Iqbal', login: 'acc1', email: 'acc@hos-demo.example.com', role: 'accountant' },
  ];
  const users = {};
  for (const u of userDefs) {
    const doc = await User.create({ ...u, passwordHash, addDate: new Date() });
    users[u.login] = doc;
  }
  console.log('users seeded');

  await Department.create([
    { name: 'Neurology', description: 'Brain, spinal cord and nerves.' },
    { name: 'General Medicine', description: 'Everyday medicine and referrals.' },
    { name: 'Orthopaedics', description: 'Bones and joints.' },
    { name: 'Gynaecology', description: 'Women and maternity health.' },
  ]);

  const doctors = await Doctor.create([
    { name: 'Dr. Umar Farooq', email: 'umar@hos-demo.example.com', phone: '0301 1110001', department: 'Neurology', specialist: 'Neurologist' },
    { name: 'Dr. Robina Malik', email: 'robina@hos-demo.example.com', phone: '0301 1110002', department: 'General Medicine', specialist: 'Physician' },
    { name: 'Dr. Ali Tahir', email: 'ali@hos-demo.example.com', phone: '0301 1110003', department: 'Orthopaedics', specialist: 'Orthopaedic surgeon' },
    { name: 'Dr. Hira Gill', email: 'hira@hos-demo.example.com', phone: '0301 1110004', department: 'Gynaecology', specialist: 'Gynaecologist' },
  ]);

  await Staff.create([
    { type: 'nurse', name: 'Sana Riaz', email: 'sana@hos-demo.example.com', phone: '0302 2220001' },
    { type: 'nurse', name: 'Kiran Bibi', phone: '0302 2220002' },
    { type: 'pharmacist', name: 'Basit Ali', phone: '0303 3330001' },
  ]);

  await Service.create([
    { name: 'OPD visit', description: 'Consultation', price: toMoney(1500), type: 'consultation' },
    { name: 'Dressing', description: 'Wound dressing', price: toMoney(800), type: 'procedure' },
    { name: 'CT scan', description: 'Head CT', price: toMoney(12000), type: 'diagnostics' },
    { name: 'Bed charges', description: 'Per day', price: toMoney(3000), type: 'room' },
  ]);

  const patientDefs = [
    { name: 'Bilal Hussain', phone: '03004561203', sex: 'male', age: 34, bloodGroup: 'B+', address: 'Model Town, Lahore' },
    { name: 'Amina Bibi', phone: '03319561204', sex: 'female', age: 28, bloodGroup: 'O+', address: 'Gulberg, Lahore' },
    { name: 'Tariq Mehmood', phone: '03009561205', sex: 'male', age: 45, bloodGroup: 'A+', address: 'Johar Town, Lahore' },
    { name: 'Fatima Noor', phone: '03329561206', sex: 'female', age: 22, bloodGroup: 'AB-', address: 'Cantt, Lahore' },
    { name: 'Sajjad Ali', phone: '03009561207', sex: 'male', age: 51, bloodGroup: 'O-', address: 'Samanabad, Lahore' },
  ];
  const patients = [];
  for (const pd of patientDefs) {
    const seq = await nextCounter('patientId');
    patients.push(await Patient.create({ ...pd, patientId: String(seq).padStart(6, '0') }));
  }
  await MedicalHistory.create({
    patientId: patients[2]._id,
    title: 'Chronic back pain',
    description: 'Lower back pain since 2021, aggravated by lifting.',
    date: new Date('2024-08-12'),
    patientName: patients[2].name,
    patientPhone: patients[2].phone,
    createdBy: users.admin._id,
  });

  const [tabletCat, syrupCat] = await MedicineCategory.create([
    { name: 'Tablet', description: 'Tablets' },
    { name: 'Syrup', description: 'Syrups' },
  ]);
  const meds = await Medicine.create([
    { name: 'Panadol', generic: 'Paracetamol', company: 'GSK', box: '10x1', price: toMoney(25), sellingPrice: toMoney(30), quantity: 120, categoryId: tabletCat._id },
    { name: 'Brufen', generic: 'Ibuprofen', company: 'Abbott', box: '10x1', price: toMoney(15), sellingPrice: toMoney(20), quantity: 60, categoryId: tabletCat._id },
    { name: 'Augmentin', generic: 'Co-amoxiclav', company: 'GSK', box: '1x7', price: toMoney(320), sellingPrice: toMoney(380), quantity: 24, categoryId: tabletCat._id },
    { name: 'Lorex syrup', generic: 'Paracetamol', company: 'Welcome', box: '100ml', price: toMoney(80), sellingPrice: toMoney(95), quantity: 40, categoryId: syrupCat._id },
    { name: 'Ventolin syrup', generic: 'Salbutamol', company: 'GSK', box: '100ml', price: toMoney(110), sellingPrice: toMoney(130), quantity: 18, categoryId: syrupCat._id },
  ]);

  const labCats = await LabCategory.create([
    { name: 'CBC', description: 'Complete blood count', referenceValue: 'Hb 12-18 g/dl' },
    { name: 'Blood sugar random', referenceValue: '70-140 mg/dl' },
    { name: 'X-ray chest PA' },
  ]);

  const wards = [];
  const beds = [];
  for (const wardName of ['Private Room', 'General Ward', 'Emergency']) {
    const ward = await BedCategory.create({ name: wardName, description: '' });
    wards.push(ward);
    for (let i = 1; i <= 3; i++) {
      beds.push(await Bed.create({ wardId: ward._id, number: `${wardName.slice(0, 3).toUpperCase()}-${String(i).padStart(2, '0')}` }));
    }
  }

  const today = new Date();
  const dayOf = (offset) => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + offset));
  const iso = (d) => d.toISOString().slice(0, 10);
  const mkApp = (dayOffset, hour, patient, doctor, status = 'scheduled') => {
    const date = iso(dayOf(dayOffset));
    const start = new Date(`${date}T${String(hour).padStart(2, '0')}:00:00Z`);
    const end = new Date(start.getTime() + 15 * 60000);
    return {
      patientId: patient._id,
      doctorId: doctor._id,
      date,
      startDateTime: start,
      endDateTime: end,
      minutes: 15,
      timeSlot: `${String(hour).padStart(2, '0')}:00`,
      sTimeKey: `${date} ${String(hour).padStart(2, '0')}:00`,
      status,
      remarks: '',
      bookingUserId: users.admin._id,
    };
  };
  const [doc1, doc2] = doctors;
  const apptCount = await (async () => {
    const plans = [
      mkApp(0, 9, patients[0], doc1, 'completed'),
      mkApp(0, 11, patients[1], doc1),
      mkApp(0, 14, patients[1], doc2),
      mkApp(1, 10, patients[2], doc2),
      mkApp(1, 16, patients[3], doc1),
    ];
    for (const plan of plans) await Appointment.create(plan);
    return plans.length;
  })();

  const openAdmissions = [
    { patient: patients[2], bed: beds[3], daysAgo: 2 },
    { patient: patients[4], bed: beds[6], daysAgo: 1 },
  ];
  for (const ad of openAdmissions) {
    const admittedAt = new Date(Date.now() - ad.daysAgo * 86400e3);
    await withTxn(async (session) => {
      await Admission.create([{
        patientId: ad.patient._id,
        bedId: ad.bed._id,
        number: ad.bed.number,
        wardId: ad.bed.wardId,
        admittedAt,
        dTime: null,
        status: 'admitted',
        createdBy: users.admin._id,
      }], { session });
    });
  }

  await Prescription.create([
    {
      patientId: patients[0]._id,
      doctorId: doc1._id,
      date: dayOf(0),
      symptom: 'Fever and headache',
      advice: 'Complete the course',
      items: [
        { medicineId: meds[0]._id, name: meds[0].name, dosage: '1 tablet', duration: '5 days', instructions: 'after meal' },
        { name: 'Vitamin D sachet', dosage: '1 sachet', duration: '4 weeks' },
      ],
      summary: 'Panadol 1 tablet for 5 days, Vitamin D sachet 1 sachet for 4 weeks',
      createdBy: users.admin._id,
    },
    {
      patientId: patients[1]._id,
      doctorId: doc2._id,
      date: dayOf(-2),
      symptom: 'Cough',
      items: [{ medicineId: meds[2]._id, name: meds[2].name, dosage: '1 tablet', duration: '7 days' }],
      summary: 'Augmentin 1 tablet for 7 days',
      createdBy: users.admin._id,
    },
  ]);

  await Lab.create([
    {
      patientId: patients[0]._id,
      doctorId: doc1._id,
      date: dayOf(0),
      tests: [{ labCategoryId: labCats[0]._id, name: labCats[0].name, referenceValue: labCats[0].referenceValue, result: 'Hb 13.5 g/dl, normal', status: 'reported', reportedAt: new Date() }],
      status: 'reported',
      patientName: patients[0].name,
      patientPhone: patients[0].phone,
      requestUserId: users.admin._id,
    },
    {
      patientId: patients[1]._id,
      doctorId: doc2._id,
      date: dayOf(-4),
      tests: [{ labCategoryId: labCats[1]._id, name: labCats[1].name, referenceValue: labCats[1].referenceValue, result: null, status: 'requested' }],
      status: 'requested',
      patientName: patients[1].name,
      patientPhone: patients[1].phone,
      requestUserId: users.admin._id,
    },
  ]);

  await PharmacySale.create({
    patientId: null,
    date: new Date(),
    items: [{ medicineId: meds[0]._id, name: meds[0].name, quantity: 2, unitPrice: toMoney(30), lineTotal: toMoney(60) }],
    amount: toMoney(60),
    discount: toMoney(0),
    vat: toMoney(0),
    grossTotal: toMoney(60),
    amountReceived: toMoney(60),
    status: 'paid',
    saleUserId: users.admin._id,
  });

  await LedgerEntry.create([
    { sectorName: 'Consultation fees', type: 'income', amount: toMoney(1500), date: new Date(), description: 'OPD visit', createdBy: users.acc1._id },
    { sectorName: 'Utilities', type: 'expense', amount: toMoney(24000), date: dayOf(-3), description: 'Electricity bill', createdBy: users.acc1._id },
  ]);

  const invoice = await Invoice.create({
    patientId: patients[0]._id,
    patientName: patients[0].name,
    patientPhone: patients[0].phone,
    patientAddress: patients[0].address,
    doctorId: doc1._id,
    doctorName: doc1.name,
    date: dayOf(-2),
    items: [
      { name: 'OPD visit', quantity: 1, unitPrice: toMoney(1500), lineTotal: toMoney(1500) },
      { name: 'Dressing', quantity: 2, unitPrice: toMoney(800), lineTotal: toMoney(1600) },
    ],
    amount: toMoney(3100),
    discount: toMoney(100),
    vat: toMoney(0),
    grossTotal: toMoney(3000),
    remarks: 'Follow-up visit',
    createdBy: users.acc1._id,
  });
  await InvoicePayment.create([
    { invoiceId: invoice._id, amount: toMoney(1200), method: 'Card', paidAt: dayOf(-2) },
    { invoiceId: invoice._id, amount: toMoney(800), method: 'Cash', paidAt: dayOf(-1) },
  ]);

  await ActivityLog.create({ description: 'Seed run', method: 'SEED', route: 'seed', userId: users.admin._id });

  console.log(`seed complete: ${userDefs.length} users, ${patients.length} patients, ${doctors.length} doctors, ${beds.length} beds, ${apptCount} appointments, ${meds.length} medicines`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
