// k6 load test for the exam submit path (Phase 4, §7 "design for the spike").
// PEAK_CONCURRENT_STUDENTS students each start an exam, autosave 5 answers, and submit within 60s.
// Asserts: p95 submit latency < 2s, zero 5xx.  (Zero duplicate ExamAttempt rows is checked in the
// DB after the run.)
//
//   docker run --rm -i grafana/k6 run -e BASE=http://host.docker.internal:4100/api/v1 \
//       -e EXAM_ID=<publicId> -e VUS=300 - < tests/load/exam-submit.js
import http from 'k6/http';
import { check } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const BASE = __ENV.BASE || 'http://host.docker.internal:4100/api/v1';
const EXAM_ID = __ENV.EXAM_ID;
const VUS = Number(__ENV.VUS || 300);

const submitDuration = new Trend('submit_duration', true);
const errors5xx = new Counter('errors_5xx');

export const options = {
  scenarios: {
    spike: { executor: 'per-vu-iterations', vus: VUS, iterations: 1, maxDuration: '90s' },
  },
  thresholds: {
    submit_duration: ['p(95)<2000'], // p95 submit latency under 2s
    errors_5xx: ['count<1'], // zero server errors
    checks: ['rate>0.98'],
  },
};

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function track5xx(res) {
  if (res.status >= 500) errors5xx.add(1);
}

export default function () {
  const vu = __VU;

  const login = http.post(
    `${BASE}/auth/login`,
    JSON.stringify({ identifier: `loadstudent${vu}`, password: 'Load@12345' }),
    { headers: JSON_HEADERS },
  );
  track5xx(login);
  check(login, { 'login 200': (r) => r.status === 200 });

  const start = http.post(`${BASE}/exams/${EXAM_ID}/start`, null, { headers: JSON_HEADERS });
  track5xx(start);
  const started = check(start, { 'start 200': (r) => r.status === 200 });
  if (!started) return;

  const body = start.json();
  const sessionId = body.sessionId;
  const attemptId = body.attempt.publicId;
  const questions = (body.paper && body.paper.questions) || [];

  for (let i = 0; i < Math.min(5, questions.length); i++) {
    const q = questions[i];
    const selectedOptionId = q.options && q.options.length ? q.options[0].id : null;
    const save = http.post(
      `${BASE}/attempts/${attemptId}/answers`,
      JSON.stringify({ answers: [{ questionPublicId: q.questionPublicId, selectedOptionId }] }),
      { headers: { ...JSON_HEADERS, 'X-Exam-Session': sessionId } },
    );
    track5xx(save);
    check(save, { 'autosave 200': (r) => r.status === 200 });
  }

  const submit = http.post(`${BASE}/attempts/${attemptId}/submit`, null, {
    headers: { 'X-Exam-Session': sessionId, 'X-Idempotency-Key': `${vu}-${Date.now()}` },
  });
  submitDuration.add(submit.timings.duration);
  track5xx(submit);
  check(submit, {
    'submit 200': (r) => r.status === 200,
    'submit not 5xx': (r) => r.status < 500,
  });
}
