export default function EmptyState() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "2rem",
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 560 }}>
        <p
          className="serif"
          style={{
            fontSize: "2rem",
            lineHeight: 1.25,
            fontStyle: "italic",
            color: "var(--gold-bright)",
            marginBottom: "1.5rem",
          }}
        >
          the mosaic is empty
        </p>
        <p
          style={{
            color: "var(--ink-muted)",
            lineHeight: 1.7,
            fontSize: "0.95rem",
          }}
        >
          Add entries to{" "}
          <code
            style={{
              background: "var(--bg-soft)",
              padding: "0.1rem 0.4rem",
              borderRadius: 4,
              color: "var(--ink)",
            }}
          >
            data/entries.csv
          </code>{" "}
          then run:
        </p>
        <pre
          style={{
            background: "var(--bg-soft)",
            padding: "1rem",
            borderRadius: 6,
            marginTop: "1rem",
            color: "var(--ink)",
            textAlign: "left",
            fontSize: "0.85rem",
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
          }}
        >
          {`npm run generate\nnpm run connect\nnpm run dev`}
        </pre>
        <p
          style={{
            color: "var(--ink-muted)",
            marginTop: "2rem",
            fontSize: "0.85rem",
            lineHeight: 1.7,
          }}
        >
          The Council of five voices will deliberate on each entry and produce
          one tile. Then the Weaver and Critic will build the gold threads
          between them.
        </p>
      </div>
    </main>
  );
}
