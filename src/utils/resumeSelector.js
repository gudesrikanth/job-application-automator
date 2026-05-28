// ============================================================
// resumeSelector.js — Picks the right resume variant based on
// job title and track keywords
// ============================================================

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Keyword maps for each resume track
const TRACK_KEYWORDS = {
  'platform-cloud': [
    'cloud', 'devops', 'infrastructure', 'platform', 'kubernetes',
    'k8s', 'terraform', 'sre', 'reliability', 'devsecops', 'gitops',
    'argocd', 'helm', 'azure', 'aws', 'gcp', 'ci/cd', 'pipeline'
  ],
  'angular-fullstack': [
    'angular', 'full stack', 'fullstack', 'frontend', 'front-end',
    'react', 'next.js', 'ui', 'ngrx', 'nx', 'monorepo', 'scss',
    'typescript', 'javascript', 'web application'
  ],
  'backend-java': [
    'java', 'spring', 'spring boot', 'microservice', 'backend',
    'back-end', 'api', 'rest', 'j2ee', 'enterprise', 'python',
    'software engineer', 'software developer', 'senior engineer'
  ]
};

// Resume file names per track (place PDFs in /resumes folder)
const RESUME_FILES = {
  'platform-cloud':    'resume-platform-cloud.pdf',
  'angular-fullstack': 'resume-angular-fullstack.pdf',
  'backend-java':      'resume-backend-java.pdf',
};

/**
 * Determine best resume track from job title and description text.
 * Falls back to backend-java as default.
 */
export function selectTrack(jobTitle = '', jobDescription = '') {
  const text = `${jobTitle} ${jobDescription}`.toLowerCase();

  let bestTrack = 'backend-java';
  let bestScore = 0;

  for (const [track, keywords] of Object.entries(TRACK_KEYWORDS)) {
    const score = keywords.reduce((acc, kw) => {
      return acc + (text.includes(kw) ? 1 : 0);
    }, 0);
    if (score > bestScore) {
      bestScore = score;
      bestTrack = track;
    }
  }

  return bestTrack;
}

/**
 * Return absolute path to the resume PDF for a given track.
 */
export function getResumePath(track) {
  const fileName = RESUME_FILES[track] || RESUME_FILES['backend-java'];
  return path.resolve(__dirname, '../../resumes', fileName);
}

/**
 * If a job config already has an explicit track, use that;
 * otherwise auto-detect from title.
 */
export function resolveResume(job) {
  const track = job.track || selectTrack(job.title, job.notes || '');
  const resumePath = getResumePath(track);
  return { track, resumePath };
}
