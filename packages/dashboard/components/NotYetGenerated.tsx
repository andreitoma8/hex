interface NotYetGeneratedProps {
  command: string;
}

export function NotYetGenerated({ command }: NotYetGeneratedProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border-emphasis bg-surface-1 px-sp-5 py-sp-8 text-center">
      <svg
        className="mb-4 h-12 w-12 text-text-tertiary"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12H9.75m3 0H9.75m0 0v3m-3-6h1.5m-1.5 0v3m6-6h.008v.008H15V9.75Z"
        />
      </svg>
      <h3 className="mb-2 text-heading font-medium text-text-primary">
        Data not yet generated
      </h3>
      <p className="mb-4 text-body text-text-secondary">
        Run the following command to generate this data:
      </p>
      <code className="rounded-md bg-surface-0 px-sp-4 py-sp-2 font-mono text-body text-accent">
        {command}
      </code>
    </div>
  );
}
