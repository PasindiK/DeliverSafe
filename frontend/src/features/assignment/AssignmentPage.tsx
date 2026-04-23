const ASSIGNMENT_STEPS = [
  {
    step: 'Step 0',
    title: 'Topic Selection and Approval',
    folder: 'docs/00-topic-approval',
    evidence: 'Approved topic, context, and dataset justification',
  },
  {
    step: 'Step 1',
    title: 'Empathize',
    folder: 'docs/01-empathize',
    evidence: 'Stakeholders, interviews, questionnaires, personas, empathy map',
  },
  {
    step: 'Step 2',
    title: 'Define',
    folder: 'docs/02-define',
    evidence: 'Problem statements, HMWs, journey maps, task flows',
  },
  {
    step: 'Step 3',
    title: 'Ideate',
    folder: 'docs/03-ideate',
    evidence: 'IA diagram, sketches, low-fi wireframes, chart rationale',
  },
  {
    step: 'Step 4',
    title: 'Prototype',
    folder: 'docs/04-prototype',
    evidence: 'Hi-fi screenshots, prototype link, design rationale',
  },
  {
    step: 'Step 5',
    title: 'Test',
    folder: 'docs/05-test',
    evidence: 'Usability plan, participant profile, test findings and metrics',
  },
  {
    step: 'Step 6',
    title: 'Iterate',
    folder: 'docs/06-iterate',
    evidence: 'Before-after comparisons and iteration summary',
  },
  {
    step: 'Step 7',
    title: 'Design Handoff',
    folder: 'docs/07-handoff',
    evidence: 'Annotated screens, interaction specs, implementation guidelines',
  },
]

const DELIVERABLE_CHECKLIST = [
  'Written report covering Steps 1–7',
  'Design handoff report and implementation constraints',
  'AI tools usage disclosure with tool URL and contribution scope',
  'Responsive high-fidelity interactive prototype link',
  '10-minute demo flow with design justification and Q&A prep',
]

function AssignmentPage() {
  return (
    <main className="dashboard-shell">
      <header className="page-header panel">
        <p className="eyebrow">Page 3 of 3 • Assignment Workspace</p>
        <h1>Assignment Placement & Submission Guide</h1>
        <p className="dashboard-subtitle">
          Use this page to place each assignment item in the correct folder and keep group work aligned
          with rubric evidence requirements.
        </p>
      </header>

      <section className="panel">
        <h2 className="panel-title">Where to Place Each Assignment Step</h2>
        <p className="panel-subtitle">Fill each step folder with real evidence artifacts only.</p>

        <div className="assignment-step-grid">
          {ASSIGNMENT_STEPS.map((item) => (
            <article key={item.step} className="assignment-step-card">
              <p className="assignment-step-badge">{item.step}</p>
              <h3 className="assignment-step-title">{item.title}</h3>
              <p className="assignment-step-folder">Folder: {item.folder}</p>
              <p className="assignment-step-evidence">Evidence: {item.evidence}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="assignment-bottom-grid">
        <article className="panel">
          <h2 className="panel-title">Required Deliverables Checklist</h2>
          <ul className="assignment-checklist">
            {DELIVERABLE_CHECKLIST.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>

        <article className="panel">
          <h2 className="panel-title">Group Work Split (Recommended)</h2>
          <ol className="assignment-checklist assignment-checklist-numbered">
            <li>Member 1: Step 0–1 lead + interview evidence owner</li>
            <li>Member 2: Step 2–3 lead + IA and wireframe owner</li>
            <li>Member 3: Step 4 lead + prototype responsiveness owner</li>
            <li>Member 4: Step 5–7 lead + testing and handoff owner</li>
          </ol>
        </article>
      </section>

      <section className="panel">
        <h2 className="panel-title">Academic Integrity Reminder</h2>
        <p className="panel-subtitle">
          Do not fabricate participants, personas, datasets, or usability findings. Use AI support
          transparently and document it in <strong>docs/08-ai-disclosure</strong>.
        </p>
      </section>
    </main>
  )
}

export default AssignmentPage
