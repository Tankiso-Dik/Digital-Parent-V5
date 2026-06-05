import { Router } from 'express';

const router = Router();

// Seed data: a read-only school intelligence page
const seedData = {
  olderChild: {
    attendance: { rate: 94, streak: 12, absences: 1 },
    timetable: [
      { day: 'Monday', periods: [{ subject: 'Maths', teacher: 'Mr. Smith', room: '101' }, { subject: 'English', teacher: 'Mrs. Jones', room: '102' }] },
      { day: 'Tuesday', periods: [{ subject: 'Maths', teacher: 'Mr. Smith', room: '101' }, { subject: 'Life Sciences', teacher: 'Mr. White', room: '204' }] }
    ],
    contacts: [
      { role: 'Form Teacher', name: 'Mrs. Jones', phone: '+27 82 123 4567' },
      { role: 'Maths Teacher', name: 'Mr. Smith', phone: '+27 82 123 4568' }
    ],
    academic: {
      average: 78,
      subjects: [
        { name: 'Maths', score: 65 },
        { name: 'English', score: 82 },
        { name: 'Life Sciences', score: 88 },
        { name: 'History', score: 76 }
      ]
    }
  },
  youngerChild: {
    attendance: { rate: 82, streak: 3, absences: 5 },
    timetable: [
      { day: 'Monday', periods: [{ subject: 'Science', teacher: 'Mr. Davis', room: '201' }, { subject: 'Art', teacher: 'Ms. Taylor', room: '202' }] },
      { day: 'Tuesday', periods: [{ subject: 'Science', teacher: 'Mr. Davis', room: '201' }, { subject: 'History', teacher: 'Mr. Clark', room: '205' }] }
    ],
    contacts: [
      { role: 'Class Teacher', name: 'Ms. Taylor', phone: '+27 83 987 6543' },
      { role: 'Bus Driver', name: 'Mr. Mokoena', phone: '+27 83 987 6544' }
    ],
    academic: {
      average: 74,
      subjects: [
        { name: 'Maths', score: 85 },
        { name: 'English', score: 60 },
        { name: 'Science', score: 75 },
        { name: 'Art', score: 76 }
      ]
    }
  }
};

router.get('/summary/:childId', (req, res) => {
  const { childId } = req.params;
  const isEven = parseInt(childId, 10) % 2 === 0;
  
  const data = isEven ? seedData.olderChild : seedData.youngerChild;
  data.thresholds = { attendanceStreak: 5, subjectPass: 70, termAveragePass: 75 };
  res.json({ data });
});

export default router;
