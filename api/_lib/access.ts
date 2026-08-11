export type StaffRole = 'lead' | 'coordinator' | 'tutor';

// Exact-string membership only — confirmed sufficient in PLANNING.md section 2.3, since roster
// `classes[]` entries are the exact strings that appear in the sheet's Class column (including
// unicode em-dashes), so no fuzzy matching or bracket-parsing is needed.
export function classBelongsToTutor(tutorClasses: string[], className: string): boolean {
  return tutorClasses.includes(className);
}

// Mirrors firestore.rules' canSeeFeedback()/isTutorForClass() logic in plain JS so the access
// semantics are unit-testable directly — the .rules file itself isn't JS and isn't exercised by
// this test suite (no emulator in this timebox, see PLANNING.md section 10), but the two are
// meant to stay identical; if you change one, change the other.
export function canSeeFeedback(role: StaffRole, tutorClasses: string[], feedbackClass: string): boolean {
  if (role === 'lead' || role === 'coordinator') return true;
  if (role === 'tutor') return classBelongsToTutor(tutorClasses, feedbackClass);
  return false;
}
