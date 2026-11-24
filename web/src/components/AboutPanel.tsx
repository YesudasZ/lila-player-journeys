import { Fragment, useMemo, useRef } from "react";

import { aboutSections } from "../lib/about.ts";
import type { Manifest } from "../lib/manifest.ts";

const BUTTON =
  "h-8 rounded-md border border-border bg-surface px-3 text-xs font-medium text-text-muted hover:bg-surface-2 hover:text-text focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent active:bg-border";

/**
 * "Data and keys" in the top bar opens a panel that says in plain words what the data is and what
 * it cannot say, what each heat layer counts, which keys do what, and where the tool ends. It is
 * the browser's own dialog: while it is open the page behind it cannot be reached, Escape closes
 * it, and the focus goes back to the button that opened it. A click beside the panel closes it too.
 */
export function AboutPanel({ manifest }: { manifest: Manifest }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const sections = useMemo(() => aboutSections(manifest), [manifest]);

  return (
    <>
      <button type="button" aria-haspopup="dialog" onClick={() => dialog.current?.showModal()} className={BUTTON}>
        Data and keys
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="about-heading"
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close(); // the panel's own content is inside it, so this was a click beside the panel
        }}
        className="m-auto max-h-[85vh] w-[min(46rem,calc(100vw-2rem))] overflow-y-auto rounded-lg border border-border bg-surface text-[13px] leading-5 text-text backdrop:bg-bg/70"
      >
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <h2 id="about-heading" className="font-heading text-lg font-semibold">
              About the data and the keys
            </h2>
            <form method="dialog">
              <button className={BUTTON}>Close</button>
            </form>
          </div>
          {sections.map((section) => (
            <section key={section.heading} className="mt-5">
              <h3 className="border-b border-border pb-1 font-heading text-[13px] font-semibold tracking-wide">{section.heading}</h3>
              {section.lead && <p className="mt-2 text-text-muted">{section.lead}</p>}
              <dl className="mt-2 grid grid-cols-[9.5rem_minmax(0,1fr)] gap-x-4 gap-y-2">
                {section.entries.map((entry) => (
                  <Fragment key={entry.term}>
                    <dt className="font-medium">{entry.term}</dt>
                    <dd className="text-text-muted">{entry.text}</dd>
                  </Fragment>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </dialog>
    </>
  );
}
