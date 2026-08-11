import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFeedbackDocs, type IngestPayloadShape } from './feedbackDoc';

const payload: IngestPayloadShape = {
  submitted_at: '2026-08-11T10:00:00+10:00',
  parent_name: 'Steven Marsh',
  student_name: 'Callum Marsh',
  class_label: 'VCE English — Thu 6pm (Sarah)',
  rating: 3,
  continuing: 'Not sure',
  contact_requested: 'Yes',
  comments: 'a comment',
  row_number: 13,
};

test('feedbackDoc never contains parentName/studentName under any key name — the redaction guarantee', () => {
  const { feedbackDoc } = buildFeedbackDocs(payload, 'sarah.whelan@contoureducation.example', false, 1);
  const serialized = JSON.stringify(feedbackDoc);
  assert.ok(!('parentName' in feedbackDoc));
  assert.ok(!('studentName' in feedbackDoc));
  assert.ok(!serialized.includes('Steven Marsh'));
  assert.ok(!serialized.includes('Callum Marsh'));
});

test('piiDoc contains exactly parentName/studentName, nothing else', () => {
  const { piiDoc } = buildFeedbackDocs(payload, 'sarah.whelan@contoureducation.example', false, 1);
  assert.deepEqual(piiDoc, { parentName: 'Steven Marsh', studentName: 'Callum Marsh' });
  assert.deepEqual(Object.keys(piiDoc).sort(), ['parentName', 'studentName']);
});

test('feedbackDoc carries every non-PII field through correctly', () => {
  const { feedbackDoc } = buildFeedbackDocs(payload, 'sarah.whelan@contoureducation.example', false, 2);
  assert.deepEqual(feedbackDoc, {
    timestamp: '2026-08-11T10:00:00+10:00',
    class: 'VCE English — Thu 6pm (Sarah)',
    tutorEmail: 'sarah.whelan@contoureducation.example',
    unmatchedClass: false,
    rating: 3,
    continuing: 'Not sure',
    contactRequested: 'Yes',
    comments: 'a comment',
    priorityTier: 2,
    sourceRow: 13,
  });
});

test('unmatched class carries tutorEmail=null and unmatchedClass=true through, still no PII', () => {
  const { feedbackDoc } = buildFeedbackDocs(payload, null, true, 3);
  assert.equal(feedbackDoc.tutorEmail, null);
  assert.equal(feedbackDoc.unmatchedClass, true);
  assert.ok(!('parentName' in feedbackDoc));
});
