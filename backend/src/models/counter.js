import mongoose from 'mongoose';

const counterSchema = new mongoose.Schema(
  {
    name: { type: String, unique: true },
    seq: { type: Number, default: 0 },
  },
  { versionKey: false }
);
const Counter = mongoose.model('Counter', counterSchema);

export async function nextCounter(name, session = null) {
  const doc = await Counter.findOneAndUpdate(
    { name },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, session }
  );
  return doc.seq;
}
export default Counter;
