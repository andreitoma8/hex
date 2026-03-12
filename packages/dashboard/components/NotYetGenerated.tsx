interface NotYetGeneratedProps {
  command: string;
}

export function NotYetGenerated({ command }: NotYetGeneratedProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-600 bg-gray-800/50 px-6 py-16 text-center">
      <svg
        className="mb-4 h-12 w-12 text-gray-500"
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
      <h3 className="mb-2 text-lg font-medium text-gray-300">
        Data not yet generated
      </h3>
      <p className="mb-4 text-sm text-gray-400">
        Run the following command to generate this data:
      </p>
      <code className="rounded bg-gray-900 px-4 py-2 font-mono text-sm text-green-400">
        {command}
      </code>
    </div>
  );
}
