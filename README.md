# Job Application Automator

A modular, Playwright-based job application automation framework with Page Object Model (POM), ATS-specific adapters, human-in-the-loop review pauses, bot detection bypass, and centralized error logging.

---

## Project Structure

```
job-application-automator/
├── src/
│   ├── index.js                    # Main pipeline orchestrator
│   ├── config/
│   │   ├── profile.json            # Your personal info, visa, salary, relocation
│   │   ├── answers.json            # Reusable answers for common questions
│   │   └── jobs.json               # List of job URLs to apply to
│   ├── core/
│   │   └── logger.js               # JSON event logging + screenshot on failure
│   ├── pages/
│   │   ├── ats/
│   │   │   ├── GreenhousePage.js   # POM adapter for Greenhouse
│   │   │   ├── LeverPage.js        # POM adapter for Lever
│   │   │   └── WorkdayPage.js      # POM adapter for Workday (multi-step)
│   │   └── components/
│   │       └── FormFiller.js       # Reusable: fillText, selectOption, uploadFile
│   └── utils/
│       ├── humanize.js             # Randomized typing, mouse, scroll helpers
│       └── resumeSelector.js       # Auto-picks resume track by job keywords
├── resumes/
│   ├── resume-backend-java.pdf     # Add your resume PDFs here
│   ├── resume-platform-cloud.pdf
│   └── resume-angular-fullstack.pdf
├── logs/                           # Auto-created: JSON logs + failure screenshots
├── package.json
└── README.md
```

---

## Setup

### Prerequisites
- Node.js 18+
- npm

### Install
```bash
git clone https://github.com/gudesrikanth/job-application-automator.git
cd job-application-automator
npm install
npx playwright install chromium
```

---

## Configuration

### 1. profile.json
Contains your personal info, work authorization, salary range, and relocation preference. Already pre-filled with your details. Update as needed.

### 2. answers.json
Pre-written answers for common application questions:
- Work authorization / visa (H-1B)
- Sponsorship response
- Salary expectation ($120k-$160k)
- Notice period (2 weeks)
- Cover letter, strengths, weakness, why interested
- Years of experience per technology

### 3. jobs.json
List of jobs to apply to. For each job, specify:
```json
{
  "id": "job-001",
  "title": "Senior Software Engineer",
  "company": "Company Name",
  "url": "https://boards.greenhouse.io/company/jobs/12345",
  "ats": "greenhouse",
  "track": "backend-java",
  "status": "pending",
  "notes": "Optional notes"
}
```

**ATS options:** `greenhouse`, `lever`, `workday`  
**Track options:** `backend-java`, `platform-cloud`, `angular-fullstack`

Set `"status": "applied"` or `"status": "skip"` to skip a job on the next run.

---

## Resume Tracks

The framework auto-selects the right resume based on job title keywords:

| Track | Titles | Keywords |
|---|---|---|
| `backend-java` | Software Engineer, Java Developer, Senior Dev | java, spring, microservice, api, rest |
| `platform-cloud` | DevOps, Cloud, Infrastructure, SRE | kubernetes, terraform, aws, azure, gcp, argocd |
| `angular-fullstack` | Full Stack, Frontend, Angular Dev | angular, react, ngrx, nx, typescript, ui |

Add your resume PDFs to the `resumes/` folder with these exact names:
- `resumes/resume-backend-java.pdf`
- `resumes/resume-platform-cloud.pdf`
- `resumes/resume-angular-fullstack.pdf`

---

## Running

```bash
npm start
```

This will:
1. Open a real Chrome browser window (headful, not headless)
2. Navigate to each job URL in jobs.json
3. Auto-fill all form fields using your profile and answers
4. Upload the correct resume for the job track
5. **PAUSE and wait for you to review** the form in the browser
6. After you press ENTER in the terminal, submit the application
7. Log success/failure to `logs/` with screenshots on errors

---

## Human-in-the-Loop Review

Every application pauses before submitting:
```
====================================
REVIEW PAUSE: Please review the form
in the browser. Press ENTER to submit
or Ctrl+C to abort this application.
====================================
```
- Press **ENTER** to submit.
- Press **Ctrl+C** to cancel the current application and move to the next.

---

## Bot Detection Bypass

The `humanize.js` utility implements:
- Randomized character-by-character typing with natural delays (40-180ms per char)
- 3% random typo + backspace correction simulation
- Random mouse movement to non-center click targets
- Idle mouse drift between actions
- Webdriver flag masking via `navigator.webdriver = undefined`
- Custom user-agent string (non-automation Chrome)
- Random reading/thinking pauses between form steps

---

## Error Logging

All events are written to `logs/run-[timestamp].json`:
```json
{
  "status": "failure",
  "jobId": "job-001",
  "title": "Senior Software Engineer",
  "company": "Example Corp",
  "error": "Timeout waiting for submit button",
  "screenshot": "logs/failure-job-001-1234567890.png",
  "timestamp": "2026-05-28T11:00:00.000Z"
}
```

---

## Adding New ATS Platforms

1. Create `src/pages/ats/NewATSPage.js` extending the same pattern as `GreenhousePage.js`
2. Add a case in `src/index.js` in the `getATSPage()` switch statement
3. Add example jobs with `"ats": "newats"` to `jobs.json`

---

## Standard Answers Reference

| Question | Answer |
|---|---|
| Visa / Work Authorization | H-1B, authorized to work in US |
| Require Sponsorship | Yes, may require in future |
| Willing to Relocate | Yes, open to relocate within the US |
| Salary Expectation | $120,000 - $160,000 |
| Notice Period | 2 weeks |
| Employment Type | Full-time |
| Remote Preference | Remote or Hybrid |
