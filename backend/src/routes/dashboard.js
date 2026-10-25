import { Router } from 'express';
import { Patient, Doctor, Department } from '../models/clinic.js';
import { Appointment, Admission, Bed, Staff } from '../models/ward.js';
import { Medicine, Prescription, Lab, PharmacySale } from '../models/pharmacy.js';
import { Invoice, InvoicePayment } from '../models/billing.js';
import { LedgerEntry } from '../models/org.js';
import { ah, num, round2, dateStr } from '../util.js';
import { auth, activity } from '../middleware/auth.js';

const r = Router();
r.use(auth, activity);

r.get('/dashboard', ah(async (req, res) => {
  const [patients, doctors, nurses, receptionists, pharmacists, laboratorists, accountants] = await Promise.all([
    Patient.countDocuments(),
    Doctor.countDocuments(),
    Staff.countDocuments({ type: 'nurse' }),
    Staff.countDocuments({ type: 'receptionist' }),
    Staff.countDocuments({ type: 'pharmacist' }),
    Staff.countDocuments({ type: 'laboratorist' }),
    Staff.countDocuments({ type: 'accountant' }),
  ]);
  const [totalBeds, openAdmissions, totalAppointments, pendingAppointments, prescriptions, labRequests, medicines] = await Promise.all([
    Bed.countDocuments(),
    Admission.countDocuments({ dTime: null }),
    Appointment.countDocuments(),
    Appointment.countDocuments({ status: 'scheduled' }),
    Prescription.countDocuments(),
    Lab.countDocuments(),
    Medicine.countDocuments(),
  ]);
  const [incomeRows, expenseRows] = await Promise.all([
    InvoicePayment.aggregate([{ $group: { _id: null, total: { $sum: { $toDouble: '$amount' } } } }]),
    LedgerEntry.aggregate([{ $match: { type: 'expense' } }, { $group: { _id: null, total: { $sum: { $toDouble: '$amount' } } } }]),
  ]);
  const income = round2(incomeRows[0]?.total || 0);
  const expenses = round2(expenseRows[0]?.total || 0);
  const recentPatients = await Patient.find().sort({ _id: -1 }).limit(5).select('patientId name phone sex age addDate');
  const recentAppointments = await Appointment.find().sort({ startDateTime: -1 }).limit(5);
  const [recentPatientsInfo, recentDoctorsInfo] = await Promise.all([
    Patient.find({ _id: { $in: recentAppointments.map((a) => a.patientId) } }).select('name if-none').select('name').lean(),
    Doctor.find({ _id: { $in: recentAppointments.map((a) => a.doctorId) } }).select('name').lean(),
  ]);
  res.json({
    counts: {
      totalPatients: patients,
      totalDoctors: doctors,
      totalNurses: nurses,
      totalStaff: doctors + nurses + receptionists + pharmacists + laboratorists + accountants,
      totalAppointments,
      pendingAppointments,
      prescriptions,
      labRequests,
      medicines,
    },
    beds: {
      total: totalBeds,
      occupied: openAdmissions,
      free: Math.max(0, totalBeds - openAdmissions),
      occupancy: totalBeds ? Math.round((openAdmissions / totalBeds) * 100) : 0,
    },
    money: { income: income.toFixed(2), expenses: expenses.toFixed(2), balance: round2(income - expenses).toFixed(2) },
    recent: {
      patients: recentPatients,
      appointments: recentAppointments.map((a) => ({
        ...a.toObject(),
        patientName: recentPatientsInfo.find((p) => String(p._id) === String(a.patientId))?.name || 'Unknown patient',
        doctorName: recentDoctorsInfo.find((d) => String(d._id) === String(a.doctorId))?.name || 'Removed doctor',
      })),
    },
  });
}));

r.get('/search', ah(async (req, res) => {
  const term = String(req.query.q || '').trim();
  if (term.length < 2) {
    return res.json({ term, patients: [], doctors: [], count: 0, message: 'Enter at least two characters.' });
  }
  const rx = { $regex: term, $options: 'i' };
  const [patients, patientDocs] = await Promise.all([
    Patient.find({ $or: ['name', 'patientId', 'phone', 'email', 'address', 'bloodGroup'].map((f) => ({ [f]: rx })) }).limit(25).select('patientId name phone sex age bloodGroup'),
    Doctor.find({ $or: ['name', 'phone', 'email', 'department', 'specialist'].map((f) => ({ [f]: rx })) }).limit(25),
  ]);
  const patientsOut = patients.map((p) => ({ id: p._id, patientId: p.patientId, name: p.name, phone: p.phone, sex: p.sex, age: p.age, bloodGroup: p.bloodGroup }));
  const doctorsOut = patientDocs.map((d) => ({ id: d._id, name: d.name, phone: d.phone, email: d.email }));
  res.json({ term, patients: patientsOut, doctors: doctorsOut, count: patientsOut.length + doctorsOut.length });
}));

export default r;
