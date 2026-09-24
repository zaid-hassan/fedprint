import type { PrintJob } from "../types";
import { JOB_STATUS_LABELS, formatTime } from "../utils";

interface JobsListProps {
  jobs: PrintJob[];
  onCancel: (id: string) => void;
}

export function JobsList({ jobs, onCancel }: JobsListProps) {
  return (
    <section className="jobs" aria-label="Recent prints">
      <h2 className="jobs__title">Recent prints</h2>
      {jobs.length === 0 ? (
        <p className="jobs__empty">No print jobs yet.</p>
      ) : (
        <ul className="jobs__list">
          {jobs.map((job) => {
            const cancellable = job.status === "queued" || job.status === "printing";
            return (
              <li className="job" key={job.id}>
                <div className="job__info">
                  <span className="job__name" title={job.name}>
                    {job.name}
                  </span>
                  <span className="job__meta">
                    {formatTime(job.submittedAt)}
                    {job.copies && job.copies > 1 ? ` · ${job.copies} copies` : ""}
                  </span>
                </div>
                <span className={`job__status job__status--${job.status}`}>{JOB_STATUS_LABELS[job.status]}</span>
                {cancellable ? (
                  <button className="job__cancel" type="button" onClick={() => onCancel(job.id)}>
                    Cancel
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
